'use client';

import { useState, useEffect, use } from 'react';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import ProfileMenu from '../../components/ProfileMenu';
import ReportButton from '../../components/ReportButton';
import ShareButton from '../../components/ShareButton';
import { canManageSeries, isDeveloperRole } from '../../lib/roles';
import { estimateReadTime } from '../../lib/novelEditor';
import Link from 'next/link';
import ThemeToggle from '../../components/ThemeToggle';

interface Series {
  id: string;
  title: string;
  synopsis: string;
  genre: string | null;
  language: string | null;
  cover_url: string | null;
  reading_mode: 'scroll' | 'page';
  creator_id: string;
  status: string;
  views: number;
  // Step 12 — Series Status & Completion Badge. Optional so this page still
  // works before the migration runs; defaults to 'ongoing' once it does.
  completion_status?: 'ongoing' | 'completed' | 'hiatus';
  // Step 21 — Dual Content Mode: mangal (comic) or novel
  content_type: 'mangal' | 'novel';
}

interface Chapter {
  id: string;
  chapter_number: number;
  title: string;
  created_at: string;
  // Step 21 — populated for novel chapters only; null/undefined for manga
  word_count?: number | null;
}

interface Progress {
  chapter_id: string;
  page_number: number;
}

function SeriesDetailPage({ seriesId }: { seriesId: string }) {
  const [series, setSeries] = useState<Series | null>(null);
  const [creatorUsername, setCreatorUsername] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  // Bug fix: whole-series delete was only reachable from the owner's own
  // Dashboard (query scoped to creator_id === current user), so a developer
  // account had no direct way to remove someone else's series — the only
  // path was Report -> Admin Reports -> Remove. This button gives
  // developers (and the owning creator) a direct delete right here.
  const [confirmDeleteSeries, setConfirmDeleteSeries] = useState(false);
  const [deletingSeries, setDeletingSeries] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followCount, setFollowCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [viewCount, setViewCount] = useState(0);

  // Step 6 — Star Rating
  const [myRating, setMyRating] = useState<number | null>(null);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(0);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  // Step 25 — Tags system
  const [tags, setTags] = useState<{ id: string; name: string; slug: string }[]>([]);

  // Step 26 — Written Reviews
  interface Review {
    id: string;
    reader_id: string;
    stars: number;
    review_title: string | null;
    review_text: string | null;
    created_at: string;
    full_name: string;
    helpful_count: number;
  }
  interface ReviewQueryRow {
    id: string;
    reader_id: string;
    stars: number;
    review_title: string | null;
    review_text: string | null;
    created_at: string;
    profiles: { full_name: string | null }[] | { full_name: string | null } | null;
    review_helpful_votes: { count: number }[] | { count: number } | null;
  }
  const [reviews, setReviews] = useState<Review[]>([]);
  const [myVotedHelpful, setMyVotedHelpful] = useState<Set<string>>(new Set());
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Step 27 — Recommendations
  const [relatedSeries, setRelatedSeries] = useState<Series[]>([]);

  // Pulled out of the main load() below so it can also be called on its own
  // whenever the tab/page becomes visible again (see effect below) — we only
  // want to refresh the chapter list itself in that case, not redo the view
  // count increment, follow status, or rating fetch every time someone tabs
  // back in.
  const fetchChapters = async () => {
    const { data: c } = await supabase
      .from('chapters').select('id, chapter_number, title, created_at, word_count')
      .eq('series_id', seriesId).order('chapter_number', { ascending: true });
    return c;
  };

  useEffect(() => {
    const load = async () => {
      const { data: s } = await supabase.from('series').select('*').eq('id', seriesId).single();
      if (s) {
        setSeries(s);
        setViewCount(s.views ?? 0);

        // Step 13 — Public Creator Profile: fetch the creator's username so the
        // hero can link to /creator/[username]. Separate query since series has
        // no username column itself, same pattern as the search page.
        const { data: creatorRow } = await supabase
          .from('creator_profiles')
          .select('username')
          .eq('user_id', s.creator_id)
          .single();
        if (creatorRow) setCreatorUsername(creatorRow.username);

        // Step 25 — Tags: joined through series_tags. Table may not exist yet
        // on older deployments before the migration runs, so fail silently.
        const { data: tagRows } = await supabase
          .from('series_tags')
          .select('tags(id, name, slug)')
          .eq('series_id', seriesId);
        if (tagRows) {
          const flat = tagRows
            .map((r: { tags: { id: string; name: string; slug: string }[] | { id: string; name: string; slug: string } | null }) => (Array.isArray(r.tags) ? r.tags[0] : r.tags))
            .filter((tag): tag is { id: string; name: string; slug: string } => !!tag);
          setTags(flat);
        }
      }

      // Step 7 — view count: once per visitor per series per day (industry-standard
      // anti-spam pattern, same idea as YouTube/Webtoon). Guarded via localStorage so
      // refreshes, re-renders, and repeat same-day visits don't inflate the number.
      // Routed through /api/log-view (instead of calling the RPC directly from the
      // browser) so the server can read Vercel's edge geo header and record which
      // country the view came from — used by creator Audience Insights.
      try {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const storageKey = `viewed:${seriesId}:${today}`;
        if (!localStorage.getItem(storageKey)) {
          localStorage.setItem(storageKey, '1');
          const res = await fetch('/api/log-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seriesId }),
          });
          if (res.ok) {
            setViewCount(c => c + 1);
          }
        }
      } catch {
        // localStorage unavailable (private browsing, etc.) — skip incrementing silently
      }

      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        setUser(u.user);

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', u.user.id)
          .single();

        const owns = !!(s && u.user.id === s.creator_id);
        setIsCreator(canManageSeries(profile?.role, owns));
        setIsDeveloper(isDeveloperRole(profile?.role));

        const { data: existingFollow } = await supabase
          .from('follows')
          .select('id')
          .eq('reader_id', u.user.id)
          .eq('series_id', seriesId)
          .maybeSingle();
        setIsFollowing(!!existingFollow);

        const { data: prog } = await supabase
          .from('reading_progress')
          .select('chapter_id, page_number')
          .eq('reader_id', u.user.id)
          .eq('series_id', seriesId)
          .maybeSingle();
        if (prog) setProgress(prog);

        const { data: myR } = await supabase
          .from('ratings')
          .select('stars, review_title, review_text')
          .eq('series_id', seriesId)
          .eq('reader_id', u.user.id)
          .maybeSingle();
        if (myR) {
          setMyRating(myR.stars);
          setReviewTitle(myR.review_title ?? '');
          setReviewText(myR.review_text ?? '');
        }

        // Step 26 — which reviews this reader has already marked helpful
        const { data: voteRows } = await supabase
          .from('review_helpful_votes')
          .select('rating_id')
          .eq('voter_id', u.user.id);
        if (voteRows) setMyVotedHelpful(new Set(voteRows.map((v: { rating_id: string }) => v.rating_id)));
      }

      const { count } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('series_id', seriesId);
      setFollowCount(count ?? 0);

      const { data: allRatings } = await supabase
        .from('ratings')
        .select('stars')
        .eq('series_id', seriesId);
      if (allRatings && allRatings.length > 0) {
        setRatingCount(allRatings.length);
        const avg = allRatings.reduce((sum, r) => sum + r.stars, 0) / allRatings.length;
        setAvgRating(Math.round(avg * 10) / 10);
      }

      // Step 26 — Written reviews: only rows with actual review text, newest
      // first. Helpful count via embedded aggregate, same no-N+1 pattern used
      // for chapter counts and tag counts elsewhere.
      const { data: reviewRows } = await supabase
        .from('ratings')
        .select('id, reader_id, stars, review_title, review_text, created_at, profiles(full_name), review_helpful_votes(count)')
        .eq('series_id', seriesId)
        .not('review_text', 'is', null)
        .order('created_at', { ascending: false });
      if (reviewRows) {
        const mapped: Review[] = reviewRows.map((r: ReviewQueryRow) => ({
          id: r.id,
          reader_id: r.reader_id,
          stars: r.stars,
          review_title: r.review_title,
          review_text: r.review_text,
          created_at: r.created_at,
          full_name: (Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name) || 'Reader',
          helpful_count: Array.isArray(r.review_helpful_votes) ? (r.review_helpful_votes[0]?.count ?? 0) : 0,
        }));
        setReviews(mapped);
      }

      const c = await fetchChapters();
      if (c) setChapters(c);

      // Step 27 — Readers Also Liked
      const { data: related } = await supabase.rpc('related_series', { target_series_id: seriesId, result_limit: 6 });
      if (related) setRelatedSeries(related as Series[]);

      setLoading(false);
    };
    load();
  }, [seriesId]);

  // Bug fix — creators editing a chapter (title, pages, etc.) from this same
  // browser, then navigating back here via the browser's back button or a
  // new tab, were seeing stale chapter data because this page only fetched
  // once on mount. Refetch the chapter list whenever the tab regains focus
  // or becomes visible again, so edits made elsewhere actually show up
  // without requiring a manual hard refresh.
  useEffect(() => {
    const refresh = async () => {
      const c = await fetchChapters();
      if (c) setChapters(c);
    };
    const handleVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refresh);
    };
  }, [seriesId]);

  const toggleFollow = async () => {
    if (!user) { window.location.assign('/login'); return; }
    if (followLoading) return;
    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('reader_id', user.id).eq('series_id', seriesId);
      setIsFollowing(false);
      setFollowCount(c => Math.max(0, c - 1));
    } else {
      await supabase.from('follows').insert({ reader_id: user.id, series_id: seriesId });
      setIsFollowing(true);
      setFollowCount(c => c + 1);
    }
    setFollowLoading(false);
  };

  const handleRate = async (stars: number) => {
    if (!user) { window.location.assign('/login'); return; }
    if (ratingLoading) return;
    setRatingLoading(true);
    const prev = myRating;
    setMyRating(stars);
    const { error } = await supabase
      .from('ratings')
      .upsert({ series_id: seriesId, reader_id: user.id, stars }, { onConflict: 'series_id,reader_id' });
    if (error) {
      setMyRating(prev);
    } else {
      const { data: allRatings } = await supabase.from('ratings').select('stars').eq('series_id', seriesId);
      if (allRatings && allRatings.length > 0) {
        setRatingCount(allRatings.length);
        setAvgRating(Math.round((allRatings.reduce((s, r) => s + r.stars, 0) / allRatings.length) * 10) / 10);
      }
    }
    setRatingLoading(false);
  };

  // Step 26 — Written Reviews
  const submitReview = async () => {
    if (!user) { window.location.assign('/login'); return; }
    if (!myRating) return; // must rate before/along with reviewing
    if (reviewSubmitting) return;
    setReviewSubmitting(true);
    const { error } = await supabase
      .from('ratings')
      .upsert({
        series_id: seriesId,
        reader_id: user.id,
        stars: myRating,
        review_title: reviewTitle.trim() || null,
        review_text: reviewText.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'series_id,reader_id' });
    setReviewSubmitting(false);
    if (!error) {
      setShowReviewForm(false);
      const { data: reviewRows } = await supabase
        .from('ratings')
        .select('id, reader_id, stars, review_title, review_text, created_at, profiles(full_name), review_helpful_votes(count)')
        .eq('series_id', seriesId)
        .not('review_text', 'is', null)
        .order('created_at', { ascending: false });
      if (reviewRows) {
        const mapped: Review[] = reviewRows.map((r: ReviewQueryRow) => ({
          id: r.id,
          reader_id: r.reader_id,
          stars: r.stars,
          review_title: r.review_title,
          review_text: r.review_text,
          created_at: r.created_at,
          full_name: (Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name) || 'Reader',
          helpful_count: Array.isArray(r.review_helpful_votes) ? (r.review_helpful_votes[0]?.count ?? 0) : 0,
        }));
        setReviews(mapped);
      }
    }
  };

  const toggleHelpful = async (reviewId: string) => {
    if (!user) { window.location.assign('/login'); return; }
    const alreadyVoted = myVotedHelpful.has(reviewId);
    setMyVotedHelpful(prev => {
      const next = new Set(prev);
      if (alreadyVoted) next.delete(reviewId); else next.add(reviewId);
      return next;
    });
    setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, helpful_count: r.helpful_count + (alreadyVoted ? -1 : 1) } : r));
    if (alreadyVoted) {
      await supabase.from('review_helpful_votes').delete().eq('rating_id', reviewId).eq('voter_id', user.id);
    } else {
      await supabase.from('review_helpful_votes').insert({ rating_id: reviewId, voter_id: user.id });
    }
  };

  const [sortDesc, setSortDesc] = useState(false);
  const displayedChapters = sortDesc ? [...chapters].reverse() : chapters;

  // Creator-only: delete a chapter (and its child rows) from the series.
  // Explicit child-table deletes first, since we don't know for certain
  // whether ON DELETE CASCADE is configured in Supabase for these — safe
  // either way: if cascade IS set up, these deletes just no-op on an
  // already-empty set before the chapter delete runs.
  const handleDeleteChapter = async (chapterId: string) => {
    // pages (manga) — also remove the actual files from storage so they
    // don't sit around as orphaned objects in the manga-pages bucket
    const { data: pageRows } = await supabase
      .from('pages')
      .select('id, image_url')
      .eq('chapter_id', chapterId);

    if (pageRows && pageRows.length > 0) {
      const paths = pageRows
        .map(p => {
          // image_url is a public URL like .../object/public/manga-pages/<path>
          const marker = '/manga-pages/';
          const idx = p.image_url.indexOf(marker);
          return idx === -1 ? null : p.image_url.slice(idx + marker.length);
        })
        .filter((p): p is string => !!p);
      if (paths.length > 0) {
        await supabase.storage.from('manga-pages').remove(paths);
      }
      await supabase.from('pages').delete().eq('chapter_id', chapterId);
    }

    // reading_progress, reactions, comments — comments first (replies
    // reference parent comments via parent_id within the same table, so
    // deleting all rows for the chapter at once handles both levels together)
    await supabase.from('reading_progress').delete().eq('chapter_id', chapterId);
    await supabase.from('reactions').delete().eq('chapter_id', chapterId);
    await supabase.from('comments').delete().eq('chapter_id', chapterId);

    const { error } = await supabase.from('chapters').delete().eq('id', chapterId);
    if (error) {
      alert(`Could not delete chapter: ${error.message}`);
      return;
    }

    setChapters(prev => prev.filter(c => c.id !== chapterId));
  };

  // Whole-series delete (see confirmDeleteSeries state comment above).
  // Cleans up every chapter's child rows first (reusing the same steps as
  // handleDeleteChapter), then the chapters, then the series row itself.
  const handleDeleteSeries = async () => {
    if (!series) return;
    setDeletingSeries(true);
    try {
      for (const ch of chapters) {
        const { data: pageRows } = await supabase
          .from('pages')
          .select('id, image_url')
          .eq('chapter_id', ch.id);

        if (pageRows && pageRows.length > 0) {
          const paths = pageRows
            .map(p => {
              const marker = '/manga-pages/';
              const idx = p.image_url.indexOf(marker);
              return idx === -1 ? null : p.image_url.slice(idx + marker.length);
            })
            .filter((p): p is string => !!p);
          if (paths.length > 0) {
            await supabase.storage.from('manga-pages').remove(paths);
          }
          await supabase.from('pages').delete().eq('chapter_id', ch.id);
        }

        await supabase.from('reading_progress').delete().eq('chapter_id', ch.id);
        await supabase.from('reactions').delete().eq('chapter_id', ch.id);
        await supabase.from('comments').delete().eq('chapter_id', ch.id);
      }

      if (chapters.length > 0) {
        await supabase.from('chapters').delete().eq('series_id', series.id);
      }

      // Series-level related rows
      await supabase.from('follows').delete().eq('series_id', series.id);
      await supabase.from('ratings').delete().eq('series_id', series.id);

      const { error } = await supabase.from('series').delete().eq('id', series.id);
      if (error) throw error;

      window.location.assign('/dashboard');
    } catch (err) {
      alert(`Could not delete series: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setDeletingSeries(false);
      setConfirmDeleteSeries(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📖</div>
        <div>Loading series...</div>
      </div>
    </div>
  );

  if (!series) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>😔</div>
        <div>Series not found.</div>
        <Link href="/" style={{ color: '#d97706', textDecoration: 'none', fontSize: '13px', marginTop: '8px', display: 'block' }}>← Back to Browse</Link>
      </div>
    </div>
  );

  const firstChapter = chapters[0];
  const latestChapter = chapters[chapters.length - 1];
  const progressChapter = progress ? chapters.find(c => c.id === progress.chapter_id) : null;
  const displayStars = hoverRating ?? myRating ?? 0;
  // Step 21 — Dual Content Mode: novels don't have a scroll/page reading mode
  const isNovel = series.content_type === 'novel';

  // Step 7 — format large view numbers nicely
  const formatViews = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 24px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>🔥</div>
            <span style={{ fontWeight: 900, fontSize: '17px', color: 'var(--text-primary)' }}>MANGAL</span>
          </Link>
          <span style={{ color: 'var(--text-faint)' }}>›</span>
          <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{series.title}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <ThemeToggle size={30} />
          <Link href="/" style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'none', border: '1px solid var(--border-color)' }}>Browse</Link>
          {isCreator && (
            <a href={`/upload?seriesId=${series.id}`} style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: 'linear-gradient(135deg, #7f1d1d, #991b1b)', color: '#fff', textDecoration: 'none' }}>
              + Add Chapter
            </a>
          )}
          {user ? (
            <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />
          ) : (
            <a href="/login" style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: 'linear-gradient(135deg, #7f1d1d, #991b1b)', color: '#fff', textDecoration: 'none' }}>Log in</a>
          )}
        </div>
      </nav>

      {/* ── HERO BANNER ── */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {series.cover_url && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${series.cover_url})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(40px) brightness(0.15)',
            transform: 'scale(1.1)',
          }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(7,7,10,0.45), #0d0d10 90%)' }} />

        <div style={{ position: 'relative', maxWidth: '1000px', margin: '0 auto', padding: '48px 24px 40px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          {/* Cover */}
          <div style={{
            width: '200px', flexShrink: 0, borderRadius: '14px', overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.16)', aspectRatio: '3/4',
            background: '#1a0a0a', position: 'relative',
          }}>
            {series.cover_url ? (
              <Image src={series.cover_url} alt={series.title} fill sizes="200px" style={{ objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>📜</div>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {series.genre && (
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#d97706', background: 'rgba(120,53,15,0.25)', border: '1px solid rgba(180,83,9,0.4)', padding: '4px 12px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {series.genre}
                </span>
              )}
              {series.language && (
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#c3c7cf', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', padding: '4px 12px', borderRadius: '20px' }}>
                  {series.language}
                </span>
              )}
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px',
                border: isNovel ? '1px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.16)',
                background: isNovel ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.08)',
                color: isNovel ? '#a78bfa' : '#c3c7cf',
              }}>
                {isNovel ? '📕 Novel' : (series.reading_mode === 'scroll' ? '📜 Webtoon' : '📖 Mangal')}
              </span>
              {/* Step 12 — Series Status & Completion Badge (read-only here; creators
                  change it from the Dashboard). Hidden until the migration runs and
                  the column exists on real data. */}
              {series.completion_status && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  fontSize: '10px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px',
                  border: `1px solid ${
                    series.completion_status === 'completed' ? 'rgba(16,185,129,0.4)' :
                    series.completion_status === 'hiatus' ? 'rgba(107,114,128,0.4)' : 'rgba(217,119,6,0.4)'
                  }`,
                  background:
                    series.completion_status === 'completed' ? 'rgba(16,185,129,0.15)' :
                    series.completion_status === 'hiatus' ? 'rgba(107,114,128,0.15)' : 'rgba(217,119,6,0.15)',
                  color:
                    series.completion_status === 'completed' ? '#10b981' :
                    series.completion_status === 'hiatus' ? '#c3c7cf' : '#d97706',
                }}>
                  {series.completion_status === 'completed' && '✓ Completed'}
                  {series.completion_status === 'hiatus' && '⏸ On Hiatus'}
                  {series.completion_status === 'ongoing' && '● Ongoing'}
                </span>
              )}
            </div>

            <h1 style={{ fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.02em', lineHeight: 1.1, color: '#f9fafb' }}>
              {series.title}
            </h1>
            {/* Step 13 — Public Creator Profile: links to /creator/[username] */}
            {creatorUsername && (
              <a href={`/creator/${creatorUsername}`} style={{
                fontSize: '13px', color: '#9aa0ab', textDecoration: 'none',
                display: 'inline-block', marginBottom: '14px',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = '#d97706'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = '#9aa0ab'; }}
              >
                by @{creatorUsername}
              </a>
            )}
            <p style={{ fontSize: '14px', color: '#c3c7cf', lineHeight: 1.7, margin: '0 0 16px', maxWidth: '540px' }}>
              {series.synopsis}
            </p>

            {/* Step 25 — Tag chips, clickable through to /tags/[slug] browse page */}
            {tags.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '24px' }}>
                {tags.map(tag => (
                  <a
                    key={tag.id}
                    href={`/tags/${tag.slug}`}
                    style={{
                      fontSize: '10px', fontWeight: 600, color: '#c3c7cf',
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
                      padding: '4px 10px', borderRadius: '20px', textDecoration: 'none',
                      transition: 'color 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#d97706'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(217,119,6,0.4)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#c3c7cf'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.16)'; }}
                  >
                    #{tag.name}
                  </a>
                ))}
              </div>
            )}

            {/* Stats row */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#f9fafb' }}>{chapters.length}</div>
                <div style={{ fontSize: '10px', color: '#8a8f99', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Chapters</div>
              </div>
              {latestChapter && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#f9fafb' }}>Ch.{latestChapter.chapter_number}</div>
                  <div style={{ fontSize: '10px', color: '#8a8f99', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Latest</div>
                </div>
              )}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#f9fafb' }}>{followCount}</div>
                <div style={{ fontSize: '10px', color: '#8a8f99', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Followers</div>
              </div>

              {/* Step 7 — View count */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#f9fafb' }}>{formatViews(viewCount)}</div>
                <div style={{ fontSize: '10px', color: '#8a8f99', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Views</div>
              </div>

              {/* Step 6 — Star Rating */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => handleRate(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(null)}
                      disabled={ratingLoading}
                      title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                      style={{
                        background: 'none', border: 'none', cursor: ratingLoading ? 'wait' : 'pointer',
                        fontSize: '20px', padding: '2px', lineHeight: 1,
                        color: star <= displayStars ? '#d97706' : 'rgba(255,255,255,0.16)',
                        transition: 'color 0.1s, transform 0.1s',
                        transform: star <= displayStars ? 'scale(1.15)' : 'scale(1)',
                        opacity: ratingLoading ? 0.5 : 1,
                      }}
                    >★</button>
                  ))}
                </div>
                <div style={{ fontSize: '10px', color: '#8a8f99', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>
                  {avgRating !== null
                    ? <span><span style={{ color: '#d97706', fontWeight: 700 }}>{avgRating}</span> / 5 ({ratingCount})</span>
                    : 'Rate this'}
                </div>
              </div>
            </div>

            {/* CTA buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {progressChapter ? (
                <a href={`/read/${progressChapter.id}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '10px', fontWeight: 800, fontSize: '14px',
                  background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
                  color: '#fff', textDecoration: 'none',
                  boxShadow: '0 4px 20px rgba(217,119,6,0.3)',
                }}>
                  ▶ Continue Reading → Ch.{progressChapter.chapter_number}
                </a>
              ) : firstChapter && (
                <a href={`/read/${firstChapter.id}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '10px', fontWeight: 800, fontSize: '14px',
                  background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
                  color: '#fff', textDecoration: 'none',
                  boxShadow: '0 4px 20px rgba(217,119,6,0.3)',
                }}>
                  ▶ Start Reading
                </a>
              )}
              {progressChapter && firstChapter && (
                <a href={`/read/${firstChapter.id}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
                  color: '#c3c7cf', textDecoration: 'none',
                }}>
                  ↺ Start From Beginning
                </a>
              )}
              {latestChapter && latestChapter.id !== firstChapter?.id && latestChapter.id !== progressChapter?.id && (
                <a href={`/read/${latestChapter.id}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
                  color: '#c3c7cf', textDecoration: 'none',
                }}>
                  ⚡ Latest Chapter
                </a>
              )}
              {!isCreator && (
                <button
                  onClick={toggleFollow}
                  disabled={followLoading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                    cursor: followLoading ? 'wait' : 'pointer',
                    border: isFollowing ? '1px solid rgba(217,119,6,0.5)' : '1px solid rgba(255,255,255,0.16)',
                    background: isFollowing ? 'rgba(217,119,6,0.12)' : 'rgba(255,255,255,0.08)',
                    color: isFollowing ? '#d97706' : '#c3c7cf',
                    transition: 'all 0.2s',
                  }}
                >
                  {followLoading ? '...' : isFollowing ? '🔔 Following' : '🔔 Follow'}
                </button>
              )}
              {isCreator && (
                <a href={`/upload?seriesId=${series.id}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                  background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)',
                  color: '#d97706', textDecoration: 'none',
                }}>
                  + Add Chapter
                </a>
              )}
              {isCreator && (
                confirmDeleteSeries ? (
                  <div style={{ display: 'inline-flex', gap: '6px' }}>
                    <button
                      onClick={handleDeleteSeries}
                      disabled={deletingSeries}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '12px 18px', borderRadius: '10px', fontWeight: 800, fontSize: '13px',
                        background: '#7f1d1d', border: '1px solid #991b1b', color: '#fff',
                        cursor: deletingSeries ? 'wait' : 'pointer', opacity: deletingSeries ? 0.7 : 1,
                      }}
                    >
                      {deletingSeries ? 'Deleting...' : '⚠️ Confirm Delete Series'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteSeries(false)}
                      disabled={deletingSeries}
                      style={{
                        padding: '12px 16px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', color: '#c3c7cf', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteSeries(true)}
                    title="Delete this entire series"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                      background: 'rgba(153,27,27,0.1)', border: '1px solid rgba(153,27,27,0.3)',
                      color: '#ef4444', cursor: 'pointer',
                    }}
                  >
                    🗑️ Delete Series
                  </button>
                )
              )}
              {/* Step 11 — WhatsApp Share */}
              <ShareButton title={series.title} url={typeof window !== 'undefined' ? window.location.href : ''} />
            </div>

            {/* Step 8 — Report button (legal requirement) */}
            <div style={{ marginTop: '12px' }}>
              <ReportButton targetType="series" targetId={series.id} variant="text" />
            </div>
          </div>
        </div>
      </div>

      {/* ── CHAPTER LIST ── */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
            📚 {chapters.length} Chapter{chapters.length !== 1 ? 's' : ''}
          </h2>
          <button
            onClick={() => setSortDesc(d => !d)}
            style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            {sortDesc ? '↓ Newest First' : '↑ Oldest First'}
          </button>
        </div>

        {chapters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>No chapters published yet. Check back soon!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {displayedChapters.map((ch, idx) => (
              <ChapterRow
                key={ch.id}
                chapter={ch}
                isNew={idx === 0 && sortDesc}
                isNovel={isNovel}
                isCreator={isCreator}
                seriesId={series.id}
                onDelete={handleDeleteChapter}
              />
            ))}
          </div>
        )}

        {/* ── STEP 27 — READERS ALSO LIKED ── */}
        {relatedSeries.length > 0 && (
          <section style={{ padding: '40px 0 0' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px', color: 'var(--text-primary)' }}>
              Readers Also Liked
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
              {relatedSeries.map(rs => <RelatedCard key={rs.id} series={rs} />)}
            </div>
          </section>
        )}

        {/* ── STEP 26 — WRITTEN REVIEWS ── */}
        <section style={{ padding: '48px 0 40px', borderTop: '1px solid var(--border-color)', marginTop: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '10px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Reviews {reviews.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({reviews.length})</span>}
            </h2>
            {user && !showReviewForm && (
              <button
                onClick={() => { if (!myRating) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } setShowReviewForm(true); }}
                style={{
                  padding: '9px 18px', borderRadius: '10px', border: '1px solid var(--border-color)',
                  background: 'var(--bg-card)', color: '#d97706', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                {myRating && reviews.some(r => r.reader_id === user.id) ? '✏️ Edit Your Review' : '✍️ Write a Review'}
              </button>
            )}
          </div>

          {!myRating && user && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Rate the series above (★) before writing a review.
            </p>
          )}

          {showReviewForm && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px', marginBottom: '24px' }}>
              <input
                type="text"
                value={reviewTitle}
                onChange={e => setReviewTitle(e.target.value)}
                placeholder="Review title (optional)"
                maxLength={100}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: '10px', marginBottom: '10px',
                  background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-primary)',
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit',
                }}
              />
              <textarea
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                placeholder="What did you think of this series?"
                rows={4}
                maxLength={2000}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: '10px',
                  background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-primary)',
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit', resize: 'vertical' as const,
                }}
              />
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  onClick={() => setShowReviewForm(false)}
                  style={{ padding: '10px 18px', borderRadius: '10px', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >Cancel</button>
                <button
                  onClick={submitReview}
                  disabled={reviewSubmitting}
                  style={{
                    padding: '10px 20px', borderRadius: '10px', border: 'none',
                    background: reviewSubmitting ? 'var(--border-color)' : 'linear-gradient(135deg, #7f1d1d, #d97706)',
                    color: 'var(--text-primary)', fontSize: '12px', fontWeight: 700, cursor: reviewSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >{reviewSubmitting ? 'Posting...' : 'Post Review'}</button>
              </div>
            </div>
          )}

          {reviews.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>
              No written reviews yet — be the first to share your thoughts.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {reviews.map(review => (
                <div key={review.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap' as const, gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{review.full_name}</span>
                      <span style={{ display: 'flex', gap: '1px' }}>
                        {[1, 2, 3, 4, 5].map(s => (
                          <span key={s} style={{ fontSize: '11px', color: s <= review.stars ? '#d97706' : 'var(--border-color)' }}>★</span>
                        ))}
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {review.review_title && (
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>{review.review_title}</div>
                  )}
                  {review.review_text && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px' }}>{review.review_text}</p>
                  )}
                  <button
                    onClick={() => toggleHelpful(review.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '5px 12px', borderRadius: '8px', cursor: 'pointer',
                      border: myVotedHelpful.has(review.id) ? '1px solid rgba(217,119,6,0.4)' : '1px solid var(--border-color)',
                      background: myVotedHelpful.has(review.id) ? 'rgba(217,119,6,0.1)' : 'transparent',
                      color: myVotedHelpful.has(review.id) ? '#d97706' : 'var(--text-tertiary)',
                      fontSize: '11px', fontWeight: 700,
                    }}
                  >
                    👍 Helpful{review.helpful_count > 0 ? ` (${review.helpful_count})` : ''}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid var(--footer-border)', background: 'var(--footer-bg)', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '12px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>🔥</div>
          <span style={{ fontWeight: 900, fontSize: '16px', color: 'var(--footer-text)' }}>MANGAL</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--footer-text-muted)', margin: '0 0 14px' }}>Made with ❤️ in India · Free to read, forever.</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {[
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Terms of Service', href: '/terms' },
            { label: 'Grievance Officer', href: '/grievance' },
          ].map(link => (
            <a key={link.href} href={link.href} style={{ fontSize: '11px', color: 'var(--footer-link)', textDecoration: 'none' }}>
              {link.label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}

function ChapterRow({
  chapter, isNew, isNovel, isCreator, seriesId, onDelete,
}: {
  chapter: Chapter;
  isNew: boolean;
  isNovel: boolean;
  isCreator: boolean;
  seriesId: string;
  onDelete: (chapterId: string) => Promise<void>;
}) {
  const [hovered, setHovered] = useState(false);
  // Two-click confirm delete — same pattern as admin/reports' Remove
  // Content / Ban User actions (Step 20): first click shows a "Confirm"
  // button, second click actually deletes; a Cancel button is always
  // available to back out without deleting anything.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    await onDelete(chapter.id);
    // No need to reset deleting/confirmingDelete — this row unmounts once
    // the parent removes the chapter from its list.
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        background: hovered ? 'rgba(217,119,6,0.08)' : 'var(--bg-card)',
        border: `1px solid ${hovered ? 'rgba(217,119,6,0.3)' : 'var(--border-color)'}`,
        borderRadius: '10px',
        transition: 'all 0.15s',
        gap: '12px',
      }}
    >
      <a
        href={`/read/${chapter.id}`}
        style={{
          display: 'flex', alignItems: 'center', gap: '14px',
          textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0,
        }}
      >
        <span style={{
          width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
          background: hovered ? 'rgba(217,119,6,0.15)' : 'var(--bg-input)',
          border: `1px solid ${hovered ? 'rgba(217,119,6,0.3)' : 'var(--border-color)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 800,
          color: hovered ? '#d97706' : 'var(--text-muted)',
          transition: 'all 0.15s',
        }}>
          {chapter.chapter_number}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Chapter {chapter.chapter_number}{chapter.title ? ` — ${chapter.title}` : ''}
            </span>
            {isNew && (
              <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                NEW
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {new Date(chapter.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            {/* Step 21 — word count + estimated read time, novel chapters only */}
            {isNovel && chapter.word_count != null && chapter.word_count > 0 && (
              <span> · {chapter.word_count.toLocaleString()} words · {estimateReadTime(chapter.word_count)}</span>
            )}
          </div>
        </div>
      </a>

      {/* Creator-only controls — Edit routes into the upload page in edit
          mode (chapterId present); Delete is a two-click confirm. Readers
          and non-owning creators never see this column at all. */}
      {isCreator && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {!confirmingDelete ? (
            <>
              <a
                href={`/upload?seriesId=${seriesId}&chapterId=${chapter.id}`}
                onClick={e => e.stopPropagation()}
                title="Edit chapter"
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                  color: 'var(--text-secondary)', fontSize: '13px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none', flexShrink: 0,
                }}
              >✏️</a>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmingDelete(true); }}
                title="Delete chapter"
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                  color: '#ef4444', fontSize: '13px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >🗑️</button>
            </>
          ) : (
            <>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={{
                  padding: '7px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                  border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.15)',
                  color: '#ef4444', cursor: deleting ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {deleting ? 'Deleting...' : '⚠️ Confirm Delete'}
              </button>
              {!deleting && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmingDelete(false); }}
                  style={{
                    padding: '7px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                    border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                    color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Arrow indicator — purely visual, points into the chapter link */}
      <span style={{ color: hovered ? '#d97706' : 'var(--text-faint)', fontSize: '18px', transition: 'color 0.15s', flexShrink: 0 }}>→</span>
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = use(params);
  return <SeriesDetailPage seriesId={seriesId} />;
}

/* ── STEP 27 — RELATED SERIES CARD ── */
function formatViews(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function RelatedCard({ series }: { series: Series }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href={`/series/${series.id}`} style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{
        borderRadius: '12px', overflow: 'hidden',
        background: 'var(--bg-card)', border: `1px solid ${hovered ? '#d97706' : 'var(--border-color)'}`,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
      }}>
        <div style={{ position: 'relative', aspectRatio: '3/4', background: '#1a0a0a' }}>
          {series.cover_url ? (
            <Image src={series.cover_url} alt={series.title} fill sizes="(max-width: 768px) 45vw, 200px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>📜</div>
          )}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
            padding: '20px 8px 6px',
          }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, color: '#fff',
              background: series.content_type === 'novel' ? 'rgba(109,40,217,0.9)' : 'rgba(127,29,29,0.9)',
              padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
            }}>
              {series.content_type === 'novel' ? '📕 Novel' : '📖 Mangal'}
            </span>
          </div>
        </div>
        <div style={{ padding: '10px 10px 12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {series.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {series.genre ? <div style={{ fontSize: '10px', color: '#d97706' }}>{series.genre}</div> : <span />}
            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>👁 {formatViews(series.views ?? 0)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}