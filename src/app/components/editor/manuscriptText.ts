// app/components/editor/manuscriptText.ts
//
// Bridges the rich-text editor and MANGAL's platform-wide chapter format.
// Chapters everywhere else on the platform (upload writer, reader, previews)
// are plain text in the tiny novelEditor.ts dialect:
//     **bold**   *italic*   "# heading" line   "***" scene break
//     blank line = paragraph break
//
// The AI assistant editor therefore serializes its ProseMirror document TO
// that dialect before sending anything to a model (models get clean prose,
// not HTML), and parses model output BACK into editor HTML on Accept so
// bold/italic/headings survive the AI round-trip.

interface MarkJson {
  type: string;
  attrs?: Record<string, unknown>;
}

interface NodeJson {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NodeJson[];
  text?: string;
  marks?: MarkJson[];
}

/** Serialize inline nodes of one block, wrapping text in bold/italic markers. */
function serializeInline(nodes: NodeJson[]): string {
  let out = '';
  const visit = (node: NodeJson, boldOuter: boolean, italicOuter: boolean) => {
    // Marks may live on ANY node (typically the text node itself).
    const bold = boldOuter || !!node.marks?.some((m) => m.type === 'bold');
    const italic = italicOuter || !!node.marks?.some((m) => m.type === 'italic');

    if (node.type === 'text' && node.text !== undefined) {
      let text = node.text;
      if (!text.trim()) {
        out += text; // whitespace only — never wrap
        return;
      }
      // MANGAL dialect nesting: * inside ** ; bold+italic = *** (the
      // platform reader's parseInlineRuns understands all three forms).
      if (bold && italic) text = `***${text}***`;
      else if (bold) text = `**${text}**`;
      else if (italic) text = `*${text}*`;
      out += text;
      return;
    }
    for (const child of node.content ?? []) visit(child, bold, italic);
    // Hard breaks become plain newlines inside a paragraph.
    if (node.type === 'hardBreak') out += '\n';
  };
  for (const child of nodes) visit(child, false, false);
  return out;
}

/**
 * Convert a Tiptap JSON document into MANGAL dialect plain text — the exact
 * format /api/ai/editor-assist and WebLLM receive, and what the reader's
 * parseChapterContent() already understands.
 */
export function docToManuscriptText(doc: NodeJson): string {
  const blocks: string[] = [];
  for (const node of doc.content ?? []) {
    switch (node.type) {
      case 'heading': {
        blocks.push(`# ${serializeInline(node.content ?? []).trim()}`);
        break;
      }
      case 'horizontalRule':
        blocks.push('***');
        break;
      case 'paragraph': {
        const inline = serializeInline(node.content ?? []);
        if (inline.replace(/\s/g, '').length > 0) blocks.push(inline);
        break;
      }
      default:
        break;
    }
  }
  return blocks.join('\n\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Render one paragraph's inline runs, honoring ***, **, and * markers. */
function renderInline(text: string): string {
  // Longest marker first so *** never half-matches the ** / * passes.
  return text
    .split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*)/g)
    .map((chunk) => {
      if (chunk.startsWith('***') && chunk.endsWith('***') && chunk.length > 6) {
        return `<strong><em>${renderSingleStar(chunk.slice(3, -3))}</em></strong>`;
      }
      if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
        return `<strong>${renderSingleStar(chunk.slice(2, -2))}</strong>`;
      }
      return renderSingleStar(chunk);
    })
    .join('');
}

function renderSingleStar(text: string): string {
  return text
    .split(/(\*[^*]+\*)/g)
    .map((chunk) => {
      if (chunk.length > 2 && chunk.startsWith('*') && chunk.endsWith('*')) {
        return `<em>${chunk.slice(1, -1)}</em>`;
      }
      return chunk;
    })
    .join('');
}

/**
 * Parse AI-polished MANGAL-dialect text into HTML for editor.setContent().
 * Every non-empty line becomes a paragraph; headings and scene breaks are
 * recognized per the platform dialect; inline markers become real marks.
 */
export function manuscriptTextToHtml(raw: string): string {
  const blocks = raw
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const html = blocks.map((block) => {
    if (block === '***') return '<hr data-scene-break="true">';
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 1 && lines[0].startsWith('# ')) {
      return `<h3>${escapeHtml(lines[0].slice(2))}</h3>`;
    }
    // Regular paragraph(s); keep intra-paragraph single newlines as breaks.
    return `<p>${lines.map((l) => renderInline(escapeHtml(l))).join('<br>') }</p>`;
  });

  return html.join('') || '<p></p>';
}
