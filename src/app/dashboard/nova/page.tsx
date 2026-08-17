'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import ProductScopeSwitcher, { ProductScope } from '../../components/shared/ProductScope';
import { PenLine, Palette, TrendingUp, Tag, Sparkles, Clapperboard, MessageCircle, type LucideIcon } from 'lucide-react';

import { setPostLoginRedirect } from '../../lib/auth/authRedirect';

// Nova retrofit per CONTEXT.md §43 — flagged as "naturally cross-product,
// barely needs the switcher" since AI help isn't WebMangal-only in spirit.
// Same gap as Academy: the suggestion set and placeholder copy were 100%
// WebMangal-worded before this change. Adds real KaTube/Kalpana Circle
// suggestions and a light product filter, still fully "coming soon"
// (no AI backend wired up yet for any product).

interface Suggestion {
  icon: LucideIcon;
  title: string;
  desc: string;
  product: 'webmangal' | 'katube' | 'kcircle' | 'universal';
}

const SUGGESTIONS: Suggestion[] = [
  { icon: TrendingUp, title: 'Explain my analytics', desc: 'Ask Nova to summarize what your stats mean, whatever product they\u2019re from.', product: 'universal' },
  { icon: Tag, title: 'Suggest tags', desc: 'Get tag recommendations for better discovery.', product: 'universal' },

  { icon: PenLine, title: 'Draft a chapter outline', desc: 'Give Nova your plot idea and get a structured outline back.', product: 'webmangal' },
  { icon: Palette, title: 'Cover art ideas', desc: 'Describe your story and get cover concept suggestions.', product: 'webmangal' },

  { icon: Clapperboard, title: 'Draft a video description', desc: 'Give Nova your video\u2019s plot and get a description + tags back.', product: 'katube' },
  { icon: Palette, title: 'Thumbnail ideas', desc: 'Describe your video and get thumbnail concept suggestions.', product: 'katube' },

  { icon: PenLine, title: 'Draft a discussion post', desc: 'Give Nova your theory or idea and get a post draft back.', product: 'kcircle' },
  { icon: MessageCircle, title: 'Reply ideas for comments', desc: 'Get suggested replies to keep a discussion going.', product: 'kcircle' },
];

const PLACEHOLDER: Record<ProductScope, string> = {
  all: 'Ask Nova anything about your work… (coming soon)',
  webmangal: 'Ask Nova anything about your stories… (coming soon)',
  katube: 'Ask Nova anything about your videos… (coming soon)',
  kcircle: 'Ask Nova anything about your posts… (coming soon)',
};

const SUB: Record<ProductScope, string> = {
  all: 'Your creative assistant — here to help you plan, polish and promote your work.',
  webmangal: 'Your writing assistant — here to help you plan, polish and promote your stories.',
  katube: 'Your video assistant — here to help you plan, polish and promote your uploads.',
  kcircle: 'Your community assistant — here to help you plan, polish and promote your posts.',
};

export default function NovaPage() {
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

  const visibleSuggestions = useMemo(() => {
    if (scope === 'all') return SUGGESTIONS;
    return SUGGESTIONS.filter((s) => s.product === scope || s.product === 'universal');
  }, [scope]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto 14px',
            background: 'linear-gradient(135deg, var(--accent), #f59e0b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a1006',
          }}>
            <Sparkles size={26} strokeWidth={2} />
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, margin: '0 0 6px' }}>Nova</h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '13px', margin: 0 }}>
            {SUB[scope]}
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ProductScopeSwitcher value={scope} onChange={setScope} />
        </div>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '10px', marginBottom: '20px' }}>
              {visibleSuggestions.map((s) => (
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
                placeholder={PLACEHOLDER[scope]}
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
