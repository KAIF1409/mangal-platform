'use client';

// app/components/shared/MangalChatbot.tsx
//
// §150 — THE MANGAL Assistant: one floating AI chatbot widget, mounted ONCE
// in the shared root layout (src/app/layout.tsx) so it appears on EVERY
// route. Standard robot-bubble pattern (Intercom/Tidio/Chatwoot style):
// round launcher fixed bottom-right → expands into a chat panel, full-screen
// on mobile (≤768px).
//
// MODES (routing table in the §150 spec, DEFAULT rule built verbatim in
// lib/ai/chatDiscovery.ts#routeIntent):
//   official page + K Circle  → Guide & Help only.
//   WebMangal + KaTube        → Guide & Help + Discovery (both, same window;
//                               the router decides per message; ambiguous →
//                               Guide).
//
// CONCURRENCY SHAPE (§150):
//   - Guide mode: answered 100% client-side from lib/ai/guideKnowledge.ts
//     (static, grounded in the §145/§147 audit). Zero network, zero cost.
//   - Discovery mode: ONE stateless POST /api/chat/discovery (current
//     message + client-held refinement context; Postgres-backed rate
//     limit). No per-user server state, no LLM, no paid API.
//
// HYDRATION SAFETY: the launcher renders identically on server and client;
// the route-dependent parts (mode caption, suggestion chips) only render
// after the usePathname-derived platform state is set in an effect — the
// same pattern as the globally-mounted ProductVisitTracker.
//
// STYLE CONVENTIONS: inline styles only + one <style> block for the things
// inline styles cannot express (media queries, keyframes) — same approach
// as KCircleShellStyle/FeaturesSection. All colors via existing tokens
// (var(--bg-card), var(--border-color), var(--text-*), var(--accent),
// --accent-rgb). Animations are gated behind
// (prefers-reduced-motion: no-preference) per the §145 convention (no new
// animation library; Framer Motion stays landing-page-only per §145's
// bundle rationale). z-index 950: above page chrome (navs z100, KaTube
// watch mini-player z200, K Circle rail z50), below modals (z1000+) and
// the consent banner (z9999).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { BookOpen, Clapperboard, MessageCircle, Music, Send, Sparkles, Users, X } from 'lucide-react';

import {
  answerGuideQuery,
  getGuideSuggestions,
  type ChatPlatformContext,
} from '../../lib/ai/guideKnowledge';
import {
  extractDiscoveryQuery,
  mergeDiscoveryContext,
  routeIntent,
  type DiscoverySessionContext,
} from '../../lib/ai/chatDiscovery';
import { playNotificationSound } from '../../lib/sound/playNotificationSound';

interface ChatCard {
  type: 'series' | 'book' | 'song' | 'video' | 'channel';
  id: string;
  title: string;
  subtitle: string | null;
  why: string;
  cover: string | null;
  href: string;
  badge: string | null;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'bot';
  text?: string;
  cards?: ChatCard[];
  chips?: string[];
  link?: { href: string; label: string };
}

const CHAT_CSS = `
  @media (prefers-reduced-motion: no-preference) {
    .mchat-panel { animation: mchat-pop 0.22s ease both; }
    .mchat-msg { animation: mchat-rise 0.18s ease both; }
    .mchat-typing span { animation: mchat-dot 1s ease-in-out infinite; }
    .mchat-typing span:nth-child(2) { animation-delay: 0.15s; }
    .mchat-typing span:nth-child(3) { animation-delay: 0.3s; }
  }
  @keyframes mchat-pop {
    from { opacity: 0; transform: translateY(10px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes mchat-rise {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes mchat-dot {
    0%, 100% { opacity: 0.25; }
    50% { opacity: 1; }
  }
  @media (max-width: 768px) {
    .mchat-panel {
      right: 0 !important; bottom: 0 !important; left: 0 !important; top: 0 !important;
      width: 100% !important; height: 100% !important; max-height: none !important;
      border-radius: 0 !important;
    }
    .mchat-launcher {
      right: 14px !important;
      bottom: calc(72px + env(safe-area-inset-bottom)) !important;
    }
    .mchat-cards { grid-template-columns: minmax(0, 1fr) !important; }
  }
`;

function platformFromPath(pathname: string | null): ChatPlatformContext {
  if (!pathname) return 'official';
  if (pathname === '/WebMangal' || pathname.startsWith('/WebMangal/')) return 'webmangal';
  if (pathname === '/katube' || pathname.startsWith('/katube/')) return 'katube';
  if (pathname === '/kalpana-circle' || pathname.startsWith('/kalpana-circle/')) return 'kcircle';
  return 'official';
}

