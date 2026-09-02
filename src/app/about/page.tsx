import type { Metadata } from 'next';
import Navbar from '../components/shared/Navbar';
import Footer from '../components/shared/Footer';
import FeaturesSection from './FeaturesSection';
import {
  ScrollText,
  PenLine,
  Handshake,
  ShieldCheck,
  BookOpen,
  Clapperboard,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'About',
  description:
    "MANGAL is India's creator-first storytelling platform — WebMangal for comics, web novels and songs, KaTube for video, and the Kalpana Circle community. Free to read, free to publish.",
};

const STATS = [
  { label: 'Free to read', value: 'Forever' },
  { label: 'Platform cut for creators', value: '0%' },
  { label: 'Products, one account', value: '3' },
  { label: 'Made in', value: '🇮🇳 Bharat' },
];

// ── The MANGAL ecosystem ─────────────────────────────────────────────────────
// §144 — the company/about page now describes the whole platform, not just
// WebMangal: readers meet the three products and the compliance posture in
// one place. Same dark-mode CSS-var inline-style convention as before.
const PRODUCTS: { icon: LucideIcon; name: string; tagline: string; desc: string }[] = [
  {
    icon: BookOpen,
    name: 'WebMangal',
    tagline: 'Comics, web novels & songs',
    desc: 'Read original comics, serialized novels and songs — or publish your own with a distraction-free reader, a studio-grade writer, and built-in AI tools: assisted polish, Hinglish → English conversion, and English ↔ Hindi translation.',
  },
  {
    icon: Clapperboard,
    name: 'KaTube',
    tagline: 'Video, by Indian creators',
    desc: 'Short and long-form video from creators across the country. Upload, watch and follow — the same account, the same zero-fee creator economics as the rest of MANGAL.',
  },
  {
    icon: MessagesSquare,
    name: 'Kalpana Circle',
    tagline: 'The community layer',
    desc: 'Share posts and polls, follow your favourite creators, save stories for later, and talk craft with the writers and artists behind the work.',
  },
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
    desc: 'Any creator can publish a comic, novel, song or video directly, with real tools and no approval queue standing between them and readers.',
  },
  {
    icon: Handshake,
    title: 'Readers first',
    desc: 'No paywalls, no ad clutter, no pay-to-skip chapters. Every story on MANGAL is free to read, permanently.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy by default',
    desc: 'Built for India\u2019s DPDP Act, 2023: clear consent, extra protections and parental confirmation for anyone under 18, and no behavioural profiling of minors.',
  },
];

export default function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar variant="legal" />

      <div style={{ maxWidth: '820px', margin: '0 auto', padding: '56px 24px 80px' }}>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, margin: '0 0 16px', letterSpacing: '-0.03em' }}>
          About MANGAL
        </h1>
        <p style={{ fontSize: '16px', lineHeight: 1.7, color: 'var(--text-secondary)', margin: '0 0 32px' }}>
          MANGAL is India&apos;s creator-first storytelling platform — built around stories that reflect where
          we&apos;re actually from. One free account covers all three products, creators keep 100% of what they
          earn, and every story is free to read with no ads and no paywalls, ever.
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

        <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          The MANGAL ecosystem
        </h2>
        <p style={{ fontSize: '13.5px', color: 'var(--text-tertiary)', lineHeight: 1.6, margin: '0 0 20px' }}>
          Three products, one account, one community — each built to give Indian stories a home.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '48px' }}>
          {PRODUCTS.map(p => (
            <div key={p.name} style={{
              display: 'flex', gap: '16px', padding: '18px 20px', borderRadius: '12px',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderTop: '2px solid var(--accent)',
            }}>
              <div style={{ flexShrink: 0, color: 'var(--accent)', paddingTop: '2px' }}><p.icon size={26} strokeWidth={1.75} /></div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800 }}>{p.name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {p.tagline}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{p.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          What each product does
        </h2>
        <p style={{ fontSize: '13.5px', color: 'var(--text-tertiary)', lineHeight: 1.6, margin: '0 0 20px' }}>
          Every feature below is live today — grouped by who it&apos;s for.
        </p>
        <div style={{ marginBottom: '48px' }}>
          {/* §145 — per-platform features grid. Client component: one-time
              scroll-reveal per card, prefers-reduced-motion aware. Copy is
              grounded in the §145 Phase 0 audit — shipped features only. */}
          <FeaturesSection />
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
          Questions, feedback, or want to publish your own work? Check the{' '}
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
