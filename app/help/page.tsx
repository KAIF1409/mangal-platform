import type { Metadata } from 'next';
import HelpAccordion from './HelpAccordion';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'Help Center',
  description: 'Answers to common questions about reading, publishing, and using MANGAL.',
};

const FAQ_SECTIONS: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: 'Reading',
    items: [
      {
        q: 'Is MANGAL really free to read?',
        a: 'Yes — every comic and novel on MANGAL is free to read, permanently. There are no paywalls, no pay-to-skip chapters, and no ads.',
      },
      {
        q: 'Do I need an account to read?',
        a: "No, you can browse and read without signing up. An account is only needed if you want to bookmark series, follow creators, leave reviews, or get personalized recommendations.",
      },
      {
        q: "What's the difference between scroll and page reading mode?",
        a: 'Scroll mode is a continuous vertical strip, best for webtoon-style comics. Page mode shows one page at a time, closer to a traditional printed manga. Each series is set to whichever mode its creator chose.',
      },
    ],
  },
  {
    title: 'Publishing',
    items: [
      {
        q: 'How do I become a creator?',
        a: "Tap \"Become a Creator\" from the homepage or your account settings. There's no approval queue — you get access to the upload tools right away.",
      },
      {
        q: 'Does MANGAL take a cut of anything?',
        a: 'No. Publishing and reading are both free, and MANGAL does not take a platform cut from creators.',
      },
      {
        q: 'Can I publish both comics and novels?',
        a: 'Yes — one creator account covers both content types (Mangal/comics and Novels), and you can mix formats across your catalog.',
      },
    ],
  },
  {
    title: 'Account & Privacy',
    items: [
      {
        q: 'How do I report a story or a comment?',
        a: 'Use the report button available on series pages and reviews. Reports go to our moderation team for review.',
      },
      {
        q: 'Where can I read the privacy policy or terms?',
        a: 'Both are linked in the footer of every page: Privacy Policy and Terms of Service.',
      },
      {
        q: "Who do I contact for a formal complaint or legal request?",
        a: "Our Grievance Officer page has the process and contact details for formal requests under Indian IT rules.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar variant="legal" />

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '56px 24px 80px' }}>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.03em' }}>
          Help Center
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: '0 0 40px' }}>
          Answers to the questions we hear most. Can&apos;t find yours?{' '}
          <a href="/about" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>Contact us</a>.
        </p>

        <HelpAccordion sections={FAQ_SECTIONS} />
      </div>

      <Footer />
    </div>
  );
}
