'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import ProductScopeSwitcher, { ProductScope } from '../../components/shared/ProductScope';
import { BookOpen, PlaySquare, Users2, BarChart3, type LucideIcon } from 'lucide-react';

import { setPostLoginRedirect } from '../../lib/auth/authRedirect';

// Earnings has no real ledger wired up yet for any product (see CONTEXT.md
// §43/§44) — the switcher and copy below establish the per-product shape
// now so whoever wires real numbers later only has to replace the ₹0 stat
// values, not re-plumb the scope switcher.
const EARNINGS_SUB: Record<ProductScope, string> = {
  all: 'Track everything your stories, videos, and posts have earned across MANGAL.',
  webmangal: 'Track what your stories have earned and request a payout once you cross the minimum threshold.',
  katube: 'KaTube revenue flows through YouTube itself, not through the platform — this will surface a read-only summary once that\'s wired up.',
  kcircle: 'Kalpana Circle earnings (tips, boosted posts) will show up here once that revenue path ships.',
};

// Performance IS real, unlike Earnings above — sourced live from each
// product's own tables (series.views, follows, videos.views/likes,
// kcircle_posts + kcircle_post_likes). No payment provider needed for
// this half of the page, only for the Earnings half below it.
const PERFORMANCE_SUB: Record<ProductScope, string> = {
  all: 'How your work is performing across every MANGAL product, at a glance.',
  webmangal: 'Reads and followers across every series you\'ve published.',
  katube: 'Views and likes across every video and Short you\'ve uploaded.',
  kcircle: 'Posts and likes across your Kalpana Circle activity.',
};

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '12px', padding: '18px 20px',
    }}>
      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 900 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface ProductPerf {
  label: string;
  icon: LucideIcon;
  boxes: { label: string; value: string; sub?: string }[];
}

export default function EarningsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<ProductScope>('all');

  // Raw aggregates pulled once on mount, per product.
  const [webmangal, setWebmangal] = useState({ totalViews: 0, totalFollowers: 0, newFollowers7d: 0, seriesCount: 0 });
  const [katube, setKatube] = useState({ totalViews: 0, totalLikes: 0, videoCount: 0 });
  const [kcircle, setKcircle] = useState({ totalPosts: 0, totalLikes: 0, postsLast7d: 0 });

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setPostLoginRedirect(window.location.pathname);
        window.location.href = '/login';
        return;
      }
      setUser(data.user);

      const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [seriesRes, videosRes, postsRes] = await Promise.all([
        supabase.from('series').select('id, views').eq('creator_id', data.user.id),
        supabase.from('videos').select('id, views, likes').eq('creator_id', data.user.id),
        supabase.from('kcircle_posts').select('id, created_at').eq('author_id', data.user.id),
      ]);

      const seriesRows = seriesRes.data || [];
      const seriesIds = seriesRows.map((s) => s.id);
      const followRes = seriesIds.length > 0
        ? await supabase.from('follows').select('created_at').in('series_id', seriesIds)
        : { data: [] as { created_at: string }[] };
      const followRows = followRes.data || [];

      setWebmangal({
        totalViews: seriesRows.reduce((sum, s) => sum + (s.views || 0), 0),
        totalFollowers: followRows.length,
        newFollowers7d: followRows.filter((f) => f.created_at >= weekAgoIso).length,
        seriesCount: seriesRows.length,
      });

      const videoRows = videosRes.data || [];
      setKatube({
        totalViews: videoRows.reduce((sum, v) => sum + (v.views || 0), 0),
        totalLikes: videoRows.reduce((sum, v) => sum + (v.likes || 0), 0),
        videoCount: videoRows.length,
      });

      const postRows = postsRes.data || [];
      const postIds = postRows.map((p) => p.id);
      const likesRes = postIds.length > 0
        ? await supabase.from('kcircle_post_likes').select('post_id', { count: 'exact', head: true }).in('post_id', postIds)
        : { count: 0 };

      setKcircle({
        totalPosts: postRows.length,
        totalLikes: likesRes.count || 0,
        postsLast7d: postRows.filter((p) => p.created_at >= weekAgoIso).length,
      });

      setLoading(false);
    };
    init();
  }, []);

  const perfByProduct: Record<Exclude<ProductScope, 'all'>, ProductPerf> = useMemo(() => ({
    webmangal: {
      label: 'WebMangal', icon: BookOpen,
      boxes: [
        { label: 'Total Reads', value: formatCount(webmangal.totalViews) },
        { label: 'Followers', value: formatCount(webmangal.totalFollowers), sub: `+${webmangal.newFollowers7d} this week` },
        { label: 'Series Published', value: formatCount(webmangal.seriesCount) },
      ],
    },
    katube: {
      label: 'KaTube', icon: PlaySquare,
      boxes: [
        { label: 'Total Views', value: formatCount(katube.totalViews) },
        { label: 'Total Likes', value: formatCount(katube.totalLikes) },
        { label: 'Videos Uploaded', value: formatCount(katube.videoCount) },
      ],
    },
    kcircle: {
      label: 'Kalpana Circle', icon: Users2,
      boxes: [
        { label: 'Posts', value: formatCount(kcircle.totalPosts), sub: `+${kcircle.postsLast7d} this week` },
        { label: 'Total Likes', value: formatCount(kcircle.totalLikes) },
      ],
    },
  }), [webmangal, katube, kcircle]);

  const visibleProducts: Exclude<ProductScope, 'all'>[] =
    scope === 'all' ? ['webmangal', 'katube', 'kcircle'] : [scope];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <BarChart3 size={12} strokeWidth={2.5} /> EARNINGS & PERFORMANCE
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>How your work is doing</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 24px' }}>
          One place for every product — switch scope to see reads, views, and engagement per product, or earnings below.
        </p>

        <ProductScopeSwitcher value={scope} onChange={setScope} />

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <>
            {/* ── PERFORMANCE (real data) ── */}
            <div style={{ fontSize: '13px', fontWeight: 800, margin: '4px 0 4px' }}>Performance</div>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '12.5px', margin: '0 0 14px' }}>
              {PERFORMANCE_SUB[scope]}
            </p>

            {visibleProducts.map((p) => {
              const perf = perfByProduct[p];
              return (
                <div key={p} style={{ marginBottom: '22px' }}>
                  {scope === 'all' && (
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <perf.icon size={13} strokeWidth={2} /> {perf.label}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    {perf.boxes.map((b) => (
                      <StatBox key={b.label} label={b.label} value={b.value} sub={b.sub} />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* ── EARNINGS (stub — payment provider not decided, see CONTEXT.md §43) ── */}
            <div style={{ fontSize: '13px', fontWeight: 800, margin: '28px 0 4px' }}>Earnings</div>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '12.5px', margin: '0 0 14px' }}>
              {EARNINGS_SUB[scope]}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <StatBox label="Total Earned" value="₹0" sub="+0.00% this month" />
              <StatBox label="Available to Withdraw" value="₹0" />
              <StatBox label="Pending" value="₹0" />
              <StatBox label="Lifetime Payouts" value="₹0" />
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: '12px', padding: '24px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
            }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>No earnings yet</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  Real payouts need a payment provider (Razorpay or similar) — not decided yet, see CONTEXT.md §43.
                </div>
              </div>
              <button
                disabled
                style={{
                  padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  background: 'transparent', color: 'var(--text-faint)', fontWeight: 700, fontSize: '13px',
                  cursor: 'not-allowed',
                }}
              >
                Request Payout
              </button>
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
