'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type Step = 'loading' | 'confirm-account' | 'details' | 'submitting' | 'done';

/**
 * /become-creator
 *
 * Reader → Creator upgrade flow. Intentionally NOT a 1-click toggle:
 * Step 1 — confirm which Google account this creator identity will use
 *          (matters later for payouts/monetization identity).
 * Step 2 — collect creator details needed for monetization/KYC.
 * Step 3 — write profiles.role = 'creator' + store the new fields.
 *
 * NOTE ON PAYMENTS: Claude/this app cannot process real payments or verify
 * bank/UPI ownership. This form collects the fields a real payment processor
 * (Razorpay/Stripe/UPI provider) will need to verify later — it stores them
 * as "pending verification," it does not claim to verify them itself.
 */
export default function BecomeCreatorPage() {
  const [step, setStep] = useState<Step>('loading');
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');

  // Details form fields
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'upi' | 'bank'>('upi');
  const [upiId, setUpiId] = useState('');
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = '/login';
        return;
      }
      setUser(data.user);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', data.user.id)
        .single();

      if (profile?.role === 'creator' || profile?.role === 'developer') {
        // Already a creator (or the developer override, which already has
        // full creator access) — nothing to upgrade, and developer accounts
        // must never be downgraded to 'creator' by this flow.
        window.location.href = '/dashboard';
        return;
      }

      setDisplayName(profile?.full_name || '');
      setStep('confirm-account');
    };
    init();
  }, []);

  const handleConfirmAccount = async () => {
    // Re-run Google OAuth so the creator explicitly picks/confirms the
    // account this creator identity will be tied to going forward.
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/become-creator`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) setError(error.message);
    // On success Google redirects back here; the useEffect above re-runs
    // and the user lands on confirm-account again with the (possibly new)
    // session — they then click "Continue" below to move to details.
  };

  const handleSubmitDetails = async () => {
    if (!displayName.trim() || !username.trim()) {
      setError('Display name and username are required.');
      return;
    }
    if (payoutMethod === 'upi' && !upiId.trim()) {
      setError('Please add a UPI ID, or switch to bank details.');
      return;
    }
    if (!agreed) {
      setError('Please confirm the checkbox below to continue.');
      return;
    }

    setError('');
    setStep('submitting');
    try {
      // Safety net: never let this write downgrade a developer account,
      // even if they somehow reached this step bypassing the earlier check.
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (currentProfile?.role === 'developer') {
        window.location.href = '/dashboard';
        return;
      }

      // 1. Update profiles → role becomes 'creator'
      //    .select() is critical here: if an RLS UPDATE policy is missing
      //    on profiles, Supabase returns NO ERROR and silently updates
      //    0 rows. Without .select() this would look like success even
      //    though the role never actually changed in the database.
      const { data: updatedRows, error: profileErr } = await supabase
        .from('profiles')
        .update({ role: 'creator', full_name: displayName })
        .eq('id', user.id)
        .select();
      if (profileErr) throw profileErr;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error(
          'Profile update was blocked by the database (0 rows changed). ' +
          'This usually means the "profiles" table is missing an UPDATE ' +
          'policy in Supabase RLS. Add one allowing users to update their own row.'
        );
      }

      // 2. Upsert creator_profiles with monetization-relevant details.
      //    payment fields are stored as "pending" — no real verification
      //    happens here; a payment processor integration will verify later.
      //    Same .select() safety check applies here.
      const { data: upsertedRows, error: creatorErr } = await supabase
        .from('creator_profiles')
        .upsert({
          user_id: user.id,
          username: username.trim(),
          bio: bio.trim(),
          phone: phone.trim(),
          payout_method: payoutMethod,
          payout_details: payoutMethod === 'upi' ? { upi_id: upiId.trim() } : { bank: 'pending' },
          payout_verified: false,
          joined_at: new Date().toISOString(),
        })
        .select();
      if (creatorErr) throw creatorErr;
      if (!upsertedRows || upsertedRows.length === 0) {
        throw new Error(
          'Creator profile was not saved (0 rows changed). Check that ' +
          '"creator_profiles" has INSERT/UPDATE RLS policies for the logged-in user.'
        );
      }

      setStep('done');
      setTimeout(() => { window.location.href = '/dashboard'; }, 1800);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setStep('details');
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: '10px',
    background: '#08080c', border: '1px solid #1f1f2e',
    color: '#f9fafb', fontSize: '13px', outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '10px', fontWeight: 700,
    color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase',
    marginBottom: '6px',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#07070a', }}>
    <main style={{
      flex: 1, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '460px', background: '#0d0d14',
        border: '1px solid #1a1a26', borderRadius: '20px', padding: '36px 32px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)', position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120px', height: '1px', background: 'linear-gradient(to right, transparent, #d97706, transparent)' }} />

        <span style={{
          fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em', color: '#d97706',
          background: 'rgba(120,53,15,0.25)', border: '1px solid rgba(180,83,9,0.3)',
          padding: '4px 10px', borderRadius: '6px', textTransform: 'uppercase',
        }}>
          Become a Creator
        </span>

        {/* ── STEP: Loading ── */}
        {step === 'loading' && (
          <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '20px' }}>Loading...</p>
        )}

        {/* ── STEP 1: Confirm Google account ── */}
        {step === 'confirm-account' && (
          <>
            <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#fff', margin: '16px 0 8px' }}>
              Confirm Your Account
            </h2>
            <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6, margin: '0 0 24px' }}>
              Your creator identity is tied to a Google account — this is the account future earnings and payouts will be linked to. Make sure it&apos;s the right one before continuing.
            </p>

            <div style={{ padding: '14px 16px', background: '#08080c', border: '1px solid #1a1a26', borderRadius: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>
                {(user?.email?.[0] || '?').toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>Currently signed in</div>
              </div>
            </div>

            {error && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '12px', marginBottom: '16px' }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => setStep('details')} style={{
                width: '100%', padding: '13px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #7f1d1d, #991b1b)', border: 'none',
                color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}>
                ✓ Use This Account — Continue
              </button>
              <button onClick={handleConfirmAccount} style={{
                width: '100%', padding: '12px', borderRadius: '10px',
                background: '#fff', border: '1px solid #1f1f2e',
                color: '#111', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              }}>
                <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
                Choose a Different Google Account
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: Details form ── */}
        {(step === 'details' || step === 'submitting') && (
          <>
            <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#fff', margin: '16px 0 8px' }}>
              Tell Us About You
            </h2>
            <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.6, margin: '0 0 24px' }}>
              These details power your public creator profile and are used later for verifying payouts when monetization goes live.
            </p>

            {error && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '12px', marginBottom: '16px' }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Display Name</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g., Arjun Sharma" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Creator Username</label>
                <input value={username} onChange={e => setUsername(e.target.value.replace(/\s/g, ''))} placeholder="e.g., arjun_writes" style={inputStyle} />
                <p style={{ fontSize: '11px', color: '#4b5563', margin: '6px 0 0' }}>Your profile will be at mangal.app/creator/{username || 'username'}</p>
              </div>
              <div>
                <label style={labelStyle}>Short Bio (optional)</label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="A line about your stories..." rows={3} style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={labelStyle}>Phone Number</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Payout Method (for future earnings)</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <button onClick={() => setPayoutMethod('upi')} style={{
                    flex: 1, padding: '9px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                    background: payoutMethod === 'upi' ? 'rgba(217,119,6,0.15)' : '#08080c',
                    border: payoutMethod === 'upi' ? '1px solid rgba(217,119,6,0.4)' : '1px solid #1a1a26',
                    color: payoutMethod === 'upi' ? '#d97706' : '#6b7280',
                  }}>UPI</button>
                  <button onClick={() => setPayoutMethod('bank')} style={{
                    flex: 1, padding: '9px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                    background: payoutMethod === 'bank' ? 'rgba(217,119,6,0.15)' : '#08080c',
                    border: payoutMethod === 'bank' ? '1px solid rgba(217,119,6,0.4)' : '1px solid #1a1a26',
                    color: payoutMethod === 'bank' ? '#d97706' : '#6b7280',
                  }}>Bank Transfer</button>
                </div>
                {payoutMethod === 'upi' ? (
                  <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="justput any xyz13@upi just for testing purposes" style={inputStyle} />
                ) : (
                  <p style={{ fontSize: '11px', color: '#4b5563', margin: 0 }}>Bank details will be collected separately once payouts launch.</p>
                )}
              </div>

              <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '11px', color: '#6b7280', lineHeight: 1.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: '2px' }} />
                I understand these payout details are stored as pending and will be verified when monetization is enabled — Mangal does not process payments yet.
              </label>

              <button
                onClick={handleSubmitDetails}
                disabled={step === 'submitting'}
                style={{
                  width: '100%', padding: '13px', borderRadius: '10px', marginTop: '4px',
                  background: step === 'submitting' ? '#1a1a26' : 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                  border: 'none', color: step === 'submitting' ? '#6b7280' : '#fff',
                  fontSize: '13px', fontWeight: 700, cursor: step === 'submitting' ? 'not-allowed' : 'pointer',
                }}
              >
                {step === 'submitting' ? 'Setting up your studio...' : '🚀 Become a Creator'}
              </button>
            </div>
          </>
        )}

        {/* ── STEP: Done ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎉</div>
            <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>You&apos;re a Creator Now</h2>
            <p style={{ fontSize: '13px', color: '#9ca3af' }}>Taking you to your new Dashboard...</p>
          </div>
        )}
      </div>
    </main>
    <footer style={{ borderTop: '1px solid #1a1a26', padding: '24px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' as const }}>
        {[
          { label: 'Home', href: '/' },
          { label: 'Privacy Policy', href: '/privacy' },
          { label: 'Terms of Service', href: '/terms' },
          { label: 'Grievance Officer', href: '/grievance' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: '11px', color: '#4b5563', textDecoration: 'none' }}>
            {link.label}
          </a>
        ))}
      </div>
    </footer>
    </div>
  );
}