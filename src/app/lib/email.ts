// lib/email.ts
//
// Step 19 — Parent consent email via Resend.
// Step 25 — New chapter notification email via Resend.
//
// SETUP:
//   1. Add RESEND_API_KEY=re_xxxx to .env.local
//   2. Add the same key to Vercel → Project → Settings → Environment Variables
//
// DOMAIN NOTE:
//   Currently sends from onboarding@resend.dev (Resend's shared test domain).
//   Once you have a real domain (e.g. mangal.in), go to resend.com/domains,
//   verify it, then change FROM_ADDRESS below to noreply@yourdomain.com.
//
// USAGE: call send* functions from a Next.js API route or
//   server action — NEVER from client code (key would be exposed).

const RESEND_API_URL = 'https://api.resend.com/emails';

// Change this once you have a verified domain on Resend:
const FROM_ADDRESS = 'MANGAL <onboarding@resend.dev>';

export async function sendParentConsentEmail(
  parentEmail: string,
  consentToken: string,
  appUrl: string  // pass process.env.NEXT_PUBLIC_APP_URL from the API route
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY is not set');
    return { ok: false, error: 'Email service not configured' };
  }

  // Points straight at the server-side confirm route (GET, one click = one
  // deliberate confirm action, then redirects to /parent-consent-result).
  // Previously pointed at a client page that tried to update `profiles`
  // directly with the anon key — that only ever worked because of an
  // overly-permissive "by token" RLS policy which has since been removed,
  // so that page was dead code sitting on a stale, unsafe pattern.
  const confirmUrl = `${appUrl}/api/confirm-parent-consent?token=${consentToken}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#07070a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07070a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#0d0d14;border:1px solid #1a1a26;border-radius:16px;padding:40px 36px;">
        <tr><td>
          <!-- Logo -->
          <div style="text-align:center;margin-bottom:28px;">
            <span style="font-size:32px;">&#9889;</span>
            <h1 style="font-size:28px;font-weight:900;color:#fff;margin:8px 0 4px;letter-spacing:-0.03em;">MANGAL</h1>
            <p style="font-size:11px;color:#6b7280;margin:0;letter-spacing:0.12em;text-transform:uppercase;">India's Manga Platform</p>
          </div>

          <!-- Divider -->
          <div style="height:1px;background:linear-gradient(to right,transparent,#dc2626,transparent);margin-bottom:28px;"></div>

          <!-- Body -->
          <h2 style="font-size:18px;font-weight:800;color:#fff;margin:0 0 12px;">Your child wants to join MANGAL</h2>
          <p style="font-size:13px;color:#9ca3af;line-height:1.75;margin:0 0 20px;">
            Someone used this email address as a parent or guardian contact when signing up for MANGAL.
            Because the account belongs to someone under 18, Indian law (the <strong style="color:#d97706;">DPDP Act, 2023</strong>)
            requires your confirmation before the account can be activated.
          </p>

          <!-- What we promise -->
          <div style="background:rgba(217,119,6,0.08);border:1px solid rgba(217,119,6,0.2);border-radius:10px;padding:16px 18px;margin-bottom:24px;">
            <p style="font-size:12px;color:#d97706;font-weight:700;margin:0 0 8px;">Our commitments for minor accounts:</p>
            <ul style="font-size:12px;color:#9ca3af;line-height:1.8;margin:0;padding-left:18px;">
              <li>No targeted advertising</li>
              <li>No behavioural profiling from reading activity</li>
              <li>Data stored securely, never sold to third parties</li>
              <li>Account can be deleted by you at any time via grievance@mangal.in</li>
            </ul>
          </div>

          <!-- CTA -->
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${confirmUrl}"
               style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#7f1d1d,#b45309);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.04em;">
              Confirm my child's account
            </a>
          </div>

          <p style="font-size:11px;color:#6b7280;line-height:1.6;margin:0 0 8px;">
            If you did not expect this email, you can safely ignore it — no account will be activated without your click.
          </p>
          <p style="font-size:11px;color:#6b7280;line-height:1.6;margin:0;">
            Or copy this link into your browser:<br/>
            <span style="color:#d97706;word-break:break-all;">${confirmUrl}</span>
          </p>

          <!-- Footer -->
          <div style="height:1px;background:#1a1a26;margin:28px 0 20px;"></div>
          <p style="font-size:10px;color:#374151;text-align:center;margin:0;">
            © 2026 MANGAL Corp · India's Own Platform ·
            <a href="https://mangal.in/privacy" style="color:#374151;">Privacy Policy</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [parentEmail],
        subject: "Confirm your child's MANGAL account",
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[email] Resend error:', body);
      return { ok: false, error: body };
    }

    return { ok: true };
  } catch (err) {
    console.error('[email] fetch error:', err);
    return { ok: false, error: String(err) };
  }
}
// ── Step 25 — New Chapter Notification ──────────────────────────────────────
//
// Called from app/api/notify-followers/route.ts after a chapter is published.
// Sends one email per follower who has email_notifications enabled.
// Fire-and-forget from the upload page — publish does NOT block on this.
//
// Resend free tier: 3,000 emails/month, 100/day. Sufficient for MVP.
// If follower count grows past ~100/day, batch or queue here.

export async function sendNewChapterEmail(
  toEmail: string,
  seriesTitle: string,
  chapterNumber: number,
  chapterTitle: string,
  seriesId: string,
  chapterId: string,
  appUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY is not set');
    return { ok: false, error: 'Email service not configured' };
  }

  const chapterLabel = chapterTitle
    ? `Chapter ${chapterNumber} — ${chapterTitle}`
    : `Chapter ${chapterNumber}`;

  const readUrl = `${appUrl}/read/${chapterId}`;
  const seriesUrl = `${appUrl}/series/${seriesId}`;
  // Unsubscribe = reader goes to their library/settings to manage follows.
  // A full unsubscribe token flow is deferred — for MVP, link to settings page.
  const unsubUrl = `${appUrl}/settings`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#07070a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07070a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#0d0d14;border:1px solid #1a1a26;border-radius:16px;padding:40px 36px;">
        <tr><td>
          <!-- Logo -->
          <div style="text-align:center;margin-bottom:28px;">
            <span style="font-size:32px;">&#9889;</span>
            <h1 style="font-size:28px;font-weight:900;color:#fff;margin:8px 0 4px;letter-spacing:-0.03em;">MANGAL</h1>
            <p style="font-size:11px;color:#6b7280;margin:0;letter-spacing:0.12em;text-transform:uppercase;">India's Manga Platform</p>
          </div>

          <!-- Divider -->
          <div style="height:1px;background:linear-gradient(to right,transparent,#dc2626,transparent);margin-bottom:28px;"></div>

          <!-- Headline -->
          <p style="font-size:12px;color:#d97706;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px;">New Chapter Alert</p>
          <h2 style="font-size:22px;font-weight:900;color:#fff;margin:0 0 6px;line-height:1.2;">${seriesTitle}</h2>
          <p style="font-size:14px;color:#9ca3af;margin:0 0 28px;">${chapterLabel} is now live!</p>

          <!-- CTA -->
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${readUrl}"
               style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#7f1d1d,#991b1b);color:#fff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.04em;">
              Read Now
            </a>
          </div>

          <!-- Series link -->
          <p style="font-size:12px;color:#6b7280;text-align:center;margin:0 0 4px;">
            Or view all chapters:
          </p>
          <p style="font-size:12px;text-align:center;margin:0 0 28px;">
            <a href="${seriesUrl}" style="color:#d97706;text-decoration:none;">${seriesTitle} — Series Page →</a>
          </p>

          <!-- Footer -->
          <div style="height:1px;background:#1a1a26;margin-bottom:20px;"></div>
          <p style="font-size:10px;color:#374151;text-align:center;margin:0;">
            © 2026 MANGAL Corp · You're receiving this because you follow ${seriesTitle}. ·
            <a href="${unsubUrl}" style="color:#374151;">Manage notifications</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [toEmail],
        subject: `New chapter: ${seriesTitle} — ${chapterLabel}`,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[email] Resend error:', body);
      return { ok: false, error: body };
    }

    return { ok: true };
  } catch (err) {
    console.error('[email] fetch error:', err);
    return { ok: false, error: String(err) };
  }
}