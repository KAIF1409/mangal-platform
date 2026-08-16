'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { setPostLoginRedirect } from '../../lib/authRedirect';
import ThemeToggle from '../../components/ThemeToggle';
import { useKCircleTheme } from '../theme';
import { Trophy, ArrowLeft, Crown, IndianRupee } from 'lucide-react';

// ── K Circle — Mangal of the Week (CONTEXT.md §0, Phase 2) ──
// Voting UI for the weekly, audience-voted leaderboard: the top-20-by-views
// pool for the current week (snapshotted by an admin via
// snapshot_weekly_top20(), see /admin/mangal-of-the-week) shows here, a
// signed-in reader picks ONE video and tags why they liked it, then the
// admin runs finalize_weekly_rankings() at week end to score + rank.
// One vote per user per week is enforced at the DB level (unique
// (user_id, week_start_date) on video_votes) — this page just mirrors that
// so the UI never lets someone try a second time. Past winners (top 5 of
// the most recently finalized week) are read via get_mangal_of_the_week().

const REASON_TAGS = ['Editing', 'Sound', 'Story', 'Voice', 'Animation'] as const;

interface PoolVideo {
  video_id: string;
  title: string;
  youtube_id: string;
  views_snapshot: number;
  tier: number;
  username: string;
}

interface Winner {
  week_start_date: string;
  rank: number;
  video_id: string;
  video_title: string;
  youtube_id: string;
  views: number;
  votes_count: number;
  tier: number;
  prize_note: string | null;
  creator_username: string | null;
  collab_writer_username: string | null;
}

/** Monday of the current week, in the same shape Postgres'
 * date_trunc('week', now())::date produces server-side — this is a
 * display/lookup convenience only, the real source of truth for "which
 * week" a snapshot belongs to is whatever week_start_date the admin's
 * snapshot job actually wrote. */
function currentWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday));
  return monday.toISOString().slice(0, 10);
}

