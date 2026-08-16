'use client';

import { useState } from 'react';
import { CreditCard, Smartphone, Building2, type LucideIcon } from 'lucide-react';

// Pure UI, deliberately NOT wired to /api/payments/* (see CONTEXT.md
// §48) — no order is created, no Razorpay call happens, selecting a
// method and pressing Pay does nothing yet. This exists purely so the
// founder can look at and approve the payment-method UI design before
// any of it gets connected to the real checkout flow, which is still
// gated on a Razorpay account existing (§48) and a decision on which
// payment feature ships first (§31 decision 3 stays deferred).
//
// No brand logos reproduced (Google Pay, UPI, Visa/Mastercard etc.) —
// text badges + generic icons only, same pattern most checkout UIs use
// for a payment-method row without licensing individual brand marks.

export type PaymentMethodId = 'card' | 'upi' | 'gpay' | 'netbanking';

interface MethodOption {
  id: PaymentMethodId;
  label: string;
  sublabel: string;
  icon: LucideIcon;
}

const METHODS: MethodOption[] = [
  { id: 'card', label: 'Card', sublabel: 'Credit / Debit', icon: CreditCard },
  { id: 'upi', label: 'UPI', sublabel: 'Any UPI app', icon: Smartphone },
  { id: 'gpay', label: 'Google Pay', sublabel: 'via UPI', icon: Smartphone },
  { id: 'netbanking', label: 'Net Banking', sublabel: 'All major banks', icon: Building2 },
];

export default function PaymentMethodPicker({
  amountLabel = '₹49',
  onPay,
}: {
  amountLabel?: string;
  // Optional — if provided, called on "Pay" click with the selected
  // method id. If omitted (the default, and how this ships until §48's
  // backend is wired up), the button stays visually present but does
  // nothing, same "Coming Soon" pattern already used on Boost/Tools.
  onPay?: (method: PaymentMethodId) => void;
}) {
  const [selected, setSelected] = useState<PaymentMethodId>('upi');

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '16px', padding: '22px', maxWidth: '420px', width: '100%',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.06em', marginBottom: '14px' }}>
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
                display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
                border: active ? '1.5px solid var(--accent)' : '1px solid var(--border-color)',
                background: active ? 'rgba(var(--accent-rgb), 0.08)' : 'var(--bg-input)',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
            >
              <div style={{
                width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0,
                background: active ? 'var(--accent)' : 'var(--bg-card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: active ? '#fff' : 'var(--text-tertiary)',
              }}>
                <m.icon size={16} strokeWidth={2} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>{m.sublabel}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* UPI ID quick-entry row — only meaningful when UPI/Google Pay is
          selected; visual only, this input isn't wired to anything. */}
      {(selected === 'upi' || selected === 'gpay') && (
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-tertiary)', display: 'block', marginBottom: '6px' }}>
            UPI ID (optional)
          </label>
          <input
            type="text"
            placeholder="yourname@bank"
            disabled
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '9px',
              border: '1px solid var(--border-color)', background: 'var(--bg-input)',
              color: 'var(--text-faint)', fontSize: '13px', outline: 'none',
            }}
          />
        </div>
      )}

      <button
        onClick={() => onPay?.(selected)}
        disabled={!onPay}
        style={{
          width: '100%', padding: '13px 0', borderRadius: '11px', border: 'none',
          background: onPay ? 'var(--accent)' : 'var(--border-color)',
          color: onPay ? '#fff' : 'var(--text-faint)',
          fontWeight: 800, fontSize: '13.5px',
          cursor: onPay ? 'pointer' : 'not-allowed',
        }}
      >
        {onPay ? `Pay ${amountLabel}` : `Pay ${amountLabel} — Coming Soon`}
      </button>

      <div style={{ fontSize: '10px', color: 'var(--text-faint)', textAlign: 'center', marginTop: '10px' }}>
        Payments are not live yet — this is a design preview.
      </div>
    </div>
  );
}
