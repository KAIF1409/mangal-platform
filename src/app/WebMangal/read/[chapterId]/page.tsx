'use client';

import { useState, useEffect, useRef, useMemo, use } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { parseChapterContent, estimateReadTime } from '../../../lib/novelEditor';
import ThemeToggle from '../../../components/shared/ThemeToggle';
import {
  CalendarClock, FileText, ArrowLeft, BookOpen, Sparkles, Wrench,
  Menu, Expand, Shrink, Lock, Unlock, Settings, X, ScrollText,
  MoveHorizontal, ChevronRight, ListOrdered, CornerDownRight,
  Minus, Plus, Wifi,
} from 'lucide-react';


import { setPostLoginRedirect } from '../../../lib/auth/authRedirect';
type PageItem = { id: string; page_number: number; image_url: string };
type SeriesInfo = { id: string; title: string; reading_mode: 'scroll' | 'page'; content_type: 'mangal' | 'novel'; reading_direction: 'ltr' | 'rtl' | null; cover_url?: string | null };
type ChapterNav = { id: string; chapter_number: number; title: string };

// Step 3 — Chapter Reactions: stored emoji keys map to display emoji + a label for the title attr
const REACTIONS: { key: string; emoji: string; label: string }[] = [
  { key: 'heart', emoji: '❤️', label: 'Love' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'laugh', emoji: '😂', label: 'Funny' },
  { key: 'wow', emoji: '😲', label: 'Wow' },
  { key: 'cry', emoji: '😢', label: 'Sad' },
];

