'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { useStudioAuth } from '../lib/useStudioAuth';
import { CheckCircle2, ArrowRight } from 'lucide-react';

// §114 — this is the exact channel-verify flow that used to live at
// /katube/dashboard (§6), relocated here per the founder's answer:
// "old channel-verify flow moves into Studio as a Channel setup tab."
// Logic is unchanged from the old page — only the shell around it moved.
interface ChannelStatus {
  verifiedChannelId: string | null;
  pendingChannelId: string | null;
  pendingCode: string | null;
  channelHandle: string | null;
}

export default function ChannelSetupPage() {
  const { user, loading } = useStudioAuth('/mangal-studio/katube/channel-setup');
  const [channelStatus, setChannelStatus] = useState<ChannelStatus | null>(null);
  const [channelLoading, setChannelLoading] = useState(true);
  const [channelInput, setChannelInput] = useState('');
  const [channelBusy, setChannelBusy] = useState(false);
  const [channelError, setChannelError] = useState('');
  const [channelTitle, setChannelTitle] = useState('');

  const refreshChannelStatus = async () => {
    setChannelLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/creator/youtube-status', {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    });
    const data = res.ok ? await res.json() : null;
    setChannelStatus({
      verifiedChannelId: data?.verifiedChannelId ?? null,
      pendingChannelId: data?.pendingChannelId ?? null,
      pendingCode: data?.pendingCode ?? null,
      channelHandle: data?.channelHandle ?? null,
    });
    setChannelLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    const load = async () => { await refreshChannelStatus(); };
    load();
  }, [user]);

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
      await refreshChannelStatus();
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
      await refreshChannelStatus();
    } catch {
      setChannelError('Network error — try again.');
    } finally {
      setChannelBusy(false);
    }
  }

  if (loading || channelLoading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: '520px' }}>
      <div style={{ padding: '20px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        {channelStatus?.verifiedChannelId ? (
          <>
            <h2 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={16} /> Channel verified</h2>
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
              {channelError && <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '10px' }}>{channelError}</p>}
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
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>Your YouTube channel URL or @handle</label>
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
              {channelError && <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>{channelError}</p>}
              <button
                type="submit"
                disabled={channelBusy}
                style={{
                  padding: '10px 18px', borderRadius: '10px', border: 'none',
                  background: channelBusy ? 'var(--border-color)' : 'var(--accent)', color: '#fff',
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
              fontSize: '13px', fontWeight: 700, color: 'var(--accent)', wordBreak: 'break-all',
            }}>{channelStatus.pendingCode}</code>
            {channelError && <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>{channelError}</p>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleVerifyChannel}
                disabled={channelBusy}
                style={{
                  padding: '10px 18px', borderRadius: '10px', border: 'none',
                  background: channelBusy ? 'var(--border-color)' : 'var(--accent)', color: '#fff',
                  fontSize: '13px', fontWeight: 700, cursor: channelBusy ? 'default' : 'pointer',
                }}
              >{channelBusy ? 'Checking…' : "I've added it — Verify"}</button>
              <button
                onClick={() => { setChannelInput(''); refreshChannelStatus(); }}
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
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', textAlign: 'center', marginTop: '20px',
          padding: '13px', borderRadius: '10px', textDecoration: 'none',
          background: 'var(--accent)', color: '#fff', fontSize: '14px', fontWeight: 800,
        }}>Upload a video <ArrowRight size={15} strokeWidth={2} /></Link>
      )}
    </div>
  );
}
