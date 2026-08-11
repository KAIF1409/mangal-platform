'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

import { setPostLoginRedirect } from '../../lib/authRedirect';
interface BoostOption {
  title: string;
  desc: string;
  icon: string;
}

const OPTIONS: BoostOption[] = [
  { title: 'Featured Slot', desc: 'Get your series placed in the homepage spotlight rail for 24 hours.', icon: '📌' },
  { title: 'Reader Shoutout', desc: 'Send a push notification about your latest chapter to your followers.', icon: '📣' },
  { title: 'Tag Boost', desc: 'Rank higher in search results for the genre tags on your series.', icon: '🏷️' },
  { title: 'Cross-Promo', desc: 'Trade a mention with another creator in your genre.', icon: '🤝' },
];

export default function BoostPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px' }}>
          🚀 BOOST
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>Get more eyes on your story</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 32px' }}>
          Promotional tools to help new readers discover what you&apos;re writing.
        </p>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            {OPTIONS.map((opt) => (
              <div key={opt.title} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: '14px', padding: '20px',
              }}>
                <div style={{ fontSize: '26px', marginBottom: '10px' }}>{opt.icon}</div>
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
        )}
      </div>

      <Footer />
    </div>
  );
}
