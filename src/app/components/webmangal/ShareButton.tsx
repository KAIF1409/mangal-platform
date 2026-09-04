'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Share2, MessageCircle, Link2, Check } from 'lucide-react';

interface ShareButtonProps {
  /** e.g. series title, or "Series Name — Chapter 4" for the reader view */
  title: string;
  /** Full absolute URL to share. Pass window.location.href or build it explicitly. */
  url: string;
  /** Optional — overrides the small pill button with a compact icon-only variant for tight headers (reader top bar) */
  compact?: boolean;
}

export default function ShareButton({ title, url, compact = false }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // BUG FIX (founder-reported, K Circle post cards): this menu used to be
  // an absolutely-positioned child of the trigger button. Any ancestor
  // with `overflow: hidden` (e.g. K Circle's post card, clipped for
  // rounded image corners) silently clipped it — the menu opened but
  // rendered invisible/cut off. Now portaled to document.body and
  // positioned from the trigger's actual on-screen rect via `fixed`
  // coordinates, so it always renders above everything, regardless of
  // what ancestor containers do with overflow.
  //
  // FOLLOW-UP FIX (same report, round 2): the portal fix alone still let
  // the menu render past the bottom edge of the actual browser viewport
  // when the trigger was near the bottom of the page (menu opens
  // downward unconditionally) — same visual symptom, different cause.
  // Now flips upward when there isn't enough room below.
  const toggleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = 200;
      const menuHeight = 92; // 2 rows, ~44-46px each
      let left = rect.right - menuWidth;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      const opensBelow = rect.bottom + 8 + menuHeight <= window.innerHeight;
      const top = opensBelow ? rect.bottom + 8 : Math.max(8, rect.top - 8 - menuHeight);
      setMenuPos({ top, left });
    }
    setOpen(o => !o);
  };

  const shareText = `Check out "${title}" on MANGAL — read free! ${url}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const [copyFailed, setCopyFailed] = useState(false);

  // BUG FIX: this used to call navigator.clipboard.writeText(url) directly
  // with no guard. The Clipboard API is unavailable (navigator.clipboard
  // is undefined, so even the property access throws synchronously) in a
  // meaningful slice of real traffic for THIS exact button — WhatsApp's
  // and Instagram's in-app browsers (Android WebViews) don't support it,
  // and this menu's other option is literally "Share on WhatsApp". A
  // failure here used to be a silent no-op (or an uncaught exception) —
  // no "Copied!" confirmation and no indication anything went wrong. Now:
  // fall back to the legacy execCommand('copy') path, and if that ALSO
  // fails, show a visible "Couldn't copy" state instead of silence.
  function handleCopy() {
    const legacyFallback = () => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (ok) {
          setCopied(true);
          setCopyFailed(false);
          setTimeout(() => setCopied(false), 2000);
        } else {
          setCopyFailed(true);
          setTimeout(() => setCopyFailed(false), 3000);
        }
      } catch {
        setCopyFailed(true);
        setTimeout(() => setCopyFailed(false), 3000);
      }
    };

    if (!navigator.clipboard?.writeText) {
      legacyFallback();
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setCopyFailed(false);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(legacyFallback);
  }

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={triggerRef}
        onClick={toggleOpen}
        style={compact ? {
          width: '36px', height: '36px', borderRadius: '8px',
          background: 'var(--bg-card)', border: '1px solid var(--border-light)',
          color: 'var(--text-primary)', fontSize: '15px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        } : {
          padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
          color: '#22c55e', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}
      >
        {compact ? <Share2 size={15} strokeWidth={2} /> : <><Share2 size={14} strokeWidth={2} /> Share</>}
      </button>

      {open && menuPos && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={{
          position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 1000,
          background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '10px',
          minWidth: '200px', overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 14px', fontSize: '13px', fontWeight: 600,
              color: 'var(--text-primary)', textDecoration: 'none',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <MessageCircle size={16} strokeWidth={2} /> Share on WhatsApp
          </a>
          <button
            onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
              padding: '12px 14px', fontSize: '13px', fontWeight: 600,
              color: copyFailed ? '#ef4444' : copied ? '#22c55e' : 'var(--text-primary)', background: 'transparent',
              border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            {copied ? <Check size={16} strokeWidth={2} /> : <Link2 size={16} strokeWidth={2} />} {copyFailed ? "Couldn't copy — try again" : copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}