'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import { checkImageBatchQuality } from '../../lib/media/imageQuality';
import { uploadMediaFile, deleteMediaFiles, MEDIA_FOLDERS } from '../../lib/media/uploadClient';
import { guessNextChapterNumber, describeWriteError } from '../../lib/webmangal/chapterNumber';
import {
  buildChapterMetadataFields,
  chapterEditSignature,
  isFutureSchedule,
  type ChapterMetadataInput,
} from '../../lib/webmangal/chapterFields';
import { resolveMediaUrl } from '../../lib/media/mediaUrl';
import { publishChapterPages } from '../../lib/webmangal/publishPages';
import { pdfToPages, PDF_TO_PAGES_DEPS } from '../../lib/webmangal/pdfToPages';
import { toLocalDateTimeInput } from '../../lib/webmangal/schedule';
import { ownsSeries, seriesWriteBlockReason } from '../../lib/auth/roles';
import { countWords, estimateReadTime, saveDraft, loadDraft, clearDraft, renderNovelPreviewHtml } from '../../lib/novelEditor';
import { suggestTags } from '../../lib/tagSuggest';
import dynamic from 'next/dynamic';
import Navbar from '../../components/shared/Navbar';

// §141 — client-only boundary; see dashboard/books/page.tsx for the full
// note (WebMangalAiEditor pulls the 6 MB web-llm engine into the SSR graph
// through any static import of it).
const WebMangalAiEditor = dynamic(() => import('../../components/editor/WebMangalAiEditor'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: '10px 0', color: 'var(--text-tertiary)', fontSize: '13px' }}>
      Loading editor…
    </div>
  ),
});
import {
  ArrowLeft, Camera, BookOpen, BookText, ScrollText, ArrowRight,
  PartyPopper, Eye, Plus, CheckCircle2, Search, Upload, Check,
  Trash2, Lock, Save, Rocket, Expand, Edit3, X, CalendarClock,
  FileText, ChevronLeft, ChevronRight,
} from 'lucide-react';

type UploadPage = {
  file: File;
  preview: string;
};

// Unified manga page list item — every page in the chapter (whether already
// saved in Supabase or freshly picked this session) lives in ONE ordered
// array now. This is what lets a creator freely reorder pages or insert a
// new page anywhere — start, middle, end — instead of new pages only ever
// being appendable at the end. Each item just carries enough info for the
// save step to know whether to upload it (new) or keep/renumber it (existing).
type PageItem =
  | { kind: 'existing'; id: string; image_url: string }
  | { kind: 'new'; file: File; preview: string };

type ContentType = 'mangal' | 'novel';

// Step 23 — Genre Expansion (Desi Categories): added Folk Tale, Desi Horror,
// Street Life, School Life, Independence Era. Mythology already existed.
// No Wuxia/Xianxia/Eastern/Mecha/Yaoi vocabulary — that's reference-site
// terminology, not part of MANGAL's identity (see Step 23 standing note).
const GENRES = [
  'Action', 'Romance', 'Fantasy', 'Comedy', 'Drama',
  'Horror', 'Slice of Life', 'Sci-Fi', 'Thriller', 'Mythology',
  'Folk Tale', 'Desi Horror', 'Street Life', 'School Life', 'Independence Era',
];

// Sprint 2 — minimum pages per chapter (hard block, decided with user 20 June 2026)
const MIN_PAGES_PER_CHAPTER = 5;

// Step 21 — minimum words per novel chapter (mirrors the manga page-count
// floor conceptually, but novels are measured in words, not pages)
const MIN_WORDS_PER_CHAPTER = 300;

export default function CreatorUploadPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', }}>
        Loading...
      </main>
    }>
      <UploadFlow />
    </Suspense>
  );
}

