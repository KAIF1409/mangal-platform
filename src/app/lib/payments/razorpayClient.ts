'use client';

// Browser-side helper for opening Razorpay's hosted Checkout. Companion to
// ../payments/razorpay.ts (server-only order creation/verification) — see
// CONTEXT.md §48/§49 for the backend this plugs into, and §94 for the
// first real feature (Tip Jar) that uses it.
//
// Razorpay's key_id is safe to expose client-side (it identifies the
// account, doesn't authorize anything on its own — key_secret never
// leaves the server). It's read from NEXT_PUBLIC_RAZORPAY_KEY_ID here;
// until the founder has a real Razorpay account and sets that env var,
// this stays unset and callers should treat the flow as unavailable.

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}

let scriptPromise: Promise<boolean> | null = null;

// Loads https://checkout.razorpay.com/v1/checkout.js exactly once,
// regardless of how many components call this. Resolves false if the
// script fails to load (offline, ad-blocker, etc.) instead of throwing,
// so callers can show a friendly error rather than an unhandled promise
// rejection.
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export function getRazorpayPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? null;
}

// Opens Razorpay Checkout for an already-created order. Caller is
// responsible for calling /api/payments/create-order first to get
// orderId/amountPaise, and for POSTing the handler's callback fields to
// /api/payments/verify once this resolves — this function only drives
// the widget, it doesn't touch the network itself.
export async function openRazorpayCheckout(params: {
  orderId: string;
  amountPaise: number;
  description: string;
  prefillEmail?: string;
  onSuccess: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  onDismiss?: () => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = getRazorpayPublicKey();
  if (!key) return { ok: false, error: 'Payments are not set up yet.' };

  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    return { ok: false, error: 'Could not load the payment widget. Check your connection and try again.' };
  }

  const rzp = new window.Razorpay({
    key,
    amount: params.amountPaise,
    currency: 'INR',
    order_id: params.orderId,
    name: 'Mangal Platform',
    description: params.description,
    prefill: params.prefillEmail ? { email: params.prefillEmail } : undefined,
    theme: { color: '#f97316' },
    handler: params.onSuccess,
    modal: { ondismiss: params.onDismiss },
  });
  rzp.open();
  return { ok: true };
}
