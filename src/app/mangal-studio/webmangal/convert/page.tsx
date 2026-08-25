'use client';

// app/mangal-studio/webmangal/convert/page.tsx
//
// §135 — Webtoon Layout & Scene Storyboard tool (roadmap: text→panel
// splitter + drag-drop board + JSON/script export). Pure client-side,
// zero dependencies, zero cost.
//
// PIPELINE
//   1. SPLIT — chapter text is parsed into panel candidates:
//        "# heading"      → SCENE title panel
//        "***"            → TRANSITION panel (scene break)
//        "Name: dialogue" / “quoted” lines → DIALOGUE (speaker detected)
//        @Character cues  → ACTION tagged to that character
//        everything else  → NARRATION, long paragraphs split at sentence
//                           boundaries into ≤240-char panels
//   2. ARRANGE — HTML5 drag-and-drop reorder (plus ◀ ▶ buttons for touch),
//      per-panel character tags, dialogue position, transition notes and an
//      empty image slot the artist fills later.
//   3. EXPORT — structured JSON (re-importable) or a plain-text scene script.

import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Clapperboard, Download, GripVertical, Upload, Wand, X,
} from 'lucide-react';

import { useStudioAuth } from '../../katube/lib/useStudioAuth';

type PanelKind = 'scene' | 'transition' | 'dialogue' | 'action' | 'narration';
type DialoguePos = 'top' | 'center' | 'bottom';

interface Panel {
  id: string;
  kind: PanelKind;
  text: string;
  speaker?: string;
  characters: string[];
  dialoguePos: DialoguePos;
  note?: string;
}

const PANEL_STYLES: Record<PanelKind, { label: string; color: string }> = {
  scene: { label: 'SCENE', color: '#7c3aed' },
  transition: { label: 'TRANSITION', color: '#0891b2' },
  dialogue: { label: 'DIALOGUE', color: '#d97706' },
  action: { label: 'ACTION', color: '#22c55e' },
  narration: { label: 'NARRATION', color: 'var(--text-tertiary)' },
};

let panelSeq = 0;
const mkPanel = (p: Partial<Panel> & { kind: PanelKind; text: string }): Panel => ({
  id: `p${++panelSeq}`,
  characters: [],
  dialoguePos: 'bottom',
  ...p,
});

