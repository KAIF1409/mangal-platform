'use client';

// §41 — Affiliate "AI Toolkit" page for creators, trimmed scope. Only
// WebMangal + KaTube shipped — Kalpana Circle's category was cut because
// no tools were researched/confirmed for it yet (see the migration comment
// in 20260816220000_ai_tools_toolkit.sql). Data-driven from the `ai_tools`
// table (§41 plan item 1) instead of a hardcoded array like /dashboard/tools
// uses, specifically so new deals can be added with an insert, no code push.
//
// Every card with an affiliate program shows a "Sponsored/Affiliate link"
// label — legally required disclosure per §41, not optional/cosmetic.
// Tools with no confirmed affiliate program (Midjourney, Canva — currently
// closed to new applicants) are still listed as free useful tools, not
// hidden and not falsely tagged as revenue-generating.
//
// affiliate_url is null for every seeded row today — real referral links
// don't exist yet because nobody's applied to these programs (§41 plan
// item 3). Cards render a "Get referral link" hint state instead of a dead
// link until real URLs are filled in via Supabase.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import ProductScopeSwitcher, { ProductScope } from '../../components/shared/ProductScope';
import { setPostLoginRedirect } from '../../lib/auth/authRedirect';
import {
  Sparkles, BookOpen, PlaySquare, ExternalLink, BadgeIndianRupee,
  AudioLines, Mic, Scissors, Clapperboard, Video, Film, Image as ImageIcon, PenTool,
  type LucideIcon,
} from 'lucide-react';

interface AiTool {
  id: string;
  name: string;
  product: 'webmangal' | 'katube' | 'kcircle';
  category: string;
  description: string;
  affiliate_url: string | null;
  is_affiliate: boolean;
  icon: string | null;
}

// Maps the `icon` text column to an actual component — keeps the DB row
// plain text (portable, editable via SQL) rather than storing components.
const ICONS: Record<string, LucideIcon> = {
  AudioLines, Mic, Scissors, Clapperboard, Video, Film, Image: ImageIcon, PenTool,
};

const PRODUCT_LABEL: Record<'webmangal' | 'katube', { label: string; icon: LucideIcon }> = {
  webmangal: { label: 'WebMangal', icon: BookOpen },
  katube: { label: 'KaTube', icon: PlaySquare },
};

export default function AiToolkitPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tools, setTools] = useState<AiTool[]>([]);
  // Only the two researched categories are selectable here — 'kcircle' is
  // deliberately left out of `options` below, not just hidden by empty data.
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

      const { data: toolRows } = await supabase
        .from('ai_tools')
        .select('id, name, product, category, description, affiliate_url, is_affiliate, icon')
        .in('product', ['webmangal', 'katube'])
        .order('sort_order', { ascending: true });

      setTools((toolRows ?? []) as AiTool[]);
      setLoading(false);
    };
    init();
  }, []);

  const visibleProducts = useMemo<('webmangal' | 'katube')[]>(
    () => (scope === 'all' ? ['webmangal', 'katube'] : [scope as 'webmangal' | 'katube']),
    [scope]
  );

  const handleToolClick = async (tool: AiTool) => {
    if (!user) return;
    // Fire-and-forget internal click log (§41 plan item 2) — never blocks
    // navigation on this succeeding.
    supabase.from('tool_clicks').insert({ tool_id: tool.id, user_id: user.id }).then();
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Sparkles size={12} strokeWidth={2.5} /> AI TOOLKIT
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>AI Toolkit</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 6px', maxWidth: '640px' }}>
          Third-party AI tools other creators use to make their work — curated,
          not ours to build. Cards marked Sponsored earn MANGAL a commission
          if you sign up through the link, at no extra cost to you.
        </p>
        <p style={{ color: 'var(--text-faint)', fontSize: '12px', margin: '0 0 24px' }}>
          Kalpana Circle tools aren&apos;t listed yet — that category hasn&apos;t
          been researched for affiliate programs, coming later.
        </p>

        <ProductScopeSwitcher value={scope} onChange={setScope} options={['all', 'webmangal', 'katube']} />

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <>
            {visibleProducts.map((p) => {
              const { label, icon: ProductIcon } = PRODUCT_LABEL[p];
              const productTools = tools.filter((t) => t.product === p);
              if (productTools.length === 0) return null;
              return (
                <div key={p} style={{ marginBottom: '32px' }}>
                  {scope === 'all' && (
                    <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ProductIcon size={14} strokeWidth={2} /> {label}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                    {productTools.map((tool) => {
                      const ToolIcon = (tool.icon && ICONS[tool.icon]) || Sparkles;
                      const hasLiveLink = Boolean(tool.affiliate_url);
                      return (
                        <a
                          key={tool.id}
                          href={tool.affiliate_url || '#'}
                          target={hasLiveLink ? '_blank' : undefined}
                          rel={hasLiveLink ? 'noopener noreferrer sponsored' : undefined}
                          onClick={(e) => {
                            if (!hasLiveLink) { e.preventDefault(); return; }
                            handleToolClick(tool);
                          }}
                          style={{
                            display: 'block', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            borderRadius: '14px', padding: '20px', textDecoration: 'none', color: 'inherit',
                            position: 'relative', cursor: hasLiveLink ? 'pointer' : 'default',
                          }}
                        >
                          {tool.is_affiliate && (
                            <div style={{
                              position: 'absolute', top: '14px', right: '14px', fontSize: '9px', fontWeight: 800,
                              color: '#059669', background: 'rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.3)',
                              padding: '3px 7px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '3px',
                            }}>
                              <BadgeIndianRupee size={10} strokeWidth={2.5} /> SPONSORED
                            </div>
                          )}
                          <div style={{ marginBottom: '10px', color: 'var(--accent)' }}><ToolIcon size={22} strokeWidth={1.75} /></div>
                          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '3px' }}>{tool.name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>{tool.category}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: hasLiveLink ? '10px' : 0 }}>{tool.description}</div>
                          {hasLiveLink ? (
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              Visit <ExternalLink size={11} strokeWidth={2.5} />
                            </div>
                          ) : (
                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', fontStyle: 'italic' }}>
                              Referral link not added yet
                            </div>
                          )}
                        </a>
                      );
                    })}
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
