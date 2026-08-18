'use client';

// §85 — song detail/read page. Shows the full block-by-block lyric sheet,
// the linked series (if any) with a "based on" badge, and the songwriter's
// resolved K Circle profile so listeners/creators always have a real point
// of contact (reuses the existing broadcast/profile route, same pattern as
// the WebMangal creator page's K Circle link).

import { useState, useEffect, use as usePromise } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import Navbar from '../../../components/shared/Navbar';
import Footer from '../../../components/shared/Footer';
import ProfileMenu from '../../../components/shared/ProfileMenu';
import ReportButton from '../../../components/webmangal/ReportButton';
import { hasCreatorAccess, isDeveloperRole } from '../../../lib/auth/roles';
import { Music, ArrowLeft, BookOpen, MessageCircle } from 'lucide-react';

interface SongBlock { block_type: string; label: string; content: string; }
interface SongRow {
  id: string; title: string; cover_url: string | null; genre: string | null;
  language: string | null; blocks: SongBlock[]; status: string; views: number;
  created_at: string; creator_id: string;
  linked_series_id: string | null; linked_chapter_id: string | null;
}
interface SeriesInfo { id: string; title: string; cover_url: string | null; }
interface ChapterInfo { id: string; chapter_number: number; title: string | null; }

export default function SongDetailPage({ params }: { params: Promise<{ songId: string }> }) {
  const { songId } = usePromise(params);

  const [user, setUser] = useState<User | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);

  const [song, setSong] = useState<SongRow | null>(null);
  const [songwriterUsername, setSongwriterUsername] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesInfo | null>(null);
  const [chapter, setChapter] = useState<ChapterInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setUser(u.user ?? null);
      if (u.user) {
        const { data: profile } = await supabase
          .from('profiles').select('role').eq('id', u.user.id).maybeSingle();
        if (hasCreatorAccess(profile?.role)) setIsCreator(true);
        if (isDeveloperRole(profile?.role)) setIsDeveloper(true);
      }

      const { data: s } = await supabase.from('songs').select('*').eq('id', songId).maybeSingle();
      if (!s) { setNotFound(true); setLoading(false); return; }
      setSong(s);

      // views isn't tracked server-side elsewhere in this schema (RLS blocks
      // a raw increment from anon), so do a simple owner-excluded bump like
      // the rest of WebMangal's view counters.
      if (!u.user || u.user.id !== s.creator_id) {
        supabase.from('songs').update({ views: (s.views ?? 0) + 1 }).eq('id', songId).then(() => {});
      }

      const tasks: Promise<void>[] = [
        Promise.resolve(
          supabase.from('creator_profiles').select('username').eq('user_id', s.creator_id).maybeSingle()
        ).then(({ data }) => { setSongwriterUsername(data?.username ?? null); }),
      ];
      if (s.linked_series_id) {
        tasks.push(
          Promise.resolve(
            supabase.from('series').select('id, title, cover_url').eq('id', s.linked_series_id).maybeSingle()
          ).then(({ data }) => { setSeries(data ?? null); })
        );
      }
      if (s.linked_chapter_id) {
        tasks.push(
          Promise.resolve(
            supabase.from('chapters').select('id, chapter_number, title').eq('id', s.linked_chapter_id).maybeSingle()
          ).then(({ data }) => { setChapter(data ?? null); })
        );
      }
      await Promise.all(tasks);
      setLoading(false);
    })();
  }, [songId]);

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
        Loading...
      </main>
    );
  }

  if (notFound || !song) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--text-tertiary)' }}>
        <p>Song not found.</p>
        <Link href="/WebMangal" style={{ color: '#d97706', fontWeight: 700, textDecoration: 'none' }}>Back to WebMangal</Link>
      </main>
    );
  }

  const isOwner = user?.id === song.creator_id;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar
        variant="custom"
        platformName="WebMangal"
        logoSrc="/webmangal-logo.png"
        href="/WebMangal"
        centerSlot={
          <Link href="/WebMangal" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px', fontWeight: 600 }}>
            <ArrowLeft size={14} /> Back to WebMangal
          </Link>
        }
        rightSlot={user && <ProfileMenu user={user} isCreator={isCreator} isDeveloper={isDeveloper} />}
      />

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '40px 24px 100px' }}>
        {song.status === 'draft' && isOwner && (
          <div style={{ padding: '8px 14px', borderRadius: '8px', background: 'rgba(217,119,6,0.12)', color: '#d97706', fontSize: '12px', fontWeight: 700, marginBottom: '18px', display: 'inline-block' }}>
            Draft — only visible to you
          </div>
        )}

        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          {song.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={song.cover_url} alt={song.title} style={{ width: '96px', height: '96px', borderRadius: '12px', objectFit: 'cover', flexShrink: 0 }} />
          )}
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 900, margin: '0 0 6px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Music size={20} /> {song.title}
            </h1>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 8px' }}>
              {songwriterUsername && <>by <strong style={{ color: 'var(--text-secondary)' }}>@{songwriterUsername}</strong></>}
              {song.genre && <> · {song.genre}</>}
              {song.language && <> · {song.language}</>}
              {' · '}{song.views} views
            </p>
            {songwriterUsername && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <Link href={`/kalpana-circle/broadcast/${songwriterUsername}`} style={{ fontSize: '12px', fontWeight: 700, color: '#a78bfa', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <MessageCircle size={12} /> Message songwriter
                </Link>
                <ReportButton targetType="song" targetId={song.id} variant="text" />
              </div>
            )}
          </div>
        </div>

        {series && (
          <Link href={`/WebMangal/series/${series.id}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
            borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '12.5px', fontWeight: 600,
            marginBottom: '28px',
          }}>
            <BookOpen size={14} />
            Based on <strong style={{ color: 'var(--text-primary)' }}>{series.title}</strong>
            {chapter && <> — Chapter {chapter.chapter_number}{chapter.title ? `: ${chapter.title}` : ''}</>}
          </Link>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {song.blocks.map((block, i) => (
            <div key={i}>
              <p style={{ fontSize: '11px', fontWeight: 800, color: '#d97706', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 6px' }}>
                {block.label}
              </p>
              <p style={{ fontSize: '15px', lineHeight: 1.8, color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap' as const }}>
                {block.content}
              </p>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </main>
  );
}
