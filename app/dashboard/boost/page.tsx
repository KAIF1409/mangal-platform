'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import ProductScopeSwitcher, { ProductScope } from '../../components/ProductScope';
import { Pin, Megaphone, Tag, Handshake, Rocket, BookOpen, PlaySquare, Users2, type LucideIcon } from 'lucide-react';

import { setPostLoginRedirect } from '../../lib/authRedirect';

// Boost retrofit per CONTEXT.md §43 — no real promotion backend exists
// for any product yet (every option below is still "Coming Soon", same
// as before this change), so like Earnings' stub half (§44), this pass
// establishes the per-product shape and copy now rather than querying
// anything real. Whoever wires an actual boost/promotion system later
// replaces the disabled buttons per product; the switcher/option shape
// is already here.

interface BoostOption {
  title: string;
  desc: string;
  icon: LucideIcon;
}

type ProductKey = 'webmangal' | 'katube' | 'kcircle';

const OPTIONS_BY_PRODUCT: Record<ProductKey, { label: string; icon: LucideIcon; options: BoostOption[] }> = {
  webmangal: {
    label: 'WebMangal', icon: BookOpen,
    options: [
      { title: 'Featured Slot', desc: 'Get your series placed in the homepage spotlight rail for 24 hours.', icon: Pin },
      { title: 'Reader Shoutout', desc: 'Send a push notification about your latest chapter to your followers.', icon: Megaphone },
      { title: 'Tag Boost', desc: 'Rank higher in search results for the genre tags on your series.', icon: Tag },
      { title: 'Cross-Promo', desc: 'Trade a mention with another creator in your genre.', icon: Handshake },
    ],
  },
  katube: {
    label: 'KaTube', icon: PlaySquare,
    options: [
      { title: 'Shorts Spotlight', desc: 'Get your Short placed in the full-screen Shorts feed rotation for 24 hours.', icon: Pin },
      { title: 'Subscriber Push', desc: 'Send a push notification about your latest upload to your subscribers.', icon: Megaphone },
      { title: 'Tag Boost', desc: 'Rank higher in search and recommendations for your video\u2019s tags.', icon: Tag },
      { title: 'Cross-Promo', desc: 'Trade a shoutout with another creator in your niche.', icon: Handshake },
    ],
  },
  kcircle: {
    label: 'Kalpana Circle', icon: Users2,
    options: [
      { title: 'Pinned Post', desc: 'Pin your post to the top of the Circle feed for 24 hours.', icon: Pin },
      { title: 'Broadcast Shoutout', desc: 'Send a shoutout about your post through your broadcast channel.', icon: Megaphone },
      { title: 'Tag Boost', desc: 'Rank higher in discussion search results for your post\u2019s tags.', icon: Tag },
      { title: 'Cross-Promo', desc: 'Trade a mention with another Circle creator.', icon: Handshake },
    ],
  },
};

export default function BoostPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<ProductScope>('all');

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setPostLoginRedirect(window.location.pathname);
        window.location.href = '/login';
        return;
      }
      setUser(data.user);
      setLoading(false);
    };
    init();
  }, []);

  const visibleProducts: ProductKey[] =
    scope === 'all' ? ['webmangal', 'katube', 'kcircle'] : [scope];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Rocket size={12} strokeWidth={2.5} /> BOOST
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>Get more eyes on your work</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 24px' }}>
          Promotional tools to help new readers, viewers, and dreamers discover what you make — per product, since each one&apos;s discovery surface is different.
        </p>

        <ProductScopeSwitcher value={scope} onChange={setScope} />

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <>
            {visibleProducts.map((p) => {
              const { label, icon: ProductIcon, options } = OPTIONS_BY_PRODUCT[p];
              return (
                <div key={p} style={{ marginBottom: '32px' }}>
                  {scope === 'all' && (
                    <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ProductIcon size={14} strokeWidth={2} /> {label}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                    {options.map((opt) => (
                      <div key={opt.title} style={{
                        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                        borderRadius: '14px', padding: '20px',
                      }}>
                        <div style={{ marginBottom: '10px', color: 'var(--accent)' }}><opt.icon size={24} strokeWidth={1.75} /></div>
                        <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '15px' }}>{opt.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.5, marginBottom: '14px' }}>
                          {opt.desc}
                        </div>
                        <button
                          disabled
                          style={{
                            width: '100%', padding: '9px 0', borderRadius: '8px', border: '1px solid var(--border-color)',
                            background: 'transparent', color: 'var(--text-faint)', fontWeight: 700, fontSize: '12px',
                            cursor: 'not-allowed',
                          }}
                        >
                          Coming Soon
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
