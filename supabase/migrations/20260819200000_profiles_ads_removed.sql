-- §95 — "Remove Ads" paid unlock (see CONTEXT.md). Flag-only, same as the
-- founder's explicit ask: build the paid flag now, wire it to actual ad
-- placements later once ads exist somewhere on the platform (nothing
-- shows ads today — confirmed by search before writing this migration).
--
-- Boolean, not a timestamp/expiry column — this is a one-time lifetime
-- unlock (₹99 flat, decided by the founder), not a subscription. If a
-- recurring "ad-free" tier gets built later (§28d mentions this as a
-- possibility), that's a separate `ads_removed_until timestamptz` column
-- added alongside this one, not a replacement for it — a lifetime buyer
-- shouldn't lose access because a later subscription model appears.

alter table profiles
  add column if not exists ads_removed boolean not null default false;

comment on column profiles.ads_removed is 'One-time paid unlock (₹99, purpose=remove_ads in the payments table) — true once /api/payments/verify or the Razorpay webhook confirms a captured payment for this user. Never set client-side.';
