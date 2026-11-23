-- ==============================================================================
-- CircleUp Security Hardening Migration: Phase 1 Final Remediation
-- Migration: 20261210000000_phase1_security_remediation_final.sql
--
-- Purpose:
--   Resolves exactly the 7 Phase 1 security issues:
--   1. Historical refund settlement evidence & safe reconciliation state
--   2. Physical return idempotency with canonical fingerprinting and item tracking
--   3. Independent webhook entity identification and immutable event ledger
--   4. Payment records ledger, write-once captured amounts, order-level aggregates,
--      elimination of total_amount fallback, and dual refund ceiling
--   5. Universal global lock hierarchy (deterministic ordering across all paths)
--   6. Razorpay reservation safety with strict allowlist and reservation holds
--   7. Privileged RPC access restrictions (explicit REVOKE from public/anon/authenticated)
--
-- Assumptions:
--   - PostgreSQL 15+ in Supabase.
--   - Requires pgcrypto extension (gen_random_uuid).
--   - This migration is ADDITIVE, IDEMPOTENT, and NON-DESTRUCTIVE to existing data.
--   - ZERO migrations executed against production/shared databases; SQL is static-reviewed.
--
-- Rollback Note:
--   To safely roll back, execute the corresponding DROP/ALTER statements in reverse order:
--   - DROP TABLE IF EXISTS public.order_return_items;
--   - DROP TABLE IF EXISTS public.order_returns;
--   - DROP TABLE IF EXISTS public.payment_records;
--   - Revert refunds and order_items constraints.
-- ==============================================================================

-- ==============================================================================
-- UNIVERSAL DATABASE LOCK HIERARCHY DOCUMENTATION
-- ==============================================================================
-- To prevent cyclic deadlocks (SQLSTATE 40P01) and race conditions, all database
-- transactions across the CircleUp platform must acquire explicit and implicit locks
-- in the exact universal order defined below.
--
-- Universal Lock Sequence:
--   1. razorpay_webhook_events    (entrypoint claim for inbound webhooks)
--   2. checkout_idempotency_keys  (entrypoint claim for storefront checkouts)
--   3. orders                     (parent aggregate anchor; ORDER BY id ASC)
--   4. payment_records            (individual captured payments; ORDER BY id ASC)
--   5. refunds                    (monetary refund operations; ORDER BY id ASC)
--   6. order_items                (purchased line items; ORDER BY id ASC)
--   7. products                   (physical catalog stock; ORDER BY id ASC)
--   8. order_returns              (physical return inspections; ORDER BY id ASC)
--   9. order_return_items         (inspected return line items; ORDER BY id ASC)
--
-- Justification:
--   - Entrypoint idempotency records (1, 2) must be claimed before the referenced business
--     entities are even known.
--   - Orders (3) acts as the root boundary for all payment, refund, and return operations.
--     Locking orders FIRST serializes all concurrent actions targeting the same customer order.
--   - Payment records (4) and refunds (5) are children of orders and must be locked in ID order
--     to compute the cumulative captured amount and active refund ceiling safely.
--   - Order items (6) and products (7) govern physical inventory. Both must be sorted in
--     ascending UUID order to eliminate cross-item and cross-product deadlocks during
--     concurrent multi-item checkouts and return inspections.
--   - Physical return inspection records (8, 9) are terminal audit ledgers.
--
-- Implicit Foreign Key Locks:
--   - All foreign keys on refunds, payment_records, and return tables use ON DELETE RESTRICT
--     (no cascading deletes). INSERTs take FOR KEY SHARE locks on parent rows in orders,
--     which is fully compatible with our hierarchy since the parent order is locked first.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ORDERS TABLE ENHANCEMENTS: CAPTURED AMOUNTS & RESTRICTIONS
-- ------------------------------------------------------------------------------
alter table public.orders
  add column if not exists amount_paid_paise bigint not null default 0
    check (amount_paid_paise >= 0);

alter table public.orders
  add column if not exists is_payment_unresolved boolean not null default false,
  add column if not exists is_reservation_held boolean not null default false,
  add column if not exists reservation_held_reason text default null;

create index if not exists idx_orders_reservation_held
  on public.orders(is_reservation_held)
  where is_reservation_held is true;

create unique index if not exists uq_orders_razorpay_payment_id
  on public.orders(razorpay_payment_id)
  where razorpay_payment_id is not null;

