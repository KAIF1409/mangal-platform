'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { setPostLoginRedirect } from '../../lib/auth/authRedirect';
import { activeBooks, BOOK_VIBES, moveQueueItem, type LibraryBook } from '../../lib/books/library';
import { discoverLibraryBooks, loadBookLibrary, saveBookQueue, type LibrarySnapshot } from '../../lib/books/libraryClient';
import styles from './BookLibrary.module.css';

function Cover({ book }: { book: LibraryBook }) {
  return <div className={styles.cover}>
    {book.cover_image_url
      ? <Image src={book.cover_image_url} alt="" width={240} height={360} sizes="(max-width: 480px) 40vw, 192px" />
      : <BookOpen size={40} aria-hidden="true" />}
  </div>;
}

function BookCard({ book }: { book: LibraryBook }) {
  return <Link href={`/WebMangal/books/${book.id}`}><Cover book={book} /><h3>{book.title}</h3></Link>;
}

export default function BookLibrary() {
  const [identity, setIdentity] = useState<{ id: string | null } | null>(null);
  const [authError, setAuthError] = useState(false);
  useEffect(() => {
    let alive = true;
    let authEventReceived = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      if (alive) { setAuthError(false); setIdentity({ id: session?.user.id ?? null }); }
    });
    void supabase.auth.getUser().then(({ data, error }) => {
      if (alive && !authEventReceived) {
        setIdentity({ id: data.user?.id ?? null });
        setAuthError(!!error && error.name !== 'AuthSessionMissingError');
      }
    }).catch(() => { if (alive && !authEventReceived) { setIdentity({ id: null }); setAuthError(true); } });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  return <main className={styles.main}>
    <Link href="/WebMangal/books">← Browse Books</Link>
    <h1>Your Book Library</h1>
    <p className={styles.muted}>Pick up your story. Keep your next adventure close.</p>
    {authError && <p role="alert">Your session could not be checked. Reload to try again.</p>}
    {!identity ? <p role="status">Loading your library…</p>
      : <LibraryShelves key={identity.id ?? 'anonymous'} userId={identity.id} />}
  </main>;
}

export function LibraryShelves({ userId }: { userId: string | null }) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void loadBookLibrary(userId).then(data => {
      if (alive) { setSnapshot(data); setError(null); }
    }).catch(() => { if (alive) setError('Your library could not be loaded. Please retry.'); });
    return () => { alive = false; };
  }, [userId, reload]);

  async function updateQueue(ids: string[], addedBook?: LibraryBook) {
    if (!snapshot?.queue || busy.current) return;
    busy.current = true;
    setSaving(true);
    setNotice('Saving Up Next…');
    try {
      const queue = await saveBookQueue(ids, snapshot.queue.revision);
      setSnapshot(previous => previous ? { ...previous, queue,
        books: addedBook && !previous.books.some(book => book.id === addedBook.id)
          ? [...previous.books, addedBook] : previous.books } : previous);
      setNotice('Up Next saved.');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Queue could not be saved.');
    } finally { busy.current = false; setSaving(false); }
  }

  const active = snapshot ? activeBooks(snapshot.books, snapshot.progress) : [];
  const current = active[0];
  const queue = snapshot?.queue;
  const ids = queue?.book_ids ?? [];
  const byId = new Map(snapshot?.books.map(book => [book.id, book]) ?? []);

  return <>
    {!userId && <p className={styles.notice}><Link href="/login?next=%2FWebMangal%2Fbooks%2Flibrary" onClick={() => setPostLoginRedirect('/WebMangal/books/library')}>Sign in</Link> to sync your progress and build Up Next. Guest reading positions stay on this device in the reader.</p>}
    {userId && <>
      {error && <p role="alert" className={styles.notice}>{error}</p>}
      {!snapshot && !error && <p role="status">Loading saved books…</p>}
      {(error || snapshot?.queueError) && <div className={styles.notice}>
        {snapshot?.queueError && <p role="alert">{snapshot.queueError}</p>}
        <button onClick={() => setReload(value => value + 1)}>Retry library</button>
      </div>}
      {snapshot && <>
        <section className={`${styles.section} ${styles.hero}`} aria-label="Current Read">
          {current ? <><Cover book={current.book} /><div>
            <p className={styles.muted}>CURRENT READ</p><h2>{current.book.title}</h2>
            <p>{current.book.file_type === 'pdf' ? `Page ${current.progress.last_page} · ` : ''}{Math.round(current.percent)}% completed</p>
            <progress className={styles.progress} value={current.percent} max={100} aria-label={`${current.book.title} progress`} />
            <Link className={styles.cta} href={`/WebMangal/books/${current.book.id}/read`}>Resume Reading</Link>
          </div></> : <div><h2>Your next story starts here</h2><p>Open a book below. Your synced progress will appear here after you read.</p></div>}
        </section>
        <section className={styles.section} aria-labelledby="in-progress-title">
          <h2 id="in-progress-title">In Progress</h2>
          {active.length ? <ul className={styles.rail} aria-label="In Progress books" tabIndex={0}>
            {active.map(item => <li className={styles.card} key={item.book.id}>
              <BookCard book={item.book} />
              <progress className={styles.progress} value={item.percent} max={100} aria-label={`${item.book.title} progress`} />
              <span>{Math.round(item.percent)}% completed</span>
            </li>)}
          </ul> : <p className={styles.muted}>No unfinished reads yet.</p>}
        </section>
        <section className={styles.section} aria-labelledby="up-next-title">
          <h2 id="up-next-title">Up Next</h2>
          {queue && <>
            <p className={styles.muted}>Drag to reorder, or use the move buttons. {ids.length}/100 books.</p>
            {ids.length ? <ol className={styles.rail} aria-label="Up Next books" tabIndex={0}>
              {ids.map((id, index) => {
                const book = byId.get(id);
                const title = book?.title ?? 'Unavailable book';
                return <li className={styles.card} key={id} draggable={!saving}
                  onDragStart={event => { dragIndex.current = index; event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { dragIndex.current = null; }}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => {
                    event.preventDefault();
                    if (dragIndex.current !== null && dragIndex.current !== index) void updateQueue(moveQueueItem(ids, dragIndex.current, index));
                    dragIndex.current = null;
                  }}>
                  {book ? <BookCard book={book} /> : <h3>Unavailable book</h3>}
                  <div className={styles.controls}>
                    <button aria-label={`Move ${title} earlier`} disabled={saving || index === 0} onClick={() => void updateQueue(moveQueueItem(ids, index, index - 1))}>←</button>
                    <button aria-label={`Move ${title} later`} disabled={saving || index === ids.length - 1} onClick={() => void updateQueue(moveQueueItem(ids, index, index + 1))}>→</button>
                    <button aria-label={`Remove ${title} from Up Next`} disabled={saving} onClick={() => void updateQueue(ids.filter(item => item !== id))}>Remove</button>
                  </div>
                </li>;
              })}
            </ol> : <p className={styles.muted}>Add books from Mood Matcher below.</p>}
          </>}
          <p role="status" aria-live="polite">{notice}</p>
          <button disabled={saving} onClick={() => setReload(value => value + 1)}>Reload library</button>
        </section>
      </>}
    </>}
    <MoodMatcher queuedIds={ids} canAdd={!!queue && !saving && ids.length < 100}
      onAdd={book => void updateQueue([...ids, book.id], book)} />
  </>;
}

