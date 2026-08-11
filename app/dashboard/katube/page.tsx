'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { setPostLoginRedirect } from '../../lib/authRedirect';

// ── KaTube profile — lives inside the main MANGAL dashboard (one profile,
// one email, one channel — see CONTEXT.md §6). This is now the ONLY place
// channel connect/verify happens. It is a one-time step: once
// verified_youtube_channel_id is set, this page just shows status +
// metrics, and /katube/upload never asks again — it only re-checks the
// already-verified channelId per upload (server-side, no user action).

interface ChannelStatus {
  verifiedChannelId: string | null;
  pendingChannelId: string | null;
  pendingCode: string | null;
  channelHandle: string | null;
}

interface KatubeStats {
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
}

export default function KaTubeProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [channelStatus, setChannelStatus] = useState<ChannelStatus | null>(null);
  const [channelLoading, setChannelLoading] = useState(true);
  const [channelInput, setChannelInput] = useState('');
  const [channelBusy, setChannelBusy] = useState(false);
  const [channelError, setChannelError] = useState('');
  const [channelTitle, setChannelTitle] = useState('');

  const [stats, setStats] = useState<KatubeStats>({ totalVideos: 0, totalViews: 0, totalLikes: 0 });

  const refreshChannelStatus = async (uid: string) => {
    setChannelLoading(true);
    const { data } = await supabase
      .from('creator_profiles')
      .select('verified_youtube_channel_id, pending_youtube_channel_id, youtube_verification_code, youtube_channel_handle')
      .eq('user_id', uid)
      .maybeSingle();
    setChannelStatus({
      verifiedChannelId: data?.verified_youtube_channel_id ?? null,
      pendingChannelId: data?.pending_youtube_channel_id ?? null,
      pendingCode: data?.youtube_verification_code ?? null,
      channelHandle: data?.youtube_channel_handle ?? null,
    });
    setChannelLoading(false);
  };

  const refreshStats = async (uid: string) => {
    const { data } = await supabase.from('videos').select('views, likes').eq('creator_id', uid);
    const totalVideos = data?.length ?? 0;
    const totalViews = (data ?? []).reduce((sum, v) => sum + (v.views ?? 0), 0);
    const totalLikes = (data ?? []).reduce((sum, v) => sum + (v.likes ?? 0), 0);
    setStats({ totalVideos, totalViews, totalLikes });
  };

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setPostLoginRedirect('/dashboard/katube');
        window.location.href = '/login';
        return;
      }
      setUser(data.user);
      setLoading(false);
      await Promise.all([refreshChannelStatus(data.user.id), refreshStats(data.user.id)]);
    };
    init();
  }, []);

  async function authHeader() {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token || ''}` };
  }

  async function handleConnectChannel(e: React.FormEvent) {
    e.preventDefault();
    setChannelError('');
    if (!channelInput.trim()) { setChannelError('Enter your channel URL or @handle.'); return; }
    setChannelBusy(true);
    try {
      const res = await fetch('/api/katube/channel/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ channelInput: channelInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setChannelError(data.error || 'Something went wrong.'); return; }
      setChannelTitle(data.channelTitle || '');
      if (user) await refreshChannelStatus(user.id);
    } catch {
      setChannelError('Network error — try again.');
    } finally {
      setChannelBusy(false);
    }
  }

  async function handleVerifyChannel() {
    setChannelError('');
    setChannelBusy(true);
    try {
      const res = await fetch('/api/katube/channel/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      });
      const data = await res.json();
      if (!res.ok) { setChannelError(data.error || 'Verification failed.'); return; }
      if (user) await refreshChannelStatus(user.id);
    } catch {
      setChannelError('Network error — try again.');
    } finally {
      setChannelBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '40px 24px 60px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#2563eb', letterSpacing: '0.06em', marginBottom: '10px' }}>
          🎬 KATUBE
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Your KaTube channel</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '13.5px', margin: '0 0 32px', lineHeight: 1.6 }}>
          One MANGAL profile, one verified YouTube channel. Verify once here — every
          upload on <Link href="/katube/upload" style={{ color: '#2563eb', fontWeight: 700 }}>KaTube</Link> is
          then checked against it automatically, no re-verifying needed.
        </p>

        {loading || channelLoading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading…</div>
        ) : (
          <>
            {/* ── Metrics ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '28px' }}>
              {[
                { label: 'Videos', value: stats.totalVideos },
                { label: 'Total views', value: stats.totalViews },
                { label: 'Total likes', value: stats.totalLikes },
              ].map(m => (
                <div key={m.label} style={{
                  padding: '16px', borderRadius: '12px', background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '20px', fontWeight: 900 }}>{m.value.toLocaleString()}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{m.label}</div>
                </div>
              ))}
            </div>

            {/* ── Channel verification ── */}
            <div style={{
              padding: '20px', borderRadius: '12px', background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}>
              {channelStatus?.verifiedChannelId ? (
                <>
                  <h2 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '6px' }}>✅ Channel verified</h2>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', lineHeight: 1.6, marginBottom: '14px' }}>
                    {channelStatus.channelHandle ? <>Connected to <strong>{channelStatus.channelHandle}</strong>. </> : null}
                    Every video you upload is checked against this channel — you won&apos;t be asked to verify again.
                  </p>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-faint, var(--text-tertiary))' }}>
                    Need to switch channels? Use the &quot;Get verification code&quot; form for a new
                    channel/handle and it&apos;ll replace this one once re-verified.
                  </p>
                  <form onSubmit={handleConnectChannel} style={{ marginTop: '12px' }}>
                    <input
                      type="text"
                      value={channelInput}
                      onChange={e => setChannelInput(e.target.value)}
                      placeholder="https://youtube.com/@newhandle"
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: '10px',
                        border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                        color: 'var(--text-primary)', fontSize: '13px', marginBottom: '10px',
                        boxSizing: 'border-box',
                      }}
                    />
                    {channelError && (
                      <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '10px' }}>{channelError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={channelBusy}
                      style={{
                        padding: '9px 16px', borderRadius: '10px', background: 'transparent',
                        border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                        fontSize: '12.5px', fontWeight: 700, cursor: channelBusy ? 'default' : 'pointer',
                      }}
                    >{channelBusy ? 'Looking up…' : 'Connect a different channel'}</button>
                  </form>
                </>
              ) : !channelStatus?.pendingCode ? (
                <>
                  <h2 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '6px' }}>Connect your YouTube channel</h2>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '18px', lineHeight: 1.6 }}>
                    One-time check so nobody can upload a video that isn&apos;t actually theirs.
                  </p>
                  <form onSubmit={handleConnectChannel}>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>
                      Your YouTube channel URL or @handle
                    </label>
                    <input
                      type="text"
                      value={channelInput}
                      onChange={e => setChannelInput(e.target.value)}
                      placeholder="https://youtube.com/@yourhandle"
                      style={{
                        width: '100%', padding: '11px 14px', borderRadius: '10px',
                        border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                        color: 'var(--text-primary)', fontSize: '13.5px', marginBottom: '12px',
                        boxSizing: 'border-box',
                      }}
                    />
                    {channelError && (
                      <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>{channelError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={channelBusy}
                      style={{
                        padding: '10px 18px', borderRadius: '10px', border: 'none',
                        background: channelBusy ? 'var(--border-color)' : '#2563eb', color: '#fff',
                        fontSize: '13px', fontWeight: 700, cursor: channelBusy ? 'default' : 'pointer',
                      }}
                    >{channelBusy ? 'Looking up…' : 'Get verification code'}</button>
                  </form>
                </>
              ) : (
                <>
                  <h2 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '6px' }}>Paste this code on YouTube</h2>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.6 }}>
                    {channelTitle ? `Found "${channelTitle}". ` : ''}
                    Paste this code anywhere in your channel&apos;s <strong>About / description</strong> on
                    YouTube, save it, then come back and hit Verify.
                  </p>
                  <code style={{
                    display: 'block', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px',
                    background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                    fontSize: '13px', fontWeight: 700, color: '#2563eb', wordBreak: 'break-all',
                  }}>{channelStatus.pendingCode}</code>
                  {channelError && (
                    <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>{channelError}</p>
                  )}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={handleVerifyChannel}
                      disabled={channelBusy}
                      style={{
                        padding: '10px 18px', borderRadius: '10px', border: 'none',
                        background: channelBusy ? 'var(--border-color)' : '#2563eb', color: '#fff',
                        fontSize: '13px', fontWeight: 700, cursor: channelBusy ? 'default' : 'pointer',
                      }}
                    >{channelBusy ? 'Checking…' : "I've added it — Verify"}</button>
                    <button
                      onClick={() => { setChannelInput(''); if (user) refreshChannelStatus(user.id); }}
                      style={{
                        padding: '10px 16px', borderRadius: '10px', background: 'transparent',
                        border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                        fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                      }}
                    >Use a different channel</button>
                  </div>
                </>
              )}
            </div>

            {channelStatus?.verifiedChannelId && (
              <Link href="/katube/upload" style={{
                display: 'block', textAlign: 'center', marginTop: '20px',
                padding: '13px', borderRadius: '10px', textDecoration: 'none',
                background: '#2563eb', color: '#fff', fontSize: '14px', fontWeight: 800,
              }}>Upload a video →</Link>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
