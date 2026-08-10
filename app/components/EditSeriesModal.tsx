'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import { checkImageBatchQuality } from '../lib/imageQuality';

// Step 23 — Genre Expansion (Desi Categories): added Folk Tale, Desi Horror,
// Street Life, School Life, Independence Era. Mythology already existed.
// Same list as app/upload/page.tsx — keep both in sync if genres change again.
const GENRES = [
  'Action', 'Romance', 'Fantasy', 'Comedy', 'Drama',
  'Horror', 'Slice of Life', 'Sci-Fi', 'Thriller', 'Mythology',
  'Folk Tale', 'Desi Horror', 'Street Life', 'School Life', 'Independence Era',
];

interface EditableSeries {
  id: string;
  title: string;
  synopsis: string;
  genre: string | null;
  cover_url: string | null;
  reading_mode: 'scroll' | 'page';
  reading_direction: 'ltr' | 'rtl' | null; // Step 24 — RTL support
  completion_status: 'ongoing' | 'completed' | 'hiatus';
  chapterCount?: number;
}

interface EditSeriesModalProps {
  story: EditableSeries;
  userId: string;
  onClose: () => void;
  onSaved: (updated: Partial<EditableSeries> & { id: string }) => void;
}

const STATUS_OPTIONS: { value: EditableSeries['completion_status']; label: string }[] = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'hiatus', label: 'Hiatus' },
];

