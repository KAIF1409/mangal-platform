'use client';

// Step 17 — Grievance Officer Page
//
// LEGAL BASIS: India's Information Technology (Intermediary Guidelines and
// Digital Media Ethics Code) Rules, 2021 (IT Rules 2021), Rule 3(2)(b) requires
// every significant social media intermediary and digital platform to:
//   - Appoint a Grievance Officer based in India
//   - Publish their name and contact details on the platform
//   - Acknowledge complaints within 24 hours
//   - Resolve complaints within 15 days (IT Rules 2021 reduced this from the
//     old 2011 rule's 30 days — don't use 30 anywhere on this page)
//
// SETUP REQUIRED (one-time, free):
//   1. Go to https://formspree.io → create a free account
//   2. Create a new form → copy the form endpoint ID (e.g. "xpzgkqab")
//   3. Replace FORMSPREE_FORM_ID below with your actual ID
//   4. Replace GRIEVANCE_OFFICER_NAME and GRIEVANCE_OFFICER_EMAIL with real details
//   5. Add this page to your footer as a link: href="/grievance"
//
// Formspree free tier: 50 submissions/month — more than enough for a
// grievance form that should ideally get zero submissions.

import { useState } from 'react';
import Link from 'next/link';
import MangalLogo from '../components/shared/MangalLogo';
import { ArrowLeft, Scale, Timer, FileEdit, CheckCircle2, Check, Send } from 'lucide-react';

// ── CONFIGURE THESE BEFORE GOING LIVE ────────────────────────────────────────
const GRIEVANCE_OFFICER_NAME = 'Mohammed Kaif';
const GRIEVANCE_OFFICER_EMAIL = 'mangal.indiaplatform@gmail.com';
const PLATFORM_NAME = 'MANGAL';
const PLATFORM_ADDRESS = 'PES UNIVERSITY, Bangalore, Karnataka, India'; // Full address if you have one
const FORMSPREE_FORM_ID = 'maqgwdvo'; // e.g. "xpzgkqab"
// ─────────────────────────────────────────────────────────────────────────────

