'use client';

// Books module — book detail page. Shows metadata + the single call-to-action:
//   FREE / purchased / own draft → "Read now" → /WebMangal/books/[id]/read
//   PAID, unpurchased            → "Buy ₹X" → Razorpay Checkout via the same
//                                  create-order/verify pair every other
//                                  payment feature uses (purpose='book_purchase',
//                                  purposeRefId=bookId). The purchase row that
//                                  actually unlocks reading is inserted
//                                  server-side by /api/payments/verify — this
//                                  page only re-checks it after verify returns.

import { useState, useEffect, use as usePromise } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import type { BookRow } from '../../../lib/database.types';
import Navbar from '../../../components/shared/Navbar';
import Footer from '../../../components/shared/Footer';
import { setPostLoginRedirect } from '../../../lib/auth/authRedirect';
import { openRazorpayCheckout } from '../../../lib/payments/razorpayClient';
import {
  BookOpen, FileText, ArrowLeft, Loader2, Lock, PlayCircle,
} from 'lucide-react';

// BookRow comes from lib/database.types.ts (shared books-module row shape).

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function BookDetailPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = usePromise(params);

  const [user, setUser] = useState<User | null>(null);
  const [book, setBook] = useState<BookRow | null>(null);
  const [authorUsername, setAuthorUsername] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setUser(u.user ?? null);

      const { data: b } = await supabase.from('books').select('*').eq('id', bookId).maybeSingle();
      if (!b) { setNotFound(true); setLoading(false); return; }
      setBook(b as BookRow);

      // Owner-excluded view bump — same pattern as songs.
      if (!u.user || u.user.id !== (b as BookRow).author_id) {
        supabase.from('books').update({ views: ((b as BookRow).views ?? 0) + 1 }).eq('id', bookId).then(() => {});
      }

      // Author display name.
      const { data: profile } = await supabase
        .from('creator_profiles').select('username').eq('user_id', (b as BookRow).author_id).maybeSingle();
      setAuthorUsername(profile?.username ?? null);

      // Access check mirrors the gated file route's decision.
      const bb = b as BookRow;
      let access = false;
      if (bb.pricing_type === 'FREE') {
        access = true;
      } else if (u.user) {
        if (u.user.id === bb.author_id) {
          access = true;
        } else {
          const { data: purchase } = await supabase
            .from('book_purchases').select('id').eq('book_id', bookId).eq('user_id', u.user.id).maybeSingle();
          access = !!purchase;
        }
      }
      setHasAccess(access);
      setLoading(false);
    })();
  }, [bookId]);

  async function handleBuy() {
    if (!user) {
      setPostLoginRedirect(window.location.pathname);
      window.location.href = '/login';
      return;
    }
    if (!book?.price_paise) return;

    setBuying(true);
    setBuyError(null);
    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountPaise: book.price_paise,
          purpose: 'book_purchase',
          purposeRefId: book.id,
        }),
      });
      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.error || 'Could not start payment.');

      const opened = await openRazorpayCheckout({
        orderId: orderData.orderId,
        amountPaise: book.price_paise,
        description: `Buy “${book.title}”`,
        prefillEmail: user.email ?? undefined,
        onSuccess: async (response) => {
          const verifyRes = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response),
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.verified) {
            setHasAccess(true);
          } else {
            setBuyError(verifyData.error ?? 'Payment could not be verified.');
          }
          setBuying(false);
        },
        onDismiss: () => setBuying(false),
      });
      if (!opened.ok) throw new Error(opened.error);
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : 'Something went wrong.');
      setBuying(false);
    }
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Navbar />
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
          <BookOpen size={40} style={{ color: 'var(--text-faint)', marginBottom: '12px' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>Book not found</h1>
          <Link href="/WebMangal/books" style={{ color: 'var(--accent)', fontSize: '14px', fontWeight: 700 }}>← Back to Books</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const isDraft = book?.status === 'draft';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar />
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 20px 80px' }}>
        <Link href="/WebMangal/books" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 700, textDecoration: 'none', marginBottom: '20px' }}>
          <ArrowLeft size={15} /> All books
        </Link>

        {loading || !book ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>Loading…</p>
        ) : (
          <>
            {isDraft && (
              <div style={{
                padding: '9px 14px', borderRadius: '8px', marginBottom: '18px',
                background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)',
                color: '#f59e0b', fontSize: '12.5px', fontWeight: 700,
              }}>
                Draft — only you can see this page until you publish it.
              </div>
            )}

            <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }} className="book-detail-row">
              {/* Cover */}
              <div style={{
                position: 'relative', width: '220px', aspectRatio: '2 / 3', flexShrink: 0,
                borderRadius: '12px', overflow: 'hidden',
                border: '1px solid var(--border-color)',
                background: 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.15), var(--bg-input))',
                boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
              }}>
                {book.cover_image_url ? (
                  <Image src={book.cover_image_url} alt={book.title} fill unoptimized style={{ objectFit: 'cover' }} />
                ) : (
                  <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                    <BookOpen size={44} style={{ color: 'var(--text-faint)' }} />
                  </span>
                )}
              </div>

              {/* Meta */}
              <div style={{ flex: 1, minWidth: '260px' }}>
                <h1 style={{ fontSize: 'clamp(22px, 3.4vw, 30px)', fontWeight: 900, margin: '0 0 8px', color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {book.title}
                </h1>
                {authorUsername && (
                  <Link href={`/WebMangal/creator/${authorUsername}`} style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}>
                    @{authorUsername}
                  </Link>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '4px 11px', borderRadius: '999px', fontSize: '12px', fontWeight: 800,
                    background: book.pricing_type === 'PAID' ? 'rgba(var(--accent-rgb), 0.12)' : 'rgba(16,185,129,0.12)',
                    color: book.pricing_type === 'PAID' ? 'var(--accent)' : '#10b981',
                    border: `1px solid ${book.pricing_type === 'PAID' ? 'rgba(var(--accent-rgb), 0.35)' : 'rgba(16,185,129,0.35)'}`,
                  }}>
                    {book.pricing_type === 'PAID' && book.price_paise ? formatPaise(book.price_paise) : 'Free'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <FileText size={13} /> {book.file_type.toUpperCase()}
                    {book.file_size_bytes ? ` · ${(book.file_size_bytes / (1024 * 1024)).toFixed(1)} MB` : ''}
                  </span>
                  {book.category && (
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{book.category}</span>
                  )}
                </div>

                {book.description && (
                  <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)', marginTop: '16px', whiteSpace: 'pre-wrap' }}>
                    {book.description}
                  </p>
                )}

                {/* CTA */}
                <div style={{ marginTop: '24px' }}>
                  {hasAccess ? (
                    <Link
                      href={`/WebMangal/books/${book.id}/read`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '9px',
                        padding: '13px 26px', borderRadius: '10px', textDecoration: 'none',
                        background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '15px',
                      }}
                    >
                      <PlayCircle size={19} /> Read now
                    </Link>
                  ) : (
                    <>
                      <button
                        onClick={handleBuy}
                        disabled={buying}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '9px',
                          padding: '13px 26px', borderRadius: '10px', cursor: buying ? 'wait' : 'pointer',
                          border: 'none', background: 'var(--accent)', color: '#fff',
                          fontWeight: 800, fontSize: '15px', opacity: buying ? 0.75 : 1,
                        }}
                      >
                        {buying ? <Loader2 size={17} className="book-spin" /> : <Lock size={16} />}
                        {buying ? 'Opening checkout…' : `Buy ${book.price_paise ? formatPaise(book.price_paise) : ''}`}
                      </button>
                      <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '10px', lineHeight: 1.6, maxWidth: '420px' }}>
                        Includes a free preview of the first pages in the reader. Payments are processed securely by Razorpay.
                      </p>
                    </>
                  )}
                  {buyError && (
                    <p style={{ color: '#ef4444', fontSize: '13px', fontWeight: 600, marginTop: '10px' }}>{buyError}</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <style>{`
        @media (max-width: 640px) {
          .book-detail-row { gap: 18px !important; }
        }
        .book-spin { animation: book-detail-spin 0.9s linear infinite; }
        @keyframes book-detail-spin { to { transform: rotate(360deg); } }
      `}</style>
      <Footer />
    </div>
  );
}