'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { PenLine, Palette, TrendingUp, Tag, Sparkles, type LucideIcon } from 'lucide-react';

import { setPostLoginRedirect } from '../../lib/authRedirect';
interface Suggestion {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const SUGGESTIONS: Suggestion[] = [
  { icon: PenLine, title: 'Draft a chapter outline', desc: 'Give Nova your plot idea and get a structured outline back.' },
  { icon: Palette, title: 'Cover art ideas', desc: 'Describe your story and get cover concept suggestions.' },
  { icon: TrendingUp, title: 'Explain my analytics', desc: 'Ask Nova to summarize what your reader stats mean.' },
  { icon: Tag, title: 'Suggest tags', desc: 'Get genre and tag recommendations for better discovery.' },
];

export default function NovaPage() {
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

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto 14px',
            background: 'linear-gradient(135deg, var(--accent), #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a1006',
          }}>
            <Sparkles size={26} strokeWidth={2} />
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, margin: '0 0 6px' }}>Nova</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', margin: 0 }}>
            Your writing assistant — here to help you plan, polish and promote your stories.
          </p>
        </div>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '20px' }}>
              {SUGGESTIONS.map((s) => (
                <div key={s.title} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '12px', padding: '16px', cursor: 'default',
                }}>
                  <div style={{ marginBottom: '8px', color: 'var(--accent)' }}><s.icon size={18} strokeWidth={1.75} /></div>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{s.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{s.desc}</div>
                </div>
              ))}
            </div>

            <div style={{
              display: 'flex', gap: '8px', background: 'var(--bg-card)',
              border: '1px solid var(--border-color)', borderRadius: '12px', padding: '10px 14px',
            }}>
              <input
                disabled
                placeholder="Ask Nova anything about your stories… (coming soon)"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text-faint)', fontSize: '13px',
                }}
              />
              <button
                disabled
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none',
                  background: 'var(--border-color)', color: 'var(--text-faint)', fontWeight: 700,
                  fontSize: '12px', cursor: 'not-allowed',
                }}
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
