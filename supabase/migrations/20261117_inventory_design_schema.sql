-- ==============================================================================
-- CircleUp Supabase Migration: Inventory Design System
-- Codes, Statuses (Sold, Booked, Missing, Repair, Barter, Rent), & Sizing
-- ==============================================================================

-- 1. Add inventory system columns to public.products if they don't already exist
alter table public.products
  add column if not exists category_code text,
  add column if not exists size_category text,
  add column if not exists measurements_data jsonb default '{}'::jsonb;

-- 2. Update status constraint to support all spreadsheet inventory statuses
alter table public.products drop constraint if exists products_status_check;

alter table public.products
  add constraint products_status_check check (
    status in (
      'AVAILABLE',
      'SOLD',
      'BOOKED',
      'MISSING',
      'NEED_ATTENTION',
      'EXCHANGE_BARTER',
      'RENT',
      'ACTIVE',
      'PUBLISHED',
      'SOLD_OUT',
      'DRAFT',
      'ARCHIVED'
    )
  );

-- Default new products to AVAILABLE
alter table public.products alter column status set default 'AVAILABLE';

-- 3. Create indexes for category codes and size categories
create index if not exists idx_products_category_code on public.products(category_code);
create index if not exists idx_products_size_category on public.products(size_category);

-- 4. Function & Trigger: Auto-derive category_code from serial_number if null
create or replace function public.derive_product_category_code()
returns trigger
language plpgsql
as $$
declare
  cleaned_serial text;
begin
  if new.category_code is null or new.category_code = '' then
    cleaned_serial := upper(trim(new.serial_number));

    -- Check multi-part codes first
    if cleaned_serial like 'MB-J-%' or cleaned_serial like 'MB-J_%' then new.category_code := 'MB-J';
    elsif cleaned_serial like 'WB-J-%' or cleaned_serial like 'WB-J_%' then new.category_code := 'WB-J';
    elsif cleaned_serial like 'MB-O-%' or cleaned_serial like 'MB-O_%' then new.category_code := 'MB-O';
    elsif cleaned_serial like 'MB-L-%' or cleaned_serial like 'MB-L_%' then new.category_code := 'MB-L';
    elsif cleaned_serial like 'WB-L-%' or cleaned_serial like 'WB-L_%' then new.category_code := 'WB-L';
    elsif cleaned_serial like 'WB-O-%' or cleaned_serial like 'WB-O_%' then new.category_code := 'WB-O';
    elsif cleaned_serial like 'CWZ-%' or cleaned_serial like 'CWZ_%' then new.category_code := 'CWZ';
    elsif cleaned_serial like 'OWJ-%' or cleaned_serial like 'OWJ_%' then new.category_code := 'OWJ';
    elsif cleaned_serial like 'TCE-%' or cleaned_serial like 'TCE_%' then new.category_code := 'TCE';
    elsif cleaned_serial like 'DIY-%' or cleaned_serial like 'DIY_%' then new.category_code := 'DIY';
    elsif cleaned_serial like 'SET-%' or cleaned_serial like 'SET_%' then new.category_code := 'SET';
    elsif cleaned_serial like 'DJ-%' or cleaned_serial like 'DJ_%' then new.category_code := 'DJ';
    elsif cleaned_serial like 'LJ-%' or cleaned_serial like 'LJ_%' then new.category_code := 'LJ';
    elsif cleaned_serial like 'SZ-%' or cleaned_serial like 'SZ_%' then new.category_code := 'SZ';
    elsif cleaned_serial like 'SC-%' or cleaned_serial like 'SC_%' then new.category_code := 'SC';
    elsif cleaned_serial like 'FS-%' or cleaned_serial like 'FS_%' then new.category_code := 'FS';
    elsif cleaned_serial like 'DB-%' or cleaned_serial like 'DB_%' then new.category_code := 'DB';
    elsif cleaned_serial like 'SS-%' or cleaned_serial like 'SS_%' then new.category_code := 'SS';
    elsif cleaned_serial like 'SH-%' or cleaned_serial like 'SH_%' then new.category_code := 'SH';
    elsif cleaned_serial like 'BB-%' or cleaned_serial like 'BB_%' then new.category_code := 'BB';
    elsif cleaned_serial like 'JW-%' or cleaned_serial like 'JW_%' then new.category_code := 'JW';
    elsif cleaned_serial like 'CJ-%' or cleaned_serial like 'CJ_%' then new.category_code := 'CJ';
    elsif cleaned_serial like 'SB-%' or cleaned_serial like 'SB_%' then new.category_code := 'SB';
    elsif cleaned_serial like 'MS-%' or cleaned_serial like 'MS_%' then new.category_code := 'MS';
    elsif cleaned_serial like 'EX-%' or cleaned_serial like 'EX_%' then new.category_code := 'EX';
    elsif cleaned_serial like 'H-%' or cleaned_serial like 'H_%' then new.category_code := 'H';
    elsif cleaned_serial like 'T-%' or cleaned_serial like 'T_%' then new.category_code := 'T';
    elsif cleaned_serial like 'B-%' or cleaned_serial like 'B_%' then new.category_code := 'B';
    elsif cleaned_serial like 'S-%' or cleaned_serial like 'S_%' then new.category_code := 'S';
    elsif cleaned_serial like 'J-%' or cleaned_serial like 'J_%' then new.category_code := 'J';
    elsif cleaned_serial like 'R-%' or cleaned_serial like 'R_%' then new.category_code := 'R';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_product_category_code_insert on public.products;
create trigger on_product_category_code_insert
  before insert or update on public.products
  for each row execute function public.derive_product_category_code();

-- 5. Update RLS policies:
-- Customers can view in-stock, sold, booked, barter, and rental products.
-- Defective/repair items ('NEED_ATTENTION') and lost items ('MISSING') remain hidden from public shoppers.
drop policy if exists "Public can view active products" on public.products;
create policy "Public can view active products"
  on public.products
  for select
  using (
    status in (
      'AVAILABLE',
      'ACTIVE',
      'PUBLISHED',
      'SOLD',
      'BOOKED',
      'EXCHANGE_BARTER',
      'RENT'
    )
    or auth.role() = 'authenticated'
  );
