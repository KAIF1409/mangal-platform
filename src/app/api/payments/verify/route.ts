import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from '../../../lib/auth/authedServerClient';
import { verifyPaymentSignature } from '../../../lib/payments/razorpay';

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

  // §95 — remove_ads is a one-time flag flip on `profiles`, applied here
  // (the client-facing verify path) same as the webhook does below for
  // defense in depth — whichever fires first wins, the other is a no-op
  // since the row is already `captured` by then in the webhook's case,
  // or this update is simply idempotent (`ads_removed = true` twice is
  // harmless). Never trust `purpose` from the client — it's read from
  // the DB row here, not from the request body.
  if (row.purpose === 'remove_ads') {
    await auth.supabase.from('profiles').update({ ads_removed: true }).eq('id', auth.userId);
  }

  // Books module — a captured book_purchase payment grants access to the
  // book referenced by purpose_ref_id. Same defense-in-depth shape as the
  // remove_ads branch: purpose is read from the DB row (never the request
  // body), and the grant itself is validated server-side — the book must
  // exist, actually be PAID, and the captured amount must cover its price.
  // Idempotent via the (book_id, user_id) unique constraint, so a retry or
  // the webhook firing first is a harmless no-op.
  if (row.purpose === 'book_purchase' && row.purpose_ref_id) {
    const { data: book } = await supabaseAdmin
      .from('books')
      .select('id, pricing_type, price_paise')
      .eq('id', row.purpose_ref_id)
      .maybeSingle();

    if (book && book.pricing_type === 'PAID') {
      const { data: paymentRow } = await auth.supabase
        .from('payments')
        .select('amount_paise')
        .eq('id', row.id)
        .maybeSingle();

      if (paymentRow && paymentRow.amount_paise >= (book.price_paise ?? 0)) {
        await supabaseAdmin
          .from('book_purchases')
          .upsert(
            {
              book_id: book.id,
              user_id: auth.userId,
              payment_id: row.id,
              amount_paid_paise: paymentRow.amount_paise,
            },
            { onConflict: 'book_id,user_id' }
          );
      }
    }
  }

  return NextResponse.json({ verified: true });
}
