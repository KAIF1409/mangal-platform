'use client';

import { useState, useEffect, useRef } from 'react';

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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const shareText = `Check out "${title}" on MANGAL — read free! ${url}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
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
        {compact ? '↗' : <>↗ Share</>}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
          background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '10px',
          minWidth: '180px', overflow: 'hidden',
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
            <span style={{ fontSize: '16px' }}>💬</span> Share on WhatsApp
          </a>
          <button
            onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
              padding: '12px 14px', fontSize: '13px', fontWeight: 600,
              color: copied ? '#22c55e' : 'var(--text-primary)', background: 'transparent',
              border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: '16px' }}>{copied ? '✓' : '🔗'}</span> {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      )}
    </div>
  );
}