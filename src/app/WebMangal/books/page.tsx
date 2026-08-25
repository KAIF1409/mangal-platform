'use client';

// Books module — public catalog. Published books only (RLS enforces it;
// this query just asks for what it wants). Author names resolve via a
// second batched creator_profiles query — no direct FK between books and
// creator_profiles (both point at auth.users), so PostgREST embedding
// isn't available here; same two-step pattern the rest of WebMangal uses.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import type { BookRow } from '../../lib/database.types';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import { BookOpen, FileText } from 'lucide-react';

// BookRow comes from lib/database.types.ts (shared books-module row shape).

const CATEGORY_FILTERS = ['All', 'Fiction', 'Non-Fiction', 'Mythology', 'Fantasy', 'Science Fiction', 'Horror', 'Romance', 'Thriller', 'Poetry', 'Other'];

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function BooksCatalogPage() {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [authorsById, setAuthorsById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('books')
        .select('id, title, description, cover_image_url, file_type, pricing_type, price_paise, category, author_id, created_at')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!error && data) {
        setBooks(data as BookRow[]);
        // Batch-resolve author display names.
        const authorIds = [...new Set(data.map((b) => b.author_id))];
        if (authorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('creator_profiles')
            .select('user_id, username')
            .in('user_id', authorIds);
          const map: Record<string, string> = {};
          for (const p of profiles || []) map[p.user_id] = p.username;
          setAuthorsById(map);
        }
      }
      setLoading(false);
    })();
  }, []);

  const visible = useMemo(
    () => (category === 'All' ? books : books.filter((b) => b.category === category)),
    [books, category]
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 20px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <BookOpen size={26} color="var(--accent)" />
          <h1 style={{ fontSize: '26px', fontWeight: 900, margin: 0, color: 'var(--text-primary)' }}>Books</h1>
        </div>
        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5 }}>
          Standalone reads from MANGAL creators — novels, novellas and collections you can read right here,
          with a real book-style reader.
        </p>

        {/* Category filter pills */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '22px' }}>
          {CATEGORY_FILTERS.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: '999px', cursor: 'pointer',
                fontSize: '12.5px', fontWeight: 700,
                border: category === c ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                background: category === c ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg-card)',
                color: category === c ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Loading…</p>
        ) : visible.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '56px 20px',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px',
          }}>
            <BookOpen size={40} style={{ color: 'var(--text-faint)', marginBottom: '12px' }} />
            <p style={{ fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              {category === 'All' ? 'No books yet' : `No ${category} books yet`}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Creators publish books from their dashboard — check back soon.
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '18px',
          }} className="books-catalog-grid">
            {visible.map((book) => (
              <Link
                key={book.id}
                href={`/WebMangal/books/${book.id}`}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '12px', overflow: 'hidden', height: '100%',
                  transition: 'transform 0.15s, border-color 0.15s',
                }}
                className="books-catalog-card"
                >
                  <div style={{
                    position: 'relative', width: '100%', aspectRatio: '2 / 3',
                    background: 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.15), var(--bg-input))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {book.cover_image_url ? (
                      <Image src={book.cover_image_url} alt={book.title} fill unoptimized style={{ objectFit: 'cover' }} />
                    ) : (
                      <BookOpen size={30} style={{ color: 'var(--text-faint)' }} />
                    )}
                    {/* Price badge */}
                    <span style={{
                      position: 'absolute', top: '8px', left: '8px',
                      padding: '3px 9px', borderRadius: '999px',
                      fontSize: '10.5px', fontWeight: 800,
                      background: book.pricing_type === 'PAID' ? 'rgba(var(--accent-rgb), 0.92)' : 'rgba(16,185,129,0.92)',
                      color: '#fff',
                    }}>
                      {book.pricing_type === 'PAID' && book.price_paise ? formatPaise(book.price_paise) : 'FREE'}
                    </span>
                  </div>
                  <div style={{ padding: '10px 12px 12px' }}>
                    <div style={{
                      fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)',
                      lineHeight: 1.35, marginBottom: '4px',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {book.title}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      @{authorsById[book.author_id] ?? 'unknown'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                      <FileText size={11} /> {book.file_type.toUpperCase()}
                      {book.category ? <span>· {book.category}</span> : null}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <style>{`
        .books-catalog-card:hover { transform: translateY(-3px); border-color: var(--accent) !important; }
        @media (max-width: 480px) {
          .books-catalog-grid { grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)) !important; gap: 12px !important; }
        }
      `}</style>
      <Footer />
    </div>
  );
}