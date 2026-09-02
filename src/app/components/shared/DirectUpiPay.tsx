'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Copy, Check, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { buildUpiUri } from '../../lib/payments/upi';

// §141 — the direct-UPI counterpart to the Razorpay checkout calls
// scattered across TipJarModal / settings / the book-purchase pages. No
// gateway account required: pays straight to a personal UPI ID (the
// founder's, or a creator's own once they've verified one — see
// CreatorUpiSettings.tsx), shown as a QR + upi:// deep link.
//
// Deliberately honest about what it can and can't confirm: there is no
// callback for a raw UPI transfer, so this ends in "pending confirmation"
// rather than an instant unlock. `onPending` is how a caller reflects
// that (e.g. showing "Remove Ads — pending confirmation" instead of
// silently doing nothing).

interface DirectUpiPayProps {
  amountPaise: number;
  purpose: 'tip' | 'remove_ads' | 'book_purchase';
  purposeRefId?: string;
  description: string; // shown as the payment note / heading, e.g. "Tip for @riya" or "Remove Ads — lifetime"
  onPending?: () => void;
}

type FlowState = 'loading' | 'ready' | 'reporting' | 'reported' | 'error';

export default function DirectUpiPay({ amountPaise, purpose, purposeRefId, description, onPending }: DirectUpiPayProps) {
  const [state, setState] = useState<FlowState>('loading');
  const [error, setError] = useState('');
  const [intent, setIntent] = useState<{ paymentId: string; vpa: string; payeeName: string; referenceNote: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState('loading');
      setError('');
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) {
          setError('Please log in first.');
          setState('error');
          return;
        }
        const res = await fetch('/api/payments/create-upi-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amountPaise, purpose, purposeRefId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? 'Could not start payment.');
          setState('error');
          return;
        }
        setIntent(data);
        setState('ready');
      } catch {
        if (!cancelled) {
          setError('Something went wrong. Please try again.');
          setState('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [amountPaise, purpose, purposeRefId]);

  async function handleMarkPaid() {
    if (!intent) return;
    setState('reporting');
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const res = await fetch('/api/payments/mark-upi-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentId: intent.paymentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not record payment.');
        setState('error');
        return;
      }
      setState('reported');
      onPending?.();
    } catch {
      setError('Something went wrong. Please try again.');
      setState('error');
    }
  }

  if (state === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px 0', color: 'var(--text-tertiary)' }}>
        <Loader2 size={18} className="mangal-spin" style={{ marginRight: '8px' }} /> Setting up payment…
      </div>
    );
  }

  if (state === 'error' && !intent) {
    return (
      <div style={{
        padding: '12px 14px', borderRadius: '10px', background: 'rgba(220,38,38,0.1)',
        border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', fontSize: '13px', fontWeight: 600,
      }}>
        {error}
      </div>
    );
  }

  if (!intent) return null;

  const amountRupees = amountPaise / 100;
  const upiUri = buildUpiUri({ vpa: intent.vpa, payeeName: intent.payeeName, amountRupees, note: intent.referenceNote });

  if (state === 'reported') {
    return (
      <div style={{ textAlign: 'center', padding: '10px 0' }}>
        <Check size={32} color="#059669" style={{ marginBottom: '10px' }} />
        <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '6px' }}>Thanks — noted!</div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0 }}>
          We&apos;ll confirm your payment shortly (reference <strong>{intent.referenceNote}</strong>). Since this pays
          straight to a UPI ID rather than through a gateway, confirmation is manual — usually within a few hours.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>{description}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>
        Pay ₹{amountRupees.toFixed(2)} to {intent.payeeName} via any UPI app
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
        <div style={{ background: '#fff', padding: '12px', borderRadius: '12px' }}>
          <QRCodeSVG value={upiUri} size={168} />
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        padding: '9px 12px', borderRadius: '10px', background: 'var(--bg-input)',
        border: '1px solid var(--border-color)', marginBottom: '14px',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '9.5px', color: 'var(--text-tertiary)', fontWeight: 700 }}>UPI ID</div>
          <div style={{ fontSize: '12.5px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{intent.vpa}</div>
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(intent.vpa); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', flexShrink: 0 }}
        >
          {copied ? <Check size={16} color="#059669" /> : <Copy size={16} />}
        </button>
      </div>

      <a
        href={upiUri}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          width: '100%', padding: '13px 0', borderRadius: '11px', textDecoration: 'none',
          background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '13.5px', marginBottom: '10px',
        }}
      >
        Open in UPI app <ExternalLink size={14} />
      </a>

      <button
        onClick={handleMarkPaid}
        disabled={state === 'reporting'}
        style={{
          width: '100%', padding: '12px 0', borderRadius: '11px', border: '1px solid var(--border-color)',
          background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '13px',
          cursor: state === 'reporting' ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        {state === 'reporting' ? (<><Loader2 size={15} className="mangal-spin" /> Recording…</>) : "I've paid"}
      </button>

      {state === 'error' && (
        <div style={{ marginTop: '12px', fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>{error}</div>
      )}

      <div style={{ fontSize: '10.5px', color: 'var(--text-faint)', textAlign: 'center', marginTop: '12px' }}>
        Note {intent.referenceNote} — keep it visible, it&apos;s how your payment gets matched.
      </div>
    </div>
  );
}
