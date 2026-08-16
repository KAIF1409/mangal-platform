import Razorpay from 'razorpay';
import crypto from 'crypto';

// Server-only. Infra-only per §27/§28d (see CONTEXT.md) — no paywall or
// checkout UI has been built on top of this yet; this just makes the
// wiring exist so it's a same-day flip once real keys land, instead of a
// new integration. Every function below tolerates missing env vars
// (returns a clear error instead of throwing at import time) since the
// founder hasn't finished Razorpay onboarding yet as of this session.

function getKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

let client: Razorpay | null = null;
function getClient(): Razorpay | null {
  const keys = getKeys();
  if (!keys) return null;
  if (!client) {
    client = new Razorpay({ key_id: keys.keyId, key_secret: keys.keySecret });
  }
  return client;
}

export function isRazorpayConfigured(): boolean {
  return getKeys() !== null;
}

// Creates a Razorpay order for the given amount. Call this before opening
// checkout — the returned order_id is what the client-side Checkout.js
// widget needs. Amount is in paise (smallest currency unit), matching how
// the `payments` table stores it — never pass rupees here.
export async function createOrder(params: {
  amountPaise: number;
  currency?: string;
  receipt: string; // your own reference string, e.g. a payments.id
  notes?: Record<string, string>;
}) {
  const razorpay = getClient();
  if (!razorpay) {
    throw new Error('Razorpay is not configured yet (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).');
  }
  return razorpay.orders.create({
    amount: params.amountPaise,
    currency: params.currency ?? 'INR',
    receipt: params.receipt,
    notes: params.notes,
  });
}

// Verifies the signature Razorpay's checkout callback hands back
// (razorpay_order_id + razorpay_payment_id + razorpay_signature) to
// confirm the payment is genuine before marking a `payments` row
// captured. This is the standard HMAC-SHA256 check from Razorpay's docs
// — never trust the client-side callback without this.
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const keys = getKeys();
  if (!keys) return false;

  const expected = crypto
    .createHmac('sha256', keys.keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(params.signature));
}

// Verifies a webhook payload's signature (different secret from the API
// keys above — set in the Razorpay dashboard when the webhook endpoint is
// configured, kept separate on purpose so a leaked API key can't be used
// to forge webhook calls).
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return false;

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
