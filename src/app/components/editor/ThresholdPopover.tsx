'use client';

// app/components/editor/ThresholdPopover.tsx
//
// §133 — lightweight anchored popover shown when a creator clicks
// "Check & Polish" before the page clears the batching minimum. Deliberately
// NOT a modal and NOT a toast: it points at the button it explains, auto-
// dismisses, and never steals focus mid-writing-flow.

import { useEffect, useRef } from 'react';
import { CircleAlert } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function ThresholdPopover({ open, onClose, anchorRef }: Props) {
  const popRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss + outside-click/Escape dismissal. Every listener and timer
  // is cleaned up so the editor can't leak.
  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return; // button handles its own toggle
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const timer = setTimeout(onClose, 7000);

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popRef}
      role="status"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 10px)',
        left: '0',
        width: 'min(340px, 84vw)',
        zIndex: 40,
        display: 'flex',
        gap: '8px',
        padding: '11px 13px',
        borderRadius: '11px',
        background: 'var(--bg-card)',
        border: '1px solid rgba(217,119,6,0.45)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.4)',
        fontSize: '12px',
        lineHeight: 1.55,
        color: 'var(--text-secondary)',
        animation: 'wm-pop-in .16s ease-out',
      }}
    >
      <CircleAlert size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
      <span>
        Highlight at least 300 words (or 1 full page) for AI batch polishing to save token
        execution.
      </span>
      <style>{`
        @keyframes wm-pop-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
