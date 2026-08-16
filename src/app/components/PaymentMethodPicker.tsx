'use client';

import { useState } from 'react';
import { CreditCard, Smartphone, Landmark, Check, type LucideIcon } from 'lucide-react';

// Pure UI, deliberately NOT wired to /api/payments/* (see CONTEXT.md
// §48) — no order is created, no Razorpay call happens, selecting a
// method and pressing Pay does nothing yet. Design preview only, so the
// founder can approve the look before it's connected. When it's time to
// go live, wiring this up is: pass a real `onPay` handler that calls
// POST /api/payments/create-order with the selected method + amount,
// then opens Razorpay Checkout.js — nothing in this file needs to change.
//
// No brand logos reproduced (Google Pay, UPI, bank logos, card networks)
// — colored initials/generic icons only, same approach most checkout UIs
// use for a payment-method row without licensing individual brand marks.

export type PaymentMethodId = 'card' | 'upi' | 'gpay' | 'netbanking';

interface MethodOption {
  id: PaymentMethodId;
  label: string;
  sublabel: string;
  icon: LucideIcon;
  color: string; // method-distinct accent, used on the icon badge regardless of selection state
}

const METHODS: MethodOption[] = [
  { id: 'card', label: 'Card', sublabel: 'Credit / Debit', icon: CreditCard, color: '#3b82f6' },
  { id: 'upi', label: 'UPI', sublabel: 'Any UPI app', icon: Smartphone, color: '#059669' },
  { id: 'gpay', label: 'Google Pay', sublabel: 'via UPI', icon: Smartphone, color: '#4285F4' },
  { id: 'netbanking', label: 'Net Banking', sublabel: 'All major banks', icon: Landmark, color: '#7c3aed' },
];

// Text-initial badges, not real bank logos — colors are loosely evocative
// (not exact brand colors) so this reads as "a bank" without claiming to
// be any specific bank's actual mark.
const BANKS: { initials: string; name: string; color: string }[] = [
  { initials: 'SBI', name: 'State Bank of India', color: '#1d4ed8' },
  { initials: 'HDFC', name: 'HDFC Bank', color: '#dc2626' },
  { initials: 'ICICI', name: 'ICICI Bank', color: '#ea580c' },
  { initials: 'AXIS', name: 'Axis Bank', color: '#be123c' },
  { initials: 'KOTAK', name: 'Kotak Mahindra', color: '#b91c1c' },
  { initials: 'PNB', name: 'Punjab National Bank', color: '#c2410c' },
];

export default function PaymentMethodPicker({
  amountLabel = '₹49',
  onPay,
}: {
  amountLabel?: string;
  // Optional — omitted (the default) until §48's backend is wired up;
  // the button stays visible but inert, same "Coming Soon" pattern
  // already used on Boost/Tools.
  onPay?: (method: PaymentMethodId) => void;
}) {
  const [selected, setSelected] = useState<PaymentMethodId>('upi');
  const [selectedBank, setSelectedBank] = useState<string | null>(null);

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '18px', padding: '24px', maxWidth: '440px', width: '100%',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: '16px' }}>
        CHOOSE A PAYMENT METHOD
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
        {METHODS.map((m) => {
          const active = selected === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setSelected(m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '11px', textAlign: 'left',
                padding: '13px 14px', borderRadius: '13px', cursor: 'pointer', position: 'relative',
                border: active ? `1.5px solid ${m.color}` : '1px solid var(--border-color)',
                background: active ? `${m.color}14` : 'var(--bg-input)',
                boxShadow: active ? `0 0 0 3px ${m.color}1a` : 'none',
                transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                background: m.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff',
              }}>
                <m.icon size={17} strokeWidth={2} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', marginTop: '1px' }}>{m.sublabel}</div>
              </div>
              {active && (
                <div style={{
                  position: 'absolute', top: '9px', right: '9px', width: '16px', height: '16px', borderRadius: '50%',
                  background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={10} strokeWidth={3} color="#fff" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {(selected === 'upi' || selected === 'gpay') && (
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: '7px' }}>
            UPI ID (optional)
          </label>
          <input
            type="text"
            placeholder="yourname@bank"
            disabled
            style={{
              width: '100%', padding: '11px 13px', borderRadius: '10px',
              border: '1px solid var(--border-color)', background: 'var(--bg-input)',
              color: 'var(--text-faint)', fontSize: '13px', outline: 'none',
            }}
          />
        </div>
      )}

      {selected === 'netbanking' && (
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: '9px' }}>
            SELECT YOUR BANK
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {BANKS.map((b) => {
              const bankActive = selectedBank === b.initials;
              return (
                <button
                  key={b.initials}
                  onClick={() => setSelectedBank(b.initials)}
                  title={b.name}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    padding: '10px 6px', borderRadius: '11px', cursor: 'pointer',
                    border: bankActive ? `1.5px solid ${b.color}` : '1px solid var(--border-color)',
                    background: bankActive ? `${b.color}14` : 'var(--bg-input)',
                    transition: 'border-color 0.15s ease, background 0.15s ease',
                  }}
                >
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '9px', background: b.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '8.5px', fontWeight: 800, letterSpacing: '-0.01em',
                  }}>
                    {b.initials.slice(0, 4)}
                  </div>
                  <div style={{ fontSize: '9.5px', color: 'var(--text-tertiary)', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
                    {b.initials}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => onPay?.(selected)}
        disabled={!onPay}
        style={{
          width: '100%', padding: '14px 0', borderRadius: '12px', border: 'none',
          background: onPay ? 'var(--accent)' : 'var(--border-color)',
          color: onPay ? '#fff' : 'var(--text-faint)',
          fontWeight: 800, fontSize: '13.5px',
          cursor: onPay ? 'pointer' : 'not-allowed',
        }}
      >
        {onPay ? `Pay ${amountLabel}` : `Pay ${amountLabel} — Coming Soon`}
      </button>

      <div style={{ fontSize: '10px', color: 'var(--text-faint)', textAlign: 'center', marginTop: '11px' }}>
        Payments are not live yet — this is a design preview.
      </div>
    </div>
  );
}