export default function MangalOfTheWeekPage() {
  const { setIsLight, themeVars, dataTheme } = useKCircleTheme();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [accountOldEnough, setAccountOldEnough] = useState(true);

  const [weekStart, setWeekStart] = useState('');
  const [pool, setPool] = useState<PoolVideo[]>([]);
  const [alreadyVoted, setAlreadyVoted] = useState<{ video_id: string } | null>(null);
  const [loadingPool, setLoadingPool] = useState(true);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [winners, setWinners] = useState<Winner[]>([]);
  const [loadingWinners, setLoadingWinners] = useState(true);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time auth check on mount, same pattern as ../broadcasts/page.tsx
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: profile } = await supabase.from('profiles').select('created_at').eq('id', uid).single();
        if (profile?.created_at) {
          const ageMs = Date.now() - new Date(profile.created_at).getTime();
          setAccountOldEnough(ageMs > 24 * 60 * 60 * 1000);
        }
      }
      setCheckedAuth(true);
      if (!uid) { setPostLoginRedirect('/kalpana-circle'); router.replace('/login?next=/kalpana-circle'); }
    });
  }, [router]);

  const loadPool = useCallback(async (uid: string) => {
    setLoadingPool(true);
    const week = currentWeekStart();
    setWeekStart(week);

    const [rankingsRes, myVoteRes] = await Promise.all([
      supabase.from('weekly_rankings')
        .select('video_id, tier, views_snapshot, videos!inner(title, youtube_id, creator_id)')
        .eq('week_start_date', week)
        .order('views_snapshot', { ascending: false }),
      supabase.from('video_votes').select('video_id').eq('user_id', uid).eq('week_start_date', week).maybeSingle(),
    ]);

    setAlreadyVoted(myVoteRes.data ?? null);

    const rows = rankingsRes.data ?? [];
    if (rows.length === 0) { setPool([]); setLoadingPool(false); return; }

    // Supabase's embedded-relation typing doesn't infer well through
    // `!inner`, so this is read as `any` and narrowed by hand below —
    // same pragmatic approach used elsewhere in this codebase for
    // similar joined-select shapes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedRows = rows as any[];
    const creatorIds = Array.from(new Set(typedRows.map(r => r.videos.creator_id).filter(Boolean)));
    const { data: profiles } = await supabase.from('creator_profiles').select('user_id, username').in('user_id', creatorIds);
    const usernameMap = new Map((profiles ?? []).map(p => [p.user_id, p.username]));

    setPool(typedRows.map(r => ({
      video_id: r.video_id,
      title: r.videos.title,
      youtube_id: r.videos.youtube_id,
      views_snapshot: r.views_snapshot,
      tier: r.tier,
      username: usernameMap.get(r.videos.creator_id) ?? 'dreamer',
    })));
    setLoadingPool(false);
  }, []);

  const loadWinners = useCallback(async () => {
    setLoadingWinners(true);
    const { data } = await supabase.rpc('get_mangal_of_the_week');
    setWinners((data ?? []) as Winner[]);
    setLoadingWinners(false);
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadPool(userId);
    loadWinners();
  }, [userId, loadPool, loadWinners]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleSubmit = async () => {
    if (!userId || !selectedVideoId) return;
    setSubmitting(true);
    setSubmitError(null);

    const { error } = await supabase.from('video_votes').insert({
      user_id: userId,
      video_id: selectedVideoId,
      week_start_date: weekStart,
      reason_tags: selectedTags,
      comment: comment.trim() || null,
    });

    if (error) {
      // The two real ways this fails: DB unique constraint (already voted —
      // shouldn't normally reach here since alreadyVoted gates the form,
      // but a second tab/race is possible) or the min-account-age trigger.
      setSubmitError(error.message);
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setAlreadyVoted({ video_id: selectedVideoId });
    setSubmitting(false);
  };

  if (!checkedAuth) return null;

  const votedVideo = alreadyVoted ? pool.find(p => p.video_id === alreadyVoted.video_id) : null;

  return (
    <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <style>{`
        .motw-header { padding: 20px 16px; }
        @media (min-width: 768px) { .motw-header { padding: 28px 24px 16px; } }
      `}</style>

      <div className="motw-header" style={{ maxWidth: '680px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <Link href="/kalpana-circle" style={{ textDecoration: 'none', color: 'var(--text-primary)', display: 'flex' }}><ArrowLeft size={18} strokeWidth={2} /></Link>
          <h1 style={{ fontSize: '17px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Trophy size={16} strokeWidth={2} color="#f59e0b" /> Mangal of the Week
          </h1>
          <div style={{ marginLeft: 'auto' }}>
            <ThemeToggle size={26} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
          </div>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 22px', paddingLeft: '30px' }}>
          Vote for this week&apos;s best KaTube video from the top 20 — one vote per week.
        </p>

        {/* ── Past winners ── */}
        <h2 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Crown size={13} strokeWidth={2.5} color="#f59e0b" /> Last week&apos;s Top 5
        </h2>
        {loadingWinners ? (
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '0 0 24px' }}>Loading…</p>
        ) : winners.length === 0 ? (
          <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', marginBottom: '26px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
              No week has been finalized yet — winners appear here once an admin scores the week.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '26px' }}>
            {winners.map(w => (
              <div key={w.video_id} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px',
                background: 'var(--bg-card)', border: w.rank === 1 ? '1px solid rgba(245,158,11,0.4)' : '1px solid var(--border-color)',
              }}>
                <div style={{
                  width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 900, color: w.rank === 1 ? '#fff' : 'var(--text-primary)',
                  background: w.rank === 1 ? '#f59e0b' : 'var(--bg-input)',
                }}>{w.rank}</div>
                {/* eslint-disable-next-line @next/next/no-img-element -- YouTube CDN thumbnail, same pattern used across KaTube */}
                <img src={`https://img.youtube.com/vi/${w.youtube_id}/hqdefault.jpg`} alt="" style={{ width: '56px', height: '32px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.video_title}</div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                    by @{w.creator_username ?? 'dreamer'}
                    {w.tier === 1 && w.collab_writer_username && <> · collab with @{w.collab_writer_username}</>}
                    {' · '}{w.votes_count} votes
                  </div>
                </div>
                {w.prize_note && (
                  <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#22c55e', display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                    <IndianRupee size={10} strokeWidth={2.5} />{w.prize_note}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Voting ── */}
        <h2 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 10px' }}>This week&apos;s Top 20</h2>

        {!accountOldEnough ? (
          <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
              Your account needs to be at least 24 hours old to vote — this keeps the leaderboard genuine. Come back soon!
            </p>
          </div>
        ) : loadingPool ? (
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Loading this week&apos;s pool…</p>
        ) : pool.length === 0 ? (
          <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
              This week&apos;s Top 20 hasn&apos;t been snapshotted yet — check back soon.
            </p>
          </div>
        ) : votedVideo || submitted ? (
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <p style={{ fontSize: '12.5px', color: '#22c55e', margin: 0, fontWeight: 700 }}>
              ✓ You voted for &quot;{votedVideo?.title ?? 'this video'}&quot; this week. Come back next week to vote again.
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              {pool.map(v => (
                <button
                  key={v.video_id}
                  onClick={() => setSelectedVideoId(v.video_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '11px',
                    background: selectedVideoId === v.video_id ? 'rgba(245,158,11,0.10)' : 'var(--bg-card)',
                    border: selectedVideoId === v.video_id ? '1px solid rgba(245,158,11,0.5)' : '1px solid var(--border-color)',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- YouTube CDN thumbnail */}
                  <img src={`https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg`} alt="" style={{ width: '52px', height: '30px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                      @{v.username}{v.tier === 1 && ' · 🤝 collab'} · {v.views_snapshot.toLocaleString('en-IN')} views
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {selectedVideoId && (
              <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: '8px' }}>Why? (optional)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                  {REASON_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      style={{
                        padding: '5px 12px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer',
                        background: selectedTags.includes(tag) ? '#f59e0b' : 'var(--bg-input)',
                        border: selectedTags.includes(tag) ? '1px solid #f59e0b' : '1px solid var(--border-color)',
                        color: selectedTags.includes(tag) ? '#27272a' : 'var(--text-secondary)',
                      }}
                    >{tag}</button>
                  ))}
                </div>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={2}
                  placeholder="e.g. story mast hai aur editing bhi zabardast"
                  style={{
                    width: '100%', padding: '9px 11px', borderRadius: '9px', resize: 'vertical', marginBottom: '12px',
                    background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '12.5px', fontFamily: 'inherit',
                  }}
                />
                {submitError && (
                  <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '11.5px', marginBottom: '10px' }}>
                    {submitError}
                  </div>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '9px',
                    fontSize: '12.5px', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer',
                    background: '#f59e0b', border: 'none', color: '#27272a', opacity: submitting ? 0.7 : 1,
                  }}
                >
                  <Trophy size={13} strokeWidth={2.5} />{submitting ? 'Voting…' : 'Cast my vote'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
