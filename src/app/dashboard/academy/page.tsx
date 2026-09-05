'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import ProductScopeSwitcher, { ProductScope } from '../../components/shared/ProductScope';
import { GraduationCap } from 'lucide-react';

import { setPostLoginRedirect } from '../../lib/auth/authRedirect';

// Academy retrofit per CONTEXT.md §43 — flagged as "naturally cross-product,
// barely needs the switcher" since writing/growth tips aren't WebMangal-only
// in spirit. In practice the article set was 100% WebMangal-specific before
// this change, so this pass adds real KaTube- and Kalpana Circle-specific
// articles alongside the existing WebMangal ones and a light product filter
// — "All" (default) shows everything, product-scoped shows just that
// product's articles plus anything tagged universal.

interface Article {
  title: string;
  blurb: string;
  tag: string;
  product: 'webmangal' | 'katube' | 'kcircle' | 'universal';
}

const ARTICLES: Article[] = [
  // Universal — applies across every product
  { tag: 'Community', title: 'Turning comments into loyal fans', blurb: 'Simple ways to reply to your audience without burning out — same principles whether it\u2019s a chapter, a video, or a post.', product: 'universal' },
  { tag: 'Growth', title: 'Why consistent posting schedules matter', blurb: 'Readers, viewers, and dreamers all follow creators who show up reliably — here\u2019s how to plan one.', product: 'universal' },

  // WebMangal
  { tag: 'Getting Started', title: 'How to publish your first chapter', blurb: 'A quick walkthrough of formatting, cover art, and going live.', product: 'webmangal' },
  { tag: 'Writing', title: 'Hooking readers in the first 500 words', blurb: 'Opening lines that make people tap "next chapter" instead of leaving.', product: 'webmangal' },

  // KaTube
  { tag: 'Getting Started', title: 'How to verify your channel and upload', blurb: 'A quick walkthrough of channel verification and your first video upload.', product: 'katube' },
  { tag: 'Video', title: 'Making a Short that hooks in the first 3 seconds', blurb: 'What keeps a viewer from swiping away — pacing, framing, and the first cut.', product: 'katube' },

  // Kalpana Circle
  { tag: 'Getting Started', title: 'Posting your first theory or fan art', blurb: 'How to write a post and pick tags that actually get discovered.', product: 'kcircle' },
  { tag: 'Community', title: 'Starting a discussion people actually reply to', blurb: 'The difference between a post that scrolls by and one that gets a thread going.', product: 'kcircle' },
];

const SCOPE_TITLE: Record<ProductScope, string> = {
  all: 'Guides and tips to help you grow as a creator on MANGAL.',
  webmangal: 'Guides and tips to help you grow as a storyteller on WebMangal.',
  katube: 'Guides and tips to help you grow as a video creator on KaTube.',
  kcircle: 'Guides and tips to help you grow your presence on Kalpana Circle.',
};

export default function AcademyPage() {
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

  const visibleArticles = useMemo(() => {
    if (scope === 'all') return ARTICLES;
    return ARTICLES.filter((a) => a.product === scope || a.product === 'universal');
  }, [scope]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <div style={{ flex: 1, maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <GraduationCap size={12} strokeWidth={2.5} /> ACADEMY
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>Creator Academy</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 24px' }}>
          {SCOPE_TITLE[scope]}
        </p>

        <ProductScopeSwitcher value={scope} onChange={setScope} />

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {visibleArticles.map((a) => (
              <div key={a.title} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: '12px', padding: '18px 20px', cursor: 'default',
              }}>
                <div style={{
                  display: 'inline-block', fontSize: '10px', fontWeight: 800, color: 'var(--accent)',
                  background: 'rgba(var(--accent-rgb), 0.12)', padding: '3px 8px', borderRadius: '6px', marginBottom: '10px',
                }}>
                  {a.tag}
                </div>
                <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '5px' }}>{a.title}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{a.blurb}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