-- ------------------------------------------------------------------------------
-- 2. PAYMENT RECORDS LEDGER (ISSUE 4A: INDIVIDUAL PAYMENT CAPTURE EVIDENCE)
-- ------------------------------------------------------------------------------
create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id text not null,
  gateway_order_id text,
  payment_method text not null,
  amount_paise bigint not null check (amount_paise >= 0),
  currency text not null default 'INR',
  status text not null check (status in ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED')),
  evidence_class text not null default 'GATEWAY_VERIFIED' check (evidence_class in ('GATEWAY_VERIFIED', 'ADMIN_ATTESTED', 'HISTORICAL_MIGRATED')),
  captured_at timestamptz,
  verified_at timestamptz,
  evidence jsonb,
  is_unresolved boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.payment_records
  add column if not exists evidence_class text not null default 'GATEWAY_VERIFIED'
    check (evidence_class in ('GATEWAY_VERIFIED', 'ADMIN_ATTESTED', 'HISTORICAL_MIGRATED'));

create unique index if not exists uq_payment_records_payment_id
  on public.payment_records(payment_id);

create index if not exists idx_payment_records_order_id
  on public.payment_records(order_id);

alter table public.payment_records enable row level security;
revoke all on public.payment_records from public, anon, authenticated;
grant select on public.payment_records to service_role;

-- ------------------------------------------------------------------------------
-- 2B. PAYMENT RECORDS IMMUTABILITY TRIGGER (ISSUE 3: WRITE-ONCE INTEGRITY)
-- ------------------------------------------------------------------------------
create or replace function public.fn_enforce_payment_records_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Block DELETE unconditionally
  if tg_op = 'DELETE' then
    raise exception '%', jsonb_build_object(
      'code', 'PAYMENT_RECORD_DELETE_FORBIDDEN',
      'message', 'Payment records are immutable audit records and cannot be deleted.'
    )::text using errcode = '22023';
  end if;

  -- Block mutation on immutable identity fields
  if tg_op = 'UPDATE' then
    if old.id <> new.id
       or old.payment_id <> new.payment_id
       or old.order_id <> new.order_id
       or old.currency <> new.currency
       or old.payment_method <> new.payment_method
       or (old.evidence_class is not null and new.evidence_class is distinct from old.evidence_class)
       or (old.captured_at is not null and new.captured_at is distinct from old.captured_at) then
      raise exception '%', jsonb_build_object(
        'code', 'PAYMENT_RECORD_MUTATION_FORBIDDEN',
        'message', 'Immutable fields (id, payment_id, order_id, currency, payment_method, evidence_class, captured_at) cannot be modified.'
      )::text using errcode = '22023';
    end if;

    -- Block status regression from terminal states
    if old.status in ('CAPTURED', 'REFUNDED') and new.status not in ('CAPTURED', 'REFUNDED') then
      raise exception '%', jsonb_build_object(
        'code', 'PAYMENT_RECORD_STATUS_REGRESSION_FORBIDDEN',
        'message', format('Payment record status cannot regress from %s to %s.', old.status, new.status)
      )::text using errcode = '22023';
    end if;

    -- Block alteration or regression of amount_paise once status is CAPTURED or amount_paise > 0
    if (old.status = 'CAPTURED' or old.amount_paise > 0) and (new.amount_paise <> old.amount_paise) then
      raise exception '%', jsonb_build_object(
        'code', 'PAYMENT_RECORD_AMOUNT_IMMUTABLE',
        'message', 'Payment record captured amount is immutable and cannot be altered or regressed.'
      )::text using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payment_records_immutable on public.payment_records;
create trigger trg_payment_records_immutable
  before update or delete on public.payment_records
  for each row
  execute function public.fn_enforce_payment_records_immutable();

create or replace function public.fn_enforce_payment_records_no_truncate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception '%', jsonb_build_object(
    'code', 'PAYMENT_RECORD_TRUNCATE_FORBIDDEN',
    'message', 'Payment records ledger cannot be truncated.'
  )::text using errcode = '22023';
end;
$$;

drop trigger if exists trg_payment_records_no_truncate on public.payment_records;
create trigger trg_payment_records_no_truncate
  before truncate on public.payment_records
  for each statement
  execute function public.fn_enforce_payment_records_no_truncate();

-- ------------------------------------------------------------------------------
-- 3. REFUNDS SCHEMA ENHANCEMENTS (ISSUES 1 & 4B: SETTLEMENT EVIDENCE & CEILING)
-- ------------------------------------------------------------------------------
alter table public.refunds
  add column if not exists payment_record_id uuid references public.payment_records(id) on delete restrict,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_refund_id text,
  add column if not exists idempotency_key text,
  add column if not exists provider_status text,
  add column if not exists error_message text,
  add column if not exists settlement_evidence jsonb,
  add column if not exists is_unresolved boolean not null default false,
  add column if not exists retry_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

alter table public.refunds drop constraint if exists refunds_status_check;
alter table public.refunds add constraint refunds_status_check
  check (status in ('REQUESTED', 'PENDING', 'APPROVED', 'PROCESSED', 'FAILED', 'REJECTED')) not valid;
alter table public.refunds validate constraint refunds_status_check;

alter table public.refunds drop constraint if exists chk_refunds_processed_requires_evidence;
alter table public.refunds add constraint chk_refunds_processed_requires_evidence
  check (
    status <> 'PROCESSED'
    or settlement_evidence is not null
    or razorpay_refund_id is not null
  ) not valid;
alter table public.refunds validate constraint chk_refunds_processed_requires_evidence;

-- Non-cascading durability for financial audit logs
alter table public.refunds drop constraint if exists refunds_order_id_fkey;
alter table public.refunds
  add constraint refunds_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete restrict;

create unique index if not exists uq_refunds_razorpay_refund_id
  on public.refunds (razorpay_refund_id)
  where razorpay_refund_id is not null;

create unique index if not exists uq_refunds_idempotency_key
  on public.refunds (idempotency_key)
  where idempotency_key is not null;

-- ------------------------------------------------------------------------------
-- 4. ORDER ITEMS ENHANCEMENTS (ISSUE 2 & 3: RETURNED VS RESTOCKED QUANTITY)
-- ------------------------------------------------------------------------------
alter table public.order_items
  add column if not exists returned_quantity integer not null default 0,
  add column if not exists restocked_quantity integer not null default 0;

alter table public.order_items drop constraint if exists chk_order_items_return_quantities;
alter table public.order_items add constraint chk_order_items_return_quantities
  check (restocked_quantity >= 0 and restocked_quantity <= returned_quantity and returned_quantity <= quantity);

-- ------------------------------------------------------------------------------
-- 5. PHYSICAL RETURN INSPECTION LEDGERS (ISSUE 2: DURABLE RETURN WORKFLOW)
-- ------------------------------------------------------------------------------
create table if not exists public.order_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  tracking_number text,
  inspection_status text not null check (inspection_status in ('PASSED', 'FAILED')),
  inspector_id text not null,
  inspector_email text not null,
  inspection_notes text,
  idempotency_key text not null,
  fingerprint text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists uq_order_returns_idempotency_key
  on public.order_returns(idempotency_key);

create index if not exists idx_order_returns_order_id
  on public.order_returns(order_id);

alter table public.order_returns enable row level security;
revoke all on public.order_returns from public, anon, authenticated;
grant select on public.order_returns to service_role;

create table if not exists public.order_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.order_returns(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  routing_action text not null check (routing_action in ('RESTOCK', 'DRY_CLEAN', 'ALTERATION', 'DISCARD')),
  stock_restored boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_order_return_items_return_id on public.order_return_items(return_id);
create index if not exists idx_order_return_items_order_item_id on public.order_return_items(order_item_id);

alter table public.order_return_items enable row level security;
revoke all on public.order_return_items from public, anon, authenticated;
grant select on public.order_return_items to service_role;

-- ------------------------------------------------------------------------------
-- 6. WEBHOOK EVENT LEDGER (ISSUE 3: IMMUTABLE IDENTITY & EVENT DEDUPLICATION)
-- ------------------------------------------------------------------------------
create table if not exists public.razorpay_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  order_number text,
  payment_id text,
  razorpay_refund_id text,
  status text not null default 'PROCESSING' check (status in ('PROCESSING', 'PROCESSED', 'FAILED', 'UNMATCHED_ANOMALY')),
  fencing_token text,
  lease_expires_at timestamptz,
  error_message text,
  payload jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_razorpay_webhook_events_order_number
  on public.razorpay_webhook_events(order_number);

alter table public.razorpay_webhook_events enable row level security;
revoke all on public.razorpay_webhook_events from public, anon, authenticated;
grant all on public.razorpay_webhook_events to service_role;

-- ------------------------------------------------------------------------------
-- 7. HISTORICAL DATA RECONCILIATION BACKFILL (ISSUES 1 & 4A)
-- ------------------------------------------------------------------------------
do $$
declare
  v_approved_count integer;
  v_order_rec record;
begin
  -- 7.1 Historical refund reconciliation: Never automatically mark PROCESSED without verified evidence
  select count(*) into v_approved_count from public.refunds where status = 'APPROVED';
  if v_approved_count > 0 then
    -- Offline manual refunds with verifiable recorded settlement: marked PROCESSED
    update public.refunds r
    set status = 'PROCESSED',
        provider_status = 'HISTORICAL_MANUAL',
        settlement_evidence = jsonb_build_object(
          'type', 'HISTORICAL_MANUAL_APPROVED',
          'settled_amount_paise', r.amount_paise,
          'approved_by', r.approved_by,
          'migrated_at', timezone('utc'::text, now())
        ),
        updated_at = timezone('utc'::text, now())
    from public.orders o
    where r.order_id = o.id
      and r.status = 'APPROVED'
      and r.settlement_evidence is not null
      and upper(coalesce(o.payment_method, '')) in ('WHATSAPP_UPI', 'WHATSAPP_BANK_TRANSFER')
      and o.razorpay_payment_id is null;

    -- Offline manual refunds WITHOUT recorded evidence: keep in APPROVED, flag as unresolved
    update public.refunds r
    set is_unresolved = true,
        provider_status = 'REQUIRES_RECONCILIATION',
        updated_at = timezone('utc'::text, now())
    from public.orders o
    where r.order_id = o.id
      and r.status = 'APPROVED'
      and r.settlement_evidence is null
      and upper(coalesce(o.payment_method, '')) in ('WHATSAPP_UPI', 'WHATSAPP_BANK_TRANSFER')
      and o.razorpay_payment_id is null;

    -- Online gateway refunds: Must NEVER be converted to PROCESSED without provider evidence.
    -- Move to PENDING and flag for reconciliation
    update public.refunds r
    set status = 'PENDING',
        is_unresolved = true,
        provider_status = 'REQUIRES_RECONCILIATION',
        updated_at = timezone('utc'::text, now())
    from public.orders o
    where r.order_id = o.id
      and r.status = 'APPROVED'
      and (o.razorpay_payment_id is not null or upper(coalesce(o.payment_method, '')) in ('RAZORPAY', 'ONLINE_UPI'));
  end if;

  -- 7.2 Historical payment records backfill: Do not infer or default to total_amount
  for v_order_rec in (
    select id, order_number, payment_method, razorpay_order_id, razorpay_payment_id, payment_status, total_amount
    from public.orders
    where razorpay_payment_id is not null and payment_status = 'PAID'
  ) loop
    insert into public.payment_records (
      order_id, payment_id, gateway_order_id, payment_method, amount_paise, status, is_unresolved
    ) values (
      v_order_rec.id, v_order_rec.razorpay_payment_id, v_order_rec.razorpay_order_id,
      coalesce(v_order_rec.payment_method, 'RAZORPAY'), 0, 'CAPTURED', true
    ) on conflict (payment_id) do nothing;

    -- Order amount_paid_paise remains 0 until verified evidence confirms amount
    update public.orders
    set is_payment_unresolved = true
    where id = v_order_rec.id and amount_paid_paise = 0;
  end loop;
end $$;

-- ------------------------------------------------------------------------------
-- 8. HARDENED STOREFRONT VERIFY RAZORPAY PAYMENT (ISSUES 3, 4A, 5, 7)
-- ------------------------------------------------------------------------------
create or replace function public.storefront_verify_razorpay_payment(
  p_order_number text,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_razorpay_signature text,
  p_verified_amount_paise bigint,
  p_webhook_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
  v_existing_event public.razorpay_webhook_events%rowtype;
  v_payment_rec public.payment_records%rowtype;
begin
  -- Prevent hanging transactions
  set local lock_timeout = '5s';

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Payment verification is restricted to internal service calls.')::text using errcode = '42501';
  end if;

  if p_order_number is null or length(trim(p_order_number)) = 0 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'A valid order number is required.')::text using errcode = '22023';
  end if;

  if p_verified_amount_paise is null or p_verified_amount_paise <= 0 then
    raise exception '%', jsonb_build_object('code', 'PAYMENT_AMOUNT_VERIFICATION_REQUIRED', 'message', 'Payment verification mandates server-verified captured amount in paise. NULL or non-positive amounts are rejected.')::text using errcode = '22023';
  end if;

  -- UNIVERSAL LOCK ORDER: 1) If webhook event ID is provided, lock/claim it FIRST
  if p_webhook_event_id is not null then
    select * into v_existing_event
    from public.razorpay_webhook_events
    where event_id = p_webhook_event_id
    for update;

    if found then
      if (v_existing_event.order_number is not null and v_existing_event.order_number <> upper(trim(p_order_number)))
         or (v_existing_event.payment_id is not null and v_existing_event.payment_id <> p_razorpay_payment_id)
         or (v_existing_event.event_type not in ('payment.captured', 'order.paid')) then
        raise exception '%', jsonb_build_object('code', 'WEBHOOK_EVENT_IDENTITY_MISMATCH', 'message', 'Webhook event identity attributes differ from original claim.')::text using errcode = '22023';
      end if;
    end if;
  end if;

  -- UNIVERSAL LOCK ORDER: 2) Lock orders SECOND
  select * into v_order
  from public.orders
  where order_number = upper(trim(p_order_number))
  for update;

  if not found then
    raise exception '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order was not found.')::text using errcode = 'P0002';
  end if;

  -- TASK 6E: Late capture after cancellation - record payment anomaly, do NOT mark paid, do NOT touch stock
  if v_order.status in ('CANCELLED', 'RETURNED', 'REFUNDED') then
    insert into public.payment_records (
      order_id, payment_id, gateway_order_id, payment_method, amount_paise,
      currency, status, evidence_class, captured_at, verified_at, evidence, is_unresolved
    ) values (
      v_order.id, p_razorpay_payment_id, p_razorpay_order_id, 'RAZORPAY',
      p_verified_amount_paise, 'INR', 'CAPTURED', 'GATEWAY_VERIFIED',
      timezone('utc'::text, now()), timezone('utc'::text, now()),
      jsonb_build_object('lateCapture', true, 'signature', p_razorpay_signature, 'previousOrderStatus', v_order.status),
      true
    ) on conflict (payment_id) do nothing;

    update public.orders
    set is_payment_unresolved = true,
        is_reservation_held = true,
        reservation_held_reason = 'LATE_CAPTURE_ON_CANCELLED_ORDER',
        updated_at = timezone('utc'::text, now())
    where id = v_order.id;

    raise exception '%', jsonb_build_object(
      'code', 'LATE_PAYMENT_ON_CANCELLED_ORDER',
      'message', 'Payment was captured but order was previously cancelled. Payment recorded as unresolved anomaly for refunding without modifying stock.'
    )::text using errcode = 'P0001';
  end if;

  -- Cross-order payment ID reuse check
  if exists (
    select 1 from public.orders
    where razorpay_payment_id = p_razorpay_payment_id and id <> v_order.id
  ) or exists (
    select 1 from public.payment_records
    where payment_id = p_razorpay_payment_id and order_id <> v_order.id
  ) then
    raise exception '%', jsonb_build_object('code', 'DUPLICATE_PAYMENT_ID', 'message', 'This payment ID has already been applied to another order.')::text using errcode = '23505';
  end if;

  -- Provider Order ID check
  if v_order.razorpay_order_id is not null and v_order.razorpay_order_id <> p_razorpay_order_id then
    raise exception '%', jsonb_build_object('code', 'RAZORPAY_ORDER_ID_MISMATCH', 'message', 'Provider order ID does not match bound reference.')::text using errcode = '22023';
  end if;

  -- Amount integrity check: captured amount must match internal total_amount exactly
  if v_order.total_amount <> p_verified_amount_paise then
    raise exception '%', jsonb_build_object('code', 'PAYMENT_AMOUNT_MISMATCH', 'message', format('Verified amount (%s paise) does not match internal order total (%s paise).', p_verified_amount_paise, v_order.total_amount))::text using errcode = '22023';
  end if;

  -- UNIVERSAL LOCK ORDER: 3) Lock/claim payment_records THIRD
  select * into v_payment_rec
  from public.payment_records
  where payment_id = p_razorpay_payment_id
  for update;

  if not found then
    insert into public.payment_records (
      order_id, payment_id, gateway_order_id, payment_method, amount_paise,
      currency, status, captured_at, verified_at, evidence, is_unresolved
    ) values (
      v_order.id, p_razorpay_payment_id, p_razorpay_order_id, 'RAZORPAY',
      p_verified_amount_paise, 'INR', 'CAPTURED', timezone('utc'::text, now()),
      timezone('utc'::text, now()), jsonb_build_object('verifiedAmountPaise', p_verified_amount_paise, 'signature', p_razorpay_signature),
      false
    )
    returning * into v_payment_rec;
  else
    -- Write-once verification: Do not silently overwrite existing captured amount
    if v_payment_rec.amount_paise <> p_verified_amount_paise and v_payment_rec.amount_paise > 0 then
      raise exception '%', jsonb_build_object('code', 'PAYMENT_RECORD_MUTATION_FORBIDDEN', 'message', 'Existing payment record amount cannot be overwritten.')::text using errcode = '22023';
    end if;

    update public.payment_records
    set status = 'CAPTURED',
        amount_paise = p_verified_amount_paise,
        verified_at = timezone('utc'::text, now()),
        is_unresolved = false,
        updated_at = timezone('utc'::text, now())
    where id = v_payment_rec.id;
  end if;

  -- 4) Transition order to PAID and populate amount_paid_paise
  update public.orders
  set payment_status = 'PAID',
      status = case when status = 'PENDING' then 'CONFIRMED' else status end,
      payment_id = p_razorpay_payment_id,
      razorpay_order_id = p_razorpay_order_id,
      razorpay_payment_id = p_razorpay_payment_id,
      razorpay_signature = p_razorpay_signature,
      amount_paid_paise = p_verified_amount_paise,
      is_payment_unresolved = false,
      updated_at = timezone('utc'::text, now())
  where id = v_order.id
  returning * into v_order;

  -- 5) Finalize webhook event (already locked at step 1)
  if p_webhook_event_id is not null then
    if v_existing_event.id is not null then
      update public.razorpay_webhook_events
      set status = 'PROCESSED',
          order_number = v_order.order_number,
          payment_id = p_razorpay_payment_id,
          processed_at = timezone('utc'::text, now()),
          error_message = null
      where id = v_existing_event.id;
    else
      insert into public.razorpay_webhook_events (
        event_id, event_type, order_number, payment_id, status, processed_at
      ) values (
        p_webhook_event_id, 'payment.captured', v_order.order_number, p_razorpay_payment_id, 'PROCESSED', timezone('utc'::text, now())
      );
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id, 'productId', oi.product_id, 'serialNumber', oi.serial_number,
        'name', oi.name, 'price', oi.price, 'quantity', oi.quantity,
        'size', oi.size, 'image', oi.image_url
      ) order by oi.id asc
    ), '[]'::jsonb
  ) into v_items
  from public.order_items as oi
  where oi.order_id = v_order.id;

  return jsonb_build_object('order', to_jsonb(v_order), 'items', v_items);
