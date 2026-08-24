'use client';

import WebMangalAiEditor from '../../../components/editor/WebMangalAiEditor';

// §85 — WebMangal "Songs" category, phase 2 (upload flow).
// Lyrics/text only for now — no audio upload (see CONTEXT.md §85). Whole
// song uploads as one page: title + blocks + optional series/chapter link
// + resolved K Circle profile, one insert. Linking to a series triggers
// the `songs_bootstrap_kcircle_group_trg` DB trigger (see the
// 20260818120000_webmangal_songs migration) which auto-creates a K Circle
// group between the songwriter and the series' creator — nothing to do
// here on the client for that part, it's fire-and-forget on insert.

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import Navbar from '../../../components/shared/Navbar';
import Footer from '../../../components/shared/Footer';
import ProfileMenu from '../../../components/shared/ProfileMenu';
import { hasCreatorAccess, isDeveloperRole } from '../../../lib/auth/roles';
import { setPostLoginRedirect } from '../../../lib/auth/authRedirect';
import {
  Music, ArrowLeft, Plus, X, ChevronUp, ChevronDown, Search,
  CheckCircle2, Rocket, Save, AlertCircle,
} from 'lucide-react';

// Same list WebMangal upload/EditSeriesModal use — reused per §85's default
// ("lean toward reusing the existing list unless founder says otherwise").
const GENRES = [
  'Action', 'Romance', 'Fantasy', 'Comedy', 'Drama',
  'Horror', 'Slice of Life', 'Sci-Fi', 'Thriller', 'Mythology',
  'Folk Tale', 'Desi Horror', 'Street Life', 'School Life', 'Independence Era',
];

const BLOCK_TYPES = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Hook', 'Outro'] as const;
type BlockType = typeof BLOCK_TYPES[number];

interface SongBlock {
  id: string;
  block_type: BlockType;
  label: string; // auto-numbered per type, e.g. "Verse 1", "Verse 2"
  content: string;
}

interface SeriesOption { id: string; title: string; cover_url: string | null; }
interface ChapterOption { id: string; chapter_number: number; title: string | null; }

let blockIdCounter = 0;
const nextBlockId = () => `blk_${Date.now()}_${blockIdCounter++}`;

