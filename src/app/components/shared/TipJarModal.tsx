'use client';

import { useState } from 'react';
import { X, Coffee, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { openRazorpayCheckout, getRazorpayPublicKey } from '../../lib/payments/razorpayClient';

// §94 — first real payment feature built on top of §48/§49's Razorpay
// infra (see CONTEXT.md). "Buy Me a Coffee" style one-time tip: fixed
// amount presets, no subscription, no unlock logic — just a `payments`
// row with purpose='tip' and purpose_ref_id = the recipient's user_id.
//
// Two rails, shown side by side:
//   - Razorpay (UPI/cards/netbanking) for India — covers PhonePe/Google
//     Pay/Paytm automatically, since those are UPI apps, not separate
//     gateways; whichever app is on the payer's phone shows up inside
//     Razorpay's own UPI intent flow. Nothing extra to integrate per app.
//   - PayPal for everyone else — a plain paypal.me link (no PayPal API
//     keys needed), opens in a new tab with the amount prefilled.
// Both are gated the same way the rest of this payments layer already
// is: if the relevant env var isn't set yet, that rail shows "coming
// soon" instead of a broken button. Nothing fakes readiness.

const AMOUNT_PRESETS_INR = [
  { label: '₹49', paise: 4900 },
  { label: '₹99', paise: 9900 },
  { label: '₹199', paise: 19900 },
];

const AMOUNT_PRESETS_USD = [
  { label: '$2', value: 2 },
  { label: '$5', value: 5 },
  { label: '$10', value: 10 },
];

type FlowState = 'picking' | 'processing' | 'success' | 'error';

export default function TipJarModal({
  recipientUserId,
  recipientLabel,
  onClose,
}: {
  recipientUserId: string;
  recipientLabel: string; // e.g. "@username" or channel name, shown in the modal copy
  onClose: () => void;
}) {
  const [selectedInr, setSelectedInr] = useState(AMOUNT_PRESETS_INR[1]); // default ₹99
  const [selectedUsd, setSelectedUsd] = useState(AMOUNT_PRESETS_USD[1]); // default $5
  const [state, setState] = useState<FlowState>('picking');
  const [errorMsg, setErrorMsg] = useState('');

  const razorpayReady = !!getRazorpayPublicKey();
  const paypalUsername = process.env.NEXT_PUBLIC_PAYPAL_ME_USERNAME;
  const paypalReady = !!paypalUsername;

  async function handleRazorpayTip() {
    setState('processing');
    setErrorMsg('');
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        setErrorMsg('Please log in to send a tip.');
        setState('error');
        return;
      }

      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amountPaise: selectedInr.paise,
          purpose: 'tip',
          purposeRefId: recipientUserId,
        }),
      });
      const orderData = await res.json();
      if (!res.ok) {
        setErrorMsg(orderData.error ?? 'Could not start payment.');
        setState('error');
        return;
      }

      const opened = await openRazorpayCheckout({
        orderId: orderData.orderId,
        amountPaise: orderData.amountPaise,
        description: `Tip for ${recipientLabel}`,
        prefillEmail: session?.session?.user?.email ?? undefined,
        onSuccess: async (response) => {
          const verifyRes = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(response),
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.verified) {
            setState('success');
          } else {
            setErrorMsg(verifyData.error ?? 'Payment could not be verified.');
            setState('error');
          }
        },
        onDismiss: () => {
          // User closed the Razorpay widget without paying — quietly back
          // out to the picker rather than showing an error.
          setState((s) => (s === 'processing' ? 'picking' : s));
        },
      });

      if (!opened.ok) {
        setErrorMsg(opened.error);
        setState('error');
      }
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
      setState('error');
    }
  }

  function handlePaypalTip() {
    if (!paypalUsername) return;
    window.open(`https://paypal.me/${paypalUsername}/${selectedUsd.value}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '20px', padding: '26px', maxWidth: '440px', width: '100%',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '13px', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <Coffee size={22} strokeWidth={2} />
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {state === 'success' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle2 size={40} color="#059669" style={{ marginBottom: '12px' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 6px' }}>Thank you! ☕</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: '0 0 20px' }}>
              Your tip for {recipientLabel} went through.
            </p>
            <button
              onClick={onClose}
              style={{
                padding: '11px 24px', borderRadius: '10px', border: 'none',
                background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: '18px', fontWeight: 900, margin: '10px 0 4px' }}>Buy {recipientLabel} a coffee</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: '0 0 20px' }}>
              A small one-time tip — no account or subscription needed.
            </p>

            {/* India rail — Razorpay (covers UPI, PhonePe, Google Pay, Paytm, cards, netbanking) */}
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.06em', marginBottom: '10px' }}>
              INDIA — UPI / CARDS / NETBANKING
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
              {AMOUNT_PRESETS_INR.map((p) => {
                const active = selectedInr.paise === p.paise;
                return (
                  <button
                    key={p.paise}
                    onClick={() => setSelectedInr(p)}
                    disabled={state === 'processing'}
                    style={{
                      padding: '12px 0', borderRadius: '11px', cursor: 'pointer', fontWeight: 800, fontSize: '14px',
                      border: active ? '1.5px solid var(--accent)' : '1px solid var(--border-color)',
                      background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-input)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleRazorpayTip}
              disabled={!razorpayReady || state === 'processing'}
              style={{
                width: '100%', padding: '13px 0', borderRadius: '11px', border: 'none', marginBottom: '20px',
                background: razorpayReady ? 'var(--accent)' : 'var(--border-color)',
                color: razorpayReady ? '#fff' : 'var(--text-faint)',
                fontWeight: 800, fontSize: '13.5px',
                cursor: razorpayReady && state !== 'processing' ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              {state === 'processing' ? (
                <><Loader2 size={16} className="mangal-spin" /> Processing...</>
              ) : razorpayReady ? (
                `Pay ${selectedInr.label} via UPI/Card`
              ) : (
                'India payments — coming soon'
              )}
            </button>

            {/* International rail — PayPal.me, no keys required */}
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.06em', marginBottom: '10px' }}>
              OUTSIDE INDIA — PAYPAL
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
              {AMOUNT_PRESETS_USD.map((p) => {
                const active = selectedUsd.value === p.value;
                return (
                  <button
                    key={p.value}
                    onClick={() => setSelectedUsd(p)}
                    style={{
                      padding: '12px 0', borderRadius: '11px', cursor: 'pointer', fontWeight: 800, fontSize: '14px',
                      border: active ? '1.5px solid #0070ba' : '1px solid var(--border-color)',
                      background: active ? 'rgba(0,112,186,0.12)' : 'var(--bg-input)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handlePaypalTip}
              disabled={!paypalReady}
              style={{
                width: '100%', padding: '13px 0', borderRadius: '11px', border: 'none',
                background: paypalReady ? '#0070ba' : 'var(--border-color)',
                color: paypalReady ? '#fff' : 'var(--text-faint)',
                fontWeight: 800, fontSize: '13.5px',
                cursor: paypalReady ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              {paypalReady ? (
                <>Pay {selectedUsd.label} via PayPal <ExternalLink size={14} /></>
              ) : (
                'PayPal — coming soon'
              )}
            </button>

            {state === 'error' && (
              <div style={{
                marginTop: '14px', padding: '10px 12px', borderRadius: '10px',
                background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
                color: '#dc2626', fontSize: '12px', fontWeight: 600,
              }}>
                {errorMsg}
              </div>
            )}
          </>
        )}
      </div>
      <style jsx global>{`
        .mangal-spin { animation: mangal-spin-rotate 0.8s linear infinite; }
        @keyframes mangal-spin-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
