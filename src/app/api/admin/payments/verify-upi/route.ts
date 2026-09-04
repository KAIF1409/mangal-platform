import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from '../../../../lib/auth/authedServerClient';
import { isDeveloperRole } from '../../../../lib/auth/roles';
import { applyPaymentGrant } from '../../../../lib/payments/grantPayment';

// §141 — the manual half of the direct-UPI rail. Since a raw UPI transfer
// has no gateway callback, this is the only way a direct-UPI `payments`
// row ever becomes 'captured': a developer-role account (the founder, or
// later a creator settling their own tips) checks their actual UPI
// app/bank statement for the amount + reference_note, and confirms it
// here. Same developer-role gate as /api/admin/migrate-media.
//
//   curl -X POST https://<domain>/api/admin/payments/verify-upi \
//     -H "Authorization: Bearer <session-access-token>" \
//     -H "Content-Type: application/json" -d '{"paymentId":"..."}'
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', auth.userId).single();
  if (!isDeveloperRole(profile?.role)) {
    return NextResponse.json({ error: 'Developer access only.' }, { status: 403 });
  }

  let body: { paymentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!body.paymentId) {
    return NextResponse.json({ error: 'paymentId is required.' }, { status: 400 });
  }

  const { data: row, error: rowError } = await supabaseAdmin
    .from('payments')
    .select('id, user_id, status, purpose, purpose_ref_id, amount_paise, reference_note, vpa')
    .eq('id', body.paymentId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: 'No matching payment found.' }, { status: 404 });
  }
  if (row.status === 'captured') {
    return NextResponse.json({ ok: true, alreadyCaptured: true });
  }

  // FIX: only a row the payer has actually self-reported as paid
  // ('pending_manual_verification', set when they tap "I've paid" on the
  // UPI intent) is eligible to be captured here. Without this guard, a
  // mistyped/wrong paymentId sitting in 'created' (or 'authorized',
  // 'failed', 'refunded') — i.e. the payer never even claimed to pay, or
  // the row is already resolved some other way — could still be flipped
  // to 'captured' and granted, handing out access nobody paid for.
  if (row.status !== 'pending_manual_verification') {
    return NextResponse.json(
      { error: `Payment is in '${row.status}' status, not awaiting manual verification. Refusing to capture.` },
      { status: 409 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from('payments')
    .update({ status: 'captured' })
    .eq('id', row.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await applyPaymentGrant(supabaseAdmin, supabaseAdmin, row);

  return NextResponse.json({ ok: true });
}

// Lists rows awaiting manual reconciliation, oldest first — what the
// (still-to-build) admin dashboard list view would call. Kept here rather
// than a separate route since it's the natural companion query to the
// POST above.
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', auth.userId).single();
  if (!isDeveloperRole(profile?.role)) {
    return NextResponse.json({ error: 'Developer access only.' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('id, user_id, purpose, purpose_ref_id, amount_paise, reference_note, vpa, paid_reported_at')
    .eq('status', 'pending_manual_verification')
    .order('paid_reported_at', { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pending: data ?? [] });
}