end;
$$;

-- ------------------------------------------------------------------------------
-- 9. HARDENED ADMIN PROCESS ORDER REFUND (ISSUES 1, 4B, 5, 7)
-- ------------------------------------------------------------------------------
create or replace function public.admin_process_order_refund(
  p_order_ref text,
  p_amount_paise bigint,
  p_reason text,
  p_idempotency_key text,
  p_actor_id text,
  p_actor_email text,
  p_actor_role text,
  p_settlement_reference text default null,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_existing_refund public.refunds%rowtype;
  v_refund public.refunds%rowtype;
  v_active_refunds bigint;
  v_captured_limit bigint;
  v_is_manual_order boolean;
  v_initial_status text;
  v_payment_rec public.payment_records%rowtype;
  v_settlement_json jsonb := null;
  v_derived_role text;
begin
  -- Prevent hanging transactions
  set local lock_timeout = '5s';

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Admin refund operation is not authorized.')::text using errcode = '42501';
  end if;
  if p_actor_id is null or length(trim(p_actor_id)) = 0 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Actor ID is required.')::text using errcode = '22023';
  end if;

  -- Authoritatively derive role from admin_users (TASK 4: Do NOT trust caller-supplied p_actor_role)
  select role into v_derived_role
  from public.admin_users
  where id::text = trim(p_actor_id)
    and is_active = true;

  if v_derived_role is null or v_derived_role <> 'owner' then
    raise exception '%', jsonb_build_object(
      'code', 'FORBIDDEN',
      'message', 'Actor is not an active owner in the administrative system.'
    )::text using errcode = '42501';
  end if;

  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Refund amount must be greater than zero.')::text using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 10 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'A valid idempotency key (>= 10 chars) is required.')::text using errcode = '22023';
  end if;

  -- UNIVERSAL LOCK ORDER: 1) Lock orders FIRST
  select o.* into v_order
  from public.orders as o
  where o.order_number = upper(trim(p_order_ref)) or o.id::text = trim(p_order_ref)
  for update;

  if not found then
    raise exception '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order was not found.')::text using errcode = 'P0002';
  end if;

  -- UNIVERSAL LOCK ORDER: 2) Lock payment_records in ascending ID order
  perform 1
  from public.payment_records
  where order_id = v_order.id
  order by id asc
  for update;

  -- UNIVERSAL LOCK ORDER: 3) Lock existing refunds in ascending ID order
  perform 1
  from public.refunds
  where order_id = v_order.id
  order by id asc
  for update;

  -- Check operation idempotency: reuse existing record if duplicate request arrives
  select * into v_existing_refund
  from public.refunds
  where idempotency_key = trim(p_idempotency_key)
  for update;

  if found then
    if v_existing_refund.order_id <> v_order.id or v_existing_refund.amount_paise <> p_amount_paise then
      raise exception '%', jsonb_build_object('code', 'IDEMPOTENCY_KEY_COLLISION', 'message', 'Idempotency key was previously used with different parameters.')::text using errcode = '22023';
    end if;
    return jsonb_build_object('refund', to_jsonb(v_existing_refund), 'order', to_jsonb(v_order));
  end if;

  if v_order.payment_status not in ('PAID', 'PARTIALLY_REFUNDED') then
    raise exception '%', jsonb_build_object('code', 'ORDER_NOT_PAID', 'message', 'Cannot refund an unpaid order.')::text using errcode = 'P0001';
  end if;

  -- TASK 6C: Derive order-level captured ceiling strictly from distinct verified CAPTURED payment_records
  select coalesce(sum(amount_paise), 0)
  into v_captured_limit
  from (
    select distinct on (payment_id) amount_paise
    from public.payment_records
    where order_id = v_order.id
      and status = 'CAPTURED'
      and currency = 'INR'
      and is_unresolved = false
    order by payment_id, created_at desc
  ) as distinct_captured_payments;

  if v_captured_limit is null or v_captured_limit <= 0 then
    raise exception '%', jsonb_build_object(
      'code', 'ORDER_CAPTURED_AMOUNT_UNAVAILABLE',
      'message', 'Cannot process refund: No verified captured payment record is recorded for this order.'
    )::text using errcode = '22023';
  end if;

  -- Enforce cumulative fail-closed default-deny ceiling:
  -- Every refund counts against the ceiling UNLESS it is definitively FAILED or REJECTED
  -- with explicitly verified non-execution evidence from provider
  select coalesce(sum(r.amount_paise), 0)
  into v_active_refunds
  from public.refunds as r
  where r.order_id = v_order.id
    and not (
      r.status in ('FAILED', 'REJECTED')
      and coalesce((r.settlement_evidence->>'verified_non_execution')::boolean, false) = true
    );

  if (v_active_refunds + p_amount_paise) > v_captured_limit then
    raise exception '%', jsonb_build_object(
      'code', 'REFUND_EXCEEDS_CAPTURED_AMOUNT',
      'message', format('Cumulative refunds (%s paise) would exceed verified captured payment amount (%s paise).', v_active_refunds + p_amount_paise, v_captured_limit)
    )::text using errcode = '22023';
  end if;

  -- Find associated payment record (if any)
  select * into v_payment_rec
  from public.payment_records
  where order_id = v_order.id and status = 'CAPTURED'
  order by created_at desc
  limit 1;

  -- Enforce per-payment refund ceiling when payment record exists
  if v_payment_rec.id is not null then
    declare
      v_active_payment_refunds bigint;
    begin
      select coalesce(sum(r.amount_paise), 0)
      into v_active_payment_refunds
      from public.refunds as r
      where (r.payment_record_id = v_payment_rec.id or (r.razorpay_payment_id is not null and r.razorpay_payment_id = v_payment_rec.payment_id))
        and not (
          r.status in ('FAILED', 'REJECTED')
          and coalesce((r.settlement_evidence->>'verified_non_execution')::boolean, false) = true
        );

      if (v_active_payment_refunds + p_amount_paise) > v_payment_rec.amount_paise then
        raise exception '%', jsonb_build_object(
          'code', 'REFUND_EXCEEDS_PAYMENT_CAPTURED_AMOUNT',
          'message', format('Cumulative refunds on payment %s (%s paise) would exceed payment captured amount (%s paise).', v_payment_rec.payment_id, v_active_payment_refunds + p_amount_paise, v_payment_rec.amount_paise)
        )::text using errcode = '22023';
      end if;
    end;
  end if;

  v_is_manual_order := (v_order.razorpay_payment_id is null and upper(coalesce(v_order.payment_method, '')) in ('WHATSAPP_UPI', 'WHATSAPP_BANK_TRANSFER'));

  -- Settlement evidence check for manual refunds: must not mark PROCESSED without recorded settlement
  if v_is_manual_order then
    if p_settlement_reference is not null and length(trim(p_settlement_reference)) >= 4 then
      v_initial_status := 'PROCESSED';
      v_settlement_json := jsonb_build_object(
        'type', 'MANUAL_DISBURSED',
        'settlement_reference', trim(p_settlement_reference),
        'settled_amount_paise', p_amount_paise,
        'actor_id', p_actor_id,
        'actor_email', p_actor_email,
        'settled_at', timezone('utc'::text, now())
      );
    else
      -- Without verifiable settlement reference: remain in APPROVED awaiting settlement
      v_initial_status := 'APPROVED';
    end if;
  else
    v_initial_status := 'REQUESTED';
  end if;

  -- Insert monetary refund record (ZERO stock changes)
  insert into public.refunds (
    order_id, payment_record_id, amount_paise, reason, status, approved_by,
    razorpay_payment_id, idempotency_key, provider_status, settlement_evidence
  ) values (
    v_order.id, v_payment_rec.id, p_amount_paise, trim(coalesce(p_reason, 'Admin processed refund')),
    v_initial_status, p_actor_email,
    v_order.razorpay_payment_id, trim(p_idempotency_key),
    case when v_initial_status = 'PROCESSED' then 'MANUAL_OFFLINE_SETTLED'
         when v_initial_status = 'APPROVED' then 'AWAITING_MANUAL_SETTLEMENT'
         else 'PENDING_DISPATCH' end,
    v_settlement_json
  )
  returning * into v_refund;

  -- Audit log (TASK 4: record actor_role as derived from admin_users)
  insert into public.activity_audit_logs (
    actor_id, actor_email, actor_role, table_name, record_id, action,
    after_state, ip_address, user_agent
  ) values (
    p_actor_id, p_actor_email, v_derived_role, 'Refund', v_refund.id::text,
    'STATUS_CHANGE',
    jsonb_build_object(
      'orderNumber', v_order.order_number,
      'refundAmountPaise', p_amount_paise,
      'refundStatus', v_initial_status,
      'idempotencyKey', p_idempotency_key,
      'isManualOrder', v_is_manual_order
    ),
    coalesce(p_ip_address, '127.0.0.1'), left(coalesce(p_user_agent, 'CircleUp Admin'), 1024)
  );

  return jsonb_build_object('refund', to_jsonb(v_refund), 'order', to_jsonb(v_order));
