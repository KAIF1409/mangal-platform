import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyWebhookSignature } from '../../../lib/razorpay';

// Infra-only per §27/§28d (see CONTEXT.md) — nothing is configured to
// call this yet (no webhook URL has been registered in a Razorpay
// dashboard, since there's no Razorpay account yet). This exists so
// wiring the actual dashboard webhook later is a one-line config change,
// not new code.
//
// This is a server-to-server callback from Razorpay, not a browser
// request — there's no user session/JWT to forward, so (same pattern as
// confirm-parent-consent, see that route) this uses the service-role
// client rather than requireUser. The webhook signature check below is
// what stands in for auth here — never skip it.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-razorpay-signature');
  const rawBody = await req.text();

  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string; method?: string; bank?: string; vpa?: string } } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) {
    // Not a payment event we care about (Razorpay sends many event
    // types) — acknowledge with 200 so Razorpay doesn't retry.
    return NextResponse.json({ received: true });
  }

  // Maps Razorpay's event name to our own `payments.status` enum. Only
  // captured/failed are handled for now — refunds aren't a case that can
  // happen yet since nothing charges money in production.
  const statusByEvent: Record<string, string> = {
    'payment.captured': 'captured',
    'payment.failed': 'failed',
    'payment.authorized': 'authorized',
  };
  const nextStatus = event.event ? statusByEvent[event.event] : undefined;
  if (!nextStatus) {
    return NextResponse.json({ received: true });
  }

  const { error } = await supabaseAdmin
    .from('payments')
    .update({
      status: nextStatus,
      razorpay_payment_id: payment.id ?? null,
      // Authoritative method details — only ever written here, from
      // Razorpay's own webhook payload, never from the client. bank/vpa
      // are only present for netbanking/UPI payments respectively;
      // Razorpay omits the field entirely for other methods, so these
      // fall back to null rather than overwriting a previous value with
      // undefined-turned-null on a later event for the same order.
      ...(payment.method ? { method: payment.method } : {}),
      ...(payment.bank ? { bank: payment.bank } : {}),
      ...(payment.vpa ? { vpa: payment.vpa } : {}),
    })
    .eq('razorpay_order_id', payment.order_id);

  if (error) {
    // Return 500 so Razorpay retries the webhook — a DB hiccup shouldn't
    // silently drop a real payment event.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
