'use client';

import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// Step 18 — Terms of Service Page
//
// Covers: user conduct, content ownership, takedown policy, and the
// 13+ age requirement, per the roadmap spec for Step 18.
//
// SETUP: nothing to configure — reuses the same contact details as
// app/grievance/page.tsx. If those ever change, update both files.

const PLATFORM_NAME = 'MANGAL';
const CONTACT_EMAIL = 'mangal.indiaplatform@gmail.com';
const PLATFORM_ADDRESS = 'PES UNIVERSITY, Bangalore, Karnataka, India';
const LAST_UPDATED = '21 June 2026';
const MIN_AGE = 13;

const SECTIONS = [
  { id: 'acceptance', label: 'Acceptance of Terms' },
  { id: 'age', label: 'Age Requirement' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'conduct', label: 'User Conduct' },
  { id: 'content-ownership', label: 'Content Ownership' },
  { id: 'license', label: 'License You Grant Us' },
  { id: 'takedown', label: 'Reporting & Takedown Policy' },
  { id: 'creator-earnings', label: 'Creator Earnings (Future)' },
  { id: 'termination', label: 'Suspension & Termination' },
  { id: 'disclaimers', label: 'Disclaimers' },
  { id: 'changes', label: 'Changes To These Terms' },
  { id: 'contact', label: 'Contact Us' },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ marginBottom: '40px', scrollMarginTop: '80px' }}>
      <h2
        style={{
          fontSize: '18px',
          fontWeight: 800,
          color: '#fff',
          margin: '0 0 14px',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.8 }}>{children}</div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
      <span style={{ color: '#d97706', flexShrink: 0 }}>—</span>
      <span>{children}</span>
    </div>
  );
}

