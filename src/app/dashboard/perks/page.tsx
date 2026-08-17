'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import ProductScopeSwitcher, { ProductScope } from '../../components/shared/ProductScope';
import { Gift, Check, BookOpen, PlaySquare, Users2, Sparkles, type LucideIcon } from 'lucide-react';

import { setPostLoginRedirect } from '../../lib/auth/authRedirect';

// Perks tab retrofit per CONTEXT.md §43's decision: per-product tier
// ladder (each product judged on its own metric) + a cross-product
// "Ecosystem Bonus" for creators active on more than one product. See
// §43 for the full reasoning — this is the implementation.

type ProductKey = 'webmangal' | 'katube' | 'kcircle';

interface Tier {
  name: string;
  threshold: number; // metric value required to reach this tier
  benefits: string[];
}

interface ProductPerks {
  label: string;
  icon: LucideIcon;
  metricLabel: string; // e.g. "total reads", "total views", "total likes"
  tiers: Tier[];
}

// Thresholds are an implementation detail per §43 (not re-litigated as a
// concept) — round numbers per product, scaled to what's realistically
// achievable on that product's own counter.
const PRODUCT_PERKS: Record<ProductKey, ProductPerks> = {
  webmangal: {
    label: 'WebMangal', icon: BookOpen, metricLabel: 'total reads',
    tiers: [
      { name: 'Starter', threshold: 0, benefits: ['Publish unlimited chapters', 'Basic analytics', 'Community forum access'] },
      { name: 'Rising', threshold: 1_000, benefits: ['Priority review for featured slots', 'Advanced analytics', 'Early access to new tools'] },
      { name: 'Elite', threshold: 10_000, benefits: ['Dedicated support line', 'Custom series branding', 'Revenue share bonus'] },
    ],
  },
  katube: {
    label: 'KaTube', icon: PlaySquare, metricLabel: 'total views',
    tiers: [
      { name: 'Starter', threshold: 0, benefits: ['Upload unlimited videos & Fast Tap clips', 'Basic view/like analytics', 'Community forum access'] },
      { name: 'Rising', threshold: 1_000, benefits: ['Priority placement in KaTube discovery', 'Advanced analytics', 'Early access to new tools'] },
      { name: 'Elite', threshold: 10_000, benefits: ['Dedicated support line', 'Custom channel branding', 'Revenue share bonus'] },
    ],
  },
  kcircle: {
    label: 'Kalpana Circle', icon: Users2, metricLabel: 'total likes',
    tiers: [
      { name: 'Starter', threshold: 0, benefits: ['Post unlimited theories & fan art', 'Basic engagement stats', 'Community forum access'] },
      { name: 'Rising', threshold: 250, benefits: ['Priority visibility in the feed', 'Advanced engagement stats', 'Early access to new tools'] },
      { name: 'Elite', threshold: 2_500, benefits: ['Dedicated support line', 'Custom profile flair', 'Revenue share bonus'] },
    ],
  },
};

const ECOSYSTEM_THRESHOLD = 500; // "clears a minimum threshold on more than one product" — §43

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function currentTierIndex(tiers: Tier[], metric: number): number {
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (metric >= tiers[i].threshold) idx = i;
  }
  return idx;
}

