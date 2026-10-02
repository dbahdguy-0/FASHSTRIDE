import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase-server';

const schema = z.object({
  currency: z.enum(['NGN', 'USD']),
  customer: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    phone: z.string().min(7).max(30),
    address: z.string().min(5).max(300),
    city: z.string().min(2).max(100),
    state: z.string().min(2).max(100),
    country: z.string().min(2).max(80),
    postal_code: z.string().max(30),
  }),
  items: z.array(z.object({
    productId: z.string().uuid(),
    size: z.string().min(1).max(8),
    quantity: z.number().int().min(1).max(10),
  })).min(1).max(30),
});

function getCallbackUrl(requestUrl: string) {
  const request = new URL(requestUrl);
  // Localhost ports change when another Next.js process already uses 3000.
  // Return to the same origin that started this checkout so its session/cart
  // storage and verification page remain in the same browser origin.
  if (request.hostname === 'localhost' || request.hostname === '127.0.0.1') {
    return `${request.origin}/checkout/verify`;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) throw new Error('NEXT_PUBLIC_SITE_URL is required');
  const site = new URL(configured);
  if (site.protocol !== 'https:' && site.hostname !== 'localhost') {
    throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS in production');
  }
  return `${site.origin}/checkout/verify`;
}

export async function POST(req: Request) {
  let userId: string;
  try {
    const { data: { user }, error } = await supabaseServer().auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Sign in before checkout so your order can be linked to your account.' }, { status: 401 });
    }
    userId = user.id;
  } catch {
    return NextResponse.json({ error: 'Account checkout requires Supabase configuration.' }, { status: 503 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check your delivery details and cart, then try again.' }, { status: 400 });
  }

  const { currency, customer, items } = parsed.data;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Online payments are not configured yet. Please contact FASHSTRIDE.' }, { status: 503 });
  if (currency === 'USD' && process.env.PAYSTACK_USD_ENABLED !== 'true') {
    return NextResponse.json({ error: 'USD Paystack payments are disabled for this account. Switch to NGN to continue.' }, { status: 400 });
  }

  let order: { id: string; total_minor: number; payment_reference: string; order_number: string } | null = null;
  const db = supabaseAdmin();
  try {
    const shippingFee = Number(currency === 'NGN' ? process.env.SHIPPING_FEE_NGN ?? 2500 : process.env.SHIPPING_FEE_USD ?? 8);
    if (!Number.isFinite(shippingFee) || shippingFee < 0) throw new Error('Invalid shipping configuration');

    const { data, error } = await db.rpc('create_reserved_order', {
      p_user_id: userId,
      p_customer: customer,
      p_currency: currency,
      p_items: items,
      p_shipping_fee: shippingFee,
    });
    if (error) throw error;
    order = data;
    if (!order?.id || !order.payment_reference || !Number.isSafeInteger(Number(order.total_minor))) {
      throw new Error('Order reservation returned invalid payment data');
    }

    const authorizationUrl = getCallbackUrl(req.url);
    let response: Response;
    try {
      response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: customer.email,
          amount: order.total_minor,
          currency,
          reference: order.payment_reference,
          callback_url: authorizationUrl,
          metadata: { order_id: order.id, order_number: order.order_number },
        }),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      });
    } catch (error) {
      console.error('Paystack transaction initialization request failed', error);
      await db.rpc('release_order_reservation', { p_order_id: order.id, p_status: 'failed' });
      return NextResponse.json({ error: 'Could not reach Paystack. Your order was not charged; please try again.' }, { status: 502 });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.status || !payload?.data?.authorization_url) {
      console.error('Paystack declined transaction initialization', { status: response.status, message: payload?.message });
      await db.rpc('release_order_reservation', { p_order_id: order.id, p_status: 'failed' });
      return NextResponse.json({ error: 'Paystack could not start this payment. Your cart remains available.' }, { status: 502 });
    }

    const { error: updateError } = await db.from('orders')
      .update({ payment_access_code: payload.data.access_code })
      .eq('id', order.id);
    if (updateError) console.error('Could not save Paystack access code for order', order.order_number, updateError);

    return NextResponse.json({ authorization_url: payload.data.authorization_url });
  } catch (error: any) {
    if (order?.id) {
      const { error: releaseError } = await db.rpc('release_order_reservation', { p_order_id: order.id, p_status: 'failed' });
      if (releaseError) console.error('Could not release failed checkout stock reservation', releaseError);
    }
    const message = String(error?.message || 'Order initialization failed');
    console.error('Could not create FASHSTRIDE checkout order', message, error?.code);
    const status = /stock|size|active|empty|duplicate/i.test(message) ? 409 : 503;
    return NextResponse.json({
      error: status === 409
        ? 'One of those sizes is no longer available. Refresh your cart and choose another size.'
        : 'Could not create your order. Please try again or contact FASHSTRIDE.',
    }, { status });
  }
}
