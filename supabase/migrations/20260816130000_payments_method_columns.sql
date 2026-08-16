-- Follow-up to §48 (payments_infra) — the payment-method picker UI
-- (Card/UPI/Google Pay/Netbanking) shipped without matching columns to
-- record which method was actually used. Adds those now, still
-- infra-only: nothing calls these yet.
--
-- `requested_method` = what the (currently disconnected) picker UI would
-- send at order-creation time — informational only, never trust this for
-- anything security/billing-related, since it's just what the customer
-- clicked before Razorpay's own checkout even ran.
-- `method` / `bank` / `vpa` = what Razorpay's webhook actually reports
-- after the payment completes (payment.entity.method /
-- payment.entity.bank / payment.entity.vpa) — this is the authoritative
-- record of how the customer actually paid, filled in server-side by the
-- webhook handler, never by the client.

alter table payments
  add column if not exists requested_method text,
  add column if not exists method text,
  add column if not exists bank text,
  add column if not exists vpa text;

comment on column payments.requested_method is 'What the payment-method picker UI pre-selected (card/upi/gpay/netbanking) — informational only, set by the client at order-creation time, never authoritative.';
comment on column payments.method is 'Actual method Razorpay reports the payment completed with (card/upi/netbanking/wallet/emi) — set server-side from the webhook payload only.';
comment on column payments.bank is 'Bank code, for netbanking payments — set server-side from the webhook payload only.';
comment on column payments.vpa is 'UPI virtual payment address used, for UPI/Google Pay payments — set server-side from the webhook payload only.';