export default function SongUploadPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);

  // K Circle profile resolution — every song requires the songwriter's OWN
  // resolved profile (auto-filled, never free-typed, per §85).
  const [kcircleUsername, setKcircleUsername] = useState<string | null>(null);
  const [resolvingProfile, setResolvingProfile] = useState(true);

  // Core fields
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [language, setLanguage] = useState('');
  const [coverUrl, setCoverUrl] = useState('');

  // Link toggle
  const [isLinked, setIsLinked] = useState<boolean | null>(null);
  const [seriesQuery, setSeriesQuery] = useState('');
  const [seriesResults, setSeriesResults] = useState<SeriesOption[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<SeriesOption | null>(null);
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Blocks
  const [blocks, setBlocks] = useState<SongBlock[]>([]);
  const [showBlockPicker, setShowBlockPicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setPostLoginRedirect('/WebMangal/songs/upload');
        window.location.href = '/login';
        return;
      }
      setUser(u.user);

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', u.user.id).maybeSingle();
      if (hasCreatorAccess(profile?.role)) setIsCreator(true);
      if (isDeveloperRole(profile?.role)) setIsDeveloper(true);

      // Resolve the songwriter's own K Circle profile — auto-filled, not
      // free-typed, so it can never be faked (§85). If they don't have one
      // yet, the form stays blocked with a CTA to create one first.
      const { data: cp } = await supabase
        .from('creator_profiles').select('username').eq('user_id', u.user.id).maybeSingle();
      setKcircleUsername(cp?.username ?? null);
      setResolvingProfile(false);
      setCheckingAuth(false);
    })();
  }, []);

  // Debounced series search (any series, not just the songwriter's own —
  // anyone can link a song to anyone's series, no approval gate per §85).
  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      if (!seriesQuery.trim()) { setSeriesResults([]); return; }
      const { data } = await supabase
        .from('series')
        .select('id, title, cover_url')
        .ilike('title', `%${seriesQuery.trim()}%`)
        .limit(8);
      setSeriesResults(data ?? []);
    }, 300);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [seriesQuery]);

  const pickSeries = async (s: SeriesOption) => {
    setSelectedSeries(s);
    setSeriesQuery('');
    setSeriesResults([]);
    setSelectedChapterId(null);
    const { data } = await supabase
      .from('chapters').select('id, chapter_number, title')
      .eq('series_id', s.id).eq('is_draft', false)
      .order('chapter_number', { ascending: true });
    setChapters(data ?? []);
  };

  const addBlock = (type: BlockType) => {
    const countOfType = blocks.filter(b => b.block_type === type).length;
    // Intro/Outro read oddly numbered ("Intro 1") since a song usually has
    // just one — only number the repeatable types.
    const numbered = type !== 'Intro' && type !== 'Outro';
    const label = numbered ? `${type} ${countOfType + 1}` : type;
    setBlocks(prev => [...prev, { id: nextBlockId(), block_type: type, label, content: '' }]);
    setShowBlockPicker(false);
  };

  const removeBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id));

  const moveBlock = (index: number, dir: -1 | 1) => {
    setBlocks(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateBlockContent = (id: string, content: string) =>
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, content } : b)));

  const canSubmit = useMemo(() => {
    if (!title.trim() || !kcircleUsername || !user) return false;
    if (blocks.length === 0 || blocks.every(b => !b.content.trim())) return false;
    if (isLinked && !selectedSeries) return false;
    return true;
  }, [title, kcircleUsername, user, blocks, isLinked, selectedSeries]);

  const handleSubmit = async (status: 'draft' | 'published') => {
    if (!user || !kcircleUsername) return;
    if (status === 'published' && !canSubmit) {
      setError('Add a title and at least one block with lyrics before publishing.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const { data: inserted, error: insertError } = await supabase
      .from('songs')
      .insert({
        creator_id: user.id,
        title: title.trim(),
        cover_url: coverUrl.trim() || null,
        genre,
        language: language.trim() || null,
        linked_series_id: isLinked ? selectedSeries?.id ?? null : null,
        linked_chapter_id: isLinked ? selectedChapterId : null,
        kcircle_user_id: user.id,
        blocks: blocks.map(({ block_type, label, content }) => ({ block_type, label, content })),
        status,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      setError('Something went wrong saving your song. Please try again.');
      setSubmitting(false);
      return;
    }

    router.push(`/WebMangal/songs/${inserted.id}`);
  };

  if (checkingAuth) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
        Loading...
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar
        variant="custom"
        platformName="WebMangal"
        logoSrc="/webmangal-logo.png"
        href="/WebMangal"
        centerSlot={
          <a href="/WebMangal" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}>
            <ArrowLeft size={14} /> Back to WebMangal
          </a>
        }
        rightSlot={user && <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />}
      />

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 24px 100px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
          <Music size={24} /> Write a Song
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 28px' }}>
          Lyrics only for now — the actual track gets produced separately. Link this to a WebMangal
          series and we&#x2019;ll auto-open a K Circle group with the creator so you can coordinate.
        </p>

        {!resolvingProfile && !kcircleUsername && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '16px',
            borderRadius: '12px', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)',
            marginBottom: '24px',
          }}>
            <AlertCircle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>
              <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                You need a K Circle profile first
              </p>
              <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Every song needs a real point of contact so listeners and creators can reach you.
              </p>
              <a href="/become-creator" style={{
                display: 'inline-block', padding: '8px 16px', borderRadius: '8px', fontSize: '12.5px',
                fontWeight: 700, background: 'linear-gradient(135deg, #f97316, #22c55e)', color: '#fff', textDecoration: 'none',
              }}>Set up my profile</a>
            </div>
          </div>
        )}

        {kcircleUsername && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
            borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            marginBottom: '24px', fontSize: '12.5px', color: 'var(--text-secondary)',
          }}>
            <CheckCircle2 size={14} color="#22c55e" />
            Publishing as <strong style={{ color: 'var(--text-primary)' }}>@{kcircleUsername}</strong> — this is how people will reach you.
          </div>
        )}

        {/* Title / genre / language / cover */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '28px' }}>
          <input
            type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Song title" maxLength={120}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
            <select value={genre ?? ''} onChange={e => setGenre(e.target.value || null)} style={{ ...inputStyle, flex: '1 1 160px' }}>
              <option value="">Genre (optional)</option>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input
              type="text" value={language} onChange={e => setLanguage(e.target.value)}
              placeholder="Language (optional)" style={{ ...inputStyle, flex: '1 1 160px' }}
            />
          </div>
          <input
            type="text" value={coverUrl} onChange={e => setCoverUrl(e.target.value)}
            placeholder="Cover image URL (optional)" style={inputStyle}
          />
        </div>

        {/* Link toggle */}
        <div style={{ marginBottom: '28px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>
            Is this song based on a WebMangal chapter or series?
          </p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: isLinked ? '16px' : 0 }}>
            <button onClick={() => setIsLinked(true)} style={toggleBtnStyle(isLinked === true)}>Yes</button>
            <button onClick={() => { setIsLinked(false); setSelectedSeries(null); setSelectedChapterId(null); }} style={toggleBtnStyle(isLinked === false)}>No</button>
          </div>

          {isLinked && (
            <div>
              {selectedSeries ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)', marginBottom: '12px',
                }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedSeries.title}</span>
                  <button onClick={() => { setSelectedSeries(null); setChapters([]); setSelectedChapterId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
                </div>
              ) : (
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text" value={seriesQuery} onChange={e => setSeriesQuery(e.target.value)}
                    placeholder="Search for a series..." style={{ ...inputStyle, paddingLeft: '34px' }}
                  />
                  {seriesResults.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', zIndex: 10,
                      background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px',
                      overflow: 'hidden', maxHeight: '260px', overflowY: 'auto' as const,
                    }}>
                      {seriesResults.map(s => (
                        <button key={s.id} onClick={() => pickSeries(s)} style={{
                          display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                          background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px',
                          color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)',
                        }}>{s.title}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedSeries && chapters.length > 0 && (
                <select value={selectedChapterId ?? ''} onChange={e => setSelectedChapterId(e.target.value || null)} style={inputStyle}>
                  <option value="">Whole series (no specific chapter)</option>
                  {chapters.map(c => (
                    <option key={c.id} value={c.id}>Chapter {c.chapter_number}{c.title ? ` — ${c.title}` : ''}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Block composer */}
        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>Lyrics</p>

          {blocks.map((block, i) => (
            <div key={block.id} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px',
              padding: '14px', marginBottom: '10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#d97706', textTransform: 'uppercase' as const, letterSpacing: '0.03em' }}>{block.label}</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => moveBlock(i, -1)} disabled={i === 0} style={iconBtnStyle(i === 0)}><ChevronUp size={14} /></button>
                  <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} style={iconBtnStyle(i === blocks.length - 1)}><ChevronDown size={14} /></button>
                  <button onClick={() => removeBlock(block.id)} style={iconBtnStyle(false)}><X size={14} /></button>
                </div>
              </div>
              <WebMangalAiEditor
                feature="lyrics"
                ariaLabel={`${block.label} lyrics block`}
                value={block.content} onChange={e => updateBlockContent(block.id, e)}
                placeholder={`Write the ${block.label.toLowerCase()}...`} rows={4}
                style={{
                  width: '100%', resize: 'vertical' as const, boxSizing: 'border-box' as const,
                  padding: '10px 12px', borderRadius: '8px', fontSize: '13px', lineHeight: 1.6,
                  background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          ))}

          {showBlockPicker ? (
            <div style={{
              display: 'flex', flexWrap: 'wrap' as const, gap: '8px', padding: '14px',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px',
            }}>
              {BLOCK_TYPES.map(type => (
                <button key={type} onClick={() => addBlock(type)} style={{
                  padding: '8px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', cursor: 'pointer',
                }}>{type}</button>
              ))}
              <button onClick={() => setShowBlockPicker(false)} style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700,
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowBlockPicker(true)} style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 18px',
              borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              background: 'var(--bg-card)', border: '1px dashed var(--border-color)', color: '#d97706',
            }}><Plus size={14} /> Add a block</button>
          )}
        </div>

        {error && (
          <p style={{ fontSize: '12.5px', color: '#ef4444', marginBottom: '16px' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => handleSubmit('draft')}
            disabled={submitting || !title.trim() || !kcircleUsername}
            style={{
              flex: 1, padding: '13px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
              background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
              cursor: submitting ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          ><Save size={14} /> Save Draft</button>
          <button
            onClick={() => handleSubmit('published')}
            disabled={submitting || !canSubmit}
            style={{
              flex: 1, padding: '13px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
              background: canSubmit ? 'linear-gradient(135deg, #f97316, #22c55e)' : 'var(--border-color)',
              color: canSubmit ? '#fff' : 'var(--text-muted)',
              border: 'none', cursor: submitting || !canSubmit ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          ><Rocket size={14} /> {submitting ? 'Publishing...' : 'Publish'}</button>
        </div>
      </div>

      <Footer />
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: '10px', boxSizing: 'border-box',
  background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-primary)',
  fontSize: '13px', outline: 'none', fontFamily: 'inherit',
};

const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '9px 22px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
  border: active ? '1px solid #d97706' : '1px solid var(--border-color)',
  background: active ? 'rgba(217,119,6,0.12)' : 'var(--bg-card)',
  color: active ? '#d97706' : 'var(--text-secondary)',
});

const iconBtnStyle = (disabled: boolean): React.CSSProperties => ({
  background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
  color: disabled ? 'var(--border-color)' : 'var(--text-muted)', padding: '2px',
  display: 'inline-flex', alignItems: 'center',
});
