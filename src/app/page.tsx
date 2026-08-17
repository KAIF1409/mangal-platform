'use client';

import { useState, useEffect, useRef, type CSSProperties, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ThemeToggle from './components/shared/ThemeToggle';
import ParticleField from './components/shared/ParticleField';
import CustomCursor from './components/shared/CustomCursor';
import { supabase } from './lib/supabase';
import { ScrollText, Flame, Smartphone, PenLine, X, Menu, Tag, Eye, BookOpen, Book, ArrowDown, ArrowRight } from 'lucide-react';

// ── Public landing page — no auth required ──
// Authenticated users are redirected to /home automatically.
//
// Design language for this pass is borrowed from a reference brief
// (GSAP ScrollTrigger scrub animations, custom cursor, infinite marquee,
// tilt-card reveal grid, diagonal gradient banner) and recolored to
// MANGAL's own amber/maroon brand instead of the reference's green —
// same motion system, different palette. Framer Motion still handles the
// simple on-load/on-enter fades; GSAP handles anything tied to scroll
// *position* (scrub), since that's what it's built for and Framer's
// whileInView is one-shot by comparison.

interface Series {
  id: string;
  title: string;
  synopsis: string;
  genre: string | null;
  language: string | null;
  cover_url: string | null;
  reading_mode: 'scroll' | 'page';
  content_type: 'mangal' | 'novel';
  status: 'draft' | 'published';
  views: number;
}

interface TagWithCount {
  id: string;
  name: string;
  slug: string;
  count: number;
}

function formatViews(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

const FEATURE_CARDS = [
  { icon: ScrollText, title: 'Desi Stories', desc: 'Mythology, Folk Tales, Street Life — genres born from Bharat.' },
  { icon: Flame, title: 'New Every Week', desc: 'Fresh chapters drop constantly from creators across India.' },
  { icon: Smartphone, title: 'Read Anywhere', desc: 'Scroll or page mode. Mobile-first. Zero ads, forever free.' },
  { icon: PenLine, title: 'Be a Creator', desc: 'Publish your own Mangal or Novel — no gatekeepers.' },
];

const GENRE_PILLS = ['Mythology', 'Action', 'Romance', 'Folk Tale', 'Desi Horror', 'Thriller', 'Fantasy', 'School Life', 'Street Life', 'Sci-Fi'];

const DOORS = [
  {
    href: '/WebMangal', title: 'WebMangal', image: '/webmangal-door.png',
    blurb: 'Read manga, comics, and novels made by Desi creators — free forever, no ads, no gatekeepers.',
    tag: null,
  },
  {
    href: '/katube', title: 'KaTube', video: '/videos/katube-door-preview.mp4',
    blurb: "A YouTube-style discovery space for AI-generated anime, from quick Fast Tap clips to full videos — built for the MANGAL creator niche.",
    tag: 'COMING SOON',
  },
  {
    href: '/kalpana-circle', title: 'K Circle', image: '/kcircle-door.png',
    blurb: 'Groups and chats for people into the anime niche — post, react, and talk about MANGAL series together.',
    tag: 'COMING SOON',
  },
];

/* ── SPLASH SCREEN ── */
function SplashScreen({ onDone }: { onDone: () => void }) {
  // Phase: 0=symbol drop, 1=text slide, 2=hold, 3=fade out
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 1100);
    const t3 = setTimeout(() => setPhase(3), 2000);
    const t4 = setTimeout(() => onDone(), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: 'var(--bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: phase === 3 ? 0 : 1,
      transition: phase === 3 ? 'opacity 0.6s ease' : 'none',
      pointerEvents: 'none',
    }}>
      <div style={{
        position: 'absolute',
        width: '320px', height: '320px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(217,119,6,0.18) 0%, transparent 70%)',
        opacity: phase >= 1 ? 1 : 0,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0px', position: 'relative' }}>
        <div style={{
          transform: phase === 0 ? 'translateY(-120px) rotate(-8deg) scale(1.3)' : 'translateY(0px) rotate(0deg) scale(1)',
          opacity: phase === 0 ? 0 : 1,
          transition: phase === 0 ? 'none' : 'transform 0.38s cubic-bezier(0.22, 1.8, 0.4, 1), opacity 0.15s ease',
          marginRight: '16px',
        }}>
          <div style={{
            filter: phase >= 1 ? 'drop-shadow(0 0 32px rgba(217,119,6,0.7)) drop-shadow(0 8px 24px rgba(0,0,0,0.8))' : 'none',
            transition: 'filter 0.3s ease 0.1s',
          }}>
            <Image src="/mangal-flame-icon-black.jpg" alt="M" width={80} height={80} style={{ display: 'block' }} priority />
          </div>
        </div>

        <div style={{
          overflow: 'hidden',
          maxWidth: phase >= 1 ? '340px' : '0px',
          opacity: phase >= 1 ? 1 : 0,
          transition: phase >= 1 ? 'max-width 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease' : 'none',
        }}>
          <span style={{
            display: 'block', fontSize: '64px', fontWeight: 900, letterSpacing: '-0.04em', whiteSpace: 'nowrap',
            background: 'linear-gradient(135deg, #fff 0%, #d97706 55%, #991b1b 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            transform: phase >= 1 ? 'translateX(0)' : 'translateX(60px)',
            transition: phase >= 1 ? 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}>
            MANGAL
          </span>
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: '38%', left: 0, right: 0, textAlign: 'center',
        fontSize: '12px', letterSpacing: '0.22em', color: 'var(--text-muted)', textTransform: 'uppercase',
        opacity: phase >= 2 ? 0.8 : 0, transition: 'opacity 0.5s ease',
      }}>
        Bharat Ki Kahaniyan
      </div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [showcaseItems, setShowcaseItems] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [tagCloud, setTagCloud] = useState<TagWithCount[]>([]);
  const mainRef = useRef<HTMLDivElement>(null);

  // Landing page defaults to dark, independent of the site-wide
  // light-default (founder's call — same local-override pattern as
  // KaTube, see CONTEXT.md §18). ThemeToggle's `syncGlobal={false}` keeps
  // this page's toggle from touching the global <html> attribute/localStorage,
  // so flipping it here never changes what /WebMangal/home, /read, etc. default to.
  const [isLight, setIsLight] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const loadShowcase = async () => {
      const { data: trendingRows } = await supabase.rpc('trending_series', { days_back: 7, result_limit: 18 });
      if (trendingRows && trendingRows.length >= 4) {
        const ids = trendingRows.map((r: { series_id: string }) => r.series_id);
        const { data: ts } = await supabase
          .from('series')
          .select('id, title, synopsis, genre, language, cover_url, reading_mode, content_type, status, views')
          .in('id', ids)
          .eq('status', 'published');
        if (ts) {
          const order = new Map<string, number>(ids.map((id: string, i: number) => [id, i]));
          setShowcaseItems([...ts].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
          setLoading(false);
          return;
        }
      }
      const { data } = await supabase
        .from('series')
        .select('id, title, synopsis, genre, language, cover_url, reading_mode, content_type, status, views')
        .eq('status', 'published')
        .order('views', { ascending: false })
        .limit(18);
      if (data) setShowcaseItems(data);
      setLoading(false);
    };
    loadShowcase();
  }, []);

  useEffect(() => {
    supabase
      .from('tags')
      .select('id, name, slug, series_tags(count)')
      .then(({ data }) => {
        if (!data) return;
        const withCounts = data
          .map((t: { id: string; name: string; slug: string; series_tags: { count: number }[] | null }) => ({
            id: t.id, name: t.name, slug: t.slug,
            count: Array.isArray(t.series_tags) ? (t.series_tags[0]?.count ?? 0) : 0,
          }))
          .filter((t) => t.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 16);
        setTagCloud(withCounts);
      });
  }, []);

  // ── GSAP ScrollTrigger — everything tied to scroll *position* rather
  // than a one-shot "has this entered the viewport" fade. Mirrors the
  // reference site's script.js: nav darkens as you leave the hero, the
  // about-style intro rises in with scrub, the tilt-card grid scales up,
  // and the big pull-quote's flanking flame glyphs slide in from either
  // side — all recolored amber instead of the reference's green.
  useEffect(() => {
    if (!splashDone) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.to('#mangal-nav', {
        backgroundColor: 'rgba(10,8,6,0.92)',
        backdropFilter: 'blur(20px)',
        borderBottomColor: 'rgba(217,119,6,0.25)',
        duration: 0.4,
        scrollTrigger: { trigger: '#mangal-hero', start: 'top -10%', end: 'top -40%', scrub: 1 },
      });

      gsap.from('#mangal-about-copy, #mangal-about-media', {
        y: 60, opacity: 0, duration: 1,
        scrollTrigger: { trigger: '#mangal-about', start: 'top 75%', end: 'top 45%', scrub: 1.5 },
      });

      gsap.from('#mangal-card-grid', {
        scale: 0.85, opacity: 0, duration: 1,
        scrollTrigger: { trigger: '#mangal-card-grid', start: 'top 80%', end: 'top 50%', scrub: 1.5 },
      });

      gsap.from('#mangal-glyph-left', {
        x: -60, y: -40, opacity: 0,
        scrollTrigger: { trigger: '#mangal-quote', start: 'top 70%', end: 'top 40%', scrub: 2 },
      });
      gsap.from('#mangal-glyph-right', {
        x: 60, y: 40, opacity: 0,
        scrollTrigger: { trigger: '#mangal-quote', start: 'top 70%', end: 'top 40%', scrub: 2 },
      });

    }, mainRef);
    return () => ctx.revert();
  }, [splashDone]);

  // Separate effect: the outline heading only mounts once showcaseItems has
  // loaded (async fetch) and has >= 3 items. The main gsap.context above only
  // depends on [splashDone], which fires before that fetch resolves, so
  // '#mangal-outline-heading' wasn't in the DOM yet and GSAP/ScrollTrigger
  // silently failed to find the target — meaning this section's entrance
  // animation never attached at all. Re-run this once the element is
  // actually present.
  useEffect(() => {
    if (!splashDone || showcaseItems.length < 3) return;
    const ctx = gsap.context(() => {
      gsap.from('#mangal-outline-heading', {
        y: 50, opacity: 0,
        scrollTrigger: { trigger: '#mangal-outline-heading', start: 'top 85%', end: 'top 60%', scrub: 1.5 },
      });
    }, mainRef);
    return () => ctx.revert();
  }, [splashDone, showcaseItems.length]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) router.push(`/WebMangal/search?keyword=${encodeURIComponent(search.trim())}`);
  };

  // Same token values as the site-wide dark/light vars (globals.css) —
  // hardcoded locally (not read from the global attribute) so this page's
  // dark default can't be knocked over by the sitewide light-default, and
  // toggling here can't leak back into it either. See isLight above.
  const landingDarkVars = {
    '--bg-primary': '#07070a', '--bg-card': '#0d0d14', '--bg-input': '#08080c',
    '--border-color': 'rgba(255, 255, 255, 0.18)', '--text-primary': '#f9fafb',
    '--text-secondary': '#9ca3af', '--text-tertiary': '#6b7280',
    '--nav-bg': 'rgba(7, 7, 10, 0.97)', '--nav-bg-transparent': 'rgba(7, 7, 10, 0.85)',
  } as CSSProperties;
  const landingLightVars = {
    '--bg-primary': '#ffffff', '--bg-card': '#f7f7f9', '--bg-input': '#f0f0f3',
    '--border-color': '#e5e7eb', '--text-primary': '#14141c',
    '--text-secondary': '#4b5563', '--text-tertiary': '#6b7280',
    '--nav-bg': 'rgba(255, 255, 255, 0.97)', '--nav-bg-transparent': 'rgba(255, 255, 255, 0.88)',
  } as CSSProperties;
  const landingVars = isLight ? landingLightVars : landingDarkVars;

  return (
    <div ref={mainRef} data-theme={isLight ? 'light' : 'dark'} style={{ ...landingVars, minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', overflowX: 'hidden' }}>

      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <CustomCursor />

      <div style={{ opacity: splashDone ? 1 : 0, transition: 'opacity 0.5s ease' }}>

        <style>{`
          .mangal-landing-nav-center { display: flex; gap: 4px; align-items: center; }
          .mangal-landing-login-link { display: inline-block; }
          .mangal-landing-hamburger { display: none; }
          .mangal-landing-mobile-menu { display: none; }

          @media (max-width: 860px) {
            .mangal-landing-nav { padding: 0 16px !important; }
            .mangal-landing-nav-center { gap: 2px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; max-width: 34vw; }
            .mangal-landing-nav-center::-webkit-scrollbar { display: none; }
            .mangal-landing-nav-center a { padding: 6px 9px !important; font-size: 12px !important; }
          }
          @media (max-width: 640px) {
            /* Nav links + Log in used to just vanish here with nothing to
               replace them — mobile visitors had no way to reach Rankings,
               KaTube, K Circle, etc. Swapped for a hamburger + slide-down
               menu instead of hiding them outright. */
            .mangal-landing-nav-center { display: none; }
            .mangal-landing-login-link { display: none; }
            .mangal-landing-hamburger { display: flex; }
            .mangal-landing-mobile-menu { display: flex; }
            .mangal-landing-nav { padding: 0 12px !important; height: 56px !important; }
            .mangal-landing-brand-text { font-size: 17px !important; }
            .mangal-landing-cta { padding: 8px 14px !important; font-size: 12px !important; }
          }
          @media (max-width: 380px) {
            .mangal-landing-brand-text { display: none; }
          }

          /* Outlined double-stroke hero title, à la reference site's h1::before trick */
          .mangal-outline-title { position: relative; }
          .mangal-outline-title::before {
            content: attr(data-text);
            position: absolute; top: -4px; left: -4px; z-index: -1;
            color: transparent;
            -webkit-text-stroke: 2px rgba(217,119,6,0.55);
          }

          /* Infinite marquee — two duplicated tracks sitting side by side,
             each independently animating its own -100% so the loop is seamless */
          .mangal-marquee-track { white-space: nowrap; overflow: hidden; }
          .mangal-marquee-in { display: inline-block; white-space: nowrap; animation: mangal-marquee 26s linear infinite; }
          .mangal-marquee-in span {
            display: inline-block; margin-right: 28px;
            font-size: clamp(36px, 7vw, 100px); font-weight: 900; text-transform: uppercase;
            color: transparent; -webkit-text-stroke: 1.5px rgba(217,119,6,0.6);
            transition: color 0.3s ease;
          }
          .mangal-marquee-in span:hover { color: #d97706; }
          @keyframes mangal-marquee { from { transform: translateX(0); } to { transform: translateX(-100%); } }

          /* Tilt cards — 3D rotate + amber overlay reveal on hover */
          .mangal-tilt-card { transition: transform 0.5s ease; transform-style: preserve-3d; }
          .mangal-tilt-card:hover { transform: rotate3d(-1, 1, 0, 8deg) translateY(-6px); }
          .mangal-tilt-overlay { opacity: 0; transition: opacity 0.4s ease; }
          .mangal-tilt-card:hover .mangal-tilt-overlay { opacity: 1; }

          /* Hover-reveal trending panels */
          .mangal-elem img { transition: all 0.5s ease; scale: 1.15; }
          .mangal-elem:hover img { scale: 1; }
          .mangal-elem .mangal-elem-label { transition: all 0.4s ease; }
          .mangal-elem:hover .mangal-elem-label { background: transparent; color: #fff; }

          @media (max-width: 640px) {
            .mangal-tilt-card { min-height: 0 !important; }
            #mangal-card-grid { flex-direction: column !important; height: auto !important; }
            .mangal-tilt-card { width: 100% !important; height: 320px !important; }
            .mangal-elem { width: 100% !important; }
          }
        `}</style>

        {/* ── NAV ── */}
        <nav id="mangal-nav" className="mangal-landing-nav" style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: scrolled ? 'var(--nav-bg)' : 'var(--nav-bg-transparent)',
          backdropFilter: 'blur(20px)',
          borderBottom: scrolled ? '1px solid var(--border-color)' : '1px solid transparent',
          padding: '0 24px', height: '64px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          transition: 'background 0.3s, border-color 0.3s',
        }}>
          <Link href="/" data-cursor-hover="true" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
            <Image src="/logo-icon.png" alt="MANGAL" width={36} height={36} style={{ borderRadius: '10px', boxShadow: '0 0 20px rgba(217,119,6,0.3)', display: 'block' }} priority />
            <span className="mangal-landing-brand-text" style={{ fontWeight: 900, fontSize: '20px', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>MANGAL</span>
          </Link>

          <div className="mangal-landing-nav-center">
            {[
              { label: 'Browse', href: '/WebMangal' },
              { label: 'Rankings', href: '/WebMangal/rankings' },
              { label: 'Genres', href: '/WebMangal' },
              { label: 'New Releases', href: '/WebMangal' },
            ].map(link => (
              <a key={link.label} href={link.href} data-cursor-hover="true" style={{
                padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                color: 'var(--text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap',
                transition: 'color 0.15s, background 0.15s',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--text-primary)'; (e.target as HTMLElement).style.background = 'var(--border-color)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-secondary)'; (e.target as HTMLElement).style.background = 'transparent'; }}
              >{link.label}</a>
            ))}
            <a href="/WebMangal" data-cursor-hover="true" style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
              color: '#d97706', textDecoration: 'none', whiteSpace: 'nowrap', transition: 'color 0.15s, background 0.15s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(217,119,6,0.10)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            ><Image src="/webmangal-logo.png" alt="" width={70} height={70} style={{ height: '20px', width: '20px', objectFit: 'contain' }} />WebMangal</a>
            <a href="/katube" data-cursor-hover="true" style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
              color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap', transition: 'color 0.15s, background 0.15s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.10)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            ><Image src="/katube-logo.png" alt="" width={70} height={70} style={{ height: '20px', width: '20px', objectFit: 'contain' }} />Tube</a>
            <a href="/kalpana-circle" data-cursor-hover="true" style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
              color: '#c4b5fd', textDecoration: 'none', whiteSpace: 'nowrap', transition: 'color 0.15s, background 0.15s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.12)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            ><Image src="/kcircle-logo.png" alt="" width={70} height={70} style={{ height: '20px', width: '20px', objectFit: 'contain' }} />Circle</a>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <ThemeToggle size={32} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
            <a href="/login?next=%2F" className="mangal-landing-login-link" data-cursor-hover="true" style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.15s',
            }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = 'var(--text-primary)'}
              onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--text-secondary)'}
            >Log in</a>
            <button
              className="mangal-landing-hamburger"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(v => !v)}
              style={{
                width: '36px', height: '36px', alignItems: 'center', justifyContent: 'center',
                borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', fontSize: '16px', cursor: 'pointer', flexShrink: 0,
              }}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </nav>

        {/* ── MOBILE NAV MENU — sub-640px only; the links above (Browse,
             Rankings, KaTube, K Circle, Log in) get hidden by CSS at that
             width with no other way to reach them, so this fills the gap. */}
        <div
          className="mangal-landing-mobile-menu"
          style={{
            flexDirection: 'column', position: 'sticky', top: '56px', zIndex: 99,
            background: 'var(--nav-bg)', backdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--border-color)',
            maxHeight: mobileMenuOpen ? '400px' : '0px', overflow: 'hidden',
            transition: 'max-height 0.25s ease',
          }}
        >
          {[
            { label: 'Browse', href: '/WebMangal' },
            { label: 'Rankings', href: '/WebMangal/rankings' },
            { label: 'Genres', href: '/WebMangal' },
            { label: 'New Releases', href: '/WebMangal' },
            { label: 'WebMangal', href: '/WebMangal', icon: '/webmangal-logo.png' },
            { label: 'Tube', href: '/katube', icon: '/katube-logo.png' },
            { label: 'Circle', href: '/kalpana-circle', icon: '/kcircle-logo.png' },
            { label: 'Log in', href: '/login?next=%2F' },
          ].map(link => (
            <a key={link.label} href={link.href} onClick={() => setMobileMenuOpen(false)} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '14px 20px', fontSize: '14px', fontWeight: 600,
              color: 'var(--text-secondary)', textDecoration: 'none',
              borderBottom: '1px solid var(--border-color)',
            }}>{link.icon && <Image src={link.icon} alt="" width={70} height={70} style={{ height: '20px', width: '20px', objectFit: 'contain' }} />}{link.label}</a>
          ))}
        </div>

        {/* ── HERO ── */}
        <section id="mangal-hero" style={{
          position: 'relative', overflow: 'hidden',
          padding: 'clamp(80px,12vw,140px) 24px clamp(60px,10vw,100px)',
          textAlign: 'center', minHeight: '92vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundImage: 'url(/hero-bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top', backgroundRepeat: 'no-repeat' }} />
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'linear-gradient(to bottom, rgba(7,7,10,0.72) 0%, rgba(7,7,10,0.38) 35%, rgba(7,7,10,0.38) 65%, rgba(7,7,10,0.88) 100%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'radial-gradient(ellipse 60% 40% at 50% 55%, rgba(217,119,6,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <ParticleField />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative', zIndex: 3 }}
          >
            <h1
              className="mangal-outline-title"
              data-text="Bharat Ki Kahaniyan"
              style={{
                fontSize: 'clamp(32px, 6vw, 88px)', fontWeight: 900, margin: '0 0 12px',
                letterSpacing: '-0.04em', textTransform: 'uppercase',
                background: 'linear-gradient(135deg, #fff 0%, #d97706 60%, #7f1d1d 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                filter: 'drop-shadow(0 4px 24px rgba(0,0,0,0.9))',
              }}
            >
              Bharat Ki Kahaniyan
            </h1>
            <p style={{
              fontSize: 'clamp(14px, 2vw, 20px)', color: '#f3f4f6', margin: '0 0 32px', lineHeight: 1.6,
              textShadow: '0 1px 12px rgba(0,0,0,0.9)', maxWidth: '620px', marginLeft: 'auto', marginRight: 'auto',
            }}>
              1000+ Desi comics & novels by Desi people. Scroll or read. Free forever. No ads, no gatekeepers.
            </p>

            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', maxWidth: '540px', margin: '0 auto 48px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <input
                type="text" placeholder="Search stories, creators, genres..." value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  flex: 1, minWidth: '200px', padding: '12px 18px', borderRadius: '10px',
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  fontSize: '14px', fontFamily: 'inherit',
                }}
              />
              <motion.button
                type="submit" data-cursor-hover="true"
                whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(217,119,6,0.5)' }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                style={{
                  padding: '12px 28px', borderRadius: '10px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
                  color: '#fff', border: 'none', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Search
              </motion.button>
            </form>
          </motion.div>

          {/* Circular scroll-down cue, bottom-left — reference site's #arrow */}
          <a
            href="#mangal-marquee" data-cursor-hover="true"
            style={{
              position: 'absolute', bottom: '28px', left: '28px', zIndex: 3,
              width: 'clamp(64px,8vw,96px)', height: 'clamp(64px,8vw,96px)', borderRadius: '50%',
              border: '2px solid rgba(217,119,6,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', textDecoration: 'none', transition: 'all 0.4s ease',
              background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#d97706'; e.currentTarget.style.transform = 'scale(0.85)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; e.currentTarget.style.transform = 'none'; }}
          >
            <ArrowDown size={22} strokeWidth={2} />
          </a>
        </section>

        {/* ── MARQUEE: scrolling genre wall ── */}
        <section id="mangal-marquee" style={{ padding: '28px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
          <div className="mangal-marquee-track">
            {[0, 1].map(copy => (
              <div key={copy} className="mangal-marquee-in">
                {GENRE_PILLS.map(g => (
                  <a key={g} href={`/WebMangal?genre=${encodeURIComponent(g)}`} data-cursor-hover="true" style={{ textDecoration: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{g} <Flame size={12} strokeWidth={2} /></span>
                  </a>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* ── ABOUT ── */}
        <section id="mangal-about" style={{ padding: 'clamp(60px,8vw,100px) 24px', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '32px', flexWrap: 'wrap' }}>
            <div id="mangal-about-media" style={{ position: 'relative', width: '160px', height: '160px', borderRadius: '20px', overflow: 'hidden', flexShrink: 0 }}>
              <Image src="/comics.jpg" alt="Mangal stories" fill style={{ objectFit: 'cover' }} />
            </div>
            <div id="mangal-about-copy" style={{ flex: '1 1 360px', textAlign: 'center' }}>
              <h3 style={{ fontSize: 'clamp(24px,3.5vw,40px)', fontWeight: 900, margin: '0 0 20px', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>About Mangal</h3>
              <p style={{ fontSize: 'clamp(13px,1.6vw,16px)', color: 'var(--text-tertiary)', lineHeight: 1.8, margin: '0 0 16px' }}>
                India&apos;s home for original comics and novels — mythology, folk tales, and street life told by Desi creators, for Desi readers. Bookmark series, track your reading progress, and discover something new every week.
              </p>
              <p style={{ fontSize: 'clamp(13px,1.6vw,16px)', color: 'var(--text-tertiary)', lineHeight: 1.8, margin: 0 }}>
                No paywalls, no gatekeepers — just stories, forever free to read.
              </p>
            </div>
            <div style={{ position: 'relative', width: '160px', height: '160px', borderRadius: '20px', overflow: 'hidden', flexShrink: 0 }}>
              <Image src="/kcommunity-preview.jpg" alt="K Circle community" fill style={{ objectFit: 'cover' }} />
            </div>
          </div>
        </section>

        {/* ── TILT CARDS: WebMangal / KaTube / K Circle ── */}
        <section style={{ padding: '0 24px clamp(60px,8vw,100px)', maxWidth: '1300px', margin: '0 auto' }}>
          <div id="mangal-card-grid" style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: '20px', height: '78vh', flexWrap: 'wrap', perspective: '1200px' }}>
            {DOORS.map(door => (
              <Link
                key={door.title} href={door.href} data-cursor-hover="true"
                className="mangal-tilt-card"
                style={{
                  flex: '1 1 280px', minHeight: '360px', position: 'relative', borderRadius: '20px', overflow: 'hidden',
                  textDecoration: 'none', background: '#0a0a0f', border: '1px solid var(--border-color)',
                }}
              >
                {door.image && <Image src={door.image} alt={door.title} fill style={{ objectFit: 'cover' }} />}
                {door.video && (
                  <video
                    src={door.video} autoPlay loop muted playsInline
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)' }} />
                <div style={{ position: 'absolute', left: '20px', right: '20px', bottom: '20px', zIndex: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'clamp(20px,2.6vw,28px)', fontWeight: 900, color: '#fff' }}>{door.title}</span>
                    {door.tag && (
                      <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 10px', borderRadius: '20px', background: 'rgba(217,119,6,0.22)', border: '1px solid rgba(217,119,6,0.5)', color: '#fbbf24' }}>{door.tag}</span>
                    )}
                  </div>
                </div>
                <div className="mangal-tilt-overlay" style={{
                  position: 'absolute', inset: 0, zIndex: 3,
                  background: 'linear-gradient(135deg, rgba(127,29,29,0.94), rgba(217,119,6,0.9))',
                  padding: 'clamp(20px,4vw,36px)', display: 'flex', alignItems: 'center',
                }}>
                  <p style={{ color: '#fff', fontSize: 'clamp(13px,1.6vw,16px)', lineHeight: 1.7, fontWeight: 600, margin: 0 }}>
                    {door.blurb}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── DIAGONAL GRADIENT BANNER ── */}
        <section style={{
          background: 'linear-gradient(to right top, rgba(217,119,6,1) 52%, rgba(153,27,27,1) 74%, rgba(69,10,10,1) 100%)',
          minHeight: 'clamp(160px,26vh,260px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '32px 24px', textAlign: 'center',
        }}>
          <h4 style={{ fontSize: 'clamp(18px,2.6vw,30px)', fontWeight: 900, textTransform: 'uppercase', color: '#0d0d14', maxWidth: '720px', lineHeight: 1.5, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <Flame size={26} fill="#0d0d14" /> New chapters drop every week — bookmark your favorites and never miss a release
          </h4>
        </section>

        {/* ── PULL QUOTE ── */}
        <section id="mangal-quote" style={{ position: 'relative', padding: 'clamp(80px,12vw,140px) 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: '1000px', margin: '0 auto', minHeight: '50vh' }}>
          <span id="mangal-glyph-left" style={{ position: 'absolute', top: '18%', left: 'clamp(8px,8vw,140px)', fontSize: 'clamp(40px,6vw,80px)', color: 'rgba(217,119,6,0.35)', fontWeight: 900 }}>&ldquo;</span>
          <span id="mangal-glyph-right" style={{ position: 'absolute', bottom: '18%', right: 'clamp(8px,8vw,140px)', fontSize: 'clamp(40px,6vw,80px)', color: 'rgba(217,119,6,0.35)', fontWeight: 900 }}>&rdquo;</span>
          <p style={{ fontSize: 'clamp(20px,3.4vw,40px)', fontWeight: 800, textAlign: 'center', lineHeight: 1.5, color: 'var(--text-primary)', margin: 0 }}>
            Every creator deserves real readers — not gatekeepers.
          </p>
        </section>

        {/* ── SHOWCASE ── */}
        <section style={{ padding: 'clamp(60px,8vw,100px) 24px', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ marginBottom: '48px' }}>
            <h2 style={{ fontSize: 'clamp(20px, 3.5vw, 40px)', fontWeight: 900, margin: '0 0 28px', letterSpacing: '-0.03em', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Flame size={26} fill="#d97706" stroke="#d97706" /> Trending Now
            </h2>
            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 180px))', gap: '14px' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ aspectRatio: '3/4.6', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }} />
                ))}
              </div>
            ) : showcaseItems.length > 0 ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 180px))', gap: '14px' }}>
                  {showcaseItems.map((s, i) => (
                    <ShowcaseCard key={s.id} series={s} rank={i + 1} />
                  ))}
                </div>
                {showcaseItems.length < 6 && (
                  <div style={{
                    marginTop: '20px', padding: '18px 22px', borderRadius: '14px',
                    background: 'var(--bg-card)', border: '1px dashed var(--border-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
                  }}>
                    <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
                      MANGAL just launched — {showcaseItems.length === 1 ? 'this is our first published story' : `these are our first ${showcaseItems.length} published stories`}. Early creators get the most visibility here.
                    </p>
                    <a href="/login?creator=1" data-cursor-hover="true" style={{
                      flexShrink: 0, fontSize: '13px', fontWeight: 700, color: '#fff', textDecoration: 'none',
                      padding: '9px 18px', borderRadius: '9px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)', whiteSpace: 'nowrap',
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                    }}>
                      Publish yours <ArrowRight size={14} strokeWidth={2} />
                    </a>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '56px 24px', borderRadius: '16px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px', color: 'var(--text-tertiary)' }}><ScrollText size={30} /></div>
                <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 6px' }}>No stories published yet</p>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: '0 0 20px', maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
                  MANGAL is a new platform — the first creators to publish here will be featured right in this spot.
                </p>
                <a href="/login?creator=1" data-cursor-hover="true" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#fff',
                  textDecoration: 'none', padding: '10px 20px', borderRadius: '10px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
                }}>
                  Become a Creator <ArrowRight size={14} strokeWidth={2} />
                </a>
              </div>
            )}
          </div>
        </section>

        {/* ── TAG CLOUD ── */}
        {tagCloud.length > 0 && (
          <section style={{ padding: '0 24px clamp(60px,8vw,100px)', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
              <h2 style={{ fontSize: 'clamp(20px, 3.5vw, 32px)', fontWeight: 900, margin: 0, letterSpacing: '-0.03em', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}><Tag size={22} /> Browse by Tag</h2>
              <Link href="/WebMangal/tags" data-cursor-hover="true" style={{ fontSize: '13px', fontWeight: 700, color: '#d97706', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>See all tags <ArrowRight size={13} strokeWidth={2} /></Link>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {tagCloud.map(tag => (
                <a key={tag.id} href={`/WebMangal/tags/${tag.slug}`} data-cursor-hover="true" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)',
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '10px 16px', borderRadius: '24px', textDecoration: 'none',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(217,119,6,0.5)'; (e.currentTarget as HTMLElement).style.color = '#d97706'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                >
                  #{tag.name}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{tag.count}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ── OUTLINED HEADING + HOVER-REVEAL TRENDING PANELS ── */}
        {showcaseItems.length >= 3 && (
          <section style={{ padding: 'clamp(80px,10vw,120px) 24px clamp(60px,8vw,100px)', textAlign: 'center' }}>
            <h1
              id="mangal-outline-heading"
              className="mangal-outline-title"
              data-text="Start Reading Now"
              style={{
                fontSize: 'clamp(28px,5vw,64px)', fontWeight: 900, textTransform: 'uppercase',
                color: 'transparent', WebkitTextStroke: '1.5px var(--text-primary)',
                margin: '0 0 40px', letterSpacing: '-0.02em',
              }}
            >
              Start Reading Now
            </h1>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {showcaseItems.slice(0, 4).map(s => (
                <a
                  key={s.id} href={`/WebMangal/series/${s.id}`} data-cursor-hover="true"
                  className="mangal-elem"
                  style={{
                    position: 'relative', width: '220px', height: '300px', borderRadius: '18px', overflow: 'hidden',
                    textDecoration: 'none', display: 'block', background: '#1a0a0a',
                  }}
                >
                  {s.cover_url && <Image src={s.cover_url} alt={s.title} fill style={{ objectFit: 'cover' }} />}
                  <div className="mangal-elem-label" style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center', padding: '16px', background: 'rgba(217,119,6,0.88)', color: '#0d0d14',
                    fontWeight: 900, textTransform: 'uppercase', fontSize: '15px',
                  }}>
                    {s.title}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ── FEATURES ── */}
        <section style={{ padding: 'clamp(60px,8vw,100px) 24px', maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 42px)', fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
              Why Choose Mangal?
            </h2>
            <p style={{ fontSize: 'clamp(13px, 1.8vw, 16px)', color: 'var(--text-tertiary)', margin: '0 0 32px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
              India&apos;s platform by creators, for readers. Discover stories rooted in our culture.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 280px))', gap: '20px' }}>
              {FEATURE_CARDS.map(f => (
                <FeatureCard key={f.title} {...f} />
              ))}
            </div>
          </div>
        </section>

        {/* ── CREATOR CTA ── */}
        <section style={{ padding: 'clamp(70px,10vw,120px) 24px', textAlign: 'center', maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px', filter: 'drop-shadow(0 0 20px rgba(217,119,6,0.6))', color: '#d97706' }}><Flame size={40} fill="#d97706" /></div>
          <h2 style={{ fontSize: 'clamp(28px,4vw,46px)', fontWeight: 900, margin: '0 0 16px', letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>Got a story in you?</h2>
          <p style={{ fontSize: 'clamp(14px,1.8vw,17px)', color: 'var(--text-tertiary)', margin: '0 0 36px', lineHeight: 1.65 }}>
            Publish your own Mangal or Novel on our platform. Free tools, real readers, no middlemen.
          </p>
          <motion.a
            href="/login?creator=1" data-cursor-hover="true"
            whileHover={{ y: -3, boxShadow: '0 8px 36px rgba(217,119,6,0.55)' }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 350, damping: 22 }}
            style={{
              padding: '14px 36px', borderRadius: '12px', fontSize: '15px', fontWeight: 800,
              background: 'linear-gradient(135deg, #7f1d1d 0%, #d97706 100%)', color: '#fff', textDecoration: 'none',
              boxShadow: '0 4px 28px rgba(217,119,6,0.35)', display: 'inline-flex', alignItems: 'center', gap: '10px',
            }}
          >
            <PenLine size={16} /> Become a Creator
          </motion.a>
        </section>

        {/* ── FOOTER — diagonal gradient, matches banner above ── */}
        <footer style={{
          background: 'linear-gradient(to left bottom, #7f1d1d 0%, #d97706 85%)',
          padding: '48px 24px 32px', position: 'relative',
        }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', justifyContent: 'space-between', marginBottom: '32px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <Image src="/logo-icon.png" alt="MANGAL" width={32} height={32} style={{ borderRadius: '9px', display: 'block' }} />
                  <span style={{ fontWeight: 900, fontSize: '18px', color: '#0d0d14' }}>MANGAL</span>
                </div>
                <p style={{ fontSize: '12px', color: 'rgba(13,13,20,0.75)', maxWidth: '200px', lineHeight: 1.6, margin: '0 0 16px', fontWeight: 600 }}>
                  India&apos;s home for original comics &amp; novels. Made with love in Bharat.
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {SOCIAL_ICONS.map(({ name, path }) => (
                    <span key={name} title={`${name} — coming soon`} style={{
                      width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(13,13,20,0.12)', border: '1px solid rgba(13,13,20,0.25)', color: 'rgba(13,13,20,0.75)', cursor: 'default',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d={path} /></svg>
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '48px', flexWrap: 'wrap' }}>
                <FooterCol title="Platform" links={[
                  { label: 'Browse', href: '/WebMangal' }, { label: 'Rankings', href: '/WebMangal/rankings' },
                  { label: 'Genres', href: '/WebMangal' }, { label: 'New Releases', href: '/WebMangal' },
                ]} />
                <FooterCol title="Account" links={[
                  { label: 'Log In', href: '/login?next=%2F' }, { label: 'Sign Up', href: '/login?next=%2F' }, { label: 'Become a Creator', href: '/login?creator=1' },
                ]} />
                <FooterCol title="Company" links={[{ label: 'About', href: '/about' }, { label: 'Help Center', href: '/help' }]} />
                <FooterCol title="Legal" links={[
                  { label: 'Privacy Policy', href: '/privacy' }, { label: 'Terms of Service', href: '/terms' }, { label: 'Grievance', href: '/grievance' },
                ]} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(13,13,20,0.25)', paddingTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '11px', color: 'rgba(13,13,20,0.7)', margin: 0, fontWeight: 600 }}>© 2026 Mangal. All rights reserved.</p>
              <p style={{ fontSize: '11px', color: 'rgba(13,13,20,0.7)', margin: 0, fontWeight: 600 }}>Free to read, forever. 🇮🇳</p>
            </div>
          </div>
        </footer>

      </div>{/* end main content wrapper */}
    </div>
  );
}


/* ── SHOWCASE CARD ── */
function ShowcaseCard({ series, rank }: { series: Series; rank?: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href={`/WebMangal/series/${series.id}`} data-cursor-hover="true" style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div style={{
        borderRadius: '10px', overflow: 'hidden',
        background: 'var(--bg-card)', border: `1px solid ${hovered ? '#d97706' : 'var(--border-color)'}`,
        transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.5)' : 'none',
      }}>
        <div style={{ position: 'relative', aspectRatio: '3/4', background: '#1a0a0a' }}>
          {series.cover_url ? (
            <Image src={series.cover_url} alt={series.title} fill sizes="(max-width: 768px) 32vw, 140px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}><ScrollText size={28} /></div>
          )}
          {rank && rank <= 3 && (
            <div style={{
              position: 'absolute', top: '6px', left: '6px', width: '20px', height: '20px', borderRadius: '5px',
              background: rank === 1 ? '#d97706' : rank === 2 ? 'var(--text-secondary)' : '#92400e',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 900, color: '#0d0d14',
            }}>#{rank}</div>
          )}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)', padding: '20px 7px 7px',
          }}>
            <span style={{
              fontSize: '8px', fontWeight: 700, color: '#fff',
              background: series.content_type === 'novel' ? 'rgba(109,40,217,0.9)' : 'rgba(127,29,29,0.9)',
              padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
              display: 'inline-flex', alignItems: 'center', gap: '3px',
            }}>
              {series.content_type === 'novel' ? <><Book size={9} /> Novel</> : <><BookOpen size={9} /> Mangal</>}
            </span>
          </div>
        </div>
        <div style={{ padding: '8px 8px 10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {series.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {series.genre ? <div style={{ fontSize: '9px', color: '#d97706' }}>{series.genre}</div> : <span />}
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Eye size={10} /> {formatViews(series.views ?? 0)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}


/* ── FEATURE CARD ── */
function FeatureCard({ icon: Icon, title, desc }: { icon: ComponentType<{ size?: number }>; title: string; desc: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hovered ? 'rgba(217,119,6,0.4)' : 'var(--border-color)'}`,
        borderRadius: '16px', padding: '28px 24px',
        transition: 'border-color 0.2s, transform 0.2s, box-shadow 0.2s',
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered ? '0 8px 32px rgba(217,119,6,0.08)' : 'none',
      }}
    >
      <div style={{ color: '#d97706', marginBottom: '14px' }}><Icon size={28} /></div>
      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}


/* ── FOOTER COLUMN ── */
const SOCIAL_ICONS = [
  { name: 'Instagram', path: 'M12 2c2.7 0 3.06.01 4.12.06 1.06.05 1.79.22 2.43.47.66.26 1.22.6 1.77 1.15.55.55.9 1.11 1.15 1.77.25.64.42 1.37.47 2.43C21.99 8.94 22 9.3 22 12s-.01 3.06-.06 4.12c-.05 1.06-.22 1.79-.47 2.43a4.9 4.9 0 0 1-1.15 1.77 4.9 4.9 0 0 1-1.77 1.15c-.64.25-1.37.42-2.43.47C15.06 21.99 14.7 22 12 22s-3.06-.01-4.12-.06c-1.06-.05-1.79-.22-2.43-.47a4.9 4.9 0 0 1-1.77-1.15 4.9 4.9 0 0 1-1.15-1.77c-.25-.64-.42-1.37-.47-2.43C2.01 15.06 2 14.7 2 12s.01-3.06.06-4.12c.05-1.06.22-1.79.47-2.43.26-.66.6-1.22 1.15-1.77A4.9 4.9 0 0 1 5.45 2.53c.64-.25 1.37-.42 2.43-.47C8.94 2.01 9.3 2 12 2Zm0 3.24a6.76 6.76 0 1 0 0 13.52 6.76 6.76 0 0 0 0-13.52Zm0 2a4.76 4.76 0 1 1 0 9.52 4.76 4.76 0 0 1 0-9.52Zm6.9-.4a1.58 1.58 0 1 1-3.16 0 1.58 1.58 0 0 1 3.16 0Z' },
  { name: 'X', path: 'M18.9 2.25h3.68l-8.04 9.19L24 21.75h-7.4l-5.8-7.58-6.64 7.58H.48l8.6-9.83L0 2.25h7.59l5.24 6.93 6.07-6.93Zm-1.29 17.28h2.04L6.5 4.35H4.31l13.3 15.18Z' },
  { name: 'Facebook', path: 'M13.5 21v-7.5h2.52l.38-2.93h-2.9V8.7c0-.85.24-1.43 1.45-1.43h1.55V4.66c-.27-.04-1.2-.11-2.27-.11-2.25 0-3.79 1.37-3.79 3.89v2.17H7.9v2.93h2.54V21h3.06Z' },
  { name: 'YouTube', path: 'M23.5 6.5s-.23-1.64-.94-2.36c-.9-.94-1.9-.95-2.36-1C17 3 12 3 12 3h-.01s-5 0-8.19.14c-.46.05-1.46.06-2.36 1C.73 4.86.5 6.5.5 6.5S.26 8.42.26 10.35v1.79c0 1.93.24 3.85.24 3.85s.23 1.64.94 2.36c.9.95 2.08.92 2.6 1.02C5.9 19.55 12 19.6 12 19.6s5.01-.01 8.2-.15c.46-.06 1.46-.07 2.36-1.02.71-.72.94-2.36.94-2.36s.24-1.92.24-3.85v-1.79c0-1.93-.24-3.85-.24-3.85ZM9.68 14.27V8.4l5.4 2.94-5.4 2.93Z' },
  { name: 'Pinterest', path: 'M12 2C6.48 2 2 6.48 2 12c0 4.24 2.63 7.86 6.35 9.32-.09-.79-.16-2.01.03-2.87.18-.79 1.15-5.01 1.15-5.01s-.29-.59-.29-1.45c0-1.36.79-2.38 1.77-2.38.84 0 1.24.63 1.24 1.38 0 .84-.53 2.1-.81 3.27-.23.98.49 1.78 1.46 1.78 1.75 0 2.94-2.25 2.94-4.91 0-2.02-1.36-3.54-3.84-3.54-2.8 0-4.54 2.09-4.54 4.43 0 .81.24 1.38.61 1.82.17.2.2.29.13.52-.04.17-.15.6-.19.77-.06.24-.25.33-.46.24-1.28-.52-1.88-1.92-1.88-3.5 0-2.6 2.19-5.72 6.53-5.72 3.49 0 5.79 2.53 5.79 5.24 0 3.59-1.99 6.27-4.92 6.27-.98 0-1.91-.53-2.22-1.13l-.63 2.44c-.19.75-.71 1.68-1.06 2.25.79.24 1.63.37 2.5.37 5.52 0 10-4.48 10-10S17.52 2 12 2Z' },
];

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(13,13,20,0.65)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {links.map(l => (
          <a key={l.label} href={l.href} data-cursor-hover="true" style={{ fontSize: '13px', color: 'rgba(13,13,20,0.85)', textDecoration: 'none', transition: 'color 0.15s', fontWeight: 600 }}
            onMouseEnter={e => (e.target as HTMLElement).style.color = '#0d0d14'}
            onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(13,13,20,0.85)'}
          >{l.label}</a>
        ))}
      </div>
    </div>
  );
}
