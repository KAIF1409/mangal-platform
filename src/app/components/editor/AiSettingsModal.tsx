'use client';

// app/components/editor/AiSettingsModal.tsx
//
// WebMangal AI assistant — Bring-Your-Own-Key settings panel.
//
// §133 hardening:
//   - Keys are NEVER saved blind. Every pasted key passes the strict
//     verifyApiKey() pipeline (format gate → zero-token provider dry run)
//     before Save unlocks; live badges show 🟢/🔴/🟡 state.
//   - "Get Free API Key" deep-links to the selected provider's portal and
//     shows an SSO-alignment notice built from the creator's session email,
//     so the portal account stays linked to their WebMangal identity.

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ExternalLink, KeyRound, LoaderCircle, Lock, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  clearAiKeys,
  decryptApiKey,
  loadAiSettingsMeta,
  saveAiSettings,
  type StoredProvider,
} from '../../lib/ai/byokStorage';
import {
  detectProviderFromKey,
  validateApiKeyFormat,
  FORMAT_REJECTION,
  verifyApiKey,
  type KeyStatus,
} from '../../lib/ai/keyVerification';
import { PROVIDER_LABELS, PROVIDER_PORTALS } from '../../lib/ai/editorAssist';

export const CONSENT_TEXT = 'I understand my key is kept strictly local to my browser';

export const PRIVACY_NOTICE =
  '🔒 Your API Key is encrypted and stored strictly in your local browser storage (localStorage). WebMangal NEVER saves, tracks, or transmits your keys to our servers. You maintain full ownership and privacy over your data in accordance with international data privacy regulations (GDPR/IT Act).';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '9px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  margin: '0 0 6px',
};