function UploadFlow() {
  const searchParams = useSearchParams();
  const existingSeriesId = searchParams.get('seriesId');
  const editChapterId = searchParams.get('chapterId'); // Edit mode — present only when editing an already-published chapter

  const [step, setStep] = useState<'series' | 'chapter'>(existingSeriesId ? 'chapter' : 'series');
  const [userId, setUserId] = useState<string | null>(null);

  // Edit mode state
  const isEditMode = !!editChapterId;
  const [editLoading, setEditLoading] = useState(isEditMode);
  const [editLoadError, setEditLoadError] = useState('');
  // IDs of existing pages the creator removed during this edit session —
  // tracked separately so save knows what to actually delete in Supabase,
  // even though the page itself disappears from `pages` immediately on click.
  const [removedExistingPageIds, setRemovedExistingPageIds] = useState<string[]>([]);

  // Series fields
  const [contentType, setContentType] = useState<ContentType>('mangal');
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [language, setLanguage] = useState<'Hindi' | 'English'>('English');
  const [synopsis, setSynopsis] = useState('');
  const [readingMode, setReadingMode] = useState<'scroll' | 'page'>('scroll');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [seriesId, setSeriesId] = useState<string | null>(existingSeriesId);
  // Step 30 — Tags at series creation, reusing the existing tags/series_tags
  // tables from the Step 25 tags system (previously only editable after
  // creation, via the dashboard's Edit Series modal).
  const [seriesTagsInput, setSeriesTagsInput] = useState('');
  // §58b.3 — rule-based (zero-cost) tag suggestions, computed from title +
  // description against the existing tag vocabulary. See app/lib/tagSuggest.ts.
  const [tagVocabulary, setTagVocabulary] = useState<{ id: string; name: string; slug: string }[]>([]);
  // Step 30 — Mature content toggle. Handled defensively in handleCreateSeries
  // (falls back to an insert without this field) until the founder runs the
  // matching migration — see supabase/migrations/20260810_series_is_mature.sql.
  const [isMature, setIsMature] = useState(false);

  // Chapter fields
  const [chapterNumber, setChapterNumber] = useState(1);
  const [chapterTitle, setChapterTitle] = useState('');
  const [pages, setPages] = useState<PageItem[]>([]);
  const [novelContent, setNovelContent] = useState('');
  const [justPublishedChapterId, setJustPublishedChapterId] = useState<string | null>(null);

  // Novel editor toolbar — formatting helpers, preview, and focus mode.
  // All purely client-side; nothing here touches the DB schema.
  const novelTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [novelPreviewMode, setNovelPreviewMode] = useState(false);
  const [novelFocusMode, setNovelFocusMode] = useState(false);

  // Feature: Author's Note (before/after chapter) — needs chapters.author_note_before / _after
  const [authorNoteBefore, setAuthorNoteBefore] = useState('');
  const [authorNoteAfter, setAuthorNoteAfter] = useState('');

  // Feature: explicit server-side draft — needs chapters.is_draft
  const [isDraftChapter, setIsDraftChapter] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Feature: scheduled publish — needs chapters.scheduled_at
  const [scheduledAt, setScheduledAt] = useState(''); // datetime-local input value, '' = no schedule

  // Feature: tags / content warnings — needs chapters.tags (text[])
  const [tagsInput, setTagsInput] = useState(''); // comma-separated, parsed to array on save

  const [loading, setLoading] = useState(false);
  const [checkingQuality, setCheckingQuality] = useState(false);
  // "Upload via PDF" — browser-side conversion progress for the manga step.
  const [processingPdf, setProcessingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Pre-flight permission check for the "adding a chapter to an existing
  // series" path (?seriesId=...). Empty string = allowed. Non-empty = the
  // reason this viewer can't write to that series, rendered as a banner so
  // they find out on arrival instead of after converting/uploading pages.
  const [writeBlock, setWriteBlock] = useState('');

  // ---- Edit Chapter: the chapter-row form state in ONE object ------------
  // Every metadata column this screen can change, in the shape the shared
  // builder expects (lib/webmangal/chapterFields.ts). BOTH save paths — the
  // comic one and the novel one — build their payload from this, which is the
  // fix for a comic chapter edit silently losing data: the comic UPDATE used
  // to list only `chapter_number` and `title`, so an author's note (or tags,
  // or a schedule) could be loaded into the form, edited, saved, and never
  // written. The novel path had its own field builder and did write them —
  // two builders is exactly how the two drifted apart.
  const chapterMetadataInput = useMemo<ChapterMetadataInput>(() => ({
    chapterNumber,
    title: chapterTitle,
    authorNoteBefore,
    authorNoteAfter,
    isDraft: isDraftChapter,
    scheduledAt,
    tagsInput,
  }), [chapterNumber, chapterTitle, authorNoteBefore, authorNoteAfter, isDraftChapter, scheduledAt, tagsInput]);

  // ---- Edit Chapter: unsaved-changes guard -------------------------------
  // A stable fingerprint of everything this screen can change — the metadata
  // fields plus page identity/order — compared against what was last loaded
  // from (or written to) the DB. Standard editor behaviour on every platform
  // with a chapter editor (Webtoon, Wattpad, Tapas, Ream all warn before
  // unpublished edits are lost): leaving mid-edit asks first, and there is a
  // visible "unsaved changes" marker instead of a silent no-op.
  const pagesSignature = pages
    .map((item) => (item.kind === 'existing' ? `e:${item.id}` : `n:${item.file.name}:${item.file.size}`))
    .join('|');
  const currentEditSignature = chapterEditSignature({
    fields: chapterMetadataInput,
    pagesKey: pagesSignature,
  });
  // null until the DB load finishes, so a half-populated form never reads as
  // "edited".
  const savedEditSignatureRef = useRef<string | null>(null);
  // Set immediately before a deliberate navigation (Discard, or the redirect
  // after a successful save) so the browser doesn't ask about changes the
  // creator just chose to commit or throw away.
  const suppressUnloadWarningRef = useRef(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (!isEditMode) return;
    setHasUnsavedChanges(
      savedEditSignatureRef.current !== null && currentEditSignature !== savedEditSignatureRef.current
    );
  }, [isEditMode, currentEditSignature]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (suppressUnloadWarningRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  // Throw this edit away and reload the chapter as it is actually stored.
  const discardChanges = () => {
    suppressUnloadWarningRef.current = true;
    window.location.reload();
  };

  // Called after a successful write, so the redirect that follows is treated
  // as "saved", not "about to lose unsaved work". `fieldsOverride` lets a
  // caller state the values the DB now holds when they differ from the form
  // state at that instant (e.g. a draft save just flipped is_draft) — without
  // it, a successful save could immediately re-flag itself as dirty.
  const markEditSaved = (fieldsOverride?: Partial<ChapterMetadataInput>) => {
    savedEditSignatureRef.current = chapterEditSignature({
      fields: { ...chapterMetadataInput, ...fieldsOverride },
      pagesKey: pagesSignature,
    });
    setHasUnsavedChanges(false);
    suppressUnloadWarningRef.current = true;
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // §58b.3 — fetch the existing tag vocabulary once, so the suggestion
  // chips below the Tags field can match against it client-side (no
  // per-keystroke query, no AI call).
  useEffect(() => {
    supabase.from('tags').select('id, name, slug').then(({ data }) => {
      if (data) setTagVocabulary(data);
    });
  }, []);

  // Suggestions recomputed from title + synopsis whenever those (or the
  // vocabulary/current tag input) change — pure client-side, see
  // app/lib/tagSuggest.ts. Capped at 6 so the chip row stays one line.
  const suggestedSeriesTags = useMemo(
    () => suggestTags(`${title} ${synopsis}`, tagVocabulary, seriesTagsInput.split(',')),
    [title, synopsis, tagVocabulary, seriesTagsInput],
  );

  const addSuggestedTag = (name: string) => {
    const current = seriesTagsInput.split(',').map((t) => t.trim()).filter(Boolean);
    if (current.some((t) => t.toLowerCase() === name.toLowerCase())) return;
    setSeriesTagsInput(current.length > 0 ? `${current.join(', ')}, ${name}` : name);
  };

  // If arriving with an existing seriesId (from "+ Chapter" on dashboard),
  // load the series title + content_type for display, and — CREATE flow only —
  // prefill the next chapter number.
  useEffect(() => {
    if (!existingSeriesId) return;

    supabase.from('series').select('title, content_type').eq('id', existingSeriesId).single()
      .then(({ data }) => {
        if (data) {
          setTitle(data.title);
          if (data.content_type === 'novel' || data.content_type === 'mangal') {
            setContentType(data.content_type);
          }
        }
      });

    // BUG FIX (2026-09-24) — this "guess the next chapter number" query used
    // to run whenever a seriesId was present, EDIT MODE INCLUDED, racing the
    // edit-load effect below for ownership of `chapterNumber`. Whichever
    // effect's round trip finished last won, and because that one awaits the
    // chapter row *and then* its pages while this is a single fast SELECT,
    // this one frequently won on a slow connection and silently replaced the
    // number of the chapter actually being edited. Saving then wrote that
    // wrong number, which collided with another chapter's number under
    // chapters_series_id_chapter_number_key (UNIQUE (series_id,
    // chapter_number)) — the UPDATE was refused before the title or a single
    // page change was saved, which the creator saw as "Edit is completely
    // broken, images gone, title won't save". A "next chapter number" only
    // exists in the CREATE flow, so in edit mode this must not run at all.
    // guessNextChapterNumber() refuses to guess there too, so the invariant is
    // pinned by a unit test instead of only living here.
    if (isEditMode) return;

    supabase.from('chapters').select('chapter_number').eq('series_id', existingSeriesId)
      .order('chapter_number', { ascending: false }).limit(1)
      .then(({ data }) => {
        const guess = guessNextChapterNumber({
          isEditMode,
          latestChapterNumber: data?.[0]?.chapter_number ?? null,
        });
        if (guess !== null) setChapterNumber(guess);
      });
  }, [existingSeriesId, isEditMode]);

  // Permission pre-flight — see `writeBlock` above. Mirrors the series page's
  // "+ Add Chapter" gate (canManageSeries(role, isOwner), ownership-only) so a
  // viewer who can't write to this series is told WHY on arrival, instead of
  // getting the raw PostgREST "new row violates row-level security policy for
  // table chapters" after picking pages (or after a 100-page PDF conversion).
  // The database enforces the same ownership rule server-side; this is UX, not
  // the boundary.
  useEffect(() => {
    if (!existingSeriesId) return;
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      // Signed out — a published series and its chapters stay world-readable,
      // so the page still renders normally and only the writes get refused.
      if (!user) {
        setWriteBlock(seriesWriteBlockReason(null, false, false));
        return;
      }

      const { data: seriesRow } = await supabase
        .from('series').select('creator_id').eq('id', existingSeriesId).maybeSingle();
      if (cancelled) return;

      // An unreadable series is someone else's DRAFT (the series SELECT policy
      // only exposes published series, plus your own), so creator_id can't be
      // compared — say so rather than blaming ownership.
      if (!seriesRow) {
        setWriteBlock('This series could not be loaded. If it is still a draft, only the account that created it can add chapters to it.');
        return;
      }

      const { data: profileRow } = await supabase
        .from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (cancelled) return;

      setWriteBlock(
        seriesWriteBlockReason(profileRow?.role, ownsSeries(user.id, seriesRow.creator_id), true)
      );
    })();

    return () => { cancelled = true; };
  }, [existingSeriesId]);

  // Edit mode — load the existing chapter's own fields, the chapter number
  // included. In this mode this effect is the ONLY writer of `chapterNumber`:
  // the "next chapter number" guess above returns early (see its comment) —
  // the two used to race, and when the guess won, Save collided with another
  // chapter's number and nothing at all was written. Runs once editChapterId
  // is known.
  useEffect(() => {
    if (!editChapterId) return;
    let cancelled = false;

    const loadChapterForEdit = async () => {
      setEditLoading(true);
      setEditLoadError('');

      const { data: chapter, error: chapterErr } = await supabase
        .from('chapters')
        .select('id, chapter_number, title, content, word_count, series_id, author_note_before, author_note_after, is_draft, scheduled_at, tags')
        .eq('id', editChapterId)
        .single();

      if (cancelled) return;

      if (chapterErr || !chapter) {
        setEditLoadError('Could not load this chapter — it may have been deleted.');
        setEditLoading(false);
        return;
      }

      setChapterNumber(chapter.chapter_number);
      setChapterTitle(chapter.title || '');
      setAuthorNoteBefore(chapter.author_note_before || '');
      setAuthorNoteAfter(chapter.author_note_after || '');
      setIsDraftChapter(!!chapter.is_draft);
      // Preserve the instant when editing in IST (or any other timezone).
      setScheduledAt(toLocalDateTimeInput(chapter.scheduled_at));
      setTagsInput(Array.isArray(chapter.tags) ? chapter.tags.join(', ') : '');

      // Fingerprint baseline for the unsaved-changes guard, collected while
      // the row is unpacked (the state setters above are async, so the form
      // values cannot be read straight back out yet).
      let loadedPagesKey = '';

      if (chapter.content) {
        // Novel chapter — text lives on the chapter row itself
        setNovelContent(chapter.content);
      } else {
        // Manga chapter — load its pages, in order, into the SAME unified
        // `pages` array new uploads will join, tagged kind:'existing' so
        // save knows to keep/renumber rather than upload them.
        const { data: pageRows, error: pagesErr } = await supabase
          .from('pages')
          .select('id, page_number, image_url')
          .eq('chapter_id', editChapterId)
          .order('page_number', { ascending: true });

        if (cancelled) return;

        if (pagesErr) {
          setEditLoadError('Chapter loaded, but its pages could not be loaded.');
        } else if (pageRows) {
          setPages(pageRows.map(p => ({ kind: 'existing' as const, id: p.id, image_url: p.image_url })));
          loadedPagesKey = pageRows.map(p => `e:${p.id}`).join('|');
        }
      }

      // Nothing counts as an edit until the creator actually changes something.
      savedEditSignatureRef.current = chapterEditSignature({
        fields: {
          chapterNumber: chapter.chapter_number,
          title: chapter.title || '',
          authorNoteBefore: chapter.author_note_before || '',
          authorNoteAfter: chapter.author_note_after || '',
          isDraft: !!chapter.is_draft,
          scheduledAt: toLocalDateTimeInput(chapter.scheduled_at),
          tagsInput: Array.isArray(chapter.tags) ? chapter.tags.join(', ') : '',
        },
        pagesKey: loadedPagesKey,
      });
      setHasUnsavedChanges(false);

      setEditLoading(false);
    };

    loadChapterForEdit();
    return () => { cancelled = true; };
  }, [editChapterId]);

  // Step 21 — Novel draft autosave: restore any in-progress draft for this
  // exact series + chapter number whenever either changes (e.g. creator
  // bumps the chapter number, or comes back after closing the tab).
  // Skipped entirely in edit mode — these "next new chapter" drafts are
  // unrelated to the specific already-published chapter being edited, and
  // loading one here would silently overwrite the content we just fetched.
  useEffect(() => {
    if (isEditMode || contentType !== 'novel' || !seriesId) return;
    const draft = loadDraft(seriesId, chapterNumber);
    if (draft) setNovelContent(draft);
  }, [isEditMode, contentType, seriesId, chapterNumber]);

  // Autosave on every change, debounced lightly via a short timeout so
  // typing doesn't write to localStorage on every keystroke. Also skipped
  // in edit mode for the same reason as above.
  useEffect(() => {
    if (isEditMode || contentType !== 'novel' || !seriesId) return;
    const timeout = setTimeout(() => {
      saveDraft(seriesId, chapterNumber, novelContent);
    }, 600);
    return () => clearTimeout(timeout);
  }, [novelContent, isEditMode, contentType, seriesId, chapterNumber]);

  const inputStyle = {
    width: '100%', padding: '11px 14px', borderRadius: '10px',
    background: 'var(--bg-input)', border: '1px solid var(--border-light)',
    color: 'var(--text-primary)', fontSize: '13px', outline: 'none',
    boxSizing: 'border-box' as const, fontFamily: 'inherit',
  };
  const labelStyle = {
    display: 'block', fontSize: '10px', fontWeight: 700 as const,
    color: 'var(--text-tertiary)', letterSpacing: '0.12em', textTransform: 'uppercase' as const,
    marginBottom: '6px',
  };
  const toolbarBtnStyle = {
    padding: '6px 10px', borderRadius: '6px',
    background: 'var(--bg-input)', border: '1px solid var(--border-light)',
    color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 700 as const,
    cursor: 'pointer' as const,
  };
  const toolbarBtnActiveStyle = {
    background: 'rgba(127,29,29,0.25)', border: '1px solid #7f1d1d', color: '#fff',
  };

  // ---- Cover photo selection ----
  const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setCheckingQuality(true);
    const { results } = await checkImageBatchQuality([file], { minWidth: 400, minHeight: 500 });
    setCheckingQuality(false);

    if (!results[0].passed) {
      setError(`Cover photo rejected — ${results[0].reason}`);
      e.target.value = '';
      return;
    }

    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  // ---- STEP 1: Create Series ----
  const handleCreateSeries = async () => {
    if (!userId) { setError('Please log in first!'); return; }
    if (!title.trim()) { setError('Series title is required!'); return; }
    if (!genre) { setError('Please select a genre!'); return; }
    if (!synopsis.trim()) { setError('Please write a short description!'); return; }

    setLoading(true); setError('');

    let coverUrl: string | null = null;

    // Upload cover image first, if provided
    if (coverFile) {
      try {
        const { url } = await uploadMediaFile(coverFile, MEDIA_FOLDERS.seriesCovers);
        coverUrl = url;
      } catch (uploadError) {
        setError(`Cover upload: ${uploadError instanceof Error ? uploadError.message : 'failed'}`);
        setLoading(false);
        return;
      }
    }

    const seriesPayload = {
      creator_id: userId,
      title: title.trim(),
      synopsis: synopsis.trim(),
      genre,
      language,
      cover_url: coverUrl,
      reading_mode: readingMode,
      content_type: contentType,
      status: 'draft' as const,
    };

    // Step 30 — is_mature is a new column (see the 20260810 migration). Try
    // with it first; if that migration hasn't been run yet in this Supabase
    // project, Postgres returns "column does not exist" (42703) — retry
    // without the field so creating a series never breaks on this.
    let { data, error } = await supabase
      .from('series')
      .insert({ ...seriesPayload, is_mature: isMature })
      .select()
      .single();

    if (error?.code === '42703') {
      ({ data, error } = await supabase
        .from('series')
        .insert(seriesPayload)
        .select()
        .single());
    }

    if (error) { setError(error.message); setLoading(false); return; }

    // Step 30 — attach tags typed at creation time, same pattern as
    // EditSeriesModal's tag save: upsert any brand-new tag names, then
    // insert the series_tags rows. Non-fatal — a tag hiccup shouldn't
    // block the creator from moving on to uploading their first chapter.
    const tagNames = seriesTagsInput.split(',').map(t => t.trim()).filter(Boolean);
    if (tagNames.length > 0) {
      const tagIds: string[] = [];
      for (const name of tagNames) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!slug) continue;
        const { data: tagRow } = await supabase
          .from('tags')
          .upsert({ name, slug }, { onConflict: 'name' })
          .select('id')
          .single();
        if (tagRow) tagIds.push(tagRow.id);
      }
      if (tagIds.length > 0) {
        await supabase.from('series_tags').insert(tagIds.map(tag_id => ({ series_id: data.id, tag_id })));
      }
    }

    setSeriesId(data.id);
    setStep('chapter');
    setLoading(false);
  };

  // ---- File selection for comic pages ----
  // The image-picker path is gone: manga chapters are uploaded as a single
  // PDF (handlePdfSelect below), which is the chapter the creator already
  // has. Converting it in the browser fixes the whole class of problems the
  // multi-image path could not: pages can't arrive out of order, a chapter
  // can't be half-selected by mistake, and abandoned attempts no longer
  // scatter orphaned objects through the media bucket. Every page still goes
  // through the same blur + resolution quality gate afterwards.
  //
  // "Upload via PDF" — converts every PDF page into a normal image File in
  // the browser, then pushes it through the SAME quality gate and unified
  // `pages` list as hand-picked images. Nothing downstream changes: reorder,
  // remove, min-page count, and publish all treat PDF pages identically.
  // Conversion is atomic — if any page fails, nothing is added.
  const handlePdfSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const pdfFile = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!pdfFile) return;
    if (checkingQuality || processingPdf || loading) return;

    setError('');
    setMessage('');
    setProcessingPdf(true);
    setPdfProgress({ done: 0, total: 0 });

    // try/finally guarantees the button can never be left stuck on
    // "Converting PDF…" — not even if the quality gate itself throws.
    try {
      const converted = await pdfToPages(pdfFile, PDF_TO_PAGES_DEPS, {
        onProgress: (done, total) => setPdfProgress({ done, total }),
      });

      if (!converted.success || !converted.files) {
        setError(converted.error || 'The PDF could not be converted.');
        return;
      }

      // Same blur + resolution gate as the image path, so a PDF can't be used
      // to sneak low-quality pages past the check images already have.
      setCheckingQuality(true);
      const { results, failedFiles } = await checkImageBatchQuality(converted.files);
      setCheckingQuality(false);

      const acceptedFiles = converted.files.filter((_, i) => results[i].passed);
      const newItems: PageItem[] = acceptedFiles.map((file) => ({
        kind: 'new' as const,
        file,
        preview: URL.createObjectURL(file),
      }));
      setPages((prev) => [...prev, ...newItems]);

      if (failedFiles.length > 0) {
        const reasons = converted.files
          .map((f, i) => (results[i].passed ? null : `page ${i + 1} ("${f.name}") — ${results[i].reason}`))
          .filter(Boolean)
          .join('  •  ');
        setError(`${failedFiles.length} page(s) rejected for low quality: ${reasons}`);
      } else {
        setMessage(`Added ${acceptedFiles.length} page(s) from your PDF — reorder them below if needed.`);
      }
    } catch {
      setError('The PDF could not be converted. Please try again.');
    } finally {
      setCheckingQuality(false);
      setProcessingPdf(false);
      setPdfProgress(null);
    }
  };

  // Removing a page works the same regardless of whether it's an existing
  // (already-saved) page or a newly-added one this session — it just comes
  // out of the single unified list. If it was an existing page, we also
  // remember its id so save knows to actually delete that row in Supabase.
  const removePage = (index: number) => {
    setPages((prev) => {
      const item = prev[index];
      if (item.kind === 'existing') {
        setRemovedExistingPageIds((ids) => [...ids, item.id]);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Moving works uniformly across the whole list too — this is what makes
  // "insert a new page in the middle/start" possible: add it (it lands at
  // the end), then move it left as many times as needed, mixing freely
  // with existing pages. Order in this array IS the final page order.
  const movePage = (index: number, direction: -1 | 1) => {
    setPages((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Total page count is now simply pages.length — existing and new pages
  // live in the same array, so no separate existing/kept bookkeeping is
  // needed for the minimum-pages check anymore.
  const totalMangaPageCount = pages.length;

  // ---- STEP 2: Create Chapter + Upload Pages (or, in edit mode, SAVE an existing one) ----
  // `draftMode` is the comic counterpart of the novel branch's "Save Draft":
  // the minimum-page rule is a PUBLISHING rule, so a half-assembled chapter
  // can be saved with is_draft = true and stay invisible to readers, instead
  // of the creator being stuck holding pages in an open tab.
  const handlePublishChapter = async (draftMode = false) => {
    if (!seriesId) { setError('Create the series first!'); return; }
    if (totalMangaPageCount === 0) { setError('Upload at least one page!'); return; }
    if (!draftMode && totalMangaPageCount < MIN_PAGES_PER_CHAPTER) {
      setError(`A chapter needs at least ${MIN_PAGES_PER_CHAPTER} pages to publish — you have ${totalMangaPageCount}.`);
      return;
    }
    // Pre-flight refusals — the DB rejects these anyway, with a far less
    // useful message (see describeWriteError), and only after every page has
    // been uploaded. Checked live-ish: `writeBlock` is resolved by the
    // pre-flight effect, `userId` by auth.getUser() on mount.
    if (!userId) { setError('Your session has expired — please log in again before publishing.'); return; }
    if (writeBlock) { setError(writeBlock); return; }
    setLoading(true); setError(''); setMessage('');

    // What this chapter's draft flag becomes: an explicit "Save Draft" always
    // drafts, and a future-scheduled chapter is stored as a draft so it stays
    // hidden until its time (the rule the novel branch already used).
    const nextIsDraft = draftMode || isFutureSchedule(chapterMetadataInput.scheduledAt);

    // ---- EDIT MODE: update the existing chapter row instead of inserting a new one ----
    if (isEditMode && editChapterId) {
      // BUG FIX — this update used to write `chapter_number` and `title` only.
      // Every other column the Edit screen loads into the form (author notes,
      // tags, draft flag, schedule) was silently dropped, so an author could
      // type a note, see it in the box, save, and lose it. All chapter-row
      // metadata now comes from the one shared builder. Like the novel path,
      // a future-scheduled chapter is stored as a draft so it stays hidden
      // until its time.
      const metadata = buildChapterMetadataFields({
        ...chapterMetadataInput,
        isDraft: nextIsDraft,
      });
      const { error: updateError } = await supabase
        .from('chapters')
        .update(metadata)
        .eq('id', editChapterId);

      if (updateError) { setError(describeWriteError(updateError.message)); setLoading(false); return; }

      // Delete any pages the creator removed during this edit. Explicit
      // delete (not relying on a possible ON DELETE CASCADE) since we're
      // removing individual page rows here, not the whole chapter.
      if (removedExistingPageIds.length > 0) {
        const { error: deletePagesError } = await supabase
          .from('pages')
          .delete()
          .in('id', removedExistingPageIds);
        if (deletePagesError) { setError(`Removing old page(s): ${deletePagesError.message}`); setLoading(false); return; }
      }

      // BUG FIX — renumbering existing pages directly to their final position
      // (e.g. page_number 6 -> 4) can collide with another existing page
      // that still temporarily holds that target number (e.g. another page
      // is currently 4 and hasn't been moved yet). pages has a UNIQUE
      // (chapter_id, page_number) constraint, so that collision fails the
      // whole save immediately ("duplicate key value violates unique
      // constraint"), which is exactly the silent-looking failure that made
      // edits appear to "not save" / "still show old".
      //
      // Fix: two-pass renumber. First push every existing page's number into
      // a temporary range that cannot possibly collide with anything (a
      // large positive offset — not negative numbers, in case the table has
      // an unseen CHECK(page_number > 0) constraint we can't safely assume
      // is absent), THEN assign the real final numbers in a second pass. At
      // no point during either pass do two rows share a number.
      const TEMP_PAGE_NUMBER_OFFSET = 1000000; // far above any realistic chapter's page count
      const existingItems = pages
        .map((item, i) => ({ item, finalPageNumber: i + 1 }))
        .filter((x): x is { item: Extract<PageItem, { kind: 'existing' }>; finalPageNumber: number } => x.item.kind === 'existing');

      // Pass 1: move every existing page to a unique temporary high slot
      for (let i = 0; i < existingItems.length; i++) {
        const tempNumber = TEMP_PAGE_NUMBER_OFFSET + i; // guaranteed unique among themselves and never collides with any real page_number
        const { error: tempError } = await supabase
          .from('pages')
          .update({ page_number: tempNumber })
          .eq('id', existingItems[i].item.id);
        if (tempError) { setError(`Reordering pages (step 1): ${tempError.message}`); setLoading(false); return; }
      }

      // Pass 2: assign each existing page its real final page_number
      for (let i = 0; i < existingItems.length; i++) {
        const { item, finalPageNumber } = existingItems[i];
        const { error: finalError } = await supabase
          .from('pages')
          .update({ page_number: finalPageNumber })
          .eq('id', item.id);
        if (finalError) { setError(`Reordering pages (step 2): ${finalError.message}`); setLoading(false); return; }
      }

      // Walk the unified list in its FINAL order to handle NEW pages — this
      // is what makes inserting a new page anywhere (start/middle/end)
      // actually work: page_number is just "index + 1" in whatever order
      // the creator left things in. By this point every existing page
      // already holds its correct final number (from the two passes above),
      // so a new page's number here can never collide with an existing one.
      for (let i = 0; i < pages.length; i++) {
        const item = pages[i];
        const newPageNumber = i + 1;
        if (item.kind !== 'new') continue; // existing pages already handled above

        // New page — upload the file, then insert its row at this exact position.
        let pageUrl: string;
        try {
          const { url } = await uploadMediaFile(item.file, MEDIA_FOLDERS.chapterPages);
          pageUrl = url;
        } catch (uploadError) {
          setError(`Page ${newPageNumber}: ${uploadError instanceof Error ? uploadError.message : 'failed'}`);
          setLoading(false);
          return;
        }

        const { error: pageError } = await supabase.from('pages').insert({
          chapter_id: editChapterId,
          page_number: newPageNumber,
          image_url: pageUrl,
        });
        if (pageError) { setError(`Page ${newPageNumber} save: ${pageError.message}`); setLoading(false); return; }
      }

      setRemovedExistingPageIds([]);

      // Reload fresh pages from the DB into the SAME unified array so the
      // screen reflects exactly what's now saved (no stale preview blobs,
      // no leftover "new" items, correct ids/order for the next edit).
      const { data: refreshedPages } = await supabase
        .from('pages').select('id, page_number, image_url')
        .eq('chapter_id', editChapterId).order('page_number', { ascending: true });
      if (refreshedPages) {
        // resolveMediaUrl: a stored page URL is absolute and names the origin
        // it was uploaded from. Editing from any other origin (preview
        // deploy, custom domain replacing workers.dev, localhost) therefore
        // rendered every saved page as a broken box, which is exactly what
        // "my pages are gone, I have to upload the PDF again" looks like.
        // Rewriting it at render time fixes that without migrating a row.
        setPages(refreshedPages.map(p => ({ kind: 'existing' as const, id: p.id, image_url: resolveMediaUrl(p.image_url) })));
      }

      // Mirror the written draft flag into the form so the "Saved as draft"
      // badge tells the truth, then record the baseline from what the DB now
      // holds.
      setIsDraftChapter(nextIsDraft);
      markEditSaved({ isDraft: nextIsDraft });
      setMessage(draftMode
        ? `Draft saved — Chapter ${chapterNumber} is not visible to readers yet.`
        : `Chapter ${chapterNumber} updated! Taking you back...`);
      setLoading(false);
      // Hard navigation (not Next.js client-side routing) so the series page
      // re-fetches fresh data on load instead of potentially serving a
      // cached RSC/client snapshot from before this edit.
      setTimeout(() => { window.location.href = `/WebMangal/series/${seriesId}`; }, 1200);
      return;
    }

    // ---- CREATE MODE (original behavior, unchanged — every item here is
    // always kind:'new' since create mode never loads existing pages) ----
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({
        series_id: seriesId,
        // Same shared builder as the edit path, so a brand-new comic chapter
        // carries its author notes / tags / schedule too instead of being
        // created with two columns and then "completed" by a buggy edit.
        ...buildChapterMetadataFields({
          ...chapterMetadataInput,
          isDraft: nextIsDraft,
        }),
      })
      .select()
      .single();

    if (chapterError) { setError(describeWriteError(chapterError.message)); setLoading(false); return; }

    // Every item is kind:'new' here — create mode never loads existing pages.
    // publishChapterPages uploads + inserts pages one at a time (page order
    // preserved, no concurrent writes) and rolls back everything it wrote
    // (pages, R2 objects, and the chapter row itself) if any page fails, so
    // a mid-upload failure never leaves an orphaned partial chapter behind.
    const publishResult = await publishChapterPages(
      pages.filter((item) => item.kind === 'new').map((item) => item.file),
      {
        uploadFile: (file) => uploadMediaFile(file, MEDIA_FOLDERS.chapterPages),
        insertPage: async (pageNumber, imageUrl) => {
          const { data, error: pageError } = await supabase
            .from('pages')
            .insert({ chapter_id: chapter.id, page_number: pageNumber, image_url: imageUrl })
            .select('id')
            .single();
          if (pageError || !data) return { error: pageError?.message || 'insert failed' };
          return { id: data.id };
        },
        deletePagesByIds: async (pageIds) => { await supabase.from('pages').delete().in('id', pageIds); },
        deleteFiles: async (paths) => { await deleteMediaFiles(paths); },
        deleteChapter: async () => { await supabase.from('chapters').delete().eq('id', chapter.id); },
      }
    );

    if (!publishResult.success) {
      setError(publishResult.error || 'Publishing failed.');
      setLoading(false);
      return;
    }

    // A draft must not publish the series or ping followers — otherwise
    // saving an unfinished chapter would announce it to everyone who follows
    // the series while the chapter itself stays hidden.
    if (!draftMode) {
      await supabase.from('series').update({ status: 'published' }).eq('id', seriesId);

      // Step 25 — Notify followers about the new chapter.
      // Fire-and-forget: we don't await or block publish on this.
      // If it fails, the chapter is still live — notifications are best-effort.
      const { data: notifySessionData } = await supabase.auth.getSession();
      fetch('/api/notify-followers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${notifySessionData.session?.access_token}`,
        },
        body: JSON.stringify({
          seriesId,
          chapterId: chapter.id,
          chapterNumber,
          chapterTitle: chapterTitle.trim() || `Chapter ${chapterNumber}`,
        }),
      }).catch((err) => console.warn('[upload] notify-followers failed silently:', err));
    }

    setMessage(draftMode
      ? `Draft saved — ${pages.length} page(s) stored. Publish whenever it's ready.`
      : `Chapter ${chapterNumber} is live! ${pages.length} pages published.`);
    setJustPublishedChapterId(chapter.id);
    setPages([]);
    setLoading(false);
  };

  const handleAddAnotherChapter = () => {
    setChapterNumber((n) => n + 1);
    setChapterTitle('');
    setJustPublishedChapterId(null);
    setMessage('');
  };

  // ---- STEP 2 (Novel branch): Publish a text chapter (or SAVE an existing one in edit mode) ----
  // Separate from handlePublishChapter on purpose — manga path stays
  // completely untouched. No pages table, no manga-pages storage bucket;
  // the chapter row itself carries the text.
  // Shared field-builder for novel chapter writes — keeps publish and
  // draft-save from drifting out of sync on which columns they touch.
  const buildNovelChapterFields = (wordCount: number, draftFlag: boolean) => ({
    // Chapter-row metadata comes from the ONE shared builder the comic path
    // now uses too (lib/webmangal/chapterFields.ts); this branch keeps only
    // what is genuinely novel-specific. Two hand-rolled copies of the same
    // column list is what allowed the comic path to fall behind and drop
    // author notes / tags / draft / schedule on save.
    ...buildChapterMetadataFields({ ...chapterMetadataInput, isDraft: draftFlag }),
    content: novelContent,
    word_count: wordCount,
  });

  // Save without publishing — bypasses the word-count minimum since drafts
  // are allowed to be unfinished. Needs chapters.is_draft.
  const handleSaveNovelDraft = async () => {
    if (!seriesId) { setError('Create the series first!'); return; }
    if (!userId) { setError('Your session has expired — please log in again before saving.'); return; }
    if (writeBlock) { setError(writeBlock); return; }
    setSavingDraft(true); setError(''); setMessage('');

    const wordCount = countWords(novelContent);
    const fields = buildNovelChapterFields(wordCount, true);

    if (isEditMode && editChapterId) {
      const { error: updateError } = await supabase.from('chapters').update(fields).eq('id', editChapterId);
      if (updateError) { setError(describeWriteError(updateError.message)); setSavingDraft(false); return; }
      setIsDraftChapter(true);
      markEditSaved({ isDraft: true });
      setMessage(`Draft saved — ${wordCount} words. Still unpublished.`);
      setSavingDraft(false);
      return;
    }

    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({ series_id: seriesId, ...fields })
      .select()
      .single();

    if (chapterError) { setError(describeWriteError(chapterError.message)); setSavingDraft(false); return; }

    // Move into edit mode pointing at this draft row so the next Save Draft
    // (or Publish) updates it instead of creating a duplicate chapter.
    window.location.href = `/WebMangal/upload?seriesId=${seriesId}&chapterId=${chapter.id}`;
  };

  const handlePublishNovelChapter = async () => {
    if (!seriesId) { setError('Create the series first!'); return; }

    const wordCount = countWords(novelContent);
    if (wordCount < MIN_WORDS_PER_CHAPTER) {
      setError(`A chapter needs at least ${MIN_WORDS_PER_CHAPTER} words to publish — you have ${wordCount}.`);
      return;
    }
    if (!userId) { setError('Your session has expired — please log in again before publishing.'); return; }
    if (writeBlock) { setError(writeBlock); return; }

    setLoading(true); setError(''); setMessage('');

    // Renamed so it no longer shadows the imported helper of the same name;
    // both now share lib/webmangal/chapterFields' single definition of "is
    // this a real future schedule?" instead of a hand-rolled Date compare.
    const isScheduledAhead = isFutureSchedule(scheduledAt);
    const fields = buildNovelChapterFields(wordCount, isScheduledAhead);
    // Note: scheduling relies on whatever query loads chapters for readers
    // respecting `is_draft = false` (and, if you want strict scheduling,
    // `scheduled_at IS NULL OR scheduled_at <= now()`). This file only
    // writes the columns — wire that filter into your chapter-list/reader
    // query separately if it isn't already there.

    // ---- EDIT MODE: update the existing chapter row instead of inserting a new one ----
    if (isEditMode && editChapterId) {
      const { error: updateError } = await supabase
        .from('chapters')
        .update(fields)
        .eq('id', editChapterId);

      if (updateError) { setError(describeWriteError(updateError.message)); setLoading(false); return; }

      clearDraft(seriesId, chapterNumber);
      markEditSaved({ isDraft: isScheduledAhead });
      setMessage(isScheduledAhead
        ? `Chapter ${chapterNumber} scheduled for ${new Date(scheduledAt).toLocaleString()}. Taking you back...`
        : `Chapter ${chapterNumber} updated! ${wordCount} words. Taking you back...`);
      setLoading(false);
      setTimeout(() => { window.location.href = `/WebMangal/series/${seriesId}`; }, 1200);
      return;
    }

    // ---- CREATE MODE (original behavior, unchanged) ----
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({ series_id: seriesId, ...fields })
      .select()
      .single();

    if (chapterError) { setError(describeWriteError(chapterError.message)); setLoading(false); return; }

    await supabase.from('series').update({ status: 'published' }).eq('id', seriesId);

    clearDraft(seriesId, chapterNumber);

    // Step 25 — Notify followers (same fire-and-forget pattern as manga path above)
    // Skipped for future-scheduled chapters — followers shouldn't be pinged
    // about a chapter that isn't actually live yet.
    if (!isScheduledAhead) {
      const { data: notifySessionData } = await supabase.auth.getSession();
      fetch('/api/notify-followers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${notifySessionData.session?.access_token}`,
        },
        body: JSON.stringify({
          seriesId,
          chapterId: chapter.id,
          chapterNumber,
          chapterTitle: chapterTitle.trim() || `Chapter ${chapterNumber}`,
        }),
      }).catch((err) => console.warn('[upload] notify-followers failed silently:', err));
    }

    setMessage(isScheduledAhead
      ? `Chapter ${chapterNumber} scheduled for ${new Date(scheduledAt).toLocaleString()}.`
      : `Chapter ${chapterNumber} is live! ${wordCount} words published.`);
    setJustPublishedChapterId(chapter.id);
    setNovelContent('');
    setLoading(false);
  };

  // ---- Novel editor toolbar helpers (client-side only) ----

  // Directly mutates the textarea DOM value so the browser never loses the
  // selection, then fires a synthetic input event so React onChange picks up
  // the new value and keeps novelContent in sync.
  const applyToTextarea = (nextValue: string, newSelStart: number, newSelEnd: number) => {
    const el = novelTextareaRef.current;
    if (!el) return;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, nextValue);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      setNovelContent(nextValue);
    }
    el.focus();
    el.setSelectionRange(newSelStart, newSelEnd);
  };

  // Wraps selection with mark (** bold, * italic). Toggles off if already wrapped.
  // If no selection, inserts placeholder text wrapped in mark.
  //
  // FIXED: the old version detected "wrapped with `mark`" using only
  // startsWith/endsWith, so selecting bold text ("**bold**") and clicking
  // Italic (mark = '*') would false-positive match — "**bold**" DOES start
  // and end with a single '*' — and strip one asterisk off each side,
  // silently corrupting **bold** into *bold*. Same collision happened with
  // the "marks just outside selection" branch. Fix: every boundary check
  // now also confirms the character just beyond the marker is NOT itself
  // '*', so a single-* check can never match inside/around a double-**
  // (or triple-***) run.
  const wrapNovelSelection = (mark: string, placeholder: string) => {
    const el = novelTextareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const selected = value.slice(selectionStart, selectionEnd);
    const ml = mark.length;

    // Toggle OFF: selection itself is wrapped in EXACTLY `mark` (not a longer run).
    const startsWithExact = selected.startsWith(mark) && selected[ml] !== '*';
    const endsWithExact = selected.endsWith(mark) && selected[selected.length - ml - 1] !== '*';
    if (startsWithExact && endsWithExact && selected.length > ml * 2) {
      const inner = selected.slice(ml, selected.length - ml);
      const next = value.slice(0, selectionStart) + inner + value.slice(selectionEnd);
      applyToTextarea(next, selectionStart, selectionStart + inner.length);
      return;
    }
    // Toggle OFF: marks are just outside the selection, and are EXACTLY
    // `ml` long (the character one further out must not also be '*').
    const beforeIsExactMark =
      selectionStart >= ml &&
      value.slice(selectionStart - ml, selectionStart) === mark &&
      value[selectionStart - ml - 1] !== '*';
    const afterIsExactMark =
      value.slice(selectionEnd, selectionEnd + ml) === mark &&
      value[selectionEnd + ml] !== '*';
    if (beforeIsExactMark && afterIsExactMark) {
      const next = value.slice(0, selectionStart - ml) + selected + value.slice(selectionEnd + ml);
      applyToTextarea(next, selectionStart - ml, selectionStart - ml + selected.length);
      return;
    }

    const word = selected || placeholder;
    const next = value.slice(0, selectionStart) + mark + word + mark + value.slice(selectionEnd);
    applyToTextarea(next, selectionStart + ml + word.length + ml, selectionStart + ml + word.length + ml);
  };

  // Toggles "# " heading prefix on current line. Clicking H again removes it.
  const toggleNovelHeading = () => {
    const el = novelTextareaRef.current;
    if (!el) return;
    const { selectionStart, value } = el;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const prefix = '# ';
    if (value.slice(lineStart, lineStart + prefix.length) === prefix) {
      const next = value.slice(0, lineStart) + value.slice(lineStart + prefix.length);
      applyToTextarea(next, Math.max(lineStart, selectionStart - prefix.length), Math.max(lineStart, selectionStart - prefix.length));
    } else {
      const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
      applyToTextarea(next, selectionStart + prefix.length, selectionStart + prefix.length);
    }
  };

  const insertNovelSceneBreak = () => {
    const el = novelTextareaRef.current;
    if (!el) return;
    const { selectionStart, value } = el;
    const needsLeadingBreak = selectionStart > 0 && value[selectionStart - 1] !== '\n';
    const block = `${needsLeadingBreak ? '\n\n' : ''}***\n\n`;
    const next = value.slice(0, selectionStart) + block + value.slice(selectionStart);
    applyToTextarea(next, selectionStart + block.length, selectionStart + block.length);
  };

  // Ctrl/Cmd+B / I / H shortcuts inside the chapter textarea.
  const handleNovelTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); wrapNovelSelection('**', 'bold text'); }
    if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); wrapNovelSelection('*', 'italic text'); }
    if (mod && e.key.toLowerCase() === 'h') { e.preventDefault(); toggleNovelHeading(); }
  };

  // Live preview HTML now comes from lib/novelEditor.ts's renderNovelPreviewHtml,
  // which shares the exact same parseChapterContent() logic the Reader uses —
  // so what the creator sees in Preview mode is guaranteed to match what
  // readers will actually see. (Previously this was a separate, fragile
  // regex chain here that broke on repeated "#", runs of "*****", and
  // "***" appearing inline — see novelEditor.ts header comment for details.)

  // ---- Shared chapter-metadata fields (comic AND novel) -------------------
  // These blocks used to exist only inside the novel branch, which meant a
  // comic creator had no way to add an author's note, tags or a schedule to a
  // chapter at all. On every platform with a chapter editor those are
  // per-chapter fields, not a prose-only feature, so they render for both
  // content types now — and the shared builder
  // (lib/webmangal/chapterFields.ts) is what actually persists them.
  const chapterAuthorNoteBeforeField = (
    <div>
      <label style={labelStyle}>Author&apos;s Note — Before Chapter (optional)</label>
      <WebMangalAiEditor
        feature="author-note"
        ariaLabel="Author's note before chapter"
        placeholder="e.g. Sorry for the late update! Thanks for 1k reads"
        value={authorNoteBefore}
        onChange={setAuthorNoteBefore}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' as const, fontSize: '12px' }}
      />
    </div>
  );

  const chapterAuthorNoteAfterField = (
    <div>
      <label style={labelStyle}>Author&apos;s Note — After Chapter (optional)</label>
      <WebMangalAiEditor
        feature="author-note"
        ariaLabel="Author's note after chapter"
        placeholder="e.g. Next chapter drops Friday. Comment your theories!"
        value={authorNoteAfter}
        onChange={setAuthorNoteAfter}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' as const, fontSize: '12px' }}
      />
    </div>
  );

  // Status, not an input: shown whenever the row currently saved is a draft.
  const chapterDraftBadge = isDraftChapter ? (
    <div style={{ fontSize: '11px', fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '8px', padding: '8px 12px' }}>
      <FileText size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Saved as draft — not visible to readers yet. Publish when ready.
    </div>
  ) : null;

  const chapterTagsAndScheduleFields = (
    <div style={{ display: 'flex', gap: '12px' }}>
      {/* Tags / content warnings. Optional; needs chapters.tags (text[]) */}
      <div style={{ flex: 1 }}>
        <label style={labelStyle}>Tags (comma separated)</label>
        <input
          type="text"
          placeholder="e.g. slow-burn, violence-warning"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          style={inputStyle}
        />
      </div>
      {/* Scheduled publish. Optional; needs chapters.scheduled_at */}
      <div style={{ flex: 1 }}>
        <label style={labelStyle}>Schedule For Later (optional)</label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          style={{ ...inputStyle, colorScheme: 'dark' as const }}
        />
      </div>
    </div>
  );

  // Everything a chapter can change besides its pages, in one place, used by
  // both branches so they cannot drift apart again.
  const chapterMetadataEditor = (
    <>
      {chapterAuthorNoteBeforeField}
      {chapterAuthorNoteAfterField}
      {chapterTagsAndScheduleFields}
      {chapterDraftBadge}
    </>
  );

  return (
    <>
      <Navbar
        variant="custom"
        platformName="WebMangal"
        logoSrc="/webmangal-logo.png"
        href="/WebMangal"
        subtitle="powered by MANGAL"
        centerSlot={
          <a href="/WebMangal" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}>
            <ArrowLeft size={14} /> Back to WebMangal
          </a>
        }
      />
      <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', padding: '40px 24px', }}>
      {/* Mobile pass — biggest remaining page (1300+ lines), but the two-column
          Series Info step and toolbar rows already used flexWrap, so this only
          needed: outer/card padding tightened, the h1 given a mobile size (was
          a fixed 36px with no clamp), the cover-panel sized down so it doesn't
          dominate a narrow screen once it wraps above the details column, and
          the Focus Mode overlay's header row given room to wrap. */}
      <style>{`
        @media (max-width: 640px) {
          .mangal-upload-shell { padding: 24px 16px !important; }
          .mangal-upload-card { padding: 20px !important; border-radius: 16px !important; }
          .mangal-upload-title { font-size: 26px !important; }
          .mangal-upload-focus { padding: 20px 16px !important; }
        }
        @media (max-width: 480px) {
          .mangal-upload-cover-wrap { flex-basis: 140px !important; width: 140px !important; }
          .mangal-upload-cover-box { width: 140px !important; height: 186px !important; }
        }
      `}</style>
      <div className="mangal-upload-shell" style={{ maxWidth: '720px', margin: '0 auto' }}>
        <a href={seriesId ? `/WebMangal/series/${seriesId}` : '/dashboard'} style={{ fontSize: '12px', color: 'var(--text-tertiary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ArrowLeft size={12} /> Back to {seriesId ? 'Series' : 'Dashboard'}</a>
        <div style={{ marginTop: '16px' }} />
        <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em', color: '#d97706', background: 'rgba(120,53,15,0.25)', border: '1px solid rgba(180,83,9,0.3)', padding: '4px 10px', borderRadius: '6px', textTransform: 'uppercase' as const }}>
          Mangal Engine V1.0
        </span>
        <h1 className="mangal-upload-title" style={{ fontSize: '36px', fontWeight: 900, color: 'var(--text-primary)', margin: '16px 0 4px' }}>
          {step === 'series' ? 'Start a New Story' : isEditMode ? 'Edit Chapter' : justPublishedChapterId ? 'Chapter Published' : contentType === 'novel' ? 'Write Chapter' : 'Upload Pages'}
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '32px' }}>
          {step === 'series'
            ? 'Tell readers what your series is about'
            : justPublishedChapterId
            ? `"${title}"`
            : `"${title}" — Chapter ${chapterNumber}`}
        </p>

        {editLoading && (
          <div style={{ textAlign: 'center' as const, padding: '40px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
            Loading chapter...
          </div>
        )}

        {editLoadError && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '12px', marginBottom: '16px' }}>
            {editLoadError}
          </div>
        )}

        {!editLoading && (
        <>
        {error && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '12px', marginBottom: '16px' }}>{error}</div>}
        {/* Blocked-write banner — amber (a permission gate), not red (a
            failure). Shown as soon as the pre-flight check resolves, so the
            creator knows before picking pages that this series isn't
            writable from the account they're signed in as. */}
        {writeBlock && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', fontSize: '12px', marginBottom: '16px' }}>{writeBlock}</div>}
        {message && !justPublishedChapterId && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: '12px', marginBottom: '16px' }}>{message}</div>}
        {/* Unsaved-changes notice for the Edit Chapter screen: the form is
            tracked against what the DB last held, so this appears the moment
            anything changes and disappears once it is saved (the browser also
            warns before the tab is closed). "Discard Changes" reloads the
            chapter exactly as stored — the escape hatch every editor has. */}
        {isEditMode && hasUnsavedChanges && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', fontSize: '12px', marginBottom: '16px' }}>
            <span>Unsaved changes — these edits aren&apos;t saved yet.</span>
            <button
              type="button"
              onClick={discardChanges}
              style={{ background: 'none', border: '1px solid rgba(245,158,11,0.5)', borderRadius: '6px', color: '#f59e0b', fontSize: '11px', fontWeight: 700, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' as const }}
            >
              Discard Changes
            </button>
          </div>
        )}

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '32px', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }} className="mangal-upload-card">

          {/* STEP 1: SERIES INFO — two-column layout (cover left, details right),
              inspired by the reference screenshots the founder shared. Only the
              *layout pattern* was borrowed — fields stay MANGAL's own (no
              Copyright/Main Characters/Target Audience, see CONTEXT.md §7). */}
          {step === 'series' && (
            <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' as const }}>

              {/* LEFT — Cover upload, large Wattpad-style click target */}
              <div className="mangal-upload-cover-wrap" style={{ flex: '0 0 200px' }}>
                <label style={labelStyle}>Cover Photo</label>
                <label style={{ cursor: 'pointer', display: 'block' }}>
                  <div className="mangal-upload-cover-box" style={{
                    width: '200px', height: '266px', borderRadius: '14px', overflow: 'hidden' as const,
                    border: '2px dashed var(--border-light)', display: 'flex', flexDirection: 'column' as const,
                    alignItems: 'center', justifyContent: 'center', gap: '10px',
                    background: 'var(--bg-input)', position: 'relative',
                  }}>
                    {coverPreview ? (
                      <Image src={coverPreview} alt="Cover" fill sizes="200px" unoptimized style={{ objectFit: 'cover' }} />
                    ) : (
                      <>
                        <Camera size={32} />
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' as const, padding: '0 16px' }}>
                          Click to upload<br />a cover photo
                        </span>
                      </>
                    )}
                  </div>
                  <input type="file" accept="image/*" onChange={handleCoverSelect} style={{ display: 'none' }} />
                </label>
                {coverPreview && (
                  <span style={{ display: 'block', marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' as const }}>
                    Click cover to change
                  </span>
                )}
              </div>

              {/* RIGHT — Story Details */}
              <div style={{ flex: '1 1 320px', minWidth: '280px', display: 'flex', flexDirection: 'column' as const, gap: '18px' }}>

                {/* Step 21 — Content Type selector (Comic vs Novel) */}
                <div>
                  <label style={labelStyle}>Content Type</label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => setContentType('mangal')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: contentType === 'mangal' ? '1px solid #dc2626' : '1px solid var(--border-light)', background: contentType === 'mangal' ? 'rgba(127,29,29,0.2)' : 'var(--bg-input)', color: contentType === 'mangal' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                      <BookOpen size={15} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Comic<br /><span style={{ fontWeight: 400, fontSize: '10px' }}>Pages with images</span>
                    </button>
                    <button onClick={() => setContentType('novel')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: contentType === 'novel' ? '1px solid #dc2626' : '1px solid var(--border-light)', background: contentType === 'novel' ? 'rgba(127,29,29,0.2)' : 'var(--bg-input)', color: contentType === 'novel' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                      <BookText size={15} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Novel<br /><span style={{ fontWeight: 400, fontSize: '10px' }}>Text chapters</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Series Title</label>
                  <input type="text" placeholder="e.g., Krrish Legacy" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Genre</label>
                    <select value={genre} onChange={(e) => setGenre(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">Select genre</option>
                      {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Language</label>
                    <select value={language} onChange={(e) => setLanguage(e.target.value as 'Hindi' | 'English')} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="English">English</option>
                      <option value="Hindi">Hindi</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <WebMangalAiEditor
                    feature="synopsis"
                    ariaLabel="Series description"
                    placeholder="Write the cosmic arc..."
                    value={synopsis}
                    onChange={setSynopsis}
                    rows={4}
                    style={{ ...inputStyle, resize: 'vertical' as const }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Tags <span style={{ textTransform: 'none' as const, fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional)</span></label>
                  <input type="text" placeholder="e.g. reincarnation, system, slow-burn" value={seriesTagsInput} onChange={(e) => setSeriesTagsInput(e.target.value)} style={inputStyle} />
                  <span style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                    Comma-separated. Helps readers find your series by trope/theme — you can always add more later from your dashboard.
                  </span>
                  {/* §58b.3 — rule-based tag suggestions from title + description,
                      matched against tags that already exist on the platform.
                      Zero AI cost — see app/lib/tagSuggest.ts. */}
                  {suggestedSeriesTags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', alignSelf: 'center' }}>Suggested:</span>
                      {suggestedSeriesTags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => addSuggestedTag(tag.name)}
                          style={{
                            fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
                            cursor: 'pointer', border: '1px dashed var(--border-light)',
                            background: 'transparent', color: 'var(--text-tertiary)',
                          }}
                        >
                          + #{tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'var(--bg-input)',
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>Mature Content</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Violence, disturbing themes, or other mature content</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isMature}
                    onClick={() => setIsMature(v => !v)}
                    style={{
                      width: '42px', height: '24px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                      background: isMature ? '#dc2626' : 'var(--border-color)', position: 'relative', flexShrink: 0,
                      transition: 'background 0.15s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '3px', left: isMature ? '21px' : '3px',
                      width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                      transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>

                {contentType === 'mangal' && (
                  <div>
                    <label style={labelStyle}>Reading Mode</label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button onClick={() => setReadingMode('scroll')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: readingMode === 'scroll' ? '1px solid #dc2626' : '1px solid var(--border-light)', background: readingMode === 'scroll' ? 'rgba(127,29,29,0.2)' : 'var(--bg-input)', color: readingMode === 'scroll' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        <ScrollText size={15} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Vertical Scroll<br /><span style={{ fontWeight: 400, fontSize: '10px' }}>Webtoon style</span>
                      </button>
                      <button onClick={() => setReadingMode('page')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: readingMode === 'page' ? '1px solid #dc2626' : '1px solid var(--border-light)', background: readingMode === 'page' ? 'rgba(127,29,29,0.2)' : 'var(--bg-input)', color: readingMode === 'page' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        <BookOpen size={15} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Page by Page<br /><span style={{ fontWeight: 400, fontSize: '10px' }}>Traditional manga</span>
                      </button>
                    </div>
                  </div>
                )}

                <button onClick={handleCreateSeries} disabled={loading} style={{ width: '100%', padding: '14px', background: loading ? 'var(--border-color)' : 'linear-gradient(135deg, #f97316 0%, #22c55e 100%)', border: '1px solid #ea580c', borderRadius: '12px', color: loading ? 'var(--text-tertiary)' : '#fff', fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginTop: '8px' }}>
                  {loading ? 'Creating...' : <><ArrowRight size={13} style={{ verticalAlign: 'middle' }} /> {contentType === 'novel' ? 'Continue — Write Chapter' : 'Continue — Upload Pages'}</>}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CHAPTER + PAGES (or post-publish choice screen) */}
          {step === 'chapter' && justPublishedChapterId && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '14px', textAlign: 'center' as const, padding: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}><PartyPopper size={40} /></div>
              <p style={{ fontSize: '14px', color: '#d1d5db', margin: 0 }}>
                Chapter {chapterNumber} is published! What would you like to do next?
              </p>

              <a href={`/WebMangal/read/${justPublishedChapterId}`} target="_blank" rel="noopener noreferrer" style={{
                fontSize: '12px', color: '#d97706', textDecoration: 'none', fontWeight: 600,
              }}>
                <Eye size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Preview this chapter as a reader
              </a>

              <button onClick={handleAddAnotherChapter} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #f97316 0%, #22c55e 100%)', border: '1px solid #ea580c', borderRadius: '12px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', marginTop: '8px' }}>
                <Plus size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Add Another Chapter
              </button>

              {seriesId && (
                <a href={`/WebMangal/series/${seriesId}`} style={{
                  display: 'block', width: '100%', padding: '14px', background: 'transparent',
                  border: '1px solid var(--border-light)', borderRadius: '12px', color: 'var(--text-secondary)',
                  fontSize: '13px', fontWeight: 600, textDecoration: 'none', boxSizing: 'border-box' as const,
                }}>
                  <CheckCircle2 size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />I&apos;m Done — Go to Series Page
                </a>
              )}
            </div>
          )}

          {step === 'chapter' && !justPublishedChapterId && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '18px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Chapter Number</label>
                  <input type="number" min={1} value={chapterNumber} onChange={(e) => setChapterNumber(Number(e.target.value))} style={inputStyle} />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>Chapter Title (optional)</label>
                  <input type="text" placeholder={`Chapter ${chapterNumber}`} value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} style={inputStyle} />
                </div>
              </div>

              {contentType === 'mangal' && (
                <>
                  {/* Chapters are uploaded as a PDF and nothing else. The old
                      hand-picked-images path is gone on purpose: one PDF is
                      the chapter the creator already has, so a single
                      selection can't arrive out of order or half-finished, and
                      the bucket isn't left holding dozens of orphaned uploads
                      from abandoned attempts. pdf.js converts each PDF page
                      into a normal page image in the browser (loaded from
                      /vendor at runtime, never bundled) and the result goes
                      through the same quality gate and the same unified page
                      list as before, so nothing downstream changed. */}
                  <div>
                    <label style={labelStyle}>Comic Pages — upload the chapter as a PDF (order is kept as shown)</label>
                    <label style={{ display: 'block', padding: '24px', textAlign: 'center' as const, border: '2px dashed var(--border-light)', borderRadius: '12px', cursor: processingPdf || loading ? 'wait' : 'pointer', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                      {processingPdf
                        ? <><FileText size={13} style={{ verticalAlign: 'middle' }} /> Converting PDF… {pdfProgress && pdfProgress.total > 0 ? `${pdfProgress.done}/${pdfProgress.total}` : ''}</>
                        : checkingQuality
                        ? <><Search size={13} style={{ verticalAlign: 'middle' }} /> Checking page quality…</>
                        : <><Upload size={13} style={{ verticalAlign: 'middle' }} /> Click to select your chapter PDF</>}
                      <input type="file" accept=".pdf,application/pdf" onChange={handlePdfSelect} disabled={processingPdf || checkingQuality || loading} style={{ display: 'none' }} />
                    </label>
                  </div>
                  {processingPdf ? (
                    <div role="status" aria-live="polite" style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '-4px' }}>
                      Rendering page {pdfProgress?.done ?? 0} of {pdfProgress?.total || '…'} — pages are added once the whole PDF has converted.
                    </div>
                  ) : (
                    !checkingQuality && (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '-4px' }}>
                        Every PDF page becomes a chapter page automatically. Editing later? Upload the next PDF — the pages already saved stay exactly as they are.
                      </div>
                    )
                  )}

                  {/* Sprint 2: minimum-pages progress indicator — counts existing
                      (kept) pages + newly added pages together in edit mode */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: '8px',
                    background: totalMangaPageCount >= MIN_PAGES_PER_CHAPTER ? 'rgba(16,185,129,0.1)' : 'rgba(217,119,6,0.1)',
                    border: `1px solid ${totalMangaPageCount >= MIN_PAGES_PER_CHAPTER ? 'rgba(16,185,129,0.3)' : 'rgba(217,119,6,0.3)'}`,
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: totalMangaPageCount >= MIN_PAGES_PER_CHAPTER ? '#10b981' : '#d97706' }}>
                      {totalMangaPageCount} / {MIN_PAGES_PER_CHAPTER} pages minimum
                    </span>
                    {totalMangaPageCount < MIN_PAGES_PER_CHAPTER && (
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {MIN_PAGES_PER_CHAPTER - totalMangaPageCount} more needed to publish
                      </span>
                    )}
                    {totalMangaPageCount >= MIN_PAGES_PER_CHAPTER && (
                      <span style={{ fontSize: '11px', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={12} /> Ready to publish</span>
                    )}
                  </div>

                  {/* Unified page grid — existing (already-saved) and new
                      (picked this session) pages live side by side here, in
                      one single order. Every page gets the same move-left /
                      remove / move-right controls regardless of kind — this
                      is what lets a creator insert a new page anywhere
                      (start, middle, end) by adding it then nudging it into
                      position, exactly like a linked list. */}
                  {pages.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px' }}>
                      {pages.map((item, i) => (
                        <div key={item.kind === 'existing' ? item.id : `new-${i}`} style={{ position: 'relative' as const, border: `1px solid ${item.kind === 'new' ? 'rgba(217,119,6,0.4)' : 'var(--border-light)'}`, borderRadius: '8px', overflow: 'hidden', height: '120px' }}>
                          <Image
                            src={item.kind === 'existing' ? resolveMediaUrl(item.image_url) : item.preview}
                            alt={`Page ${i + 1}`}
                            fill
                            sizes="100px"
                            unoptimized
                            style={{ objectFit: 'cover' }}
                          />
                          <div style={{ position: 'absolute' as const, top: 4, left: 4, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>#{i + 1}</div>
                          {item.kind === 'new' && (
                            <div style={{ position: 'absolute' as const, top: 4, right: 4, background: 'rgba(217,119,6,0.85)', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>NEW</div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between' as const, background: 'var(--bg-input)', padding: '4px' }}>
                            <button onClick={() => movePage(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', color: i === 0 ? 'var(--text-faint)' : 'var(--text-secondary)', cursor: i === 0 ? 'not-allowed' : 'pointer', fontSize: '11px' }}><ChevronLeft size={14} /></button>
                            <button onClick={() => removePage(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}><Trash2 size={14} /></button>
                            <button onClick={() => movePage(i, 1)} disabled={i === pages.length - 1} style={{ background: 'none', border: 'none', color: i === pages.length - 1 ? 'var(--text-faint)' : 'var(--text-secondary)', cursor: i === pages.length - 1 ? 'not-allowed' : 'pointer', fontSize: '11px' }}><ChevronRight size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Author's note / tags / schedule / draft status — the
                      same fields the novel branch shows, now available to
                      comic chapters too (and, more importantly, actually
                      written by the shared builder on save). */}
                  {chapterMetadataEditor}

                  {/* Save row. "Save Draft" gives comics the parity the novel
                      branch always had: the 5-page minimum is a PUBLISHING
                      rule, so a chapter still being assembled can be stored
                      as a draft instead of living only in this tab. Note the
                      explicit () => calls: passing the handler directly would
                      hand it the click event as the `draftMode` argument. */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handlePublishChapter(true)}
                      disabled={loading || checkingQuality || processingPdf || totalMangaPageCount === 0}
                      style={{
                        flex: 1, padding: '14px',
                        background: 'var(--bg-input)', border: '1px solid var(--border-light)', borderRadius: '12px',
                        color: (loading || totalMangaPageCount === 0) ? 'var(--text-muted)' : 'var(--text-secondary)',
                        fontSize: '13px', fontWeight: 700,
                        cursor: (loading || totalMangaPageCount === 0) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {loading ? 'Saving...' : <><FileText size={13} style={{ verticalAlign: 'middle' }} /> Save Draft</>}
                    </button>
                    <button
                      onClick={() => handlePublishChapter(false)}
                      disabled={loading || totalMangaPageCount < MIN_PAGES_PER_CHAPTER}
                      style={{
                        flex: 2, padding: '14px',
                        background: (loading || totalMangaPageCount < MIN_PAGES_PER_CHAPTER) ? 'var(--border-color)' : 'linear-gradient(135deg, #f97316 0%, #22c55e 100%)',
                        border: '1px solid #ea580c', borderRadius: '12px',
                        color: (loading || totalMangaPageCount < MIN_PAGES_PER_CHAPTER) ? 'var(--text-tertiary)' : '#fff',
                        fontSize: '13px', fontWeight: 700,
                        cursor: (loading || totalMangaPageCount < MIN_PAGES_PER_CHAPTER) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {loading
                        ? (isEditMode ? 'Saving...' : 'Uploading...')
                        : totalMangaPageCount < MIN_PAGES_PER_CHAPTER
                        ? <><Lock size={13} style={{ verticalAlign: 'middle' }} /> Need {MIN_PAGES_PER_CHAPTER - totalMangaPageCount} more page(s) to publish</>
                        : isFutureSchedule(scheduledAt)
                        ? <><CalendarClock size={13} style={{ verticalAlign: 'middle' }} /> Schedule Chapter ({totalMangaPageCount} pages)</>
                        : isEditMode
                        ? <><Save size={13} style={{ verticalAlign: 'middle' }} /> Save Changes ({totalMangaPageCount} pages)</>
                        : <><Rocket size={13} style={{ verticalAlign: 'middle' }} /> Publish Live ({totalMangaPageCount} pages)</>}
                    </button>
                  </div>
                </>
              )}

              {/* Step 21 — MANGAL Novel Writer (replaces image uploader for novel chapters) */}
              {contentType === 'novel' && (
                <>
                  {/* Author's Note — before chapter. Optional; needs chapters.author_note_before */}
                  {chapterAuthorNoteBeforeField}

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Chapter Text</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" onClick={() => setNovelFocusMode(true)} title="Focus mode — distraction-free full screen" style={toolbarBtnStyle}><Expand size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Focus</button>
                        <button type="button" onClick={() => setNovelPreviewMode((p) => !p)} title="Toggle live preview" style={{ ...toolbarBtnStyle, ...(novelPreviewMode ? toolbarBtnActiveStyle : {}) }}>
                          {novelPreviewMode ? <><Edit3 size={13} style={{ verticalAlign: 'middle' }} /> Edit</> : <><Eye size={13} style={{ verticalAlign: 'middle' }} /> Preview</>}
                        </button>
                      </div>
                    </div>

                    {!novelPreviewMode && (
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' as const }}>
                        <button type="button" onClick={() => wrapNovelSelection('**', 'bold text')} title="Bold (Ctrl+B)" style={toolbarBtnStyle}><strong>B</strong></button>
                        <button type="button" onClick={() => wrapNovelSelection('*', 'italic text')} title="Italic (Ctrl+I)" style={toolbarBtnStyle}><em>I</em></button>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={toggleNovelHeading} title="Heading (Ctrl+H)" style={toolbarBtnStyle}>H</button>
                        <button type="button" onClick={insertNovelSceneBreak} title="Scene break" style={toolbarBtnStyle}>⁘ Scene Break</button>
                      </div>
                    )}

                    {novelPreviewMode ? (
                      <div
                        style={{ ...inputStyle, minHeight: '380px', lineHeight: 1.7, fontFamily: 'Georgia, "Noto Serif", serif', fontSize: '14px', overflowY: 'auto' as const }}
                        dangerouslySetInnerHTML={{ __html: novelContent.trim() ? renderNovelPreviewHtml(novelContent) : '<p style="color:var(--text-muted);">Nothing to preview yet — start writing.</p>' }}
                      />
                    ) : (
                      <WebMangalAiEditor
                        innerRef={novelTextareaRef}
                        feature="chapter"
                        ariaLabel="Chapter manuscript"
                        placeholder={'Likho yahan... # for a heading, **bold**, *italic*'}
                        value={novelContent}
                        onChange={setNovelContent}
                        onKeyDown={handleNovelTextareaKeyDown}
                        rows={16}
                        spellCheck
                        style={{
                          ...inputStyle,
                          resize: 'vertical' as const,
                          lineHeight: 1.7,
                          fontFamily: 'Georgia, "Noto Serif", serif',
                          fontSize: '14px',
                        }}
                      />
                    )}
                  </div>

                  {/* Focus mode — full-screen distraction-free overlay, same textarea state */}
                  {novelFocusMode && (
                    <div className="mangal-upload-focus" style={{ position: 'fixed' as const, inset: 0, background: 'var(--bg-primary)', zIndex: 1000, display: 'flex', flexDirection: 'column' as const, padding: '32px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, justifyContent: 'space-between', alignItems: 'center', gap: '8px', maxWidth: '760px', margin: '0 auto 16px', width: '100%' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{countWords(novelContent)} words · {estimateReadTime(countWords(novelContent))}</span>
                        <button type="button" onClick={() => setNovelFocusMode(false)} style={toolbarBtnStyle}><X size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Exit Focus Mode</button>
                      </div>
                      <textarea
                        autoFocus
                        value={novelContent}
                        onChange={(e) => setNovelContent(e.target.value)}
                        onKeyDown={handleNovelTextareaKeyDown}
                        spellCheck
                        style={{
                          flex: 1, width: '100%', maxWidth: '760px', margin: '0 auto',
                          background: 'transparent', border: 'none', outline: 'none', resize: 'none' as const,
                          color: 'var(--text-soft)', lineHeight: 1.9, fontFamily: 'Georgia, "Noto Serif", serif', fontSize: '17px',
                        }}
                      />
                    </div>
                  )}

                  {/* Live word count + estimated read time — feeds chapters.word_count on publish */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: '8px',
                    background: countWords(novelContent) >= MIN_WORDS_PER_CHAPTER ? 'rgba(16,185,129,0.1)' : 'rgba(217,119,6,0.1)',
                    border: `1px solid ${countWords(novelContent) >= MIN_WORDS_PER_CHAPTER ? 'rgba(16,185,129,0.3)' : 'rgba(217,119,6,0.3)'}`,
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: countWords(novelContent) >= MIN_WORDS_PER_CHAPTER ? '#10b981' : '#d97706' }}>
                      {countWords(novelContent)} / {MIN_WORDS_PER_CHAPTER} words minimum
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {estimateReadTime(countWords(novelContent))}
                    </span>
                  </div>

                  {!isEditMode && (
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>
                      <Save size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Draft auto-saves on this device as you type — safe even if the tab closes.
                    </p>
                  )}

                  {chapterDraftBadge}

                  {/* Author's Note — after chapter. Optional; needs chapters.author_note_after */}
                  {chapterAuthorNoteAfterField}

                  {chapterTagsAndScheduleFields}

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={handleSaveNovelDraft}
                      disabled={loading || savingDraft}
                      style={{
                        flex: 1, padding: '14px',
                        background: 'var(--bg-input)', border: '1px solid var(--border-light)', borderRadius: '12px',
                        color: (loading || savingDraft) ? 'var(--text-muted)' : 'var(--text-secondary)',
                        fontSize: '13px', fontWeight: 700,
                        cursor: (loading || savingDraft) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {savingDraft ? 'Saving Draft...' : <><FileText size={13} style={{ verticalAlign: 'middle' }} /> Save Draft</>}
                    </button>
                    <button
                      onClick={handlePublishNovelChapter}
                      disabled={loading || countWords(novelContent) < MIN_WORDS_PER_CHAPTER}
                      style={{
                        flex: 2, padding: '14px',
                        background: (loading || countWords(novelContent) < MIN_WORDS_PER_CHAPTER) ? 'var(--border-color)' : 'linear-gradient(135deg, #f97316 0%, #22c55e 100%)',
                        border: '1px solid #ea580c', borderRadius: '12px',
                        color: (loading || countWords(novelContent) < MIN_WORDS_PER_CHAPTER) ? 'var(--text-tertiary)' : '#fff',
                        fontSize: '13px', fontWeight: 700,
                        cursor: (loading || countWords(novelContent) < MIN_WORDS_PER_CHAPTER) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {loading
                        ? (isEditMode ? 'Saving...' : 'Publishing...')
                        : countWords(novelContent) < MIN_WORDS_PER_CHAPTER
                        ? <><Lock size={13} style={{ verticalAlign: 'middle' }} /> Need {MIN_WORDS_PER_CHAPTER - countWords(novelContent)} more word(s) to publish</>
                        // Comparing against Date.now() here only decides which button
                        // label to show (Schedule vs Publish Live) — it's cosmetic and
                        // re-evaluates on every render anyway, so a stale value from
                        // memoization isn't a real risk here.
                        // eslint-disable-next-line react-hooks/purity
                        : scheduledAt && new Date(scheduledAt).getTime() > Date.now()
                        ? <><CalendarClock size={13} style={{ verticalAlign: 'middle' }} /> Schedule Chapter ({countWords(novelContent)} words)</>
                        : isEditMode
                        ? <><Save size={13} style={{ verticalAlign: 'middle' }} /> Save Changes ({countWords(novelContent)} words)</>
                        : <><Rocket size={13} style={{ verticalAlign: 'middle' }} /> Publish Live ({countWords(novelContent)} words)</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </main>
    </>
  );
}
