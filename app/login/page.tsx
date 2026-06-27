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
        backgroundColor: '#07070a', // fallback while the image is resolving
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        // backgroundAttachment fixed gives a parallax feel on desktop.
        // It's skipped on mobile below via the media query class instead,
        // since iOS Safari handles fixed backgrounds poorly.
      }}
      className="cosmic-bg-layer"
    />
  );
}

// Dark gradient overlay so white/cream text is always readable on top of
// whatever the photo looks like underneath, regardless of its brightness.
function CosmicOverlay() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background:
          'linear-gradient(180deg, rgba(7,7,10,0.62) 0%, rgba(7,7,10,0.45) 25%, rgba(7,7,10,0.78) 55%, rgba(7,7,10,0.94) 100%)',
        pointerEvents: 'none',
      }}
    />
  );
}

// ── Animated particle / ember canvas ────────────────────────────────────────
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

    type Particle = { x: number; y: number; r: number; vx: number; vy: number; life: number; maxLife: number; hue: number };
    const particles: Particle[] = [];

    const spawn = () => {
      const x = W * 0.5 + (Math.random() - 0.5) * W * 0.6;
      particles.push({
        x,
        y: H + 10,
        r: Math.random() * 2.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -(Math.random() * 1.2 + 0.4),
        life: 0,
        maxLife: 120 + Math.random() * 180,
        hue: Math.random() > 0.5 ? 15 : 38, // red-orange or amber
      });
    };

    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      if (frame % 3 === 0) spawn();
      frame++;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx + Math.sin(p.life * 0.04) * 0.3;
        p.y += p.vy;
        p.life++;
        if (p.life > p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        const alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.7;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 60%, ${alpha})`;
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

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  );
}

// ── Animated MANGAL logo mark ────────────────────────────────────────────────
function LogoMark({ size = 48 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: 'linear-gradient(135deg, #7f1d1d 0%, #b45309 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.45,
        flexShrink: 0,
        boxShadow: `0 0 ${size * 0.5}px rgba(185,60,20,0.5)`,
      }}
    >
      🔥
    </div>
  );
}

// ── Input with animated border focus ────────────────────────────────────────
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
          fontSize: '10px',
          fontWeight: 700,
          color: focused ? '#d97706' : '#9ca3af',
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          marginBottom: '6px',
          transition: 'color 0.2s',
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
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
            background: focused ? 'rgba(20,12,10,0.65)' : 'rgba(15,9,8,0.5)',
            border: `1px solid ${focused ? '#b45309' : 'rgba(255,255,255,0.12)'}`,
            color: '#f9fafb',
            fontSize: '13px',
            outline: 'none',
            boxSizing: 'border-box' as const,
            transition: 'border-color 0.2s, background 0.2s',
            boxShadow: focused ? '0 0 0 3px rgba(180,83,9,0.15)' : 'none',
            backdropFilter: 'blur(8px)',
          }}
        />
        {focused && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: '10%',
              right: '10%',
              height: '1px',
              background: 'linear-gradient(to right, transparent, #d97706, transparent)',
              borderRadius: '1px',
            }}
          />
        )}
      </div>
      {hint && (
        <p style={{ fontSize: '11px', color: 'rgba(229,231,235,0.55)', marginTop: '5px', marginBottom: 0, lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// ── Floating stat badge ──────────────────────────────────────────────────────
function StatBadge({ icon, value, label, delay }: { icon: string; value: string; label: string; delay: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'rgba(20,12,10,0.55)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        padding: '10px 16px',
        backdropFilter: 'blur(14px)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}
    >
      <span style={{ fontSize: '20px' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '10px', color: 'rgba(229,231,235,0.6)', marginTop: '2px' }}>{label}</div>
      </div>
    </div>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
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
          <a key={link.href} href={link.href} style={{ fontSize: '11px', color: 'rgba(229,231,235,0.5)', textDecoration: 'none' }}>
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

// ── Shared glassmorphism card wrapper ───────────────────────────────────────
// This is the piece that gives the "frosted glass over a big photo" look from
// the reference image, while keeping MANGAL's red-saffron-ember identity
// instead of switching to purple.
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
        background: 'rgba(20,10,8,0.45)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '24px',
        padding: '40px 36px',
        position: 'relative',
        boxShadow: '0 40px 120px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset',
        backdropFilter: 'blur(22px) saturate(140%)',
        WebkitBackdropFilter: 'blur(22px) saturate(140%)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
        transition: 'opacity 0.45s ease, transform 0.45s ease',
      }}
    >
      {/* Top glow line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '160px',
          height: '1px',
          background: 'linear-gradient(to right, transparent, #dc2626, transparent)',
        }}
      />
      {/* Corner accent */}
      <div
        style={{
          position: 'absolute',
          top: -1,
          right: 32,
          width: '60px',
          height: '1px',
          background: 'linear-gradient(to right, transparent, #d97706)',
        }}
      />
      {children}
    </div>
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
      window.location.href = '/home';
    };
    checkSession();
  }, []);

  const handleRegister = async () => {
    if (!email || !password || !name) {
      setError('Please fill in all fields!');
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
    setMessage('Verification email sent! Check your inbox.');
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are both required!');
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
    else window.location.href = '/home';
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/auth/callback` } });
    if (error) setError(error.message);
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
    window.location.href = choice === 'creator' ? '/become-creator' : '/home';
  };

  // ── PENDING CONSENT SCREEN ────────────────────────────────────────────────
  if (mode === 'pending')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <CosmicBackground />
        <CosmicOverlay />
        <EmberCanvas />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 1 }}>
          <GlassCard maxWidth={480} visible={cardVisible}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '52px', marginBottom: '16px' }}>⏳</div>
              <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#fff', margin: '0 0 14px', letterSpacing: '-0.02em' }}>
                {PARENT_CONSENT_PENDING_COPY.title}
              </h2>
              <p style={{ fontSize: '13px', color: 'rgba(229,231,235,0.75)', lineHeight: 1.75, margin: '0 0 24px' }}>
                {PARENT_CONSENT_PENDING_COPY.body}
              </p>
              <div style={{ padding: '14px 18px', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: '12px', marginBottom: '24px' }}>
                <p style={{ fontSize: '12px', color: '#fbbf24', margin: 0, lineHeight: 1.6 }}>
                  🛡️ No targeted ads. No behavioural profiling. Your account is protected under DPDP Act, 2023.
                </p>
              </div>
              <button
                onClick={() => switchMode('landing')}
                style={{ background: 'none', border: 'none', color: 'rgba(229,231,235,0.55)', fontSize: '12px', cursor: 'pointer' }}
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
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <CosmicBackground />
        <CosmicOverlay />
        <EmberCanvas />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 1 }}>
          <GlassCard maxWidth={420} visible={cardVisible}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <LogoMark size={36} />
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', margin: 0 }}>One quick thing</h2>
                <p style={{ fontSize: '12px', color: 'rgba(229,231,235,0.55)', margin: '2px 0 0' }}>
                  Required under the DPDP Act, 2023
                </p>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(229,231,235,0.7)', lineHeight: 1.6, marginBottom: '20px' }}>
              Indian law requires us to verify your age before activating your account. Takes 10 seconds.
            </p>

            {dobError && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)', color: '#fbbf24', fontSize: '12px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span>🛡️</span><span>{dobError}</span>
              </div>
            )}

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
                <div style={{ background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '12px', padding: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#fbbf24', margin: '0 0 10px', fontWeight: 700 }}>🛡️ Under 18 — parent's email needed</p>
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
              <button
                onClick={handleDobSubmit}
                disabled={loading}
                style={{ width: '100%', padding: '14px', marginTop: '4px', background: loading ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 60%, #b45309 100%)', border: 'none', borderRadius: '12px', color: loading ? 'rgba(229,231,235,0.5)' : '#fff', fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 4px 20px rgba(127,29,29,0.45)' }}
              >
                {loading ? 'Please wait…' : 'Continue →'}
              </button>
            </div>
          </GlassCard>
        </main>
        <Footer />
      </div>
    );

  // ── LANDING ──────────────────────────────────────────────────────────────
  if (mode === 'landing')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI', Arial, sans-serif", overflow: 'hidden' }}>
        <CosmicBackground />
        <CosmicOverlay />
        <EmberCanvas />

        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 1 }}>
          <div style={{ width: '100%', maxWidth: '900px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '40px' }}>
            {/* Hero text above card */}
            <div
              style={{
                textAlign: 'center',
                opacity: cardVisible ? 1 : 0,
                transform: cardVisible ? 'translateY(0)' : 'translateY(-16px)',
                transition: 'opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s',
                position: 'relative',
                padding: '24px 32px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(ellipse 70% 100% at center, rgba(5,4,3,0.55) 0%, transparent 75%)',
                  zIndex: -1,
                  borderRadius: '32px',
                }}
              />
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <div style={{ height: '1px', width: '40px', background: 'linear-gradient(to right, transparent, #f59e0b)' }} />
                <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.22em', color: '#fbbf24', textTransform: 'uppercase' }}>India's Comic Revolution</span>
                <div style={{ height: '1px', width: '40px', background: 'linear-gradient(to left, transparent, #f59e0b)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '12px' }}>
                <LogoMark size={56} />
                <h1
                  style={{
                    fontSize: 'clamp(52px, 10vw, 80px)',
                    fontWeight: 900,
                    letterSpacing: '-0.04em',
                    color: '#ffffff',
                    margin: 0,
                    lineHeight: 1,
                    background: 'linear-gradient(135deg, #fff 35%, #fde68a)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.85)) drop-shadow(0 2px 18px rgba(0,0,0,0.6))',
                  }}
                >
                  MANGAL
                </h1>
              </div>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.92)', letterSpacing: '0.18em', margin: '0 0 6px', textTransform: 'uppercase', textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}>
                Bharat Ki Kahaniyan
              </p>
              <p style={{ fontSize: '15px', color: 'rgba(229,231,235,0.85)', lineHeight: 1.7, margin: 0, textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
                The home India's storytellers never had.
                <br />
                <span style={{ color: '#fbbf24', fontWeight: 700 }}>Read. Create. Rise.</span>
              </p>
            </div>

            {/* Main card */}
            <GlassCard maxWidth={420} visible={cardVisible}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Google — primary CTA */}
                <button
                  onClick={handleGoogleLogin}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    background: '#fff',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    color: '#111',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.5)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = '';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.4)';
                  }}
                >
                  <GoogleIcon /> Continue with Google
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }} />
                  <span style={{ fontSize: '10px', color: 'rgba(229,231,235,0.45)', letterSpacing: '0.1em' }}>OR</span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }} />
                </div>

                {/* Email register */}
                <button
                  onClick={() => switchMode('register')}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b45309 100%)',
                    border: 'none',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                    boxShadow: '0 4px 20px rgba(127,29,29,0.45)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 28px rgba(127,29,29,0.6)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = '';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(127,29,29,0.45)';
                  }}
                >
                  🚀 Create Free Account
                </button>

                {/* Login link */}
                <button
                  onClick={() => switchMode('login')}
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: '12px',
                    color: 'rgba(229,231,235,0.75)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.3)';
                    (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.14)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(229,231,235,0.75)';
                  }}
                >
                  Already a member? Login →
                </button>
              </div>

              {/* Role teaser */}
              <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { icon: '🖊️', role: 'Creator', desc: 'Publish your story', color: '#fca5a5' },
                  { icon: '📖', role: 'Reader', desc: "Discover India's best", color: '#fbbf24' },
                ].map((item) => (
                  <div
                    key={item.role}
                    style={{
                      background: 'rgba(10,6,5,0.4)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '14px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '22px', marginBottom: '6px' }}>{item.icon}</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: item.color, marginBottom: '2px' }}>{item.role}</div>
                    <div style={{ fontSize: '10px', color: 'rgba(229,231,235,0.55)' }}>{item.desc}</div>
                  </div>
                ))}
              </div>

              <p style={{ textAlign: 'center', fontSize: '9px', color: 'rgba(229,231,235,0.4)', marginTop: '20px', marginBottom: 0, letterSpacing: '0.05em' }}>
                © 2026 MANGAL · Made with 🔥 in India
              </p>
            </GlassCard>

            {/* Floating stat badges */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <StatBadge icon="🇮🇳" value="India First" label="Built for Bharat" delay={600} />
              <StatBadge icon="🔥" value="Free Forever" label="For readers" delay={800} />
              <StatBadge icon="🖊️" value="0% Cut" label="Until monetization" delay={1000} />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );

  // ── ROLE SELECTION ────────────────────────────────────────────────────────
  if (mode === 'role')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <CosmicBackground />
        <CosmicOverlay />
        <EmberCanvas />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 1 }}>
          <GlassCard maxWidth={520} visible={cardVisible}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <LogoMark size={40} />
              <div style={{ marginTop: '20px' }}>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    color: '#fbbf24',
                    background: 'rgba(120,53,15,0.3)',
                    border: '1px solid rgba(180,83,9,0.4)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    textTransform: 'uppercase' as const,
                  }}
                >
                  Welcome to MANGAL
                </span>
              </div>
              <h2 style={{ fontSize: '30px', fontWeight: 900, color: '#fff', margin: '16px 0 8px', letterSpacing: '-0.02em' }}>How will you journey?</h2>
              <p style={{ fontSize: '13px', color: 'rgba(229,231,235,0.7)', margin: 0 }}>Choose your path — you can always switch later</p>
            </div>

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' as const }}>
              {[
                {
                  choice: 'creator' as const,
                  icon: '🖊️',
                  title: 'Creator',
                  subtitle: 'I want to publish',
                  desc: 'Upload your Mangal series, build a fanbase, tell India your story.',
                  gradient: 'linear-gradient(135deg, rgba(127,29,29,0.45), rgba(153,27,27,0.2))',
                  border: 'rgba(220,38,38,0.5)',
                  accent: '#fca5a5',
                },
                {
                  choice: 'reader' as const,
                  icon: '📖',
                  title: 'Reader',
                  subtitle: 'I want to explore',
                  desc: "Dive into India's best original comics, free forever.",
                  gradient: 'linear-gradient(135deg, rgba(180,83,9,0.35), rgba(120,53,15,0.18))',
                  border: 'rgba(217,119,6,0.5)',
                  accent: '#fbbf24',
                },
              ].map((item) => (
                <button
                  key={item.choice}
                  onClick={() => finishOnboarding(item.choice)}
                  style={{
                    flex: '1 1 200px',
                    padding: '28px 20px',
                    background: item.gradient,
                    border: `1px solid ${item.border}`,
                    borderRadius: '16px',
                    cursor: 'pointer',
                    textAlign: 'left' as const,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 12px 40px rgba(0,0,0,0.45)`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = '';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
                  }}
                >
                  <div style={{ fontSize: '36px', marginBottom: '14px' }}>{item.icon}</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', marginBottom: '2px' }}>{item.title}</div>
                  <div style={{ fontSize: '10px', color: item.accent, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: '10px' }}>
                    {item.subtitle}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(229,231,235,0.75)', lineHeight: 1.6 }}>{item.desc}</div>
                </button>
              ))}
            </div>

            <p style={{ fontSize: '11px', color: 'rgba(229,231,235,0.45)', marginTop: '20px', marginBottom: 0, textAlign: 'center', lineHeight: 1.6 }}>
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <CosmicBackground />
      <CosmicOverlay />
      <EmberCanvas />

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', zIndex: 1 }}>
        <GlassCard maxWidth={420} visible={cardVisible}>
          {/* Back button */}
          <button
            onClick={() => switchMode('landing')}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(229,231,235,0.6)',
              fontSize: '12px',
              cursor: 'pointer',
              marginBottom: '24px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(229,231,235,0.6)')}
          >
            ← Back
          </button>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
            <LogoMark size={36} />
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                {isLogin ? 'Welcome back' : 'Join MANGAL'}
              </h2>
              <p style={{ fontSize: '12px', color: 'rgba(229,231,235,0.55)', margin: '2px 0 0' }}>
                {isLogin ? 'Login to your account' : 'Create your free account'}
              </p>
            </div>
          </div>

          {/* Error / success banners */}
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#fca5a5',
                fontSize: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
          {message && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(16,185,129,0.12)',
                border: '1px solid rgba(16,185,129,0.3)',
                color: '#6ee7b7',
                fontSize: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <span>✅</span>
              <span>{message}</span>
            </div>
          )}
          {dobError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(217,119,6,0.12)',
                border: '1px solid rgba(217,119,6,0.3)',
                color: '#fbbf24',
                fontSize: '12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <span>🛡️</span>
              <span>{dobError}</span>
            </div>
          )}

          {/* Google */}
          <button
            onClick={handleGoogleLogin}
            style={{
              width: '100%',
              padding: '12px',
              background: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px',
              color: '#111',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              marginBottom: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4)')}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)')}
          >
            <GoogleIcon /> Continue with Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }} />
            <span style={{ fontSize: '10px', color: 'rgba(229,231,235,0.45)' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.12)' }} />
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
                      background: 'rgba(217,119,6,0.1)',
                      border: '1px solid rgba(217,119,6,0.3)',
                      borderRadius: '12px',
                      padding: '16px',
                    }}
                  >
                    <p style={{ fontSize: '12px', color: '#fbbf24', margin: '0 0 10px', fontWeight: 700 }}>🛡️ Under 18 — parent's email needed</p>
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
            <button
              onClick={isLogin ? handleLogin : handleRegister}
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                marginTop: '4px',
                background: loading ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 60%, #b45309 100%)',
                border: 'none',
                borderRadius: '12px',
                color: loading ? 'rgba(229,231,235,0.5)' : '#fff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(127,29,29,0.45)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 28px rgba(127,29,29,0.6)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = '';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = loading ? 'none' : '0 4px 20px rgba(127,29,29,0.45)';
              }}
            >
              {loading ? 'Please wait…' : isLogin ? '🔓 Login to MANGAL' : '🚀 Create My Account'}
            </button>

            {/* Switch mode */}
            <p style={{ textAlign: 'center' as const, fontSize: '12px', color: 'rgba(229,231,235,0.6)', margin: 0 }}>
              {isLogin ? 'New here? ' : 'Already a member? '}
              <button
                onClick={() => switchMode(isLogin ? 'register' : 'login')}
                style={{ background: 'none', border: 'none', color: '#fbbf24', fontSize: '12px', cursor: 'pointer', fontWeight: 700, padding: 0 }}
              >
                {isLogin ? 'Create account' : 'Login'}
              </button>
            </p>
          </div>
        </GlassCard>
      </main>
      <Footer />
    </div>
  );
}