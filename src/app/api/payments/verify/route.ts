import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderEmail } from '@/lib/mail';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const reference = String(body.reference || '');
  if (!reference || reference.length > 120) return NextResponse.json({ error: 'Invalid payment reference' }, { status: 400 });
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Payment verification is unavailable' }, { status: 503 });

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json();
    if (!response.ok || !payload.status || payload.data.status !== 'success') {
      return NextResponse.json({ status: payload.data?.status || 'failed' }, { status: 402 });
    }

    const { data, error } = await supabaseAdmin().rpc('confirm_paystack_order', {
      p_reference: reference,
      p_amount_minor: payload.data.amount,
      p_currency: payload.data.currency,
    });
    if (error) throw error;
    if (data?.error) return NextResponse.json({ error: data.error }, { status: 409 });

    let emailSent = true;
    try {
      await sendOrderEmail(reference);
    } catch (emailError) {
      emailSent = false;
      console.error('Payment was verified, but the order confirmation email could not be sent', emailError);
    }
    return NextResponse.json({ status: 'paid', order_number: data.order_number, email_sent: emailSent });
  } catch (error) {
    console.error('Paystack payment verification failed', error);
    return NextResponse.json({ error: 'Payment verification could not complete. You can retry from your order history.' }, { status: 503 });
  }
}
