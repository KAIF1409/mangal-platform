// §141 — shared helpers for the direct-to-VPA UPI payment rail (see
// migration 20260901120000_direct_upi_payments.sql and CONTEXT.md §141 for
// the full design/limitations). Pure functions only, no side effects, so
// this is safe to import from both client components and API routes.

/** A UPI VPA looks like "name@bank" — letters/digits/._- before the @,
 * a short alphabetic bank/PSP handle after. Deliberately permissive (real
 * VPA rules vary by PSP); this only rejects obviously-malformed input. */
export function isValidUpiId(vpa: string): boolean {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(vpa.trim());
}

/** Indian mobile numbers: 10 digits, starting 6-9. Accepts a leading +91/91
 * or spaces and strips them before checking. */
export function isValidIndianPhone(phone: string): boolean {
  const digits = phone.trim().replace(/^\+?91/, '').replace(/[\s-]/g, '');
  return /^[6-9]\d{9}$/.test(digits);
}

/** Short, readable code embedded in the UPI intent's transaction note so a
 * direct-UPI payment can be matched by hand to its `payments` row later
 * (see reference_note on the payments table). Not a security token — it
 * only has to be unique enough to grep for in a bank/UPI-app statement. */
export function generateReferenceCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easier to read back off a phone
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `MANGAL-${code}`;
}

/** Builds a upi://pay deep link. On a phone with a UPI app installed,
 * navigating to this URL opens the app's chooser with everything
 * prefilled; on desktop it does nothing useful on its own, which is why
 * callers should always show it alongside a QR code of the same string. */
export function buildUpiUri(params: {
  vpa: string;
  payeeName: string;
  amountRupees: number;
  note: string;
}): string {
  const qs = new URLSearchParams({
    pa: params.vpa,
    pn: params.payeeName,
    am: params.amountRupees.toFixed(2),
    cu: 'INR',
    tn: params.note,
  });
  return `upi://pay?${qs.toString()}`;
}
