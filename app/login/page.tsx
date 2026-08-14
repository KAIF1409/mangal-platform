'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { isMinor, isPlausibleDateOfBirth, PARENT_CONSENT_PENDING_COPY } from '../lib/dpdp';
import { setPostLoginRedirect } from '../lib/authRedirect';

// 'dob'     = Google OAuth new users — skipped register form so no DOB yet
// 'pending' = minor whose parent hasn't confirmed yet
type Mode = 'login' | 'register' | 'dob' | 'role' | 'pending';

// ── Full-screen background image layer ──────────────────────────────────────
// Drop your generated image at /public/bg-aryavarta.jpg (any name works,
// just update the path below). This layer fits ANY screen size: it covers
// the full viewport, never repeats, stays centered, and is pinned behind
// everything else with a dark overlay so text stays readable.
// Tries common extensions in order until one actually loads, so you can
// drop in bg-aryavarta.png OR .jpg OR .jpeg OR .webp without touching code.
const BG_CANDIDATES = ['/bg-aryavarta.png', '/bg-aryavarta.jpg', '/bg-aryavarta.jpeg', '/bg-aryavarta.webp'];

function useFirstWorkingImage(candidates: string[]) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const path of candidates) {
        const ok = await new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = path;
        });
        if (ok && !cancelled) {
          setSrc(path);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidates]);
  return src;
}

function CosmicBackground() {
  const src = useFirstWorkingImage(BG_CANDIDATES);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        backgroundImage: src ? `url(${src})` : undefined,
        backgroundColor: '#08070a',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
      className="cosmic-bg-layer"
    />
  );
}

// Dark gradient overlay so text stays legible over the photo regardless of
// its brightness. Slightly flatter than a marketing-site hero so the auth
// form reads as the primary surface, not an accessory sitting on top of art.
function CosmicOverlay() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background:
          'linear-gradient(180deg, rgba(8,7,10,0.72) 0%, rgba(8,7,10,0.6) 25%, rgba(8,7,10,0.85) 55%, rgba(8,7,10,0.96) 100%)',
        pointerEvents: 'none',
      }}
    />
  );
}

