'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import ThemeToggle from './components/ThemeToggle';
import { supabase } from './lib/supabase';

// ── Public landing page — no auth required ──
// Authenticated users are redirected to /home automatically.

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
  { icon: '📜', title: 'Desi Stories', desc: 'Mythology, Folk Tales, Street Life — genres born from Bharat.' },
  { icon: '🔥', title: 'New Every Week', desc: 'Fresh chapters drop constantly from creators across India.' },
  { icon: '📱', title: 'Read Anywhere', desc: 'Scroll or page mode. Mobile-first. Zero ads, forever free.' },
  { icon: '✍️', title: 'Be a Creator', desc: 'Publish your own Mangal or Novel — no gatekeepers.' },
];

const GENRE_PILLS = ['Mythology', 'Action', 'Romance', 'Folk Tale', 'Desi Horror', 'Thriller', 'Fantasy', 'School Life', 'Street Life', 'Sci-Fi'];

/* ── SPLASH SCREEN ── */
function SplashScreen({ onDone }: { onDone: () => void }) {
  // Phase: 0=symbol drop, 1=text slide, 2=hold, 3=fade out
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // symbol drop starts immediately (phase 0)
    const t1 = setTimeout(() => setPhase(1), 400);   // text slides in after symbol lands
    const t2 = setTimeout(() => setPhase(2), 1100);  // hold
    const t3 = setTimeout(() => setPhase(3), 2000);  // fade out
    const t4 = setTimeout(() => onDone(), 2600);     // done
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
      {/* Glow behind logo */}
      <div style={{
        position: 'absolute',
        width: '320px', height: '320px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(217,119,6,0.18) 0%, transparent 70%)',
        opacity: phase >= 1 ? 1 : 0,
        transition: 'opacity 0.5s ease',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0px', position: 'relative' }}>

        {/* Symbol — drops in from top with bounce */}
        <div style={{
          transform: phase === 0 ? 'translateY(-120px) rotate(-8deg) scale(1.3)' : 'translateY(0px) rotate(0deg) scale(1)',
          opacity: phase === 0 ? 0 : 1,
          transition: phase === 0
            ? 'none'
            : 'transform 0.38s cubic-bezier(0.22, 1.8, 0.4, 1), opacity 0.15s ease',
          marginRight: '16px',
        }}>
          {/* Drop shadow punch on land */}
          <div style={{
            filter: phase >= 1 ? 'drop-shadow(0 0 32px rgba(217,119,6,0.7)) drop-shadow(0 8px 24px rgba(0,0,0,0.8))' : 'none',
            transition: 'filter 0.3s ease 0.1s',
          }}>
            <Image
              src="/mangal-flame-icon.png"
              alt="M"
              width={80}
              height={80}
              style={{ display: 'block' }}
              priority
            />
          </div>
        </div>

        {/* "MANGAL" text — slides in from right */}
        <div style={{
          overflow: 'hidden',
          maxWidth: phase >= 1 ? '340px' : '0px',
          opacity: phase >= 1 ? 1 : 0,
          transition: phase >= 1
            ? 'max-width 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease'
            : 'none',
        }}>
          <span style={{
            display: 'block',
            fontSize: '64px',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            whiteSpace: 'nowrap',
            background: 'linear-gradient(135deg, #fff 0%, #d97706 55%, #991b1b 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            transform: phase >= 1 ? 'translateX(0)' : 'translateX(60px)',
            transition: phase >= 1 ? 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}>
            MANGAL
          </span>
        </div>
      </div>

      {/* Tagline fades in under logo */}
      <div style={{
        position: 'absolute',
        bottom: '38%',
        left: 0, right: 0,
        textAlign: 'center',
        fontSize: '12px',
        letterSpacing: '0.22em',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        opacity: phase >= 2 ? 0.8 : 0,
        transition: 'opacity 0.5s ease',
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

  // Redirect logged-in users to /home
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/home');
    });
  }, [router]);

  // Nav shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Fetch showcase: try trending first, fall back to top by views
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
      // Fall back to top views
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

  // Fetch top tags for the "Browse by Tag" cloud — same single-embedded-count
  // query as /tags, just capped to the top 16 by usage for a homepage teaser.
  useEffect(() => {
    supabase
      .from('tags')
      .select('id, name, slug, series_tags(count)')
      .then(({ data }) => {
        if (!data) return;
        const withCounts = data
          .map((t: { id: string; name: string; slug: string; series_tags: { count: number }[] | null }) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            count: Array.isArray(t.series_tags) ? (t.series_tags[0]?.count ?? 0) : 0,
          }))
          .filter((t) => t.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 16);
        setTagCloud(withCounts);
      });
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) router.push(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      overflowX: 'hidden',
    }}>

      {/* ── SPLASH ── */}
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}

      {/* Main content fades in after splash */}
      <div style={{
        opacity: splashDone ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}>

        {/* ── NAV ── */}
        <nav style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: scrolled ? 'var(--nav-bg)' : 'var(--nav-bg-transparent)',
          backdropFilter: 'blur(20px)',
          borderBottom: scrolled ? '1px solid var(--border-color)' : '1px solid transparent',
          padding: '0 24px', height: '64px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'background 0.3s, border-color 0.3s',
        }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', flexShrink: 0 }}>
            <Image
              src="/logo-icon.png"
              alt="MANGAL"
              width={36}
              height={36}
              style={{
                borderRadius: '10px',
                boxShadow: '0 0 20px rgba(217,119,6,0.3)', display: 'block',
              }}
              priority
            />
            <span style={{ fontWeight: 900, fontSize: '20px', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>MANGAL</span>
          </Link>

          {/* Center links */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[
              { label: 'Browse', href: '/search' },
              { label: 'Rankings', href: '/rankings' },
              { label: 'Genres', href: '/search' },
              { label: 'New Releases', href: '/search' },
            ].map(link => (
              <a key={link.label} href={link.href} style={{
                padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                color: 'var(--text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap',
                transition: 'color 0.15s, background 0.15s',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--text-primary)'; (e.target as HTMLElement).style.background = 'var(--border-color)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-secondary)'; (e.target as HTMLElement).style.background = 'transparent'; }}
              >{link.label}</a>
            ))}
            <a href="/kalpanaverse" style={{
              padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
              color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap',
              transition: 'color 0.15s, background 0.15s',
            }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(37,99,235,0.10)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; }}
            >🎬 Kalpanaverse</a>
            <a href="/kalpana-circle" style={{
              padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
              color: '#c4b5fd', textDecoration: 'none', whiteSpace: 'nowrap',
              transition: 'color 0.15s, background 0.15s',
            }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(124,58,237,0.12)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; }}
            >💬 Kalpana Circle</a>
          </div>

          {/* Auth buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ThemeToggle size={32} />
            <a href="/login" style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.15s',
            }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = 'var(--text-primary)'}
              onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--text-secondary)'}
            >Log in</a>
            <a href="/login" style={{
              padding: '9px 20px', borderRadius: '9px', fontSize: '13px', fontWeight: 700,
              background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
              color: '#fff', textDecoration: 'none',
              boxShadow: '0 2px 16px rgba(127,29,29,0.4)',
              transition: 'box-shadow 0.2s, transform 0.15s',
            }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-1px)'; el.style.boxShadow = '0 4px 24px rgba(127,29,29,0.55)'; }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = '0 2px 16px rgba(127,29,29,0.4)'; }}
            >Start Reading Free</a>
          </div>
        </nav>


        {/* ── HERO ── */}
        <section style={{
          position: 'relative', overflow: 'hidden',
          padding: 'clamp(80px,12vw,140px) 24px clamp(60px,10vw,100px)',
          textAlign: 'center',
          minHeight: '92vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* BG IMAGE */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 0,
            backgroundImage: 'url(/hero-bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat',
          }} />
          {/* Dark overlay */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1,
            background: 'linear-gradient(to bottom, rgba(7,7,10,0.72) 0%, rgba(7,7,10,0.38) 35%, rgba(7,7,10,0.38) 65%, rgba(7,7,10,0.88) 100%)',
            pointerEvents: 'none',
          }} />
          {/* Amber glow */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            background: 'radial-gradient(ellipse 60% 40% at 50% 55%, rgba(217,119,6,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', zIndex: 3 }}>
            <h1 style={{
              fontSize: 'clamp(32px, 6vw, 72px)', fontWeight: 900, margin: '0 0 12px',
              letterSpacing: '-0.04em',
              background: 'linear-gradient(135deg, #fff 0%, #d97706 60%, #7f1d1d 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(-2px -2px 0px #000) drop-shadow(2px -2px 0px #000) drop-shadow(-2px 2px 0px #000) drop-shadow(2px 2px 0px #000) drop-shadow(0 4px 24px rgba(0,0,0,0.9))',
            }}>
              Bharat Ki Kahaniyan 🔥
            </h1>
            <p style={{
              fontSize: 'clamp(14px, 2vw, 20px)', color: '#f3f4f6', margin: '0 0 32px', lineHeight: 1.6, textShadow: '0 1px 12px rgba(0,0,0,0.9)',
              maxWidth: '620px', marginLeft: 'auto', marginRight: 'auto',
            }}>
              1000+ Desi comics & novels by Desi people. Scroll or read. Free forever. No ads, no gatekeepers.
            </p>

            {/* Search Bar */}
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', maxWidth: '540px', margin: '0 auto 48px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <input
                type="text"
                placeholder="Search stories, creators, genres..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  flex: 1, minWidth: '260px', padding: '12px 18px', borderRadius: '10px',
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  fontSize: '14px', fontFamily: 'inherit',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '12px 28px', borderRadius: '10px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
                  color: '#fff', border: 'none', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  transition: 'box-shadow 0.2s, transform 0.15s',
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.transform = 'translateY(-2px)'; (e.target as HTMLElement).style.boxShadow = '0 8px 24px rgba(217,119,6,0.5)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.transform = 'none'; (e.target as HTMLElement).style.boxShadow = 'none'; }}
              >
                Search
              </button>
            </form>

            {/* Genre Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '8px' }}>
              {GENRE_PILLS.map(g => (
                <a key={g} href={`/search?genre=${encodeURIComponent(g)}`} style={{
                  fontSize: '12px', fontWeight: 700, padding: '7px 16px', borderRadius: '20px',
                  background: 'rgba(7,7,10,0.78)',
                  backdropFilter: 'blur(8px)',
                  color: '#fff',
                  textDecoration: 'none',
                  border: '1px solid rgba(255,255,255,0.22)',
                  transition: 'all 0.15s',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
                }}
                  onMouseEnter={e => {
                    const el = e.currentTarget;
                    el.style.background = 'rgba(217,119,6,0.92)';
                    el.style.borderColor = '#d97706';
                    el.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget;
                    el.style.background = 'rgba(7,7,10,0.78)';
                    el.style.borderColor = 'rgba(255,255,255,0.22)';
                    el.style.transform = 'none';
                  }}
                >
                  {g}
                </a>
              ))}
            </div>

            {/* ── THREE DOORS: MangaNovels / Kalpanaverse / Kalpana Circle ── */}
            <div style={{
              display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center',
              maxWidth: '900px', margin: '40px auto 0',
            }}>
              <Link href="/search" style={{
                flex: '1 1 240px', minWidth: '220px', textDecoration: 'none',
                padding: '20px 22px', borderRadius: '16px',
                background: 'rgba(7,7,10,0.72)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(217,119,6,0.35)',
                display: 'flex', alignItems: 'center', gap: '14px',
                transition: 'transform 0.15s, box-shadow 0.2s, border-color 0.2s',
                boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
              }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-3px)'; el.style.boxShadow = '0 10px 30px rgba(217,119,6,0.28)'; el.style.borderColor = '#d97706'; }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.35)'; el.style.borderColor = 'rgba(217,119,6,0.35)'; }}
              >
                <span style={{ fontSize: '28px' }}>📖</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 900, fontSize: '15px', color: '#fff' }}>MangaNovels</div>
                  <div style={{ fontSize: '11.5px', color: '#d1d5db', marginTop: '2px' }}>Comics, manga &amp; novels, free forever</div>
                </div>
              </Link>

              <Link href="/kalpanaverse" style={{
                flex: '1 1 240px', minWidth: '220px', textDecoration: 'none',
                padding: '20px 22px', borderRadius: '16px',
                background: 'rgba(7,7,10,0.72)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(37,99,235,0.4)',
                display: 'flex', alignItems: 'center', gap: '14px',
                transition: 'transform 0.15s, box-shadow 0.2s, border-color 0.2s',
                boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
              }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-3px)'; el.style.boxShadow = '0 10px 30px rgba(37,99,235,0.32)'; el.style.borderColor = '#2563eb'; }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.35)'; el.style.borderColor = 'rgba(37,99,235,0.4)'; }}
              >
                <Image src="/kalpanaverse-logo.png" alt="Kalpanaverse" width={140} height={52} style={{ height: '30px', width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 900, fontSize: '15px', color: '#fff' }}>
                    <span style={{ fontSize: '9.5px', fontWeight: 800, padding: '2px 6px', borderRadius: '20px', background: 'rgba(37,99,235,0.25)', border: '1px solid rgba(37,99,235,0.5)', color: '#60a5fa' }}>NEW</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#d1d5db', marginTop: '2px' }}>AI-anime — from shorts to full videos</div>
                </div>
              </Link>

              <Link href="/kalpana-circle" style={{
                flex: '1 1 240px', minWidth: '220px', textDecoration: 'none',
                padding: '20px 22px', borderRadius: '16px',
                background: 'rgba(7,7,10,0.72)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(124,58,237,0.4)',
                display: 'flex', alignItems: 'center', gap: '14px',
                transition: 'transform 0.15s, box-shadow 0.2s, border-color 0.2s',
                boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
              }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-3px)'; el.style.boxShadow = '0 10px 30px rgba(124,58,237,0.32)'; el.style.borderColor = '#7c3aed'; }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.35)'; el.style.borderColor = 'rgba(124,58,237,0.4)'; }}
              >
                <span style={{ fontSize: '28px' }}>💬</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 900, fontSize: '15px', color: '#fff' }}>
                    Kalpana Circle <span style={{ fontSize: '9.5px', fontWeight: 800, padding: '2px 6px', borderRadius: '20px', background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(124,58,237,0.5)', color: '#c4b5fd', marginLeft: '5px', verticalAlign: 'middle' }}>NEW</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#d1d5db', marginTop: '2px' }}>Talk anime with the MANGAL community</div>
                </div>
              </Link>
            </div>
          </div>
        </section>


        {/* ── SHOWCASE ── */}
        <section style={{ padding: 'clamp(60px,8vw,100px) 24px', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ marginBottom: '48px' }}>
            <h2 style={{ fontSize: 'clamp(20px, 3.5vw, 40px)', fontWeight: 900, margin: '0 0 28px', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
              🔥 Trending Now
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
                    <a href="/login?creator=1" style={{
                      flexShrink: 0, fontSize: '13px', fontWeight: 700, color: '#fff', textDecoration: 'none',
                      padding: '9px 18px', borderRadius: '9px',
                      background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
                      whiteSpace: 'nowrap',
                    }}>
                      Publish yours →
                    </a>
                  </div>
                )}
              </>
            ) : (
              <div style={{
                textAlign: 'center', padding: '56px 24px', borderRadius: '16px',
                background: 'var(--bg-card)', border: '1px dashed var(--border-color)',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '14px' }}>📜</div>
                <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
                  No stories published yet
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: '0 0 20px', maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
                  MANGAL is a new platform — the first creators to publish here will be featured right in this spot.
                </p>
                <a href="/login?creator=1" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  fontSize: '13px', fontWeight: 700, color: '#fff', textDecoration: 'none',
                  padding: '10px 20px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
                }}>
                  Become a Creator →
                </a>
              </div>
            )}
          </div>
        </section>


        {/* ── TAG CLOUD ── */}
        {tagCloud.length > 0 && (
          <section style={{ padding: '0 24px clamp(60px,8vw,100px)', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
              <h2 style={{ fontSize: 'clamp(20px, 3.5vw, 32px)', fontWeight: 900, margin: 0, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
                🏷️ Browse by Tag
              </h2>
              <Link href="/tags" style={{ fontSize: '13px', fontWeight: 700, color: '#d97706', textDecoration: 'none' }}>
                See all tags →
              </Link>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {tagCloud.map(tag => (
                <a
                  key={tag.id}
                  href={`/tags/${tag.slug}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)',
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    padding: '10px 16px', borderRadius: '24px', textDecoration: 'none',
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


        {/* ── FEATURES ── */}
        <section style={{ padding: 'clamp(60px,8vw,100px) 24px', maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{
              fontSize: 'clamp(24px, 3.5vw, 42px)', fontWeight: 900, margin: '0 0 12px',
              letterSpacing: '-0.03em', color: 'var(--text-primary)',
            }}>
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
          <div style={{ fontSize: '40px', marginBottom: '24px', filter: 'drop-shadow(0 0 20px rgba(217,119,6,0.6))' }}>🔥</div>
          <h2 style={{ fontSize: 'clamp(28px,4vw,46px)', fontWeight: 900, margin: '0 0 16px', letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>
            Got a story in you?
          </h2>
          <p style={{ fontSize: 'clamp(14px,1.8vw,17px)', color: 'var(--text-tertiary)', margin: '0 0 36px', lineHeight: 1.65 }}>
            Publish your own Mangal or Novel on our platform. Free tools, real readers, no middlemen.
          </p>
          <a href="/login?creator=1" style={{
            padding: '14px 36px', borderRadius: '12px', fontSize: '15px', fontWeight: 800,
            background: 'linear-gradient(135deg, #7f1d1d 0%, #d97706 100%)',
            color: '#fff', textDecoration: 'none',
            boxShadow: '0 4px 28px rgba(217,119,6,0.35)',
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            transition: 'transform 0.15s, box-shadow 0.2s',
          }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 8px 36px rgba(217,119,6,0.55)'; }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = '0 4px 28px rgba(217,119,6,0.35)'; }}
          >
            ✍️ Become a Creator
          </a>
        </section>


        {/* ── FOOTER ── */}
        <footer style={{ borderTop: '1px solid var(--footer-border)', background: 'var(--footer-bg)', padding: '40px 24px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', justifyContent: 'space-between', marginBottom: '32px' }}>
              {/* Brand */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <Image
                    src="/logo-icon.png"
                    alt="MANGAL"
                    width={32}
                    height={32}
                    style={{ borderRadius: '9px', display: 'block' }}
                  />
                  <span style={{ fontWeight: 900, fontSize: '18px', color: 'var(--footer-text)' }}>MANGAL</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--footer-text-muted)', maxWidth: '200px', lineHeight: 1.6, margin: '0 0 16px' }}>
                  India&apos;s home for original comics &amp; novels. Made with ❤️ in Bharat.
                </p>
                {/* Social icons — accounts aren't live yet, so these are
                    non-clickable placeholders (title tooltip explains why)
                    rather than dead links to nowhere. Swap the <span> for
                    an <a href="..."> the moment each account exists. */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  {SOCIAL_ICONS.map(({ name, path }) => (
                    <span
                      key={name}
                      title={`${name} — coming soon`}
                      style={{
                        width: '30px', height: '30px', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid var(--footer-border)',
                        color: 'var(--footer-text-muted)', cursor: 'default',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d={path} /></svg>
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '48px', flexWrap: 'wrap' }}>
                <FooterCol title="Platform" links={[
                  { label: 'Browse', href: '/search' },
                  { label: 'Rankings', href: '/rankings' },
                  { label: 'Genres', href: '/search' },
                  { label: 'New Releases', href: '/search' },
                ]} />
                <FooterCol title="Account" links={[
                  { label: 'Log In', href: '/login' },
                  { label: 'Sign Up', href: '/login' },
                  { label: 'Become a Creator', href: '/login?creator=1' },
                ]} />
                <FooterCol title="Company" links={[
                  { label: 'About', href: '/about' },
                  { label: 'Help Center', href: '/help' },
                ]} />
                <FooterCol title="Legal" links={[
                  { label: 'Privacy Policy', href: '/privacy' },
                  { label: 'Terms of Service', href: '/terms' },
                  { label: 'Grievance', href: '/grievance' },
                ]} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--footer-border)', paddingTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '11px', color: 'var(--footer-text-muted)', margin: 0 }}>© 2026 Mangal. All rights reserved.</p>
              <p style={{ fontSize: '11px', color: 'var(--footer-text-muted)', margin: 0 }}>Free to read, forever. 🇮🇳</p>
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
    <a href={`/series/${series.id}`} style={{ textDecoration: 'none' }}
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
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px' }}>📜</div>
          )}
          {rank && rank <= 3 && (
            <div style={{
              position: 'absolute', top: '6px', left: '6px',
              width: '20px', height: '20px', borderRadius: '5px',
              background: rank === 1 ? '#d97706' : rank === 2 ? 'var(--text-secondary)' : '#92400e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: 900, color: '#0d0d14',
            }}>#{rank}</div>
          )}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, transparent 100%)',
            padding: '20px 7px 7px',
          }}>
            <span style={{
              fontSize: '8px', fontWeight: 700, color: '#fff',
              background: series.content_type === 'novel' ? 'rgba(109,40,217,0.9)' : 'rgba(127,29,29,0.9)',
              padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
            }}>
              {series.content_type === 'novel' ? '📕 Novel' : '📖 Mangal'}
            </span>
          </div>
        </div>
        <div style={{ padding: '8px 8px 10px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {series.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {series.genre ? <div style={{ fontSize: '9px', color: '#d97706' }}>{series.genre}</div> : <span />}
            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>👁 {formatViews(series.views ?? 0)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}


/* ── FEATURE CARD ── */
function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
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
      <div style={{ fontSize: '30px', marginBottom: '14px' }}>{icon}</div>
      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}


/* ── FOOTER COLUMN ── */
// WebNovel-style footer social icons — Instagram, TikTok/X, Facebook, YouTube.
// Simple single-path glyphs so they render crisp at 14px without an icon library.
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
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--footer-link)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {links.map(l => (
          <a key={l.label} href={l.href} style={{ fontSize: '13px', color: 'var(--footer-text-muted)', textDecoration: 'none', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.target as HTMLElement).style.color = '#d97706'}
            onMouseLeave={e => (e.target as HTMLElement).style.color = 'var(--footer-text-muted)'}
          >{l.label}</a>
        ))}
      </div>
    </div>
  );
}