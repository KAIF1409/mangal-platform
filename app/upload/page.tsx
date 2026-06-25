'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { checkImageBatchQuality } from '../lib/imageQuality';
import { countWords, estimateReadTime, saveDraft, loadDraft, clearDraft } from '../lib/novelEditor';

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
      <main style={{ minHeight: '100vh', backgroundColor: '#07070a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontFamily: 'Arial, Helvetica, sans-serif' }}>
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

  // Chapter fields
  const [chapterNumber, setChapterNumber] = useState(1);
  const [chapterTitle, setChapterTitle] = useState('');
  const [pages, setPages] = useState<PageItem[]>([]);
  const [novelContent, setNovelContent] = useState('');
  const [justPublishedChapterId, setJustPublishedChapterId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [checkingQuality, setCheckingQuality] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // If arriving with an existing seriesId (from "+ Chapter" on dashboard),
  // load the series title + content_type for display and figure out the next chapter number
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

    supabase.from('chapters').select('chapter_number').eq('series_id', existingSeriesId)
      .order('chapter_number', { ascending: false }).limit(1)
      .then(({ data }) => { if (data && data[0]) setChapterNumber(data[0].chapter_number + 1); });
  }, [existingSeriesId]);

  // Edit mode — load the existing chapter's own fields (these override the
  // "next chapter number" guess above, since we're editing a specific one,
  // not creating a new one). Runs once editChapterId is known.
  useEffect(() => {
    if (!editChapterId) return;
    let cancelled = false;

    const loadChapterForEdit = async () => {
      setEditLoading(true);
      setEditLoadError('');

      const { data: chapter, error: chapterErr } = await supabase
        .from('chapters')
        .select('id, chapter_number, title, content, word_count, series_id')
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
        }
      }

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
    background: '#08080c', border: '1px solid #1f1f2e',
    color: '#f9fafb', fontSize: '13px', outline: 'none',
    boxSizing: 'border-box' as const, fontFamily: 'inherit',
  };
  const labelStyle = {
    display: 'block', fontSize: '10px', fontWeight: 700 as const,
    color: '#6b7280', letterSpacing: '0.12em', textTransform: 'uppercase' as const,
    marginBottom: '6px',
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
      const ext = coverFile.name.split('.').pop();
      const path = `covers/${userId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('manga-pages')
        .upload(path, coverFile, { upsert: true });

      if (uploadError) { setError(`Cover upload: ${uploadError.message}`); setLoading(false); return; }

      const { data: urlData } = supabase.storage.from('manga-pages').getPublicUrl(path);
      coverUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from('series')
      .insert({
        creator_id: userId,
        title: title.trim(),
        synopsis: synopsis.trim(),
        genre,
        language,
        cover_url: coverUrl,
        reading_mode: readingMode,
        content_type: contentType,
        status: 'draft',
      })
      .select()
      .single();

    if (error) { setError(error.message); setLoading(false); return; }

    setSeriesId(data.id);
    setStep('chapter');
    setLoading(false);
  };

  // ---- File selection for comic pages ----
  // Every selected file is run through the quality gate (blur + min
  // resolution) before it's ever added to the page list. Files that
  // fail are NOT added — the creator sees exactly which file failed
  // and why, and can re-select a better version. New files are appended
  // to the end of the unified `pages` list by default — the creator can
  // then use the move buttons to slot them anywhere (start/middle/end).
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError('');
    setCheckingQuality(true);

    const { results, failedFiles } = await checkImageBatchQuality(files);

    const acceptedFiles = files.filter((_, i) => results[i].passed);
    const newItems: PageItem[] = acceptedFiles.map((file) => ({
      kind: 'new' as const,
      file,
      preview: URL.createObjectURL(file),
    }));
    setPages((prev) => [...prev, ...newItems]);

    if (failedFiles.length > 0) {
      const reasons = files
        .map((f, i) => (results[i].passed ? null : `"${f.name}" — ${results[i].reason}`))
        .filter(Boolean)
        .join('  •  ');
      setError(`${failedFiles.length} image(s) rejected for low quality: ${reasons}`);
    }

    setCheckingQuality(false);
    // Allow re-selecting the same file again later if needed
    e.target.value = '';
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
  const handlePublishChapter = async () => {
    if (!seriesId) { setError('Create the series first!'); return; }
    if (totalMangaPageCount === 0) { setError('Upload at least one page!'); return; }
    if (totalMangaPageCount < MIN_PAGES_PER_CHAPTER) {
      setError(`A chapter needs at least ${MIN_PAGES_PER_CHAPTER} pages to publish — you have ${totalMangaPageCount}.`);
      return;
    }
    setLoading(true); setError(''); setMessage('');

    // ---- EDIT MODE: update the existing chapter row instead of inserting a new one ----
    if (isEditMode && editChapterId) {
      const { error: updateError } = await supabase
        .from('chapters')
        .update({
          chapter_number: chapterNumber,
          title: chapterTitle.trim() || `Chapter ${chapterNumber}`,
        })
        .eq('id', editChapterId);

      if (updateError) { setError(updateError.message); setLoading(false); return; }

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
        const ext = item.file.name.split('.').pop();
        const path = `${seriesId}/${editChapterId}/page-${newPageNumber}-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('manga-pages')
          .upload(path, item.file, { upsert: true });
        if (uploadError) { setError(`Page ${newPageNumber}: ${uploadError.message}`); setLoading(false); return; }

        const { data: urlData } = supabase.storage.from('manga-pages').getPublicUrl(path);

        const { error: pageError } = await supabase.from('pages').insert({
          chapter_id: editChapterId,
          page_number: newPageNumber,
          image_url: urlData.publicUrl,
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
        setPages(refreshedPages.map(p => ({ kind: 'existing' as const, id: p.id, image_url: p.image_url })));
      }

      setMessage(`Chapter ${chapterNumber} updated! 🎉 Taking you back...`);
      setLoading(false);
      // Hard navigation (not Next.js client-side routing) so the series page
      // re-fetches fresh data on load instead of potentially serving a
      // cached RSC/client snapshot from before this edit.
      setTimeout(() => { window.location.href = `/series/${seriesId}`; }, 1200);
      return;
    }

    // ---- CREATE MODE (original behavior, unchanged — every item here is
    // always kind:'new' since create mode never loads existing pages) ----
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({
        series_id: seriesId,
        chapter_number: chapterNumber,
        title: chapterTitle.trim() || `Chapter ${chapterNumber}`,
      })
      .select()
      .single();

    if (chapterError) { setError(chapterError.message); setLoading(false); return; }

    for (let i = 0; i < pages.length; i++) {
      const item = pages[i];
      if (item.kind !== 'new') continue; // defensive — never true in create mode
      const ext = item.file.name.split('.').pop();
      const path = `${seriesId}/${chapter.id}/page-${i + 1}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('manga-pages')
        .upload(path, item.file, { upsert: true });

      if (uploadError) { setError(`Page ${i + 1}: ${uploadError.message}`); setLoading(false); return; }

      const { data: urlData } = supabase.storage.from('manga-pages').getPublicUrl(path);

      const { error: pageError } = await supabase.from('pages').insert({
        chapter_id: chapter.id,
        page_number: i + 1,
        image_url: urlData.publicUrl,
      });

      if (pageError) { setError(`Page ${i + 1} save: ${pageError.message}`); setLoading(false); return; }
    }

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

    setMessage(`Chapter ${chapterNumber} is live! 🎉 ${pages.length} pages published.`);
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
  const handlePublishNovelChapter = async () => {
    if (!seriesId) { setError('Create the series first!'); return; }

    const wordCount = countWords(novelContent);
    if (wordCount < MIN_WORDS_PER_CHAPTER) {
      setError(`A chapter needs at least ${MIN_WORDS_PER_CHAPTER} words to publish — you have ${wordCount}.`);
      return;
    }

    setLoading(true); setError(''); setMessage('');

    // ---- EDIT MODE: update the existing chapter row instead of inserting a new one ----
    if (isEditMode && editChapterId) {
      const { error: updateError } = await supabase
        .from('chapters')
        .update({
          chapter_number: chapterNumber,
          title: chapterTitle.trim() || `Chapter ${chapterNumber}`,
          content: novelContent,
          word_count: wordCount,
        })
        .eq('id', editChapterId);

      if (updateError) { setError(updateError.message); setLoading(false); return; }

      clearDraft(seriesId, chapterNumber);
      setMessage(`Chapter ${chapterNumber} updated! 🎉 ${wordCount} words. Taking you back...`);
      setLoading(false);
      setTimeout(() => { window.location.href = `/series/${seriesId}`; }, 1200);
      return;
    }

    // ---- CREATE MODE (original behavior, unchanged) ----
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({
        series_id: seriesId,
        chapter_number: chapterNumber,
        title: chapterTitle.trim() || `Chapter ${chapterNumber}`,
        content: novelContent,
        word_count: wordCount,
      })
      .select()
      .single();

    if (chapterError) { setError(chapterError.message); setLoading(false); return; }

    await supabase.from('series').update({ status: 'published' }).eq('id', seriesId);

    clearDraft(seriesId, chapterNumber);

    // Step 25 — Notify followers (same fire-and-forget pattern as manga path above)
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

    setMessage(`Chapter ${chapterNumber} is live! 🎉 ${wordCount} words published.`);
    setJustPublishedChapterId(chapter.id);
    setNovelContent('');
    setLoading(false);
  };

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#07070a', padding: '40px 24px', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <a href={seriesId ? `/series/${seriesId}` : '/dashboard'} style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'none' }}>← Back to {seriesId ? 'Series' : 'Dashboard'}</a>
        <div style={{ marginTop: '16px' }} />
        <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.18em', color: '#d97706', background: 'rgba(120,53,15,0.25)', border: '1px solid rgba(180,83,9,0.3)', padding: '4px 10px', borderRadius: '6px', textTransform: 'uppercase' as const }}>
          Mangal Engine V1.0
        </span>
        <h1 style={{ fontSize: '36px', fontWeight: 900, color: '#fff', margin: '16px 0 4px' }}>
          {step === 'series' ? 'Start a New Story' : isEditMode ? 'Edit Chapter' : justPublishedChapterId ? 'Chapter Published' : 'Upload Pages'}
        </h1>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '32px' }}>
          {step === 'series'
            ? 'Tell readers what your series is about'
            : justPublishedChapterId
            ? `"${title}"`
            : `"${title}" — Chapter ${chapterNumber}`}
        </p>

        {editLoading && (
          <div style={{ textAlign: 'center' as const, padding: '40px', color: '#6b7280', fontSize: '13px' }}>
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
        {message && !justPublishedChapterId && <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: '12px', marginBottom: '16px' }}>{message}</div>}

        <div style={{ background: '#0d0d14', border: '1px solid #1a1a26', borderRadius: '20px', padding: '32px', boxShadow: '0 32px 80px rgba(0,0,0,0.6)' }}>

          {/* STEP 1: SERIES INFO */}
          {step === 'series' && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '18px' }}>

              {/* Cover Photo */}
              <div>
                <label style={labelStyle}>Cover Photo</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }}>
                  <div style={{
                    width: '90px', height: '120px', borderRadius: '10px', overflow: 'hidden' as const,
                    border: '2px dashed #1f1f2e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#08080c', flexShrink: 0,
                  }}>
                    {coverPreview ? (
                      <img src={coverPreview} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' as const }} />
                    ) : (
                      <span style={{ fontSize: '22px' }}>📷</span>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    {coverPreview ? 'Change cover photo' : 'Click to upload a cover photo'}
                  </span>
                  <input type="file" accept="image/*" onChange={handleCoverSelect} style={{ display: 'none' }} />
                </label>
              </div>

              {/* Step 21 — Content Type selector (Comic vs Novel) */}
              <div>
                <label style={labelStyle}>Content Type</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setContentType('mangal')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: contentType === 'mangal' ? '1px solid #dc2626' : '1px solid #1f1f2e', background: contentType === 'mangal' ? 'rgba(127,29,29,0.2)' : '#08080c', color: contentType === 'mangal' ? '#fff' : '#9ca3af', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                    📖 Comic<br /><span style={{ fontWeight: 400, fontSize: '10px' }}>Pages with images</span>
                  </button>
                  <button onClick={() => setContentType('novel')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: contentType === 'novel' ? '1px solid #dc2626' : '1px solid #1f1f2e', background: contentType === 'novel' ? 'rgba(127,29,29,0.2)' : '#08080c', color: contentType === 'novel' ? '#fff' : '#9ca3af', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                    📕 Novel<br /><span style={{ fontWeight: 400, fontSize: '10px' }}>Text chapters</span>
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
                <textarea placeholder="Write the cosmic arc..." value={synopsis} onChange={(e) => setSynopsis(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' as const }} />
              </div>

              {contentType === 'mangal' && (
                <div>
                  <label style={labelStyle}>Reading Mode</label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => setReadingMode('scroll')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: readingMode === 'scroll' ? '1px solid #dc2626' : '1px solid #1f1f2e', background: readingMode === 'scroll' ? 'rgba(127,29,29,0.2)' : '#08080c', color: readingMode === 'scroll' ? '#fff' : '#9ca3af', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                      📜 Vertical Scroll<br /><span style={{ fontWeight: 400, fontSize: '10px' }}>Webtoon style</span>
                    </button>
                    <button onClick={() => setReadingMode('page')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: readingMode === 'page' ? '1px solid #dc2626' : '1px solid #1f1f2e', background: readingMode === 'page' ? 'rgba(127,29,29,0.2)' : '#08080c', color: readingMode === 'page' ? '#fff' : '#9ca3af', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                      📖 Page by Page<br /><span style={{ fontWeight: 400, fontSize: '10px' }}>Traditional manga</span>
                    </button>
                  </div>
                </div>
              )}

              <button onClick={handleCreateSeries} disabled={loading} style={{ width: '100%', padding: '14px', background: loading ? '#1a1a26' : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)', border: '1px solid #7f1d1d', borderRadius: '12px', color: loading ? '#6b7280' : '#fff', fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginTop: '8px' }}>
                {loading ? 'Creating...' : '➡️ Continue — Upload Pages'}
              </button>
            </div>
          )}

          {/* STEP 2: CHAPTER + PAGES (or post-publish choice screen) */}
          {step === 'chapter' && justPublishedChapterId && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '14px', textAlign: 'center' as const, padding: '12px 0' }}>
              <div style={{ fontSize: '40px' }}>🎉</div>
              <p style={{ fontSize: '14px', color: '#d1d5db', margin: 0 }}>
                Chapter {chapterNumber} is published! What would you like to do next?
              </p>

              <a href={`/read/${justPublishedChapterId}`} target="_blank" rel="noopener noreferrer" style={{
                fontSize: '12px', color: '#d97706', textDecoration: 'none', fontWeight: 600,
              }}>
                👀 Preview this chapter as a reader
              </a>

              <button onClick={handleAddAnotherChapter} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)', border: '1px solid #7f1d1d', borderRadius: '12px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', marginTop: '8px' }}>
                ➕ Add Another Chapter
              </button>

              {seriesId && (
                <a href={`/series/${seriesId}`} style={{
                  display: 'block', width: '100%', padding: '14px', background: 'transparent',
                  border: '1px solid #1f1f2e', borderRadius: '12px', color: '#9ca3af',
                  fontSize: '13px', fontWeight: 600, textDecoration: 'none', boxSizing: 'border-box' as const,
                }}>
                  ✅ I'm Done — Go to Series Page
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
                  <div>
                    <label style={labelStyle}>Comic Pages (order will be kept as shown)</label>
                    <label style={{ display: 'block', padding: '24px', textAlign: 'center' as const, border: '2px dashed #1f1f2e', borderRadius: '12px', cursor: checkingQuality ? 'wait' : 'pointer', color: '#6b7280', fontSize: '12px' }}>
                      {checkingQuality ? '🔍 Checking image quality...' : '📤 Click to select pages (multiple images, in order)'}
                      <input type="file" accept="image/*" multiple onChange={handleFileSelect} disabled={checkingQuality} style={{ display: 'none' }} />
                    </label>
                  </div>

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
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {MIN_PAGES_PER_CHAPTER - totalMangaPageCount} more needed to publish
                      </span>
                    )}
                    {totalMangaPageCount >= MIN_PAGES_PER_CHAPTER && (
                      <span style={{ fontSize: '11px', color: '#10b981' }}>✓ Ready to publish</span>
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
                        <div key={item.kind === 'existing' ? item.id : `new-${i}`} style={{ position: 'relative' as const, border: `1px solid ${item.kind === 'new' ? 'rgba(217,119,6,0.4)' : '#1f1f2e'}`, borderRadius: '8px', overflow: 'hidden' }}>
                          <img
                            src={item.kind === 'existing' ? item.image_url : item.preview}
                            alt={`Page ${i + 1}`}
                            style={{ width: '100%', height: '120px', objectFit: 'cover' as const, display: 'block' }}
                          />
                          <div style={{ position: 'absolute' as const, top: 4, left: 4, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>#{i + 1}</div>
                          {item.kind === 'new' && (
                            <div style={{ position: 'absolute' as const, top: 4, right: 4, background: 'rgba(217,119,6,0.85)', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px' }}>NEW</div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between' as const, background: '#08080c', padding: '4px' }}>
                            <button onClick={() => movePage(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', color: i === 0 ? '#374151' : '#9ca3af', cursor: i === 0 ? 'not-allowed' : 'pointer', fontSize: '11px' }}>⬅️</button>
                            <button onClick={() => removePage(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}>🗑️</button>
                            <button onClick={() => movePage(i, 1)} disabled={i === pages.length - 1} style={{ background: 'none', border: 'none', color: i === pages.length - 1 ? '#374151' : '#9ca3af', cursor: i === pages.length - 1 ? 'not-allowed' : 'pointer', fontSize: '11px' }}>➡️</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={handlePublishChapter}
                    disabled={loading || totalMangaPageCount < MIN_PAGES_PER_CHAPTER}
                    style={{
                      width: '100%', padding: '14px',
                      background: (loading || totalMangaPageCount < MIN_PAGES_PER_CHAPTER) ? '#1a1a26' : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                      border: '1px solid #7f1d1d', borderRadius: '12px',
                      color: (loading || totalMangaPageCount < MIN_PAGES_PER_CHAPTER) ? '#6b7280' : '#fff',
                      fontSize: '13px', fontWeight: 700,
                      cursor: (loading || totalMangaPageCount < MIN_PAGES_PER_CHAPTER) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loading
                      ? (isEditMode ? 'Saving...' : 'Uploading...')
                      : totalMangaPageCount < MIN_PAGES_PER_CHAPTER
                      ? `🔒 Need ${MIN_PAGES_PER_CHAPTER - totalMangaPageCount} more page(s) to publish`
                      : isEditMode
                      ? `💾 Save Changes (${totalMangaPageCount} pages)`
                      : `🚀 Publish Live (${totalMangaPageCount} pages)`}
                  </button>
                </>
              )}

              {/* Step 21 — MANGAL Novel Writer (replaces image uploader for novel chapters) */}
              {contentType === 'novel' && (
                <>
                  <div>
                    <label style={labelStyle}>Chapter Text</label>
                    <textarea
                      placeholder={'Likho yahan... # for a heading, **bold**, *italic*'}
                      value={novelContent}
                      onChange={(e) => setNovelContent(e.target.value)}
                      rows={16}
                      style={{
                        ...inputStyle,
                        resize: 'vertical' as const,
                        lineHeight: 1.7,
                        fontFamily: 'Georgia, "Noto Serif", serif',
                        fontSize: '14px',
                      }}
                    />
                  </div>

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
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                      {estimateReadTime(countWords(novelContent))}
                    </span>
                  </div>

                  {!isEditMode && (
                    <p style={{ fontSize: '10px', color: '#4b5563', margin: 0 }}>
                      💾 Draft auto-saves on this device as you type — safe even if the tab closes.
                    </p>
                  )}

                  <button
                    onClick={handlePublishNovelChapter}
                    disabled={loading || countWords(novelContent) < MIN_WORDS_PER_CHAPTER}
                    style={{
                      width: '100%', padding: '14px',
                      background: (loading || countWords(novelContent) < MIN_WORDS_PER_CHAPTER) ? '#1a1a26' : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                      border: '1px solid #7f1d1d', borderRadius: '12px',
                      color: (loading || countWords(novelContent) < MIN_WORDS_PER_CHAPTER) ? '#6b7280' : '#fff',
                      fontSize: '13px', fontWeight: 700,
                      cursor: (loading || countWords(novelContent) < MIN_WORDS_PER_CHAPTER) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loading
                      ? (isEditMode ? 'Saving...' : 'Publishing...')
                      : countWords(novelContent) < MIN_WORDS_PER_CHAPTER
                      ? `🔒 Need ${MIN_WORDS_PER_CHAPTER - countWords(novelContent)} more word(s) to publish`
                      : isEditMode
                      ? `💾 Save Changes (${countWords(novelContent)} words)`
                      : `🚀 Publish Live (${countWords(novelContent)} words)`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </main>
  );
}