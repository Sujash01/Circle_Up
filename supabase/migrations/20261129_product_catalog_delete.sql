-- Serialize permanent product deletion with checkout's product row lock.
-- The function is intentionally invoker-security: only the backend service role
-- can execute it, and the existing products/order_items tables remain unchanged.
create or replace function public.delete_product_if_unordered(p_product_id uuid)
returns table (deleted_id uuid, serial_number text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
begin
  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.order_items
    where product_id = p_product_id
       or pg_catalog.upper(pg_catalog.btrim(serial_number)) = pg_catalog.upper(pg_catalog.btrim(v_product.serial_number))
  ) then
    raise exception using errcode = '23503', message = 'PRODUCT_IN_ORDERS';
  end if;

  delete from public.products where id = p_product_id;
  return query select v_product.id, v_product.serial_number;
end;
$$;

revoke all on function public.delete_product_if_unordered(uuid) from public, anon, authenticated;
grant execute on function public.delete_product_if_unordered(uuid) to service_role;