function MoodMatcher({ queuedIds, canAdd, onAdd }: { queuedIds: string[]; canAdd: boolean; onAdd: (book: LibraryBook) => void }) {
  const [vibe, setVibe] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ books: LibraryBook[]; error: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    void discoverLibraryBooks(vibe, page).then(books => {
      if (alive) setResult({ books, error: null });
    }).catch(cause => {
      if (alive) setResult({ books: [], error: cause instanceof Error ? cause.message : 'Discovery unavailable.' });
    });
    return () => { alive = false; };
  }, [vibe, page, retry]);

  return <section className={styles.section} aria-labelledby="mood-title">
    <h2 id="mood-title">Mood Matcher</h2>
    <p className={styles.muted}>Find your next read by vibe. Tags are curated, not guessed from genre.</p>
    <div className={styles.filters} role="group" aria-label="Book mood">
      {[{ id: null, label: 'All books' }, ...BOOK_VIBES].map(item => <button key={item.id ?? 'all'} aria-pressed={vibe === item.id}
        onClick={() => { setVibe(item.id); setPage(0); setResult(null); setRetry(value => value + 1); }}>{item.label}</button>)}
    </div>
    {!result ? <p role="status">Finding books…</p> : result.error ? <div role="alert"><p>{result.error}</p>
      <button onClick={() => { setResult(null); setRetry(value => value + 1); }}>Retry discovery</button></div>
      : result.books.length ? <ul className={styles.grid}>{result.books.map(book => <li key={book.id} className={styles.card}>
        <BookCard book={book} />
        <button disabled={!canAdd || queuedIds.includes(book.id)} onClick={() => onAdd(book)} aria-label={`Add ${book.title} to Up Next`}>
          {queuedIds.includes(book.id) ? 'In Up Next' : 'Add to Up Next'}
        </button>
      </li>)}</ul> : <p>No books on this page{vibe ? ' for this vibe yet' : ''}. Try another mood or browse All books.</p>}
    <div className={styles.pager}>
      <button disabled={page === 0 || !result} onClick={() => { setPage(value => value - 1); setResult(null); }}>Previous</button>
      <span>Page {page + 1}</span>
      <button disabled={!result || !!result.error || result.books.length < 24} onClick={() => { setPage(value => value + 1); setResult(null); }}>Next</button>
    </div>
  </section>;
}