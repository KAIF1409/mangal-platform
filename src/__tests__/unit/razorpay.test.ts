import { describe, expect, it, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import { verifyPaymentSignature, verifyWebhookSignature, isRazorpayConfigured } from '@/app/lib/payments/razorpay';

const KEY_SECRET = 'test-key-secret';
const WEBHOOK_SECRET = 'test-webhook-secret';

function realPaymentSignature(orderId: string, paymentId: string, secret = KEY_SECRET) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

function realWebhookSignature(rawBody: string, secret = WEBHOOK_SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('verifyPaymentSignature — checkout callback signature check', () => {
  it('accepts a genuine signature', () => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_id');
    vi.stubEnv('RAZORPAY_KEY_SECRET', KEY_SECRET);
    const signature = realPaymentSignature('order_1', 'pay_1');
    expect(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature })).toBe(true);
  });

  it('rejects a wrong-but-same-length signature (tampered payload)', () => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_id');
    vi.stubEnv('RAZORPAY_KEY_SECRET', KEY_SECRET);
    const real = realPaymentSignature('order_1', 'pay_1');
    const tampered = '0' + real.slice(1); // same length, wrong content
    expect(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: tampered })).toBe(false);
  });

  // Regression for the bug: crypto.timingSafeEqual throws a RangeError on a
  // buffer-length mismatch instead of returning false. A checkout callback
  // signature is fully attacker-controlled request input, so a short (or
  // long, or empty) value must fail cleanly, not crash the route handler.
  it('DOES NOT THROW and returns false for a shorter-than-expected signature', () => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_id');
    vi.stubEnv('RAZORPAY_KEY_SECRET', KEY_SECRET);
    expect(() =>
      verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'short' })
    ).not.toThrow();
    expect(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'short' })).toBe(false);
  });

  it('DOES NOT THROW and returns false for an empty-string signature', () => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_id');
    vi.stubEnv('RAZORPAY_KEY_SECRET', KEY_SECRET);
    expect(() => verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: '' })).not.toThrow();
    expect(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: '' })).toBe(false);
  });

  it('DOES NOT THROW and returns false for a longer-than-expected signature', () => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_id');
    vi.stubEnv('RAZORPAY_KEY_SECRET', KEY_SECRET);
    const real = realPaymentSignature('order_1', 'pay_1');
    const tooLong = real + 'extra-bytes-appended-by-an-attacker';
    expect(() =>
      verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: tooLong })
    ).not.toThrow();
    expect(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: tooLong })).toBe(false);
  });

  it('returns false (never throws) when Razorpay keys are not configured', () => {
    vi.stubEnv('RAZORPAY_KEY_ID', '');
    vi.stubEnv('RAZORPAY_KEY_SECRET', '');
    expect(isRazorpayConfigured()).toBe(false);
    expect(() =>
      verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'anything' })
    ).not.toThrow();
    expect(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'anything' })).toBe(false);
  });

  it('rejects a signature computed for a different order/payment id pair', () => {
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_id');
    vi.stubEnv('RAZORPAY_KEY_SECRET', KEY_SECRET);
    const signatureForOther = realPaymentSignature('order_OTHER', 'pay_OTHER');
    expect(
      verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: signatureForOther })
    ).toBe(false);
  });
});

describe('verifyWebhookSignature — public /api/payments/webhook endpoint', () => {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1' } } } });

  it('accepts a genuine webhook signature', () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', WEBHOOK_SECRET);
    expect(verifyWebhookSignature(body, realWebhookSignature(body))).toBe(true);
  });

  // Same regression as above, but for the endpoint that matters most here:
  // this route has NO auth requirement by design (server-to-server
  // callback), so any anonymous internet request with a malformed
  // x-razorpay-signature header must be rejected cleanly, not crash it.
  it('DOES NOT THROW on a malformed (wrong-length) header from an anonymous request', () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', WEBHOOK_SECRET);
    expect(() => verifyWebhookSignature(body, 'not-a-real-signature')).not.toThrow();
    expect(verifyWebhookSignature(body, 'not-a-real-signature')).toBe(false);
  });

  it('DOES NOT THROW on an empty header value', () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', WEBHOOK_SECRET);
    expect(() => verifyWebhookSignature(body, '')).not.toThrow();
    expect(verifyWebhookSignature(body, '')).toBe(false);
  });

  it('rejects a same-length but tampered signature', () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', WEBHOOK_SECRET);
    const real = realWebhookSignature(body);
    const tampered = real.slice(0, -1) + (real.endsWith('a') ? 'b' : 'a');
    expect(verifyWebhookSignature(body, tampered)).toBe(false);
  });

  it('rejects a signature computed for a different body (payload tampering)', () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', WEBHOOK_SECRET);
    const signatureForOtherBody = realWebhookSignature('{"event":"payment.failed"}');
    expect(verifyWebhookSignature(body, signatureForOtherBody)).toBe(false);
  });

  it('returns false (never throws) when the webhook secret is not configured', () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', '');
    expect(() => verifyWebhookSignature(body, 'anything')).not.toThrow();
    expect(verifyWebhookSignature(body, 'anything')).toBe(false);
  });
});
