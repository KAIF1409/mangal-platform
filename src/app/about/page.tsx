import type { Metadata } from 'next';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ScrollText, PenLine, Handshake, type LucideIcon } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About',
  description: "MANGAL is India's home for original comics and web novels — free to read, free to publish.",
};

const STATS = [
  { label: 'Free to read', value: 'Forever' },
  { label: 'Platform cut for creators', value: '0%' },
  { label: 'Made in', value: '🇮🇳 Bharat' },
];

const VALUES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: ScrollText,
    title: 'Stories rooted in culture',
    desc: 'Mythology, folk tales, street life — genres that mainstream platforms rarely make room for get a real home here.',
  },
  {
    icon: PenLine,
    title: 'No gatekeepers',
    desc: 'Any creator can publish a comic or novel directly, with real tools and no approval queue standing between them and readers.',
  },
  {
    icon: Handshake,
    title: 'Readers first',
    desc: 'No paywalls, no ad clutter, no pay-to-skip chapters. Every story on MANGAL is free to read, permanently.',
  },
];

export default function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar variant="legal" />

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '56px 24px 80px' }}>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, margin: '0 0 16px', letterSpacing: '-0.03em' }}>
          About MANGAL
        </h1>
        <p style={{ fontSize: '16px', lineHeight: 1.7, color: 'var(--text-secondary)', margin: '0 0 32px' }}>
          MANGAL is India&apos;s platform for original comics and web novels — built by creators, for readers,
          around stories that reflect where we&apos;re actually from. One account gets you both content types,
          zero platform fees for creators, and a reading experience with no ads and no paywalls, ever.
        </p>

        <div style={{
          display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '0 0 48px',
          padding: '20px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        }}>
          {STATS.map(s => (
            <div key={s.label} style={{ flex: '1 1 140px' }}>
              <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--accent)' }}>{s.value}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 20px', letterSpacing: '-0.02em' }}>
          What we care about
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '48px' }}>
          {VALUES.map(v => (
            <div key={v.title} style={{
              display: 'flex', gap: '16px', padding: '18px 20px', borderRadius: '12px',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            }}>
              <div style={{ flexShrink: 0, color: 'var(--accent)' }}><v.icon size={24} strokeWidth={1.75} /></div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>{v.title}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{v.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
          Get in touch
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: '8px' }}>
          Questions, feedback, or want to publish your own comic or novel? Check the{' '}
          <a href="/help" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>Help Center</a>{' '}
          first, or reach out through our{' '}
          <a href="/grievance" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>Grievance Officer</a>{' '}
          page for formal requests.
        </p>
      </div>

      <Footer />
    </div>
  );
}
