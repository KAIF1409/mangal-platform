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

// crypto.timingSafeEqual THROWS a RangeError if the two buffers aren't the
// same byte length, instead of returning false. Both callers below feed it
// raw, attacker-controlled input (a client-supplied razorpay_signature, or
// the public webhook's x-razorpay-signature header) with no length check —
// so a short/garbage signature crashed the request (uncaught exception ->
// opaque 500) instead of failing the check cleanly with a 400, on both an
// authenticated route AND the public unauthenticated webhook endpoint.
// This still runs the real timing-safe comparison whenever lengths match;
// it only short-circuits (safely, not on secret-dependent data) when they
// don't, which itself leaks no more than "this signature is the wrong
// length" — no different from what timingSafeEqual's own crash already
// revealed to an attacker via HTTP status/timing.
function safeCompare(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'utf8');
  const actual = Buffer.from(actualHex, 'utf8');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
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

  return safeCompare(expected, params.signature);
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

  return safeCompare(expected, signature);
}
