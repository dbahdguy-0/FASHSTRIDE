-- Supabase commonly installs pgcrypto outside `public`. Checkout RPCs run with a
-- restricted search_path, so use PostgreSQL's built-in UUID generator instead
-- of pgcrypto's gen_random_bytes() for payment/order references.
alter table public.orders
  alter column order_number set default ('FS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)));

create or replace function public.create_reserved_order(
  p_user_id uuid,
  p_customer jsonb,
  p_currency text,
  p_items jsonb,
  p_shipping_fee numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  p public.products%rowtype;
  v_size public.product_sizes%rowtype;
  v_price numeric;
  v_subtotal numeric := 0;
  v_shipping numeric;
  v_order public.orders%rowtype;
  v_ref text := replace(gen_random_uuid()::text, '-', '');
begin
  if p_currency not in ('NGN', 'USD') then raise exception 'currency'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty cart'; end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) with ordinality a(value, idx)
    join jsonb_array_elements(p_items) with ordinality b(value, idx)
      on a.value->>'productId' = b.value->>'productId'
     and a.value->>'size' = b.value->>'size'
     and a.idx < b.idx
  ) then raise exception 'duplicate cart item'; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    select * into p from public.products where id = (item->>'productId')::uuid and active for share;
    if not found then raise exception 'product inactive'; end if;
    select * into v_size from public.product_sizes where product_id = p.id and size = item->>'size' for update;
    if not found or v_size.stock_quantity < (item->>'quantity')::int then raise exception 'stock unavailable'; end if;
    v_price := case when p_currency = 'NGN' then p.price_ngn else p.price_usd end;
    v_subtotal := v_subtotal + v_price * (item->>'quantity')::int;
  end loop;
  if p_shipping_fee < 0 then raise exception 'shipping fee'; end if;
  v_shipping := p_shipping_fee;

  insert into public.orders(
    user_id, payment_reference, currency, subtotal, shipping_fee, total, total_minor,
    customer_name, customer_email, customer_phone, shipping_address, shipping_city,
    shipping_state, shipping_country, postal_code
  ) values (
    p_user_id, v_ref, p_currency, v_subtotal, v_shipping, v_subtotal + v_shipping,
    round((v_subtotal + v_shipping) * 100), p_customer->>'name', p_customer->>'email',
    p_customer->>'phone', p_customer->>'address', p_customer->>'city', p_customer->>'state',
    p_customer->>'country', p_customer->>'postal_code'
  ) returning * into v_order;

  for item in select value from jsonb_array_elements(p_items) loop
    select * into p from public.products where id = (item->>'productId')::uuid;
    update public.product_sizes
       set stock_quantity = stock_quantity - (item->>'quantity')::int
     where product_id = p.id and size = item->>'size';
    v_price := case when p_currency = 'NGN' then p.price_ngn else p.price_usd end;
    insert into public.order_items(
      order_id, product_id, product_name_snapshot, product_price_snapshot,
      currency, size, quantity, subtotal
    ) values (
      v_order.id, p.id, p.name, v_price, p_currency, item->>'size',
      (item->>'quantity')::int, v_price * (item->>'quantity')::int
    );
  end loop;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'payment_reference', v_order.payment_reference,
    'total_minor', v_order.total_minor,
    'total', v_order.total
  );
end;
$$;
