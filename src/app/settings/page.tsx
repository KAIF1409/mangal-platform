'use client';

// app/settings/page.tsx
//
// Step 19 — homes the three account-level DPDP controls that didn't have a
// page to live on yet: Delete My Account, Download My Data, Withdraw Consent.
//
// NOTE on import path: this file assumes app/settings/page.tsx, one level
// deep like app/login/page.tsx, so it imports '../lib/supabase' — adjust if
// your actual lib/supabase.ts export shape differs from a plain
// createBrowserClient() call.

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CONSENT_VERSION } from '../lib/compliance/dpdp';
import { useUiLanguage, LANGUAGES } from '../lib/i18n';
import Link from 'next/link';
import { Flame, User, Coffee } from 'lucide-react';
import { getRazorpayPublicKey, openRazorpayCheckout } from '../lib/payments/razorpayClient';

const PLATFORM_NAME = 'MANGAL';

type DeleteFlowState = 'idle' | 'confirming' | 'deleting' | 'done' | 'error';
type ExportState = 'idle' | 'exporting' | 'error';
type WithdrawState = 'idle' | 'withdrawing' | 'withdrawn' | 'error';
type Gender = 'male' | 'female' | 'unspecified';

export default function SettingsPage() {
  const { lang, setLang, t } = useUiLanguage();
  const [deleteState, setDeleteState] = useState<DeleteFlowState>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [withdrawState, setWithdrawState] = useState<WithdrawState>('idle');

  // Optional, self-reported — feeds the (real) Gender split in creator
  // Audience Insights. Left unset unless the user explicitly picks one.
  const [gender, setGender] = useState<Gender | null>(null);
  const [genderSaving, setGenderSaving] = useState(false);
  const [genderLoaded, setGenderLoaded] = useState(false);

  useEffect(() => {
    const loadGender = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setGenderLoaded(true); return; }
      const { data } = await supabase
        .from('profiles')
        .select('gender')
        .eq('id', userData.user.id)
        .single();
      setGender((data?.gender as Gender | null) ?? null);
      setGenderLoaded(true);
    };
    loadGender();
  }, []);

  const [adsRemoved, setAdsRemoved] = useState(false);
  const [adsRemovedLoaded, setAdsRemovedLoaded] = useState(false);
  const [removeAdsState, setRemoveAdsState] = useState<'idle' | 'processing' | 'error'>('idle');
  const [removeAdsError, setRemoveAdsError] = useState('');

  useEffect(() => {
    const loadAdsRemoved = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setAdsRemovedLoaded(true); return; }
      const { data } = await supabase
        .from('profiles')
        .select('ads_removed')
        .eq('id', userData.user.id)
        .single();
      setAdsRemoved(!!data?.ads_removed);
      setAdsRemovedLoaded(true);
    };
    loadAdsRemoved();
  }, []);

  // §95 — one-time ₹99 unlock, same create-order/verify pair the Tip Jar
  // (§94) uses, just with purpose='remove_ads' instead of 'tip'. The
  // actual `profiles.ads_removed = true` flip happens server-side in
  // /api/payments/verify (and the webhook, as a fallback) — never here.
  const handleRemoveAds = async () => {
    setRemoveAdsState('processing');
    setRemoveAdsError('');
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        setRemoveAdsError('Please log in first.');
        setRemoveAdsState('error');
        return;
      }

      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amountPaise: 9900, purpose: 'remove_ads' }),
      });
      const orderData = await res.json();
      if (!res.ok) {
        setRemoveAdsError(orderData.error ?? 'Could not start payment.');
        setRemoveAdsState('error');
        return;
      }

      const opened = await openRazorpayCheckout({
        orderId: orderData.orderId,
        amountPaise: orderData.amountPaise,
        description: 'Remove Ads — lifetime',
        prefillEmail: session?.session?.user?.email ?? undefined,
        onSuccess: async (response) => {
          const verifyRes = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(response),
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.verified) {
            setAdsRemoved(true);
            setRemoveAdsState('idle');
          } else {
            setRemoveAdsError(verifyData.error ?? 'Payment could not be verified.');
            setRemoveAdsState('error');
          }
        },
        onDismiss: () => setRemoveAdsState((s) => (s === 'processing' ? 'idle' : s)),
      });

      if (!opened.ok) {
        setRemoveAdsError(opened.error);
        setRemoveAdsState('error');
      }
    } catch {
      setRemoveAdsError('Something went wrong. Please try again.');
      setRemoveAdsState('error');
    }
  };

  const handleSetGender = async (value: Gender) => {
    setGenderSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { error } = await supabase
        .from('profiles')
        .update({ gender: value })
        .eq('id', userData.user.id);
      if (!error) setGender(value);
    } finally {
      setGenderSaving(false);
    }
  };



  const sectionCard: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
    borderRadius: '16px', padding: '24px 28px', marginBottom: '24px',
  };
  const sectionCardClass = 'mangal-settings-section';
  const sectionTitle: React.CSSProperties = {
    fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 14px',
    display: 'flex', alignItems: 'center', gap: '8px',
  };
  const bodyText: React.CSSProperties = {
    fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 14px',
  };
  const buttonBase: React.CSSProperties = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
  };

  const handleDownloadData = async () => {
    setExportState('exporting');
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('No active session');

      const res = await fetch('/api/export-data', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mangal-my-data.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportState('idle');
    } catch {
      setExportState('error');
    }
  };

  const handleWithdrawConsent = async () => {
    setWithdrawState('withdrawing');
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Not signed in');

      const { error } = await supabase.from('consent_log').insert({
        user_id: userId,
        consent_version: CONSENT_VERSION,
        action: 'withdrawn',
      });
      if (error) throw error;
      setWithdrawState('withdrawn');
    } catch {
      setWithdrawState('error');
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteState('deleting');
    setDeleteError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('No active session');

      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Deletion failed');

      setDeleteState('done');
      await supabase.auth.signOut();
      // Give the user a moment to read the confirmation before redirecting.
      setTimeout(() => {
        window.location.href = '/';
      }, 3000);
    } catch (err) {
      setDeleteState('error');
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)', }}>

      {/* Mobile pass (§13 sweep): this page had zero @media rules. The nav
          (logo | lang toggle + Back to Home) had no flexShrink on the logo
          and no wrap — same squeeze bug already fixed on other pages in
          this sweep. Under 480px: brand wordmark drops, "Back to Home"
          shrinks to just the icon-free text at a smaller size, and side
          padding tightens. Also gives the delete-account confirm/cancel
          button row somewhere to go instead of overflowing. */}
      <style>{`
        @media (max-width: 480px) {
          .mangal-settings-nav { padding: 0 14px !important; }
          .mangal-settings-brand-text { display: none; }
          .mangal-settings-section { padding: 18px !important; }
          .mangal-settings-content { padding: 32px 14px 60px !important; }
          .mangal-settings-delete-row { flex-wrap: wrap; }
        }
      `}</style>

      <nav className="mangal-settings-nav" style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--nav-bg)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 24px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}><Flame size={16} strokeWidth={2} /></div>
          <span className="mangal-settings-brand-text" style={{ fontWeight: 900, fontSize: '18px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {PLATFORM_NAME}
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {/* Step 22 — Hindi UI Toggle. This page has no ProfileMenu (it's a
              standalone settings screen), so the toggle sits directly next
              to the Back to Home link instead, keeping the same EN/हिं
              pill style used everywhere else. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '3px' }}>
            {LANGUAGES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                style={{
                  padding: '5px 10px', borderRadius: '6px', border: 'none',
                  background: lang === code ? 'var(--border-color)' : 'transparent',
                  color: lang === code ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <Link href="/" style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {t('backToHome')}
          </Link>
        </div>
      </nav>

      <div className="mangal-settings-content" style={{ maxWidth: '640px', margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px', color: 'var(--text-primary)' }}>
            {t('settingsTitle')}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            {t('settingsIntro')}{' '}
            <a href="/privacy" style={{ color: '#d97706', textDecoration: 'none' }}>{t('settingsIntroLink')}</a>
            {t('settingsIntroSuffix')}
          </p>
        </div>

        {/* Profile — optional gender, feeds real Audience Insights for creators */}
        <div className={sectionCardClass} style={sectionCard}>
          <h2 style={sectionTitle}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><User size={16} strokeWidth={2} /> Profile</span></h2>
          <p style={bodyText}>
            Optional. If you share this, it helps creators understand their audience —
            shown in aggregate only, never tied to your identity. Leave it unset if you&apos;d rather not say.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['male', 'female', 'unspecified'] as Gender[]).map((g) => (
              <button
                key={g}
                onClick={() => handleSetGender(g)}
                disabled={!genderLoaded || genderSaving}
                style={{
                  ...buttonBase,
                  background: gender === g ? 'rgba(217,119,6,0.15)' : 'var(--bg-input)',
                  border: gender === g ? '1px solid rgba(217,119,6,0.4)' : '1px solid var(--border-color)',
                  color: gender === g ? '#d97706' : 'var(--text-secondary)',
                  opacity: genderSaving ? 0.6 : 1,
                  textTransform: 'capitalize',
                }}
              >
                {g === 'unspecified' ? 'Prefer not to say' : g}
              </button>
            ))}
          </div>
        </div>

        {/* Remove Ads — §95, one-time ₹99 unlock (payment infra only for
            now; no ad slots exist on the platform yet — see CONTEXT.md).
            Same visibility rule as the rest of this page: nothing here
            claims to work until it actually does. */}
        <div className={sectionCardClass} style={sectionCard}>
          <h2 style={sectionTitle}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Coffee size={16} strokeWidth={2} /> Remove Ads</span></h2>
          {adsRemoved ? (
            <p style={{ ...bodyText, marginBottom: 0, color: '#059669', fontWeight: 700 }}>
              ✓ You&apos;ve unlocked ad-free — thank you for supporting MANGAL.
            </p>
          ) : (
            <>
              <p style={bodyText}>
                One-time ₹99 payment, lifetime — no subscription. (Nothing on MANGAL
                shows ads yet — this just unlocks your ad-free status ahead of time.)
              </p>
              <button
                onClick={handleRemoveAds}
                disabled={!adsRemovedLoaded || removeAdsState === 'processing' || !getRazorpayPublicKey()}
                style={{
                  ...buttonBase,
                  background: getRazorpayPublicKey() ? 'rgba(217,119,6,0.1)' : 'var(--bg-input)',
                  border: getRazorpayPublicKey() ? '1px solid rgba(217,119,6,0.3)' : '1px solid var(--border-color)',
                  color: getRazorpayPublicKey() ? '#d97706' : 'var(--text-faint)',
                  opacity: removeAdsState === 'processing' ? 0.6 : 1,
                  cursor: getRazorpayPublicKey() ? 'pointer' : 'not-allowed',
                }}
              >
                {removeAdsState === 'processing'
                  ? 'Processing...'
                  : getRazorpayPublicKey()
                    ? 'Remove Ads — ₹99'
                    : 'Remove Ads — coming soon'}
              </button>
              {removeAdsState === 'error' && (
                <p style={{ ...bodyText, color: '#ef4444', marginTop: '10px', marginBottom: 0 }}>
                  {removeAdsError}
                </p>
              )}
            </>
          )}
        </div>

        {/* Download My Data */}
        <div className={sectionCardClass} style={sectionCard}>
          <h2 style={sectionTitle}>{t('downloadDataTitle')}</h2>
          <p style={bodyText}>
            {t('downloadDataBody')}
          </p>
          <button
            onClick={handleDownloadData}
            disabled={exportState === 'exporting'}
            style={{
              ...buttonBase,
              background: 'rgba(217,119,6,0.1)',
              border: '1px solid rgba(217,119,6,0.3)',
              color: '#d97706',
              opacity: exportState === 'exporting' ? 0.6 : 1,
            }}
          >
            {exportState === 'exporting' ? t('downloadDataPreparing') : t('downloadDataBtn')}
          </button>
          {exportState === 'error' && (
            <p style={{ ...bodyText, color: '#ef4444', marginTop: '10px', marginBottom: 0 }}>
              {t('genericErrorRetryEmail')}
            </p>
          )}
        </div>

        {/* Withdraw Consent */}
        <div className={sectionCardClass} style={sectionCard}>
          <h2 style={sectionTitle}>{t('withdrawConsentTitle')}</h2>
          <p style={bodyText}>
            {t('withdrawConsentBody')}
          </p>
          <button
            onClick={handleWithdrawConsent}
            disabled={withdrawState === 'withdrawing' || withdrawState === 'withdrawn'}
            style={{
              ...buttonBase,
              background: 'rgba(217,119,6,0.1)',
              border: '1px solid rgba(217,119,6,0.3)',
              color: '#d97706',
              opacity: withdrawState === 'withdrawing' ? 0.6 : 1,
            }}
          >
            {withdrawState === 'withdrawn'
              ? t('withdrawConsentDone')
              : withdrawState === 'withdrawing'
              ? t('withdrawConsentInProgress')
              : t('withdrawConsentBtn')}
          </button>
          {withdrawState === 'error' && (
            <p style={{ ...bodyText, color: '#ef4444', marginTop: '10px', marginBottom: 0 }}>
              {t('genericErrorRetry')}
            </p>
          )}
        </div>

        {/* Delete My Account */}
        <div className={sectionCardClass} style={{ ...sectionCard, borderColor: 'rgba(239,68,68,0.25)' }}>
          <h2 style={{ ...sectionTitle, color: '#ef4444' }}>{t('deleteAccountTitle')}</h2>
          <p style={bodyText}>
            {t('deleteAccountBodyPart1')}{' '}
            <a href="/privacy#how-to-delete" style={{ color: '#d97706', textDecoration: 'none' }}>
              {t('privacyPolicyLink')}
            </a>{' '}
            {t('deleteAccountBodyPart2')}
          </p>

          {deleteState === 'idle' && (
            <button
              onClick={() => setDeleteState('confirming')}
              style={{
                ...buttonBase,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#ef4444',
              }}
            >
              {t('deleteAccountBtn')}
            </button>
          )}

          {deleteState === 'confirming' && (
            <div>
              <p style={{ ...bodyText, color: '#fca5a5', fontWeight: 700 }}>
                {t('deleteAccountConfirmQ')}
              </p>
              <div className="mangal-settings-delete-row" style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleDeleteAccount}
                  style={{
                    ...buttonBase,
                    background: '#ef4444',
                    color: '#fff',
                  }}
                >
                  {t('deleteAccountConfirmYes')}
                </button>
                <button
                  onClick={() => setDeleteState('idle')}
                  style={{
                    ...buttonBase,
                    background: 'transparent',
                    border: '1px solid #2a2a36',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t('deleteAccountCancel')}
                </button>
              </div>
            </div>
          )}

          {deleteState === 'deleting' && (
            <p style={{ ...bodyText, marginBottom: 0 }}>{t('deleteAccountDeleting')}</p>
          )}

          {deleteState === 'done' && (
            <p style={{ ...bodyText, color: '#10b981', marginBottom: 0 }}>
              {t('deleteAccountDone')}
            </p>
          )}

          {deleteState === 'error' && (
            <div>
              <p style={{ ...bodyText, color: '#ef4444' }}>
                {deleteError ?? t('somethingWentWrong')} {t('deleteAccountErrorPrefix')}{' '}
                <a href="/grievance" style={{ color: '#d97706' }}>{t('grievanceOfficerLink')}</a>.
              </p>
              <button
                onClick={() => setDeleteState('idle')}
                style={{
                  ...buttonBase,
                  background: 'transparent',
                  border: '1px solid #2a2a36',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('deleteAccountBack')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}