const ISSUE_TYPES = [
  'Copyright Infringement / DMCA',
  'Illegal / Prohibited Content',
  'Privacy Violation',
  'Impersonation or Fake Profile',
  'Harassment or Hate Speech',
  'Misinformation',
  'Deepfake / Synthetic Generated Content',
  'Child Safety Concern',
  'Other',
];

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export default function GrievancePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [issueType, setIssueType] = useState('');
  const [description, setDescription] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [formState, setFormState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: '10px',
    background: 'var(--bg-input)', border: '1px solid var(--border-light)',
    color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '10px', fontWeight: 700,
    color: 'var(--text-tertiary)', letterSpacing: '0.12em', textTransform: 'uppercase',
    marginBottom: '6px',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !issueType || !description.trim()) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    if (description.trim().length < 30) {
      setErrorMsg('Please describe the issue in more detail (at least 30 characters).');
      return;
    }

    setFormState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_FORM_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          issue_type: issueType,
          content_url: contentUrl.trim() || 'Not provided',
          description: description.trim(),
          submitted_at: new Date().toISOString(),
          platform: PLATFORM_NAME,
        }),
      });

      if (res.ok) {
        setFormState('success');
      } else {
        const data = await res.json();
        throw new Error(data?.error || 'Submission failed');
      }
    } catch (err) {
      setFormState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try emailing us directly.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)', }}>
      {/* NAV */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--nav-bg)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 24px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <MangalLogo size={32} />
          <span style={{ fontWeight: 900, fontSize: '18px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {PLATFORM_NAME}
          </span>
        </Link>
        <Link href="/" style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={12} strokeWidth={2} /> Back to Home
        </Link>
      </nav>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <span style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em',
            color: '#d97706', background: 'rgba(120,53,15,0.25)',
            border: '1px solid rgba(180,83,9,0.3)',
            padding: '4px 10px', borderRadius: '6px', textTransform: 'uppercase',
          }}>
            Legal · IT Rules 2021
          </span>
          <h1 style={{
            fontSize: '32px', fontWeight: 900, letterSpacing: '-0.02em',
            margin: '16px 0 8px', color: 'var(--text-primary)',
          }}>
            Grievance Officer
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, maxWidth: '580px' }}>
            In compliance with Rule 3(2)(b) of the Information Technology (Intermediary
            Guidelines and Digital Media Ethics Code) Rules, 2021, {PLATFORM_NAME} has
            appointed a Grievance Officer to address complaints from users.
          </p>
        </div>

        {/* Officer Card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '16px', padding: '24px 28px',
          marginBottom: '32px',
          display: 'flex', gap: '24px', alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}>
          {/* Avatar */}
          <div style={{
            width: '56px', height: '56px', borderRadius: '14px', flexShrink: 0,
            background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Scale size={22} strokeWidth={1.75} color="#fff" />
          </div>

          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
              Appointed Grievance Officer
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '12px' }}>
              {GRIEVANCE_OFFICER_NAME}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 8px' }}>
                <a href={`mailto:${GRIEVANCE_OFFICER_EMAIL}`}
                  style={{ color: '#d97706', textDecoration: 'none' }}>
                  {GRIEVANCE_OFFICER_EMAIL}
                </a>
              </p>
              <p style={{ margin: '0' }}>
                {PLATFORM_ADDRESS}
              </p>
            </div>
          </div>
        </div>

        {/* Compliance Card - Updated Timelines */}
        <div style={{
          background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.2)',
          borderRadius: '12px', padding: '16px 20px', marginBottom: '32px',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.7 }}>
            <strong style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Timer size={13} strokeWidth={2} /> Response & Appeal Timeline (IT Rules 2021 as amended)
            </strong>
            <ul style={{ margin: '0', paddingLeft: '20px' }}>
              <li>Acknowledgement: <strong>24 hours</strong></li>
              <li>Standard Resolution: <strong>15 days</strong></li>
              <li>Prohibited Content (specified): <strong>72 hours</strong> (Amendment 2025)</li>
              <li>Appeal to Grievance Appellate Committee: <strong>30 days</strong> from officer&apos;s decision (Amendment 2022)</li>
              <li>GAC Decision: <strong>30 days</strong> from appeal receipt</li>
            </ul>
            <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Users dissatisfied with the grievance officer&apos;s decision may appeal to the centrally-appointed Grievance Appellate Committee.
            </p>
          </div>
        </div>

        {/* Grievance Form */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '16px', padding: '28px', marginBottom: '32px',
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileEdit size={16} strokeWidth={2} /> Submit a Grievance
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
            All fields marked * are required. You will receive an email acknowledgement within 24 hours.
          </p>

          {formState === 'success' ? (
            <div style={{
              padding: '32px', textAlign: 'center',
              background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: '12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}><CheckCircle2 size={40} strokeWidth={1.5} color="#10b981" /></div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#10b981', margin: '0 0 8px' }}>
                Grievance Received
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 6px', lineHeight: 1.6 }}>
                We have received your complaint. You will get an acknowledgement at{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{email}</strong> within 24 hours,
                and a resolution within 15 days as required by IT Rules 2021.
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '16px 0 0' }}>
                If you don&apos;t hear back, email us directly at{' '}
                <a href={`mailto:${GRIEVANCE_OFFICER_EMAIL}`}
                  style={{ color: '#d97706', textDecoration: 'none' }}>
                  {GRIEVANCE_OFFICER_EMAIL}
                </a>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={labelStyle}>Your Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    style={inputStyle}
                    disabled={formState === 'submitting'}
                  />
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={labelStyle}>Your Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={inputStyle}
                    disabled={formState === 'submitting'}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Issue Type *</label>
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  disabled={formState === 'submitting'}
                >
                  <option value="">Select the type of issue</option>
                  {ISSUE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>URL of Reported Content (if applicable)</label>
                <input
                  type="url"
                  value={contentUrl}
                  onChange={(e) => setContentUrl(e.target.value)}
                  placeholder="https://mangal.app/series/..."
                  style={inputStyle}
                  disabled={formState === 'submitting'}
                />
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '5px 0 0' }}>
                  Paste the link to the specific series, chapter, or comment you are reporting.
                </p>
              </div>

              <div>
                <label style={labelStyle}>Description *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="Describe the issue clearly. Include what content you found problematic, why it violates our policies or the law, and any other relevant details."
                  style={{ ...inputStyle, resize: 'vertical' }}
                  disabled={formState === 'submitting'}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <span style={{
                    fontSize: '11px',
                    color: description.length < 30 ? 'var(--text-muted)' : '#10b981',
                  }}>
                    {description.length} characters {description.length < 30 ? `(${30 - description.length} more needed)` : <Check size={12} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: 'middle' }} />}
                  </span>
                </div>
              </div>

              {(errorMsg || formState === 'error') && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                  color: '#ef4444', fontSize: '12px',
                }}>
                  {errorMsg || 'Submission failed. Please try emailing us directly.'}
                </div>
              )}

              <button
                type="submit"
                disabled={formState === 'submitting'}
                style={{
                  width: '100%', padding: '14px',
                  background: formState === 'submitting'
                    ? 'var(--border-color)'
                    : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                  border: '1px solid #7f1d1d', borderRadius: '12px',
                  color: formState === 'submitting' ? 'var(--text-muted)' : '#fff',
                  fontSize: '13px', fontWeight: 700,
                  cursor: formState === 'submitting' ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                {formState === 'submitting' ? 'Submitting...' : (<><Send size={14} strokeWidth={2} /> Submit Grievance</>)}
              </button>

              <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                By submitting, you confirm that the information provided is accurate to the best
                of your knowledge. False complaints may result in account action.
              </p>
            </form>
          )}
        </div>

        {/* Legal notice - Updated with 2025/2026 amendments */}
        <div style={{
          border: '1px dashed var(--border-light)', borderRadius: '12px',
          padding: '20px 24px', color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.7,
        }}>
          <strong style={{ color: 'var(--text-tertiary)', display: 'block', marginBottom: '8px' }}>
            Legal Reference & Latest Amendments
          </strong>
          <p style={{ margin: '0 0 10px' }}>
            This page is maintained in accordance with the Information Technology
            (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021,
            notified under Section 87(2) of the Information Technology Act, 2000.
            {' '}{PLATFORM_NAME} acts as an intermediary platform under this Act.
          </p>
          <p style={{ margin: '0 0 10px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
            <strong>Latest Amendments (2022-2026):</strong>
            <br />• Grievance Appellate Committee (GAC) mechanism established for appeals within 30 days
            <br />• 72-hour response requirement for specified prohibited content (Amendment 2025)
            <br />• Synthetic Generated Information (SGI) and deepfake regulation (Amendment 2025/2026)
            <br />• Monthly compliance review requirements for intermediaries
          </p>
          <p style={{ margin: '0', fontSize: '11px' }}>
            Users may also approach the relevant Grievance Appellate Committee, appellate authority, 
            or court of competent jurisdiction if unsatisfied with the resolution.
          </p>
        </div>

      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--border-color)', padding: '20px 24px',
        display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap',
      }}>
        {[
          { label: 'Home', href: '/' },
          { label: 'Privacy Policy', href: '/privacy' },
          { label: 'Terms of Service', href: '/terms' },
          { label: 'Grievance Officer', href: '/grievance' },
        ].map((link) => (
          <a key={link.href} href={link.href} style={{
            fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'none',
          }}>
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}