end;
$$;

-- ------------------------------------------------------------------------------
-- 10. HARDENED STOREFRONT FINALIZE ORDER REFUND (ISSUES 1, 3, 4B, 5, 7)
-- ------------------------------------------------------------------------------
create or replace function public.storefront_finalize_order_refund(
  p_refund_id uuid,
  p_provider_status text,
  p_razorpay_refund_id text default null,
  p_error_message text default null,
  p_webhook_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.refunds%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
  v_target_status text;
  v_processed_total bigint;
  v_captured_limit bigint;
  v_existing_event public.razorpay_webhook_events%rowtype;
begin
  -- Prevent hanging transactions
  set local lock_timeout = '5s';

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Operation not authorized.')::text using errcode = '42501';
  end if;

  select order_id into v_order_id from public.refunds where id = p_refund_id;
  if not found then
    raise exception '%', jsonb_build_object('code', 'REFUND_NOT_FOUND', 'message', 'Refund record was not found.')::text using errcode = 'P0002';
  end if;

  -- UNIVERSAL LOCK ORDER: 1) If webhook event ID is provided, lock/claim it FIRST
  if p_webhook_event_id is not null then
    select * into v_existing_event
    from public.razorpay_webhook_events
    where event_id = p_webhook_event_id
    for update;

    if found then
      if v_existing_event.event_type <> 'refund.processed'
         or (p_razorpay_refund_id is not null and v_existing_event.razorpay_refund_id is not null and v_existing_event.razorpay_refund_id <> p_razorpay_refund_id)
         or (v_refund.razorpay_payment_id is not null and v_existing_event.payment_id is not null and v_existing_event.payment_id <> v_refund.razorpay_payment_id)
         or (v_existing_event.order_number is not null and v_existing_event.order_number <> v_order.order_number) then
        raise exception '%', jsonb_build_object('code', 'WEBHOOK_EVENT_IDENTITY_MISMATCH', 'message', 'Webhook event identity attributes differ.')::text using errcode = '22023';
      end if;
    end if;
  end if;

  -- UNIVERSAL LOCK ORDER: 2) Lock orders SECOND
  select * into v_order from public.orders where id = v_order_id for update;

  -- UNIVERSAL LOCK ORDER: 3) Lock child refund THIRD
  select * into v_refund from public.refunds where id = p_refund_id for update;

  if v_refund.status = 'PROCESSED' then
    return jsonb_build_object('refund', to_jsonb(v_refund), 'order', to_jsonb(v_order));
  end if;

  if v_refund.status = 'FAILED' then
    raise exception '%', jsonb_build_object('code', 'INVALID_REFUND_STATUS_TRANSITION', 'message', 'Cannot transition a definitively FAILED refund.')::text using errcode = '22023';
  end if;

  case upper(trim(p_provider_status))
    when 'PROCESSED' then v_target_status := 'PROCESSED';
    when 'PENDING' then v_target_status := 'PENDING';
    when 'FAILED' then v_target_status := 'FAILED';
    else
      raise exception '%', jsonb_build_object('code', 'INVALID_PROVIDER_STATUS', 'message', 'Invalid provider refund status provided.')::text using errcode = '22023';
  end case;

  -- Finalize webhook event (already locked at step 1): never overwrite non-null identity fields
  if p_webhook_event_id is not null then
    if v_existing_event.id is not null then
      update public.razorpay_webhook_events
      set status = 'PROCESSED',
          order_number = coalesce(v_existing_event.order_number, v_order.order_number),
          payment_id = coalesce(v_existing_event.payment_id, v_refund.razorpay_payment_id),
          razorpay_refund_id = coalesce(v_existing_event.razorpay_refund_id, p_razorpay_refund_id),
          processed_at = timezone('utc'::text, now()),
          error_message = null
      where id = v_existing_event.id;
    else
      insert into public.razorpay_webhook_events (
        event_id, event_type, order_number, payment_id, razorpay_refund_id, status, processed_at
      ) values (
        p_webhook_event_id, 'refund.processed', v_order.order_number, v_refund.razorpay_payment_id,
        p_razorpay_refund_id, 'PROCESSED', timezone('utc'::text, now())
      );
    end if;
  end if;

  update public.refunds
  set status = v_target_status,
      razorpay_refund_id = coalesce(p_razorpay_refund_id, razorpay_refund_id),
      provider_status = p_provider_status,
      error_message = p_error_message,
      updated_at = timezone('utc'::text, now())
  where id = v_refund.id
  returning * into v_refund;

  -- Mutate order payment_status strictly based on PROCESSED amounts
  v_captured_limit := v_order.amount_paid_paise;

  select coalesce(sum(r.amount_paise), 0)
  into v_processed_total
  from public.refunds as r
  where r.order_id = v_order.id and r.status = 'PROCESSED';

  if v_captured_limit > 0 and v_processed_total >= v_captured_limit then
    update public.orders
    set payment_status = 'REFUNDED',
        status = 'REFUNDED',
        updated_at = timezone('utc'::text, now())
    where id = v_order.id
    returning * into v_order;
  elsif v_processed_total > 0 then
    update public.orders
    set payment_status = 'PARTIALLY_REFUNDED',
        updated_at = timezone('utc'::text, now())
    where id = v_order.id
    returning * into v_order;
  end if;

  return jsonb_build_object('refund', to_jsonb(v_refund), 'order', to_jsonb(v_order));