function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?…]["')\]]?)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Heuristic text → panels. Deliberately simple and explainable. */
export function textToPanels(raw: string): Panel[] {
  const panels: Panel[] = [];
  const cast = new Set<string>();

  const addCastFrom = (line: string) => {
    for (const m of line.matchAll(/@([A-Za-z][\w']*)/g)) cast.add(m[1]);
    const labelled = line.match(/^([A-Z][\w']*)\s*:/);
    if (labelled) cast.add(labelled[1]);
  };

  for (const block of raw.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (/^#{1,3}\s+/.test(trimmed)) {
      panels.push(mkPanel({ kind: 'scene', text: trimmed.replace(/^#{1,3}\s+/, ''), characters: [] }));
      continue;
    }
    if (trimmed === '***') {
      panels.push(mkPanel({ kind: 'transition', text: 'Scene break', characters: [] }));
      continue;
    }

    for (const sentence of splitSentences(trimmed)) {
      addCastFrom(sentence);
      const labelled = sentence.match(/^([A-Z][\w']*)\s*:\s*(.+)$/);
      const quoted = /[“"«]/.test(sentence);

      if (labelled) {
        cast.add(labelled[1]);
        panels.push(
          mkPanel({ kind: 'dialogue', text: labelled[2], speaker: labelled[1], characters: [labelled[1]] }),
        );
      } else if (quoted) {
        const speaker = sentence.match(/^(?:“|")?([A-Za-z][\w']*)/);
        panels.push(
          mkPanel({
            kind: 'dialogue',
            text: sentence,
            speaker: speaker?.[1],
            characters: speaker?.[1] ? [speaker[1]] : [],
          }),
        );
      } else if (/^@/.test(sentence)) {
        panels.push(mkPanel({ kind: 'action', text: sentence.replace(/^@\S+\s*/, '') }));
      } else if (sentence.length > 240) {
        // Long narration → two balanced halves so no panel overflows.
        const words = sentence.split(/\s+/);
        const half = Math.ceil(words.length / 2);
        panels.push(mkPanel({ kind: 'narration', text: words.slice(0, half).join(' ') }));
        panels.push(mkPanel({ kind: 'narration', text: words.slice(half).join(' ') }));
      } else {
        panels.push(mkPanel({ kind: sentence.length < 90 ? 'action' : 'narration', text: sentence }));
      }
    }
  }
  // Second pass: attach detected cast to non-dialogue panels that mention them.
  for (const p of panels) {
    if (p.kind === 'dialogue') continue;
    p.characters = [...cast].filter((name) =>
      new RegExp(`\\b${name}\\b`).test(p.text) || p.text.includes(`@${name}`),
    );
  }
  return panels;
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toSceneScript(title: string, panels: Panel[]): string {
  const lines: string[] = [`WEBTOON STORYBOARD — ${title || 'Untitled'}`, '='.repeat(40), ''];
  panels.forEach((p, i) => {
    lines.push(`PANEL ${i + 1}  [${PANEL_STYLES[p.kind].label}]`);
    lines.push(`Image slot: 800×1131 (2:3 webtoon tile) — ${p.note ? p.note : 'placeholder'}`);
    if (p.characters.length) lines.push(`Characters: ${p.characters.join(', ')}`);
    if (p.kind === 'dialogue') {
      lines.push(`${p.speaker ? `${p.speaker} (balloon ${p.dialoguePos}): ` : ''}${p.text}`);
    } else {
      lines.push(p.text);
    }
    lines.push('');
  });
  return lines.join('\n');
}

export default function WebMangalStoryboard() {
  const { loading: authLoading } = useStudioAuth('/mangal-studio/webmangal/convert');

  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('');
  const [panels, setPanels] = useState<Panel[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const generate = () => {
    const next = textToPanels(rawText);
    panelSeq = 0;
    setPanels(next.map((p) => ({ ...p, id: `p${++panelSeq}` })));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= panels.length || from === to) return;
    setPanels((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const patchPanel = (id: string, patch: Partial<Panel>) =>
    setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const exportJson = () =>
    download(
      `${(title || 'storyboard').replace(/[^\w-]+/g, '_')}.json`,
      JSON.stringify({ title, exportedAt: new Date().toISOString(), panels }, null, 2),
      'application/json',
    );

  const exportScript = () =>
    download(
      `${(title || 'storyboard').replace(/[^\w-]+/g, '_')}_script.txt`,
      toSceneScript(title, panels),
      'text/plain;charset=utf-8',
    );

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { title?: string; panels?: Panel[] };
        if (!Array.isArray(parsed.panels)) throw new Error('bad file');
        setPanels(parsed.panels.map((p, i) => ({ ...p, id: p.id ?? `imp${i + 1}` })));
        setTitle(parsed.title ?? '');
      } catch {
        alert('That file is not a storyboard JSON export.');
      }
    };
    reader.readAsText(file);
  };

  if (authLoading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px' }}>
      <Link href="/mangal-studio/webmangal" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--accent)', fontWeight: 700, textDecoration: 'none', marginBottom: '14px' }}>
        <ArrowLeft size={12} /> Studio overview
      </Link>

      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 900, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clapperboard size={17} color="var(--accent)" /> Storyboard Converter
        </h2>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>
          Paste a chapter — get a draggable webtoon panel board with dialogue balloons,
          character tags and scene transitions. Export as JSON or a shot-list script.
          Everything runs locally in your browser.
        </p>
      </div>

      {/* Step 1 — source text */}
      <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Chapter / scene title"
            aria-label="Storyboard title"
            style={{ flex: 1, minWidth: '220px', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
          />
          <button
            type="button"
            onClick={generate}
            disabled={!rawText.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '12.5px', cursor: rawText.trim() ? 'pointer' : 'default', opacity: rawText.trim() ? 1 : 0.45 }}
          >
            <Wand size={14} /> Generate panels
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
          >
            <Upload size={13} /> Import JSON
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
        </div>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={7}
          aria-label="Chapter source text"
          placeholder={'Paste chapter text…\n\n# The Warning\n***\nRiya: We should not be here.\nAbhi drew his blade anyway.'}
          style={{ width: '100%', padding: '11px 13px', borderRadius: '9px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.6, outline: 'none', resize: 'vertical' as const }}
        />
      </div>

      {/* Step 2 — the board */}
      {panels.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              {panels.length} panels · drag cards (or use ◀ ▶) to reorder
            </span>
            <span style={{ display: 'inline-flex', gap: '8px' }}>
              <button type="button" onClick={exportJson} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>
                <Download size={13} /> Export JSON
              </button>
              <button type="button" onClick={exportScript} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                <Download size={13} /> Scene script
              </button>
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
            {panels.map((p, i) => (
              <div
                key={p.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnter={() => setOverIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={() => {
                  if (dragIndex !== null && overIndex !== null) move(dragIndex, overIndex);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDrop={(e) => e.preventDefault()}
                style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${overIndex === i && dragIndex !== null && dragIndex !== i ? '#d97706' : 'var(--border-color)'}`,
                  borderRadius: '12px', overflow: 'hidden',
                  opacity: dragIndex === i ? 0.45 : 1,
                  cursor: 'grab',
                }}
              >
                {/* Image slot — the artist fills this later */}
                <div style={{ aspectRatio: '3/2', background: 'var(--bg-input)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '11px' }}>
                  image slot · 800×533
                </div>

                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '7px' }}>
                    <GripVertical size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                    <span style={{ fontSize: '9.5px', fontWeight: 900, letterSpacing: '0.06em', color: PANEL_STYLES[p.kind].color }}>
                      {i + 1} · {PANEL_STYLES[p.kind].label}
                    </span>
                    {p.speaker && (
                      <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-tertiary)' }}>@{p.speaker}</span>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete panel ${i + 1}`}
                      onClick={() => setPanels((prev) => prev.filter((x) => x.id !== p.id))}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <textarea
                    value={p.text}
                    onChange={(e) => patchPanel(p.id, { text: e.target.value })}
                    rows={p.kind === 'dialogue' ? 2 : 3}
                    aria-label={`Panel ${i + 1} text`}
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '7px', color: 'var(--text-primary)', fontSize: '11.5px', lineHeight: 1.55, padding: '7px 9px', outline: 'none', resize: 'vertical' as const }}
                  />

                  {p.kind === 'dialogue' && (
                    <select
                      value={p.dialoguePos}
                      onChange={(e) => patchPanel(p.id, { dialoguePos: e.target.value as DialoguePos })}
                      aria-label="Dialogue balloon position"
                      style={{ marginTop: '6px', width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-secondary)', fontSize: '10.5px', outline: 'none' }}
                    >
                      <option value="top">Balloon top</option>
                      <option value="center">Balloon center</option>
                      <option value="bottom">Balloon bottom</option>
                    </select>
                  )}

                  <input
                    value={p.note ?? ''}
                    onChange={(e) => patchPanel(p.id, { note: e.target.value })}
                    placeholder="Transition / camera note…"
                    aria-label={`Panel ${i + 1} note`}
                    style={{ marginTop: '6px', width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-secondary)', fontSize: '10.5px', outline: 'none' }}
                  />

                  <div style={{ display: 'flex', gap: '5px', marginTop: '7px' }}>
                    <button type="button" onClick={() => move(i, i - 1)} title="Move earlier" style={{ flex: 1, padding: '5px 0', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>◀</button>
                    <button type="button" onClick={() => move(i, i + 1)} title="Move later" style={{ flex: 1, padding: '5px 0', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>▶</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}



