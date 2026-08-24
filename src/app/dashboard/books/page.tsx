'use client';

import WebMangalAiEditor from '../../components/editor/WebMangalAiEditor';

// Books module — creator-side management under the Studio sidebar.
// Create (draft or publish), publish/unpublish, and delete books. The book
// FILE goes through /api/upload-book-file (PDF/EPUB magic-byte validated,
// lands in R2 under books/files/); covers reuse the standard image pipeline.
// The row itself is inserted client-side straight into `books` — RLS scopes
// it to its author, and the DB's CHECK constraint is what enforces
// "PAID requires price > 0" no matter what this UI does.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import { setPostLoginRedirect } from '../../lib/auth/authRedirect';
import { uploadMediaFile, MEDIA_FOLDERS } from '../../lib/media/uploadClient';
import {
  BookOpen, Plus, Trash2, Eye, EyeOff, Loader2, FileText,
  IndianRupee, CheckCircle2, X,
} from 'lucide-react';

interface BookRow {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  file_url: string;
  file_type: 'pdf' | 'epub';
  file_size_bytes: number | null;
  pricing_type: 'FREE' | 'PAID';
  price_paise: number | null;
  category: string | null;
  status: 'draft' | 'published';
  views: number;
  created_at: string;
}

const CATEGORY_OPTIONS = [
  'Fiction', 'Non-Fiction', 'Mythology', 'Fantasy', 'Science Fiction',
  'Horror', 'Romance', 'Thriller', 'Mystery', 'Poetry', 'Philosophy',
  'Self-Help', 'Biography', 'History', 'Comics & Graphic Novels', 'Other',
];

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  marginBottom: '6px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
};

