'use client';

// Books module — reader route. Thin wrapper: resolves the session, the book
// row, purchase status, and any saved reading progress, then hands off to
// <BookReader>. The actual file access is enforced server-side by
// /api/books/file/[bookId] regardless of what this page decides — this page
// only shapes the reader's UX (preview vs full).

import { useState, useEffect, use as usePromise } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../../../lib/supabase';
import { type ReaderBookInfo } from '../../../../components/books/BookReader';
import { BookOpen, Loader2 } from 'lucide-react';

// BUG FIX: this page, the dynamic-import fallback below, and BookReader's
// own internal loading screen used to each render a differently-colored
// full-screen placeholder (var(--bg-primary), then '#0c0a09', then
// THEME_DESK['light'] = '#e8e4da'), one after another as each stage
// resolved. Visually that reads as the reader "loading twice" / flashing —
// it's really three separate loading screens stacked in sequence. They
// now all share the exact same background + spinner + copy so the
// hand-off between stages (auth/access check → chunk load → file fetch)
// is a single continuous spinner instead of a reload-looking flash.
const READER_LOADING_BG = '#e8e4da';

function ReaderLoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', background: READER_LOADING_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
      <Loader2 size={30} style={{ animation: 'book-read-page-spin 0.9s linear infinite', color: '#57534e' }} />
      <p style={{ fontSize: '13px', color: '#57534e' }}>Opening book…</p>
      <style>{`@keyframes book-read-page-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Loaded client-side only, on demand — see next.config.ts's
// serverExternalPackages note for why (pdfjs-dist/epubjs are heavy,
// browser-only libraries that were bloating the server bundle past
// Cloudflare Workers' size limit). ssr:false also means this page's
// initial server render never has to deal with pdf.js/epub.js touching
// `window`/`document`/canvas, which they assume are always present.
const BookReader = dynamic(() => import('../../../../components/books/BookReader'), {
  ssr: false,
  loading: () => <ReaderLoadingScreen />,
});

interface BookRow extends ReaderBookInfo {
  status: 'draft' | 'published';
  author_id: string;
}

export default function BookReadPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = usePromise(params);

  const [user, setUser] = useState<User | null>(null);
  const [book, setBook] = useState<BookRow | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [initialProgress, setInitialProgress] = useState<{ lastPage: number; lastLocation: string | null } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setUser(u.user ?? null);

      const { data: b } = await supabase.from('books').select('*').eq('id', bookId).maybeSingle();
      if (!b) { setNotFound(true); setLoading(false); return; }
      const bookRow = b as BookRow;
      setBook(bookRow);

      // Access decision — mirrors the gated file route.
      let access = false;
      if (bookRow.pricing_type === 'FREE') {
        access = true;
      } else if (u.user) {
        if (u.user.id === bookRow.author_id) {
          access = true;
        } else {
          const { data: purchase } = await supabase
            .from('book_purchases').select('id').eq('book_id', bookId).eq('user_id', u.user.id).maybeSingle();
          access = !!purchase;
        }
      }
      setHasAccess(access);

      // Drafts are only readable by their author (RLS already hides the row
      // from everyone else — this is the same check from the other side).
      if (bookRow.status === 'draft' && u.user?.id !== bookRow.author_id) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      // Resume position.
      if (u.user) {
        const { data: progress } = await supabase
          .from('book_reading_progress')
          .select('last_page, last_location')
          .eq('book_id', bookId)
          .eq('user_id', u.user.id)
          .maybeSingle();
        if (progress) {
          setInitialProgress({ lastPage: progress.last_page ?? 1, lastLocation: progress.last_location ?? null });
        }
      }

      setLoading(false);
    })();
  }, [bookId]);

  if (loading) {
    return <ReaderLoadingScreen />;
  }

  if (notFound || !book) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '20px', textAlign: 'center' }}>
        <BookOpen size={38} style={{ color: 'var(--text-faint)' }} />
        <h1 style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Book not found</h1>
        <Link href="/WebMangal/books" style={{ color: 'var(--accent)', fontSize: '14px', fontWeight: 700 }}>← Back to Books</Link>
      </div>
    );
  }

  return (
    <BookReader
      book={book}
      hasAccess={hasAccess}
      userId={user?.id ?? null}
      initialProgress={initialProgress}
    />
  );
}