import { SupabaseClient } from '@supabase/supabase-js';

// §141 — extracted from /api/payments/verify so the exact same
// purpose-based side effects (flip ads_removed, grant a book_purchase
// row) run whether a payment was confirmed by Razorpay's signature check
// OR by an admin manually reconciling a direct-UPI payment
// (/api/admin/payments/verify-upi). One place, one behavior, instead of
// two copies drifting apart.
//
// Callers are responsible for actually setting the payments row to
// 'captured' (or equivalent) and for authenticating/authorizing the
// caller — this function only applies what a captured payment *grants*,
// using the DB row's own purpose/purpose_ref_id, never anything from a
// request body.

export async function applyPaymentGrant(
  supabase: SupabaseClient,
  supabaseAdmin: SupabaseClient,
  row: { id: string; user_id: string; purpose: string; purpose_ref_id: string | null; amount_paise: number }
) {
  if (row.purpose === 'remove_ads') {
    await supabase.from('profiles').update({ ads_removed: true }).eq('id', row.user_id);
    return;
  }

  if (row.purpose === 'book_purchase' && row.purpose_ref_id) {
    const { data: book } = await supabaseAdmin
      .from('books')
      .select('id, pricing_type, price_paise')
      .eq('id', row.purpose_ref_id)
      .maybeSingle();

    if (book && book.pricing_type === 'PAID' && row.amount_paise >= (book.price_paise ?? 0)) {
      await supabaseAdmin.from('book_purchases').upsert(
        {
          book_id: book.id,
          user_id: row.user_id,
          payment_id: row.id,
          amount_paid_paise: row.amount_paise,
        },
        { onConflict: 'book_id,user_id' }
      );
    }
    return;
  }

  // purpose === 'tip' (or anything else): no grant needed, the captured
  // payments row itself is the entire record of the tip.
}
