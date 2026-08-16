'use client';

import { useState, useEffect, useRef, CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { setPostLoginRedirect } from '../../lib/authRedirect';
import ThemeToggle from '../../components/ThemeToggle';
import { useKCircleTheme } from '../theme';
import {
  ArrowLeft, Camera, Bookmark, Star, Megaphone, ShieldCheck,
  LogOut, Check, ChevronRight,
} from 'lucide-react';

// ── K Circle — Settings / Edit Profile ──
// Instagram's /accounts/edit/ pattern, adapted: avatar + bio editing
// (creator_profiles.avatar_url/bio — avatar_url added in
// 20260816150000_creator_profiles_avatar_url.sql), quick links to the
// K Circle features that already exist as their own pages (Saved, Close
// Friends, Broadcast Channels), and Log Out. Single-column layout on
// purpose — phone-compatible without a separate mobile/desktop branch,
// same reasoning KaTube's page.tsx used for CSS-only breakpoints (see its
// comment on why a JS isMobile flag was dropped).
// Account-level stuff that isn't K Circle-specific (delete account, data
// export, consent) intentionally stays out of scope here — linked out to
// the existing sitewide app/settings/page.tsx instead of duplicating it.

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';
const BIO_MAX = 150;

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function KCircleSettingsPage() {
  const router = useRouter();
  const { setIsLight, themeVars, dataTheme } = useKCircleTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

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
      setAvatarUrl(prof?.avatar_url ?? null);
      setCheckedAuth(true);
    });
  }, []);
  useEffect(() => {
    if (checkedAuth && !userId) {
      setPostLoginRedirect('/kalpana-circle/settings');
      router.replace('/login?next=/kalpana-circle/settings');
    }
  }, [checkedAuth, userId, router]);

  const handlePickPhoto = () => fileInputRef.current?.click();

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;
    setUploading(true);
    setError('');
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `avatars/${userId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('kcircle-media').upload(path, file, { upsert: true });
      if (upErr) { setError(`Photo upload failed: ${upErr.message}`); setUploading(false); return; }
      const publicUrl = supabase.storage.from('kcircle-media').getPublicUrl(path).data.publicUrl;
      const { error: updErr } = await supabase.from('creator_profiles').update({ avatar_url: publicUrl }).eq('user_id', userId);
      if (updErr) { setError(`Couldn't save photo: ${updErr.message}`); setUploading(false); return; }
      setAvatarUrl(publicUrl);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveBio = async () => {
    if (!userId) return;
    setSaving(true);
    setError('');
    setSaved(false);
    const { error: updErr } = await supabase.from('creator_profiles').update({ bio: bio.trim() || null }).eq('user_id', userId);
    setSaving(false);
    if (updErr) { setError(`Couldn't save: ${updErr.message}`); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
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
              of assuming a profile page exists to go back to. */}
          <Link href={username ? `/kalpana-circle/profile/${username}` : '/kalpana-circle'} className="kcs-icon-btn" title="Back">
            <ArrowLeft size={22} />
          </Link>
          <span style={{ fontWeight: 800, fontSize: '16px' }}>Settings</span>
        </div>
        <ThemeToggle size={26} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
      </nav>

      <style>{`
        .kcs-icon-btn {
          display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; margin: -8px; margin-right: 0; border-radius: 50%;
          color: var(--text-primary); text-decoration: none;
        }
        @media (max-width: 359px) {
          .kcs-page-pad { padding-left: 14px !important; padding-right: 14px !important; }
        }
      `}</style>

      <div className="kcs-page-pad" style={{ maxWidth: '520px', margin: '0 auto', padding: '24px 20px 60px', display: 'flex', flexDirection: 'column', gap: '28px', boxSizing: 'border-box' }}>
        {/* ── EDIT PROFILE ── */}
        <section>
          <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '14px' }}>
            Edit Profile
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded Supabase Storage URL
                <img src={avatarUrl} alt={username} width={64} height={64} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', background: RADIANT,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 800, color: '#27272a',
                }}>
                  {initials(username || '?')}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>{username}</div>
              <button
                onClick={handlePickPhoto}
                disabled={uploading}
                style={{
                  background: 'none', border: 'none', color: '#7c3aed', fontWeight: 700, fontSize: '13px',
                  cursor: uploading ? 'default' : 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <Camera size={14} /> {uploading ? 'Uploading...' : 'Change photo'}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
            </div>
          </div>

          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Username
          </label>
          <div style={{
            padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            fontSize: '13.5px', color: 'var(--text-tertiary)', marginBottom: '16px',
          }}>
            {username || '—'}
          </div>

          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Bio
          </label>
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value.slice(0, BIO_MAX))}
            placeholder="Tell dreamers about yourself..."
            rows={3}
            style={{
              width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: '8px',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
              fontSize: '13.5px', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>{bio.length}/{BIO_MAX}</span>
            <button
              onClick={handleSaveBio}
              disabled={saving}
              style={{
                padding: '8px 18px', borderRadius: '8px', border: 'none', background: RADIANT,
                color: '#27272a', fontWeight: 800, fontSize: '13px', cursor: saving ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              {saved ? <><Check size={14} /> Saved</> : saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {error && <div style={{ color: '#ef4444', fontSize: '12.5px', marginTop: '8px' }}>{error}</div>}
        </section>

        {/* ── QUICK LINKS ── */}
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

        <button
          onClick={handleSignOut}
          style={{
            width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.35)',
            background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontWeight: 800, fontSize: '13.5px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <LogOut size={16} /> Log Out
        </button>
      </div>
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
