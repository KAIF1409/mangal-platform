import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireUser } from '../../../lib/auth/authedServerClient';
import { createOrder, isRazorpayConfigured } from '../../../lib/payments/razorpay';

// Infra-only per §27/§28d (see CONTEXT.md) — nothing calls this route yet
// (no checkout UI/paywall built). Generic on purpose: `purpose` +
// `purposeRefId` are caller-supplied, not hardcoded to one feature, so
// whichever payment feature ships first (tip, subscription, Pro Creator
// tier...) can reuse this same route without changes.
//
// Flow: client calls this route → gets back a Razorpay order_id →
// opens Razorpay Checkout.js with that order_id → Checkout's callback
// hits /api/payments/verify with the resulting payment_id + signature.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: 'Payments are not set up yet.' },
      { status: 503 }
    );
  }

  let body: { amountPaise?: number; purpose?: string; purposeRefId?: string; requestedMethod?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { amountPaise, purpose, purposeRefId, requestedMethod } = body;

  if (!amountPaise || !Number.isInteger(amountPaise) || amountPaise <= 0) {
    return NextResponse.json({ error: 'amountPaise must be a positive integer.' }, { status: 400 });
  }
  if (!purpose || typeof purpose !== 'string') {
    return NextResponse.json({ error: 'purpose is required.' }, { status: 400 });
  }

  // Insert the payments row first (status: created) so we have a stable
  // id to use as the Razorpay receipt, then create the order and store
  // its id back on the row.
  const { data: row, error: insertError } = await auth.supabase
    .from('payments')
    .insert({
      user_id: auth.userId,
      razorpay_order_id: `pending_${crypto.randomUUID()}`, // placeholder, unique constraint requires non-null; overwritten below
      amount_paise: amountPaise,
      purpose,
      purpose_ref_id: purposeRefId ?? null,
      requested_method: requestedMethod ?? null,
    })
    .select('id')
    .single();

  if (insertError || !row) {
    return NextResponse.json({ error: insertError?.message ?? 'Could not start payment.' }, { status: 500 });
  }

  try {
    const order = await createOrder({
      amountPaise,
      receipt: row.id,
      notes: { purpose, userId: auth.userId },
    });

    const { error: updateError } = await auth.supabase
      .from('payments')
      .update({ razorpay_order_id: order.id })
      .eq('id', row.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ orderId: order.id, amountPaise, paymentRowId: row.id });
  } catch (err) {
    // Clean up the placeholder row so it doesn't linger as a dead 'created' record.
    await auth.supabase.from('payments').delete().eq('id', row.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not create Razorpay order.' },
      { status: 502 }
    );
  }
}
