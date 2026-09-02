import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireUser } from '../../../lib/auth/authedServerClient';
import { generateReferenceCode } from '../../../lib/payments/upi';

// §141 — the direct-UPI counterpart to /api/payments/create-order. Same
// generic purpose/purposeRefId shape, but instead of opening a Razorpay
// order, this resolves which VPA the money should actually go to and
// hands back everything the client needs to render a QR / upi:// link.
//
// Recipient resolution:
//   - purpose 'tip' with a purposeRefId → that creator's own verified UPI
//     ID, via the get_creator_payout_vpa() RPC (only returns a row once
//     the creator has confirmed their upi_id — see the §141 migration).
//     No verified UPI on file → 400, so the client can say so instead of
//     silently paying the wrong person.
//   - anything else (remove_ads, book_purchase, or a tip with no
//     purposeRefId) → the founder's own UPI ID from server-only env vars.
//     Never NEXT_PUBLIC_-prefixed: nothing about this needs to be in the
//     client bundle, the API response carries it.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { amountPaise?: number; purpose?: string; purposeRefId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { amountPaise, purpose, purposeRefId } = body;

  if (!amountPaise || !Number.isInteger(amountPaise) || amountPaise <= 0) {
    return NextResponse.json({ error: 'amountPaise must be a positive integer.' }, { status: 400 });
  }
  if (!purpose || typeof purpose !== 'string') {
    return NextResponse.json({ error: 'purpose is required.' }, { status: 400 });
  }

  let vpa: string | null = null;
  let payeeName: string | null = null;

  if (purpose === 'tip' && purposeRefId) {
    const { data: payout } = await auth.supabase
      .rpc('get_creator_payout_vpa', { target_user_id: purposeRefId })
      .maybeSingle<{ upi_id: string | null; display_name: string | null }>();
    vpa = payout?.upi_id ?? null;
    payeeName = payout?.display_name ?? null;
    if (!vpa) {
      return NextResponse.json(
        { error: "This creator hasn't set up UPI payouts yet." },
        { status: 400 }
      );
    }
  } else {
    vpa = process.env.FOUNDER_UPI_ID ?? null;
    payeeName = process.env.FOUNDER_UPI_NAME ?? 'MANGAL';
    if (!vpa) {
      return NextResponse.json({ error: 'UPI payments are not set up yet.' }, { status: 503 });
    }
  }

  const referenceNote = generateReferenceCode();

  const { data: row, error: insertError } = await auth.supabase
    .from('payments')
    .insert({
      user_id: auth.userId,
      // No real gateway order exists for this rail — a unique placeholder
      // satisfies the NOT NULL UNIQUE constraint the Razorpay flow needs,
      // same trick create-order uses before its real order_id comes back.
      razorpay_order_id: `upi_direct_${crypto.randomUUID()}`,
      amount_paise: amountPaise,
      purpose,
      purpose_ref_id: purposeRefId ?? null,
      requested_method: 'upi',
      vpa,
      reference_note: referenceNote,
    })
    .select('id')
    .single();

  if (insertError || !row) {
    return NextResponse.json({ error: insertError?.message ?? 'Could not start payment.' }, { status: 500 });
  }

  return NextResponse.json({
    paymentId: row.id,
    vpa,
    payeeName,
    amountPaise,
    referenceNote,
  });
}