// §150 follow-up — the floating launcher must never overlap the actual
// reading surface (manga/novel chapter pages, book PDF/EPUB reader). Those
// routes get full-bleed, distraction-free canvases; a chat bubble sitting
// on top of the page looks broken there. Unmount the widget entirely
// (not just hide the panel) on any reading route.
function isReaderRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith('/WebMangal/read')) return true; // manga/novel chapter reader
  if (/^\/WebMangal\/books\/[^/]+\/read(\/|$)/.test(pathname)) return true; // book (PDF/EPUB) reader
  return false;
}

function cardIcon(type: ChatCard['type']) {
  switch (type) {
    case 'song':
      return <Music size={20} />;
    case 'video':
      return <Clapperboard size={20} />;
    case 'channel':
      return <Users size={20} />;
    default:
      return <BookOpen size={20} />;
  }
}

export default function MangalChatbot() {
  const pathname = usePathname();
  // Route-derived platform context — computed during render. usePathname
  // returns the prerendered route's own path on first render (per-route
  // prerender), so this is hydration-safe without effects. Kept effect-free
  // because the react-hooks purity rule (Next 16 lint) flags synchronous
  // setState inside effects.
  const platform = platformFromPath(pathname);
  const readerRoute = isReaderRoute(pathname);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Refinement memory, tagged with the platform it was gathered on: reading
  // it from another product resolves to an empty context WITHOUT a
  // setState-in-effect reset (genres don't carry across products).
  const [discoveryState, setDiscoveryState] = useState<{
    platform: ChatPlatformContext;
    ctx: DiscoverySessionContext;
  }>({ platform: 'official', ctx: { genres: [], excludeGenres: [] } });
  const discoveryCtx = useMemo<DiscoverySessionContext>(
    () =>
      discoveryState.platform === platform
        ? discoveryState.ctx
        : { genres: [], excludeGenres: [] },
    [discoveryState, platform],
  );

  const idRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const greetedRef = useRef(false);

  // Route-derived platform context (client-only, per ProductVisitTracker
  // precedent) — drives which modes exist on the current page.

  // Keep the newest message visible (scroll pinning).
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open, busy]);

  // §152 — every ASSISTANT reply lands through this single choke point, so it
  // is also the single sound trigger: the shared §151 synth ding plays when a
  // bot reply actually LANDS. Silent only for the cold-start greeting +
  // suggestion chips (that render opens with the panel — it is not an
  // "incoming" message). The user's own sends never pass through here (they
  // go straight to setMessages as role:'user'), so own-message suppression is
  // structural. No focused-tab suppression, deliberately: unlike the §151
  // user-to-user surfaces, a chatbot reply is a direct response to a message
  // the user just sent (ChatGPT-style answer ding), not an ambient push — the
  // global §151 mute (NotificationBell's speaker icon) and its 400ms
  // cross-tab cooldown still govern it, unchanged.
  const pushBot = useCallback((partial: Omit<ChatMessage, 'id' | 'role'>, opts?: { silent?: boolean }) => {
    idRef.current += 1;
    setMessages((prev) => [...prev, { id: idRef.current, role: 'bot', ...partial }]);
    if (!opts?.silent) playNotificationSound();
  }, []);

  // Cold-start greeting + suggestions, per current platform context.
  useEffect(() => {
    if (!open || greetedRef.current) return;
    greetedRef.current = true;
    pushBot({
      text:
        platform === 'webmangal' || platform === 'katube'
          ? 'Hi! I can answer questions about MANGAL\'s real features, or find you something to read/watch — describe a genre, a mood, or a story idea.'
          : 'Hi! I\'m the MANGAL Assistant — ask me anything about the platform\'s real, shipped features.',
      chips: getGuideSuggestions(platform),
    }, { silent: true }); // §152 — cold-start render, not an incoming reply: no sound
  }, [open, platform, pushBot]);

  const answerAsGuide = useCallback(
    (text: string) => {
      const entry = answerGuideQuery(text);
      if (entry) {
        pushBot({ text: entry.answer, link: entry.link });
      } else {
        pushBot({
          text:
            'I don\'t have a grounded answer for that one — I only describe features that actually exist on MANGAL today. Try one of these, or ask about any feature you see in the app:',
          chips: getGuideSuggestions(platform),
        });
      }
    },
    [platform, pushBot],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      idRef.current += 1;
      setMessages((prev) => [...prev, { id: idRef.current, role: 'user', text }]);
      setInput('');

      const intent = routeIntent(text);
      const canDiscover = platform === 'webmangal' || platform === 'katube';

      if (intent === 'discovery' && !canDiscover) {
        // Honest boundary: Discovery lives on WebMangal + KaTube only.
        pushBot({
          text:
            platform === 'kcircle'
              ? 'Catalog recommendations live on WebMangal and KaTube — this K Circle page has Guide & Help only. Here\'s what I can answer here, or hop over to the reading/video products:'
              : 'Catalog recommendations live on WebMangal and KaTube. On the company pages I stick to Guide & Help questions about MANGAL itself:',
          chips: getGuideSuggestions(platform),
          link: { href: '/WebMangal', label: 'Browse WebMangal' },
        });
        return;
      }

      if (intent === 'discovery' && canDiscover) {
        const extracted = extractDiscoveryQuery(text, discoveryCtx);
        if (extracted) {
          setBusy(true);
          try {
            const nextCtx = mergeDiscoveryContext(discoveryCtx, extracted);
            setDiscoveryState({ platform, ctx: nextCtx });
            const res = await fetch('/api/chat/discovery', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ platform, message: text, context: nextCtx }),
            });
            if (res.status === 429) {
              pushBot({ text: 'You\'re sending recommendation requests fast — give it a minute and ask again.' });
            } else if (!res.ok) {
              throw new Error(`status ${res.status}`);
            } else {
              const data = (await res.json()) as { results?: ChatCard[]; noIntent?: boolean };
              if (data.noIntent) {
                answerAsGuide(text);
              } else if (!data.results || data.results.length === 0) {
                pushBot({
                  text:
                    'I couldn\'t find published matches for that. The catalog is what creators have actually published — try another genre or a looser description:',
                  chips: getGuideSuggestions(platform),
                });
              } else {
                pushBot({
                  text: 'Closest matches from the live catalog — tap one to open it:',
                  cards: data.results,
                  chips: nextCtx.genres.length > 0 ? ['Something different', 'What can you do?'] : undefined,
                });
              }
            }
          } catch {
            pushBot({
              text: 'The catalog matcher didn\'t respond just now. I can still answer Guide questions — or try that again in a moment.',
            });
          } finally {
            setBusy(false);
          }
          return;
        }
        // Discovery intent but no usable query → answer as Guide.
      }

      answerAsGuide(text);
    },
    [answerAsGuide, busy, discoveryCtx, platform, pushBot],
  );

  const closeChat = useCallback(() => {
    setOpen(false);
    launcherRef.current?.focus();
  }, []);

  const openChat = useCallback(() => {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const bothModes = platform === 'webmangal' || platform === 'katube';

  // Reading surfaces (manga/novel chapters, book PDF/EPUB) are full-bleed
  // and distraction-free — no floating launcher on top of them.
  if (readerRoute) return null;

  return (
    <>
      <style>{CHAT_CSS}</style>

      {/* Launcher — always mounted (it doubles as the close control, which
          also gives closeChat() a live element to return focus to). 56px
          round, bottom-right, above page chrome (z 950) below modals. */}
      <button
        ref={launcherRef}
        type="button"
        className="mchat-launcher"
        onClick={open ? closeChat : openChat}
        aria-label={open ? 'Close the MANGAL Assistant chat' : 'Open the MANGAL Assistant chat'}
        aria-expanded={open}
        aria-controls="mangal-chat-panel"
        style={{
          position: 'fixed', right: 18, bottom: 18, zIndex: 950,
          width: 56, height: 56, borderRadius: '50%', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
          color: '#fff', boxShadow: '0 8px 24px rgba(217,119,6,0.4)',
        }}
      >
        {open ? <X size={26} /> : <MessageCircle size={26} />}
      </button>

      {open && (
        <div
          id="mangal-chat-panel"
          className="mchat-panel"
          role="dialog"
          aria-label="MANGAL Assistant chat"
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeChat();
          }}
          style={{
            position: 'fixed', right: 18, bottom: 84, zIndex: 950,
            width: 'min(380px, calc(100vw - 24px))', height: 'min(560px, calc(100dvh - 140px))',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 14px', borderBottom: '1px solid var(--border-color)',
              background: 'var(--bg-input)', flexShrink: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Sparkles size={15} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                MANGAL Assistant
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>
                {bothModes ? 'GUIDE + DISCOVERY' : 'GUIDE & HELP'}
              </div>
            </div>
            <button
              type="button"
              onClick={closeChat}
              aria-label="Close chat"
              style={{
                width: 48, height: 48, marginRight: -8, borderRadius: 12, border: 'none',
                background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Message log */}
          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-busy={busy}
            aria-label="Assistant messages"
            style={{
              flex: 1, overflowY: 'auto', padding: '14px 12px',
              display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0,
            }}
          >
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="mchat-msg" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div
                    style={{
                      maxWidth: '88%', borderRadius: '14px 14px 4px 14px',
                      padding: '9px 12px', fontSize: 13, lineHeight: 1.55,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      background: 'rgba(var(--accent-rgb),0.14)', color: 'var(--text-primary)',
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ) : (
                <div
                  key={m.id}
                  className="mchat-msg"
                  style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}
                >
                  {m.text && (
                    <div
                      style={{
                        maxWidth: '88%', borderRadius: '14px 14px 14px 4px',
                        padding: '9px 12px', fontSize: 13, lineHeight: 1.55,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                        color: 'var(--text-soft)',
                      }}
                    >
                      {m.text}
                    </div>
                  )}
                  {m.link && (
                    <Link
                      href={m.link.href}
                      style={{
                        display: 'inline-flex', alignItems: 'center', minHeight: 48,
                        padding: '0 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 800,
                        color: 'var(--accent)', background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)', textDecoration: 'none',
                      }}
                    >
                      {m.link.label} →
                    </Link>
                  )}
                  {m.cards && m.cards.length > 0 && (
                    <div
                      className="mchat-cards"
                      style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, width: '100%' }}
                    >
                      {m.cards.map((c) => (
                        <ResultCard key={`${c.type}-${c.id}`} card={c} />
                      ))}
                    </div>
                  )}
                  {m.chips && m.chips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {m.chips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => void send(chip)}
                          style={{
                            minHeight: 48, padding: '0 14px', borderRadius: 999,
                            background: 'var(--bg-input)', border: '1px solid var(--border-color)',
                            color: 'var(--accent)', fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                          }}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && (
              <div className="mchat-msg" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  className="mchat-typing"
                  aria-label="Assistant is typing"
                  style={{
                    display: 'flex', gap: 4, alignItems: 'center', borderRadius: '14px 14px 14px 4px',
                    padding: '12px 14px', background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
                </div>
              </div>
            )}

          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
              padding: '8px 10px', paddingTop: 8,
              paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
              borderTop: '1px solid var(--border-color)', background: 'var(--bg-input)',
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={bothModes ? 'Ask a feature question, or describe what you want…' : 'Ask about a MANGAL feature…'}
              aria-label="Message the MANGAL Assistant"
              enterKeyHint="send"
              autoComplete="off"
              style={{
                flex: 1, minWidth: 0, height: 48, borderRadius: 12,
                border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', fontSize: 13.5, padding: '0 12px', outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              aria-label="Send message"
              style={{
                width: 48, height: 48, borderRadius: 12, border: 'none', flexShrink: 0,
                cursor: !input.trim() || busy ? 'default' : 'pointer',
                background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: !input.trim() || busy ? 0.5 : 1,
              }}
            >
              <Send size={18} />
            </button>
          </form>

        </div>
      )}
    </>
  );
}

/** Rich recommendation card rendered INSIDE a bot bubble (Vercel AI
 * Chatbot-style inline structured content) — conventions from the §135
 * RecommendedForYou rail: next/image cover with icon fallback, 2-line title
 * clamp, accent why-line. Whole card is one Link; ≥48px tall on touch. */
function ResultCard({ card }: { card: ChatCard }) {
  return (
    <Link
      href={card.href}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: 8,
        borderRadius: 10, background: 'var(--bg-input)',
        border: '1px solid var(--border-color)', textDecoration: 'none',
        color: 'var(--text-primary)', minWidth: 0, minHeight: 60,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'relative', width: 44, height: 44, borderRadius: 8,
          overflow: 'hidden', flexShrink: 0,
          background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {card.cover ? (
          <Image src={card.cover} alt="" fill sizes="44px" style={{ objectFit: 'cover' }} />
        ) : (
          cardIcon(card.type)
        )}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontSize: 12, fontWeight: 800, lineHeight: 1.3, color: 'var(--text-primary)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {card.badge && (
            <span
              style={{
                fontSize: 8.5, fontWeight: 800, letterSpacing: '0.05em', color: '#fff',
                background: 'rgba(217,119,6,0.9)', borderRadius: 999, padding: '1px 6px',
                marginRight: 5, position: 'relative', top: -1,
              }}
            >
              {card.badge}
            </span>
          )}
          {card.title}
        </span>
        {card.subtitle && (
          <span
            style={{
              fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {card.subtitle}
          </span>
        )}
        <span
          style={{
            fontSize: 10.5, fontWeight: 700, color: 'var(--accent)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {card.why}
        </span>
      </span>
    </Link>
  );
}