// ── Icon set ─────────────────────────────────────────────────────────────────
// A single consistent stroke-icon system replaces the emoji glyphs used
// throughout the previous version. currentColor + 1.6px stroke everywhere
// so icons always match the surrounding text color and weight.
function IconBase({
  size = 16,
  children,
}: {
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const IconFlame = ({ size = 20 }: { size?: number }) => (
  <IconBase size={size}>
    <path d="M12 2.5c1.2 2.6-.6 4-.6 6.2 0 1.3 1 2.3 2.3 2.3 1.1 0 1.9-.7 2.1-1.7 1.4 1.6 2.2 3.6 2.2 5.6 0 4-3.1 7.1-6.9 6.9-3.6-.2-6.4-3.3-6.1-7 .2-2.5 1.5-4 2.6-5.6.4 1 1.3 1.5 2.1 1.2.9-.3 1.2-1.2.8-2.2C9.5 6.4 10.6 4.3 12 2.5Z" />
  </IconBase>
);
const IconArrowRight = ({ size = 14 }: { size?: number }) => (
  <IconBase size={size}>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </IconBase>
);
const IconCheck = ({ size = 15 }: { size?: number }) => (
  <IconBase size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.3l2.3 2.3 4.7-4.9" />
  </IconBase>
);
const IconAlert = ({ size = 15 }: { size?: number }) => (
  <IconBase size={size}>
    <path d="M10.6 3.9 2.9 17.3a1.6 1.6 0 0 0 1.4 2.4h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z" />
    <path d="M12 9.5v4" />
    <path d="M12 16.7h.01" />
  </IconBase>
);
const IconShield = ({ size = 15 }: { size?: number }) => (
  <IconBase size={size}>
    <path d="M12 3.2 5 5.7v5.4c0 4.5 2.9 7.9 7 9.7 4.1-1.8 7-5.2 7-9.7V5.7L12 3.2Z" />
    <path d="M9.2 12l1.9 1.9L15 10" />
  </IconBase>
);
const IconClock = ({ size = 26 }: { size?: number }) => (
  <IconBase size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </IconBase>
);
const IconBook = ({ size = 22 }: { size?: number }) => (
  <IconBase size={size}>
    <path d="M4 5.2c1.8-.9 4-1.2 5.8-.3 1 .5 1.7 1.3 2.2 2.1.5-.8 1.2-1.6 2.2-2.1 1.8-.9 4-.6 5.8.3v12.6c-1.8-.9-4-1.2-5.8-.3-1 .5-1.7 1.3-2.2 2.1-.5-.8-1.2-1.6-2.2-2.1-1.8-.9-4-.6-5.8.3V5.2Z" />
    <path d="M12 7v12.6" />
  </IconBase>
);
const IconPen = ({ size = 22 }: { size?: number }) => (
  <IconBase size={size}>
    <path d="M14.5 4.5 19.5 9.5 8 21H3v-5L14.5 4.5Z" />
    <path d="M12.5 6.5 17.5 11.5" />
  </IconBase>
);

// ── Wordmark ─────────────────────────────────────────────────────────────────
// A monogram mark rather than an emoji: a flame glyph rendered in-brand,
// same treatment at every size so it reads as a real logo, not a sticker.
function LogoMark({ size = 48 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: 'linear-gradient(145deg, #6b1d1d 0%, #9a5b1b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: '#fce8c9',
        boxShadow: `0 1px 0 rgba(255,255,255,0.12) inset, 0 ${size * 0.12}px ${size * 0.4}px rgba(0,0,0,0.5)`,
      }}
    >
      <IconFlame size={size * 0.5} />
    </div>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────
function AnimInput({
  label,
  type,
  placeholder,
  value,
  onChange,
  hint,
}: {
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: '10.5px',
          fontWeight: 600,
          color: focused ? '#e0ac5f' : '#9a938c',
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          marginBottom: '6px',
          transition: 'color 0.2s',
        }}
      >
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          padding: '12px 14px',
          borderRadius: '10px',
          background: 'rgba(12,10,9,0.55)',
          border: `1px solid ${focused ? '#a1650f' : 'rgba(255,255,255,0.11)'}`,
          color: '#f4f1ec',
          fontSize: '13.5px',
          outline: 'none',
          boxSizing: 'border-box' as const,
          transition: 'border-color 0.15s, box-shadow 0.15s',
          boxShadow: focused ? '0 0 0 3px rgba(180,120,30,0.14)' : 'none',
        }}
      />
      {hint && (
        <p style={{ fontSize: '11px', color: 'rgba(212,207,199,0.55)', marginTop: '5px', marginBottom: 0, lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '20px 24px',
        textAlign: 'center',
        position: 'relative' as const,
        zIndex: 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' as const }}>
        {[
          { label: 'Home', href: '/' },
          { label: 'Privacy Policy', href: '/privacy' },
          { label: 'Terms of Service', href: '/terms' },
          { label: 'Grievance Officer', href: '/grievance' },
        ].map((link) => (
          <a key={link.href} href={link.href} style={{ fontSize: '11px', color: 'rgba(226,220,209,0.48)', textDecoration: 'none' }}>
            {link.label}
          </a>
        ))}
      </div>
    </footer>
  );
}

// ── Google SVG ───────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
  </svg>
);

// ── Shared glass card wrapper ────────────────────────────────────────────────
// One quiet accent (a hairline in the brand gradient) instead of the previous
// glow lines + corner flourish. Restraint is the point.
function GlassCard({
  children,
  maxWidth = 440,
  visible,
}: {
  children: React.ReactNode;
  maxWidth?: number;
  visible: boolean;
}) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth,
        background: 'rgba(17,14,13,0.68)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '18px',
        // clamp() instead of a fixed '36px 34px' — on a ~320–360px phone,
        // GlassCard's own maxWidth cap can still leave very little room
        // once this padding is subtracted twice from the viewport, making
        // input fields/buttons feel cramped. Shrinks smoothly down to 20px
        // on narrow phones, unchanged (36/34px) from ~600px up.
        padding: 'clamp(22px, 6vw, 36px) clamp(18px, 5.5vw, 34px)',
        position: 'relative',
        boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
        backdropFilter: 'blur(18px) saturate(120%)',
        WebkitBackdropFilter: 'blur(18px) saturate(120%)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(14px)',
        transition: 'opacity 0.35s ease, transform 0.35s ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          borderRadius: '18px 18px 0 0',
          background: 'linear-gradient(90deg, #6b1d1d, #a1650f)',
          opacity: 0.85,
        }}
      />
      {children}
    </div>
  );
}

