import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendParentConsentEmail } from '@/app/lib/email';
import { checkRateLimit, getClientIp } from '@/app/lib/rateLimit';

// Service-role client — server-only, NEVER expose this key to the client.
// This is the only place (along with confirm-parent-consent) allowed to
// write account_active / parent_consent_* now that those columns are
// locked to service_role by the protect_profile_privileged_columns trigger.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Loose but real email check — good enough to reject typos/garbage before
// we spend a Resend send on it. Not meant to be RFC-perfect.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlausibleDob(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now(); // not in the future
}

// This route is the single place that decides date_of_birth, account_active,
// and the parent-consent columns for a freshly-onboarding user. It used to
// be split across client-side `supabase.from('profiles').update(...)` calls
// (in login/page.tsx) that raced against — and were meant to be blocked by —
// the privileged-columns trigger. Centralizing here means:
//   - minor/adult status is decided from the DOB the server received, never
//     trusted from a client-supplied boolean
//   - account_active can only ever become true through server code
//   - the parent-consent token is generated server-side, never accepted
//     from the client
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // Throttle before doing any auth/DB work - this route sends a real email
  // per call, so it's a resource to protect regardless of auth status.
  const withinLimit = await checkRateLimit(supabaseAdmin, `send-parent-consent:${ip}`, 5, 300);
  if (!withinLimit) {
    return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { dateOfBirth, parentEmail } = (body ?? {}) as {
    dateOfBirth?: unknown;
    parentEmail?: unknown;
  };

  if (!isPlausibleDob(dateOfBirth)) {
    return NextResponse.json({ error: 'Missing or invalid dateOfBirth.' }, { status: 400 });
  }

  // Authenticate the caller from their own session token — this route acts
  // on "the currently signed-in user", never on an id passed in the body.
  const authHeader = req.headers.get('authorization') ?? '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: 'Missing Authorization header.' }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 });
  }
  const userId = userData.user.id;

  // Recompute minor status from the DOB ourselves — never trust a client
  // "minorDetected" flag, since that's exactly the kind of value a
  // malicious client would flip to skip the consent flow.
  const eighteenYearsAgo = new Date();
  eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
  const dob = new Date(dateOfBirth);
  const isMinor = dob.getTime() > eighteenYearsAgo.getTime();

  if (isMinor) {
    if (typeof parentEmail !== 'string' || !EMAIL_RE.test(parentEmail)) {
      return NextResponse.json(
        { error: "A valid parent/guardian email is required for accounts under 18." },
        { status: 400 }
      );
    }

    const consentToken = crypto.randomUUID();

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        date_of_birth: dateOfBirth,
        parent_email: parentEmail,
        parent_consent_status: 'pending',
        parent_consent_token: consentToken,
        parent_consent_email_sent_at: new Date().toISOString(),
        account_active: false,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[send-parent-consent] profile update failed:', updateError);
      return NextResponse.json({ error: 'Could not update profile.' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const emailResult = await sendParentConsentEmail(parentEmail, consentToken, appUrl);
    if (!emailResult.ok) {
      // Profile is already saved as pending — the user can be re-sent the
      // email later. Don't fail the whole request just because Resend had
      // an issue; that's a delivery problem, not a data problem.
      console.error('[send-parent-consent] email send failed:', emailResult.error);
    }

    return NextResponse.json({ ok: true, minorDetected: true, emailSent: emailResult.ok });
  }

  // Adult — activate immediately, no consent flow needed.
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      date_of_birth: dateOfBirth,
      parent_email: null,
      parent_consent_status: 'not_required',
      parent_consent_token: null,
      account_active: true,
    })
    .eq('id', userId);

  if (updateError) {
    console.error('[send-parent-consent] profile update failed:', updateError);
    return NextResponse.json({ error: 'Could not update profile.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, minorDetected: false });
}
