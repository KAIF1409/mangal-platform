import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from '../../../lib/auth/authedServerClient';
import { verifyPaymentSignature } from '../../../lib/payments/razorpay';
import { applyPaymentGrant } from '../../../lib/payments/grantPayment';

// Service-role client — used ONLY for the book_purchase grant below.
// book_purchases has no client-side insert policy on purpose (a purchase row
// IS the entitlement to a paid book, so it must never be writable by the
// browser); only the server, after signature verification, may create one.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    .select('id, status, purpose, purpose_ref_id')
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

  // §141 — grant side effects (remove_ads flag, book_purchase row) now
  // live in one shared place (lib/payments/grantPayment.ts) so the manual
  // direct-UPI verify route applies the exact same logic instead of a
  // second, possibly-drifting copy. Defense-in-depth is unchanged: purpose
  // is read from the DB row, never the request body, and every grant here
  // is idempotent (safe if the webhook already ran first).
  const { data: paymentRow } = await auth.supabase
    .from('payments')
    .select('amount_paise')
    .eq('id', row.id)
    .maybeSingle();

  await applyPaymentGrant(auth.supabase, supabaseAdmin, {
    id: row.id,
    user_id: auth.userId,
    purpose: row.purpose,
    purpose_ref_id: row.purpose_ref_id,
    amount_paise: paymentRow?.amount_paise ?? 0,
  });

  return NextResponse.json({ verified: true });
}
