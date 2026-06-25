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

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { CONSENT_VERSION } from '../lib/dpdp';
import { useUiLanguage, LANGUAGES } from '../lib/i18n';

const PLATFORM_NAME = 'MANGAL';

type DeleteFlowState = 'idle' | 'confirming' | 'deleting' | 'done' | 'error';
type ExportState = 'idle' | 'exporting' | 'error';
type WithdrawState = 'idle' | 'withdrawing' | 'withdrawn' | 'error';

export default function SettingsPage() {
  const { lang, setLang, t } = useUiLanguage();
  const [deleteState, setDeleteState] = useState<DeleteFlowState>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [withdrawState, setWithdrawState] = useState<WithdrawState>('idle');


  const sectionCard: React.CSSProperties = {
    background: '#0d0d14', border: '1px solid #1a1a26',
    borderRadius: '16px', padding: '24px 28px', marginBottom: '24px',
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: '16px', fontWeight: 800, color: '#fff', margin: '0 0 14px',
    display: 'flex', alignItems: 'center', gap: '8px',
  };
  const bodyText: React.CSSProperties = {
    fontSize: '13px', color: '#9ca3af', lineHeight: 1.75, margin: '0 0 14px',
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
      minHeight: '100vh', backgroundColor: '#07070a',
      color: '#f9fafb', fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(7,7,10,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1a1a26',
        padding: '0 24px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
          }}>🔥</div>
          <span style={{ fontWeight: 900, fontSize: '18px', color: '#fff', letterSpacing: '-0.02em' }}>
            {PLATFORM_NAME}
          </span>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Step 22 — Hindi UI Toggle. This page has no ProfileMenu (it's a
              standalone settings screen), so the toggle sits directly next
              to the Back to Home link instead, keeping the same EN/हिं
              pill style used everywhere else. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: '#0d0d14', border: '1px solid #1a1a26', borderRadius: '8px', padding: '3px' }}>
            {LANGUAGES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                style={{
                  padding: '5px 10px', borderRadius: '6px', border: 'none',
                  background: lang === code ? '#1a1a26' : 'transparent',
                  color: lang === code ? '#fff' : '#6b7280',
                  fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <a href="/" style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'none' }}>
            {t('backToHome')}
          </a>
        </div>
      </nav>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px', color: '#fff' }}>
            {t('settingsTitle')}
          </h1>
          <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
            {t('settingsIntro')}{' '}
            <a href="/privacy" style={{ color: '#d97706', textDecoration: 'none' }}>{t('settingsIntroLink')}</a>
            {t('settingsIntroSuffix')}
          </p>
        </div>

        {/* Download My Data */}
        <div style={sectionCard}>
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
        <div style={sectionCard}>
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
        <div style={{ ...sectionCard, borderColor: 'rgba(239,68,68,0.25)' }}>
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
              <div style={{ display: 'flex', gap: '10px' }}>
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
                    color: '#9ca3af',
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
                  color: '#9ca3af',
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