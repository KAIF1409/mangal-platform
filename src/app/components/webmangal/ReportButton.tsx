'use client';

import { useState } from 'react';
import { Flag, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

import { setPostLoginRedirect } from '../../lib/auth/authRedirect';
type TargetType = 'series' | 'chapter' | 'comment';

const REASONS = ['Inappropriate', 'Spam', 'Copyright', 'Other'] as const;

interface ReportButtonProps {
  targetType: TargetType;
  targetId: string;
  variant?: 'icon' | 'text';
}

export default function ReportButton({ targetType, targetId, variant = 'text' }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<typeof REASONS[number] | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setReason(null);
    setDetails('');
    setSubmitted(false);
    setError(null);
  };

  // BUG FIX: auth check moved here — on button click, BEFORE modal opens.
  // Previously checked only on Submit, meaning logged-out users could open
  // the modal, pick a reason, fill details, and only THEN get redirected.
  const handleOpen = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setPostLoginRedirect(window.location.pathname);
      window.location.href = '/login';
      return;
    }
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setPostLoginRedirect(window.location.pathname);
      window.location.href = '/login';
      return;
    }

    const { error: insertError } = await supabase.from('reports').insert({
      target_type: targetType,
      target_id: targetId,
      reporter_id: u.user.id,
      reason,
      details: details.trim() || null,
    });

    if (insertError) {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        title="Report this content"
        style={
          variant === 'icon'
            ? {
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '13px', color: 'var(--text-muted)', padding: '4px',
                display: 'inline-flex', alignItems: 'center', gap: '4px',
              }
            : {
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '11px', color: 'var(--text-muted)', padding: '4px 8px',
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontWeight: 600, textDecoration: 'none',
              }
        }
        onMouseEnter={e => { (e.target as HTMLElement).style.color = '#ef4444'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-muted)'; }}
      >
        <Flag size={13} strokeWidth={2} /> {variant === 'text' ? 'Report' : ''}
      </button>

      {open && (
        <div
          onClick={reset}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '360px',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: '14px', padding: '24px',
              color: 'var(--text-primary)',
            }}
          >
            {submitted ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', color: '#22c55e', marginBottom: '10px' }}><CheckCircle2 size={32} strokeWidth={2} /></div>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 18px' }}>
                  Thanks — your report has been submitted for review.
                </p>
                <button
                  onClick={reset}
                  style={{
                    padding: '10px 20px', borderRadius: '8px', fontWeight: 700, fontSize: '13px',
                    background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                    color: '#fff', border: 'none', cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px' }}>Report content</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 18px' }}>
                  Let us know what&#x2019;s wrong. Our team will review this.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {REASONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                        cursor: 'pointer',
                        border: reason === r ? '1px solid #d97706' : '1px solid var(--border-color)',
                        background: reason === r ? 'rgba(217,119,6,0.12)' : 'var(--bg-input)',
                        color: reason === r ? '#d97706' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <textarea
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder="Additional details (optional)"
                  maxLength={300}
                  rows={3}
                  style={{
                    width: '100%', resize: 'none', boxSizing: 'border-box',
                    padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
                    background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                    fontFamily: 'inherit', marginBottom: '14px',
                  }}
                />

                {error && (
                  <p style={{ fontSize: '12px', color: '#ef4444', margin: '0 0 12px' }}>{error}</p>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={reset}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 700, fontSize: '13px',
                      background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!reason || submitting}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 700, fontSize: '13px',
                      background: !reason ? 'var(--border-color)' : 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                      color: !reason ? 'var(--text-muted)' : '#fff',
                      border: 'none', cursor: !reason || submitting ? 'not-allowed' : 'pointer',
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}