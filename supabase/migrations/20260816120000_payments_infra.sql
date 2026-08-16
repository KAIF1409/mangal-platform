-- §27/§28d payment-provider unblock: infra only, no paywall/UI yet (see
-- CONTEXT.md — founder explicitly deferred the ₹49/month tier and any
-- gating until there's real traffic; this table exists so the checkout
-- wiring has somewhere to write to, not to power a feature yet).
--
-- Generic on purpose — `purpose` is a free-form enum-like text column
-- rather than a dedicated `subscriptions` table, since it isn't decided
-- yet whether the first real payment feature will be a subscription, a
-- one-off tip, or something else. Whichever ships first can read/write
-- rows here without a schema change; a more specific table (e.g. real
-- `subscriptions` with plan/period columns) can be added alongside this
-- later without touching what's here.

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Razorpay identifiers. order_id is created first (before checkout
  -- opens); payment_id + signature are filled in once Razorpay's
  -- checkout callback fires and we verify the payment server-side.
  razorpay_order_id text not null unique,
  razorpay_payment_id text,
  razorpay_signature text,

  amount_paise integer not null, -- store paise (smallest unit), not rupees, to avoid float rounding
  currency text not null default 'INR',

  -- What this payment is for. No foreign key on purpose by design (see
  -- note above) — 'tip', 'subscription', 'pro_creator', etc. once those
  -- features exist. purpose_ref_id is an optional loosely-typed pointer
  -- (e.g. the creator being tipped, a series id) — interpreted based on
  -- `purpose`, not constrained at the DB level since the target table
  -- varies per purpose.
  purpose text not null,
  purpose_ref_id uuid,

  status text not null default 'created' check (status in ('created', 'authorized', 'captured', 'failed', 'refunded')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_user_id_idx on payments(user_id);
create index if not exists payments_status_idx on payments(status);
create index if not exists payments_razorpay_order_id_idx on payments(razorpay_order_id);

alter table payments enable row level security;

-- A user can see their own payment history, nothing else. All writes go
-- through the service-role client in the API routes (order creation,
-- signature verification, webhook) — no direct client-side insert/update
-- policy, since payment status must only ever be set server-side after
-- verifying Razorpay's signature.
create policy "Users can view their own payments"
  on payments for select
  using (auth.uid() = user_id);

create or replace function set_payments_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists payments_updated_at on payments;
create trigger payments_updated_at
  before update on payments
  for each row execute function set_payments_updated_at();