export default function DashboardBooksPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [pricingType, setPricingType] = useState<'FREE' | 'PAID'>('FREE');
  const [priceRupees, setPriceRupees] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Two-click confirm delete — same pattern as chapter deletes on /dashboard.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyBookId, setBusyBookId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setPostLoginRedirect(window.location.pathname);
        window.location.href = '/login';
        return;
      }
      setUser(data.user);
      await loadBooks(data.user.id);
      setLoading(false);
    })();
  }, []);

  async function loadBooks(userId: string) {
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .eq('author_id', userId)
      .order('created_at', { ascending: false });
    if (error) setListError(error.message);
    else setBooks((data || []) as BookRow[]);
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setCategory(CATEGORY_OPTIONS[0]);
    setCoverFile(null);
    setCoverPreview(null);
    setBookFile(null);
    setPricingType('FREE');
    setPriceRupees('');
    setFormError(null);
  }

  function handleCoverPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setCoverFile(f);
    setCoverPreview(f ? URL.createObjectURL(f) : null);
  }

  async function handleSubmit(status: 'draft' | 'published') {
    setFormError(null);

    // Client-side mirror of the DB CHECK constraint — fail fast with a
    // readable message instead of a raw Postgres error.
    let pricePaise: number | null = null;
    if (pricingType === 'PAID') {
      const rupees = parseFloat(priceRupees);
      if (!Number.isFinite(rupees) || rupees <= 0) {
        setFormError('Enter a price greater than ₹0 for a paid book.');
        return;
      }
      pricePaise = Math.round(rupees * 100);
      if (pricePaise <= 0) {
        setFormError('Price must be greater than ₹0.');
        return;
      }
    }
    if (!title.trim()) {
      setFormError('Book title is required.');
      return;
    }
    if (!bookFile) {
      setFormError('Attach the book file (PDF or EPUB).');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Book file → gated storage prefix.
      const fd = new FormData();
      fd.append('file', bookFile);
      fd.append('folder', MEDIA_FOLDERS.booksFiles);
      const { data: sessionData } = await supabase.auth.getSession();
      const fileRes = await fetch('/api/upload-book-file', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionData.session?.access_token || ''}` },
        body: fd,
      });
      const fileData = await fileRes.json();
      if (!fileRes.ok) throw new Error(fileData.error || 'Book file upload failed.');

      // 2. Cover (optional) → standard image pipeline.
      let coverUrl: string | null = null;
      if (coverFile) {
        try {
          const uploaded = await uploadMediaFile(coverFile, MEDIA_FOLDERS.booksCovers);
          coverUrl = uploaded.url;
        } catch {
          // A failed cover shouldn't lose the whole upload — proceed without.
          coverUrl = null;
        }
      }

      // 3. Row insert. file_type comes back sniffed server-side — never
      // trusted from the client's filename.
      const { error: insertError } = await supabase.from('books').insert({
        author_id: user!.id,
        title: title.trim(),
        description: description.trim() || null,
        category,
        cover_image_url: coverUrl,
        file_url: fileData.path as string,
        file_type: fileData.fileType as 'pdf' | 'epub',
        file_size_bytes: fileData.fileSizeBytes as number,
        pricing_type: pricingType,
        price_paise: pricePaise,
        status,
      });
      if (insertError) throw new Error(insertError.message);

      resetForm();
      setShowForm(false);
      await loadBooks(user!.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePublish(book: BookRow) {
    setBusyBookId(book.id);
    const next = book.status === 'published' ? 'draft' : 'published';
    const { error } = await supabase.from('books').update({ status: next }).eq('id', book.id);
    if (!error) {
      setBooks((rows) => rows.map((b) => (b.id === book.id ? { ...b, status: next } : b)));
    }
    setBusyBookId(null);
  }

  async function handleDelete(book: BookRow) {
    if (confirmDeleteId !== book.id) {
      setConfirmDeleteId(book.id);
      return;
    }
    setBusyBookId(book.id);
    // Best-effort R2 cleanup — the row delete is the source of truth; orphaned
    // objects are harmless (immutable keys, never re-served once the row's gone).
    const pathsToDelete = [book.file_url];
    if (book.cover_image_url) {
      try {
        const u = new URL(book.cover_image_url);
        pathsToDelete.push(u.pathname.replace(/^\/api\/media\//, ''));
      } catch { /* non-URL cover — skip cleanup */ }
    }
    await fetch('/api/delete-media', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
      },
      body: JSON.stringify({ paths: pathsToDelete }),
    }).catch(() => {});

    const { error } = await supabase.from('books').delete().eq('id', book.id);
    if (!error) setBooks((rows) => rows.filter((b) => b.id !== book.id));
    setConfirmDeleteId(null);
    setBusyBookId(null);
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '16px',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar />
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '28px 20px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BookOpen size={26} color="var(--accent)" />
            <h1 style={{ fontSize: '26px', fontWeight: 900, margin: 0, color: 'var(--text-primary)' }}>Books</h1>
          </div>
          <button
            onClick={() => { setShowForm((v) => !v); setFormError(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '10px', border: 'none',
              background: 'var(--accent)', color: '#fff',
              fontWeight: 800, fontSize: '14px', cursor: 'pointer',
            }}
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Close' : 'Add Book'}
          </button>
        </div>
        <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.5 }}>
          Publish standalone books — novels, novellas, poetry collections — as PDF or EPUB files.
          Free books are readable by everyone; paid books unlock after purchase.
        </p>

        {/* ── Add / create form ─────────────────────────────────────── */}
        {showForm && (
          <div style={{ ...cardStyle, marginBottom: '28px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 18px', color: 'var(--text-primary)' }}>New book</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '24px' }} className="books-form-grid">
              {/* Cover upload panel */}
              <div>
                <label style={labelStyle}>Cover image</label>
                <label
                  htmlFor="book-cover-input"
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    width: '100%', aspectRatio: '2 / 3', borderRadius: '10px',
                    border: '2px dashed var(--border-color)', background: 'var(--bg-input)',
                    cursor: 'pointer', overflow: 'hidden', position: 'relative',
                  }}
                >
                  {coverPreview ? (
                    <Image src={coverPreview} alt="Cover preview" fill unoptimized style={{ objectFit: 'cover' }} />
                  ) : (
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-tertiary)', fontSize: '12px', padding: '12px', textAlign: 'center' }}>
                      <BookOpen size={28} />
                      Click to upload a cover
                      <span style={{ fontSize: '10.5px', color: 'var(--text-faint)' }}>JPG / PNG / WEBP · optional</span>
                    </span>
                  )}
                </label>
                <input id="book-cover-input" type="file" accept="image/*" onChange={handleCoverPick} style={{ display: 'none' }} />
              </div>

              {/* Fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Book title *</label>
                  <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chandra's Last Flight" maxLength={200} />
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <WebMangalAiEditor
                    feature="book-description"
                    ariaLabel="Book description"
                    style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }}
                    value={description}
                    onChange={setDescription}
                    placeholder="What is this book about?"
                    maxLength={4000}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Book file * (PDF or EPUB, max 50MB)</label>
                  <input
                    type="file"
                    accept=".pdf,.epub,application/pdf,application/epub+zip"
                    onChange={(e) => setBookFile(e.target.files?.[0] || null)}
                    style={{ ...inputStyle, padding: '8px' }}
                  />
                  {bookFile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <FileText size={13} /> {bookFile.name} · {formatBytes(bookFile.size)}
                    </div>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Pricing</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: pricingType === 'PAID' ? '12px' : 0 }}>
                    {(['FREE', 'PAID'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPricingType(t)}
                        style={{
                          flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer',
                          border: pricingType === t ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                          background: pricingType === t ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--bg-input)',
                          color: 'var(--text-primary)', fontWeight: 700, fontSize: '13px',
                        }}
                      >
                        {t === 'FREE' ? 'Free' : 'Paid'}
                      </button>
                    ))}
                  </div>
                  {/* Conditional price input — only rendered when Paid */}
                  {pricingType === 'PAID' && (
                    <div style={{ position: 'relative' }}>
                      <IndianRupee size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                      <input
                        style={{ ...inputStyle, paddingLeft: '34px' }}
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={priceRupees}
                        onChange={(e) => setPriceRupees(e.target.value)}
                        placeholder="299.00"
                      />
                    </div>
                  )}
                </div>

                {formError && (
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444', fontSize: '13px', fontWeight: 600 }}>
                    {formError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleSubmit('draft')}
                    disabled={submitting}
                    style={{
                      flex: 1, padding: '11px', borderRadius: '8px', cursor: submitting ? 'wait' : 'pointer',
                      border: '1px solid var(--border-color)', background: 'var(--bg-input)',
                      color: 'var(--text-primary)', fontWeight: 700, fontSize: '14px',
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    Save Draft
                  </button>
                  <button
                    onClick={() => handleSubmit('published')}
                    disabled={submitting}
                    style={{
                      flex: 1, padding: '11px', borderRadius: '8px', cursor: submitting ? 'wait' : 'pointer',
                      border: 'none', background: 'var(--accent)', color: '#fff',
                      fontWeight: 800, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting && <Loader2 size={15} className="spin" />}
                    Publish
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── My books list ──────────────────────────────────────────── */}
        {loading ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Loading…</p>
        ) : listError ? (
          <p style={{ color: '#ef4444', fontSize: '14px' }}>{listError}</p>
        ) : books.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 20px' }}>
            <BookOpen size={40} style={{ color: 'var(--text-faint)', marginBottom: '12px' }} />
            <p style={{ fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>No books yet</p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Click “Add Book” above to publish your first one.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {books.map((book) => (
              <div key={book.id} style={{ ...cardStyle, display: 'flex', gap: '14px', alignItems: 'stretch' }}>
                <Link href={`/WebMangal/books/${book.id}`} style={{ flexShrink: 0 }}>
                  <div style={{
                    width: '64px', height: '92px', borderRadius: '8px', overflow: 'hidden',
                    background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {book.cover_image_url ? (
                      <Image src={book.cover_image_url} alt="" width={64} height={92} unoptimized style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                    ) : (
                      <BookOpen size={22} style={{ color: 'var(--text-faint)' }} />
                    )}
                  </div>
                </Link>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Link href={`/WebMangal/books/${book.id}`} style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--text-primary)', textDecoration: 'none' }}>
                      {book.title}
                    </Link>
                    <span style={{
                      fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
                      padding: '3px 8px', borderRadius: '999px',
                      background: book.status === 'published' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                      color: book.status === 'published' ? '#10b981' : '#f59e0b',
                    }}>
                      {book.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px', fontSize: '12px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <FileText size={12} /> {book.file_type.toUpperCase()}
                      {book.file_size_bytes ? ` · ${formatBytes(book.file_size_bytes)}` : ''}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 700, color: book.pricing_type === 'PAID' ? 'var(--accent)' : '#10b981' }}>
                      {book.pricing_type === 'PAID' && book.price_paise ? formatPaise(book.price_paise) : 'Free'}
                    </span>
                    {book.category && <span>{book.category}</span>}
                    <span>{book.views.toLocaleString('en-IN')} views</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <button
                    onClick={() => togglePublish(book)}
                    disabled={busyBookId === book.id}
                    title={book.status === 'published' ? 'Unpublish' : 'Publish'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px',
                      borderRadius: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700,
                      border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)',
                    }}
                  >
                    {book.status === 'published' ? <><EyeOff size={13} /> Unpublish</> : <><Eye size={13} /> Publish</>}
                  </button>
                  <button
                    onClick={() => handleDelete(book)}
                    disabled={busyBookId === book.id}
                    title="Delete book"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px',
                      borderRadius: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700,
                      border: confirmDeleteId === book.id ? '1px solid #ef4444' : '1px solid var(--border-color)',
                      background: confirmDeleteId === book.id ? 'rgba(239,68,68,0.12)' : 'var(--bg-input)',
                      color: confirmDeleteId === book.id ? '#ef4444' : 'var(--text-secondary)',
                    }}
                  >
                    {confirmDeleteId === book.id ? <><CheckCircle2 size={13} /> Sure?</> : <><Trash2 size={13} /> Delete</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`
        @media (max-width: 720px) {
          .books-form-grid { grid-template-columns: 1fr !important; }
          .books-form-grid > div:first-child { max-width: 220px; }
        }
        .spin { animation: books-spin 0.9s linear infinite; }
        @keyframes books-spin { to { transform: rotate(360deg); } }
      `}</style>
      <Footer />
    </div>
  );
}