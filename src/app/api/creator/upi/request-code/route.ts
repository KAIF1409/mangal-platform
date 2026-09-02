import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/auth/authedServerClient';
import { isValidUpiId, isValidIndianPhone } from '../../../../lib/payments/upi';
import { sendUpiVerificationCodeEmail } from '../../../../lib/email';

// §141 — step 1 of creator UPI payout setup. Validates format, stores the
// (unverified) upi_id/upi_phone, generates a 6-digit code, and emails it
// to the address on the creator's own auth account — same "prove you can
// read mail sent to the account you're logged in as" scope as the rest of
// this migration's header comment. Not a bank-identity check.
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { upiId?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const upiId = (body.upiId ?? '').trim();
  const phone = (body.phone ?? '').trim();

  if (!isValidUpiId(upiId)) {
    return NextResponse.json({ error: 'That doesn\'t look like a valid UPI ID (e.g. name@bank).' }, { status: 400 });
  }
  if (!isValidIndianPhone(phone)) {
    return NextResponse.json({ error: 'Enter a valid 10-digit Indian mobile number.' }, { status: 400 });
  }

  const { data: userData } = await auth.supabase.auth.getUser();
  const email = userData?.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'Your account has no email on file to verify against.' }, { status: 400 });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));

  const { error: updateError } = await auth.supabase
    .from('creator_profiles')
    .update({
      upi_id: upiId,
      upi_phone: phone,
      upi_verification_code: code,
      upi_verification_sent_at: new Date().toISOString(),
      upi_verified_at: null, // re-entering resets verification — the old upi_id is no longer trusted for payouts until re-confirmed
    })
    .eq('user_id', auth.userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const sent = await sendUpiVerificationCodeEmail(email, code);
  if (!sent.ok) {
    return NextResponse.json({ error: 'Could not send verification email. Try again shortly.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, emailedTo: email });
}
