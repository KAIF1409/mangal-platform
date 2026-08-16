'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { isDeveloperRole } from '../../lib/roles';
import { setPostLoginRedirect } from '../../lib/authRedirect';
import { Lock, Trophy, Camera, CheckCircle2, Crown, IndianRupee, Save } from 'lucide-react';

// Admin controls for Mangal of the Week (Phase 2, build steps 1/3/5 — see
// CONTEXT.md §0c). There's no scheduled job yet, so both the weekly
// snapshot and the end-of-week scoring run manually from here, same
// "no scheduled job yet — refresh manually" pattern as the Mangal Ideas
// admin page's "Refresh now" button.
//
//   - Snapshot: calls snapshot_weekly_top20() — pulls the top 20 approved
//     videos by raw views into weekly_rankings for the *current* week.
//     Safe to re-run (upserts on the (week_start_date, video_id) unique key).
//   - Finalize: calls finalize_weekly_rankings() — scores + ranks the
//     *previous* week (that function's own default) once voting is done.
//   - Prize notes: weekly_rankings.prize_note is a plain display-only text
//     field (no payout logic per CONTEXT.md §0c step 5) — edited here via a
//     direct table update, allowed by the existing weekly_rankings_admin_write
//     RLS policy (developer role), same as every other admin-only write in
//     this codebase.

interface RankingRow {
  id: string;
  week_start_date: string;
  video_id: string;
  video_title: string;
  tier: number;
  votes_count: number;
  views_snapshot: number;
  final_score: number;
  rank: number | null;
  prize_note: string | null;
}

/** Same Monday-of-week helper as the voting page — display/lookup only. */
function currentWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday));
  return monday.toISOString().slice(0, 10);
}

export default function AdminMangalOfTheWeekPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentPool, setCurrentPool] = useState<RankingRow[]>([]);
  const [pastWeeks, setPastWeeks] = useState<RankingRow[]>([]);

  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeMsg, setFinalizeMsg] = useState<string | null>(null);

  const [prizeDrafts, setPrizeDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadRankings = useCallback(async () => {
    const week = currentWeekStart();

    const [{ data: pool }, { data: finalized }] = await Promise.all([
      supabase
        .from('weekly_rankings')
        .select('id, week_start_date, video_id, tier, votes_count, views_snapshot, final_score, rank, prize_note, videos!inner(title)')
        .eq('week_start_date', week)
        .order('views_snapshot', { ascending: false }),
      supabase
        .from('weekly_rankings')
        .select('id, week_start_date, video_id, tier, votes_count, views_snapshot, final_score, rank, prize_note, videos!inner(title)')
        .not('rank', 'is', null)
        .lte('rank', 5)
        .order('week_start_date', { ascending: false })
        .order('rank', { ascending: true })
        .limit(50),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same embedded-relation typing gap as the voting page
    const toRow = (r: any): RankingRow => ({
      id: r.id, week_start_date: r.week_start_date, video_id: r.video_id, video_title: r.videos.title,
      tier: r.tier, votes_count: r.votes_count, views_snapshot: r.views_snapshot,
      final_score: r.final_score, rank: r.rank, prize_note: r.prize_note,
    });

    setCurrentPool((pool ?? []).map(toRow));
    setPastWeeks((finalized ?? []).map(toRow));
    setPrizeDrafts(prev => {
      const next = { ...prev };
      for (const r of finalized ?? []) {
        if (!(r.id in next)) next[r.id] = r.prize_note ?? '';
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setPostLoginRedirect(window.location.pathname); window.location.href = '/login'; return; }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', u.user.id).single();
      if (!isDeveloperRole(profile?.role)) { setAllowed(false); setLoading(false); return; }

      setAllowed(true);
      await loadRankings();
      setLoading(false);
    };
    load();
  }, [loadRankings]);

  const handleSnapshot = async () => {
    setSnapshotting(true);
    setSnapshotMsg(null);
    const { error } = await supabase.rpc('snapshot_weekly_top20');
    if (error) { setSnapshotMsg(`Failed: ${error.message}`); setSnapshotting(false); return; }
    await loadRankings();
    setSnapshotMsg('This week\u2019s top 20 snapshotted.');
    setSnapshotting(false);
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    setFinalizeMsg(null);
    const { error } = await supabase.rpc('finalize_weekly_rankings');
    if (error) { setFinalizeMsg(`Failed: ${error.message}`); setFinalizing(false); return; }
    await loadRankings();
    setFinalizeMsg('Last week\u2019s scoring finalized \u2014 top 5 ranked.');
    setFinalizing(false);
  };

  const handleSavePrize = async (row: RankingRow) => {
    setSavingId(row.id);
    const note = (prizeDrafts[row.id] ?? '').trim() || null;
    const { error } = await supabase.from('weekly_rankings').update({ prize_note: note }).eq('id', row.id);
    if (error) { alert(`Failed to save: ${error.message}`); setSavingId(null); return; }
    setPastWeeks(prev => prev.map(r => r.id === row.id ? { ...r, prize_note: note } : r));
    setSavingId(null);
  };

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading\u2026</div>;
  }

  if (!allowed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-muted)' }}>
        <Lock size={28} strokeWidth={1.5} />
        <p style={{ fontSize: '14px', margin: 0 }}>You don&apos;t have access to this page.</p>
      </div>
    );
  }

  // Group past-weeks rows by week for display.
  const weeksGrouped = pastWeeks.reduce<Record<string, RankingRow[]>>((acc, r) => {
    (acc[r.week_start_date] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '32px 20px' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Trophy size={22} strokeWidth={2} color="#f59e0b" />
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>Mangal of the Week</h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px' }}>
          Snapshot the weekly top-20 pool, finalize scoring at week end, and set prize notes on the top 5.
        </p>

        {/* ── Snapshot this week ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px',
          padding: '16px 20px', marginBottom: '10px',
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '2px' }}>This week&apos;s top 20 ({currentWeekStart()})</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Pulls the top 20 approved videos by views into the voting pool. Safe to re-run \u2014 refreshes views/tier, doesn&apos;t touch votes already cast.
            </div>
          </div>
          <button
            onClick={handleSnapshot}
            disabled={snapshotting}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, padding: '9px 16px', borderRadius: '9px',
              fontSize: '12px', fontWeight: 700, cursor: snapshotting ? 'not-allowed' : 'pointer',
              background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b',
            }}
          >
            <Camera size={13} strokeWidth={2.5} />{snapshotting ? 'Snapshotting\u2026' : 'Snapshot top 20'}
          </button>
        </div>
        {snapshotMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px', fontSize: '12px', color: snapshotMsg.startsWith('Failed') ? '#ef4444' : '#10b981' }}>
            {!snapshotMsg.startsWith('Failed') && <CheckCircle2 size={13} strokeWidth={2} />}{snapshotMsg}
          </div>
        )}

        {currentPool.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '28px' }}>
            {currentPool.map(v => (
              <div key={v.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px',
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.video_title}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                  {v.tier === 1 && '\ud83e\udd1d '}{v.views_snapshot.toLocaleString('en-IN')} views \u00b7 {v.votes_count} votes
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Finalize last week ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px',
          padding: '16px 20px', marginBottom: '10px',
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '2px' }}>Finalize last week&apos;s scoring</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Scores + ranks the previous week (votes\u00d750 + ln(views+1)\u00d710 + ln(likes+1)\u00d72, +15% for Tier 1 collabs). Run once voting closes.
            </div>
          </div>
          <button
            onClick={handleFinalize}
            disabled={finalizing}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, padding: '9px 16px', borderRadius: '9px',
              fontSize: '12px', fontWeight: 700, cursor: finalizing ? 'not-allowed' : 'pointer',
              background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e',
            }}
          >
            <Crown size={13} strokeWidth={2.5} />{finalizing ? 'Finalizing\u2026' : 'Finalize last week'}
          </button>
        </div>
        {finalizeMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '28px', fontSize: '12px', color: finalizeMsg.startsWith('Failed') ? '#ef4444' : '#10b981' }}>
            {!finalizeMsg.startsWith('Failed') && <CheckCircle2 size={13} strokeWidth={2} />}{finalizeMsg}
          </div>
        )}

        {/* ── Past winners + prize notes ── */}
        <h2 style={{ fontSize: '14px', fontWeight: 800, margin: '0 0 12px' }}>Past winners &amp; prize notes</h2>
        {Object.keys(weeksGrouped).length === 0 ? (
          <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)' }}>No week finalized yet.</p>
        ) : (
          Object.entries(weeksGrouped).map(([week, rows]) => (
            <div key={week} style={{ marginBottom: '22px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-tertiary)', marginBottom: '8px' }}>Week of {week}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rows.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '11px',
                    background: 'var(--bg-card)', border: r.rank === 1 ? '1px solid rgba(245,158,11,0.4)' : '1px solid var(--border-color)',
                  }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: 900, color: r.rank === 1 ? '#fff' : 'var(--text-primary)',
                      background: r.rank === 1 ? '#f59e0b' : 'var(--bg-input)',
                    }}>{r.rank}</div>
                    <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.video_title}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>{r.votes_count} votes \u00b7 score {r.final_score.toFixed(1)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <IndianRupee size={12} strokeWidth={2.5} color="var(--text-tertiary)" />
                      <input
                        value={prizeDrafts[r.id] ?? ''}
                        onChange={e => setPrizeDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="e.g. 2,000 awarded"
                        style={{
                          width: '140px', padding: '6px 9px', borderRadius: '7px', fontSize: '11.5px',
                          background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                        }}
                      />
                      <button
                        onClick={() => handleSavePrize(r)}
                        disabled={savingId === r.id}
                        title="Save prize note"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '7px',
                          cursor: savingId === r.id ? 'not-allowed' : 'pointer',
                          background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e',
                        }}
                      ><Save size={13} strokeWidth={2.5} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