// ── Status banners ───────────────────────────────────────────────────────────
function Banner({ tone, icon, children }: { tone: 'error' | 'success' | 'warn'; icon: React.ReactNode; children: React.ReactNode }) {
  const palette = {
    error: { bg: 'rgba(185,60,52,0.12)', border: 'rgba(185,60,52,0.32)', color: '#e79b93' },
    success: { bg: 'rgba(70,150,110,0.12)', border: 'rgba(70,150,110,0.32)', color: '#8fcdab' },
    warn: { bg: 'rgba(161,101,15,0.14)', border: 'rgba(161,101,15,0.35)', color: '#e0ac5f' },
  }[tone];
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: '10px',
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        fontSize: '12.5px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '9px',
        lineHeight: 1.5,
      }}
    >
      <span style={{ marginTop: '1px', flexShrink: 0 }}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '13px',
        marginTop: '4px',
        background: disabled ? 'rgba(255,255,255,0.07)' : 'linear-gradient(135deg, #6b1d1d 0%, #7d2a1c 55%, #a1650f 100%)',
        border: 'none',
        borderRadius: '10px',
        color: disabled ? 'rgba(226,220,209,0.45)' : '#fff',
        fontSize: '13.5px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 6px 20px rgba(90,35,20,0.4)',
        transition: 'transform 0.15s, box-shadow 0.15s',
        letterSpacing: '0.01em',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = '';
      }}
    >
      {children}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [dateOfBirth, setDateOfBirth] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [dobError, setDobError] = useState<string | null>(null);
  const minorDetected = dateOfBirth ? isMinor(dateOfBirth) : false;

  // Track card entry animation
  const [cardVisible, setCardVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCardVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Re-trigger card animation on mode change
  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setMessage('');
    setDobError(null);
  };

  // Where to send the user after a successful login — read from
  // /login?next=..., defaults to /home. Threaded through Google OAuth's
  // redirectTo (as a query param on /auth/callback) and used directly for
  // email/password login, so e.g. clicking "Log in" from /katube/upload
  // actually returns you to /katube/upload instead of always landing on
  // /home.
  //
  // IMPORTANT: read via useState's lazy initializer (runs synchronously
  // during the client render, before any paint), NOT inside a useEffect.
  // The previous version set this via useEffect + setTimeout(0), which is
  // asynchronous — if the user clicked "Continue with Google" before that
  // timeout fired (which turned out to happen most of the time in
  // practice, not just occasionally), handleGoogleLogin would close over
  // the still-default '/home' and silently drop the intended return path.
  // A lazy initializer has no such window: it's guaranteed to have run
  // before the button is even interactive.
  const [nextPath] = useState(() => {
    if (typeof window === 'undefined') return '/home';
    const raw = new URLSearchParams(window.location.search).get('next');
    return raw && /^\/(?!\/|\\)/.test(raw) ? raw : '/home';
  });

  // Surface errors that /auth/callback redirects back with (e.g. Google
  // sign-in was cancelled, or exchangeCodeForSession failed) — previously
  // this arrived as a silent ?error=... query param with nothing shown to
  // the user, so a real failure just looked like the login page reloading.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hadNext = !!params.get('next');
    const oauthError = params.get('error');

    const FRIENDLY_ERRORS: Record<string, string> = {
      session_exchange_failed:
        "Google sign-in didn't finish — this can happen if your browser blocked or cleared cookies during the redirect. Try again, or sign in with email below.",
      missing_code:
        'Something interrupted the Google sign-in before it could finish. Please try again.',
      flow_state_already_used:
        'That sign-in attempt already expired — this can happen after a double-click or clicking Continue with Google twice. Please try again.',
    };

    const t = setTimeout(() => {
      if (oauthError) setError(FRIENDLY_ERRORS[oauthError] || decodeURIComponent(oauthError));
    }, 0);

    // Clean the URL so a refresh or back-navigation doesn't re-show the
    // error or resubmit it. (next was already captured into state above via
    // the lazy initializer, so it's safe to strip here.)
    if (oauthError || hadNext) window.history.replaceState({}, '', '/login');

    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarded, account_active, date_of_birth')
        .eq('id', data.session.user.id)
        .single();
      if (!profile) return;
      // Minor blocked — parent hasn't confirmed yet
      if (profile.account_active === false) { setMode('pending'); return; }
      if (!profile.onboarded) {
        // Google OAuth users land here without a DOB — collect it first
        setMode(profile.date_of_birth ? 'role' : 'dob');
        return;
      }
      window.location.href = nextPath;
    };
    checkSession();
  }, [nextPath]);

  const handleRegister = async () => {
    if (!email || !password || !name) {
      setError('Please fill in all fields.');
      return;
    }
    setDobError(null);
    if (!isPlausibleDateOfBirth(dateOfBirth)) {
      setDobError('Please enter a valid date of birth.');
      return;
    }
    if (minorDetected && !parentEmail) {
      setDobError("A parent or guardian's email is required for accounts under 18.");
      return;
    }
    setLoading(true);
    setError('');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }
    const newUserId = signUpData.user?.id;
    if (newUserId) {
      const parentConsentToken = minorDetected ? crypto.randomUUID() : null;
      await supabase
        .from('profiles')
        .update({
          date_of_birth: dateOfBirth,
          parent_email: minorDetected ? parentEmail : null,
          parent_consent_status: minorDetected ? 'pending' : 'not_required',
          parent_consent_token: parentConsentToken,
          parent_consent_sent_at: minorDetected ? new Date().toISOString() : null,
          account_active: !minorDetected,
        })
        .eq('id', newUserId);
      if (minorDetected && parentConsentToken) {
        await fetch('/api/send-parent-consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentEmail, consentToken: parentConsentToken }),
        });
        setLoading(false);
        setMode('pending');
        return;
      }
    }
    setMessage('Verification email sent. Check your inbox.');
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('onboarded, account_active').eq('id', data.user.id).single();
    if (profile && profile.account_active === false) {
      await supabase.auth.signOut();
      setLoading(false);
      setMode('pending');
      return;
    }
    if (profile && !profile.onboarded) setMode('role');
    else window.location.href = nextPath;
    setLoading(false);
  };

  // Forgot-password — sends a Supabase reset-password email to whatever's
  // currently typed in the Email field. Deliberately reuses the same
  // `error`/`message` banners the rest of the form already has rather than
  // a separate screen/mode, since it's a one-field, one-action flow.
  const [forgotLoading, setForgotLoading] = useState(false);
  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your email above first, then tap "Forgot password?".');
      return;
    }
    setForgotLoading(true);
    setError('');
    setMessage('');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setForgotLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setMessage(`If an account exists for ${email}, a reset link is on its way.`);
  };

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleLogin = async () => {
    // Guard against double-clicks / double-submits — each call generates a
    // fresh OAuth `state`/PKCE pair, and Supabase's state token can only be
    // redeemed once. Firing this twice before the first redirect completes
    // produces "invalid_request: flow_state_already_used" on the way back.
    if (isGoogleLoading) return;
    setIsGoogleLoading(true);
    setError('');
    // Always use the actual browser origin, not NEXT_PUBLIC_APP_URL — this
    // only ever runs client-side (inside a click handler), so
    // window.location.origin is guaranteed correct for whatever domain the
    // user is actually on. NEXT_PUBLIC_APP_URL is a build-time env var on
    // Vercel; if it's set to something stale (e.g. http://localhost:3000,
    // left over from local dev), it would silently override this and send
    // every production OAuth redirect to localhost instead of the live
    // site — which is exactly what was happening (confirmed 11 Aug 2026).
    //
    // callbackUrl must stay query-string-free: Supabase's Redirect URL
    // allowlist matches redirectTo EXACTLY, so appending ?next=... here
    // makes it fail that match and silently fall back to the Site URL
    // (root) with the code still attached — a second, separate bug from
    // the localhost one above, also confirmed 11 Aug 2026. `next` goes
    // through a short-lived cookie instead (see app/lib/authRedirect.ts).
    if (nextPath && nextPath !== '/home') setPostLoginRedirect(nextPath);
    const callbackUrl = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl } });
    if (error) { setError(error.message); setIsGoogleLoading(false); }
    // On success this navigates away, so no need to reset isGoogleLoading.
  };

  // Google OAuth new users — collect DOB before role selection
  const handleDobSubmit = async () => {
    setDobError(null);
    if (!isPlausibleDateOfBirth(dateOfBirth)) { setDobError('Please enter a valid date of birth.'); return; }
    if (minorDetected && !parentEmail) { setDobError("A parent or guardian's email is required for accounts under 18."); return; }
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setLoading(false); return; }
    const token = minorDetected ? crypto.randomUUID() : null;
    await supabase.from('profiles').update({
      date_of_birth: dateOfBirth,
      parent_email: minorDetected ? parentEmail : null,
      parent_consent_status: minorDetected ? 'pending' : 'not_required',
      parent_consent_token: token,
      parent_consent_sent_at: minorDetected ? new Date().toISOString() : null,
      account_active: !minorDetected,
    }).eq('id', u.user.id);
    if (minorDetected && token) {
      await fetch('/api/send-parent-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentEmail, consentToken: token }),
      });
      setLoading(false); setMode('pending'); return;
    }
    setLoading(false); setMode('role');
  };

  const finishOnboarding = async (choice: 'reader' | 'creator') => {
    const { data: u } = await supabase.auth.getUser();
    if (u.user) await supabase.from('profiles').update({ onboarded: true }).eq('id', u.user.id);
    window.location.assign(choice === 'creator' ? '/become-creator' : nextPath);
  };

  // ── PENDING CONSENT SCREEN ────────────────────────────────────────────────
  if (mode === 'pending')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <CosmicBackground />
        <CosmicOverlay />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 1 }}>
          <GlassCard maxWidth={480} visible={cardVisible}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#e0ac5f', marginBottom: '18px', display: 'flex', justifyContent: 'center' }}>
                <IconClock size={30} />
              </div>
              <h2 style={{ fontSize: '21px', fontWeight: 800, color: '#fff', margin: '0 0 14px', letterSpacing: '-0.01em' }}>
                {PARENT_CONSENT_PENDING_COPY.title}
              </h2>
              <p style={{ fontSize: '13px', color: 'rgba(226,220,209,0.78)', lineHeight: 1.75, margin: '0 0 24px' }}>
                {PARENT_CONSENT_PENDING_COPY.body}
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', textAlign: 'left', padding: '14px 16px', background: 'rgba(161,101,15,0.1)', border: '1px solid rgba(161,101,15,0.28)', borderRadius: '12px', marginBottom: '24px' }}>
                <span style={{ color: '#e0ac5f', marginTop: '1px', flexShrink: 0 }}><IconShield /></span>
                <p style={{ fontSize: '12px', color: '#e0ac5f', margin: 0, lineHeight: 1.6 }}>
                  No targeted ads. No behavioural profiling. This account is protected under the DPDP Act, 2023.
                </p>
              </div>
              <button
                onClick={() => switchMode('login')}
                style={{ background: 'none', border: 'none', color: 'rgba(226,220,209,0.55)', fontSize: '12px', cursor: 'pointer' }}
              >
                ← Back to sign in
              </button>
            </div>
          </GlassCard>
        </main>
        <Footer />
      </div>
    );

  // ── DOB SCREEN (Google OAuth new users only) ──────────────────────────────
  if (mode === 'dob')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <CosmicBackground />
        <CosmicOverlay />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 1 }}>
          <GlassCard maxWidth={420} visible={cardVisible}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <LogoMark size={36} />
              <div>
                <h2 style={{ fontSize: '19px', fontWeight: 800, color: '#fff', margin: 0 }}>One quick thing</h2>
                <p style={{ fontSize: '12px', color: 'rgba(226,220,209,0.55)', margin: '2px 0 0' }}>
                  Required under the DPDP Act, 2023
                </p>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(226,220,209,0.72)', lineHeight: 1.6, marginBottom: '20px' }}>
              Indian law requires age verification before your account is activated. It takes ten seconds.
            </p>

            {dobError && <Banner tone="warn" icon={<IconShield />}>{dobError}</Banner>}

            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '14px' }}>
              <AnimInput
                label="Date of Birth"
                type="date"
                placeholder=""
                value={dateOfBirth}
                onChange={setDateOfBirth}
                hint="Extra protections apply automatically for anyone under 18."
              />
              {minorDetected && (
                <div style={{ background: 'rgba(161,101,15,0.09)', border: '1px solid rgba(161,101,15,0.28)', borderRadius: '12px', padding: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#e0ac5f', margin: '0 0 10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <IconShield size={14} /> Under 18 — a parent&apos;s email is needed
                  </p>
                  <AnimInput
                    label="Parent / Guardian Email"
                    type="email"
                    placeholder="parent@example.com"
                    value={parentEmail}
                    onChange={setParentEmail}
                    hint="We'll send them a confirmation link. No targeted ads or profiling for minors."
                  />
                </div>
              )}
              <PrimaryButton onClick={handleDobSubmit} disabled={loading}>
                {loading ? 'Please wait…' : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>Continue <IconArrowRight /></span>
                )}
              </PrimaryButton>
            </div>
          </GlassCard>
        </main>
        <Footer />
      </div>
    );

  // ── ROLE SELECTION ────────────────────────────────────────────────────────
  if (mode === 'role')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <CosmicBackground />
        <CosmicOverlay />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 1 }}>
          <GlassCard maxWidth={520} visible={cardVisible}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <LogoMark size={40} />
              </div>
              <div style={{ marginTop: '20px' }}>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                    color: '#e0ac5f',
                    background: 'rgba(120,75,20,0.22)',
                    border: '1px solid rgba(161,101,15,0.35)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  Welcome to MANGAL
                </span>
              </div>
              <h2 style={{ fontSize: '27px', fontWeight: 800, color: '#fff', margin: '16px 0 8px', letterSpacing: '-0.01em' }}>How will you use MANGAL?</h2>
              <p style={{ fontSize: '13px', color: 'rgba(226,220,209,0.7)', margin: 0 }}>You can always switch later from settings.</p>
            </div>

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' as const }}>
              {[
                {
                  choice: 'creator' as const,
                  icon: <IconPen size={26} />,
                  title: 'Creator',
                  subtitle: 'I want to publish',
                  desc: 'Upload your Mangal series, build a fanbase, tell India your story.',
                  background: 'rgba(107,29,29,0.22)',
                  border: 'rgba(150,60,50,0.4)',
                  accent: '#e79b93',
                },
                {
                  choice: 'reader' as const,
                  icon: <IconBook size={26} />,
                  title: 'Reader',
                  subtitle: 'I want to explore',
                  desc: "Dive into India's best original comics, free forever.",
                  background: 'rgba(161,101,15,0.18)',
                  border: 'rgba(161,101,15,0.4)',
                  accent: '#e0ac5f',
                },
              ].map((item) => (
                <button
                  key={item.choice}
                  onClick={() => finishOnboarding(item.choice)}
                  style={{
                    flex: '1 1 200px',
                    padding: '26px 20px',
                    background: item.background,
                    border: `1px solid ${item.border}`,
                    borderRadius: '14px',
                    cursor: 'pointer',
                    textAlign: 'left' as const,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 32px rgba(0,0,0,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = '';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
                  }}
                >
                  <div style={{ color: item.accent, marginBottom: '14px' }}>{item.icon}</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{item.title}</div>
                  <div style={{ fontSize: '10px', color: item.accent, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: '10px' }}>
                    {item.subtitle}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'rgba(226,220,209,0.75)', lineHeight: 1.6 }}>{item.desc}</div>
                </button>
              ))}
            </div>

            <p style={{ fontSize: '11px', color: 'rgba(226,220,209,0.42)', marginTop: '20px', marginBottom: 0, textAlign: 'center', lineHeight: 1.6 }}>
              Creators complete a short profile next. Readers go straight to the stories.
            </p>
          </GlassCard>
        </main>
        <Footer />
      </div>
    );

  // ── LOGIN / REGISTER — split screen (form left, hero video right) ────────
  const isLogin = mode !== 'register';
  return (
    <div className="mangal-auth-shell">
      <style>{`
        .mangal-auth-shell {
          min-height: 100vh;
          display: flex;
          background: #08070a;
        }
        .mangal-auth-left {
          flex: 1 1 480px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 40px clamp(24px, 6vw, 88px);
          position: relative;
          z-index: 1;
        }
        .mangal-auth-form-wrap { width: 100%; max-width: 400px; margin: 0 auto; }
        .mangal-auth-tabs {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          border-radius: 10px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          margin-bottom: 28px;
        }
        .mangal-auth-tab {
          border: none;
          background: transparent;
          padding: 8px 18px;
          border-radius: 7px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          color: rgba(226,220,209,0.55);
          transition: background 0.18s, color 0.18s;
        }
        .mangal-auth-tab.active { background: linear-gradient(135deg, #6b1d1d 0%, #a1650f 100%); color: #fff; }
        .mangal-auth-right {
          flex: 1 1 46%;
          position: relative;
          overflow: hidden;
          margin: 14px 14px 14px 0;
          border-radius: 22px;
        }
        .mangal-auth-right video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .mangal-auth-right::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(8,7,10,0.15) 0%, rgba(8,7,10,0.05) 40%, rgba(8,7,10,0.85) 100%);
        }
        .mangal-auth-quote {
          position: absolute;
          left: 24px;
          right: 24px;
          bottom: 24px;
          z-index: 2;
          background: rgba(10,8,8,0.55);
          border: 1px solid rgba(255,255,255,0.14);
          backdrop-filter: blur(14px) saturate(120%);
          -webkit-backdrop-filter: blur(14px) saturate(120%);
          border-radius: 16px;
          padding: 22px 24px;
        }
        @media (max-width: 900px) {
          .mangal-auth-right { display: none; }
          .mangal-auth-left { padding: 32px 20px; }
        }
      `}</style>

      <div className="mangal-auth-left">
        <div className="mangal-auth-form-wrap">
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginBottom: '32px' }}>
            <LogoMark size={34} />
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>MANGAL</span>
          </Link>

          {/* Login / Sign up tabs */}
          <div className="mangal-auth-tabs">
            <button
              className={`mangal-auth-tab${isLogin ? ' active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Log in
            </button>
            <button
              className={`mangal-auth-tab${!isLogin ? ' active' : ''}`}
              onClick={() => switchMode('register')}
            >
              Sign up
            </button>
          </div>

          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#fff', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h1>
          <p style={{ fontSize: '13px', color: 'rgba(226,220,209,0.6)', margin: '0 0 26px' }}>
            {isLogin ? 'Enter your details to sign in.' : 'Free forever — start reading or publishing in a minute.'}
          </p>

          {/* Error / success banners */}
          {error && <Banner tone="error" icon={<IconAlert />}>{error}</Banner>}
          {message && <Banner tone="success" icon={<IconCheck />}>{message}</Banner>}
          {dobError && <Banner tone="warn" icon={<IconShield />}>{dobError}</Banner>}

          {/* Form fields */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '14px' }}>
            {!isLogin && <AnimInput label="Your Name" type="text" placeholder="e.g., Arjun Sharma" value={name} onChange={setName} />}
            <AnimInput label="Email address" type="email" placeholder="Enter your email address" value={email} onChange={setEmail} />

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#9a938c', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                  Password
                </label>
                {isLogin && (
                  <button
                    onClick={handleForgotPassword}
                    disabled={forgotLoading}
                    style={{ background: 'none', border: 'none', color: '#e0ac5f', fontSize: '11px', fontWeight: 600, cursor: forgotLoading ? 'default' : 'pointer', padding: 0 }}
                  >
                    {forgotLoading ? 'Sending…' : 'Forgot password?'}
                  </button>
                )}
              </div>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(12,10,9,0.55)',
                  border: '1px solid rgba(255,255,255,0.11)',
                  color: '#f4f1ec',
                  fontSize: '13.5px',
                  outline: 'none',
                  boxSizing: 'border-box' as const,
                }}
              />
            </div>

            {/* DPDP DOB fields */}
            {!isLogin && (
              <>
                <AnimInput
                  label="Date of Birth"
                  type="date"
                  placeholder=""
                  value={dateOfBirth}
                  onChange={setDateOfBirth}
                  hint="Required under the DPDP Act, 2023 — extra protections apply for under-18s."
                />
                {minorDetected && (
                  <div
                    style={{
                      background: 'rgba(161,101,15,0.09)',
                      border: '1px solid rgba(161,101,15,0.28)',
                      borderRadius: '12px',
                      padding: '16px',
                    }}
                  >
                    <p style={{ fontSize: '12px', color: '#e0ac5f', margin: '0 0 10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <IconShield size={14} /> Under 18 — a parent&apos;s email is needed
                    </p>
                    <AnimInput
                      label="Parent / Guardian Email"
                      type="email"
                      placeholder="parent@example.com"
                      value={parentEmail}
                      onChange={setParentEmail}
                      hint="We'll send them a confirmation link. No targeted ads or profiling for minors."
                    />
                  </div>
                )}
              </>
            )}

            {/* Submit */}
            <PrimaryButton onClick={isLogin ? handleLogin : handleRegister} disabled={loading}>
              {loading ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
            </PrimaryButton>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
              <span style={{ fontSize: '10px', color: 'rgba(226,220,209,0.4)' }}>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
            </div>

            {/* Google */}
            <button
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading}
              style={{
                width: '100%',
                padding: '12px',
                background: '#fff',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                color: '#111',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isGoogleLoading ? 'default' : 'pointer',
                opacity: isGoogleLoading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                transition: 'transform 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
            >
              <GoogleIcon /> {isGoogleLoading ? 'Redirecting…' : 'Continue with Google'}
            </button>

            {/* Switch mode */}
            <p style={{ textAlign: 'center' as const, fontSize: '12px', color: 'rgba(226,220,209,0.6)', margin: '6px 0 0' }}>
              {isLogin ? "Don't have an account yet? " : 'Already a member? '}
              <button
                onClick={() => switchMode(isLogin ? 'register' : 'login')}
                style={{ background: 'none', border: 'none', color: '#e0ac5f', fontSize: '12px', cursor: 'pointer', fontWeight: 700, padding: 0, textDecoration: 'underline' }}
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Hero video panel — hidden under 900px so mobile never pays for the
          video download; the form above already works standalone at full
          width on phones. */}
      <div className="mangal-auth-right">
        <video autoPlay loop muted playsInline preload="metadata" poster="/hero-bg.jpg">
          <source src="/videos/login-dragon-hero.mp4" type="video/mp4" />
        </video>
        <div className="mangal-auth-quote">
          <p style={{ fontSize: '15px', lineHeight: 1.65, color: '#fff', margin: '0 0 16px', fontWeight: 500 }}>
            &ldquo;MANGAL gave my comic a home before it had a single reader —
            now it has thousands. Upload, publish, tell your story, no
            gatekeepers.&rdquo;
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#fff' }}>Ananya Rao</div>
              <div style={{ fontSize: '11.5px', color: 'rgba(226,220,209,0.65)' }}>Creator · &ldquo;Kaal Bhairav&rdquo; on MANGAL</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