export default function TermsOfServicePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#07070a',
        color: '#f9fafb',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      {/* NAVBAR COMPONENT */}
      <Navbar />

      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          padding: '48px 24px 80px',
          display: 'flex',
          gap: '48px',
        }}
      >
        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ marginBottom: '40px' }}>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: '#d97706',
                background: 'rgba(120,53,15,0.25)',
                border: '1px solid rgba(180,83,9,0.3)',
                padding: '4px 10px',
                borderRadius: '6px',
                textTransform: 'uppercase',
              }}
            >
              Legal · Terms of Service
            </span>
            <h1
              style={{
                fontSize: '32px',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                margin: '16px 0 8px',
                color: '#fff',
              }}
            >
              Terms of Service
            </h1>
            <p style={{ fontSize: '14px', color: '#9ca3af', lineHeight: 1.7, margin: '0 0 4px', maxWidth: '600px' }}>
              These terms govern your use of {PLATFORM_NAME}. By using the platform, you agree to
              them. We have tried to write this in plain language rather than dense legal text.
            </p>
            <p style={{ fontSize: '11px', color: '#4b5563', margin: 0 }}>Last updated: {LAST_UPDATED}</p>
          </div>

          <Section id="acceptance" title="Acceptance of Terms">
            <p style={{ margin: 0 }}>
              By creating an account or using {PLATFORM_NAME} in any way, you agree to these Terms
              of Service and our{' '}
              <a href="/privacy" style={{ color: '#d97706', textDecoration: 'none' }}>
                Privacy Policy
              </a>
              . If you do not agree, please do not use the platform.
            </p>
          </Section>

          <Section id="age" title="Age Requirement">
            <p style={{ margin: 0 }}>
              You must be at least {MIN_AGE} years old to create an account on {PLATFORM_NAME}. If
              we learn that an account belongs to someone under {MIN_AGE}, we will remove the
              account. If you are under 18, your use of the platform is also subject to the
              additional protections described in our{' '}
              <a href="/privacy" style={{ color: '#d97706', textDecoration: 'none' }}>
                Privacy Policy
              </a>
              : no behavioral tracking, no targeted or personalized advertising built from your
              reading activity, and verifiable parental consent before your account is activated.
              Some content on the platform may be intended for mature audiences; creators are
              responsible for tagging such content appropriately, and age-gating for 18+ content
              is a planned feature.
            </p>
          </Section>

          <Section id="accounts" title="Accounts">
            <Bullet>You are responsible for keeping your account credentials secure.</Bullet>
            <Bullet>You are responsible for all activity that happens under your account.</Bullet>
            <Bullet>
              You may sign up as a Reader or a Creator. Readers can upgrade to Creator at any time
              through the &ldquo;Become a Creator&rdquo; flow.
            </Bullet>
            <Bullet>
              You may not create an account using false information, a name or email that is not
              yours, or an account that impersonates another person or entity.
            </Bullet>
            <Bullet>
              We reserve the right to refuse or suspend any account that violates these Terms or
              that we believe is being used for illegal or harmful purposes.
            </Bullet>
          </Section>

          <Section id="conduct" title="User Conduct">
            <p style={{ margin: '0 0 12px' }}>You agree not to use {PLATFORM_NAME} to:</p>
            <Bullet>
              Upload or distribute any illegal content (child sexual abuse material, materials that
              violate copyright, etc.).
            </Bullet>
            <Bullet>
              Harass, bully, threaten, or impersonate anyone else. This includes in comments, replies,
              and user-generated reactions.
            </Bullet>
            <Bullet>
              Spam, use bots to inflate view counts or artificially boost follow counts, or engage
              in other deceptive practices.
            </Bullet>
            <Bullet>
              Exploit or abuse our service to harm others, including accessing systems without
              authorization, DoS attacks, or using the platform for phishing.
            </Bullet>
            <Bullet>
              Distribute malware, viruses, or other harmful code via chapters, comments, or share
              links.
            </Bullet>
            <p style={{ margin: '12px 0 0' }}>
              Violations can be reported using the Report button on any chapter or comment, or
              through our{' '}
              <a href="/grievance" style={{ color: '#d97706', textDecoration: 'none' }}>
                Grievance Officer page
              </a>
              .
            </p>
          </Section>

          <Section id="content-ownership" title="Content Ownership">
            <Bullet>
              <strong style={{ color: '#d1d5db' }}>Creators retain ownership</strong> of the comic
              series, chapters, and pages they upload. Uploading content to {PLATFORM_NAME} does
              not transfer copyright to us.
            </Bullet>
            <Bullet>
              <strong style={{ color: '#d1d5db' }}>You must own or have the rights</strong> to
              anything you upload. Do not upload someone else&apos;s comic, artwork, or translation
              without permission.
            </Bullet>
            <Bullet>
              <strong style={{ color: '#d1d5db' }}>Comments and reactions</strong> you post remain
              yours, but by posting them you allow other users and {PLATFORM_NAME} to display them
              as part of the normal operation of the platform.
            </Bullet>
          </Section>

          <Section id="license" title="License You Grant Us">
            <p style={{ margin: 0 }}>
              By uploading content as a creator, you grant {PLATFORM_NAME} a non-exclusive,
              worldwide license to host, store, display, and distribute that content on the
              platform for the purpose of making it available to readers (including via features
              like search, recommendations, and social sharing previews). This license ends when
              you delete the content or your account, except where copies may briefly persist in
              backups or caches.
            </p>
          </Section>

          <Section id="takedown" title="Reporting & Takedown Policy">
            <p style={{ margin: '0 0 12px' }}>
              Any user can report a series, chapter, or comment using the Report button, selecting a
              reason (Inappropriate, Spam, Copyright, or Other). Reports are reviewed by our
              developer/moderation role.
            </p>
            <Bullet>
              For copyright (DMCA-style) complaints, use the{' '}
              <a href="/grievance" style={{ color: '#d97706', textDecoration: 'none' }}>
                Grievance Officer page
              </a>{' '}
              and select &ldquo;Copyright Infringement / DMCA&rdquo; as the issue type, including a
              link to the specific content.
            </Bullet>
            <Bullet>
              We aim to acknowledge reports within 24 hours and resolve them within 15 days, as
              required by IT Rules 2021 Rule 3(2)(a). Content involving nudity, sexual conduct, or
              impersonation via morphed images is taken down within 24 hours of a valid complaint,
              per Rule 3(2)(b).
            </Bullet>
            <Bullet>
              Depending on severity, we may remove specific content, suspend the uploading account,
              or — for repeated or serious violations — terminate the account.
            </Bullet>
          </Section>

          <Section id="creator-earnings" title="Creator Earnings (Future)">
            <p style={{ margin: 0 }}>
              {PLATFORM_NAME} does not currently process payments. Planned features include reader
              tips via UPI and a revenue share from advertising, both routed to the payout details
              (UPI ID or bank account) a creator provides in their creator profile. Specific terms
              for revenue share, platform fees, and payout schedules will be published here before
              any such feature goes live, and creators will be asked to accept those terms
              separately.
            </p>
          </Section>

          <Section id="termination" title="Suspension & Termination">
            <Bullet>You may stop using {PLATFORM_NAME} and request account deletion at any time — see our Privacy Policy for how.</Bullet>
            <Bullet>We may suspend or terminate an account that violates these Terms, particularly for illegal content, repeated harassment, or copyright infringement.</Bullet>
            <Bullet>We will generally try to notify you of the reason for any suspension or termination, except in cases involving illegal content or active abuse, where immediate action may be necessary.</Bullet>
          </Section>

          <Section id="disclaimers" title="Disclaimers">
            <p style={{ margin: 0 }}>
              {PLATFORM_NAME} is provided &ldquo;as is.&rdquo; As an early-stage, independently-built
              platform, we do not guarantee uninterrupted availability, and features may change or
              be added as the platform grows. Creators publish content independently; views
              expressed in user-generated content (series, comments, etc.) are those of the user who
              posted them, not {PLATFORM_NAME}.
            </p>
          </Section>

          <Section id="changes" title="Changes To These Terms">
            <p style={{ margin: 0 }}>
              We may update these Terms as {PLATFORM_NAME} adds new features (such as payments or
              regional language support). We will update the &ldquo;Last updated&rdquo; date above
              whenever we make a change. Continued use of the platform after an update means you
              accept the revised Terms.
            </p>
          </Section>

          <Section id="contact" title="Contact Us">
            <p style={{ margin: 0 }}>
              For questions about these Terms, email us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#d97706', textDecoration: 'none' }}>
                {CONTACT_EMAIL}
              </a>
              . For complaints about specific content or conduct, use our{' '}
              <a href="/grievance" style={{ color: '#d97706', textDecoration: 'none' }}>
                Grievance Officer page
              </a>{' '}
              instead.
            </p>
          </Section>
        </div>

        {/* On-page nav (desktop only) */}
        <div
          style={{
            width: '180px',
            flexShrink: 0,
            display: 'none',
          }}
          className="terms-toc"
        >
          <div
            style={{
              position: 'sticky',
              top: '92px',
              borderLeft: '1px solid #1a1a26',
              paddingLeft: '20px',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#4b5563',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              On This Page
            </div>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: '#6b7280',
                  textDecoration: 'none',
                  marginBottom: '10px',
                  lineHeight: 1.4,
                }}
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 860px) {
          .terms-toc { display: block !important; }
        }
      `}</style>

      {/* FOOTER COMPONENT */}
      <Footer showBrandBlock={false} />
    </div>
  );
}