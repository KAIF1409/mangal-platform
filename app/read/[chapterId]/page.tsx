'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { parseChapterContent, estimateReadTime } from '../../lib/novelEditor';

type PageItem = { id: string; page_number: number; image_url: string };
type SeriesInfo = {
  id: string;
  title: string;
  reading_mode: 'scroll' | 'page';
  content_type: 'mangal' | 'novel';
  reading_direction: 'ltr' | 'rtl' | null;
};
type ChapterNav = { id: string; chapter_number: number; title: string };

const REACTIONS: { key: string; emoji: string; label: string }[] = [
  { key: 'heart', emoji: '❤️', label: 'Love' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'laugh', emoji: '😂', label: 'Funny' },
  { key: 'wow', emoji: '😲', label: 'Wow' },
  { key: 'cry', emoji: '😢', label: 'Sad' },
];

export default function ReaderView({ chapterId }: { chapterId: string }) {
  const router = useRouter();

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
  const [bgColor, setBgColor] = useState('#000000');
  const [showSettings, setShowSettings] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lockScreen, setLockScreen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [modeOverride, setModeOverride] = useState<'scroll' | 'page' | null>('scroll');
  const [fitMode, setFitMode] = useState<'width' | 'screen' | 'actual'>('width');
  const [tapZonesEnabled, setTapZonesEnabled] = useState(false);
  const [dataSaver, setDataSaver] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [novelContent, setNovelContent] = useState<string | null>(null);
  const [novelWordCount, setNovelWordCount] = useState(0);
  const [fontSize, setFontSize] = useState(16);

  const [authorNoteBefore, setAuthorNoteBefore] = useState<string | null>(null);
  const [authorNoteAfter, setAuthorNoteAfter] = useState<string | null>(null);
  const [chapterTags, setChapterTags] = useState<string[]>([]);

  const [chapterUnavailable, setChapterUnavailable] = useState<'draft' | 'scheduled' | null>(null);
  const [unavailableUntil, setUnavailableUntil] = useState<string | null>(null);
  const [previewingOwnUnpublished, setPreviewingOwnUnpublished] = useState<'draft' | 'scheduled' | null>(null);

  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [reactionLoading, setReactionLoading] = useState(false);

  type CommentRow = {
    id: string;
    reader_id: string;
    body: string;
    created_at: string;
    full_name: string;
    parent_id: string | null;
    replies?: CommentRow[];
  };

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  type ReadHistoryEntry = { chapterId: string; seriesId: string; readAt: number };
  type ReadGateState = { gated: boolean; reason: 'series_limit' | 'chapter_limit' | null };

  const [readGate, setReadGate] = useState<ReadGateState>({ gated: false, reason: null });
  const [chaptersReadThisSeries, setChaptersReadThisSeries] = useState(0);
  const [uniqueSeriesRead, setUniqueSeriesRead] = useState(0);

  const hideTimer = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const pageRefs = useRef<(HTMLImageElement | null)[]>([]);
  const progressDebounce = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPage = useRef(0);
  const lastChapterId = useRef<string | null>(null);

  const isNovel = series?.content_type === 'novel';
  const effectiveMode: 'scroll' | 'page' = isNovel ? 'scroll' : (modeOverride ?? series?.reading_mode ?? 'scroll');
  const isRTL = series?.content_type === 'mangal' && effectiveMode === 'page' && series?.reading_direction === 'rtl';

  // --- Read History Helpers ---
  const getReadHistory = (): ReadHistoryEntry[] => {
    try {
      const raw = localStorage.getItem('mangal_read_history');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  };

  const recordChapterRead = (cId: string, sId: string) => {
    try {
      const history = getReadHistory();
      if (!history.some(h => h.chapterId === cId)) {
        history.push({ chapterId: cId, seriesId: sId, readAt: Date.now() });
        localStorage.setItem('mangal_read_history', JSON.stringify(history));
      }
    } catch {}
  };

  const countChaptersInSeries = (sId: string): number => {
    return getReadHistory().filter(h => h.seriesId === sId).length;
  };

  const countUniqueSeries = (): number => {
    return new Set(getReadHistory().map(h => h.seriesId)).size;
  };

  const isChapterAlreadyRead = (cId: string): boolean => {
    return getReadHistory().some(h => h.chapterId === cId);
  };

  // --- Main Load Function Defined Before Use Effects ---
  const loadChapter = async (silent = false) => {
    if (!silent) setLoading(true);

    const { data: chapter } = await supabase
      .from('chapters')
      .select('id, chapter_number, title, series_id, content, word_count, author_note_before, author_note_after, tags, is_draft, scheduled_at, series(id, title, reading_mode, content_type, reading_direction, creator_id)')
      .eq('id', chapterId)
      .single();

    if (chapter) {
      const isFutureScheduled = !!chapter.scheduled_at && new Date(chapter.scheduled_at).getTime() > Date.now();
      if (chapter.is_draft || isFutureScheduled) {
        const s0 = Array.isArray(chapter.series) ? chapter.series[0] : chapter.series;
        const { data: authData } = await supabase.auth.getUser();
        const isOwner = !!authData.user && s0 && (s0 as { creator_id?: string }).creator_id === authData.user.id;

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

      // Read Gate checks
      const seriesId = chapter.series_id;
      const alreadyRead = isChapterAlreadyRead(chapterId);
      if (!alreadyRead) {
        const chaptersInSeries = countChaptersInSeries(seriesId);
        const totalSeriesRead = countUniqueSeries();
        const willHaveReadInSeries = chaptersInSeries + 1;
        const willHaveSeriesRead = totalSeriesRead + (chaptersInSeries === 0 ? 1 : 0);

        if (willHaveSeriesRead > 3) {
          setReadGate({ gated: true, reason: 'series_limit' });
          setChaptersReadThisSeries(chaptersInSeries);
          setUniqueSeriesRead(totalSeriesRead);
          if (!silent) setLoading(false);
          return;
        }
        if (willHaveReadInSeries > 2) {
          setReadGate({ gated: true, reason: 'chapter_limit' });
          setChaptersReadThisSeries(chaptersInSeries);
          setUniqueSeriesRead(totalSeriesRead);
          if (!silent) setLoading(false);
          return;
        }
        recordChapterRead(chapterId, seriesId);
      }
      setReadGate({ gated: false, reason: null });

      setCurrentChapter({ id: chapter.id, chapter_number: chapter.chapter_number, title: chapter.title });
      const s = Array.isArray(chapter.series) ? chapter.series[0] : chapter.series;
      if (s) setSeries(s as SeriesInfo);

      if (chapter.content) {
        setNovelContent(chapter.content);
        setNovelWordCount(chapter.word_count ?? 0);
      }
      setAuthorNoteBefore(chapter.author_note_before || null);
      setAuthorNoteAfter(chapter.author_note_after || null);
      setChapterTags(Array.isArray(chapter.tags) ? chapter.tags : []);

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

    const { data: pageRows } = await supabase
      .from('pages')
      .select('id, page_number, image_url')
      .eq('chapter_id', chapterId)
      .order('page_number', { ascending: true });

    if (pageRows) setPages(pageRows);
    if (!silent) setLoading(false);
  };

  // --- Effects ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem('mangal_reader_prefs');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.modeOverride) setModeOverride(saved.modeOverride);
        if (saved.fitMode) setFitMode(saved.fitMode);
        if (typeof saved.tapZonesEnabled === 'boolean') setTapZonesEnabled(saved.tapZonesEnabled);
        if (typeof saved.dataSaver === 'boolean') setDataSaver(saved.dataSaver);
        if (saved.fontSize && saved.fontSize >= 14 && saved.fontSize <= 24) setFontSize(saved.fontSize);
      }
    } catch {}
    setPrefsLoaded(true);
  }, []);

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
  }, [series]);

  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      const existing = (() => {
        try {
          return JSON.parse(localStorage.getItem('mangal_reader_prefs') || '{}');
        } catch {
          return {};
        }
      })();
      const bgKey = isNovel ? 'novelBgColor' : 'mangaBgColor';
      localStorage.setItem(
        'mangal_reader_prefs',
        JSON.stringify({
          ...existing,
          modeOverride,
          fitMode,
          tapZonesEnabled,
          dataSaver,
          [bgKey]: bgColor,
          fontSize,
        })
      );
    } catch {}
  }, [modeOverride, fitMode, tapZonesEnabled, dataSaver, bgColor, fontSize, prefsLoaded, isNovel]);

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

  useEffect(() => {
    setCurrentPage(0);
    lastSavedPage.current = 0;
    loadChapter();
  }, [chapterId]);

  useEffect(() => {
    const refresh = () => loadChapter(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', refresh);
    };
  }, [chapterId]);

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
    return () => {
      cancelled = true;
    };
  }, [chapterId, userId]);

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
        const flat: CommentRow[] = data.map((r: any) => ({
          id: r.id,
          reader_id: r.reader_id,
          body: r.body,
          created_at: r.created_at,
          parent_id: r.parent_id || null,
          full_name: Array.isArray(r.profiles) ? r.profiles[0]?.full_name || 'Reader' : r.profiles?.full_name || 'Reader',
          replies: [],
        }));

        const topLevel: CommentRow[] = [];
        const byId: Record<string, CommentRow> = {};
        flat.forEach(c => {
          byId[c.id] = c;
        });
        flat.forEach(c => {
          if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].replies!.push(c);
          else topLevel.push(c);
        });
        setComments(topLevel);
      }
      setCommentsLoading(false);
    };
    loadComments();
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  // --- Handlers ---
  const handleReact = async (emojiKey: string) => {
    if (!userId) {
      router.push('/login');
      return;
    }
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

  const handleCommentSubmit = async () => {
    if (!userId) {
      router.push('/login');
      return;
    }
    const body = commentBody.trim();
    if (!body || body.length > 500 || commentSubmitting) return;
    setCommentSubmitting(true);

    const { data, error } = await supabase
      .from('comments')
      .insert({ chapter_id: chapterId, reader_id: userId, body, parent_id: null })
      .select('id, reader_id, body, created_at, parent_id, profiles(full_name)');

    if (!error && data && data.length > 0) {
      const r = data[0] as any;
      const name = Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name;
      setComments(c => [
        ...c,
        {
          id: r.id,
          reader_id: r.reader_id,
          body: r.body,
          created_at: r.created_at,
          parent_id: null,
          full_name: name || 'Reader',
          replies: [],
        },
      ]);
      setCommentBody('');
    }
    setCommentSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white">
        <p className="animate-pulse">Loading chapter...</p>
      </div>
    );
  }

  if (chapterUnavailable) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-zinc-900 text-white p-4 text-center">
        <h2 className="text-xl font-bold mb-2">Chapter Unavailable</h2>
        <p className="text-zinc-400 max-w-md">
          {chapterUnavailable === 'draft'
            ? 'This chapter is currently a draft and has not been published yet.'
            : `This chapter is scheduled for release${unavailableUntil ? ` on ${new Date(unavailableUntil).toLocaleString()}` : ''}.`}
        </p>
      </div>
    );
  }

  return (
    <div ref={rootRef} style={{ backgroundColor: bgColor }} className="min-h-screen text-white select-none transition-colors duration-200">
      <div className="p-4 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">{currentChapter?.title || 'Chapter View'}</h1>
        
        {/* Reader content rendering */}
        {isNovel ? (
          <div className="prose prose-invert max-w-none" style={{ fontSize: `${fontSize}px` }}>
            {authorNoteBefore && <div className="p-3 bg-zinc-800 rounded mb-4 italic">{authorNoteBefore}</div>}
            <div dangerouslySetInnerHTML={{ __html: novelContent || '' }} />
            {authorNoteAfter && <div className="p-3 bg-zinc-800 rounded mt-4 italic">{authorNoteAfter}</div>}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {pages.map((p, idx) => (
              <img key={p.id || idx} src={p.image_url} alt={`Page ${p.page_number}`} className="max-w-full h-auto" />
            ))}
          </div>
        )}

        {/* Reactions */}
        <div className="flex items-center gap-4 my-8 p-4 bg-zinc-800/50 rounded-lg">
          <span className="font-semibold text-sm">Reactions:</span>
          {REACTIONS.map(r => (
            <button
              key={r.key}
              onClick={() => handleReact(r.key)}
              disabled={reactionLoading}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition ${
                myReaction === r.key ? 'bg-orange-500 text-white' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
              title={r.label}
            >
              <span>{r.emoji}</span>
              <span>{reactionCounts[r.key] || 0}</span>
            </button>
          ))}
        </div>

        {/* Comments Section */}
        <div className="mt-8 border-t border-zinc-700 pt-6">
          <h3 className="text-lg font-bold mb-4">Comments</h3>
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={commentBody}
              onChange={e => setCommentBody(e.target.value)}
              placeholder="Leave a comment..."
              className="flex-1 px-3 py-2 bg-zinc-800 rounded border border-zinc-700 text-sm focus:outline-none focus:border-orange-500"
            />
            <button
              onClick={handleCommentSubmit}
              disabled={commentSubmitting || !commentBody.trim()}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-sm font-semibold rounded"
            >
              Post
            </button>
          </div>

          <div className="space-y-4">
            {comments.map(c => (
              <div key={c.id} className="p-3 bg-zinc-800/40 rounded border border-zinc-800">
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span className="font-semibold text-zinc-200">{c.full_name}</span>
                  <span>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
