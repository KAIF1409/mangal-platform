'use client';

// Step 18 — Privacy Policy Page
//
// LEGAL BASIS: Digital Personal Data Protection Act, 2023 (DPDP Act) and the
// DPDP Rules, 2025 (notified 13 Nov 2025, phased compliance through 13 May 2027).
// MANGAL acts as a "Data Fiduciary" under this law.
//
// DEV TODO before public launch (tracked in context doc, Step 19):
//   - Consent banner on first visit (Accept/Decline) — not yet built
//   - "Delete My Account" flow that purges front-facing PII immediately and
//     moves registration logs to 180-day cold storage — not yet built
//   - "Download My Data" export (JSON) — not yet built
//   - Date-of-birth field at signup + minors handling (no tracking/targeted
//     content for under-18s, verifiable parental consent) — not yet built
//   - Hindi translation of this page — not yet built (ties into Step 21)
// This page describes MANGAL's data practices accurately as designed; the
// items above are the remaining implementation work to make the platform's
// actual behavior match what's written here. Do not deploy this page to
// production and call DPDP compliance "done" until those items ship.

import { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// ── CONFIGURE THESE ─────────────────────────────────────────────────────────
const PLATFORM_NAME = 'MANGAL';
const GRIEVANCE_OFFICER_NAME = 'Mohammed Kaif';
const GRIEVANCE_OFFICER_EMAIL = 'mangal.indiaplatform@gmail.com';
const PLATFORM_ADDRESS = 'PES UNIVERSITY, Bangalore, Karnataka, India';
const LAST_UPDATED = '21 June 2026';
// ─────────────────────────────────────────────────────────────────────────────

interface DataItem {
  what: string;
  why: string;
  retention: string;
}

const DATA_ITEMS: DataItem[] = [
  {
    what: 'Email address & password (via Supabase Auth, encrypted)',
    why: 'To create and secure your account, log you in, and send essential account emails',
    retention: 'Until you delete your account; registration log retained 180 days after that (see "What Happens When You Delete Your Account")',
  },
  {
    what: 'Username, display name, avatar, creator bio',
    why: 'To show your public identity to other readers/creators on profile pages',
    retention: 'Until you delete your account or edit/remove it yourself',
  },
  {
    what: 'Reading progress (series, chapter, page)',
    why: 'To power "Continue Reading" so you don\'t lose your place',
    retention: 'Until you delete your account, or anytime from your library settings',
  },
  {
    what: 'Follows, ratings, reactions, comments',
    why: 'To power your library, show ratings/reactions to other readers, and enable discussion',
    retention: 'Until you delete the item yourself or delete your account',
  },
  {
    what: 'Device & usage data (IP address, browser type, pages visited)',
    why: 'Security, fraud prevention, debugging, and to satisfy Indian legal record-keeping requirements',
    retention: '180 days, per IT Rules 2021 — kept in a separate access-restricted store, not shown anywhere in the app',
  },
  {
    what: 'View counts (per series, per visitor, per day)',
    why: 'To show accurate view counts and power Trending/Discovery sections',
    retention: 'Stored as aggregated counts, not tied to your identity beyond a same-day local browser flag',
  },
];

const YOUR_RIGHTS = [
  {
    title: 'Right to Access',
    body: 'Request a copy of the personal data we hold about you.'
  },
  {
    title: 'Right to Correction',
    body: 'Fix inaccurate or outdated personal data (e.g. via your profile settings).'
  },
  {
    title: 'Right to Erasure',
    body: "Request deletion of your personal data once it's no longer needed for the purpose it was collected, or if you withdraw consent."
  },
  {
    title: 'Right to Withdraw Consent',
    body: "Withdraw any consent you've given, as easily as you gave it. Withdrawal does not affect processing already carried out."
  },
  {
    title: 'Right to Grievance Redressal',
    body: 'Raise a complaint with our Grievance Officer, and escalate to the Data Protection Board of India if unresolved.'
  },
  {
    title: 'Right to Nominate',
    body: 'Nominate another individual to exercise these rights on your behalf in the event of your death or incapacity.'
  },
];
export default function PrivacyPolicyPage() {
  const [langNotice, setLangNotice] = useState(true);

  const sectionCard: React.CSSProperties = {
    background: '#0d0d14', border: '1px solid #1a1a26',
    borderRadius: '16px', padding: '24px 28px', marginBottom: '24px',
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: '16px', fontWeight: 800, color: '#fff', margin: '0 0 14px',
    display: 'flex', alignItems: 'center', gap: '8px',
  };
  const bodyText: React.CSSProperties = {
    fontSize: '13px', color: '#9ca3af', lineHeight: 1.75, margin: '0 0 10px',
  };

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#07070a',
      color: '#f9fafb', }}>
      
     <Navbar />

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <span style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em',
            color: '#d97706', background: 'rgba(120,53,15,0.25)',
            border: '1px solid rgba(180,83,9,0.3)',
            padding: '4px 10px', borderRadius: '6px', textTransform: 'uppercase',
          }}>
            Legal · DPDP Act 2023
          </span>
          <h1 style={{
            fontSize: '32px', fontWeight: 900, letterSpacing: '-0.02em',
            margin: '16px 0 8px', color: '#fff',
          }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: '14px', color: '#9ca3af', lineHeight: 1.7, margin: 0, maxWidth: '580px' }}>
            This policy explains what personal data {PLATFORM_NAME} collects, why,
            how long we keep it, and the rights you have over it under India&apos;s
            Digital Personal Data Protection Act, 2023.
          </p>
          <p style={{ fontSize: '11px', color: '#4b5563', margin: '10px 0 0' }}>
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        {/* Multilingual notice banner */}
        {langNotice && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)',
            borderRadius: '12px', padding: '12px 18px', marginBottom: '28px', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '12px', color: '#d97706' }}>
              🇮🇳 हिंदी में यह नीति जल्द उपलब्ध होगी &mdash; A Hindi version of this policy is coming soon.
            </span>
            <button
              onClick={() => setLangNotice(false)}
              style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}
            >
              Dismiss ✕
            </button>
          </div>
        )}

        {/* TL;DR */}
        <div style={{ ...sectionCard, borderColor: 'rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.04)' }}>
          <h2 style={sectionTitle}>⚡ The Short Version</h2>
          <p style={bodyText}>
            We collect only what&apos;s needed to run MANGAL: your login, your reading
            activity, and basic security logs. We never sell your data. We never run
            targeted ads against minors. You can see, download, correct, or delete
            your data at any time from your profile settings.
          </p>
        </div>

        {/* What We Collect — itemized, not bundled (DPDP requirement) */}
        <div style={sectionCard}>
          <h2 style={sectionTitle}>📊 What We Collect (Itemized)</h2>
          <p style={bodyText}>
            Under the DPDP Act, we must itemize, not lump. Here&apos;s exactly what we
            collect, why, and how long we keep it. No surprises.
          </p>
          <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
            {DATA_ITEMS.map((item, idx) => (
              <div key={idx} style={{
                background: '#08080c', border: '1px solid #14141e',
                borderRadius: '10px', padding: '14px 16px',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#d97706', marginBottom: '6px' }}>
                  {item.what}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>
                  <span style={{ color: '#d97706', fontWeight: 700 }}>Why: </span>{item.why}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                  <span style={{ color: '#d97706', fontWeight: 700 }}>Kept: </span>{item.retention}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What happens when you delete your account */}
        <div style={sectionCard}>
          <h2 style={sectionTitle}>🗑️ What Happens When You Delete Your Account</h2>
          <p style={bodyText}>
            This is where Indian law pulls in two directions, and we want to be
            upfront about how we handle it rather than bury it in legal text:
          </p>
          <p style={bodyText}>
            <strong style={{ color: '#fff' }}>Immediately on deletion:</strong> your
            profile, avatar, bio, reading history, follows, comments, ratings, and
            reactions are permanently removed from the live app and database.
            Nothing personally identifying remains visible anywhere on MANGAL.
          </p>
          <p style={bodyText}>
            <strong style={{ color: '#fff' }}>Retained separately for 180 days:</strong> your
            account-creation timestamp, registration IP address, and an encrypted
            account identifier move into an isolated, access-restricted log store.
            This isn&apos;t optional on our part — the IT Rules, 2021 require
            platforms to retain this category of record for 180 days after account
            closure, in case government or law-enforcement agencies need it to
            investigate a cybersecurity incident or legal matter. After 180 days,
            it is permanently and automatically erased. Nobody at {PLATFORM_NAME}
            can see or use this archive for any purpose other than responding to a
            lawful request.
          </p>
        </div>

        {/* Minors */}
        <div style={sectionCard}>
          <h2 style={sectionTitle}>🧒 Children &amp; Minors</h2>
          <p style={bodyText}>
            Under the DPDP Act, anyone under 18 is legally a &quot;child,&quot; and
            we take that seriously given the audience a manga platform naturally
            attracts. For accounts identified as belonging to a minor: we do not
            build behavioral profiles from your reading activity, we do not run
            targeted or personalized advertising against you, and account creation
            requires a parent or guardian&apos;s verifiable consent. If you believe
            a minor has an account without appropriate consent, please contact our
            Grievance Officer below and we will act on it promptly.
          </p>
        </div>

        {/* Your Rights */}
        <div style={sectionCard}>
          <h2 style={sectionTitle}>✅ Your Rights as a Data Principal</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', marginTop: '8px' }}>
            {YOUR_RIGHTS.map((r) => (
              <div key={r.title} style={{
                background: '#08080c', border: '1px solid #14141e',
                borderRadius: '10px', padding: '14px 16px',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#d97706', marginBottom: '4px' }}>
                  {r.title}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', lineHeight: 1.6 }}>
                  {r.body}
                </div>
              </div>
            ))}
          </div>
          <p style={{ ...bodyText, marginTop: '16px' }}>
            To exercise any of these rights, use the relevant control in your
            profile settings, or contact our Grievance Officer directly. We will
            respond within the timelines required by law.
          </p>
        </div>

        {/* Who we share data with */}
        <div style={sectionCard}>
          <h2 style={sectionTitle}>🔗 Who We Share Data With</h2>
          <p style={bodyText}>
            We do not sell your personal data, ever — to anyone, for any reason.
            We use a small number of service providers (Data Processors) strictly
            to operate the platform:
          </p>
          <ul style={{ ...bodyText, paddingLeft: '20px', margin: 0 }}>
            <li><strong style={{ color: '#fff' }}>Supabase</strong> — hosts our database, authentication, and file storage</li>
            <li><strong style={{ color: '#fff' }}>Vercel</strong> — hosts and serves the MANGAL website</li>
            <li><strong style={{ color: '#fff' }}>Formspree</strong> — processes grievance form submissions only</li>
          </ul>
          <p style={{ ...bodyText, marginTop: '10px' }}>
            We may disclose limited data if legally required to do so by an Indian
            court, government authority, or law enforcement agency acting under
            applicable law.
          </p>
        </div>

        {/* Security */}
        <div style={sectionCard}>
          <h2 style={sectionTitle}>🔒 How We Protect Your Data</h2>
          <p style={bodyText}>
            Passwords are never stored in plain text. Database access is governed
            by Row Level Security policies so that, by default, you can only read
            and write your own data. All traffic between your device and MANGAL is
            encrypted (HTTPS/TLS). No system is perfectly secure, and if a breach
            ever affects your data, we will notify you and the Data Protection
            Board within 72 hours, as required by law.
          </p>
        </div>

        {/* Cookies / local storage */}
        <div style={sectionCard}>
          <h2 style={sectionTitle}>🍪 Cookies &amp; Local Storage</h2>
          <p style={bodyText}>
            We use your browser&apos;s local storage (not third-party tracking
            cookies) for small functional purposes: remembering that you&apos;ve
            already been counted as a view on a series today, and remembering
            your language preference. We do not use this for advertising or
            cross-site tracking.
          </p>
        </div>

        {/* Changes */}
        <div style={sectionCard}>
          <h2 style={sectionTitle}>📝 Changes to This Policy</h2>
          <p style={bodyText}>
            If we make material changes to this policy, we&apos;ll update the
            &quot;Last updated&quot; date above and, where required, ask for your
            renewed consent before continuing to process your data under the new
            terms.
          </p>
        </div>

        {/* Contact / Grievance */}
        <div style={{
          background: '#0d0d14', border: '1px solid #1a1a26',
          borderRadius: '16px', padding: '24px 28px',
        }}>
          <h2 style={sectionTitle}>📬 Questions or Concerns</h2>
          <p style={bodyText}>
            For anything related to this policy or your personal data, contact our
            appointed Grievance Officer:
          </p>
          <div style={{ fontSize: '13px', color: '#fff', fontWeight: 700, marginTop: '8px' }}>
            {GRIEVANCE_OFFICER_NAME}
          </div>
          <a href={`mailto:${GRIEVANCE_OFFICER_EMAIL}`} style={{ fontSize: '13px', color: '#d97706', textDecoration: 'none' }}>
            {GRIEVANCE_OFFICER_EMAIL}
          </a>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            {PLATFORM_ADDRESS}
          </div>
          <a href="/grievance" style={{
            display: 'inline-block', marginTop: '16px',
            padding: '9px 18px', borderRadius: '8px',
            background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)',
            color: '#d97706', fontSize: '12px', fontWeight: 700, textDecoration: 'none',
          }}>
            Open Grievance Form →
          </a>
        </div>

      </div>

      <Footer showBrandBlock={false} />
    </div>
  );
}