'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { isMinor, isPlausibleDateOfBirth, PARENT_CONSENT_PENDING_COPY } from '../lib/dpdp';

// 'dob'     = Google OAuth new users — skipped register form so no DOB yet
// 'pending' = minor whose parent hasn't confirmed yet
type Mode = 'landing' | 'login' | 'register' | 'dob' | 'role' | 'pending';

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

// ── Ambient ember drift ──────────────────────────────────────────────────────
// Kept only on the landing/marketing screen, and tuned well down from a
// "particle effects" look to a slow, quiet drift — atmosphere, not motion
// graphics. Never shown behind an active form.
function EmberCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    const onResize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    type Particle = { x: number; y: number; r: number; vx: number; vy: number; life: number; maxLife: number };
    const particles: Particle[] = [];

    const spawn = () => {
      const x = W * 0.5 + (Math.random() - 0.5) * W * 0.7;
      particles.push({
        x,
        y: H + 10,
        r: Math.random() * 1.6 + 0.4,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(Math.random() * 0.5 + 0.25),
        life: 0,
        maxLife: 220 + Math.random() * 260,
      });
    };

    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      if (frame % 9 === 0) spawn();
      frame++;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx + Math.sin(p.life * 0.02) * 0.15;
        p.y += p.vy;
        p.life++;
        if (p.life > p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        const alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.28;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(28, 70%, 55%, ${alpha})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(animate);
    };

    let raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} />;
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
const IconArrowLeft = ({ size = 14 }: { size?: number }) => (
  <IconBase size={size}>
    <path d="M19 12H5" />
    <path d="M11 18l-6-6 6-6" />
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

// ── Trust strip (replaces floating emoji badges) ─────────────────────────────
function TrustStrip() {
  const items = ['Built for Indian readers', 'Free to read, always', '0% platform cut until monetization'];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap' as const,
        justifyContent: 'center',
        gap: '10px',
        fontSize: '11.5px',
        color: 'rgba(226,220,209,0.6)',
      }}
    >
      {items.map((label, i) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {i > 0 && <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(226,220,209,0.3)' }} />}
          {label}
        </span>
      ))}
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
        padding: '36px 34px',
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

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: 'rgba(226,220,209,0.55)',
        fontSize: '12px',
        cursor: 'pointer',
        marginBottom: '24px',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'color 0.2s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(226,220,209,0.55)')}
    >
      <IconArrowLeft /> Back
    </button>
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
  const [mode, setMode] = useState<Mode>('landing');
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
  const [nextPath, setNextPath] = useState('/home');

  // Surface errors that /auth/callback redirects back with (e.g. Google
  // sign-in was cancelled, or exchangeCodeForSession failed) — previously
  // this arrived as a silent ?error=... query param with nothing shown to
  // the user, so a real failure just looked like the login page reloading.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const rawNext = params.get('next');
    const validNext = rawNext && /^\/(?!\/|\\)/.test(rawNext) ? rawNext : null;

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
      if (validNext) setNextPath(validNext);
      if (oauthError) setError(FRIENDLY_ERRORS[oauthError] || decodeURIComponent(oauthError));
    }, 0);

    // Clean the URL so a refresh or back-navigation doesn't re-show the
    // error or resubmit it. (next was already captured into state above.)
    if (oauthError || validNext) window.history.replaceState({}, '', '/login');

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

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleLogin = async () => {
    // Guard against double-clicks / double-submits — each call generates a
    // fresh OAuth `state`/PKCE pair, and Supabase's state token can only be
    // redeemed once. Firing this twice before the first redirect completes
    // produces "invalid_request: flow_state_already_used" on the way back.
    if (isGoogleLoading) return;
    setIsGoogleLoading(true);
    setError('');
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
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
                onClick={() => switchMode('landing')}
                style={{ background: 'none', border: 'none', color: 'rgba(226,220,209,0.55)', fontSize: '12px', cursor: 'pointer' }}
              >
                ← Back to home
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

  // ── LANDING ──────────────────────────────────────────────────────────────
  if (mode === 'landing')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <CosmicBackground />
        <CosmicOverlay />
        <EmberCanvas />

        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 1 }}>
          <div style={{ width: '100%', maxWidth: '900px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '36px' }}>
            {/* Hero text above card */}
            <div
              style={{
                textAlign: 'center',
                opacity: cardVisible ? 1 : 0,
                transform: cardVisible ? 'translateY(0)' : 'translateY(-12px)',
                transition: 'opacity 0.4s ease 0.05s, transform 0.4s ease 0.05s',
                position: 'relative',
                padding: '24px 32px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(ellipse 70% 100% at center, rgba(6,5,4,0.5) 0%, transparent 75%)',
                  zIndex: -1,
                  borderRadius: '32px',
                }}
              />
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <div style={{ height: '1px', width: '32px', background: 'linear-gradient(to right, transparent, rgba(224,172,95,0.7))' }} />
                <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.2em', color: 'rgba(224,172,95,0.9)', textTransform: 'uppercase' }}>India&apos;s Comic Platform</span>
                <div style={{ height: '1px', width: '32px', background: 'linear-gradient(to left, transparent, rgba(224,172,95,0.7))' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '14px' }}>
                <LogoMark size={52} />
                <h1
                  style={{
                    fontSize: 'clamp(44px, 8vw, 68px)',
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    color: '#fff',
                    margin: 0,
                    lineHeight: 1,
                    filter: 'drop-shadow(0 2px 16px rgba(0,0,0,0.6))',
                  }}
                >
                  MANGAL
                </h1>
              </div>
              <p style={{ fontSize: '12.5px', color: 'rgba(226,220,209,0.85)', letterSpacing: '0.16em', margin: '0 0 8px', textTransform: 'uppercase' }}>
                Bharat Ki Kahaniyan
              </p>
              <p style={{ fontSize: '15px', color: 'rgba(226,220,209,0.82)', lineHeight: 1.7, margin: 0 }}>
                The home India&apos;s storytellers never had.
                <br />
                <span style={{ color: '#e0ac5f', fontWeight: 600 }}>Read. Create. Rise.</span>
              </p>
            </div>

            {/* Main card */}
            <GlassCard maxWidth={420} visible={cardVisible}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {error && <Banner tone="error" icon={<IconAlert />}>{error}</Banner>}

                {/* Google — primary CTA */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={isGoogleLoading}
                  style={{
                    width: '100%',
                    padding: '13px 18px',
                    background: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    color: '#111',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    cursor: isGoogleLoading ? 'default' : 'pointer',
                    opacity: isGoogleLoading ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
                    transition: 'transform 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
                >
                  <GoogleIcon /> {isGoogleLoading ? 'Redirecting…' : 'Continue with Google'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                  <span style={{ fontSize: '10px', color: 'rgba(226,220,209,0.42)', letterSpacing: '0.08em' }}>OR</span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                </div>

                <PrimaryButton onClick={() => switchMode('register')}>Create account</PrimaryButton>

                <button
                  onClick={() => switchMode('login')}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.13)',
                    borderRadius: '10px',
                    color: 'rgba(226,220,209,0.78)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.28)';
                    (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.13)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,220,209,0.78)';
                  }}
                >
                  Already a member? Sign in
                </button>
              </div>

              {/* Role teaser */}
              <div style={{ marginTop: '22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { icon: <IconPen size={19} />, role: 'Creator', desc: 'Publish your story', color: '#e79b93' },
                  { icon: <IconBook size={19} />, role: 'Reader', desc: "Discover India's best", color: '#e0ac5f' },
                ].map((item) => (
                  <div
                    key={item.role}
                    style={{
                      background: 'rgba(10,8,7,0.4)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      borderRadius: '12px',
                      padding: '14px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ color: item.color, marginBottom: '8px', display: 'flex', justifyContent: 'center' }}>{item.icon}</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f4f1ec', marginBottom: '2px' }}>{item.role}</div>
                    <div style={{ fontSize: '10.5px', color: 'rgba(226,220,209,0.55)' }}>{item.desc}</div>
                  </div>
                ))}
              </div>

              <p style={{ textAlign: 'center', fontSize: '9.5px', color: 'rgba(226,220,209,0.38)', marginTop: '20px', marginBottom: 0, letterSpacing: '0.04em' }}>
                © 2026 MANGAL · Crafted in India
              </p>
            </GlassCard>

            <TrustStrip />
          </div>
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

  // ── LOGIN / REGISTER ──────────────────────────────────────────────────────
  const isLogin = mode === 'login';
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <CosmicBackground />
      <CosmicOverlay />

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 1 }}>
        <GlassCard maxWidth={420} visible={cardVisible}>
          <BackButton onClick={() => switchMode('landing')} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
            <LogoMark size={36} />
            <div>
              <h2 style={{ fontSize: '21px', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>
                {isLogin ? 'Welcome back' : 'Join MANGAL'}
              </h2>
              <p style={{ fontSize: '12px', color: 'rgba(226,220,209,0.55)', margin: '2px 0 0' }}>
                {isLogin ? 'Sign in to your account' : 'Create your free account'}
              </p>
            </div>
          </div>

          {/* Error / success banners */}
          {error && <Banner tone="error" icon={<IconAlert />}>{error}</Banner>}
          {message && <Banner tone="success" icon={<IconCheck />}>{message}</Banner>}
          {dobError && <Banner tone="warn" icon={<IconShield />}>{dobError}</Banner>}

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
              marginBottom: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
          >
            <GoogleIcon /> {isGoogleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: '10px', color: 'rgba(226,220,209,0.4)' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Form fields */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '14px' }}>
            {!isLogin && <AnimInput label="Your Name" type="text" placeholder="e.g., Arjun Sharma" value={name} onChange={setName} />}
            <AnimInput label="Email" type="email" placeholder="name@domain.com" value={email} onChange={setEmail} />
            <AnimInput label="Password" type="password" placeholder="••••••••" value={password} onChange={setPassword} />

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
              {loading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
            </PrimaryButton>

            {/* Switch mode */}
            <p style={{ textAlign: 'center' as const, fontSize: '12px', color: 'rgba(226,220,209,0.6)', margin: 0 }}>
              {isLogin ? 'New here? ' : 'Already a member? '}
              <button
                onClick={() => switchMode(isLogin ? 'register' : 'login')}
                style={{ background: 'none', border: 'none', color: '#e0ac5f', fontSize: '12px', cursor: 'pointer', fontWeight: 700, padding: 0 }}
              >
                {isLogin ? 'Create account' : 'Sign in'}
              </button>
            </p>
          </div>
        </GlassCard>
      </main>
      <Footer />
    </div>
  );
}