end;
$$;

-- ------------------------------------------------------------------------------
-- 11. DEDICATED PHYSICAL RETURN INSPECTION RPC (ISSUES 2, 4B, 5, 7)
-- ------------------------------------------------------------------------------
create or replace function public.admin_record_physical_return_inspection(
  p_order_ref text,
  p_items jsonb, -- Mandatory: [{"orderItemId": "uuid", "quantity": 1, "routingAction": "RESTOCK"}]
  p_tracking_number text,
  p_inspection_status text,
  p_inspection_notes text,
  p_idempotency_key text,
  p_fingerprint text,
  p_actor_id text,
  p_actor_email text,
  p_actor_role text,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_existing_return public.order_returns%rowtype;
  v_return public.order_returns%rowtype;
  v_elem jsonb;
  v_order_item public.order_items%rowtype;
  v_product public.products%rowtype;
  v_qty integer;
  v_action text;
  v_returnable integer;
  v_restocked boolean;
  v_return_items jsonb;
  v_derived_role text;
begin
  -- Prevent hanging transactions
  set local lock_timeout = '5s';

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Operation not authorized.')::text using errcode = '42501';
  end if;
  if p_actor_id is null or length(trim(p_actor_id)) = 0 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Actor ID is required.')::text using errcode = '22023';
  end if;

  -- Authoritatively derive role from admin_users (TASK 4: Do NOT trust caller-supplied p_actor_role)
  select role into v_derived_role
  from public.admin_users
  where id::text = trim(p_actor_id)
    and is_active = true;

  if v_derived_role is null or v_derived_role not in ('admin', 'owner', 'staff') then
    raise exception '%', jsonb_build_object(
      'code', 'FORBIDDEN',
      'message', 'Only active curators or owners may record physical return inspections.'
    )::text using errcode = '42501';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 10 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'A valid return idempotency key (>= 10 chars) is required.')::text using errcode = '22023';
  end if;
  if p_fingerprint is null or length(trim(p_fingerprint)) < 10 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'A valid canonical request fingerprint is required.')::text using errcode = '22023';
  end if;

  -- FAIL-CLOSED VALIDATION 1: Inspection status must be strictly PASSED or FAILED
  if p_inspection_status is null or upper(trim(p_inspection_status)) not in ('PASSED', 'FAILED') then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Inspection status is required and must be strictly "PASSED" or "FAILED".')::text using errcode = '22023';
  end if;

  -- FAIL-CLOSED VALIDATION 2: Items cannot be null, empty, or duplicate
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '%', jsonb_build_object('code', 'EXPLICIT_ITEMS_REQUIRED', 'message', 'Explicit item IDs and return quantities are mandatory for return inspection.')::text using errcode = '22023';
  end if;

  if exists (
    select (elem ->> 'orderItemId')::uuid
    from jsonb_array_elements(p_items) as elem
    group by (elem ->> 'orderItemId')::uuid
    having count(*) > 1
  ) then
    raise exception '%', jsonb_build_object('code', 'DUPLICATE_RETURN_ITEM', 'message', 'The same order item cannot be listed multiple times in a single inspection payload.')::text using errcode = '22023';
  end if;

  -- FAIL-CLOSED VALIDATION 3: Routing actions must be strictly validated per item
  for v_elem in select * from jsonb_array_elements(p_items) loop
    v_action := upper(trim(coalesce(v_elem ->> 'routingAction', '')));
    if v_action not in ('RESTOCK', 'DRY_CLEAN', 'ALTERATION', 'DISCARD') then
      raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', format('Item %s routing action is required and must be strictly "RESTOCK", "DRY_CLEAN", "ALTERATION", or "DISCARD".', v_elem ->> 'orderItemId'))::text using errcode = '22023';
    end if;
  end loop;

  -- UNIVERSAL LOCK ORDER: 1) Lock orders FIRST
  select o.* into v_order
  from public.orders as o
  where o.order_number = upper(trim(p_order_ref)) or o.id::text = trim(p_order_ref)
  for update;

  if not found then
    raise exception '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order was not found.')::text using errcode = 'P0002';
  end if;

  -- Check operation idempotency by key
  select * into v_existing_return
  from public.order_returns
  where idempotency_key = trim(p_idempotency_key)
  for update;

  if found then
    if v_existing_return.fingerprint is null
       or length(trim(v_existing_return.fingerprint)) = 0
       or v_existing_return.fingerprint <> trim(p_fingerprint)
       or v_existing_return.order_id <> v_order.id then
      raise exception '%', jsonb_build_object(
        'code', 'IDEMPOTENCY_KEY_COLLISION',
        'message', 'Return idempotency key was previously submitted with a different request fingerprint or lacks a valid fingerprint.'
      )::text using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(to_jsonb(ri)), '[]'::jsonb) into v_return_items
    from public.order_return_items ri where ri.return_id = v_existing_return.id;

    return jsonb_build_object('return', to_jsonb(v_existing_return), 'items', v_return_items, 'order', to_jsonb(v_order));
  end if;

  -- UNIVERSAL LOCK ORDER: 2) Lock all affected order_items in ascending UUID order
  perform 1
  from public.order_items
  where id in (
    select distinct (elem ->> 'orderItemId')::uuid
    from jsonb_array_elements(p_items) as elem
  )
  order by id asc
  for update;

  -- UNIVERSAL LOCK ORDER: 3) Lock all affected products in ascending UUID order
  perform 1
  from public.products
  where id in (
    select distinct oi.product_id
    from public.order_items oi
    where oi.id in (
      select distinct (elem ->> 'orderItemId')::uuid
      from jsonb_array_elements(p_items) as elem
    )
  )
  order by id asc
  for update;

  -- Insert return master record
  insert into public.order_returns (
    order_id, tracking_number, inspection_status, inspector_id, inspector_email,
    inspection_notes, idempotency_key, fingerprint
  ) values (
    v_order.id, trim(p_tracking_number), upper(trim(p_inspection_status)),
    p_actor_id, p_actor_email, trim(p_inspection_notes), trim(p_idempotency_key), trim(p_fingerprint)
  )
  returning * into v_return;

  -- Process line items
  for v_elem in select * from jsonb_array_elements(p_items) order by (value ->> 'orderItemId') asc loop
    select * into v_order_item
    from public.order_items
    where id = (v_elem ->> 'orderItemId')::uuid and order_id = v_order.id;

    if not found then
      raise exception '%', jsonb_build_object('code', 'ORDER_ITEM_NOT_FOUND', 'message', 'Specified item does not belong to this order.')::text using errcode = '22023';
    end if;

    v_qty := coalesce((v_elem ->> 'quantity')::integer, 0);
    if v_qty <= 0 then
      raise exception '%', jsonb_build_object('code', 'INVALID_RETURN_QUANTITY', 'message', 'Returned quantity must be greater than zero.')::text using errcode = '22023';
    end if;

    v_action := upper(trim(v_elem ->> 'routingAction'));
    v_returnable := v_order_item.quantity - v_order_item.returned_quantity;

    if v_qty > v_returnable then
      raise exception '%', jsonb_build_object(
        'code', 'RETURN_QUANTITY_EXCEEDS_PURCHASED',
        'message', format('Cannot return %s units for item %s; only %s unreturned units remain.', v_qty, v_order_item.id, v_returnable)
      )::text using errcode = '22023';
    end if;

    -- Cumulative returned quantity consumed regardless of action
    update public.order_items
    set returned_quantity = returned_quantity + v_qty
    where id = v_order_item.id;

    v_restocked := false;
    if v_action = 'RESTOCK' and upper(trim(p_inspection_status)) = 'PASSED' then
      update public.products
      set stock = stock + v_qty,
          status = case when status = 'SOLD_OUT' then 'ACTIVE' else status end,
          updated_at = timezone('utc'::text, now())
      where id = v_order_item.product_id;

      update public.order_items
      set restocked_quantity = restocked_quantity + v_qty
      where id = v_order_item.id;

      v_restocked := true;
    end if;

    insert into public.order_return_items (
      return_id, order_item_id, product_id, quantity, routing_action, stock_restored
    ) values (
      v_return.id, v_order_item.id, v_order_item.product_id, v_qty, v_action, v_restocked
    );
  end loop;

  select coalesce(jsonb_agg(to_jsonb(ri)), '[]'::jsonb) into v_return_items
  from public.order_return_items ri where ri.return_id = v_return.id;

  return jsonb_build_object('return', to_jsonb(v_return), 'items', v_return_items, 'order', to_jsonb(v_order));
