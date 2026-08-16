import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../lib/authedServerClient';
import { verifyPaymentSignature } from '../../../lib/razorpay';

// Infra-only per §27/§28d (see CONTEXT.md) — no checkout UI calls this
// yet. This is the route Razorpay Checkout.js's success callback should
// POST to once a payment completes client-side: it hands back
// razorpay_order_id, razorpay_payment_id and razorpay_signature, and this
// route is what actually trusts (or doesn't) that the payment is real —
// never mark a payments row captured from the client callback alone.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: 'Missing Razorpay callback fields.' }, { status: 400 });
  }

  // Row must belong to the requesting user AND still be in 'created' —
  // prevents replaying a stale/foreign order id to flip an unrelated
  // payment to captured.
  const { data: row, error: rowError } = await auth.supabase
    .from('payments')
    .select('id, status')
    .eq('razorpay_order_id', razorpay_order_id)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: 'No matching payment found.' }, { status: 404 });
  }
  if (row.status === 'captured') {
    return NextResponse.json({ verified: true, alreadyCaptured: true });
  }

  const valid = verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!valid) {
    await auth.supabase.from('payments').update({ status: 'failed' }).eq('id', row.id);
    return NextResponse.json({ error: 'Signature verification failed.' }, { status: 400 });
  }

  const { error: updateError } = await auth.supabase
    .from('payments')
    .update({
      status: 'captured',
      razorpay_payment_id,
      razorpay_signature,
    })
    .eq('id', row.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ verified: true });
}
