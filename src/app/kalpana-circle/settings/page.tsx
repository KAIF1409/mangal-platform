'use client';

import { useState, useEffect, useRef, useCallback, CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { uploadAvatarImage } from '../../lib/media/uploadClient';
import { compressAvatarImage } from '../../lib/media/compressAvatarImage';
import { setPostLoginRedirect } from '../../lib/auth/authRedirect';
import ThemeToggle from '../../components/shared/ThemeToggle';
import { useKCircleTheme } from '../theme';
import { KCircleShellStyle, KCircleRail } from '../components/Shell';
import {
  ArrowLeft, Camera, Bookmark, Star, Megaphone, ShieldCheck,
  LogOut, Check, ChevronRight, ImagePlus, Trash2, X, Loader2,
} from 'lucide-react';

// ── K Circle — Settings / Edit Profile ──
// Instagram's /accounts/edit/ pattern: avatar action sheet + instant
// objectURL preview + client-side Canvas compression (see
// lib/media/compressAvatarImage.ts for why compression CANNOT be a server
// dependency like sharp under the OpenNext Worker's 3MB bundle cap),
// editable username/bio with a strict 0/150 counter, and Log Out.
// Save is two sequential calls: POST /api/upload-avatar (only when a new
// image is pending) then PATCH /api/user/profile carrying username, bio
// and the avatar reference together.
//
// Why the photo action sheet ISN'T next/dynamic'd: it's inline JSX styled
// with theme vars already on this page — no extra deps, far under 1KB.
// A dynamic import would add a separate chunk fetch on every open for no
// real bundle savings; static rendering wins here.

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';
const BIO_MAX = 150;

// accept="" is only a picker hint (Android HEIC often reports type ''),
// so handlePhotoSelected re-validates extension AND MIME itself.
const AVATAR_INPUT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
const AVATAR_OK_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const AVATAR_OK_MIME = /^image\/(jpeg|png|webp|heic|heif)$/;
const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024; // raw pick limit before compression
const SERVER_AVATAR_LIMIT = 2 * 1024 * 1024; // mirrors /api/upload-avatar's cap

// Client-side mirror of /api/user/profile's rule so obviously-invalid
// usernames never leave the browser.
const USERNAME_RE = /^[a-z0-9._]{3,24}$/;

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token || ''}` };
}

// What the user picked but hasn't saved yet. 'remove' distinguishes an
// explicit removal (PATCH avatarPath:null on save) from "untouched".
type PendingAvatar =
  | { kind: 'new'; blob: Blob; previewUrl: string }
  | { kind: 'remove' };

interface ToastState {
  kind: 'success' | 'error';
  msg: string;
  id: number;
}

export default function KCircleSettingsPage() {
  const router = useRouter();
  const { setIsLight, themeVars, dataTheme } = useKCircleTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<PendingAvatar | null>(null);
  // Mirrors pendingAvatar.previewUrl purely for the unmount cleanup — an
  // effect keyed on pendingAvatar itself would revoke the LIVE preview
  // mid-display every time the state changes.
  const previewUrlRef = useRef<string | null>(null);

  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [preparing, setPreparing] = useState(false); // validating + compressing a pick
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, kind: ToastState['kind']) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, kind, id: Date.now() });
    // Errors linger longer than successes — they usually need reading.
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 4200 : 2400);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) { setCheckedAuth(true); return; }
      const { data: prof } = await supabase
        .from('creator_profiles')
        .select('username, bio, avatar_url')
        .eq('user_id', uid)
        .maybeSingle();
      setUsername(prof?.username ?? '');
      setBio(prof?.bio ?? '');
      setSavedAvatarUrl(prof?.avatar_url ?? null);
      setCheckedAuth(true);
    });
  }, []);
  useEffect(() => {
    if (checkedAuth && !userId) {
      setPostLoginRedirect('/kalpana-circle/settings');
      router.replace('/login?next=/kalpana-circle/settings');
    }
  }, [checkedAuth, userId, router]);

  // Esc closes the photo action sheet (backdrop click covers pointer users).
  useEffect(() => {
    if (!photoMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPhotoMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [photoMenuOpen]);

  // Leaving the page must release the object URL + pending toast timer.
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const discardPendingPreview = useCallback((prev: PendingAvatar | null) => {
    if (prev?.kind === 'new') {
      URL.revokeObjectURL(prev.previewUrl);
      if (previewUrlRef.current === prev.previewUrl) previewUrlRef.current = null;
    }
  }, []);

  // What the circle renders RIGHT NOW: instant preview beats saved state
  // beats placeholder — this precedence is what makes the swap feel
  // immediate without touching the network.
  const displayAvatarUrl =
    pendingAvatar?.kind === 'new' ? pendingAvatar.previewUrl
    : pendingAvatar?.kind === 'remove' ? null
    : savedAvatarUrl;

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after a failure
    setPhotoMenuOpen(false);
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!AVATAR_OK_EXTENSIONS.has(ext) && !AVATAR_OK_MIME.test(file.type)) {
      showToast('Only JPG, PNG, WebP or HEIC images are supported.', 'error');
      return;
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      showToast('That image is over 5MB — please pick a smaller one.', 'error');
      return;
    }

    setPreparing(true);
    try {
      // All client-side: decode → center square crop → downscale to 512² →
      // JPEG q0.85. A 12MB phone photo becomes a ~100KB square avatar.
      const { blob } = await compressAvatarImage(file);
      if (blob.size > SERVER_AVATAR_LIMIT) {
        throw new Error('This image is still too large after compression — try another.');
      }
      discardPendingPreview(pendingAvatar);
      const previewUrl = URL.createObjectURL(blob);
      previewUrlRef.current = previewUrl;
      setPendingAvatar({ kind: 'new', blob, previewUrl });
    } catch (err) {
      const msg =
        err instanceof Error && err.message === 'decode-failed'
          ? 'Couldn\u2019t read this image. HEIC needs Safari or iOS — try a JPG, PNG or WebP instead.'
          : err instanceof Error && err.message === 'canvas-unavailable'
            ? 'This browser can\u2019t process images.'
            : err instanceof Error
              ? err.message
              : 'Couldn\u2019t process that image.';
      showToast(msg, 'error');
    } finally {
      setPreparing(false);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoMenuOpen(false);
    discardPendingPreview(pendingAvatar);
    // Even when only a preview existed, 'remove' is the correct intent —
    // save PATCHes avatarPath:null (a harmless no-op if there was none).
    setPendingAvatar({ kind: 'remove' });
  };

  const handleSave = async () => {
    if (!userId || saving) return;
    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_RE.test(normalizedUsername)) {
      showToast('Username must be 3\u201324 characters: a-z, 0-9, dots or underscores.', 'error');
      return;
    }

    setSaving(true);
    try {
      // Step 1 of 2 — upload the compressed image, only when a new pick is
      // pending. Text-only saves skip straight to the PATCH.
      let avatarPath: string | null | undefined;
      if (pendingAvatar?.kind === 'new') {
        const { path } = await uploadAvatarImage(pendingAvatar.blob);
        avatarPath = path;
      } else if (pendingAvatar?.kind === 'remove') {
        avatarPath = null;
      }

      // Step 2 of 2 — one PATCH carries username + bio + avatar reference.
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ username: normalizedUsername, bio, avatarPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Couldn\u2019t update profile.');

      // Server response is the source of truth (covers its no-op path and
      // any normalization) — adopt it wholesale.
      setUsername(data.profile.username ?? '');
      setBio(data.profile.bio ?? '');
      setSavedAvatarUrl(data.profile.avatar_url ?? null);
      discardPendingPreview(pendingAvatar);
      setPendingAvatar(null);

      setSaved(true);
      showToast('Profile updated', 'success');
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      // Pending state stays exactly as the user left it so they can fix
      // the problem (e.g. taken username) and retry without re-picking.
      showToast(err instanceof Error ? err.message : 'Couldn\u2019t update profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // Clears the @supabase/ssr session cookies, then leaves. Kept on
      // /kalpana-circle (not '/') — same reasoning as profile/[username]'s
      // sign-out: stay in K Circle instead of the marketing homepage.
      await supabase.auth.signOut();
    } finally {
      router.push('/kalpana-circle');
    }
  };

  if (!checkedAuth) {
    return (
      <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' } as CSSProperties}>
        Loading...
      </div>
    );
  }
  if (!userId) return null; // redirecting

  return (
    <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' } as CSSProperties}>
      <KCircleShellStyle />
      <div className="kc-shell">
        {/* Rail avatar gets displayAvatarUrl (not just saved) so the tiny
            rail avatar mirrors the instant preview too. */}
        <KCircleRail
          userId={userId}
          myUsername={username}
          myAvatarUrl={displayAvatarUrl}
          profileHref={username ? `/kalpana-circle/profile/${username}` : '/kalpana-circle/settings'}
          navHref={(path) => (userId ? path : `/login?next=${encodeURIComponent(path)}`)}
          setIsLight={setIsLight}
        />
        <div className="kc-main">
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 14px', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* username can be '' for a logged-in user who has no
              creator_profiles row yet — /kalpana-circle/profile/ (empty)
              is a broken link, so fall back to the K Circle feed instead
              of assuming a profile page exists to go back to. The PATCH
              route inserts a row on first save, so this heals itself. */}
          <Link href={username ? `/kalpana-circle/profile/${username}` : '/kalpana-circle'} className="kcs-icon-btn" title="Back">
            <ArrowLeft size={22} />
          </Link>
          <span style={{ fontWeight: 800, fontSize: '16px' }}>Settings</span>
        </div>
        <ThemeToggle size={26} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
      </nav>

      {/* Photo action sheet — centered card on desktop, IG-style full-width
          bottom sheet under 480px. CSS-only breakpoint, no JS isMobile flag
          (same reasoning KaTube's page.tsx documents for its breakpoints). */}
      <style>{`
        .kcs-icon-btn {
          display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; margin: -8px; margin-right: 0; border-radius: 50%;
          color: var(--text-primary); text-decoration: none;
        }
        .kcs-sheet {
          position: fixed; left: 50%; transform: translateX(-50%); bottom: 20px;
          width: min(340px, calc(100vw - 32px));
          background: var(--bg-card); border: 1px solid var(--border-color);
          border-radius: 14px; overflow: hidden; z-index: 950;
          box-shadow: 0 16px 48px rgba(0,0,0,0.45);
        }
        @media (max-width: 479px) {
          .kcs-sheet {
            left: 0; right: 0; bottom: 0; transform: none; width: 100%;
            border-radius: 16px 16px 0 0; border-left: none; border-right: none; border-bottom: none;
            padding-bottom: env(safe-area-inset-bottom);
          }
        }
        .kcs-sheet-btn {
          display: flex; align-items: center; gap: 10px; width: 100%;
          padding: 14px 16px; background: none; border: none;
          color: var(--text-primary); font-size: 13.5px; font-weight: 700;
          font-family: inherit; cursor: pointer; text-align: left;
        }
        .kcs-sheet-btn:disabled { opacity: 0.45; cursor: default; }
        .kcs-spin { animation: kcs-rot 1s linear infinite; }
        @keyframes kcs-rot { to { transform: rotate(360deg); } }
        @media (max-width: 359px) {
          .kcs-page-pad { padding-left: 14px !important; padding-right: 14px !important; }
        }
      `}</style>

      {/* ── PHOTO ACTION SHEET (Instagram-style) ── */}
      {photoMenuOpen && (
        <>
          <div
            aria-hidden
            onClick={() => setPhotoMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 900 }}
          />
          <div role="dialog" aria-modal="true" aria-label="Change profile photo" className="kcs-sheet">
            <div style={{
              padding: '13px 16px', textAlign: 'center', fontSize: '12.5px', fontWeight: 800,
              color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)',
            }}>
              Change profile photo
            </div>
            <button
              className="kcs-sheet-btn"
              disabled={preparing || saving}
              onClick={() => fileInputRef.current?.click()}
            >
              {preparing ? <Loader2 size={17} className="kcs-spin" /> : <ImagePlus size={17} />}
              {preparing ? 'Processing\u2026' : 'Upload Photo'}
            </button>
            <button
              className="kcs-sheet-btn"
              style={{ color: '#ef4444' }}
              disabled={preparing || saving || (!savedAvatarUrl && pendingAvatar?.kind !== 'new')}
              onClick={handleRemovePhoto}
            >
              <Trash2 size={17} /> Remove Current Photo
            </button>
            <button
              className="kcs-sheet-btn"
              style={{ borderTop: '1px solid var(--border-color)', justifyContent: 'center', color: 'var(--text-secondary)' }}
              onClick={() => setPhotoMenuOpen(false)}
            >
              <X size={17} /> Cancel
            </button>
          </div>
        </>
      )}
      {/* The hidden picker lives OUTSIDE the sheet so it survives the sheet
          unmounting mid-change (a file input removed from the DOM cancels). */}
      <input
        ref={fileInputRef}
        type="file"
        accept={AVATAR_INPUT_ACCEPT}
        onChange={handlePhotoSelected}
        style={{ display: 'none' }}
      />

      <div className="kcs-page-pad" style={{ maxWidth: '520px', margin: '0 auto', padding: '24px 20px 60px', display: 'flex', flexDirection: 'column', gap: '28px', boxSizing: 'border-box' }}>
        {/* ── EDIT PROFILE ── */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '14px' }}>
            Edit Profile
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {/* The whole circle is a tap target (like IG's app); the explicit
                "Change photo" text link below stays for discoverability.
                displayAvatarUrl makes the picked image show up INSTANTLY via
                its object URL, before anything has been uploaded. */}
            <button
              onClick={() => setPhotoMenuOpen(true)}
              disabled={preparing || saving}
              title="Change profile photo"
              aria-label="Change profile photo"
              style={{
                position: 'relative', background: 'none', border: 'none', padding: 0,
                borderRadius: '50%', display: 'block',
                cursor: preparing || saving ? 'default' : 'pointer',
              }}
            >
              {displayAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded media from our own /api/media route (or a preview object URL)
                <img src={displayAvatarUrl} alt={username} width={64} height={64} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <span style={{
                  width: 64, height: 64, borderRadius: '50%', background: RADIANT,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 800, color: '#27272a',
                }}>
                  {initials(username || '?')}
                </span>
              )}
              <span style={{
                position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: '50%',
                background: RADIANT, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--bg-primary)', color: '#27272a',
              }}>
                <Camera size={12} />
              </span>
            </button>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>{username || '\u2014'}</div>
              <button
                onClick={() => setPhotoMenuOpen(true)}
                disabled={preparing || saving}
                style={{
                  background: 'none', border: 'none', color: '#7c3aed', fontWeight: 700, fontSize: '13px',
                  cursor: preparing || saving ? 'default' : 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit',
                }}
              >
                {preparing ? <Loader2 size={14} className="kcs-spin" /> : <Camera size={14} />}
                {preparing ? 'Processing\u2026' : 'Change photo'}
              </button>
            </div>
          </div>

          <label htmlFor="kcs-username" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Username
          </label>
          <input
            id="kcs-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            disabled={saving}
            maxLength={24}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="your_handle"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px',
              background: 'var(--bg-input)', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', fontSize: '13.5px', fontFamily: 'inherit',
            }}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '5px', marginBottom: '16px' }}>
            a-z, 0-9, dots and underscores · 3–24 characters · shown at /kalpana-circle/profile/&lt;username&gt;
          </div>

          <label htmlFor="kcs-bio" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Bio
          </label>
          <textarea
            id="kcs-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
            disabled={saving}
            placeholder="Tell dreamers about yourself..."
            rows={3}
            style={{
              width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: '8px',
              background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
              fontSize: '13.5px', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
            {/* Strict counter: the slice() above makes >150 unreachable by
                typing/pasting; this is the visible proof of it. */}
            <span style={{ fontSize: '11.5px', color: bio.length >= BIO_MAX - 20 ? '#ef4444' : 'var(--text-tertiary)' }}>
              {bio.length}/{BIO_MAX}
            </span>
            <button
              onClick={handleSave}
              disabled={saving || preparing}
              style={{
                padding: '8px 18px', borderRadius: '8px', border: 'none', background: RADIANT,
                color: '#27272a', fontWeight: 800, fontSize: '13px', fontFamily: 'inherit',
                cursor: saving || preparing ? 'default' : 'pointer', opacity: saving || preparing ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              {saving ? (
                <><Loader2 size={14} className="kcs-spin" /> Saving…</>
              ) : saved ? (
                <><Check size={14} /> Saved</>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </section>

        {/* ── QUICK LINKS (valid <Link>s to existing sub-routes) ── */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '10px' }}>
            K Circle
          </h2>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
            <SettingsLink href="/kalpana-circle/saved" icon={<Bookmark size={17} />} label="Saved Posts" />
            <SettingsLink href="/kalpana-circle/close-friends" icon={<Star size={17} />} label="Close Friends" />
            <SettingsLink href="/kalpana-circle/broadcasts" icon={<Megaphone size={17} />} label="Broadcast Channels" />
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '10px' }}>
            Account
          </h2>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
            <SettingsLink href="/settings" icon={<ShieldCheck size={17} />} label="Privacy & Account Settings" last />
          </div>
        </section>

        {/* supabase.auth.signOut() clears the @supabase/ssr session cookies,
            then we redirect into K Circle (not '/') — same reasoning as
            profile/[username]'s sign-out comment. */}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          style={{
            width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.35)',
            background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontWeight: 800, fontSize: '13.5px',
            cursor: signingOut ? 'default' : 'pointer', opacity: signingOut ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: 'inherit',
          }}
        >
          {signingOut ? <Loader2 size={16} className="kcs-spin" /> : <LogOut size={16} />}
          {signingOut ? 'Logging out\u2026' : 'Log Out'}
        </button>
      </div>
        </div>{/* /.kc-main */}
      </div>{/* /.kc-shell */}

      {/* ── TOASTS ── Success/error feedback for the save flow. Local state +
          a timer (same lightweight pattern as katube shorts' showToast) — a
          toast library would be dead weight against the Worker budget. */}
      {toast && (
        <div
          role="status"
          key={toast.id}
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
            background: toast.kind === 'success' ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)',
            color: '#fff', fontSize: '13px', fontWeight: 700,
            padding: '10px 18px', borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            maxWidth: 'calc(100vw - 40px)', textAlign: 'center',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}
        >
          {toast.kind === 'success' ? <Check size={15} /> : null}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function SettingsLink({ href, icon, label, last = false }: { href: string; icon: React.ReactNode; label: string; last?: boolean }) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border-color)',
        color: 'var(--text-primary)', textDecoration: 'none', fontSize: '13.5px', fontWeight: 600,
      }}
    >
      <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <ChevronRight size={16} color="var(--text-tertiary)" />
    </Link>
  );
}