end;
$$;

-- ------------------------------------------------------------------------------
-- 12. HARDENED ADMIN VERIFY ORDER PAYMENT (OFFLINE CAPTURE ENFORCEMENT)
-- ------------------------------------------------------------------------------
create or replace function public.admin_verify_order_payment(
  p_order_ref text,
  p_utr_number text,
  p_payment_proof_url text,
  p_confirmed_amount_paise bigint,
  p_actor_id text,
  p_actor_email text,
  p_actor_role text,
  p_ip_address text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment_rec public.payment_records%rowtype;
  v_ref text;
  v_derived_role text;
begin
  -- Prevent hanging transactions
  set local lock_timeout = '5s';

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Admin order operation is not authorized.')::text using errcode = '42501';
  end if;
  if p_actor_id is null or length(trim(p_actor_id)) = 0 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Actor ID is required.')::text using errcode = '22023';
  end if;

  -- Authoritatively derive role from admin_users (TASK 4: Do NOT trust caller-supplied p_actor_role)
  select role into v_derived_role
  from public.admin_users
  where id::text = trim(p_actor_id)
    and is_active = true;

  if v_derived_role is null or v_derived_role <> 'owner' then
    raise exception '%', jsonb_build_object(
      'code', 'FORBIDDEN',
      'message', 'Actor is not an active owner in the administrative system.'
    )::text using errcode = '42501';
  end if;

  if p_confirmed_amount_paise is null or p_confirmed_amount_paise <= 0 then
    raise exception '%', jsonb_build_object('code', 'VALIDATION_ERROR', 'message', 'Explicit confirmed amount in paise is mandatory.')::text using errcode = '22023';
  end if;

  -- UNIVERSAL LOCK ORDER: 1) Lock orders FIRST
  select * into v_order
  from public.orders
  where order_number = upper(trim(p_order_ref)) or id::text = trim(p_order_ref)
  for update;

  if not found then
    raise exception '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order was not found.')::text using errcode = 'P0002';
  end if;

  if upper(coalesce(v_order.payment_method, '')) not in ('WHATSAPP_UPI', 'WHATSAPP_BANK_TRANSFER') then
    raise exception '%', jsonb_build_object('code', 'INVALID_MANUAL_PAYMENT_METHOD', 'message', 'Only manual offline methods can be manually marked paid.')::text using errcode = 'P0001';
  end if;

  if v_order.status not in ('CONFIRMED', 'SHIPPED', 'DELIVERED', 'PENDING') then
    raise exception '%', jsonb_build_object('code', 'INVALID_PAYMENT_ORDER_STATE', 'message', 'Payment cannot be recorded for this order state.')::text using errcode = 'P0001';
  end if;

  v_ref := coalesce(nullif(trim(p_utr_number), ''), 'MANUAL_' || v_order.order_number);

  -- UNIVERSAL LOCK ORDER: 2) Lock / check payment_records SECOND (Write-Once Immutability)
  select * into v_payment_rec
  from public.payment_records
  where payment_id = v_ref
  for update;

  if not found then
    insert into public.payment_records (
      order_id, payment_id, payment_method, amount_paise, currency, status,
      evidence_class, captured_at, verified_at, evidence, is_unresolved
    ) values (
      v_order.id, v_ref, v_order.payment_method, p_confirmed_amount_paise, 'INR', 'CAPTURED',
      'ADMIN_ATTESTED', timezone('utc'::text, now()), timezone('utc'::text, now()),
      jsonb_build_object('utr', p_utr_number, 'proof', p_payment_proof_url, 'actor', p_actor_email, 'actor_role', v_derived_role, 'class', 'ADMIN_ATTESTED'),
      false
    )
    returning * into v_payment_rec;
  else
    -- Immutability check: Reject conflicting modifications to existing captured payment record
    if v_payment_rec.order_id <> v_order.id or v_payment_rec.amount_paise <> p_confirmed_amount_paise then
      raise exception '%', jsonb_build_object(
        'code', 'PAYMENT_RECORD_MUTATION_FORBIDDEN',
        'message', 'Existing payment record cannot be overwritten or altered with conflicting parameters.'
      )::text using errcode = '22023';
    end if;
  end if;

  update public.orders
  set payment_status = 'PAID',
      status = case when status = 'PENDING' then 'CONFIRMED' else status end,
      utr_number = coalesce(nullif(trim(p_utr_number), ''), utr_number),
      payment_proof_url = coalesce(nullif(trim(p_payment_proof_url), ''), payment_proof_url),
      amount_paid_paise = p_confirmed_amount_paise,
      is_payment_unresolved = false,
      updated_at = timezone('utc'::text, now())
  where id = v_order.id
  returning * into v_order;

  return jsonb_build_object('order', to_jsonb(v_order));
end;
$$;