function ReaderView({ chapterId }: { chapterId: string }) {
  const [pages, setPages] = useState<PageItem[]>([]);
  const [series, setSeries] = useState<SeriesInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [prevChapter, setPrevChapter] = useState<ChapterNav | null>(null);
  const [nextChapter, setNextChapter] = useState<ChapterNav | null>(null);
  const [currentChapter, setCurrentChapter] = useState<ChapterNav | null>(null);
  const [allChapters, setAllChapters] = useState<ChapterNav[]>([]);
  const [showUI, setShowUI] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [bgColor, setBgColor] = useState('#000000'); // manga default; overridden to sepia for novels on first load
  const [showSettings, setShowSettings] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lockScreen, setLockScreen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Sprint 4 — reader settings menu
  // modeOverride: 'scroll' by default; reader can switch to 'page'. null only briefly during init.
  const [modeOverride, setModeOverride] = useState<'scroll' | 'page' | null>('scroll');
  const [fitMode, setFitMode] = useState<'width' | 'screen' | 'actual'>('width');
  const [tapZonesEnabled, setTapZonesEnabled] = useState(false);
  // Image quality: 'auto' picks a floor of 720p on slow connections and full
  // resolution on good ones; 'low'/'high' are the reader's manual override.
  const [imageQuality, setImageQuality] = useState<'auto' | 'low' | 'high'>('auto');
  // What 'auto' currently resolves to, based on the Network Information API
  // (connection type/downlink/saveData). Defaults to 'high' when the API isn't
  // available (Safari, etc.) so we never under-serve users we can't measure.
  const [autoResolvedQuality, setAutoResolvedQuality] = useState<'low' | 'high'>('high');
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // Step 21 — Novel reader state
  const [novelContent, setNovelContent] = useState<string | null>(null);
  const [novelWordCount, setNovelWordCount] = useState(0);
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans' | 'dyslexic'>('serif');
  const [lineHeight, setLineHeight] = useState<1.5 | 2 | 2.4>(2);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [fontSize, setFontSize] = useState(16); // px, range 14–24

  // Author's Note (before/after) + Tags — read-only display for readers.
  // Needs chapters.author_note_before / author_note_after / tags.
  const [authorNoteBefore, setAuthorNoteBefore] = useState<string | null>(null);
  const [authorNoteAfter, setAuthorNoteAfter] = useState<string | null>(null);
  const [chapterTags, setChapterTags] = useState<string[]>([]);

  // Draft / scheduled gating — a chapter that's still a draft, or scheduled
  // for a future time, should not be readable via direct link. Needs
  // chapters.is_draft / chapters.scheduled_at.
  const [chapterUnavailable, setChapterUnavailable] = useState<'draft' | 'scheduled' | null>(null);
  const [unavailableUntil, setUnavailableUntil] = useState<string | null>(null);
  const [previewingOwnUnpublished, setPreviewingOwnUnpublished] = useState<'draft' | 'scheduled' | null>(null);

  // Step 3 — Chapter Reactions (emoji)
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [reactionLoading, setReactionLoading] = useState(false);

  // Step 4 — Chapter Comments
  type CommentRow = { id: string; reader_id: string; body: string; created_at: string; full_name: string; parent_id: string | null; replies?: CommentRow[] };
  type CommentQueryRow = { id: string; reader_id: string; body: string; created_at: string; parent_id: string | null; profiles: { full_name: string | null }[] | { full_name: string | null } | null };
  const [comments, setComments] = useState<CommentRow[]>([]);
  // Bug fix — the "Comments (N)" badge was showing comments.length, which is
  // only the count of top-level comments; a thread with 3 top-level comments
  // and 5 replies displayed "(3)" instead of "(8)". Replies are nested one
  // level deep under their parent (see loadComments below), so the true total
  // is top-level count + every parent's replies array length.
  const totalCommentCount = useMemo(
    () => comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0),
    [comments]
  );
  const [commentBody, setCommentBody] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Step 5 — Replies
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  // Step 26 — Read Gate (localStorage-based free tier limit: 2 chapters/series, 3 series max)
  type ReadHistoryEntry = { chapterId: string; seriesId: string; readAt: number };
  type ReadGateState = { gated: boolean; reason: 'series_limit' | 'chapter_limit' | null };
  const [readGate, setReadGate] = useState<ReadGateState>({ gated: false, reason: null });
  const [chaptersReadThisSeries, setChaptersReadThisSeries] = useState(0);
  const [uniqueSeriesRead, setUniqueSeriesRead] = useState(0);

  // Resume-in-chapter: "Continue Reading" on the series page only lands you on
  // the right chapter — it never restored the exact page/scroll position within
  // it, so every resume silently dropped you back at page 1. Restored below by
  // reading the same reading_progress row upsertProgress() writes to, but only
  // applied when it belongs to *this* chapter (a fresh link/sidebar nav into an
  // arbitrary chapter should still start at the top, not hijack scroll).
  const [resumeApplied, setResumeApplied] = useState(false);

  // Helper: Load read history from localStorage
  const getReadHistory = (): ReadHistoryEntry[] => {
    try {
      const raw = localStorage.getItem('mangal_read_history');
      if (raw) return JSON.parse(raw);
    } catch {
      // corrupted or unavailable
    }
    return [];
  };

  // Helper: Save entry to read history (idempotent — same chapter multiple times is just one read)
  const recordChapterRead = (chapterId: string, seriesId: string) => {
    try {
      const history = getReadHistory();
      // Check if already recorded
      if (!history.some(h => h.chapterId === chapterId)) {
        history.push({ chapterId, seriesId, readAt: Date.now() });
        localStorage.setItem('mangal_read_history', JSON.stringify(history));
      }
    } catch {
      // ignore storage errors
    }
  };

  // Helper: Count chapters read for a specific series
  const countChaptersInSeries = (seriesId: string): number => {
    const history = getReadHistory();
    return history.filter(h => h.seriesId === seriesId).length;
  };

  // Helper: Count unique series read
  const countUniqueSeries = (): number => {
    const history = getReadHistory();
    return new Set(history.map(h => h.seriesId)).size;
  };

  // Helper: Check if current chapter is already read (free pass to re-read)
  const isChapterAlreadyRead = (chapterId: string): boolean => {
    const history = getReadHistory();
    return history.some(h => h.chapterId === chapterId);
  };

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Step 2 — Reading Progress refs (scroll-mode image tracking + write debounce)
  const pageRefs = useRef<(HTMLImageElement | null)[]>([]);
  const progressDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPage = useRef(0);
  const lastChapterId = useRef<string | null>(null);

  // Load reader prefs once on mount (these are reader-level preferences,
  // not series-level — they persist across every chapter/series this reader opens)
  /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from
     localStorage on mount; can't run during render (localStorage isn't
     available server-side / during SSR), so this has to be an effect. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem('mangal_reader_prefs');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.modeOverride) setModeOverride(saved.modeOverride);
        if (saved.fitMode) setFitMode(saved.fitMode);
        if (typeof saved.tapZonesEnabled === 'boolean') setTapZonesEnabled(saved.tapZonesEnabled);
        if (saved.imageQuality === 'auto' || saved.imageQuality === 'low' || saved.imageQuality === 'high') {
          setImageQuality(saved.imageQuality);
        } else if (typeof saved.dataSaver === 'boolean') {
          // Migrate the old binary "Data Saver" pref to the new 3-way selector.
          setImageQuality(saved.dataSaver ? 'low' : 'auto');
        }
        if (saved.fontSize && saved.fontSize >= 14 && saved.fontSize <= 24) setFontSize(saved.fontSize);
        if (saved.fontFamily === 'serif' || saved.fontFamily === 'sans' || saved.fontFamily === 'dyslexic') setFontFamily(saved.fontFamily);
        if (saved.lineHeight === 1.5 || saved.lineHeight === 2 || saved.lineHeight === 2.4) setLineHeight(saved.lineHeight);
        // Novel and manga have separate bgColor prefs so they don't bleed into each other.
        // Applied below in the series-load effect once content_type is known.
      }
    } catch {
      // localStorage unavailable or corrupted — just use defaults
    }
    setPrefsLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Detect connection speed for 'auto' image quality. Network Information API
  // is Chrome/Edge/Android only (no Safari/Firefox support as of this writing) —
  // where it's missing we just stay on 'high', which is the safe default.
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number; saveData?: boolean; addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void };
      mozConnection?: typeof nav.connection;
      webkitConnection?: typeof nav.connection;
    };
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    const evaluate = () => {
      if (!conn) { setAutoResolvedQuality('high'); return; }
      const slow =
        conn.saveData === true ||
        (conn.effectiveType ? ['slow-2g', '2g', '3g'].includes(conn.effectiveType) : false) ||
        (typeof conn.downlink === 'number' && conn.downlink < 1.5);
      setAutoResolvedQuality(slow ? 'low' : 'high');
    };
    evaluate();
    conn?.addEventListener?.('change', evaluate);
    return () => conn?.removeEventListener?.('change', evaluate);
  }, []);

  // Once series loads we know content_type. Apply per-type bgColor default:
  // sepia for novels (easy on eyes at night), black for manga.
  /* eslint-disable react-hooks/set-state-in-effect -- reading the same
     localStorage prefs once content_type becomes known; same "can't run
     during render" constraint as the effect above. */
  useEffect(() => {
    if (!series) return;
    try {
      const raw = localStorage.getItem('mangal_reader_prefs');
      const saved = raw ? JSON.parse(raw) : {};
      if (series.content_type === 'novel') {
        setBgColor(saved.novelBgColor ?? '#f5f0e0');
      } else {
        setBgColor(saved.mangaBgColor ?? '#000000');
      }
    } catch {
      setBgColor(series.content_type === 'novel' ? '#f5f0e0' : '#000000');
    }
  }, [series?.content_type]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist whenever a preference changes (skip the very first render so we
  // don't immediately overwrite saved prefs with defaults before they load)
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      // Save bgColor under a type-specific key so novel and manga prefs don't overwrite each other.
      const existing = (() => { try { return JSON.parse(localStorage.getItem('mangal_reader_prefs') || '{}'); } catch { return {}; } })();
      const bgKey = isNovel ? 'novelBgColor' : 'mangaBgColor';
      localStorage.setItem('mangal_reader_prefs', JSON.stringify({ ...existing, modeOverride, fitMode, tapZonesEnabled, imageQuality, [bgKey]: bgColor, fontSize, fontFamily, lineHeight }));
    } catch {
      // ignore storage errors (private browsing, quota, etc.)
    }
  }, [modeOverride, fitMode, tapZonesEnabled, imageQuality, bgColor, prefsLoaded, fontSize, fontFamily, lineHeight]);

  // Effective reading mode = reader's override if set, else the series' default.
  // Novels are always scroll — page-by-page navigation doesn't apply to text.
  const isNovel = series?.content_type === 'novel';
  const effectiveMode: 'scroll' | 'page' = isNovel ? 'scroll' : (modeOverride ?? series?.reading_mode ?? 'scroll');

  // Step 24 — RTL only applies to manga ('mangal') in page mode.
  // Scroll mode and novels are always LTR (continuous vertical reading).
  const isRTL = series?.content_type === 'mangal' && effectiveMode === 'page' && series?.reading_direction === 'rtl';

  // Pulled out of the mount effect above so it can be called again silently
  // (no full-screen spinner, no resetting currentPage/scroll position) when
  // the tab regains focus. `silent` skips setLoading(true) so an in-progress
  // read isn't interrupted by the "Loading chapter..." screen reappearing.
  const loadChapter = async (silent = false) => {
      // Perf fix — the manga pages query (the actual images the reader is
      // here to see) only needs chapterId, which is already known — it
      // doesn't need anything from the chapter row. It used to be fetched
      // dead last, after the chapter row AND an unrelated chapter-nav-list
      // query had both already resolved in sequence. Kicking it off here,
      // in parallel with the chapter fetch, shaves a full round trip off
      // the critical path of every single chapter view — this is the
      // highest-traffic page in the app.
      const pageRowsPromise = supabase
        .from('pages')
        .select('id, page_number, image_url')
        .eq('chapter_id', chapterId)
        .order('page_number', { ascending: true });

      const { data: chapter } = await supabase
        .from('chapters')
        .select('id, chapter_number, title, series_id, content, word_count, author_note_before, author_note_after, tags, is_draft, scheduled_at, series(id, title, reading_mode, content_type, reading_direction, creator_id, cover_url)')
        .eq('id', chapterId)
        .single();

      if (chapter) {
        // Gate: drafts and not-yet-due scheduled chapters aren't readable
        // via direct link — unless the viewer owns the series (creator
        // preview). Fetched fresh here (not from outer userId state) to
        // avoid a race where this runs before the auth-lookup effect finishes.
        const isFutureScheduled = !!chapter.scheduled_at && new Date(chapter.scheduled_at).getTime() > Date.now();
        if (chapter.is_draft || isFutureScheduled) {
          const s0 = Array.isArray(chapter.series) ? chapter.series[0] : chapter.series;
          const { data: authData } = await supabase.auth.getUser();
          const isOwner = !!authData.user && !!s0 && (s0 as { creator_id: string }).creator_id === authData.user.id;
          if (!isOwner) {
            setChapterUnavailable(chapter.is_draft ? 'draft' : 'scheduled');
            setUnavailableUntil(chapter.scheduled_at ?? null);
            if (!silent) setLoading(false);
            return;
          }
          setPreviewingOwnUnpublished(chapter.is_draft ? 'draft' : 'scheduled');
          setUnavailableUntil(chapter.scheduled_at ?? null);
        } else {
          setPreviewingOwnUnpublished(null);
        }
        setChapterUnavailable(null);

        // Step 26 — Read Gate: Check free tier limits (2 chapters/series, 3 series max)
        const seriesId = chapter.series_id;
        const alreadyRead = isChapterAlreadyRead(chapterId);
        
        if (!alreadyRead) {
          // Only count new chapters for gate purposes
          const chaptersInSeries = countChaptersInSeries(seriesId);
          const totalSeriesRead = countUniqueSeries();
          const willHaveReadInSeries = chaptersInSeries + 1;
          const willHaveSeriesRead = totalSeriesRead + (chaptersInSeries === 0 ? 1 : 0); // +1 if new series
          
          // Check limits
          if (willHaveSeriesRead > 3) {
            // 3 series limit reached
            setReadGate({ gated: true, reason: 'series_limit' });
            setChaptersReadThisSeries(chaptersInSeries);
            setUniqueSeriesRead(totalSeriesRead);
            if (!silent) setLoading(false);
            return;
          }
          
          if (willHaveReadInSeries > 2) {
            // 2 chapters per series limit reached
            setReadGate({ gated: true, reason: 'chapter_limit' });
            setChaptersReadThisSeries(chaptersInSeries);
            setUniqueSeriesRead(totalSeriesRead);
            if (!silent) setLoading(false);
            return;
          }
          
          // Gate passed — record this read for next time
          recordChapterRead(chapterId, seriesId);
        }
        
        setReadGate({ gated: false, reason: null });
        setCurrentChapter({ id: chapter.id, chapter_number: chapter.chapter_number, title: chapter.title });
        const s = Array.isArray(chapter.series) ? chapter.series[0] : chapter.series;
        if (s) setSeries(s as SeriesInfo);

        // Novel: store text content; Manga: content/word_count stay null/0
        if (chapter.content) {
          setNovelContent(chapter.content);
          setNovelWordCount(chapter.word_count ?? 0);
        }
        setAuthorNoteBefore(chapter.author_note_before || null);
        setAuthorNoteAfter(chapter.author_note_after || null);
        setChapterTags(Array.isArray(chapter.tags) ? chapter.tags : []);

        // Exclude drafts and not-yet-due scheduled chapters from the sidebar
        // chapter list / prev-next nav, so unpublished chapters never leak
        // through navigation even though this single chapter is allowed.
        const nowIso = new Date().toISOString();
        const { data: chaps } = await supabase
          .from('chapters')
          .select('id, chapter_number, title')
          .eq('series_id', chapter.series_id)
          .eq('is_draft', false)
          .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
          .order('chapter_number', { ascending: true });

        if (chaps) {
          setAllChapters(chaps);
          const idx = chaps.findIndex((c: ChapterNav) => c.id === chapterId);
          setPrevChapter(idx > 0 ? chaps[idx - 1] : null);
          setNextChapter(idx < chaps.length - 1 ? chaps[idx + 1] : null);
        }
      }

      const { data: pageRows } = await pageRowsPromise;
      if (pageRows) setPages(pageRows);
      if (!silent) setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();
        if (profile?.role === 'creator') setIsCreator(true);
      }
    });
  }, []);

  // Reset reader state and reload whenever the chapter param changes (next/
  // prev chapter nav within the same page instance, no full remount).
  /* eslint-disable react-hooks/set-state-in-effect -- resetting pager state
     on navigation between chapters, not a mount-time fetch; genuinely needs
     to run in response to chapterId changing. */
  useEffect(() => {
    setLoading(true);
    setCurrentPage(0);
    lastSavedPage.current = 0;
    loadChapter();
    // Chapter nav now goes through next/link (instant client-side transition,
    // no full page reload — see nav-link conversion below), so scroll position
    // no longer resets for free the way it did with <a href> full reloads.
    // Reset explicitly: window scroll for manga (page + scroll mode both
    // scroll the window), containerRef for novels (their own inner scroll div).
    window.scrollTo(0, 0);
    if (containerRef.current) containerRef.current.scrollTop = 0;
    setResumeApplied(false);
  }, [chapterId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Resume-in-chapter: once we know who's reading and which chapter/series
  // we're in, check for a saved reading_progress row and, if it's for this
  // exact chapter, jump to that spot — page number in page mode, the matching
  // page's position in scroll mode, or the saved scroll % for novels.
  useEffect(() => {
    if (resumeApplied || !userId || !series || !currentChapter) return;
    let cancelled = false;
    (async () => {
      const { data: prog } = await supabase
        .from('reading_progress')
        .select('chapter_id, page_number')
        .eq('reader_id', userId)
        .eq('series_id', series.id)
        .maybeSingle();
      if (cancelled) return;
      if (!prog || prog.chapter_id !== currentChapter.id) { setResumeApplied(true); return; }
      if (isNovel) {
        requestAnimationFrame(() => {
          const el = containerRef.current;
          if (!el) return;
          const scrollable = el.scrollHeight - el.clientHeight;
          if (scrollable > 0) el.scrollTop = (prog.page_number / 100) * scrollable;
        });
      } else if (effectiveMode === 'page') {
        if (pages.length > 0) {
          setCurrentPage(Math.max(0, Math.min(prog.page_number - 1, pages.length - 1)));
          lastSavedPage.current = prog.page_number;
        } else {
          return; // pages haven't loaded yet — retry once they do (effect re-fires on pages.length change)
        }
      } else if (pages.length > 0) {
        requestAnimationFrame(() => {
          pageRefs.current[prog.page_number - 1]?.scrollIntoView({ block: 'start' });
        });
      } else {
        return; // wait for scroll-mode page refs to exist
      }
      setResumeApplied(true);
    })();
    return () => { cancelled = true; };
  }, [userId, series, currentChapter, resumeApplied, isNovel, effectiveMode, pages.length]);


  // Bug fix — a creator editing this exact chapter (title, pages, content)
  // from this same browser, then tabbing/navigating back to read it, was
  // seeing the old version because this page only ever fetched once on
  // mount. Silently refetch whenever the tab/window regains focus, without
  // disrupting an in-progress read (no spinner, no scroll/page reset).
  useEffect(() => {
    const refresh = () => loadChapter(true);
    const handleVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refresh);
    };
  }, [chapterId]);

  // Step 2 — Reading Progress: upsert reader_id+series_id row, debounced so we
  // don't hammer the DB on every scroll tick / page-turn. onConflict matches the
  // UNIQUE(reader_id, series_id) constraint — always overwrites with the latest
  // chapter/page for that series, one row per reader per series.
  const upsertProgress = async (pageNum: number) => {
    if (!userId || !series || !currentChapter) return;
    const sameChapter = lastChapterId.current === currentChapter.id;
    if (sameChapter && pageNum < lastSavedPage.current) return; // don't regress within same chapter
    lastSavedPage.current = pageNum;
    lastChapterId.current = currentChapter.id;
    await supabase.from('reading_progress').upsert(
      {
        reader_id: userId,
        series_id: series.id,
        chapter_id: currentChapter.id,
        page_number: pageNum,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'reader_id,series_id' }
    );
  };

  const scheduleUpsert = (pageNum: number) => {
    if (progressDebounce.current) clearTimeout(progressDebounce.current);
    progressDebounce.current = setTimeout(() => upsertProgress(pageNum), 800);
  };

  // Step 3 — Chapter Reactions: load counts for this chapter (public — no auth
  // needed) plus this reader's own pick (derived from the same rows, so it's
  // one query either way). Re-runs whenever the chapter or the logged-in
  // reader changes.
  useEffect(() => {
    let cancelled = false;
    const loadReactions = async () => {
      const { data } = await supabase.from('reactions').select('emoji, reader_id').eq('chapter_id', chapterId);
      if (cancelled || !data) return;
      const counts: Record<string, number> = {};
      let mine: string | null = null;
      data.forEach(r => {
        counts[r.emoji] = (counts[r.emoji] || 0) + 1;
        if (userId && r.reader_id === userId) mine = r.emoji;
      });
      setReactionCounts(counts);
      setMyReaction(mine);
    };
    loadReactions();
    return () => { cancelled = true; };
  }, [chapterId, userId]);

  // Step 3 — Chapter Reactions: tapping the reader's current pick again removes
  // it; tapping a different emoji upserts (one reaction per reader per chapter,
  // enforced by the UNIQUE(chapter_id, reader_id) constraint). Counts update
  // optimistically; .select() is chained so a silent RLS failure surfaces as an
  // empty result instead of looking successful.
  const handleReact = async (emojiKey: string) => {
    if (!userId) { setPostLoginRedirect(window.location.pathname); window.location.assign('/login'); return; }
    if (reactionLoading) return;
    setReactionLoading(true);
    if (myReaction === emojiKey) {
      const { error } = await supabase.from('reactions').delete().eq('chapter_id', chapterId).eq('reader_id', userId);
      if (!error) {
        setReactionCounts(c => ({ ...c, [emojiKey]: Math.max(0, (c[emojiKey] || 1) - 1) }));
        setMyReaction(null);
      }
    } else {
      const prev = myReaction;
      const { data, error } = await supabase
        .from('reactions')
        .upsert({ chapter_id: chapterId, reader_id: userId, emoji: emojiKey }, { onConflict: 'chapter_id,reader_id' })
        .select();
      if (!error && data && data.length > 0) {
        setReactionCounts(c => {
          const next = { ...c };
          if (prev) next[prev] = Math.max(0, (next[prev] || 1) - 1);
          next[emojiKey] = (next[emojiKey] || 0) + 1;
          return next;
        });
        setMyReaction(emojiKey);
      }
    }
    setReactionLoading(false);
  };

  // Step 5 — Load all comments + replies in one query, then nest replies under parents.
  useEffect(() => {
    let cancelled = false;
    const loadComments = async () => {
      setCommentsLoading(true);
      const { data } = await supabase
        .from('comments')
        .select('id, reader_id, body, created_at, parent_id, profiles(full_name)')
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (data) {
        const flat: CommentRow[] = data.map((r: CommentQueryRow) => ({
          id: r.id,
          reader_id: r.reader_id,
          body: r.body,
          created_at: r.created_at,
          parent_id: r.parent_id || null,
          full_name: (Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name) || 'Reader',
          replies: [],
        }));
        // Nest replies one level deep
        const topLevel: CommentRow[] = [];
        const byId: Record<string, CommentRow> = {};
        flat.forEach(c => { byId[c.id] = c; });
        flat.forEach(c => {
          if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].replies!.push(c);
          else topLevel.push(c);
        });
        setComments(topLevel);
      }
      setCommentsLoading(false);
    };
    loadComments();
    return () => { cancelled = true; };
  }, [chapterId]);

  // Step 4 — Submit a top-level comment.
  const handleCommentSubmit = async () => {
    if (!userId) { setPostLoginRedirect(window.location.pathname); window.location.assign('/login'); return; }
    const body = commentBody.trim();
    if (!body || body.length > 500 || commentSubmitting) return;
    setCommentSubmitting(true);
    const { data, error } = await supabase
      .from('comments')
      .insert({ chapter_id: chapterId, reader_id: userId, body, parent_id: null })
      .select('id, reader_id, body, created_at, parent_id, profiles(full_name)');
    if (!error && data && data.length > 0) {
      const r = data[0] as CommentQueryRow;
      setComments(c => [...c, {
        id: r.id, reader_id: r.reader_id, body: r.body,
        created_at: r.created_at, parent_id: null,
        full_name: (Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name) || 'Reader', replies: [],
      }]);
      setCommentBody('');
    }
    setCommentSubmitting(false);
  };

  // Step 5 — Submit a reply to a top-level comment.
  const handleReplySubmit = async (parentId: string) => {
    if (!userId) { setPostLoginRedirect(window.location.pathname); window.location.assign('/login'); return; }
    const body = replyBody.trim();
    if (!body || body.length > 500 || replySubmitting) return;
    setReplySubmitting(true);
    const { data, error } = await supabase
      .from('comments')
      .insert({ chapter_id: chapterId, reader_id: userId, body, parent_id: parentId })
      .select('id, reader_id, body, created_at, parent_id, profiles(full_name)');
    if (!error && data && data.length > 0) {
      const r = data[0] as CommentQueryRow;
      const newReply: CommentRow = {
        id: r.id, reader_id: r.reader_id, body: r.body,
        created_at: r.created_at, parent_id: parentId,
        full_name: (Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name) || 'Reader', replies: [],
      };
      setComments(c => c.map(top => top.id === parentId
        ? { ...top, replies: [...(top.replies || []), newReply] }
        : top
      ));
      setReplyBody('');
      setReplyingTo(null);
    }
    setReplySubmitting(false);
  };

  // Step 4 — Delete own comment. Optimistic, but rolled back on failure —
  // previously the DB delete's result was never checked, so an RLS block or
  // network failure left the comment removed from the UI while still sitting
  // in the DB, only to reappear confusingly on the next reload. Same
  // silent-failure gotcha already fixed elsewhere in this app (EditSeriesModal
  // etc) via checking the actual result instead of assuming success.
  const handleDeleteComment = async (commentId: string, parentId?: string | null) => {
    const prevComments = comments;
    if (parentId) {
      setComments(c => c.map(top => top.id === parentId
        ? { ...top, replies: (top.replies || []).filter(r => r.id !== commentId) }
        : top
      ));
    } else {
      setComments(c => c.filter(x => x.id !== commentId));
    }
    const { error, count } = await supabase
      .from('comments')
      .delete({ count: 'exact' })
      .eq('id', commentId)
      .eq('reader_id', userId!);
    if (error || !count) setComments(prevComments);
  };

  // Content protection
  useEffect(() => {
    const blockContext = (e: MouseEvent) => e.preventDefault();
    const blockKeys = (e: KeyboardEvent) => {
      const blocked = (e.ctrlKey && ['s','S','c','C','u','U','p','P'].includes(e.key)) || e.key === 'PrintScreen';
      if (blocked) e.preventDefault();
    };
    const blockDrag = (e: DragEvent) => e.preventDefault();
    // Note: selectstart prevention removed — it could block touch-scroll on some
    // mobile browsers. Selection is already prevented via userSelect:none CSS.
    document.addEventListener('contextmenu', blockContext);
    document.addEventListener('keydown', blockKeys);
    document.addEventListener('dragstart', blockDrag);
    return () => {
      document.removeEventListener('contextmenu', blockContext);
      document.removeEventListener('keydown', blockKeys);
      document.removeEventListener('dragstart', blockDrag);
    };
  }, []);

  // Sprint 3 → Sprint 5 — "Fullscreen" is now SIMULATED via CSS/state, not the
  // real browser Fullscreen API. On mobile, requestFullscreen() locks out
  // pinch-zoom at the browser-chrome level (a platform restriction, not
  // something touchAction/overflow CSS can override) — so true fullscreen and
  // working pinch-zoom were mutually exclusive. This toggle just flips
  // isFullscreen directly: the existing edge-to-edge layout (maxWidth: 'none',
  // etc. — search isFullscreen below) already gives the same expanded-reading
  // look without ever calling the real Fullscreen API, so the page never
  // leaves the normal viewport/zoom context and pinch-zoom keeps working.
  // BUG FIX (round 2): founder wants *real* fullscreen — hiding the mobile
  // browser's own address bar / status bar chrome (top red circle in the
  // screenshot), not just our internal layout. That needs the actual
  // Fullscreen API (Element.requestFullscreen), not the simulated
  // CSS-only version from before. Trade-off, stated plainly rather than
  // hidden: iOS Safari doesn't support requestFullscreen on non-<video>
  // elements at all, and calling it can suspend pinch-zoom on some mobile
  // browsers (the original reason this was simulated) — the try/catch
  // below means the button still does the CSS-only edge-to-edge fallback
  // even where the real API is unavailable or rejects the call, so it's
  // never a silent no-op.
  const toggleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const goingFullscreen = !isFullscreen;
    try {
      if (goingFullscreen) {
        // Request on document.documentElement, not this component's own
        // rootRef div — that div gets unmounted and replaced by a fresh one
        // on every chapter navigation (different route param), and the
        // Fullscreen API auto-exits the instant its target element leaves
        // the DOM. <html> never unmounts during client-side nav, so
        // fullscreen actually survives clicking "Next Chapter" this way.
        await document.documentElement.requestFullscreen?.();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Real Fullscreen API unsupported/denied — fall through to the
      // simulated layout change below regardless.
    }
    setIsFullscreen(goingFullscreen);
    if (goingFullscreen) {
      setShowUI(false);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else {
      setLockScreen(false); // leaving fullscreen always exits lock screen too
      setShowUI(true);
    }
  };

  // Keep `isFullscreen` in sync with the browser's real fullscreen state.
  // Two things this covers:
  // 1) The user exits via the browser's own UI (Esc key, swipe-down gesture,
  //    back button) rather than our button — 'fullscreenchange' fires and we
  //    fall back to normal layout instead of getting stuck showing an
  //    edge-to-edge layout with no chrome to escape it.
  // 2) Founder's ask: fullscreen must survive clicking "Next Chapter". Next.js
  //    client-side navigation to `/WebMangal/read/[chapterId]` swaps this
  //    component for a fresh instance (different route param = different
  //    key), which resets `isFullscreen` state to false — but it does NOT
  //    reload the document, so the browser's real fullscreen mode is
  //    actually still active underneath. This re-syncs our state to match
  //    on mount instead of dropping back to a windowed-looking layout while
  //    the browser chrome is still hidden.
  useEffect(() => {
    const syncFullscreenState = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (!active) setLockScreen(false);
    };
    document.addEventListener('fullscreenchange', syncFullscreenState);
    syncFullscreenState();
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  // Lock Screen — strips every control except the one transient exit affordance.
  // Closes any open panels so nothing is left mid-open behind the locked view.
  const toggleLockScreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLockScreen(v => {
      const next = !v;
      if (next) { setShowSidebar(false); setShowSettings(false); }
      return next;
    });
    resetHideTimer();
  };

  const resetHideTimer = () => {
    setShowUI(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!showSidebar && !showSettings) setShowUI(false);
    }, 4000);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (effectiveMode === 'page') {
        // Step 24 — RTL: physical ArrowRight = go back (prev), ArrowLeft = go forward (next).
        // Up/Down always mean prev/next regardless of direction.
        const nextKey = isRTL ? 'ArrowLeft' : 'ArrowRight';
        const prevKey = isRTL ? 'ArrowRight' : 'ArrowLeft';
        if (e.key === nextKey || e.key === 'ArrowDown') setCurrentPage(p => Math.min(p + 1, pages.length - 1));
        if (e.key === prevKey || e.key === 'ArrowUp') setCurrentPage(p => Math.max(p - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [effectiveMode, isRTL, pages]);

  // Step 2 — Reading Progress: page mode writes on every page turn
  //
  // Bug fix — this fired on every currentPage change including the very
  // first render after a chapter loads (currentPage resets to 0), which
  // scheduled an 800ms-debounced save of page 1 immediately. On a slow
  // connection that debounce can fire before the resume-in-chapter lookup
  // above finishes its own round trip, silently overwriting the saved
  // progress this chapter was trying to restore, right before it gets
  // read back. Gating on resumeApplied means nothing gets saved until we
  // know whether there was something to resume in the first place.
  useEffect(() => {
    if (!resumeApplied) return;
    if (effectiveMode !== 'page') return;
    if (!userId || !series || !currentChapter || pages.length === 0) return;
    scheduleUpsert(currentPage + 1);
  }, [currentPage, effectiveMode, userId, series, currentChapter, pages.length, resumeApplied]);

  // Step 2 — Reading Progress: scroll mode writes when a page crosses 50% visible
  useEffect(() => {
    if (!resumeApplied) return;
    if (effectiveMode !== 'scroll' || pages.length === 0) return;
    if (!userId || !series || !currentChapter) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const idx = pageRefs.current.findIndex(el => el === entry.target);
          if (idx !== -1) scheduleUpsert(idx + 1);
        });
      },
      { threshold: 0.5 }
    );
    pageRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [effectiveMode, pages, userId, series, currentChapter, resumeApplied]);

  // Step 21 — Novel Reading Progress: tracks scroll % through the text container.
  // page_number is repurposed as a 1–100 integer (percent complete) for novels
  // since novels have no discrete pages array to track via IntersectionObserver.
  // Also drives the visual progress bar at the top of the screen — that part
  // runs regardless of login state (and regardless of resumeApplied — a guest
  // or first-visit reader should still see the bar move), only the actual save
  // to reading_progress is gated on the resume check having settled first.
  useEffect(() => {
    if (!isNovel || !containerRef.current) return;
    const el = containerRef.current;
    const onScroll = () => {
      const scrollable = el.scrollHeight - el.clientHeight;
      if (scrollable <= 0) return;
      const pct = Math.round((el.scrollTop / scrollable) * 100);
      setScrollPercent(pct);
      if (resumeApplied && userId && series && currentChapter) scheduleUpsert(pct);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isNovel, userId, series, currentChapter, resumeApplied]);
  // (width / screen / actual) instead of a fixed width:100% + numeric zoom
  const getImgStyle = (): React.CSSProperties => {
    // pointerEvents:'none' is intentionally removed — it was blocking touch-scroll on mobile.
    // draggable={false} + context-menu prevention already protect against saving/dragging.
    const base: React.CSSProperties = { display: 'block', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'pan-y pinch-zoom' };
    if (fitMode === 'actual') {
      // True pixel size — no scaling. Container handles horizontal scroll if it overflows.
      return { ...base, width: 'auto', height: 'auto', maxWidth: 'none' };
    }
    if (fitMode === 'screen' && effectiveMode === 'page') {
      // Image height matches the viewport (minus top bar) — standard manga "fit to screen"
      return { ...base, width: 'auto', height: 'calc(100vh - 56px)', maxWidth: '100%', objectFit: 'contain', margin: '0 auto' };
    }
    // Default: fit-width — also what Scroll mode always uses, since continuous
    // scroll reading doesn't benefit from per-image screen-fit the way Page mode does
    return { ...base, width: '100%', height: 'auto' };
  };

  // "Up Next" end-of-chapter card — the big tappable cover+title block Webtoon/
  // WebNovel show right after the last panel/paragraph, instead of leaving the
  // reader to hunt for a small "Next" pill. Falls back to a plain gradient tile
  // (no broken-image icon) when the series has no cover_url set yet.
  const renderUpNextCard = () => {
    if (!nextChapter) return null;
    return (
      <Link
        href={`/WebMangal/read/${nextChapter.id}`}
        style={{
          display: 'flex', alignItems: 'center', gap: '14px', width: '100%', maxWidth: '520px',
          margin: '0 auto', padding: '12px', borderRadius: '14px', textDecoration: 'none',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          transition: 'transform 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#d97706'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
      >
        <div style={{
          width: '56px', height: '56px', borderRadius: '10px', flexShrink: 0, overflow: 'hidden',
          background: series?.cover_url ? undefined : 'linear-gradient(135deg, #7f1d1d, #d97706)',
        }}>
          {series?.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element -- small fixed-size thumbnail from a dynamic Supabase URL
            <img src={series.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#d97706', marginBottom: '2px' }}>Up Next</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Chapter {nextChapter.chapter_number}{nextChapter.title ? ` — ${nextChapter.title}` : ''}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>Continue reading</div>
        </div>
        <ChevronRight size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />
      </Link>
    );
  };

  // Sprint 4 — tap-zone navigation: left third of the image container = previous,
  // right third = next, middle third = no-op (lets tap-to-toggle-UI happen normally).
  // Measured against the container's own bounds (not window width) so this works
  // correctly on wide desktop screens too, where the reading column is centered
  // and narrower than the full viewport.
  const handleContentTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tapZonesEnabled && !lockScreen) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const w = rect.width;
    if (relativeX < w * 0.3) {
      // Step 24 — RTL: left zone = next page (manga reads right-to-left)
      if (effectiveMode === 'page') setCurrentPage(p => isRTL ? Math.min(p + 1, pages.length - 1) : Math.max(p - 1, 0));
      else window.scrollBy({ top: -window.innerHeight * 0.85, behavior: 'smooth' });
    } else if (relativeX > w * 0.7) {
      // Step 24 — RTL: right zone = prev page
      if (effectiveMode === 'page') setCurrentPage(p => isRTL ? Math.max(p - 1, 0) : Math.min(p + 1, pages.length - 1));
      else window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' });
    }
  };

  // Image quality: routes images through Supabase Storage's image transform
  // endpoint (lower width + quality) when the reader is on 'low', or when
  // 'auto' has resolved to 'low' based on detected connection speed. 720px
  // width is a deliberate floor — even the compact tier stays readable —
  // never go lower. Requires image transformations to be enabled on the
  // Supabase project (Pro plan or self-hosted imgproxy); if not enabled the
  // request 400s and onError below falls back to the original image.
  const effectiveImageQuality: 'low' | 'high' = imageQuality === 'auto' ? autoResolvedQuality : imageQuality;
  const getImageSrc = (url: string): string => {
    if (effectiveImageQuality !== 'low' || !url.includes('/object/public/')) return url;
    const transformed = url.replace('/object/public/', '/render/image/public/');
    return `${transformed}${transformed.includes('?') ? '&' : '?'}width=720&quality=65`;
  };
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>, originalUrl: string) => {
    if (e.currentTarget.src !== originalUrl) {
      e.currentTarget.src = originalUrl; // transform unsupported/failed — fall back to original
    }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', overflowX: 'hidden' }}>

      {/* Fake top bar skeleton */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '52px', background: 'var(--nav-bg)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', gap: '12px',
      }}>
        {/* left: back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--border-color)' }} />
          <div style={{ width: '120px', height: '14px', borderRadius: '6px', background: 'var(--border-color)' }} />
        </div>
        {/* right: icons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--border-color)' }} />
          ))}
        </div>
      </div>

      {/* Fake page content — shimmer strips simulating manga panels */}
      <div style={{ paddingTop: '52px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        {/* Big panel 1 */}
        <div style={{
          width: '100%', maxWidth: '720px',
          height: '60vh',
          background: 'linear-gradient(90deg, var(--bg-card) 0%, var(--border-color) 50%, var(--bg-card) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite',
        }} />
        {/* Panel 2 */}
        <div style={{
          width: '100%', maxWidth: '720px',
          height: '35vh',
          background: 'linear-gradient(90deg, var(--bg-card) 0%, var(--border-color) 50%, var(--bg-card) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite 0.2s',
        }} />
      </div>

      {/* Fake bottom progress bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: '3px', background: 'var(--border-color)',
      }}>
        <div style={{
          width: '0%', height: '100%',
          background: 'linear-gradient(90deg, #7f1d1d, #d97706)',
          animation: 'progressFill 1.5s ease-out forwards',
        }} />
      </div>

      {/* Loading label */}
      <div style={{
        position: 'fixed', bottom: '18px', left: 0, right: 0,
        textAlign: 'center', fontSize: '12px', color: 'var(--text-faint)',
        letterSpacing: '0.08em',
      }}>
        Loading chapter...
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes progressFill {
          0%   { width: 0%; }
          60%  { width: 70%; }
          100% { width: 85%; }
        }
      `}</style>
    </div>
  );

  // Draft / not-yet-due scheduled chapter — not readable via direct link.
  if (chapterUnavailable) {
    return (
      <div style={{ width: '100vw', minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', }}>
        <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '400px', height: '400px', borderRadius: '50%', background: 'rgba(217,119,6,0.05)', filter: 'blur(100px)' }} />
        <div style={{ maxWidth: '480px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>{chapterUnavailable === 'scheduled' ? <CalendarClock size={64} /> : <FileText size={64} />}</div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
            {chapterUnavailable === 'scheduled' ? 'Not Out Yet' : 'Still a Draft'}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: 1.6 }}>
            {chapterUnavailable === 'scheduled' && unavailableUntil
              ? `This chapter is scheduled to publish on ${new Date(unavailableUntil).toLocaleString()}.`
              : "This chapter hasn't been published by its creator yet."}
          </p>
          <button
            onClick={() => window.history.back()}
            style={{
              padding: '14px 24px', borderRadius: '10px', border: '1px solid var(--border-color)',
              background: 'transparent', color: '#d97706', fontSize: '14px', fontWeight: 700,
              cursor: 'pointer', width: '100%',
            }}
          >
            <ArrowLeft size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Go Back
          </button>
        </div>
      </div>
    );
  }

  // Step 26 — Read Gate screen (appears when free tier limits are hit)
  if (readGate.gated && readGate.reason) {
    return (
      <div style={{ width: '100vw', minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', }}>
        {/* Background accent */}
        <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '400px', height: '400px', borderRadius: '50%', background: 'rgba(217,119,6,0.05)', filter: 'blur(100px)' }} />
        
        <div style={{ maxWidth: '480px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          {/* Icon */}
          <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}><BookOpen size={64} /></div>
          
          {/* Title */}
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
            {readGate.reason === 'chapter_limit' ? 'Aur Padh Liye?' : 'Kahaniyaan Khatm?'}
          </h1>
          
          {/* Subtitle */}
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
            {readGate.reason === 'chapter_limit' 
              ? `Tum ne is kahani ke ${chaptersReadThisSeries} chapters padh liye! Unlimited padhne ke liye upgrade karo.`
              : `Tum ne ${uniqueSeriesRead} kahaniyaan padh li. ${uniqueSeriesRead > 0 ? 'Saari kahaniyaan khojne ke liye' : 'Aur kahaniyaan padne ke liye'} upgrade karo.`
            }
          </p>
          
          {/* Stats box */}
          <div style={{ background: 'linear-gradient(135deg, rgba(217,119,6,0.1), rgba(153,27,27,0.1))', border: '1px solid rgba(217,119,6,0.2)', borderRadius: '12px', padding: '16px', marginBottom: '32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Free Tier Limit</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#d97706' }}>2 Chapter/Series</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Tumhare Paas</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{chaptersReadThisSeries} Chapter</div>
              </div>
            </div>
          </div>
          
          {/* CTA buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={() => {
                // Upgrade CTA — for now, navigate to /login or show a message
                // In the future, this would open a payment flow
                setPostLoginRedirect(window.location.pathname);
                window.location.href = '/login';
              }}
              style={{
                padding: '14px 24px', borderRadius: '10px', border: 'none',
                background: 'linear-gradient(135deg, #f97316, #22c55e)',
                color: '#fff', fontSize: '14px', fontWeight: 700,
                cursor: 'pointer', width: '100%', transition: 'all 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #ea580c, #16a34a)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #f97316, #22c55e)')}
            >
              <Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Unlimited Unlock Karo
            </button>
            
            <button
              onClick={() => window.history.back()}
              style={{
                padding: '14px 24px', borderRadius: '10px', border: '1px solid var(--border-color)',
                background: 'transparent', color: '#d97706', fontSize: '14px', fontWeight: 700,
                cursor: 'pointer', width: '100%',
              }}
            >
              <ArrowLeft size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Wapas Jao
            </button>
          </div>
          
          {/* Footer text */}
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '24px', lineHeight: 1.5 }}>
            Unlimited reading, unlimited creativity. Sabhi creators ko support karo!
          </p>
        </div>
      </div>
    );
  }

  const progress = pages.length > 0 ? ((currentPage + 1) / pages.length) * 100 : 0;

  return (
    <div
      ref={rootRef}
      style={{ position: 'fixed', inset: 0, backgroundColor: bgColor, userSelect: 'none', overflow: 'hidden' }}
      onContextMenu={e => e.preventDefault()}
    >
    {/* Lock Screen: hides the native browser scrollbar so nothing but the chosen
        reading interaction (scroll-drag or page-swipe) is visible. The container
        still scrolls/swipes exactly as before — only the visual scrollbar track
        is suppressed, and only while locked. */}
    {lockScreen && (
      <style>{`.mangal-reader-scroll.lock-mode{scrollbar-width:none;-ms-overflow-style:none;}
.mangal-reader-scroll.lock-mode::-webkit-scrollbar{display:none;width:0;height:0;}`}</style>
    )}

    {/* Inner scroll container — scrolls in both normal and fullscreen mode.
        FIX (pinch-zoom on mobile): overflowX changed from 'hidden' to 'visible'.
        'hidden' on this ancestor was clamping/suppressing the pinch-zoom gesture
        in Scroll mode on mobile WebKit/Chromium — zoomed content needs room to
        visually overflow its container to render at all. The root wrapper above
        still has overflow:hidden and clips at the true viewport edge, and the
        inner content's own maxWidth keeps things from scrolling sideways during
        normal (non-zoomed) reading, so this doesn't introduce a stray horizontal
        scrollbar. Page mode was already overflowX:'visible' on its image wrapper,
        which is why pinch-zoom worked there but not in Scroll mode. */}
    <div
      className={`mangal-reader-scroll${lockScreen ? ' lock-mode' : ''}`}
      style={{ position: 'absolute', inset: 0, overflowY: 'auto', overflowX: 'visible', touchAction: 'pan-y pinch-zoom' }}
      onMouseMove={resetHideTimer}
      onScroll={() => { if (lockScreen) resetHideTimer(); }}
      onClick={() => { resetHideTimer(); setShowSidebar(false); setShowSettings(false); }}
    >

      {/* ── TOP BAR ──
          Mobile fix: the right-side control cluster (theme toggle, optional
          Studio pill, Chapters/Fullscreen/Lock/Settings — all fixed-width,
          flexShrink:0) doesn't wrap, so on a narrow phone — worst case a
          creator viewing in fullscreen, which adds the Lock Screen button
          too — it was wider than the available space next to the left
          title block and got pushed off past the viewport edge (clipped by
          the page's overflowX:hidden, i.e. Settings became untappable).
          The left title block already had minWidth:0/ellipsis so it
          absorbed the squeeze instead of the overflow surfacing there.
          Under 480px: Studio drops to icon-only, "Back" drops to just the
          arrow, and padding/gaps tighten — same .mangal-*-under-480 pattern
          as the KaTube-pill fix on Kalpana Circle's nav. */}
      <style>{`
        @media (max-width: 480px) {
          .mangal-reader-topbar { padding: 0 10px !important; }
          .mangal-reader-right { gap: 4px !important; }
          .mangal-reader-back-text { display: none; }
          .mangal-reader-back { padding: 6px 9px !important; }
          .mangal-reader-studio { padding: 6px 8px !important; }
          .mangal-reader-studio-text { display: none; }
        }
      `}</style>
      {!lockScreen && (
      <div className="mangal-reader-topbar" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: '56px',
        background: 'var(--nav-bg)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-color)',
        transition: 'opacity 0.3s, transform 0.3s',
        opacity: showUI ? 1 : 0,
        transform: showUI ? 'translateY(0)' : 'translateY(-100%)',
      }}>
        {isNovel && (
          <div style={{ position: 'absolute', bottom: '-2px', left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ width: `${scrollPercent}%`, height: '100%', background: '#d97706', transition: 'width 0.15s linear' }} />
          </div>
        )}
        {/* Left: Back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <Link href={series ? `/WebMangal/series/${series.id}` : '/'} className="mangal-reader-back" style={{
            display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px',
            padding: '6px 12px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '12px',
          }}><ArrowLeft size={14} /><span className="mangal-reader-back-text"> Back</span></Link>
          <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', flexShrink: 0 }} />
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {series?.title}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {currentChapter?.title || `Chapter ${currentChapter?.chapter_number}`}
              {isNovel && (
                <span style={{ color: '#d97706', marginLeft: '6px' }}>{scrollPercent}%</span>
              )}
              {effectiveMode === 'page' && pages.length > 0 && (
                <span style={{ color: '#d97706', marginLeft: '6px' }}>{currentPage + 1}/{pages.length}</span>
              )}
              {/* Step 24 — RTL indicator badge */}
              {isRTL && (
                <span style={{
                  marginLeft: '6px', padding: '1px 5px', borderRadius: '4px',
                  background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.3)',
                  color: '#d97706', fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em',
                }}>RTL</span>
              )}
            </div>
          </div>
        </div>

        {/* Right controls */}
        <div className="mangal-reader-right" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <ThemeToggle size={32} />
          {/* Creator-only: Go to Dashboard */}
          {isCreator && (
            <Link href="/dashboard" onClick={e => e.stopPropagation()} className="mangal-reader-studio" style={{
              padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
              background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.25)',
              color: '#d97706', textDecoration: 'none', whiteSpace: 'nowrap',
            }}><Wrench size={14} /><span className="mangal-reader-studio-text"> Studio</span></Link>
          )}

          {/* Chapter list toggle */}
          <button
            onClick={e => { e.stopPropagation(); setShowSidebar(s => !s); setShowSettings(false); }}
            style={{ ...topBtn, background: showSidebar ? 'var(--border-color)' : 'var(--bg-card)', color: showSidebar ? '#d97706' : 'var(--text-secondary)' }}
            title="Chapters"
          ><Menu size={16} /></button>

          {/* Zoom controls removed in Sprint 4 — replaced by Fit mode in Settings panel */}

          {/* Fullscreen toggle (Sprint 3) */}
          <button
            onClick={toggleFullscreen}
            style={{ ...topBtn, background: isFullscreen ? 'var(--border-color)' : 'var(--bg-card)', color: isFullscreen ? '#d97706' : 'var(--text-secondary)' }}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >{isFullscreen ? <Shrink size={16} /> : <Expand size={16} />}</button>

          {/* Lock Screen toggle — BUG FIX: previously gated behind `isFullscreen &&`,
              so the button only appeared once fullscreen was toggled on, which read
              as "lock isn't there" since nothing about locking itself needs
              fullscreen to work (toggleLockScreen never reads isFullscreen). Now
              always visible in the top bar like the other reader controls. */}
          <button
            onClick={toggleLockScreen}
            style={{ ...topBtn, background: lockScreen ? 'var(--border-color)' : 'var(--bg-card)', color: lockScreen ? '#d97706' : 'var(--text-secondary)' }}
            title="Lock Screen"
          ><Lock size={16} /></button>

          {/* Settings */}
          <button
            onClick={e => { e.stopPropagation(); setShowSettings(s => !s); setShowSidebar(false); }}
            style={{ ...topBtn, background: showSettings ? 'var(--border-color)' : 'var(--bg-card)', color: showSettings ? '#d97706' : 'var(--text-secondary)' }}
            title="Settings"
          ><Settings size={16} /></button>
        </div>
      </div>
      )}

      {/* ── PROGRESS BAR (page mode) ── */}
      {!lockScreen && effectiveMode === 'page' && (
        <div style={{
          position: 'fixed', top: showUI ? '56px' : '0', left: 0, right: 0, height: '3px',
          background: 'var(--border-color)', zIndex: 199, transition: 'top 0.3s',
        }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #7f1d1d, #d97706)', transition: 'width 0.2s' }} />
        </div>
      )}

      {/* ── LOCK SCREEN: the only thing rendered besides the page content itself.
          Transient, same idle/reveal timing as the normal top bar (mouse move,
          tap, or scroll resets the timer) — fades in then auto-hides. ── */}
      {lockScreen && (
        <button
          onClick={toggleLockScreen}
          title="Exit Lock Screen"
          style={{
            position: 'fixed', top: '14px', right: '14px', zIndex: 400,
            width: '34px', height: '34px', borderRadius: '17px',
            border: '1px solid var(--border-color)', background: 'var(--nav-bg-transparent)', backdropFilter: 'blur(8px)',
            color: 'var(--text-secondary)', fontSize: '15px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'opacity 0.3s', opacity: showUI ? 1 : 0,
            pointerEvents: showUI ? 'auto' : 'none',
          }}
        ><Unlock size={16} /></button>
      )}

      {/* ── FULLSCREEN EXIT — BUG FIX: the only way to exit fullscreen before
          was the Shrink icon inside the top bar, but entering fullscreen now
          immediately hides that whole bar (see toggleFullscreen), so the exit
          control vanished along with it — read as "no exit option". This is a
          dedicated, always-visible (not tied to the auto-hide timer) corner
          button, same pattern video players use, so there's never a moment in
          fullscreen with no obvious way out. Not shown during lock screen,
          which already has its own dedicated exit button above. ── */}
      {isFullscreen && !lockScreen && (
        <button
          onClick={toggleFullscreen}
          title="Exit fullscreen"
          style={{
            position: 'fixed', top: '14px', right: '14px', zIndex: 400,
            width: '34px', height: '34px', borderRadius: '17px',
            border: '1px solid var(--border-color)', background: 'var(--nav-bg-transparent)', backdropFilter: 'blur(8px)',
            color: 'var(--text-secondary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0.6, transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; }}
        ><Shrink size={16} /></button>
      )}

      {/* ── CHAPTER SIDEBAR ── */}
      {!lockScreen && (
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(280px, 84vw)', zIndex: 300,
          background: 'var(--bg-primary)', borderLeft: '1px solid var(--border-color)',
          transform: showSidebar ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex', flexDirection: 'column',
          boxShadow: showSidebar ? '-8px 0 40px rgba(0,0,0,0.7)' : 'none',
        }}
      >
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Chapters</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{series?.title}</div>
          </div>
          <button onClick={() => setShowSidebar(false)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '18px', cursor: 'pointer', padding: '0 4px', lineHeight: 1, display: 'inline-flex' }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {allChapters.map(ch => (
            <Link key={ch.id} href={`/WebMangal/read/${ch.id}`} style={{
              display: 'block', padding: '11px 14px', borderRadius: '8px', textDecoration: 'none',
              background: ch.id === chapterId ? 'rgba(217,119,6,0.12)' : 'transparent',
              border: `1px solid ${ch.id === chapterId ? 'rgba(217,119,6,0.25)' : 'transparent'}`,
              marginBottom: '3px', transition: 'background 0.15s',
            }}>
              <div style={{ fontSize: '13px', fontWeight: ch.id === chapterId ? 700 : 400, color: ch.id === chapterId ? '#d97706' : 'var(--text-secondary)' }}>
                Ch.{ch.chapter_number}{ch.title ? ` — ${ch.title}` : ''}
              </div>
            </Link>
          ))}
        </div>

        {/* Prev/Next at bottom of sidebar */}
        <div style={{ padding: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
          {prevChapter ? (
            <Link href={`/WebMangal/read/${prevChapter.id}`} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '12px', fontWeight: 600, textAlign: 'center' }}>
              <ArrowLeft size={12} style={{ verticalAlign: 'middle' }} /> Ch.{prevChapter.chapter_number}
            </Link>
          ) : <div style={{ flex: 1 }} />}
          {nextChapter ? (
            <Link href={`/WebMangal/read/${nextChapter.id}`} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'linear-gradient(135deg, #f97316, #22c55e)', color: '#fff', textDecoration: 'none', fontSize: '12px', fontWeight: 700, textAlign: 'center', border: 'none' }}>
              Ch.{nextChapter.chapter_number} <ChevronRight size={12} style={{ verticalAlign: 'middle' }} />
            </Link>
          ) : <div style={{ flex: 1 }} />}
        </div>
      </div>
      )}

      {/* ── SETTINGS PANEL (Sprint 4) ── */}
      {!lockScreen && (
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: '64px', right: showSettings ? '16px' : '-100vw', zIndex: 250,
          width: 'min(240px, 82vw)', maxHeight: 'calc(100vh - 96px)', overflowY: 'auto',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '12px', padding: '16px',
          transition: 'right 0.2s',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>Settings</div>

        {/* Reading Mode — manga only */}
        {!isNovel && (<>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Reading Mode</div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          <button onClick={() => setModeOverride('scroll')} style={settingsBtn(effectiveMode === 'scroll')}><ScrollText size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Scroll</button>
          <button onClick={() => setModeOverride('page')} style={settingsBtn(effectiveMode === 'page')}><BookOpen size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Page</button>
        </div>
        {modeOverride && modeOverride !== series?.reading_mode && (
          <button onClick={() => setModeOverride(null)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '10px', textDecoration: 'underline', cursor: 'pointer', padding: 0, marginBottom: '14px', display: 'block' }}>
            Reset to creator&#x2019;s default
          </button>
        )}
        <div style={{ height: '1px', background: 'var(--border-color)', margin: '14px 0' }} />
        </>)}

        {/* Theme */}
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Theme</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
          {(isNovel ? [
            { c: '#f5f0e0', label: 'Sepia' },
            { c: '#ffffff', label: 'Light' },
            { c: '#1a1a1a', label: 'Dim' },
            { c: '#0d0d0d', label: 'Dark' },
            { c: '#000000', label: 'Black' },
          ] : [
            { c: '#000000', label: 'Black' },
            { c: '#0d0d0d', label: 'Dark' },
            { c: '#1a1a1a', label: 'Dim' },
            { c: '#ffffff', label: 'Light' },
            { c: '#f5f0e0', label: 'Sepia' },
          ]).map(({ c, label }) => (
            <button key={c} onClick={() => setBgColor(c)} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 8px', borderRadius: '8px', textAlign: 'left',
              background: bgColor === c ? 'rgba(217,119,6,0.12)' : 'transparent',
              border: bgColor === c ? '1px solid rgba(217,119,6,0.3)' : '1px solid transparent',
              cursor: 'pointer',
            }}>
              <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: c, border: '1px solid var(--border-color)', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: bgColor === c ? '#d97706' : 'var(--text-secondary)', fontWeight: bgColor === c ? 700 : 400 }}>{label}</span>
            </button>
          ))}
        </div>

        <div style={{ height: '1px', background: 'var(--border-color)', margin: '14px 0' }} />

        {/* Font Size — novels only */}
        {isNovel && (<>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Font Size</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <button onClick={() => setFontSize(v => Math.max(14, v - 1))} style={{ ...settingsBtn(false), flex: 'none', width: '28px', textAlign: 'center', padding: '6px 0' }}>A<Minus size={10} style={{ verticalAlign: 'middle' }} /></button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: '13px', color: '#d97706', fontWeight: 700 }}>{fontSize}px</div>
          <button onClick={() => setFontSize(v => Math.min(24, v + 1))} style={{ ...settingsBtn(false), flex: 'none', width: '28px', textAlign: 'center', padding: '6px 0' }}>A<Plus size={10} style={{ verticalAlign: 'middle' }} /></button>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Font</div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          {([
            { v: 'serif', label: 'Serif', preview: "'Georgia', 'Noto Serif', serif" },
            { v: 'sans', label: 'Sans', preview: "'Inter', 'Helvetica Neue', sans-serif" },
            { v: 'dyslexic', label: 'Easy-Read', preview: "'Comic Sans MS', 'Comic Sans', cursive" },
          ] as const).map((f) => (
            <button key={f.v} onClick={() => setFontFamily(f.v)} style={{
              ...settingsBtn(fontFamily === f.v), flex: 1, fontFamily: f.preview, fontSize: '12px', padding: '8px 4px',
            }}>
              Aa
            </button>
          ))}
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Line Spacing</div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          {([
            { v: 1.5, label: 'Compact' },
            { v: 2, label: 'Normal' },
            { v: 2.4, label: 'Relaxed' },
          ] as const).map((l) => (
            <button key={l.v} onClick={() => setLineHeight(l.v)} style={{ ...settingsBtn(lineHeight === l.v), flex: 1, fontSize: '11px', padding: '8px 4px' }}>
              {l.label}
            </button>
          ))}
        </div>

        <div style={{ height: '1px', background: 'var(--border-color)', margin: '14px 0' }} />
        </>)}

        {/* Fit mode — manga only */}
        {!isNovel && (<>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Fit</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
          <button onClick={() => setFitMode('width')} style={settingsBtn(fitMode === 'width')}><MoveHorizontal size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Fit Width</button>
          <button onClick={() => setFitMode('screen')} style={settingsBtn(fitMode === 'screen')}><Expand size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Fit Screen</button>
          <button onClick={() => setFitMode('actual')} style={settingsBtn(fitMode === 'actual')}>1:1 Actual Size</button>
        </div>
        {fitMode === 'screen' && effectiveMode === 'scroll' && (
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.4 }}>
            Fit Screen behaves like Fit Width in Scroll mode — switch to Page mode to see each image fill the screen.
          </div>
        )}
        <div style={{ height: '1px', background: 'var(--border-color)', margin: '14px 0' }} />

        {/* Tap zones toggle — manga only */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Tap Zones</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Tap left/right edges to navigate</div>
          </div>
          <button onClick={() => setTapZonesEnabled(v => !v)} style={toggleSwitch(tapZonesEnabled)}>
            <span style={toggleKnob(tapZonesEnabled)} />
          </button>
        </div>

        {/* Image quality selector — manga only */}
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>Image Quality</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => setImageQuality('auto')} style={settingsBtn(imageQuality === 'auto')}>
              <Wifi size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Auto
            </button>
            <button onClick={() => setImageQuality('low')} style={settingsBtn(imageQuality === 'low')}>Low</button>
            <button onClick={() => setImageQuality('high')} style={settingsBtn(imageQuality === 'high')}>High</button>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', maxWidth: '220px', lineHeight: 1.4 }}>
            {imageQuality === 'auto'
              ? `Matches your connection automatically — right now that's ${autoResolvedQuality === 'low' ? 'compact 720p pages' : 'full original quality'}.`
              : imageQuality === 'low'
              ? 'Always loads compact 720p pages — best on slow or metered connections.'
              : 'Always loads the original full-resolution pages the creator uploaded.'}
          </div>
        </div>
        </>)}
      </div>
      )}

      {/* ── CONTENT ── */}
      {previewingOwnUnpublished && (
        <div style={{ position: 'fixed', top: '52px', left: 0, right: 0, zIndex: 90, textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#fff', background: previewingOwnUnpublished === 'draft' ? '#92400e' : '#1d4ed8', padding: '6px 12px' }}>
          {previewingOwnUnpublished === 'draft'
            ? <><FileText size={12} style={{ verticalAlign: 'middle' }} /> PREVIEW — this chapter is still a draft. Readers can&apos;t see this.</>
            : <><CalendarClock size={12} style={{ verticalAlign: 'middle' }} /> PREVIEW — scheduled{unavailableUntil ? ` for ${new Date(unavailableUntil).toLocaleString()}` : ''}. Readers can&apos;t see this yet.</>}
        </div>
      )}
      <div style={{ paddingTop: (lockScreen || !showUI) ? 0 : '56px', transition: 'padding-top 0.3s' }}>

        {/* NOVEL MODE — freewebnovel-style clean reading experience */}
        {isNovel && novelContent && (() => {
          const segments = parseChapterContent(novelContent);
          const isLightBg = bgColor === '#ffffff' || bgColor === '#f5f0e0';
          const isDimBg = bgColor === '#1a1a1a' || bgColor === '#0d0d0d';
          // FIX: explicit textColor on every element so bold/italic never inherits
          // browser-default black — that was making bold invisible on dark themes.
          const textColor = isLightBg ? '#2d2d2d' : isDimBg ? '#c9cdd5' : 'var(--text-secondary)';
          const headingColor = isLightBg ? '#111111' : '#f3f4f6';
          const mutedColor = isLightBg ? 'var(--text-tertiary)' : 'var(--text-tertiary)';
          const noteBg = isLightBg ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
          const noteBorder = isLightBg ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)';
          const dividerColor = isLightBg ? 'var(--text-secondary)' : '#1f1f2e';
          const navBg = isLightBg ? '#f3f4f6' : 'var(--bg-card)';
          const navBorder = isLightBg ? 'var(--text-secondary)' : '#1f1f2e';
          const navColor = isLightBg ? 'var(--text-faint)' : 'var(--text-secondary)';
          return (
            <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh' }}>
              <div style={{
                width: '100%', maxWidth: '760px', padding: '40px 28px 60px',
                fontFamily: fontFamily === 'serif' ? "'Georgia', 'Noto Serif', 'Lora', serif"
                  : fontFamily === 'sans' ? "'Inter', 'Helvetica Neue', Arial, sans-serif"
                  : "'Comic Sans MS', 'Comic Sans', cursive",
                fontSize: `${fontSize}px`, lineHeight, color: textColor,
              }}>

                {/* Chapter title + meta row */}
                <div style={{ borderBottom: `1px solid ${dividerColor}`, paddingBottom: '20px', marginBottom: '28px' }}>
                  <h1 style={{ fontSize: `${Math.round(fontSize * 1.35)}px`, fontWeight: 700, color: headingColor, margin: '0 0 10px', lineHeight: 1.4, fontFamily: "'Georgia', serif" }}>
                    {currentChapter?.title || `Chapter ${currentChapter?.chapter_number}`}
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {novelWordCount > 0 && (
                      <span style={{ fontSize: '12px', color: mutedColor }}>
                        {novelWordCount.toLocaleString()} words
                      </span>
                    )}
                    {novelWordCount > 0 && (
                      <span style={{ fontSize: '12px', color: mutedColor }}>· {estimateReadTime(novelWordCount)}</span>
                    )}
                    {chapterTags.map((tag) => (
                      <span key={tag} style={{ fontSize: '10px', fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: '999px', padding: '2px 10px' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Author's Note — before */}
                {authorNoteBefore && (
                  <div style={{ fontSize: '13px', fontStyle: 'italic', color: mutedColor, background: noteBg, border: `1px solid ${noteBorder}`, borderLeft: '3px solid #d97706', borderRadius: '0 8px 8px 0', padding: '12px 16px', marginBottom: '32px', lineHeight: 1.65 }}>
                    <span style={{ fontWeight: 700, fontStyle: 'normal', color: '#d97706', marginRight: '6px' }}>Author&apos;s Note:</span>{authorNoteBefore}
                  </div>
                )}

                {/* Chapter body */}
                {segments.map((seg, i) =>
                  seg.type === 'heading' ? (
                    <h2 key={i} style={{
                      fontSize: `${Math.round(fontSize * 1.2)}px`, fontWeight: 700,
                      color: headingColor, margin: '2em 0 0.8em', lineHeight: 1.4,
                      fontFamily: "'Georgia', serif",
                    }}>{seg.text}</h2>
                  ) : seg.type === 'scene_break' ? (
                    <div key={i} style={{ textAlign: 'center', color: mutedColor, margin: '2em 0', letterSpacing: '0.5em', fontSize: '14px' }}>• • •</div>
                  ) : (
                    <p key={i} style={{ margin: '0 0 1.6em', textIndent: '2em', textAlign: 'justify', color: textColor }}>
                      {seg.runs.map((run, j) => {
                        // FIX: always pass explicit color so bold/italic don't go black on dark bg
                        const style = { color: textColor };
                        if (run.bold && run.italic) return <strong key={j} style={style}><em>{run.text}</em></strong>;
                        if (run.bold) return <strong key={j} style={style}>{run.text}</strong>;
                        if (run.italic) return <em key={j} style={style}>{run.text}</em>;
                        return <span key={j}>{run.text}</span>;
                      })}
                    </p>
                  )
                )}

                {/* Author's Note — after */}
                {authorNoteAfter && (
                  <div style={{ fontSize: '13px', fontStyle: 'italic', color: mutedColor, background: noteBg, border: `1px solid ${noteBorder}`, borderLeft: '3px solid #d97706', borderRadius: '0 8px 8px 0', padding: '12px 16px', marginTop: '32px', lineHeight: 1.65 }}>
                    <span style={{ fontWeight: 700, fontStyle: 'normal', color: '#d97706', marginRight: '6px' }}>Author&apos;s Note:</span>{authorNoteAfter}
                  </div>
                )}

                {/* Divider before nav */}
                <div style={{ height: '1px', background: dividerColor, margin: '48px 0 32px' }} />

                {/* End-of-chapter "Up Next" card */}
                {!lockScreen && nextChapter && (
                  <div style={{ marginBottom: '20px' }}>{renderUpNextCard()}</div>
                )}

                {/* Chapter nav — prev / all / next */}
                {!lockScreen && (
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {prevChapter ? (
                      <Link href={`/WebMangal/read/${prevChapter.id}`} style={{ padding: '10px 20px', borderRadius: '8px', border: `1px solid ${navBorder}`, background: navBg, color: navColor, textDecoration: 'none', fontSize: '13px', fontWeight: 600, }}>
                        <ArrowLeft size={12} style={{ verticalAlign: 'middle' }} /> Ch.{prevChapter.chapter_number}
                      </Link>
                    ) : <div />}
                    <Link href={series ? `/WebMangal/series/${series.id}` : '/'} style={{ padding: '10px 20px', borderRadius: '8px', border: `1px solid ${navBorder}`, background: navBg, color: navColor, textDecoration: 'none', fontSize: '13px', fontWeight: 600, }}>
                      <ListOrdered size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />All Chapters
                    </Link>
                    {nextChapter ? (
                      <Link href={`/WebMangal/read/${nextChapter.id}`} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #f97316, #22c55e)', color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: 700, }}>
                        Ch.{nextChapter.chapter_number} <ChevronRight size={12} style={{ verticalAlign: 'middle' }} />
                      </Link>
                    ) : <div />}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* SCROLL MODE — images stack vertically, original ratio, fit mode applied.
            FIX (pinch-zoom on mobile): overflowX is now always 'visible' instead of
            being conditional on fitMode === 'actual'. Clamping it to 'hidden'/'auto'
            for the width/screen fit modes was preventing pinch-zoom from rendering
            past the container bounds on mobile. Horizontal scroll-bleed during
            normal (non-zoomed) reading is still prevented by maxWidth above and by
            the root wrapper's overflow:hidden. */}
        {!isNovel && effectiveMode === 'scroll' && (
          <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div onClick={handleContentTap} style={{
              width: '100%',
              maxWidth: isFullscreen ? 'none' : '720px',  // edge-to-edge in fullscreen; capped width otherwise
              overflowX: 'visible',
              touchAction: 'pan-y pinch-zoom',
            }}>
              {/* Reader images are variable-count (30-50/chapter), variable-aspect-ratio
                  Supabase Storage URLs read via getImageSrc()'s own data-saver transform;
                  next/image's fixed-dimension + remote-pattern config model doesn't fit
                  this case, hence the per-image eslint-disable below. */}
              {pages.map((page, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={page.id}
                  ref={el => { pageRefs.current[idx] = el; }}
                  src={getImageSrc(page.image_url)}
                  onError={(e) => handleImageError(e, page.image_url)}
                  alt=""
                  style={getImgStyle()}
                  draggable={false}
                  // Perf/UX fix: a chapter can have 30-50 stacked images — loading
                  // all of them at once (previous behaviour) meant a slow, janky
                  // first paint and every image popping/flashing in as it arrived.
                  // Only eager-load the first 2 (above-the-fold on most screens);
                  // the browser now lazy-loads the rest as the reader scrolls down,
                  // which is standard practice on Webtoon/WebNovel-style readers.
                  loading={idx < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              ))}
            </div>

            {/* End-of-chapter "Up Next" card — sits above the compact nav pills.
                Hidden in fullscreen per founder's ask: only the next-chapter
                action and reactions/comments should remain, not this extra
                card (it duplicates the Ch.N pill below anyway). */}
            {!lockScreen && !isFullscreen && nextChapter && (
              <div style={{ padding: '40px 24px 0', width: '100%', boxSizing: 'border-box' }}>
                {renderUpNextCard()}
              </div>
            )}

            {/* Chapter nav bottom — in fullscreen, only the Next Chapter pill
                stays; Prev / All Chapters are the "extra chrome" founder
                wanted stripped, matching only next-chapter + reactions/
                comments remaining. */}
            {!lockScreen && (
            <div style={{ padding: '24px 24px 48px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {!isFullscreen && prevChapter && <Link href={`/WebMangal/read/${prevChapter.id}`} style={navBtnStyle}><ArrowLeft size={12} style={{ verticalAlign: 'middle' }} /> Ch.{prevChapter.chapter_number}</Link>}
              {!isFullscreen && (
                <Link href={series ? `/WebMangal/series/${series.id}` : '/'} style={navBtnStyle}><ListOrdered size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />All Chapters</Link>
              )}
              {nextChapter && (
                <Link href={`/WebMangal/read/${nextChapter.id}`} style={{ ...navBtnStyle, background: 'linear-gradient(135deg, #f97316, #22c55e)', borderColor: 'transparent', color: '#fff' }}>
                  Ch.{nextChapter.chapter_number} <ChevronRight size={12} style={{ verticalAlign: 'middle' }} />
                </Link>
              )}
            </div>
            )}
          </div>
        )}

        {/* PAGE MODE — one image at a time, original ratio, fit mode applied */}
        {!isNovel && effectiveMode === 'page' && pages.length > 0 && (
          <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isFullscreen ? '0' : '12px', transition: 'padding 0.3s' }}>
            <div onClick={handleContentTap} style={{
              width: '100%',
              maxWidth: isFullscreen ? 'none' : '600px',
              overflowX: fitMode === 'actual' ? 'auto' : 'visible',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- same reasoning as
                  the scroll-mode image above: variable Supabase Storage URL, not a static asset */}
              <img
                src={getImageSrc(pages[currentPage].image_url)}
                onError={(e) => handleImageError(e, pages[currentPage].image_url)}
                alt=""
                style={getImgStyle()}
                draggable={false}
                decoding="async"
              />
            </div>

            {/* Page dots + nav */}
            {/* Step 24 — RTL: swap visual positions of Prev/Next buttons.
                In RTL manga, "next page" button sits on the LEFT, "prev" on the RIGHT.
                Click handlers also swap so each button does what its new position implies. */}
            {!lockScreen && !isFullscreen && currentPage === pages.length - 1 && nextChapter && (
              <div style={{ padding: '8px 16px 0', width: '100%', boxSizing: 'border-box' }}>
                {renderUpNextCard()}
              </div>
            )}
            {!lockScreen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px 16px', flexWrap: 'wrap', justifyContent: 'center' }}>

              {/* Left button: Prev (LTR) / Next (RTL) */}
              {isRTL ? (
                currentPage === pages.length - 1 ? (
                  nextChapter ? (
                    <Link href={`/WebMangal/read/${nextChapter.id}`} style={{ ...navBtnStyle, background: 'linear-gradient(135deg, #f97316, #22c55e)', borderColor: 'transparent', color: '#fff', textDecoration: 'none' }}>
                      <ArrowLeft size={13} style={{ verticalAlign: 'middle' }} /> Next Chapter
                    </Link>
                  ) : (
                    <Link href={series ? `/WebMangal/series/${series.id}` : '/'} style={{ ...navBtnStyle, textDecoration: 'none' }}>All Chapters</Link>
                  )
                ) : (
                  <button onClick={() => setCurrentPage(p => Math.min(p + 1, pages.length - 1))} style={pageBtn(false)}><ArrowLeft size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Next</button>
                )
              ) : (
                <button onClick={() => setCurrentPage(p => Math.max(p - 1, 0))} disabled={currentPage === 0} style={pageBtn(currentPage === 0)}><ArrowLeft size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Prev</button>
              )}

              {/* Dots */}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {pages.slice(0, Math.min(pages.length, 14)).map((_, i) => (
                  <button key={i} onClick={() => setCurrentPage(i)} style={{
                    width: i === currentPage ? '20px' : '6px', height: '6px', borderRadius: '3px', border: 'none',
                    background: i === currentPage ? '#d97706' : 'var(--border-color)',
                    cursor: 'pointer', transition: 'all 0.2s', padding: 0,
                  }} />
                ))}
                {pages.length > 14 && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>+{pages.length - 14}</span>}
              </div>

              {/* Right button: Next (LTR) / Prev (RTL) */}
              {isRTL ? (
                <button onClick={() => setCurrentPage(p => Math.max(p - 1, 0))} disabled={currentPage === 0} style={pageBtn(currentPage === 0)}>Prev <ChevronRight size={13} style={{ verticalAlign: 'middle' }} /></button>
              ) : (
                currentPage === pages.length - 1 ? (
                  nextChapter ? (
                    <Link href={`/WebMangal/read/${nextChapter.id}`} style={{ ...navBtnStyle, background: 'linear-gradient(135deg, #f97316, #22c55e)', borderColor: 'transparent', color: '#fff', textDecoration: 'none' }}>
                      Next Chapter <ChevronRight size={13} style={{ verticalAlign: 'middle' }} />
                    </Link>
                  ) : (
                    <Link href={series ? `/WebMangal/series/${series.id}` : '/'} style={{ ...navBtnStyle, textDecoration: 'none' }}>All Chapters</Link>
                  )
                ) : (
                  <button onClick={() => setCurrentPage(p => Math.min(p + 1, pages.length - 1))} style={pageBtn(false)}>Next <ChevronRight size={13} style={{ verticalAlign: 'middle' }} /></button>
                )
              )}

            </div>
            )}
          </div>
        )}
      </div>

      {/* ── REACTIONS + COMMENTS (Step 3 + Step 4) ── */}
      {!lockScreen && (
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '0 16px 40px' }}>

          {/* Reactions row */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', padding: '24px 0 20px', flexWrap: 'wrap' }}>
            {REACTIONS.map(({ key, emoji, label }) => {
              const active = myReaction === key;
              return (
                <button
                  key={key}
                  onClick={() => handleReact(key)}
                  title={label}
                  disabled={reactionLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '8px 14px', borderRadius: '20px', cursor: 'pointer',
                    border: active ? '1px solid rgba(217,119,6,0.5)' : '1px solid var(--border-color)',
                    background: active ? 'rgba(217,119,6,0.12)' : 'var(--bg-card)',
                    fontSize: '18px', lineHeight: 1, transition: 'all 0.15s',
                    opacity: reactionLoading ? 0.6 : 1,
                  }}
                >
                  <span>{emoji}</span>
                  {(reactionCounts[key] || 0) > 0 && (
                    <span style={{ fontSize: '12px', color: active ? '#d97706' : 'var(--text-tertiary)', fontWeight: 700 }}>
                      {reactionCounts[key]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--border-color)', marginBottom: '20px' }} />

          {/* Comments section */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Comments {totalCommentCount > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({totalCommentCount})</span>}
            </div>

            {/* Comment input */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <textarea
                value={commentBody}
                onChange={e => setCommentBody(e.target.value.slice(0, 500))}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommentSubmit(); }}
                placeholder={userId ? 'Write a comment… (Ctrl+Enter to post)' : 'Log in to comment'}
                disabled={!userId || commentSubmitting}
                rows={2}
                style={{
                  flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '13px',
                  padding: '10px 12px', resize: 'none', outline: 'none',
                  fontFamily: 'inherit', lineHeight: 1.5,
                  opacity: !userId ? 0.5 : 1,
                }}
              />
              <button
                onClick={handleCommentSubmit}
                disabled={!commentBody.trim() || commentSubmitting || !userId}
                style={{
                  padding: '10px 14px', borderRadius: '10px', border: 'none',
                  background: commentBody.trim() && userId ? 'linear-gradient(135deg, #f97316, #22c55e)' : 'var(--border-color)',
                  color: commentBody.trim() && userId ? '#fff' : 'var(--text-muted)',
                  fontSize: '13px', fontWeight: 700, cursor: commentBody.trim() && userId ? 'pointer' : 'not-allowed',
                  alignSelf: 'flex-end', whiteSpace: 'nowrap',
                  transition: 'background 0.2s',
                }}
              >{commentSubmitting ? '…' : 'Post'}</button>
            </div>

            {/* Char counter */}
            {commentBody.length > 0 && (
              <div style={{ fontSize: '10px', color: commentBody.length > 450 ? '#d97706' : 'var(--text-muted)', textAlign: 'right', marginTop: '-16px', marginBottom: '12px' }}>
                {commentBody.length}/500
              </div>
            )}

            {/* Comment list */}
            {commentsLoading ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>Loading comments…</div>
            ) : comments.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center', padding: '24px 0' }}>No comments yet. Be the first!</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {comments.map(c => {
                  const isOwn = c.reader_id === userId;
                  const timeAgo = (created: string) => {
                    const diff = Date.now() - new Date(created).getTime();
                    const m = Math.floor(diff / 60000);
                    if (m < 1) return 'just now';
                    if (m < 60) return `${m}m ago`;
                    const h = Math.floor(m / 60);
                    if (h < 24) return `${h}h ago`;
                    return `${Math.floor(h / 24)}d ago`;
                  };
                  const isReplyingHere = replyingTo === c.id;
                  return (
                    <div key={c.id}>
                      {/* Top-level comment */}
                      <div style={{
                        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                        borderRadius: '10px', padding: '12px 14px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700, flexShrink: 0 }}>
                              {c.full_name.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>{c.full_name}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>{timeAgo(c.created_at)}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              onClick={() => { setReplyingTo(isReplyingHere ? null : c.id); setReplyBody(''); }}
                              style={{ background: 'none', border: 'none', color: isReplyingHere ? '#d97706' : 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                            ><CornerDownRight size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Reply</button>
                            {isOwn && (
                              <button
                                onClick={() => handleDeleteComment(c.id, null)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '11px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                                title="Delete comment"
                              ><X size={12} /></button>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, wordBreak: 'break-word' }}>{c.body}</div>
                      </div>

                      {/* Reply input box */}
                      {isReplyingHere && (
                        <div style={{ marginLeft: '24px', marginTop: '6px', display: 'flex', gap: '8px' }}>
                          <textarea
                            value={replyBody}
                            onChange={e => setReplyBody(e.target.value.slice(0, 500))}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleReplySubmit(c.id); }}
                            placeholder="Write a reply…"
                            rows={2}
                            autoFocus
                            style={{
                              flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                              borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '12px',
                              padding: '8px 10px', resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                            }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <button
                              onClick={() => handleReplySubmit(c.id)}
                              disabled={!replyBody.trim() || replySubmitting}
                              style={{
                                padding: '6px 12px', borderRadius: '8px', border: 'none',
                                background: replyBody.trim() ? 'linear-gradient(135deg, #f97316, #22c55e)' : 'var(--border-color)',
                                color: replyBody.trim() ? '#fff' : 'var(--text-muted)',
                                fontSize: '12px', fontWeight: 700, cursor: replyBody.trim() ? 'pointer' : 'not-allowed',
                              }}
                            >{replySubmitting ? '…' : 'Post'}</button>
                            <button
                              onClick={() => { setReplyingTo(null); setReplyBody(''); }}
                              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}
                            >Cancel</button>
                          </div>
                        </div>
                      )}

                      {/* Replies */}
                      {(c.replies || []).length > 0 && (
                        <div style={{ marginLeft: '24px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '2px solid var(--border-color)', paddingLeft: '12px' }}>
                          {(c.replies || []).map(reply => {
                            const replyOwn = reply.reader_id === userId;
                            return (
                              <div key={reply.id} style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 700, flexShrink: 0 }}>
                                      {reply.full_name.charAt(0).toUpperCase()}
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>{reply.full_name}</span>
                                    <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>{timeAgo(reply.created_at)}</span>
                                  </div>
                                  {replyOwn && (
                                    <button
                                      onClick={() => handleDeleteComment(reply.id, c.id)}
                                      style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '11px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                                      title="Delete reply"
                                    ><X size={12} /></button>
                                  )}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-word' }}>{reply.body}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Watermark */}
      <div style={{ position: 'sticky', bottom: 0, right: 12, textAlign: 'right', fontSize: '9px', color: 'rgba(255,255,255,0.05)', pointerEvents: 'none', zIndex: 5, letterSpacing: '0.12em', paddingRight: '12px', paddingBottom: '8px' }}>
        MANGAL
      </div>
    </div>{/* end inner scroll container */}
    </div>
  );
}

const topBtn: React.CSSProperties = {
  width: '32px', height: '32px', borderRadius: '8px',
  border: '1px solid var(--border-color)', background: 'var(--bg-card)',
  color: 'var(--text-secondary)', fontSize: '15px', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

const navBtnStyle: React.CSSProperties = {
  padding: '11px 20px', borderRadius: '10px',
  border: '1px solid var(--border-light)', background: 'var(--bg-card)',
  color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700,
  cursor: 'pointer', display: 'inline-block',
};

const pageBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '11px 20px', borderRadius: '10px', border: '1px solid var(--border-light)',
  background: disabled ? 'var(--bg-input)' : 'var(--bg-card)',
  color: disabled ? 'var(--text-faint)' : 'var(--text-primary)',
  fontSize: '13px', fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

// Sprint 4 — settings panel helpers
const settingsBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: '8px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
  background: active ? 'rgba(217,119,6,0.15)' : 'var(--bg-input)',
  border: active ? '1px solid rgba(217,119,6,0.4)' : '1px solid var(--border-color)',
  color: active ? '#d97706' : 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left',
});

const toggleSwitch = (on: boolean): React.CSSProperties => ({
  width: '38px', height: '22px', borderRadius: '11px', position: 'relative',
  background: on ? '#d97706' : 'var(--border-color)', border: 'none', cursor: 'pointer',
  flexShrink: 0, padding: 0, transition: 'background 0.2s',
});

const toggleKnob = (on: boolean): React.CSSProperties => ({
  position: 'absolute', top: '3px', left: on ? '19px' : '3px',
  width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
  transition: 'left 0.2s', display: 'block',
});

export default function Page({ params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = use(params);
  return <ReaderView chapterId={chapterId} />;
}
