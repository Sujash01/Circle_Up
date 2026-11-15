# CircleUp – Production Database Migration Plan

## 1. Migration Overview & Sequential Order

To maintain strict data integrity and zero customer downtime, the two production migrations must be executed in the following strict order:

```
┌────────────────────────────────────────────────────────┐
│ Stage 1: MongoDB Guest Order Token Migration           │
│ - Back up orders collection                            │
│ - Run --dry-run audit                                  │
│ - Execute batch migration (manual run)                 │
│ - Run --verify check                                   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Stage 2: Supabase Email Verification Migration         │
│ - Verify SMTP and Dashboard settings                   │
│ - Run read-only pre-flight SQL inspection              │
│ - Apply 20261115_remove_auto_confirm.sql               │
│ - Execute end-to-end signup/verification test          │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Stage 3: Supabase RLS Policy Hardening Migration       │
│ - Apply 20261115_fix_rls_policies.sql                  │
│ - Revoke overly permissive authenticated policies      │
│ - Enforce strict customer ownership & admin roles      │
└────────────────────────────────────────────────────────┘
```

---

## 2. Pre-Flight Environment Checklist

Before commencing any migration activity, verify environment variables across your hosting environment:

### Backend (`backend/.env`)
- `MONGODB_URI`: Valid production MongoDB connection string with write permissions.
- `JWT_ACCESS_SECRET` / `SUPABASE_JWT_SECRET`: High-entropy 64+ char secret matching your Supabase project JWT secret.
- `JWT_ADMIN_ACCESS_SECRET`: High-entropy 64+ char secret for administrative sessions.
- `NODE_ENV`: Must be `production`.
- `TRUST_PROXY`: `true` or matching reverse-proxy hop count (e.g. `1` for Render/Vercel/Cloudflare).

### Frontend (`frontend/.env`)
- `VITE_SUPABASE_URL`: Production Supabase project URL (`https://<project-ref>.supabase.co`).
- `VITE_SUPABASE_ANON_KEY`: Supabase anon/public key (never service-role key).
- `VITE_API_URL`: Backend production API base URL (`https://api.circleuponline.com` or `/api/v1`).

---

## 3. Stage 1: MongoDB Guest Token Migration

### Step 1.1: Database Backup
```bash
# 1. Back up orders collection
mongodump --uri="$MONGODB_URI" --collection=orders --out="./backup-orders-$(date +%Y%m%d_%H%M%S)"

# 2. Verify backup files exist
ls -lh ./backup-orders-*/
```

### Step 1.2: Read-Only Dry Run
```bash
node scripts/migrateGuestTokens.mjs --dry-run
```
- Review the output table.
- Confirm `Eligible for migration` matches expected unmigrated orders.
- Confirm zero writes were performed.

### Step 1.3: Execute Migration (MANUAL EXECUTION)
> [!IMPORTANT]
> Execute this command manually in a controlled maintenance terminal:

```bash
# MANUAL EXECUTION ONLY
node scripts/migrateGuestTokens.mjs
```
*Note: To control batch pacing, set `MIGRATION_BATCH_SIZE=100`.*

### Step 1.4: Post-Migration Verification
```bash
node scripts/migrateGuestTokens.mjs --verify
```
- Must report `Records with invalid hash: 0` and `Remaining unhashed records: 0`.
- Script will exit with code `0`.

### Step 1.5: Stage 1 Rollback (Contingency Only)
If catastrophic failure occurs during Stage 1:
```bash
mongorestore --uri="$MONGODB_URI" --collection=orders --drop ./backup-orders-<timestamp>/<dbname>/orders.bson
```

---

## 4. Stage 2: Supabase Email Verification Migration

### Step 2.1: Pre-Flight Configuration
1. Open Supabase Dashboard → **Authentication** → **Providers** → **Email**.
   - Verify **Confirm email** is set to **Enabled**.
2. Open Supabase Dashboard → **Authentication** → **SMTP Settings**.
   - Verify Custom SMTP is enabled and sending works via **Send Test Email**.
3. Open Supabase Dashboard → **Authentication** → **URL Configuration**.
   - Ensure Redirect URLs include `https://circleuponline.com/auth/callback` and `https://circleuponline.com/signin`.