function TierCard({ tier, active, isNext, metric, nextThreshold }: {
  tier: Tier; active: boolean; isNext: boolean; metric: number; nextThreshold?: number;
}) {
  const progressPct = isNext && nextThreshold
    ? Math.min(100, Math.round((metric / nextThreshold) * 100))
    : null;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: active ? '1px solid var(--accent)' : '1px solid var(--border-color)',
      borderRadius: '14px', padding: '22px', position: 'relative',
    }}>
      {active && (
        <div style={{
          position: 'absolute', top: '14px', right: '14px', fontSize: '10px', fontWeight: 800,
          color: 'var(--accent)', background: 'rgba(var(--accent-rgb), 0.12)', padding: '3px 8px', borderRadius: '6px',
        }}>
          CURRENT
        </div>
      )}
      <div style={{ fontWeight: 800, fontSize: '17px', marginBottom: '4px' }}>{tier.name}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: progressPct !== null ? '10px' : '16px' }}>
        {tier.threshold === 0 ? 'Every creator' : `${formatCount(tier.threshold)}+`}
      </div>
      {progressPct !== null && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ height: '5px', borderRadius: '3px', background: 'var(--bg-input)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--accent)', borderRadius: '3px' }} />
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', marginTop: '5px' }}>
            {formatCount(metric)} / {formatCount(tier.threshold)}
          </div>
        </div>
      )}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '8px' }}>
        {tier.benefits.map((b) => (
          <li key={b} style={{ fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <Check size={14} strokeWidth={2.5} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PerksPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<ProductScope>('all');

  const [metrics, setMetrics] = useState<Record<ProductKey, number>>({ webmangal: 0, katube: 0, kcircle: 0 });

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setPostLoginRedirect(window.location.pathname);
        window.location.href = '/login';
        return;
      }
      setUser(data.user);

      const [seriesRes, videosRes, postsRes] = await Promise.all([
        supabase.from('series').select('id, views').eq('creator_id', data.user.id),
        supabase.from('videos').select('id, views').eq('creator_id', data.user.id),
        supabase.from('kcircle_posts').select('id').eq('author_id', data.user.id),
      ]);

      const seriesRows = seriesRes.data || [];
      const webmangalReads = seriesRows.reduce((sum, s) => sum + (s.views || 0), 0);

      const videoRows = videosRes.data || [];
      const katubeViews = videoRows.reduce((sum, v) => sum + (v.views || 0), 0);

      const postRows = postsRes.data || [];
      const postIds = postRows.map((p) => p.id);
      const likesRes = postIds.length > 0
        ? await supabase.from('kcircle_post_likes').select('post_id', { count: 'exact', head: true }).in('post_id', postIds)
        : { count: 0 };

      setMetrics({
        webmangal: webmangalReads,
        katube: katubeViews,
        kcircle: likesRes.count || 0,
      });

      setLoading(false);
    };
    init();
  }, []);

  const ecosystemQualifyingCount = useMemo(
    () => (Object.keys(metrics) as ProductKey[]).filter((k) => metrics[k] >= ECOSYSTEM_THRESHOLD).length,
    [metrics]
  );
  const ecosystemUnlocked = ecosystemQualifyingCount >= 2;

  const visibleProducts: ProductKey[] =
    scope === 'all' ? ['webmangal', 'katube', 'kcircle'] : [scope];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Gift size={12} strokeWidth={2.5} /> PERKS
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>Creator Perks</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 24px' }}>
          Unlock more benefits as your reach grows — each product has its own ladder, judged on its own numbers.
        </p>

        <ProductScopeSwitcher value={scope} onChange={setScope} />

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <>
            {/* ── Ecosystem Bonus ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
              background: ecosystemUnlocked ? 'rgba(var(--accent-rgb), 0.08)' : 'var(--bg-card)',
              border: ecosystemUnlocked ? '1px solid var(--accent)' : '1px solid var(--border-color)',
              borderRadius: '12px', padding: '16px 20px', marginBottom: '28px',
            }}>
              <div style={{
                width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                background: ecosystemUnlocked ? 'var(--accent)' : 'var(--bg-input)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: ecosystemUnlocked ? '#fff' : 'var(--text-tertiary)',
              }}>
                <Sparkles size={18} strokeWidth={2} />
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontWeight: 800, fontSize: '13.5px', marginBottom: '2px' }}>
                  {ecosystemUnlocked ? 'MANGAL Creator — Ecosystem Bonus unlocked' : 'Ecosystem Bonus'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  {ecosystemUnlocked
                    ? `You've cleared ${formatCount(ECOSYSTEM_THRESHOLD)}+ on ${ecosystemQualifyingCount} products — your tier progress counts 10% extra on every product.`
                    : `Clear ${formatCount(ECOSYSTEM_THRESHOLD)}+ on your metric on 2 or more products to unlock a MANGAL Creator badge and a 10% boost to tier progress everywhere.`}
                </div>
              </div>
            </div>

            {visibleProducts.map((p) => {
              const perks = PRODUCT_PERKS[p];
              const metric = metrics[p];
              const idx = currentTierIndex(perks.tiers, metric);

              return (
                <div key={p} style={{ marginBottom: '32px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <perks.icon size={14} strokeWidth={2} /> {perks.label}
                  </div>
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '12.5px', margin: '0 0 14px' }}>
                    Based on your {perks.metricLabel} — currently {formatCount(metric)}.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '14px' }}>
                    {perks.tiers.map((tier, i) => (
                      <TierCard
                        key={tier.name}
                        tier={tier}
                        active={i === idx}
                        isNext={i === idx + 1}
                        metric={metric}
                        nextThreshold={i === idx + 1 ? tier.threshold : undefined}
                      />
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
