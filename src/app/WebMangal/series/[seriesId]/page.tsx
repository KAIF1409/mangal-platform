'use client';

import { useState, useEffect, useRef, use } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import ProfileMenu from '../../../components/shared/ProfileMenu';
import ReportButton from '../../../components/webmangal/ReportButton';
import ShareButton from '../../../components/webmangal/ShareButton';
import { canManageSeries, isDeveloperRole } from '../../../lib/auth/roles';
import { estimateReadTime } from '../../../lib/novelEditor';
import { setPostLoginRedirect } from '../../../lib/auth/authRedirect';
import Link from 'next/link';
import ThemeToggle from '../../../components/shared/ThemeToggle';
import {
  BookOpen, BookText, ScrollText, AlertCircle, ArrowLeft, CheckCircle2,
  Star, Play, RotateCcw, Zap, Bell, AlertTriangle, Trash2, MessageCircle,
  Library, ArrowDown, ArrowUp, Inbox, Clapperboard, Circle, Trophy,
  Edit3, PenLine, ThumbsUp, Heart, ChevronRight, Eye, Pause, ChevronUp, Flame,
} from 'lucide-react';

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
  const pathname = usePathname();
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

  // KaTube ↔ Circle cross-link, part 2 — "Fan Theories & Art" preview.
  // The other direction of §12f's tag cross-link: instead of only a button
  // pointing out to Kalpana Circle, show a small embedded preview of the
  // latest posts already tagged with this series' title, right on the
  // series page itself.
  interface CirclePostPreview {
    id: string;
    caption: string | null;
    image_url: string | null;
    username: string;
  }
  const [circlePosts, setCirclePosts] = useState<CirclePostPreview[]>([]);

  // Step 28 — Creator Bounties ("Visual Quests"). Author posts a request
  // for a specific scene, fans submit YouTube links, the community votes,
  // the author picks the winner.
  interface QuestSubmission {
    id: string;
    submitter_id: string;
    youtube_url: string;
    note: string | null;
    submitterName: string;
    voteCount: number;
  }
  interface VisualQuest {
    id: string;
    chapter_label: string | null;
    description: string;
    status: 'open' | 'closed';
    winner_submission_id: string | null;
    created_at: string;
    submissions: QuestSubmission[];
  }
  const [quests, setQuests] = useState<VisualQuest[]>([]);
  const [questsLoading, setQuestsLoading] = useState(true);
  const [myVotes, setMyVotes] = useState<Map<string, string>>(new Map()); // quest_id -> submission_id
  const [showQuestForm, setShowQuestForm] = useState(false);
  const [questChapterLabel, setQuestChapterLabel] = useState('');
  const [questDescription, setQuestDescription] = useState('');
  const [questSubmitting, setQuestSubmitting] = useState(false);
  const [submissionDrafts, setSubmissionDrafts] = useState<Map<string, { url: string; note: string }>>(new Map());
  const [submissionBusy, setSubmissionBusy] = useState<string | null>(null); // quest_id currently submitting
  const [voteBusy, setVoteBusy] = useState<string | null>(null); // quest_id currently voting
  const [pickBusy, setPickBusy] = useState<string | null>(null); // submission_id currently being picked

  // Whether unpublished (draft / not-yet-scheduled) chapters should be
  // included when fetching the chapter list — true only for the series
  // owner/developer. Kept as a ref (in sync with the `isCreator` state,
  // set below) because it's read from closures created before the auth
  // check resolves and from a focus/visibility listener with a `[seriesId]`-
  // only dependency array, both of which would otherwise capture a stale
  // `false` via a normal state read.
  const canManageRef = useRef(false);

  // Pulled out of the main load() below so it can also be called on its own
  // whenever the tab/page becomes visible again (see effect below) — we only
  // want to refresh the chapter list itself in that case, not redo the view
  // count increment, follow status, or rating fetch every time someone tabs
  // back in.
  //
  // Bug fix — this used to fetch every chapter regardless of is_draft /
  // scheduled_at, for every visitor, not just the creator. Anyone opening a
  // series page (logged in or not) could see draft chapter titles and
  // not-yet-live scheduled chapters in the chapter list, the chapter count,
  // and the "Latest"/"Continue Reading" CTA — and clicking any of them hit
  // the reader's draft/scheduled gate wall instead of actually reading
  // something. No published platform leaks unreleased chapters like that.
  // Now filtered server-side exactly like the reader's own prev/next-chapter
  // query, unless the viewer can manage this series (creator/dev), who still
  // needs to see drafts to edit them.
  const fetchChapters = async () => {
    let query = supabase
      .from('chapters').select('id, chapter_number, title, created_at, word_count')
      .eq('series_id', seriesId);
    if (!canManageRef.current) {
      query = query.eq('is_draft', false).or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`);
    }
    const { data: c } = await query.order('chapter_number', { ascending: true });
    return c;
  };

  useEffect(() => {
    const load = async () => {
      // Perf fix — this used to be ~14 `await supabase...` calls back-to-back,
      // each one a full network round trip before the next could even start
      // (a "waterfall"). None of these actually depend on each other's
      // *results* except where noted below, so batch 1 fires every
      // seriesId-only query at once via Promise.all — turning ~14 sequential
      // round trips into a handful of parallel ones. This is the single
      // biggest win for series-page load time.
      const [
        seriesRes,
        authRes,
        followCountRes,
        allRatingsRes,
        reviewRowsRes,
        relatedRes,
      ] = await Promise.all([
        supabase.from('series').select('*').eq('id', seriesId).single(),
        supabase.auth.getUser(),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('series_id', seriesId),
        supabase.from('ratings').select('stars').eq('series_id', seriesId),
        // Step 26 — Written reviews: only rows with actual review text, newest
        // first. Helpful count via embedded aggregate, same no-N+1 pattern used
        // for chapter counts and tag counts elsewhere.
        supabase
          .from('ratings')
          .select('id, reader_id, stars, review_title, review_text, created_at, profiles(full_name), review_helpful_votes(count)')
          .eq('series_id', seriesId)
          .not('review_text', 'is', null)
          .order('created_at', { ascending: false }),
        // Step 27 — Readers Also Liked
        supabase.rpc('related_series', { target_series_id: seriesId, result_limit: 6 }),
      ]);

      const s = seriesRes.data;
      const u = authRes.data;

      if (s) {
        setSeries(s);
        setViewCount(s.views ?? 0);
      }

      setFollowCount(followCountRes.count ?? 0);

      if (allRatingsRes.data && allRatingsRes.data.length > 0) {
        setRatingCount(allRatingsRes.data.length);
        const avg = allRatingsRes.data.reduce((sum, r) => sum + r.stars, 0) / allRatingsRes.data.length;
        setAvgRating(Math.round(avg * 10) / 10);
      }

      if (reviewRowsRes.data) {
        const mapped: Review[] = reviewRowsRes.data.map((r: ReviewQueryRow) => ({
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

      if (relatedRes.data) setRelatedSeries(relatedRes.data as Series[]);

      // Step 7 — view count: once per visitor per series per day (industry-standard
      // anti-spam pattern, same idea as YouTube/Webtoon). Guarded via localStorage so
      // refreshes, re-renders, and repeat same-day visits don't inflate the number.
      // Routed through /api/log-view (instead of calling the RPC directly from the
      // browser) so the server can read Vercel's edge geo header and record which
      // country the view came from — used by creator Audience Insights.
      // Fired without awaiting — it's independent of every other query below,
      // no need to hold up the rest of the page for it.
      const logView = (async () => {
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
      })();

      // Batch 2 — needs `s` (creator id / title), so it can only start once
      // batch 1's series row is back, but its three queries are independent
      // of each other and run together.
      const seriesDependent = (async () => {
        if (!s) return;
        const tasks: PromiseLike<void>[] = [
          // Step 13 — Public Creator Profile: fetch the creator's username so the
          // hero can link to /creator/[username]. Separate query since series has
          // no username column itself, same pattern as the search page.
          supabase
            .from('creator_profiles')
            .select('username')
            .eq('user_id', s.creator_id)
            .single()
            .then(({ data }) => { if (data) setCreatorUsername(data.username); }),
          // Step 25 — Tags: joined through series_tags. Table may not exist yet
          // on older deployments before the migration runs, so fail silently.
          supabase
            .from('series_tags')
            .select('tags(id, name, slug)')
            .eq('series_id', seriesId)
            .then(({ data: tagRows }) => {
              if (tagRows) {
                const flat = tagRows
                  .map((r: { tags: { id: string; name: string; slug: string }[] | { id: string; name: string; slug: string } | null }) => (Array.isArray(r.tags) ? r.tags[0] : r.tags))
                  .filter((tag): tag is { id: string; name: string; slug: string } => !!tag);
                setTags(flat);
              }
            }),
        ];
        // Fan Theories & Art preview — latest kcircle_posts tagged with this
        // series' title (same ilike match §12f's ?tag= filter uses on the
        // Circle side, kept exact-ish/free-text on purpose, see that note).
        if (s.title) {
          tasks.push(
            supabase
              .from('kcircle_posts')
              .select('id, caption, image_url, author_id')
              .ilike('tag', s.title)
              .order('created_at', { ascending: false })
              .limit(4)
              .then(async ({ data: taggedPosts }) => {
                if (taggedPosts && taggedPosts.length > 0) {
                  const authorIds = Array.from(new Set(taggedPosts.map(p => p.author_id)));
                  const { data: authorRows } = await supabase
                    .from('creator_profiles').select('user_id, username').in('user_id', authorIds);
                  const usernameMap = new Map((authorRows ?? []).map(a => [a.user_id, a.username]));
                  setCirclePosts(taggedPosts.map(p => ({
                    id: p.id, caption: p.caption, image_url: p.image_url,
                    username: usernameMap.get(p.author_id) ?? 'dreamer',
                  })));
                }
              })
          );
        }
        await Promise.all(tasks);
      })();

      // Batch 3 — needs the logged-in user, so it can only start once batch 1's
      // auth call is back. The chapter list itself lives here too (not in
      // batch 1): fetchChapters() reads canManageRef.current to decide whether
      // to filter out drafts/scheduled chapters, so it has to run only after
      // we know the viewer's role — running it in the fully-parallel batch 1
      // would race with that check and could show a creator their own series
      // as if they were a regular reader.
      const userDependent = (async () => {
        if (!u.user) {
          // Anonymous — canManageRef.current is already false by default, so
          // it's safe to fetch chapters immediately, no role check needed.
          const chaptersData = await fetchChapters();
          if (chaptersData) setChapters(chaptersData);
          return;
        }
        setUser(u.user);

        const [profileRes, followRes, progRes, myRRes, voteRowsRes] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', u.user!.id).single(),
          supabase.from('follows').select('id').eq('reader_id', u.user!.id).eq('series_id', seriesId).maybeSingle(),
          supabase.from('reading_progress').select('chapter_id, page_number').eq('reader_id', u.user!.id).eq('series_id', seriesId).maybeSingle(),
          supabase.from('ratings').select('stars, review_title, review_text').eq('series_id', seriesId).eq('reader_id', u.user!.id).maybeSingle(),
          // Step 26 — which reviews this reader has already marked helpful
          supabase.from('review_helpful_votes').select('rating_id').eq('voter_id', u.user!.id),
        ]);

        const owns = !!(s && u.user!.id === s.creator_id);
        const canManage = canManageSeries(profileRes.data?.role, owns);
        setIsCreator(canManage);
        canManageRef.current = canManage;
        setIsDeveloper(isDeveloperRole(profileRes.data?.role));
        setIsFollowing(!!followRes.data);
        if (progRes.data) setProgress(progRes.data);
        if (myRRes.data) {
          setMyRating(myRRes.data.stars);
          setReviewTitle(myRRes.data.review_title ?? '');
          setReviewText(myRRes.data.review_text ?? '');
        }
        if (voteRowsRes.data) setMyVotedHelpful(new Set(voteRowsRes.data.map((v: { rating_id: string }) => v.rating_id)));

        // Only now do we know for sure whether this viewer can see drafts.
        const chaptersData = await fetchChapters();
        if (chaptersData) setChapters(chaptersData);
      })();

      await Promise.all([logView, seriesDependent, userDependent]);

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
    if (!user) { setPostLoginRedirect(window.location.pathname); window.location.assign('/login'); return; }
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
    if (!user) { setPostLoginRedirect(window.location.pathname); window.location.assign('/login'); return; }
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
    if (!user) { setPostLoginRedirect(window.location.pathname); window.location.assign('/login'); return; }
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
    if (!user) { setPostLoginRedirect(window.location.pathname); window.location.assign('/login'); return; }
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

  // Step 28 — Creator Bounties ("Visual Quests")
  const fetchQuests = async () => {
    const { data: questRows } = await supabase
      .from('visual_quests')
      .select('id, chapter_label, description, status, winner_submission_id, created_at')
      .eq('series_id', seriesId)
      .order('created_at', { ascending: false });

    if (!questRows || questRows.length === 0) {
      setQuests([]);
      setQuestsLoading(false);
      return;
    }

    const questIds = questRows.map(q => q.id);
    const [{ data: subRows }, { data: voteRows }] = await Promise.all([
      supabase.from('visual_quest_submissions')
        .select('id, quest_id, submitter_id, youtube_url, note, created_at')
        .in('quest_id', questIds).order('created_at', { ascending: true }),
      supabase.from('visual_quest_votes').select('quest_id, submission_id, voter_id').in('quest_id', questIds),
    ]);

    const submitterIds = [...new Set((subRows || []).map(s => s.submitter_id))];
    const { data: profiles } = submitterIds.length
      ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', submitterIds)
      : { data: [] as { user_id: string; username: string }[] };
    const nameMap = new Map((profiles || []).map(p => [p.user_id, p.username]));

    const voteCountBySubmission = new Map<string, number>();
    (voteRows || []).forEach(v => {
      voteCountBySubmission.set(v.submission_id, (voteCountBySubmission.get(v.submission_id) || 0) + 1);
    });

    if (user) {
      const mine = new Map<string, string>();
      (voteRows || []).forEach(v => { if (v.voter_id === user.id) mine.set(v.quest_id, v.submission_id); });
      setMyVotes(mine);
    }

    setQuests(questRows.map(q => ({
      ...q,
      status: q.status as 'open' | 'closed',
      submissions: (subRows || []).filter(s => s.quest_id === q.id).map(s => ({
        id: s.id,
        submitter_id: s.submitter_id,
        youtube_url: s.youtube_url,
        note: s.note,
        submitterName: nameMap.get(s.submitter_id) || 'MANGAL Fan',
        voteCount: voteCountBySubmission.get(s.id) || 0,
      })),
    })));
    setQuestsLoading(false);
  };

  useEffect(() => {
    if (!seriesId) return;
    (async () => { await fetchQuests(); })();
  }, [seriesId, user]);

  const submitQuest = async () => {
    if (!user || !isCreator) return;
    const desc = questDescription.trim();
    if (!desc || questSubmitting) return;
    setQuestSubmitting(true);
    const { error } = await supabase.from('visual_quests').insert({
      series_id: seriesId, creator_id: user.id,
      chapter_label: questChapterLabel.trim() || null,
      description: desc,
    });
    setQuestSubmitting(false);
    if (!error) {
      setQuestChapterLabel('');
      setQuestDescription('');
      setShowQuestForm(false);
      fetchQuests();
    }
  };

  const submitEntry = async (questId: string) => {
    if (!user) { setPostLoginRedirect(window.location.pathname); window.location.assign('/login'); return; }
    const draft = submissionDrafts.get(questId);
    const url = draft?.url.trim();
    if (!url || submissionBusy) return;
    setSubmissionBusy(questId);
    const { error } = await supabase.from('visual_quest_submissions').insert({
      quest_id: questId, submitter_id: user.id, youtube_url: url, note: draft?.note.trim() || null,
    });
    setSubmissionBusy(null);
    if (!error) {
      setSubmissionDrafts(prev => { const next = new Map(prev); next.delete(questId); return next; });
      fetchQuests();
    }
  };

  const castVote = async (questId: string, submissionId: string) => {
    if (!user) { setPostLoginRedirect(window.location.pathname); window.location.assign('/login'); return; }
    if (voteBusy) return;
    setVoteBusy(questId);
    const { error } = await supabase
      .from('visual_quest_votes')
      .upsert({ quest_id: questId, submission_id: submissionId, voter_id: user.id }, { onConflict: 'quest_id,voter_id' });
    setVoteBusy(null);
    if (!error) fetchQuests();
  };

  const pickWinner = async (questId: string, submissionId: string) => {
    if (!user || !isCreator || pickBusy) return;
    setPickBusy(submissionId);
    const { error } = await supabase
      .from('visual_quests')
      .update({ winner_submission_id: submissionId, status: 'closed' })
      .eq('id', questId).eq('creator_id', user.id);
    setPickBusy(null);
    if (!error) fetchQuests();
  };

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
        <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><BookOpen size={32} /></div>
        <div>Loading series...</div>
      </div>
    </div>
  );

  if (!series) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><AlertCircle size={32} /></div>
        <div>Series not found.</div>
        <Link href="/" style={{ color: '#d97706', textDecoration: 'none', fontSize: '13px', marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ArrowLeft size={13} /> Back to Browse</Link>
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

      {/* Nav had no flexWrap and no responsive rules at all — logo +
          "MANGAL" + breadcrumb + series title on the left, theme toggle +
          Browse pill + (Add Chapter) + profile/login on the right, all in
          one non-wrapping row. On a ~360-375px phone that's easily 500px+
          of content forced into ~330px, causing horizontal overflow. Same
          .mangal-* + <style> pattern used on the other pages in this pass. */}
      <style>{`
        @media (max-width: 640px) {
          .mangal-series-nav { padding: 0 12px !important; gap: 6px; }
          .mangal-series-nav-brand-text { display: none; }
          .mangal-series-nav-title { max-width: 30vw !important; font-size: 12px !important; }
          .mangal-series-nav-browse { display: none; }
          .mangal-series-nav-right { gap: 6px !important; }
          .mangal-series-nav-right a { padding: 6px 10px !important; font-size: 11px !important; }
        }
        @media (max-width: 400px) {
          .mangal-series-nav-crumb { display: none; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="mangal-series-nav" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 24px', height: '60px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
          <Link href="/WebMangal" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}>
            <Image src="/webmangal-logo.png" alt="WebMangal" width={120} height={120} style={{ display: 'block', height: '30px', width: '30px', objectFit: 'contain' }} />
            <span className="mangal-series-nav-brand-text" style={{ fontWeight: 900, fontSize: '17px', color: 'var(--text-primary)' }}>WebMangal</span>
          </Link>
          <span className="mangal-series-nav-crumb" style={{ color: 'var(--text-faint)' }}>›</span>
          <span className="mangal-series-nav-title" style={{ fontSize: '13px', color: 'var(--text-tertiary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{series.title}</span>
        </div>
        <div className="mangal-series-nav-right" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          <ThemeToggle size={30} />
          <Link href="/WebMangal" className="mangal-series-nav-browse" style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'none', border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>Browse</Link>
          {isCreator && (
            <a href={`/WebMangal/upload?seriesId=${series.id}`} style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: 'linear-gradient(135deg, #f97316, #22c55e)', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              + Add Chapter
            </a>
          )}
          {user ? (
            <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />
          ) : (
            <a href={`/login?next=${encodeURIComponent(pathname)}`} style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: 'linear-gradient(135deg, #f97316, #22c55e)', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>Log in</a>
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
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ScrollText size={48} /></div>
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
                {isNovel ? <><BookText size={13} /> Novel</> : (series.reading_mode === 'scroll' ? <><ScrollText size={13} /> Webtoon</> : <><BookOpen size={13} /> Mangal</>)}
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
                  {series.completion_status === 'completed' && <><CheckCircle2 size={13} /> Completed</>}
                  {series.completion_status === 'hiatus' && <><Pause size={13} /> On Hiatus</>}
                  {series.completion_status === 'ongoing' && <><Circle size={9} fill="currentColor" stroke="none" /> Ongoing</>}
                </span>
              )}
            </div>

            <h1 style={{ fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.02em', lineHeight: 1.1, color: '#f9fafb' }}>
              {series.title}
            </h1>
            {/* Step 13 — Public Creator Profile: links to /creator/[username] */}
            {creatorUsername && (
              <a href={`/WebMangal/creator/${creatorUsername}`} style={{
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
                    href={`/WebMangal/tags/${tag.slug}`}
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
                    ><Star size={16} /></button>
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
                <a href={`/WebMangal/read/${progressChapter.id}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '10px', fontWeight: 800, fontSize: '14px',
                  background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
                  color: '#fff', textDecoration: 'none',
                  boxShadow: '0 4px 20px rgba(217,119,6,0.3)',
                }}>
                  <Play size={13} /> Continue Reading <ChevronRight size={13} /> Ch.{progressChapter.chapter_number}
                </a>
              ) : firstChapter && (
                <a href={`/WebMangal/read/${firstChapter.id}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '10px', fontWeight: 800, fontSize: '14px',
                  background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
                  color: '#fff', textDecoration: 'none',
                  boxShadow: '0 4px 20px rgba(217,119,6,0.3)',
                }}>
                  <Play size={14} /> Start Reading
                </a>
              )}
              {progressChapter && firstChapter && (
                <a href={`/WebMangal/read/${firstChapter.id}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
                  color: '#c3c7cf', textDecoration: 'none',
                }}>
                  <RotateCcw size={13} /> Start From Beginning
                </a>
              )}
              {latestChapter && latestChapter.id !== firstChapter?.id && latestChapter.id !== progressChapter?.id && (
                <a href={`/WebMangal/read/${latestChapter.id}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
                  color: '#c3c7cf', textDecoration: 'none',
                }}>
                  <Zap size={13} /> Latest Chapter
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
                  {followLoading ? '...' : <><Bell size={13} /> {isFollowing ? 'Following' : 'Follow'}</>}
                </button>
              )}
              {isCreator && (
                <a href={`/WebMangal/upload?seriesId=${series.id}`} style={{
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
                      {deletingSeries ? 'Deleting...' : <><AlertTriangle size={13} /> Confirm Delete Series</>}
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
                    <Trash2 size={13} /> Delete Series
                  </button>
                )
              )}
              {/* Cross-link — series ↔ Kalpana Circle discussion (kcircle_posts.tag) */}
              <a
                href={`/kalpana-circle?tag=${encodeURIComponent(series.title)}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                  background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)',
                  color: '#a78bfa', textDecoration: 'none',
                }}
              >
                <MessageCircle size={13} /> Discuss on Kalpana Circle
              </a>
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
            <Library size={13} /> {chapters.length} Chapter{chapters.length !== 1 ? 's' : ''}
          </h2>
          <button
            onClick={() => setSortDesc(d => !d)}
            style={{
              padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            {sortDesc ? <><ArrowDown size={12} /> Newest First</> : <><ArrowUp size={12} /> Oldest First</>}
          </button>
        </div>

        {chapters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}><Inbox size={32} /></div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 200px))', gap: '16px' }}>
              {relatedSeries.map(rs => <RelatedCard key={rs.id} series={rs} />)}
            </div>
          </section>
        )}

        {/* ── Fan Theories & Art — K Circle cross-link preview ── */}
        {circlePosts.length > 0 && (
          <section style={{ padding: '40px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                <MessageCircle size={14} /> Fan Theories &amp; Art
              </h2>
              <a href={`/kalpana-circle?tag=${encodeURIComponent(series.title)}`} style={{ fontSize: '12.5px', fontWeight: 700, color: '#a78bfa', textDecoration: 'none' }}>
                See all <ChevronRight size={12} />
              </a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 200px))', gap: '16px' }}>
              {circlePosts.map(p => <CirclePostCard key={p.id} post={p} seriesTitle={series.title} />)}
            </div>
          </section>
        )}

        {/* ── STEP 28 — VISUAL QUESTS (Creator Bounties) ── */}
        {(quests.length > 0 || isCreator) && (
          <section style={{ padding: '40px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '10px', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                <Clapperboard size={14} /> Visual Quests {quests.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({quests.length})</span>}
              </h2>
              {isCreator && !showQuestForm && (
                <button
                  onClick={() => setShowQuestForm(true)}
                  style={{
                    padding: '9px 18px', borderRadius: '10px', border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)', color: '#d97706', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  }}
                >+ Post a Visual Quest</button>
              )}
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Request a KaTube visual for a scene — fan animators submit their take, the community votes, and you pick the official one.
            </p>

            {showQuestForm && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px', marginBottom: '24px' }}>
                <input
                  type="text"
                  value={questChapterLabel}
                  onChange={e => setQuestChapterLabel(e.target.value)}
                  placeholder="Chapter / scene label (optional, e.g. 'Chapter 12')"
                  maxLength={80}
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: '10px', marginBottom: '10px',
                    background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-primary)',
                    fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit',
                  }}
                />
                <textarea
                  value={questDescription}
                  onChange={e => setQuestDescription(e.target.value)}
                  placeholder="What visual are you looking for? (e.g. 'I need a KaTube visual for the dragon fight')"
                  rows={3}
                  maxLength={500}
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: '10px',
                    background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-primary)',
                    fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit', resize: 'vertical' as const,
                  }}
                />
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                  <button
                    onClick={() => setShowQuestForm(false)}
                    style={{ padding: '10px 18px', borderRadius: '10px', background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >Cancel</button>
                  <button
                    onClick={submitQuest}
                    disabled={questSubmitting || !questDescription.trim()}
                    style={{
                      padding: '10px 20px', borderRadius: '10px', border: 'none',
                      background: (questSubmitting || !questDescription.trim()) ? 'var(--border-color)' : 'linear-gradient(135deg, #f97316, #22c55e)',
                      color: (questSubmitting || !questDescription.trim()) ? 'var(--text-primary)' : '#fff', fontSize: '12px', fontWeight: 700,
                      cursor: (questSubmitting || !questDescription.trim()) ? 'not-allowed' : 'pointer',
                    }}
                  >{questSubmitting ? 'Posting...' : 'Post Quest'}</button>
                </div>
              </div>
            )}

            {questsLoading ? (
              <div style={{ padding: '20px 0', color: 'var(--text-faint)', fontSize: '13px' }}>Loading quests…</div>
            ) : quests.length === 0 ? (
              <div style={{ padding: '20px 0', color: 'var(--text-faint)', fontSize: '13px' }}>
                No Visual Quests posted yet{isCreator ? ' — post one to invite fan animators.' : '.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {quests.map(q => {
                  const draft = submissionDrafts.get(q.id) || { url: '', note: '' };
                  const myVote = myVotes.get(q.id);
                  const winner = q.submissions.find(s => s.id === q.winner_submission_id);
                  return (
                    <div key={q.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' as const }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {q.chapter_label && (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.28)', borderRadius: '20px', padding: '3px 10px' }}>
                              {q.chapter_label}
                            </span>
                          )}
                          <span style={{
                            fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.03em',
                            color: q.status === 'open' ? '#22c55e' : 'var(--text-muted)',
                          }}>{q.status === 'open' ? <><Circle size={9} fill="currentColor" stroke="none" /> Open</> : <><CheckCircle2 size={11} /> Closed</>}</span>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {new Date(q.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>{q.description}</p>

                      {winner && (
                        <div style={{ marginBottom: '14px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.28)' }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#d97706', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><Trophy size={12} /> Official visual — by {winner.submitterName}</div>
                          <a href={winner.youtube_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12.5px', color: 'var(--text-primary)', wordBreak: 'break-all' as const }}>
                            {winner.youtube_url}
                          </a>
                        </div>
                      )}

                      {q.submissions.filter(s => s.id !== q.winner_submission_id).length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: q.status === 'open' ? '14px' : 0 }}>
                          {q.submissions.filter(s => s.id !== q.winner_submission_id).map(s => (
                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-input)', flexWrap: 'wrap' as const }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>{s.submitterName}</div>
                                <a href={s.youtube_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-all' as const }}>
                                  {s.youtube_url}
                                </a>
                                {s.note && <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '4px 0 0' }}>{s.note}</p>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <button
                                  onClick={() => castVote(q.id, s.id)}
                                  disabled={q.status !== 'open' || voteBusy === q.id}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    padding: '5px 12px', borderRadius: '8px', cursor: q.status !== 'open' ? 'default' : 'pointer',
                                    border: myVote === s.id ? '1px solid rgba(217,119,6,0.4)' : '1px solid var(--border-color)',
                                    background: myVote === s.id ? 'rgba(217,119,6,0.1)' : 'transparent',
                                    color: myVote === s.id ? '#d97706' : 'var(--text-tertiary)',
                                    fontSize: '11px', fontWeight: 700, opacity: q.status !== 'open' ? 0.6 : 1,
                                  }}
                                >
                                  <ChevronUp size={12} style={{ verticalAlign: 'middle' }} /> {s.voteCount > 0 ? s.voteCount : 'Vote'}
                                </button>
                                {isCreator && q.status === 'open' && (
                                  <button
                                    onClick={() => pickWinner(q.id, s.id)}
                                    disabled={pickBusy === s.id}
                                    style={{
                                      padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--border-color)',
                                      background: 'transparent', color: 'var(--text-tertiary)', fontSize: '11px', fontWeight: 700,
                                      cursor: 'pointer', opacity: pickBusy === s.id ? 0.5 : 1,
                                    }}
                                  ><Trophy size={12} /> Pick</button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {q.status === 'open' && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                          <input
                            value={draft.url}
                            onChange={e => setSubmissionDrafts(prev => new Map(prev).set(q.id, { ...draft, url: e.target.value }))}
                            placeholder={user ? 'Paste your YouTube link…' : 'Log in to submit your visual'}
                            disabled={submissionBusy === q.id}
                            style={{
                              flex: '1 1 200px', minWidth: 0, padding: '9px 14px', borderRadius: '20px',
                              border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                              color: 'var(--text-primary)', fontSize: '12.5px', outline: 'none',
                            }}
                          />
                          <input
                            value={draft.note}
                            onChange={e => setSubmissionDrafts(prev => new Map(prev).set(q.id, { ...draft, note: e.target.value }))}
                            placeholder="Note (optional)"
                            disabled={submissionBusy === q.id}
                            style={{
                              flex: '1 1 140px', minWidth: 0, padding: '9px 14px', borderRadius: '20px',
                              border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                              color: 'var(--text-primary)', fontSize: '12.5px', outline: 'none',
                            }}
                          />
                          <button
                            onClick={() => submitEntry(q.id)}
                            disabled={submissionBusy === q.id || !draft.url.trim()}
                            style={{
                              fontSize: '12px', fontWeight: 700, color: '#fff', background: '#d97706',
                              border: 'none', borderRadius: '20px', padding: '0 16px', cursor: 'pointer',
                              opacity: (submissionBusy === q.id || !draft.url.trim()) ? 0.5 : 1, flexShrink: 0,
                            }}
                          >Submit</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
                {myRating && reviews.some(r => r.reader_id === user.id) ? <><Edit3 size={13} /> Edit Your Review</> : <><PenLine size={13} /> Write a Review</>}
              </button>
            )}
          </div>

          {!myRating && user && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Rate the series above (using the stars) before writing a review.
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
                    background: reviewSubmitting ? 'var(--border-color)' : 'linear-gradient(135deg, #f97316, #22c55e)',
                    color: reviewSubmitting ? 'var(--text-primary)' : '#fff', fontSize: '12px', fontWeight: 700, cursor: reviewSubmitting ? 'not-allowed' : 'pointer',
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
                          <Star key={s} size={11} fill={s <= review.stars ? '#d97706' : 'none'} stroke={s <= review.stars ? '#d97706' : 'var(--border-color)'} />
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
                    <ThumbsUp size={12} /> Helpful{review.helpful_count > 0 ? ` (${review.helpful_count})` : ''}
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
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #7f1d1d, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Flame size={14} fill="currentColor" /></div>
          <span style={{ fontWeight: 900, fontSize: '16px', color: 'var(--footer-text)' }}>MANGAL</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--footer-text-muted)', margin: '0 0 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>Made with <Heart size={12} fill="currentColor" /> in India · Free to read, forever.</p>
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
        href={`/WebMangal/read/${chapter.id}`}
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
                href={`/WebMangal/upload?seriesId=${seriesId}&chapterId=${chapter.id}`}
                onClick={e => e.stopPropagation()}
                title="Edit chapter"
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                  color: 'var(--text-secondary)', fontSize: '13px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none', flexShrink: 0,
                }}
              ><Edit3 size={14} /></a>
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
              ><Trash2 size={14} /></button>
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
                {deleting ? 'Deleting...' : <><AlertTriangle size={13} /> Confirm Delete</>}
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
      <span style={{ color: hovered ? '#d97706' : 'var(--text-faint)', transition: 'color 0.15s', flexShrink: 0, display: 'flex' }}><ChevronRight size={18} /></span>
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

function CirclePostCard({ post, seriesTitle }: { post: { id: string; caption: string | null; image_url: string | null; username: string }; seriesTitle: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href={`/kalpana-circle?tag=${encodeURIComponent(seriesTitle)}`} style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{
        borderRadius: '12px', overflow: 'hidden',
        background: 'var(--bg-card)', border: `1px solid ${hovered ? '#a78bfa' : 'var(--border-color)'}`,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
      }}>
        <div style={{ position: 'relative', aspectRatio: '3/4', background: 'var(--bg-input)' }}>
          {post.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL, not a static asset
            <img src={post.image_url} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '14px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.5,
            }}>{post.caption ?? <MessageCircle size={14} />}</div>
          )}
        </div>
        <div style={{ padding: '8px 10px', fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          @{post.username}
        </div>
      </div>
    </a>
  );
}

function RelatedCard({ series }: { series: Series }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href={`/WebMangal/series/${series.id}`} style={{ textDecoration: 'none' }}
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
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ScrollText size={36} /></div>
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
              {series.content_type === 'novel' ? <><BookText size={11} /> Novel</> : <><BookOpen size={11} /> Mangal</>}
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
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Eye size={10} /> {formatViews(series.views ?? 0)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}