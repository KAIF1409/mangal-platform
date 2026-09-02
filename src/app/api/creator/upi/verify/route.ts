import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/auth/authedServerClient';

// §141 — step 2 of creator UPI payout setup. Confirms the code emailed by
// request-code. On match, sets upi_verified_at — this is what
// get_creator_payout_vpa() checks before a tip resolves to this creator's
// UPI ID instead of erroring out.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const code = (body.code ?? '').trim();
  if (!code) {
    return NextResponse.json({ error: 'Enter the code from your email.' }, { status: 400 });
  }

  const { data: row, error: rowError } = await auth.supabase
    .from('creator_profiles')
    .select('upi_verification_code')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: 'No pending verification found.' }, { status: 404 });
  }
  if (!row.upi_verification_code) {
    return NextResponse.json({ error: 'No pending verification — request a new code first.' }, { status: 400 });
  }
  if (row.upi_verification_code !== code) {
    return NextResponse.json({ error: 'That code doesn\'t match. Check your email and try again.' }, { status: 400 });
  }

  const { error: updateError } = await auth.supabase
    .from('creator_profiles')
    .update({ upi_verification_code: null, upi_verified_at: new Date().toISOString() })
    .eq('user_id', auth.userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
