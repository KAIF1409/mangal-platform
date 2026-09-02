'use client';

import { X, Lock } from 'lucide-react';
import DirectUpiPay from './DirectUpiPay';
import { GLOBAL_PAYMENTS_ENABLED } from '../../lib/payments/featureFlags';

// §141 — BookReader has three separate lock-screen "Buy" buttons (mobile
// bar, desktop sidebar, full-page overlay); rather than triplicating the
// direct-UPI panel inline in each, they all just open this one modal.
// onRazorpayBuy is the file's existing handleBuy() — only shown as a
// secondary option once NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS is on, so
// nothing about the original Razorpay flow had to be removed.

export default function BookPurchaseModal({
  bookId,
  bookTitle,
  pricePaise,
  onClose,
  onPending,
  onRazorpayBuy,
  razorpayBuying,
}: {
  bookId: string;
  bookTitle: string;
  pricePaise: number;
  onClose: () => void;
  onPending: () => void;
  onRazorpayBuy: () => void;
  razorpayBuying: boolean;
}) {
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
          borderRadius: '20px', padding: '24px', maxWidth: '400px', width: '100%',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <Lock size={18} strokeWidth={2} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
            <X size={20} />
          </button>
        </div>

        <DirectUpiPay
          amountPaise={pricePaise}
          purpose="book_purchase"
          purposeRefId={bookId}
          description={`Buy "${bookTitle}"`}
          onPending={onPending}
        />

        {GLOBAL_PAYMENTS_ENABLED && (
          <button
            onClick={onRazorpayBuy}
            disabled={razorpayBuying}
            style={{
              width: '100%', padding: '12px 0', borderRadius: '11px', marginTop: '12px',
              border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)',
              fontWeight: 700, fontSize: '13px', cursor: razorpayBuying ? 'wait' : 'pointer',
            }}
          >
            {razorpayBuying ? 'Opening checkout…' : 'Pay via Card / Netbanking instead'}
          </button>
        )}
      </div>
    </div>
  );
}
