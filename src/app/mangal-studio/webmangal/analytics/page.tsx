'use client';

import { useStudioAuth } from '../../katube/lib/useStudioAuth';
import { useWebMangalAnalytics } from '../lib/useWebMangalAnalytics';
import { Clock, Globe, Map, TrendingDown, TrendingUp } from 'lucide-react';

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
}

// §126 follow-up (Phase 2): WebMangal Studio Analytics tab. Direct port
// of the real analytics blocks already shipped on `/dashboard`
// (Reading Time Distribution, Views by Country, Gender donut, Reader
// Trends, Chapter Completion Rate, per-chapter retention) — same
// markup/logic, same honesty rules (empty states instead of fabricated
// numbers), just relocated into Studio and driven by the standalone
// useWebMangalAnalytics hook instead of the monolithic dashboard
// component's local state.
export default function WebMangalStudioAnalytics() {
  const { loading: authLoading } = useStudioAuth('/mangal-studio/webmangal/analytics');
  const { analytics, loading } = useWebMangalAnalytics();

  if (authLoading || loading || !analytics) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading…</div>;
  }

  return (
    <div style={{ maxWidth: '860px' }}>
      {/* Reading Time Distribution */}
      <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
        <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Reading Time Distribution
      </h3>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px', marginBottom: '24px' }}>
        {(() => {
          const hours = analytics.hourlyViews;
          const max = Math.max(1, ...hours);
          const barW = 700 / 24;
          return (
            <svg viewBox="0 0 700 100" style={{ width: '100%', height: '100px', display: 'block' }}>
              <line x1="0" y1="90" x2="700" y2="90" stroke="var(--divider)" strokeWidth="1" />
              {hours.map((count, h) => {
                const barH = (count / max) * 80;
                return (
                  <rect key={h} x={h * barW + 2} y={90 - barH} width={barW - 4}
                    height={Math.max(barH, count > 0 ? 2 : 0)}
                    fill={count > 0 ? 'var(--accent)' : 'var(--border-light)'} rx="1" />
                );
              })}
            </svg>
          );
        })()}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-faint)', marginTop: '4px' }}>
          {['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'].map((t) => <span key={t}>{t}</span>)}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '10px' }}>
          {analytics.hourlyViews.reduce((s, c) => s + c, 0) === 0
            ? 'No reads logged in the last 7 days yet'
            : `Peak hour: ${analytics.hourlyViews.indexOf(Math.max(...analytics.hourlyViews))}:00`}
        </div>
      </div>

      {/* Audience Insights: country + gender */}
      <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
        <Globe size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Audience Insights
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(160px, 1fr)', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px', minHeight: '160px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>
            Views by Country (7 days)
          </div>
          {(() => {
            const entries = Object.entries(analytics.countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
            const max = Math.max(1, ...entries.map(([, c]) => c));
            if (entries.length === 0) {
              return (
                <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '12px', padding: '30px 0' }}>
                  <Map size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />No geo data yet — shows up as readers view chapters
                </div>
              );
            }
            return (
              <div style={{ display: 'grid', gap: '10px' }}>
                {entries.map(([code, count]) => (
                  <div key={code} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, width: '28px', color: 'var(--text-secondary)' }}>{code}</span>
                    <div style={{ flex: 1, height: '8px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', width: '24px', textAlign: 'right' }}>{count}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>
            Gender (followers)
          </div>
          {(() => {
            const { male, female, unspecified, unknown } = analytics.genderCounts;
            const total = male + female + unspecified + unknown || 1;
            const circumference = 2 * Math.PI * 38;
            const maleDash = (male / total) * circumference;
            const femaleDash = (female / total) * circumference;
            const pct = (n: number) => `${((n / total) * 100).toFixed(2)}%`;
            return (
              <>
                <svg viewBox="0 0 100 100" style={{ width: '80px', height: '80px', display: 'block', margin: '0 auto 14px', transform: 'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r="38" fill="none" stroke="var(--divider)" strokeWidth="14" />
                  {male > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#3b82f6" strokeWidth="14" strokeDasharray={`${maleDash} ${circumference - maleDash}`} strokeDashoffset="0" />}
                  {female > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#ec4899" strokeWidth="14" strokeDasharray={`${femaleDash} ${circumference - femaleDash}`} strokeDashoffset={-maleDash} />}
                </svg>
                <div style={{ display: 'grid', gap: '6px', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}><span>Male</span><span>{pct(male)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}><span>Female</span><span>{pct(female)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}><span>Unknown</span><span>{pct(unknown + unspecified)}</span></div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Reader Trends */}
      <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
        <TrendingDown size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Reader Trends (7 days)
      </h3>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px', marginBottom: '24px' }}>
        {(() => {
          const days = analytics.dailyViews;
          const max = Math.max(1, ...days.map((d) => d.count));
          const points = days.map((d, i) => {
            const x = days.length > 1 ? (i / (days.length - 1)) * 700 : 0;
            const y = 110 - (d.count / max) * 90;
            return `${x},${y}`;
          }).join(' ');
          return (
            <svg viewBox="0 0 700 140" style={{ width: '100%', height: '140px', display: 'block' }}>
              <line x1="0" y1="110" x2="700" y2="110" stroke="var(--divider)" strokeWidth="1" />
              <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" />
              {days.map((d, i) => {
                const x = days.length > 1 ? (i / (days.length - 1)) * 700 : 0;
                const y = 110 - (d.count / max) * 90;
                return <circle key={d.date} cx={x} cy={y} r="3" fill="var(--accent)" />;
              })}
            </svg>
          );
        })()}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-faint)', marginTop: '4px' }}>
          {analytics.dailyViews.map((d) => <span key={d.date}>{d.date.slice(5)}</span>)}
        </div>
      </div>

      {/* Release Stats */}
      <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
        <TrendingUp size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Release Stats
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
            Chapter Completion Rate
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--text-primary)' }}>
            {analytics.completion.started > 0 ? `${Math.round((analytics.completion.completed / analytics.completion.started) * 100)}%` : '—'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>
            {analytics.completion.started > 0
              ? `${analytics.completion.completed} of ${analytics.completion.started} readers reached the last page`
              : 'No page-tracked reads yet (manga chapters only)'}
          </div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
            Average Words / Chapter
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--text-primary)' }}>
            {formatCount(analytics.totalChapters > 0 ? Math.round(analytics.totalWords / analytics.totalChapters) : 0)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>Across all published chapters</div>
        </div>
      </div>

      {/* Retention */}
      <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
        <TrendingDown size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Retention — Where Readers Drop Off
      </h3>
      {analytics.chapterRetention.length === 0 ? (
        <div style={{ border: '1px dashed #2a2a38', borderRadius: '14px', padding: '16px 18px', color: 'var(--text-tertiary)', fontSize: '12px', lineHeight: 1.6 }}>
          Not enough tracked reads yet — this fills in once a few readers have progressed through a paged (manga-style) chapter.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '6px' }}>
          {analytics.chapterRetention.map((c, i, arr) => {
            const pct = Math.round((c.completed / c.started) * 100);
            const barColor = pct < 40 ? '#e5484d' : pct < 70 ? '#e5a63a' : 'var(--accent)';
            return (
              <div key={c.chapterId} style={{ padding: '12px 14px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--divider)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-soft, var(--text-primary))' }}>
                    {c.seriesTitle ? `${c.seriesTitle} — ` : ''}Ch. {c.chapterNumber}{c.chapterTitle ? `: ${c.chapterTitle}` : ''}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: barColor, flexShrink: 0 }}>{pct}%</span>
                </div>
                <div style={{ height: '6px', borderRadius: '3px', background: 'var(--divider)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '4px' }}>
                  {c.completed} of {c.started} readers finished this chapter
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
