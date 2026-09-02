import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../lib/auth/authedServerClient';

// §141 — called when the payer taps "I've paid" after using the UPI QR /
// deep link from create-upi-intent. This is NOT proof of payment — there's
// no gateway callback for a raw UPI transfer — so it only moves the row
// from 'created' to 'pending_manual_verification' and timestamps it.
// Nothing is granted here (no ads_removed flip, no book_purchase row);
// that only happens once an admin reconciles it via
// /api/admin/payments/verify-upi. See the migration's header comment for
// why this two-step, honest-about-its-limits flow is the right shape for
// a personal-UPI rail with no merchant gateway behind it.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { paymentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!body.paymentId) {
    return NextResponse.json({ error: 'paymentId is required.' }, { status: 400 });
  }

  const { data: row, error: rowError } = await auth.supabase
    .from('payments')
    .select('id, status')
    .eq('id', body.paymentId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: 'No matching payment found.' }, { status: 404 });
  }
  if (row.status === 'captured') {
    return NextResponse.json({ ok: true, alreadyCaptured: true });
  }
  if (row.status !== 'created') {
    return NextResponse.json({ error: `Payment is already ${row.status}.` }, { status: 400 });
  }

  const { error: updateError } = await auth.supabase
    .from('payments')
    .update({ status: 'pending_manual_verification', paid_reported_at: new Date().toISOString() })
    .eq('id', row.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
