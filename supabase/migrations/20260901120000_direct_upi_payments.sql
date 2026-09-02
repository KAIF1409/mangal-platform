-- §141 — Direct-to-VPA UPI payments. Founder doesn't have a Razorpay
-- merchant account set up yet (RAZORPAY_KEY_ID/SECRET unset — see §48/§49),
-- so every checkout in the app currently shows "coming soon". This adds a
-- second, much simpler rail that works today with zero gateway account:
-- show the recipient's personal UPI ID as a QR / upi:// deep link, same as
-- the founder's own Paytm QR. The Razorpay multi-method picker (card/UPI/
-- Google Pay/netbanking) and the PayPal rail stay in the codebase behind
-- NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS for when there's a real gateway
-- account and/or international customers — nothing deleted, just deferred.
--
-- Important limitation, stated plainly rather than faked: a raw UPI
-- deep-link has no callback. There is no webhook telling us the payment
-- actually landed, the way Razorpay's does. So a direct-UPI payment can
-- only ever be self-reported by the payer ('pending_manual_verification')
-- until the founder (or, later, the receiving creator) reconciles it
-- against their own UPI app/bank statement and confirms it via
-- /api/admin/payments/verify-upi. This is the same trust model real
-- solo-founder UPI businesses use before they're big enough for a
-- merchant gateway — not a shortcut specific to this feature.

alter table payments
  add column if not exists reference_note text,     -- the human-readable code put in the UPI 'tn' field, used to match the payer's bank/UPI-app statement to this row during manual reconciliation
  add column if not exists paid_reported_at timestamptz; -- when the payer self-reported "I've paid" — NOT proof of payment, just an intent-to-verify timestamp

alter table payments drop constraint if exists payments_status_check;
alter table payments add constraint payments_status_check
  check (status in ('created', 'authorized', 'captured', 'failed', 'refunded', 'pending_manual_verification'));

comment on column payments.reference_note is 'Short code (e.g. MANGAL-A1B2C3) embedded in the UPI intent''s tn= note, so a direct-UPI payment can be matched to this row by hand during reconciliation.';
comment on column payments.paid_reported_at is 'Set when the payer taps "I''ve paid" on a direct-UPI intent. Self-reported only — the row only becomes authoritative once an admin flips it to captured via /api/admin/payments/verify-upi.';

-- Per-creator UPI payout details — same shape as the existing YouTube
-- channel verification columns (pending code -> confirmed), so a tip sent
-- with purpose_ref_id = this creator's user_id can resolve to *their* VPA
-- instead of the founder's. Verification here is deliberately scoped to
-- "this creator confirms this is their own UPI ID" (a 6-digit code emailed
-- to their account email via Resend, confirmed back), not a bank-identity
-- check — the platform has no KYC pipeline to do more than that yet.
alter table creator_profiles
  add column if not exists upi_id text,                    -- e.g. 'name@bank' — raw input, format-validated in the API route, not re-validated here
  add column if not exists upi_phone text,                  -- 10-digit Indian mobile number tied to the UPI account, for display/support only
  add column if not exists upi_verification_code text,      -- pending 6-digit code, cleared once verified
  add column if not exists upi_verification_sent_at timestamptz,
  add column if not exists upi_verified_at timestamptz;     -- set only after the emailed code is confirmed back

comment on column creator_profiles.upi_id is 'Creator-supplied UPI VPA for receiving tips directly. Only trusted for payouts once upi_verified_at is set.';
comment on column creator_profiles.upi_verification_code is 'Pending email-confirmation code for the currently-entered upi_id/upi_phone pair; null once verified or if never started.';

-- No new RLS policies needed — creator_profiles already has "Users can
-- update own creator profile" / "Users can view own creator profile"
-- (auth.uid() = user_id), which is all the request/verify UPI routes need
-- since they act as the authenticated user. Other users reading a
-- creator's upi_id (to build the tip QR) go through a dedicated public RPC
-- below, not a direct table select — the lockdown migration (§ 2026-08-21)
-- already restricts creator_profiles PII from being selected broadly.
create or replace function get_creator_payout_vpa(target_user_id uuid)
returns table (upi_id text, display_name text) as $$
  select cp.upi_id, coalesce(p.display_name, p.username)
  from creator_profiles cp
  join profiles p on p.id = cp.user_id
  where cp.user_id = target_user_id
    and cp.upi_verified_at is not null
$$ language sql stable security definer;

comment on function get_creator_payout_vpa is 'Public, narrow lookup used by the Tip Jar to resolve a creator''s verified UPI ID without exposing the rest of creator_profiles (phone, pending codes, etc). SECURITY DEFINER on purpose — bypasses the PII-lockdown RLS for just this one column pair, only when verified.';
