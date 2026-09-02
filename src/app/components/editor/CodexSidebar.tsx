'use client';

// app/components/editor/CodexSidebar.tsx
//
// §142 — read-only Lore/Character codex reference sidebar for the writing
// flows (dashboard/books manuscript mode + mangal-studio/webmangal AI Writer).
// It reads the SAME character_profiles / lore_entries tables the Codex tab
// (/mangal-studio/webmangal/codex, §138) owns — this deliberately adds no
// second codex feature, no editing UI, no separate storage. Writers consult
// their characters/lore while drafting without leaving the editor.
//
// Loaded client-only via next/dynamic({ ssr:false }) at the call sites, per
// the §141 client-only boundary convention.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ScrollText, Users, X } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import type { CharacterRow, LoreRow } from '../../mangal-studio/webmangal/codex/codexTypes';
import { LORE_CATEGORIES } from '../../mangal-studio/webmangal/codex/codexTypes';

type CodexMode = 'characters' | 'lore';

interface Props {
  open: boolean;
  onClose: () => void;
}

const LORE_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  LORE_CATEGORIES.map((c) => [c.value, c.label]),
);

export default function CodexSidebar({ open, onClose }: Props) {
  const [mode, setMode] = useState<CodexMode>('characters');
  const [chars, setChars] = useState<CharacterRow[] | null>(null);
  const [lore, setLore] = useState<LoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load once per open — owner-scoped, same queries as the Codex tab.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Defer all setState calls to a microtask so nothing fires synchronously
    // inside the effect body (avoids the react-hooks/set-state-in-effect lint).
    queueMicrotask(() => {
      if (cancelled) return;
      setError(null);
      setChars(null);
      setLore(null);
      (async () => {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) {
          if (!cancelled) setError('Sign in to see your codex.');
          return;
        }
        const uid = u.user.id;
        const [{ data: c, error: cErr }, { data: l, error: lErr }] = await Promise.all([
          supabase
            .from('character_profiles')
            .select('*')
            .eq('user_id', uid)
            .order('updated_at', { ascending: false }),
          supabase
            .from('lore_entries')
            .select('*')
            .eq('user_id', uid)
            .order('updated_at', { ascending: false }),
        ]);
        if (cancelled) return;
        if (cErr || lErr) {
          setError((cErr ?? lErr)?.message ?? 'Could not load your codex.');
          setChars([]);
          setLore([]);
          return;
        }
        setChars((c ?? []) as CharacterRow[]);
        setLore((l ?? []) as LoreRow[]);
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Scroll lock while the sidebar is open (mobile-first hardening, §142).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  }, []);

  if (!open) return null;

  const rows: (CharacterRow | LoreRow)[] = (mode === 'characters' ? chars : lore) ?? [];
  const loading = (mode === 'characters' ? chars : lore) === null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', justifyContent: 'flex-end' }}>
      {/* Backdrop — blur + tap to close */}
      <button
        aria-label="Close codex"
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, background: 'rgba(5,5,8,0.55)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          border: 'none', cursor: 'default', padding: 0,
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Codex reference"
        className="codex-sidebar-panel"
        style={{
          position: 'relative', zIndex: 1, width: 'min(380px, 100vw)', maxWidth: '100vw',
          height: '100%', display: 'flex', flexDirection: 'column',
          background: 'var(--bg-primary)', borderLeft: '1px solid var(--border-color)',
          boxShadow: '-12px 0 36px rgba(0,0,0,0.45)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '14px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <div style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--accent)' }}>CODEX REFERENCE</div>
            <div style={{ fontSize: '14.5px', fontWeight: 900, color: 'var(--text-primary)' }}>Characters &amp; lore</div>
          </div>
          <button
            aria-label="Close codex"
            onClick={onClose}
            style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode switch */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px' }}>
          {([
            { value: 'characters' as const, label: 'Characters', icon: Users },
            { value: 'lore' as const, label: 'Lore', icon: ScrollText },
          ]).map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              style={{
                flex: 1, minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                borderRadius: '10px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 800,
                border: mode === m.value ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                background: mode === m.value ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg-input)',
                color: mode === m.value ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <m.icon size={14} /> {m.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px', minWidth: 0 }}>
          {error && (
            <div role="alert" style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.07)', color: 'var(--text-secondary)', fontSize: '12px' }}>
              {error}
            </div>
          )}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '28px 0', color: 'var(--text-tertiary)', fontSize: '12.5px' }}>
              <Loader2 size={15} className="mangal-spin" /> Loading codex…
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div style={{ padding: '28px 8px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12.5px', lineHeight: 1.6 }}>
              Nothing here yet. Create characters and lore in the{' '}
              <a href="/mangal-studio/webmangal/codex" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>Codex tab</a>{' '}
              — they appear here as you write.
            </div>
          )}
          {rows.map((row) => {
            const isChar = mode === 'characters';
            const title = isChar ? (row as CharacterRow).name : (row as LoreRow).title;
            const subtitle = isChar
              ? (row as CharacterRow).role || 'Character'
              : LORE_CATEGORY_LABEL[(row as LoreRow).category] ?? 'Lore';
            const tags = isChar ? ((row as CharacterRow).tags ?? []) : [];
            const body = isChar ? (row as CharacterRow).backstory : (row as LoreRow).content;
            const expanded = expandedId === row.id;
            return (
              <div
                key={row.id}
                style={{
                  border: '1px solid var(--border-color)', borderRadius: '12px',
                  background: 'var(--bg-card)', marginBottom: '10px', overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => toggleExpanded(row.id)}
                  aria-expanded={expanded}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', minHeight: '48px',
                    padding: '11px 13px', background: 'transparent', border: 'none',
                    cursor: 'pointer', color: 'inherit',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Untitled'}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, flexShrink: 0 }}>{expanded ? '−' : '+'}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{subtitle}</div>
                </button>
                {expanded && (
                  <div style={{ padding: '0 13px 12px' }}>
                    {tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                        {tags.map((t) => (
                          <span key={t} style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', background: 'rgba(var(--accent-rgb), 0.1)', borderRadius: '999px', padding: '3px 8px' }}>
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', lineHeight: 1.65, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {body?.trim() || 'No notes yet.'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', fontSize: '10.5px', color: 'var(--text-faint)', lineHeight: 1.5 }}>
          🔒 Read-only reference — edit entries in the Codex tab. Private to you.
        </div>
      </aside>
      <style>{`
        @media (max-width: 640px) {
          .codex-sidebar-panel { width: 100vw !important; borderLeft: none !important; box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
}