/** Live badge per verification status (🟢 / 🔴 / 🟡 + transitional states). */
function statusBadge(status: KeyStatus): { emoji: string; label: string; color: string } | null {
  switch (status) {
    case 'verified':
      return { emoji: '🟢', label: 'Verified & Ready', color: '#22c55e' };
    case 'auth_failed':
      return { emoji: '🔴', label: 'Authentication Failed', color: '#ef4444' };
    case 'rate_limited':
      return { emoji: '🟡', label: 'Rate Limited', color: '#eab308' };
    case 'invalid_format':
      return { emoji: '⚠️', label: 'Invalid Key Format', color: '#f97316' };
    default:
      return null;
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Session email of the logged-in WebMangal creator (SSO alignment). */
  creatorEmail?: string | null;
}

export default function AiSettingsModal({ open, onClose, onSaved, creatorEmail }: Props) {
  const [provider, setProvider] = useState<StoredProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [consent, setConsent] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showSsoNotice, setShowSsoNotice] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifyAbort = useRef<AbortController | null>(null);
  const latestKey = useRef('');

  const resetVerificationState = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    verifyAbort.current?.abort();
    verifyAbort.current = null;
    latestKey.current = '';
  };


  useEffect(() => {
    if (!open) return;
    // Snapshot the local vault each time the modal opens — deferred to a
    // microtask so no setState fires synchronously in the effect body.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const meta = loadAiSettingsMeta();
      setProvider(meta.provider);
      setHasStoredKey(meta.hasKey);
      setConsent(meta.consentAt !== null);
      setApiKey('');
      setShowSsoNotice(false);
      resetVerificationState();
      setKeyStatus('idle');
      setStatusMessage(null);
      setMessage(
        meta.hasKey
          ? `A ${meta.provider === 'groq' ? 'Groq' : meta.provider === 'openai' ? 'OpenAI' : 'Gemini'} key is saved (encrypted).`
          : null,
      );
    });
    return () => {
      cancelled = true;
      // Closing the modal must not leave orphaned timers/fetches behind.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      verifyAbort.current?.abort();
    };
  }, [open]);

  if (!open) return null;

  /**
   * Gate 1+2 pipeline for a candidate key. Resolves quietly; stale runs
   * (key edited again / provider switched mid-flight) are dropped instead
   * of clobbering newer state.
   */
  const runVerification = async (value: string, forProvider: StoredProvider) => {
    verifyAbort.current?.abort();
    const ctrl = new AbortController();
    verifyAbort.current = ctrl;
    latestKey.current = value;
    setKeyStatus('verifying');
    setStatusMessage(null);

    const result = await verifyApiKey(value, forProvider, ctrl.signal);
    if (ctrl.signal.aborted || latestKey.current !== value) return; // stale run
    setKeyStatus(result.status);
    setStatusMessage(result.message || null);
  };

  /** Paste/type handler: instant offline format gate, debounced dry-run. */
  const handleKeyChange = (value: string) => {
    setApiKey(value);
    setMessage(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      verifyAbort.current?.abort();
      setKeyStatus('idle');
      setStatusMessage(null);
      return;
    }
    // Offline format gate — a malformed key, or one that clearly belongs to
    // another platform, is rejected IMMEDIATELY with zero network spent.
    if (!validateApiKeyFormat(value, provider)) {
      verifyAbort.current?.abort();
      const looksLike = detectProviderFromKey(value);
      setStatusMessage(
        FORMAT_REJECTION +
          (looksLike && looksLike !== provider
            ? ` This looks like a ${looksLike === 'gemini' ? 'Google Gemini' : looksLike === 'groq' ? 'Groq' : 'OpenAI'} key — switch the provider selector above.`
            : ''),
      );
      setKeyStatus('invalid_format');
      return;
    }
    // Format OK → schedule the zero-token live verification.
    setKeyStatus('verifying');
    setStatusMessage(null);
    debounceRef.current = setTimeout(() => {
      void runVerification(value.trim(), provider);
    }, 650);
  };

  /** Provider switch invalidates any prior verification of the typed key. */
  const handleProviderChange = (next: StoredProvider) => {
    setProvider(next);
    setShowSsoNotice(false);
    if (apiKey.trim()) handleKeyChange(apiKey);
    else {
      verifyAbort.current?.abort();
      setKeyStatus('idle');
      setStatusMessage(null);
    }
  };

  // ── SSO-aligned portal deep link ────────────────────────────────────────
  const portal = PROVIDER_PORTALS[provider];
  const ssoNotice = creatorEmail
    ? `💡 You are currently logged into WebMangal as ${creatorEmail}. Please ensure you select or sign in with ${creatorEmail} when redirected to ${portal.name} so your API key stays linked to your account.`
    : '💡 Log in to WebMangal first, then create your key with the same email so it stays linked to your account.';

  const handleGetFreeKey = () => {
    window.open(portal.url, '_blank', 'noopener,noreferrer');
    setShowSsoNotice(true);
  };

  // Save unlocks ONLY when consent is given AND a newly pasted key has
  // passed BOTH verification gates. Stored keys just need consent.
  const newKeyPending = apiKey.trim().length > 0;
  const canSave =
    consent && !busy && (newKeyPending ? keyStatus === 'verified' : hasStoredKey);

  const handleSave = async () => {
    if (!consent) {
      setMessage('Please tick the consent checkbox first.');
      return;
    }
    if (newKeyPending && keyStatus !== 'verified') {
      setMessage(keyStatus === 'invalid_format' ? FORMAT_REJECTION : 'Verify the key before saving.');
      return;
    }
    setBusy(true);
    try {
      if (newKeyPending) {
        await saveAiSettings({ provider, apiKey: apiKey.trim(), consent });
      } else if (hasStoredKey) {
        // Keep the existing ciphertext; just refresh provider + consent.
        const existing = await decryptApiKey();
        if (existing) await saveAiSettings({ provider, apiKey: existing, consent });
      }
      setHasStoredKey(true);
      setMessage('Saved & verified — encrypted locally in this browser only.');
      onSaved();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save settings locally.');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    setBusy(true);
    try {
      await clearAiKeys();
      setHasStoredKey(false);
      setConsent(false);
      setApiKey('');
      setMessage('All stored keys wiped from this browser.');
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI settings"
      style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', padding: '16px' }}
      onClick={onClose}
    >
      <div
        className="wm-ai-settings"
        style={{ width: 'min(520px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '22px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={15} color="var(--accent)" /> AI Assist Settings
          </h2>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 14px' }}>
          Bring your own free key (BYOK) for cloud polishing. No key? On-device WebGPU polishing still works — free &amp; private.
        </p>

        <label style={fieldLabelStyle} htmlFor="wm-provider">Provider</label>
        <select id="wm-provider" value={provider} onChange={(e) => handleProviderChange(e.target.value as StoredProvider)} style={inputStyle}>
          {(Object.keys(PROVIDER_LABELS) as StoredProvider[]).map((p) => (
            <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
          ))}
        </select>

        {/* 1-click free-key portal launch with SSO alignment guidance */}
        <button
          onClick={handleGetFreeKey}
          style={{ width: '100%', marginTop: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '10px 14px', borderRadius: '9px', border: '1px solid rgba(217,119,6,0.45)', background: 'rgba(217,119,6,0.1)', color: 'var(--accent)', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}
        >
          <KeyRound size={14} /> Get Free API Key — open {portal.name} <ExternalLink size={12} />
        </button>
        {showSsoNotice && (
          <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '9px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', fontSize: '11.5px', lineHeight: 1.55, color: 'var(--text-secondary)' }} role="note">
            {ssoNotice}
          </div>
        )}

        <label style={{ ...fieldLabelStyle, marginTop: '12px' }} htmlFor="wm-apikey">
          API key{hasStoredKey ? ' (leave blank to keep saved key)' : ''}
        </label>
        <input
          id="wm-apikey"
          type="password"
          autoComplete="off"
          placeholder={
            hasStoredKey
              ? '•••••••••••••••• (stored)'
              : provider === 'gemini'
                ? 'AIzaSy…'
                : provider === 'groq'
                  ? 'gsk_…'
                  : 'sk-…'
          }
          value={apiKey}
          onChange={(e) => handleKeyChange(e.target.value)}
          onPaste={() => setMessage(null)}
          style={{
            ...inputStyle,
            borderColor:
              keyStatus === 'invalid_format' || keyStatus === 'auth_failed'
                ? '#ef4444'
                : keyStatus === 'verified'
                  ? '#22c55e'
                  : 'var(--border-color)',
          }}
        />

        {/* Real-time verification status */}
        {keyStatus === 'verifying' && (
          <p style={{ fontSize: '11.5px', margin: '7px 0 0', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LoaderCircle size={12} className="mangal-spin" /> Verifying with {portal.name}…
          </p>
        )}
        {keyStatus !== 'verifying' && (() => {
          const badge = statusBadge(keyStatus);
          if (!badge && !statusMessage) {
            return hasStoredKey ? null : (
              <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '7px 0 0', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <BadgeCheck size={11} /> Paste your key to auto-verify before saving.
              </p>
            );
          }
          return (
            <p style={{ fontSize: '11.5px', margin: '7px 0 0', color: badge?.color ?? 'var(--text-secondary)', fontWeight: badge ? 700 : 400 }}>
              {badge ? `${badge.emoji} ${badge.label}` : ''}{badge && statusMessage ? ' — ' : ''}{badge ? '' : statusMessage}
              {badge && statusMessage ? <span style={{ fontWeight: 400 }}> {statusMessage}</span> : null}
            </p>
          );
        })()}

        <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.25)', display: 'flex', gap: '8px' }}>
          <ShieldCheck size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ fontSize: '11.5px', lineHeight: 1.55, margin: 0, color: 'var(--text-secondary)' }}>{PRIVACY_NOTICE}</p>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', cursor: 'pointer', fontSize: '12.5px' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: '15px', height: '15px', accentColor: '#d97706' }} />
          <span>{CONSENT_TEXT}</span>
        </label>

        {message && <p style={{ fontSize: '11.5px', color: 'var(--accent)', margin: '10px 0 0' }}>{message}</p>}

        <div style={{ display: 'flex', gap: '10px', marginTop: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleSave}
            disabled={!canSave}
            title={
              newKeyPending && keyStatus !== 'verified'
                ? 'Verify the key first — WebMangal never saves unverified keys.'
                : undefined
            }
            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '9px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '12.5px', cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.45 }}
          >
            {busy ? <LoaderCircle size={13} className="mangal-spin" /> : <BadgeCheck size={13} />}
            {newKeyPending ? 'Verify & Save' : 'Save'}
          </button>
          {hasStoredKey && (
            <button onClick={handleClear} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '9px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>
              <Trash2 size={13} /> Wipe stored keys
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: '10.5px', color: 'var(--text-faint)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Lock size={10} /> AES-GCM at rest
          </span>
        </div>
      </div>
    </div>
  );
}

