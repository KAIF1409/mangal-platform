'use client';

// app/mangal-studio/webmangal/codex/page.tsx
//
// §138 — Codex tab: character profiles + lore codex in ONE studio surface
// with an internal Characters ⇄ Lore switcher. Private creator drafting
// space — owner-only RLS scopes every query to the signed-in user; nothing
// here is public content.
//
// AI: both prose fields are WebMangalAiEditor drop-ins (feature="character" /
// "lore"), so thresholds, the Polish & Hinglish toolbar, BYOK settings, diff
// review and the recovery matrix come from the ONE shared §134 pipeline.
//
// Responsive: two-pane grid on desktop, single column below 860px (the
// .codex-panes media query below); touch targets ≥44px; no horizontal
// overflow (minmax(0, …) columns throughout).

import { useCallback, useEffect, useState } from 'react';
import { ScrollText, Users } from 'lucide-react';

import { useStudioAuth } from '../../katube/lib/useStudioAuth';
import { supabase } from '../../../lib/supabase';
import CharacterPane from './CharacterPane';
import LorePane from './LorePane';
import {
  characterToDraft,
  loreToDraft,
  newCharacterDraft,
  newLoreDraft,
  parseTagsText,
  type CharacterDraft,
  type CharacterRow,
  type LoreDraft,
  type LoreRow,
} from './codexTypes';

type CodexMode = 'characters' | 'lore';

const MODES: { value: CodexMode; label: string; icon: typeof Users }[] = [
  { value: 'characters', label: 'Characters', icon: Users },
  { value: 'lore', label: 'Lore', icon: ScrollText },
];

