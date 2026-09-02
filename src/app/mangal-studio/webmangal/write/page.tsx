'use client';

// app/mangal-studio/webmangal/write/page.tsx
//
// WebMangal Studio — "AI Writer" tab. Hosts the AI Writing & Translation
// Assistant editor: fiction-tailored grammar/style polishing and Hinglish →
// English conversion with threshold-based batching (one explicit click per
// full page), on-device WebGPU inference by default, BYOK cloud fallback.
//
// Draft persistence is deliberately LOCAL-ONLY (localStorage autosave,
// same privacy posture as the AI key vault): manuscripts are creator
// property and this workspace never uploads prose anywhere by itself.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, Copy, Download, Trash2 } from 'lucide-react';

import { useStudioAuth } from '../../katube/lib/useStudioAuth';

// §141 — loaded client-side only. AiWritingEditor statically imports
// @tiptap/* (ProseMirror), a browser-only rich-text engine that was being
// traced into the SSR/server bundle through this page's static import and
// inlined by OpenNext into the Worker (409 KB there, on top of the 6 MB
// web-llm / 874 KB jspdf leaks externalized in next.config.ts §141 note).
// ssr:false keeps the whole editor subtree out of the server bundle — the
// editor is interactive-only anyway (see BookReader's identical pattern in
// WebMangal/books/[bookId]/read/page.tsx).
const AiWritingEditor = dynamic(() => import('../../../components/editor/AiWritingEditor'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
      Loading editor…
    </div>
  ),
});

const DRAFT_KEY = 'wm_ai_writer_draft_v1';

export default function WebMangalStudioAiWriter() {
  const { loading: authLoading, user } = useStudioAuth('/mangal-studio/webmangal/write');

  // Load the saved draft BEFORE mounting the editor so its initial content
  // is correct on first render (the editor hydrates once with this text).
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [title, setTitle] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    // Local draft preload — browser-only APIs, deferred to a microtask so
    // no setState fires synchronously inside the effect body.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { title?: string; text?: string; savedAt?: string };
          setDraftText(parsed.text ?? '');
          setTitle(parsed.title ?? '');
          setSavedAt(parsed.savedAt ?? null);
        }
      } catch {
        /* corrupted draft — start clean rather than blocking the writer */
      }
      setDraftLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (authLoading || !draftLoaded) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <Link
        href="/mangal-studio/webmangal"
        prefetch={false}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--accent)', fontWeight: 700, textDecoration: 'none', marginBottom: '14px' }}
      >
        <ArrowLeft size={12} /> Studio overview
      </Link>

      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 900, margin: '0 0 4px' }}>AI Writer</h2>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>
          Draft webnovels, books, and story scripts with a fiction-tuned AI editor: grammar &amp;
          literary polish plus Hinglish → English conversion. Runs on your device when possible;
          cloud mode uses <strong>your own</strong> API key, stored only in your browser.
        </p>
      </div>

      {/* How it works — sets expectations for the batching + privacy model */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '18px' }}>
        {[
          { t: 'Batched by design', d: `AI checks run ONLY on your explicit click, over at least one full page (~300+ words or 1,500+ characters). No keystroke spying, no surprise token burn.` },
          { t: 'Private by default', d: 'On-device WebGPU polishing keeps every word in your browser. Cloud fallback needs your own free Gemini/Groq key — encrypted locally, sent per-request only.' },
          { t: 'You approve every edit', d: 'Suggestions arrive in a side-by-side diff. Accept all, pick paragraphs, or discard — your voice stays yours.' },
        ].map((c) => (
          <div key={c.t} style={{ padding: '13px 15px', borderRadius: '11px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent)', marginBottom: '4px' }}>{c.t}</div>
            <div style={{ fontSize: '11.5px', lineHeight: 1.55, color: 'var(--text-tertiary)' }}>{c.d}</div>
          </div>
        ))}
      </div>

      {/* Chapter title */}
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          try {
            localStorage.setItem(
              DRAFT_KEY,
              JSON.stringify({ title: e.target.value, text: draftText, savedAt }),
            );
          } catch {
            /* storage full/blocked — non-fatal */
          }
        }}
        placeholder="Chapter / scene title (optional)"
        aria-label="Chapter or scene title"
        style={{
          width: '100%',
          padding: '12px 14px',
          borderRadius: '11px',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontSize: '15px',
          fontWeight: 700,
          outline: 'none',
          marginBottom: '12px',
        }}
      />

      <AiWritingEditor
        initialText={draftText}
        creatorEmail={user?.email ?? null}
        onChange={(text) => {
          setDraftText(text);
          const now = new Date().toISOString();
          setSavedAt(now);
          try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, text, savedAt: now }));
          } catch {
            /* storage full/blocked — non-fatal */
          }
        }}
      />

      {/* Draft utilities — all local, nothing leaves the browser */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '14px', fontSize: '11.5px', color: 'var(--text-faint)' }}>
        <span title={savedAt ?? undefined}>
          {savedAt ? `Draft autosaved locally · ${new Date(savedAt).toLocaleTimeString()}` : 'Autosaves to this browser as you type'}
        </span>
        <button
          onClick={() => {
            navigator.clipboard
              .writeText(draftText)
              .then(() => alert('Manuscript copied (MANGAL format) — paste it into the chapter uploader.'))
              .catch(() => alert('Copy failed — your browser blocked clipboard access.'));
          }}
          disabled={!draftText.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, cursor: draftText.trim() ? 'pointer' : 'default', opacity: draftText.trim() ? 1 : 0.5 }}
        >
          <Copy size={12} /> Copy for uploader
        </button>
        <button
          onClick={() => {
            const blob = new Blob([draftText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(title || 'webmangal-draft').replace(/[^\w-]+/g, '_')}.txt`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          disabled={!draftText.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, cursor: draftText.trim() ? 'pointer' : 'default', opacity: draftText.trim() ? 1 : 0.5 }}
        >
          <Download size={12} /> Download .txt
        </button>
        <button
          onClick={() => {
            if (!confirm('Clear this local draft? This cannot be undone.')) return;
            localStorage.removeItem(DRAFT_KEY);
            window.location.reload();
          }}
          disabled={!draftText.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: '#ef4444', fontWeight: 700, cursor: draftText.trim() ? 'pointer' : 'default', opacity: draftText.trim() ? 1 : 0.5 }}
        >
          <Trash2 size={12} /> Clear draft
        </button>
      </div>
    </div>
  );
}