-- ------------------------------------------------------------------------------
-- 13. HARDENED ADMIN RELEASE EXPIRED RESERVATIONS (ISSUE 6 & 9)
-- ------------------------------------------------------------------------------
create or replace function public.admin_release_expired_reservations(
  p_expiry_hours integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz;
  v_order record;
  v_item record;
  v_released_orders integer := 0;
  v_restored_products integer := 0;
begin
  -- Prevent hanging transactions
  set local lock_timeout = '5s';

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Unauthorized reservation cleanup.')::text using errcode = '42501';
  end if;

  v_cutoff := timezone('utc'::text, now()) - (coalesce(p_expiry_hours, 24) || ' hours')::interval;

  -- STRICT DEFAULT-DENY ALLOWLIST: Only manual non-gateway orders qualify!
  for v_order in
    select id, order_number
    from public.orders
    where status = 'PENDING'
      and payment_status = 'PENDING'
      and created_at < v_cutoff
      and razorpay_order_id is null
      and upper(coalesce(payment_method, '')) in ('WHATSAPP_UPI', 'WHATSAPP_BANK_TRANSFER')
    order by id asc
    for update skip locked
  loop
    -- UNIVERSAL LOCK ORDER: Lock items then products in UUID order
    for v_item in
      select oi.product_id, oi.quantity
      from public.order_items oi
      where oi.order_id = v_order.id
      order by oi.product_id asc
    loop
      update public.products
      set stock = stock + v_item.quantity,
          status = case when status = 'SOLD_OUT' then 'ACTIVE' else status end,
          updated_at = timezone('utc'::text, now())
      where id = v_item.product_id;

      v_restored_products := v_restored_products + v_item.quantity;
    end loop;

    update public.orders
    set status = 'CANCELLED',
        notes = coalesce(notes || ' | ', '') || '[EXPIRED_UNPAID_MANUAL_RESERVATION]',
        updated_at = timezone('utc'::text, now())
    where id = v_order.id;

    v_released_orders := v_released_orders + 1;
  end loop;

  return jsonb_build_object(
    'expiredOrdersCount', v_released_orders,
    'restoredItemsCount', v_restored_products,
    'expiryHours', coalesce(p_expiry_hours, 24)
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 13C. EXPIRE STALE STOCK RESERVATIONS (CANONICAL OVERLOAD & ALIAS)
-- ------------------------------------------------------------------------------
create or replace function public.expire_stale_stock_reservations(
  p_expiry_hours integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.admin_release_expired_reservations(p_expiry_hours);
end;
$$;

revoke all on function public.expire_stale_stock_reservations(integer) from public, anon, authenticated;
grant execute on function public.expire_stale_stock_reservations(integer) to service_role;

-- ------------------------------------------------------------------------------
-- 13B. HARDENED STOREFRONT CANCEL PENDING ORDER (ISSUE 6: ONLINE RESERVATION SAFETY)
-- ------------------------------------------------------------------------------
create or replace function public.storefront_cancel_pending_order(
  p_order_number text,
  p_reason text default 'Checkout dismissed or payment failed'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_item record;
begin
  -- Prevent hanging transactions
  set local lock_timeout = '5s';

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Operation not authorized.')::text using errcode = '42501';
  end if;

  if p_order_number is null or length(trim(p_order_number)) = 0 then
    raise exception '%', jsonb_build_object(
      'code', 'VALIDATION_ERROR',
      'message', 'A valid order number is required.'
    )::text using errcode = '22023';
  end if;

  -- UNIVERSAL LOCK ORDER: 1) Lock orders FIRST
  select *
  into v_order
  from public.orders
  where order_number = upper(trim(p_order_number))
  for update;

  if not found then
    raise exception '%', jsonb_build_object(
      'code', 'ORDER_NOT_FOUND',
      'message', 'Order ' || p_order_number || ' was not found.'
    )::text using errcode = 'P0002';
  end if;

  -- Idempotent return if already CANCELLED
  if v_order.status = 'CANCELLED' then
    return true;
  end if;

  if v_order.payment_status = 'PAID' then
    raise exception '%', jsonb_build_object(
      'code', 'CANNOT_CANCEL_PAID_ORDER',
      'message', 'Paid orders cannot be automatically cancelled via storefront dismissal.'
    )::text using errcode = 'P0001';
  end if;

  -- STRICT RAZORPAY RESERVATION SAFETY:
  -- Online gateway orders (RAZORPAY, ONLINE_UPI, or with razorpay_order_id) MUST NOT be cancelled
  -- or have stock released via modal dismissal, abandonment, or automated client cancellation.
  if v_order.razorpay_order_id is not null or upper(coalesce(v_order.payment_method, '')) in ('RAZORPAY', 'ONLINE_UPI') then
    raise exception '%', jsonb_build_object(
      'code', 'CANNOT_CANCEL_ONLINE_ORDER',
      'message', 'Online gateway orders cannot be cancelled via storefront modal dismissal. Stock reservation must be preserved.'
    )::text using errcode = 'P0001';
  end if;

  -- Only manual offline orders reach here.
  -- UNIVERSAL LOCK ORDER: Lock products in ascending UUID order
  for v_item in
    select oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = v_order.id
    order by oi.product_id asc
  loop
    update public.products
    set stock = stock + v_item.quantity,
        status = case when status = 'SOLD_OUT' then 'ACTIVE' else status end,
        updated_at = timezone('utc'::text, now())
    where id = v_item.product_id;
  end loop;

  update public.orders
  set status = 'CANCELLED',
      notes = coalesce(notes || ' | ', '') || coalesce(p_reason, 'Storefront cancellation'),
      updated_at = timezone('utc'::text, now())
  where id = v_order.id;

  return true;
end;
$$;

-- ------------------------------------------------------------------------------
-- 13C. AUTHORITATIVE ADMIN MANUAL RESERVATION RELEASE (ISSUE 1 & 6)
-- ------------------------------------------------------------------------------
create or replace function public.admin_authorize_reservation_release(
  p_order_ref text,
  p_actor_id text,
  p_reason text,
  p_cancellation_proof jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_uuid uuid;
  v_derived_role text;
  v_order record;
  v_item record;
  v_captured_count integer;
  v_unresolved_count integer;
  v_restored_count integer := 0;
  v_is_online boolean;
begin
  -- Prevent hanging transactions under lock contention
  set local lock_timeout = '5s';

  -- 1. Service role caller check
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception '%', jsonb_build_object(
      'code', 'FORBIDDEN',
      'message', 'Operation not authorized.'
    )::text using errcode = '42501';
  end if;

  -- 2. Owner identity validation at database boundary
  if p_actor_id is null or trim(p_actor_id) = '' then
    raise exception '%', jsonb_build_object(
      'code', 'VALIDATION_ERROR',
      'message', 'Actor ID is required.'
    )::text using errcode = '22023';
  end if;

  begin
    v_actor_uuid := p_actor_id::uuid;
  exception when others then
    raise exception '%', jsonb_build_object(
      'code', 'VALIDATION_ERROR',
      'message', 'Actor ID must be a valid UUID.'
    )::text using errcode = '22023';
  end;

  select role into v_derived_role
  from public.admin_users
  where id = v_actor_uuid and is_active = true;

  if v_derived_role is distinct from 'owner' then
    raise exception '%', jsonb_build_object(
      'code', 'FORBIDDEN',
      'message', 'Only active owners can authorize manual reservation release.'
    )::text using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception '%', jsonb_build_object(
      'code', 'VALIDATION_ERROR',
      'message', 'A detailed release authorization reason (>= 10 chars) is required.'
    )::text using errcode = '22023';
  end if;

  -- 3. UNIVERSAL LOCK ORDER: Step 1 - Lock orders FIRST
  select * into v_order
  from public.orders
  where order_number = upper(trim(p_order_ref)) or id::text = trim(p_order_ref)
  for update;

  if not found then
    raise exception '%', jsonb_build_object(
      'code', 'ORDER_NOT_FOUND',
      'message', 'Order not found.'
    )::text using errcode = 'P0002';
  end if;

  -- Prevent repeated restoration: if already cancelled and hold is false, idempotent no-op
  if v_order.status = 'CANCELLED' and v_order.is_reservation_held is false then
    return jsonb_build_object(
      'status', 'ALREADY_CANCELLED',
      'orderNumber', v_order.order_number,
      'restoredItemsCount', 0
    );
  end if;

  -- 4. UNIVERSAL LOCK ORDER: Step 2 - Lock child payment_records in UUID order
  perform 1
  from public.payment_records
  where order_id = v_order.id
  order by id asc
  for update;

  select count(*) filter (where status = 'CAPTURED'),
         count(*) filter (where status in ('AUTHORIZED', 'CREATED') or is_unresolved = true)
  into v_captured_count, v_unresolved_count
  from public.payment_records
  where order_id = v_order.id;

  if v_captured_count > 0 then
    raise exception '%', jsonb_build_object(
      'code', 'CANNOT_RELEASE_CAPTURED_ORDER',
      'message', 'Order has verified captured payment. Reservation cannot be released; process a refund instead.'
    )::text using errcode = 'P0001';
  end if;

  if v_unresolved_count > 0 then
    raise exception '%', jsonb_build_object(
      'code', 'PAYMENT_STATE_NOT_TERMINAL',
      'message', 'Order has unresolved or in-flight payment records. Reconcile payment records before releasing reservation.'
    )::text using errcode = 'P0001';
  end if;

  -- 5. Trusted evidence boundary & fail-closed online reservation release
  v_is_online := (v_order.razorpay_order_id is not null or upper(coalesce(v_order.payment_method, '')) in ('RAZORPAY', 'ONLINE_UPI'));

  if v_is_online then
    -- Genuine trusted evidence boundary:
    -- Caller-supplied JSON booleans (e.g. all_attempts_terminal, receipt_verified) or status strings
    -- do NOT authenticate provider state. Razorpay provides no API to cancel orders once created,
    -- and CircleUp Phase 1 lacks an independent gateway-signed terminal cancellation reconciliation worker.
    -- To prevent double-release and late-capture vulnerabilities where inventory is released while a customer
    -- still completes payment on Razorpay, online manual reservation release is strictly disabled fail-closed.
    -- Missing prerequisite: An authoritative gateway cancellation/expiry verification webhook or signed
    -- reconciliation ledger bound to internal order UUID and provider order ID.
    raise exception '%', jsonb_build_object(
      'code', 'ONLINE_RESERVATION_RELEASE_DISABLED',
      'message', 'Online reservations cannot be manually released: Razorpay orders cannot be cancelled via API and remain payable indefinitely. Stock reservation must be held until payment is captured or reconciled via refund.'
    )::text using errcode = 'P0001';
  end if;

  -- 6. UNIVERSAL LOCK ORDER: Step 3 - Lock order items in UUID order
  perform 1
  from public.order_items
  where order_id = v_order.id
  order by id asc
  for update;

  --    UNIVERSAL LOCK ORDER: Step 4 - Lock products in strictly ascending UUID order (grouped by product_id)
  for v_item in
    select oi.product_id, sum(oi.quantity)::integer as total_qty
    from public.order_items oi
    where oi.order_id = v_order.id
    group by oi.product_id
    order by oi.product_id asc
  loop
    update public.products
    set stock = stock + v_item.total_qty,
        status = case when status = 'SOLD_OUT' then 'ACTIVE' else status end,
        updated_at = timezone('utc'::text, now())
    where id = v_item.product_id;

    v_restored_count := v_restored_count + v_item.total_qty;
  end loop;

  -- 7. Update order state: clear hold, mark cancelled
  update public.orders
  set status = 'CANCELLED',
      is_reservation_held = false,
      reservation_held_reason = null,
      notes = coalesce(notes || ' | ', '') || '[MANUAL_RESERVATION_RELEASE: ' || trim(p_reason) || ' by owner ' || v_derived_role || ':' || p_actor_id || ']',
      updated_at = timezone('utc'::text, now())
  where id = v_order.id
  returning * into v_order;

  -- 8. Durable audit logging with verification timestamp
  insert into public.activity_audit_logs (
    actor_id, actor_role, action, table_name, record_id, after_state, created_at
  ) values (
    v_actor_uuid::text, v_derived_role, 'ORDER_STATUS_UPDATE', 'orders', v_order.id::text,
    jsonb_build_object(
      'orderNumber', v_order.order_number,
      'releaseAction', 'MANUAL_RESERVATION_RELEASE',
      'reason', trim(p_reason),
      'restoredItemsCount', v_restored_count,
      'actorId', v_actor_uuid,
      'actorRole', v_derived_role,
      'verificationTimestamp', timezone('utc'::text, now()),
      'cancellationProof', p_cancellation_proof
    ),
    timezone('utc'::text, now())
  );

  return jsonb_build_object(
    'status', 'RELEASED',
    'orderNumber', v_order.order_number,
    'restoredItemsCount', v_restored_count
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 14. PRIVILEGE ENFORCEMENT: STEP 1 MANDATORY REVOKE ON ALL HISTORICAL & ACTIVE SIGNATURES (ISSUE 7)
-- ------------------------------------------------------------------------------
-- Revoke all execution grants from PUBLIC, anon, and authenticated on ALL overloads:
do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'storefront_verify_razorpay_payment',
        'admin_process_order_refund',
        'process_order_refund',
        'storefront_finalize_order_refund',
        'cancel_and_refund_order',
        'admin_record_physical_return_inspection',
        'inspect_and_restore_inventory',
        'admin_verify_order_payment',
        'admin_mark_order_payment_received',
        'record_payment_attempt',
        'admin_release_expired_reservations',
        'release_expired_reservations',
        'storefront_cancel_pending_order',
        'razorpay_claim_webhook_event',
        'claim_webhook_event',
        'razorpay_finalize_webhook_event',
        'finalize_webhook_event',
        'storefront_attach_razorpay_order_id',
        'process_storefront_checkout',
        'atomic_checkout',
        'apply_coupon_atomic',
        'admin_authorize_reservation_release'
      )
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon, authenticated', r.nspname, r.proname, r.args);
    execute format('grant execute on function %I.%I(%s) to service_role', r.nspname, r.proname, r.args);
  end loop;
end $$;

-- ------------------------------------------------------------------------------
-- 15. CORRECTED RPC PRIVILEGE VERIFICATION SQL (ACLEXPLODE-BASED)
-- ------------------------------------------------------------------------------
-- The query below verifies explicit ACL grants (via aclexplode, treating OID 0 as PUBLIC)
-- and effective execution privileges across PUBLIC, anon, authenticated, and service_role.
-- Handles absent roles without query failure, completely eliminates has_function_privilege('public', ...),
-- and inspects every overload of all 13 in-scope functions.
/*
WITH target_functions AS (
  SELECT
    p.oid AS function_oid,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS argument_signature,
    COALESCE(p.proacl, acldefault('f', p.proowner)) AS effective_acl
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'process_storefront_checkout',
      'storefront_attach_razorpay_order_id',
      'storefront_verify_razorpay_payment',
      'storefront_cancel_pending_order',
      'razorpay_claim_webhook_event',
      'razorpay_finalize_webhook_event',
      'storefront_finalize_order_refund',
      'admin_verify_order_payment',
      'admin_mark_order_payment_received',
      'admin_process_order_refund',
      'admin_record_physical_return_inspection',
      'admin_release_expired_reservations',
      'admin_authorize_reservation_release'
    )
),
target_roles AS (
  SELECT 'PUBLIC' AS role_name, 0::oid AS role_oid, true AS role_exists, false AS is_db_role
  UNION ALL
  SELECT r.name, COALESCE(pr.oid, 0::oid), (pr.oid IS NOT NULL), (pr.oid IS NOT NULL)
  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(name)
  LEFT JOIN pg_roles pr ON pr.rolname = r.name
),
function_acls AS (
  SELECT
    tf.function_oid,
    tf.function_name,
    tf.argument_signature,
    (acl).grantee AS grantee_oid,
    (acl).privilege_type AS privilege_type
  FROM target_functions tf
  CROSS JOIN LATERAL aclexplode(tf.effective_acl) AS acl
)
SELECT
  tf.function_name,
  tf.argument_signature,
  tr.role_name AS grantee,
  -- Explicit grant check via aclexplode: OID 0 is PUBLIC
  EXISTS (
    SELECT 1 FROM function_acls fa
    WHERE fa.function_oid = tf.function_oid
      AND fa.grantee_oid = tr.role_oid
      AND fa.privilege_type = 'EXECUTE'
  ) AS has_explicit_grant,
  -- Effective privilege check (accounting for inheritance and defaults)
  -- Evaluates has_function_privilege only on verified existing database roles
  -- For PUBLIC, relies strictly on whether OID 0 holds EXECUTE in effective_acl
  CASE
    WHEN tr.role_name = 'PUBLIC' THEN
      EXISTS (
        SELECT 1 FROM function_acls fa
        WHERE fa.function_oid = tf.function_oid
          AND fa.grantee_oid = 0::oid
          AND fa.privilege_type = 'EXECUTE'
      )
    WHEN tr.is_db_role THEN
      COALESCE(eff.role_effective_privilege, false)
    ELSE false
  END AS has_effective_privilege,
  -- Compliance status asserting service_role-only execution policy
  CASE
    WHEN tr.role_name = 'service_role' THEN
      CASE
        WHEN tr.is_db_role AND COALESCE(eff.role_effective_privilege, false)
        THEN 'PASS (AUTHORIZED)'
        ELSE 'FAIL (MISSING PRIVILEGE)'
      END
    WHEN tr.role_name = 'PUBLIC' THEN
      CASE
        WHEN EXISTS (
          SELECT 1 FROM function_acls fa
          WHERE fa.function_oid = tf.function_oid
            AND fa.grantee_oid = 0::oid
            AND fa.privilege_type = 'EXECUTE'
        )
        THEN 'FAIL (UNREVOKED ACCESS)'
        ELSE 'PASS (REVOKED)'
      END
    ELSE
      CASE
        WHEN (tr.is_db_role AND COALESCE(eff.role_effective_privilege, false)) OR EXISTS (
          SELECT 1 FROM function_acls fa
          WHERE fa.function_oid = tf.function_oid
            AND fa.grantee_oid = tr.role_oid
            AND fa.privilege_type = 'EXECUTE'
        )
        THEN 'FAIL (UNREVOKED ACCESS)'
        ELSE 'PASS (REVOKED)'
      END
  END AS compliance_status
FROM target_functions tf
CROSS JOIN target_roles tr
LEFT JOIN LATERAL (
  SELECT has_function_privilege(pr.rolname, tf.function_oid, 'EXECUTE') AS role_effective_privilege
  FROM pg_roles pr
  WHERE pr.rolname = tr.role_name
) eff ON tr.is_db_role = true
ORDER BY tf.function_name, tf.argument_signature, tr.role_name;
*/
