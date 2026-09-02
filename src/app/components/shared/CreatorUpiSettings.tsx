'use client';

import { useEffect, useState } from 'react';
import { Wallet, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// §141 — where a creator tells MANGAL which UPI ID their tips should go
// to. Two steps: enter upi_id + phone → code emailed to the account's own
// address → confirm the code. See the migration header for exactly what
// this verification does (and doesn't) prove.

type LoadState = 'loading' | 'unset' | 'pending' | 'verified';

export default function CreatorUpiSettings() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [upiId, setUpiId] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emailedTo, setEmailedTo] = useState('');

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setLoadState('unset'); return; }
      const { data } = await supabase
        .from('creator_profiles')
        .select('upi_id, upi_phone, upi_verification_code, upi_verified_at')
        .eq('user_id', userData.user.id)
        .maybeSingle();

      if (data?.upi_verified_at) {
        setUpiId(data.upi_id ?? '');
        setPhone(data.upi_phone ?? '');
        setLoadState('verified');
      } else if (data?.upi_verification_code) {
        setUpiId(data.upi_id ?? '');
        setPhone(data.upi_phone ?? '');
        setLoadState('pending');
      } else {
        setLoadState('unset');
      }
    })();
  }, []);

  async function authHeader() {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : null;
  }

  async function handleSendCode() {
    setBusy(true);
    setError('');
    try {
      const headers = await authHeader();
      if (!headers) { setError('Please log in first.'); setBusy(false); return; }
      const res = await fetch('/api/creator/upi/request-code', {
        method: 'POST', headers, body: JSON.stringify({ upiId, phone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not send code.'); setBusy(false); return; }
      setEmailedTo(data.emailedTo);
      setLoadState('pending');
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setBusy(false);
  }

  async function handleVerify() {
    setBusy(true);
    setError('');
    try {
      const headers = await authHeader();
      if (!headers) { setError('Please log in first.'); setBusy(false); return; }
      const res = await fetch('/api/creator/upi/verify', {
        method: 'POST', headers, body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Could not verify.'); setBusy(false); return; }
      setLoadState('verified');
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setBusy(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 13px', borderRadius: '10px', marginBottom: '10px',
    border: '1px solid var(--border-color)', background: 'var(--bg-input)',
    color: 'var(--text-primary)', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
  };
  const buttonStyle: React.CSSProperties = {
    width: '100%', padding: '12px 0', borderRadius: '11px', border: 'none',
    background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '13.5px',
    cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: '8px',
  };

  if (loadState === 'loading') {
    return <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-tertiary)', fontSize: '13px' }}><Loader2 size={16} className="mangal-spin" /> Loading…</div>;
  }

  return (
    <div>
      <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Wallet size={16} strokeWidth={2} /> Payout UPI
      </h2>
      <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: '0 0 16px' }}>
        Where tips sent to you should go. Confirmed via a code emailed to your account address.
      </p>

      {loadState === 'verified' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontSize: '13px', fontWeight: 700 }}>
          <CheckCircle2 size={16} /> {upiId} — verified
        </div>
      ) : loadState === 'pending' ? (
        <>
          <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
            Code sent{emailedTo ? ` to ${emailedTo}` : ''}. Enter it below to confirm {upiId}.
          </p>
          <input
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={inputStyle}
          />
          <button onClick={handleVerify} disabled={busy || !code} style={buttonStyle}>
            {busy ? (<><Loader2 size={15} className="mangal-spin" /> Verifying…</>) : 'Verify'}
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            placeholder="yourname@bank"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            style={inputStyle}
          />
          <input
            type="tel"
            placeholder="10-digit mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={inputStyle}
          />
          <button onClick={handleSendCode} disabled={busy || !upiId || !phone} style={buttonStyle}>
            {busy ? (<><Loader2 size={15} className="mangal-spin" /> Sending…</>) : 'Save & send code'}
          </button>
        </>
      )}

      {error && (
        <div style={{ marginTop: '12px', fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>{error}</div>
      )}
    </div>
  );
}