export default function WebMangalStudioCodex() {
  const { loading: authLoading, user } = useStudioAuth('/mangal-studio/webmangal/codex');

  const [mode, setMode] = useState<CodexMode>('characters');

  const [charRows, setCharRows] = useState<CharacterRow[]>([]);
  const [charLoading, setCharLoading] = useState(true);
  const [charError, setCharError] = useState<string | null>(null);
  const [charDraft, setCharDraft] = useState<CharacterDraft | null>(null);
  const [charSaving, setCharSaving] = useState(false);
  const [charConfirmDelete, setCharConfirmDelete] = useState(false);

  const [loreRows, setLoreRows] = useState<LoreRow[]>([]);
  const [loreLoading, setLoreLoading] = useState(true);
  const [loreError, setLoreError] = useState<string | null>(null);
  const [loreDraft, setLoreDraft] = useState<LoreDraft | null>(null);
  const [loreSaving, setLoreSaving] = useState(false);
  const [loreConfirmDelete, setLoreConfirmDelete] = useState(false);

  // ── Loaders — once per signed-in user ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('character_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (cancelled) return;
      if (error) setCharError(error.message);
      else setCharRows((data ?? []) as CharacterRow[]);
      setCharLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('lore_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (cancelled) return;
      if (error) setLoreError(error.message);
      else setLoreRows((data ?? []) as LoreRow[]);
      setLoreLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ── Character handlers ─────────────────────────────────────────────────────
  const saveCharacter = useCallback(async () => {
    if (!user || !charDraft || !charDraft.name.trim() || charSaving) return;
    setCharSaving(true);
    setCharError(null);
    // image_url / series_id are deliberately NOT in the payload: update must
    // leave columns it has no UI for untouched, and insert leaves them null.
    const payload = {
      name: charDraft.name.trim(),
      role: charDraft.role.trim() || null,
      tags: parseTagsText(charDraft.tagsText),
      backstory: charDraft.backstory.trim() || null,
    };
    if (charDraft.id) {
      const { data, error } = await supabase
        .from('character_profiles')
        .update(payload)
        .eq('id', charDraft.id)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) setCharError(error.message);
      else if (data) {
        const updated = data as CharacterRow;
        setCharRows((rows) => [updated, ...rows.filter((r) => r.id !== updated.id)]);
        setCharDraft(characterToDraft(updated));
      }
    } else {
      const { data, error } = await supabase
        .from('character_profiles')
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (error) setCharError(error.message);
      else if (data) {
        const created = data as CharacterRow;
        setCharRows((rows) => [created, ...rows]);
        setCharDraft(characterToDraft(created));
      }
    }
    setCharSaving(false);
  }, [user, charDraft, charSaving]);

  const deleteCharacter = useCallback(async () => {
    if (!user || !charDraft?.id || charSaving) return;
    setCharSaving(true);
    setCharError(null);
    const { error } = await supabase
      .from('character_profiles')
      .delete()
      .eq('id', charDraft.id)
      .eq('user_id', user.id);
    if (error) setCharError(error.message);
    else {
      setCharRows((rows) => rows.filter((r) => r.id !== charDraft.id));
      setCharDraft(null);
      setCharConfirmDelete(false);
    }
    setCharSaving(false);
  }, [user, charDraft, charSaving]);

  const selectCharacter = useCallback(
    (id: string) => {
      const row = charRows.find((r) => r.id === id);
      if (row) setCharDraft(characterToDraft(row));
      setCharConfirmDelete(false);
    },
    [charRows],
  );

  // ── Lore handlers — mirror of the character ones ───────────────────────────
  const saveLore = useCallback(async () => {
    if (!user || !loreDraft || !loreDraft.title.trim() || loreSaving) return;
    setLoreSaving(true);
    setLoreError(null);
    const payload = {
      title: loreDraft.title.trim(),
      category: loreDraft.category,
      content: loreDraft.content.trim() || null,
    };
    if (loreDraft.id) {
      const { data, error } = await supabase
        .from('lore_entries')
        .update(payload)
        .eq('id', loreDraft.id)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) setLoreError(error.message);
      else if (data) {
        const updated = data as LoreRow;
        setLoreRows((rows) => [updated, ...rows.filter((r) => r.id !== updated.id)]);
        setLoreDraft(loreToDraft(updated));
      }
    } else {
      const { data, error } = await supabase
        .from('lore_entries')
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (error) setLoreError(error.message);
      else if (data) {
        const created = data as LoreRow;
        setLoreRows((rows) => [created, ...rows]);
        setLoreDraft(loreToDraft(created));
      }
    }
    setLoreSaving(false);
  }, [user, loreDraft, loreSaving]);

  const deleteLore = useCallback(async () => {
    if (!user || !loreDraft?.id || loreSaving) return;
    setLoreSaving(true);
    setLoreError(null);
    const { error } = await supabase
      .from('lore_entries')
      .delete()
      .eq('id', loreDraft.id)
      .eq('user_id', user.id);
    if (error) setLoreError(error.message);
    else {
      setLoreRows((rows) => rows.filter((r) => r.id !== loreDraft.id));
      setLoreDraft(null);
      setLoreConfirmDelete(false);
    }
    setLoreSaving(false);
  }, [user, loreDraft, loreSaving]);

  const selectLore = useCallback(
    (id: string) => {
      const row = loreRows.find((r) => r.id === id);
      if (row) setLoreDraft(loreToDraft(row));
      setLoreConfirmDelete(false);
    },
    [loreRows],
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
        Loading…
      </div>
    );
  }

  const switchMode = (next: CodexMode) => {
    setMode(next);
    setCharConfirmDelete(false);
    setLoreConfirmDelete(false);
  };

  return (
    <div style={{ maxWidth: '980px' }}>
      <style>{`
        .codex-panes { display: grid; grid-template-columns: minmax(200px, 260px) minmax(0, 1fr); gap: 14px; align-items: start; }
        @media (max-width: 860px) { .codex-panes { grid-template-columns: minmax(0, 1fr); } }
        .codex-btn:focus-visible, .codex-field:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .codex-btn { font-family: inherit; }
      `}</style>

      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 900, margin: '0 0 4px' }}>Codex</h2>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>
          Your private character profiles and lore entries — reference material for your stories.
          Prose fields carry the ✨ AI toolbar (on-device by default; cloud mode uses your own key,
          stored only in your browser).
        </p>
      </div>

      <div
        role="tablist" aria-label="Codex sections"
        style={{ display: 'inline-flex', gap: '6px', padding: '4px', borderRadius: '11px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', marginBottom: '16px' }}
      >
        {MODES.map((m) => {
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="tab"
              aria-selected={active}
              className="codex-btn"
              onClick={() => switchMode(m.value)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '8px', border: 'none', background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--text-secondary)', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}
            >
              <m.icon size={13} /> {m.label}
            </button>
          );
        })}
      </div>

      {mode === 'characters' && charError && (
        <div role="alert" style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.07)', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '12px' }}>
          {charError}
        </div>
      )}
      {mode === 'lore' && loreError && (
        <div role="alert" style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.07)', color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '12px' }}>
          {loreError}
        </div>
      )}

      {mode === 'characters' ? (
        <CharacterPane
          rows={charRows}
          loading={charLoading}
          error={charError}
          selectedId={charDraft?.id ?? null}
          draft={charDraft}
          saving={charSaving}
          confirmDelete={charConfirmDelete}
          creatorEmail={user?.email ?? null}
          onSelect={selectCharacter}
          onNew={() => {
            setCharDraft(newCharacterDraft());
            setCharConfirmDelete(false);
          }}
          onField={(patch) => setCharDraft((d) => (d ? { ...d, ...patch } : d))}
          onSave={() => {
            void saveCharacter();
          }}
          onRequestDelete={() => setCharConfirmDelete(true)}
          onCancelDelete={() => setCharConfirmDelete(false)}
          onConfirmDelete={() => {
            void deleteCharacter();
          }}
          onDiscard={() => {
            if (charDraft?.id) {
              const row = charRows.find((r) => r.id === charDraft.id);
              setCharDraft(row ? characterToDraft(row) : null);
            } else {
              setCharDraft(null);
            }
            setCharConfirmDelete(false);
          }}
        />
      ) : (
        <LorePane
          rows={loreRows}
          loading={loreLoading}
          error={loreError}
          selectedId={loreDraft?.id ?? null}
          draft={loreDraft}
          saving={loreSaving}
          confirmDelete={loreConfirmDelete}
          creatorEmail={user?.email ?? null}
          onSelect={selectLore}
          onNew={() => {
            setLoreDraft(newLoreDraft());
            setLoreConfirmDelete(false);
          }}
          onField={(patch) => setLoreDraft((d) => (d ? { ...d, ...patch } : d))}
          onSave={() => {
            void saveLore();
          }}
          onRequestDelete={() => setLoreConfirmDelete(true)}
          onCancelDelete={() => setLoreConfirmDelete(false)}
          onConfirmDelete={() => {
            void deleteLore();
          }}
          onDiscard={() => {
            if (loreDraft?.id) {
              const row = loreRows.find((r) => r.id === loreDraft.id);
              setLoreDraft(row ? loreToDraft(row) : null);
            } else {
              setLoreDraft(null);
            }
            setLoreConfirmDelete(false);
          }}
        />
      )}

      <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '16px' }}>
        🔒 Private workspace — only you can see these entries. Backstory/lore text never leaves your
        browser unless you explicitly run the cloud polish with your own API key.
      </p>
    </div>
  );
}