export default function EditSeriesModal({ story, userId, onClose, onSaved }: EditSeriesModalProps) {
  const [title, setTitle] = useState(story.title);
  const [synopsis, setSynopsis] = useState(story.synopsis);
  const [genre, setGenre] = useState(story.genre || '');
  const [readingMode, setReadingMode] = useState(story.reading_mode);
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl'>(story.reading_direction ?? 'ltr'); // Step 24
  const [completionStatus, setCompletionStatus] = useState(story.completion_status);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(story.cover_url);

  const [checkingQuality, setCheckingQuality] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 25 — Tags: `allTags` is the master list to pick from, `selectedTagIds`
  // is this series' current selection, `newTagName` lets a creator type a tag
  // that doesn't exist yet (created on save).
  const [allTags, setAllTags] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [newTagName, setNewTagName] = useState('');
  const [tagsLoaded, setTagsLoaded] = useState(false);

  useEffect(() => {
    const loadTags = async () => {
      const { data: tagRows } = await supabase.from('tags').select('id, name, slug').order('name');
      if (tagRows) setAllTags(tagRows);

      const { data: seriesTagRows } = await supabase
        .from('series_tags')
        .select('tag_id')
        .eq('series_id', story.id);
      if (seriesTagRows) setSelectedTagIds(new Set(seriesTagRows.map((r: { tag_id: string }) => r.tag_id)));
      setTagsLoaded(true);
    };
    loadTags();
  }, [story.id]);

  const toggleTag = (id: string) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else if (next.size < 8) next.add(id);
      return next;
    });
  };

  // Step 15: reading mode can't change once the series has a published chapter —
  // switching scroll<->page mid-series would confuse anyone already reading it.
  const readingModeLocked = (story.chapterCount || 0) > 0;

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

  // Same pattern as upload/page.tsx's handleCoverSelect — same quality
  // thresholds, since this is the same cover-photo slot, just edited later.
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

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!genre) { setError('Please select a genre.'); return; }
    if (!synopsis.trim()) { setError('Please write a short description.'); return; }

    setSaving(true);
    setError('');

    let coverUrl = story.cover_url;

    // Only touches storage if a new file was actually picked — same path
    // convention as the original upload flow (covers/{userId}-{timestamp}.{ext}).
    if (coverFile) {
      const ext = coverFile.name.split('.').pop();
      const path = `covers/${userId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('manga-pages')
        .upload(path, coverFile, { upsert: true });

      if (uploadError) { setError(`Cover upload: ${uploadError.message}`); setSaving(false); return; }

      const { data: urlData } = supabase.storage.from('manga-pages').getPublicUrl(path);
      coverUrl = urlData.publicUrl;
    }

    const updates = {
      title: title.trim(),
      synopsis: synopsis.trim(),
      genre,
      cover_url: coverUrl,
      reading_mode: readingModeLocked ? story.reading_mode : readingMode,
      // Step 24 — only meaningful in page mode, but we persist whatever was chosen
      // so it's ready if the creator later switches to page mode.
      reading_direction: readingDirection,
      completion_status: completionStatus,
    };

    // .select() after the write — Supabase RLS-blocked updates don't throw,
    // they just silently return nothing. Same gotcha as everywhere else in this app.
    const { data, error: updateError } = await supabase
      .from('series')
      .update(updates)
      .eq('id', story.id)
      .select()
      .single();

    if (updateError) { setError(updateError.message); setSaving(false); return; }
    if (!data) { setError('Update was blocked — no row returned. Check permissions.'); setSaving(false); return; }

    // Step 25 — Tags: create a new tag if the creator typed one that doesn't
    // exist, then diff selected vs. currently-saved and insert/delete only
    // what changed. Non-fatal — a tag sync failure shouldn't block the save
    // the creator actually asked for.
    let finalSelectedIds = selectedTagIds;
    const trimmedNewTag = newTagName.trim();
    if (trimmedNewTag) {
      const slug = trimmedNewTag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data: createdTag } = await supabase
        .from('tags')
        .upsert({ name: trimmedNewTag, slug }, { onConflict: 'name' })
        .select('id')
        .single();
      if (createdTag) {
        finalSelectedIds = new Set(selectedTagIds);
        finalSelectedIds.add(createdTag.id);
      }
    }

    const { data: existingRows } = await supabase.from('series_tags').select('tag_id').eq('series_id', story.id);
    const existingIds = new Set((existingRows ?? []).map((r: { tag_id: string }) => r.tag_id));

    const toAdd = [...finalSelectedIds].filter(id => !existingIds.has(id));
    const toRemove = [...existingIds].filter(id => !finalSelectedIds.has(id));

    if (toAdd.length > 0) {
      await supabase.from('series_tags').insert(toAdd.map(tag_id => ({ series_id: story.id, tag_id })));
    }
    if (toRemove.length > 0) {
      await supabase.from('series_tags').delete().eq('series_id', story.id).in('tag_id', toRemove);
    }

    setSaving(false);
    onSaved({ id: story.id, ...updates });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '520px', maxHeight: '88vh', overflowY: 'auto' as const,
          background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '20px',
          padding: '28px', boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>✏️ Edit Series</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '12px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>

          {/* Cover Photo */}
          <div>
            <label style={labelStyle}>Cover Photo</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: checkingQuality ? 'wait' : 'pointer' }}>
              <div style={{
                width: '70px', height: '94px', borderRadius: '10px', overflow: 'hidden' as const,
                border: '2px dashed var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-input)', flexShrink: 0, position: 'relative',
              }}>
                {coverPreview ? (
                  <Image src={coverPreview} alt="Cover" fill sizes="70px" unoptimized style={{ objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '20px' }}>📷</span>
                )}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                {checkingQuality ? 'Checking image quality...' : 'Click to change cover photo'}
              </span>
              <input type="file" accept="image/*" onChange={handleCoverSelect} disabled={checkingQuality} style={{ display: 'none' }} />
            </label>
          </div>

          <div>
            <label style={labelStyle}>Series Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Genre</label>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Select genre</option>
              {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Step 25 — Tags: up to 8, pick from existing or type a new one */}
          <div>
            <label style={labelStyle}>Tags <span style={{ textTransform: 'none', fontWeight: 400 }}>(up to 8 — helps readers find your series)</span></label>
            {tagsLoaded && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                {allTags.map(tag => {
                  const selected = selectedTagIds.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      style={{
                        fontSize: '11px', fontWeight: 700, padding: '5px 12px', borderRadius: '20px',
                        cursor: 'pointer', transition: 'all 0.15s',
                        border: selected ? '1px solid #d97706' : '1px solid var(--border-light)',
                        background: selected ? 'rgba(217,119,6,0.15)' : 'var(--bg-input)',
                        color: selected ? '#d97706' : 'var(--text-tertiary)',
                      }}
                    >
                      #{tag.name}
                    </button>
                  );
                })}
              </div>
            )}
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Type a new tag not in the list above..."
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' as const }} />
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <select
              value={completionStatus}
              onChange={(e) => setCompletionStatus(e.target.value as EditableSeries['completion_status'])}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Reading Mode</label>
            {readingModeLocked ? (
              <div style={{
                padding: '11px 14px', borderRadius: '10px', background: 'var(--bg-input)',
                border: '1px solid var(--border-light)', color: 'var(--text-tertiary)', fontSize: '12px', lineHeight: 1.5,
              }}>
                🔒 {story.reading_mode === 'scroll' ? '📜 Vertical Scroll' : '📖 Page by Page'} — locked.
                Can&apos;t change after the first chapter is published, it&apos;d confuse readers mid-series.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setReadingMode('scroll')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: readingMode === 'scroll' ? '1px solid #dc2626' : '1px solid var(--border-light)', background: readingMode === 'scroll' ? 'rgba(127,29,29,0.2)' : 'var(--bg-input)', color: readingMode === 'scroll' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  📜 Vertical Scroll
                </button>
                <button onClick={() => setReadingMode('page')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: readingMode === 'page' ? '1px solid #dc2626' : '1px solid var(--border-light)', background: readingMode === 'page' ? 'rgba(127,29,29,0.2)' : 'var(--bg-input)', color: readingMode === 'page' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  📖 Page by Page
                </button>
              </div>
            )}
          </div>

          {/* Step 24 — Reading Direction: only relevant in page mode */}
          {readingMode === 'page' && !readingModeLocked && (
            <div>
              <label style={labelStyle}>Reading Direction</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setReadingDirection('ltr')}
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', border: readingDirection === 'ltr' ? '1px solid #dc2626' : '1px solid var(--border-light)', background: readingDirection === 'ltr' ? 'rgba(127,29,29,0.2)' : 'var(--bg-input)', color: readingDirection === 'ltr' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  ← LTR (Default)
                </button>
                <button
                  onClick={() => setReadingDirection('rtl')}
                  style={{ flex: 1, padding: '12px', borderRadius: '10px', border: readingDirection === 'rtl' ? '1px solid #dc2626' : '1px solid var(--border-light)', background: readingDirection === 'rtl' ? 'rgba(127,29,29,0.2)' : 'var(--bg-input)', color: readingDirection === 'rtl' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  RTL → (Manga)
                </button>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                RTL flips page navigation so readers tap left to go forward — standard for right-to-left manga.
              </div>
            </div>
          )}
          {readingModeLocked && readingMode === 'page' && (
            <div>
              <label style={labelStyle}>Reading Direction</label>
              <div style={{ padding: '11px 14px', borderRadius: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-tertiary)', fontSize: '12px', lineHeight: 1.5 }}>
                {story.reading_direction === 'rtl' ? '→ RTL (Manga)' : '← LTR (Default)'} — set at creation.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '13px', borderRadius: '10px', background: 'var(--bg-input)',
              border: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || checkingQuality}
              style={{
                flex: 2, padding: '13px', borderRadius: '10px',
                background: (saving || checkingQuality) ? 'var(--border-color)' : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                border: '1px solid #7f1d1d', color: (saving || checkingQuality) ? 'var(--text-tertiary)' : '#fff',
                fontSize: '13px', fontWeight: 700, cursor: (saving || checkingQuality) ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : '💾 Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}