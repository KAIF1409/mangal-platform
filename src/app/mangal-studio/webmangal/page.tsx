'use client';

import Link from 'next/link';
import { useStudioAuth } from '../katube/lib/useStudioAuth';
import { useWebMangalAnalytics } from './lib/useWebMangalAnalytics';
import { TrendingUp, ArrowRight } from 'lucide-react';

// §126 follow-up (Phase 2): WebMangal Studio Overview. Same KPI-card +
// ranked-performance-list shape as KaTube Studio's Overview (§116),
// data from the extracted useWebMangalAnalytics hook (real, sourced
// from series/chapters/follows/view_events/reading_progress — see
// that hook's header comment). useStudioAuth is product-agnostic
// (auth-gate only), reused as-is from KaTube Studio's lib folder
// rather than duplicated.
export default function WebMangalStudioOverview() {
  const { loading: authLoading } = useStudioAuth('/mangal-studio/webmangal');
  const { stories, analytics, loading } = useWebMangalAnalytics();

  if (authLoading || loading || !analytics) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading…</div>;
  }

  const completionPct = analytics.completion.started > 0
    ? Math.round((analytics.completion.completed / analytics.completion.started) * 100)
    : null;

  return (
    <div style={{ maxWidth: '860px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Series', value: stories.length },
          { label: 'Total views', value: analytics.totalViews },
          { label: 'Chapters', value: analytics.totalChapters },
          { label: 'Followers', value: analytics.totalFollowers },
        ].map(m => (
          <div key={m.label} style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: 900 }}>{m.value.toLocaleString()}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '14px 18px', borderRadius: '12px', background: 'var(--bg-card)',
        border: '1px solid var(--border-color)', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
      }}>
        <TrendingUp size={16} color="var(--accent)" />
        <div style={{ fontSize: '13px' }}>
          <strong>{analytics.newFollowersThisWeek.toLocaleString()}</strong> new followers this week
        </div>
        {completionPct !== null && (
          <div style={{ fontSize: '13px', marginLeft: 'auto', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{completionPct}%</strong> chapter completion rate
          </div>
        )}
      </div>

      {analytics.viewsPerSeries.length > 0 ? (
        <div style={{ padding: '18px 20px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '4px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>Series performance</h2>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Link href="/mangal-studio/katube/content" style={{ fontSize: '11.5px', color: 'var(--accent)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                Manage content <ArrowRight size={12} />
              </Link>
              <Link href="/mangal-studio/webmangal/analytics" style={{ fontSize: '11.5px', color: 'var(--accent)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                Full analytics <ArrowRight size={12} />
              </Link>
            </div>
          </div>
          <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', margin: '0 0 14px' }}>Ranked by views, highest first.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {analytics.viewsPerSeries.slice(0, 10).map(s => {
              const maxViews = analytics.viewsPerSeries[0]?.views || 1;
              const barPct = Math.max(4, Math.round((s.views / maxViews) * 100));
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title}
                  </div>
                  <div style={{ width: '120px', height: '6px', borderRadius: '4px', background: 'var(--border-color)', overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', width: '54px', textAlign: 'right', flexShrink: 0 }}>{s.views.toLocaleString()}</div>
                </div>
              );
            })}
            {analytics.viewsPerSeries.length > 10 && (
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '4px 0 0', textAlign: 'center' }}>+{analytics.viewsPerSeries.length - 10} more — see Analytics tab</p>
            )}
          </div>
        </div>
      ) : (
        <div style={{ padding: '30px', textAlign: 'center', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: '0 0 14px' }}>No series yet — publish your first one to start seeing stats here.</p>
          <Link href="/WebMangal/upload" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: '10px', textDecoration: 'none', background: 'var(--accent)', color: '#fff', fontSize: '13px', fontWeight: 800 }}>
            Publish a series <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
