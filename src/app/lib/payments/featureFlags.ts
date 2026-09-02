// §141 — single source of truth for whether the "global payments" rails
// (Razorpay card/UPI/netbanking picker, PayPal.me) are shown at all.
// Default off: for now every checkout point uses direct-UPI only (see
// DirectUpiPay.tsx). Flip NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS=true once
// there's a real Razorpay account and/or international customers — no
// code changes needed at any of the call sites that check this.
export const GLOBAL_PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS === 'true';