### Step 2.2: Pre-Flight SQL Check & Existing User Audit
Run in Supabase SQL Editor:
```sql
-- 1. Report total unconfirmed users (does NOT need to be zero automatically)
SELECT COUNT(*) AS unconfirmed_user_count FROM auth.users WHERE email_confirmed_at IS NULL;

-- 2. Inspect unconfirmed accounts to identify legitimate existing customers
SELECT id, email, created_at, raw_user_meta_data 
FROM auth.users 
WHERE email_confirmed_at IS NULL 
ORDER BY created_at DESC;
```
> [!IMPORTANT]
> **Do NOT bulk-update existing unconfirmed accounts.**
> - Record the baseline unconfirmed count.
> - Legitimate customers with active app sessions remain logged in until session expiry.
> - If an unconfirmed user needs login access, they can click their verification link or request a new one via the app's "Resend Confirmation" flow.
> - If support manually verifies an individual customer's identity, an admin may perform a targeted single-record update:
>   `UPDATE auth.users SET email_confirmed_at = timezone('utc'::text, now()) WHERE id = '<exact-uuid>' AND email = '<exact-email>';`

### Step 2.3: Execute Migration SQL (MANUAL EXECUTION)
Execute `supabase/migrations/20261115_remove_auto_confirm.sql` in the Supabase SQL Editor:
```sql
-- Drop the auto-confirm trigger from auth.users
drop trigger if exists on_auth_user_auto_confirm on auth.users;

-- Drop the associated auto-confirm trigger function
drop function if exists public.auto_confirm_new_user();
```

### Step 2.4: Verification
Run in Supabase SQL Editor:
```sql
SELECT trigger_name FROM information_schema.triggers WHERE trigger_name = 'on_auth_user_auto_confirm';
```
- Must return `0 rows`.

### Step 2.5: Stage 2 Rollback (Contingency Only)
If email delivery issues occur and automatic confirmation must be temporarily re-enabled:
```sql
-- Restore auto-confirm trigger; leaves existing user confirmation states untouched.
-- NEVER bulk-updates existing accounts.
CREATE OR REPLACE FUNCTION public.auto_confirm_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := timezone('utc'::text, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_auto_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_new_user();
```
*Rollback Limitation Note: The restored trigger operates `BEFORE INSERT`. It only affects subsequent signups going forward. Users who registered during the outage window without confirmation will remain unconfirmed until they verify via email or are manually verified.*

---

## 5. Stage 3: Supabase RLS Policy Hardening Migration

### Step 3.1: Execute Migration SQL
Execute `supabase/migrations/20261115_fix_rls_policies.sql` in the Supabase SQL Editor:
- Revokes policies granting write access to `auth.role() = 'authenticated'` on `public.products`.
- Revokes policies allowing any authenticated user to view or manage all orders/order items.
- Enforces that administrative operations require verified `app_metadata ->> 'role'` in `('admin', 'staff', 'owner')` or `service_role`.
- Enforces strict customer ownership on `public.orders` and `public.order_items`.

### Step 3.2: Verify Policies
Run in Supabase SQL Editor:
```sql
SELECT tablename, policyname, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename IN ('products', 'orders', 'order_items');
```
Confirm:
- No policy on `public.products` grants INSERT/UPDATE/DELETE to public or general authenticated customers.
- Policies on `public.orders` require `auth.uid() = customer_id` or admin/service role.

---

## 6. Remaining Risks & Mitigation Strategies

| Risk | Probability | Severity | Mitigation Strategy |
| :--- | :---: | :---: | :--- |
| **Concurrent Guest Checkout during MongoDB Migration** | Low | Low | The script uses conditional updates (`updateOne` with `guestAccessTokenHash: null`). Any new order created concurrently already has a hash generated by `order.service.ts` and will not be touched. |
| **Script Interruption (Network / Process Termination)** | Low | Low | The script queries remaining records dynamically per batch. Re-running `node scripts/migrateGuestTokens.mjs` immediately resumes from the interruption point with zero duplicate operations. |
| **Custom SMTP Outage on Supabase** | Medium | High | Pre-test SMTP using Supabase "Send Test Email" tool. Have Rollback SQL ready to immediately re-enable auto-confirm if SMTP provider has downtime. |
| **Customer Email Client Clicks Redirect Link without Cookie/Session** | Low | Low | Handled by `AuthCallbackPage.tsx`: PKCE code is exchanged and user is redirected gracefully to `/signin?verified=true`. |
| **Legacy Plaintext Token Access Broken** | None | High | Preserved via active dual-path timing-safe comparison in `order.service.ts` (lines 55–62). Legacy compatibility code is intentionally kept intact. |

---

## 7. GO / NO-GO Production Checklist

- [ ] Collection backup confirmed (`mongodump` completed and verified)
- [ ] MongoDB `--dry-run` passed and verified
- [ ] Custom SMTP operational and test email confirmed received
- [ ] Supabase Redirect URLs configured for production domain
- [ ] Rollback SQL script accessible in secondary tab
- [ ] Production execution executed manually by authorized engineer
- [ ] Post-migration `--verify` passed with zero errors
- [ ] End-to-end signup and order tracking verified on live production environment
