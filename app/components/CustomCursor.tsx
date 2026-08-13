'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

// ── Custom cursor dot ──
// Desktop-only by design: bails out entirely (renders nothing, adds no
// listeners) on touch/coarse-pointer devices — a fixed-position dot has no
// meaning on a touchscreen and would just sit uselessly over content — and
// on prefers-reduced-motion, matching ParticleField's convention. Any
// element with data-cursor-hover="true" grows the dot into a ring, giving
// the "hovering something interactive" cue the reference design uses on
// links/buttons/cards.
export default function CustomCursor() {
  // `enabled` must start false on both server and client — the check
  // itself needs `window.matchMedia`, which doesn't exist during SSR, so
  // it can only run after mount. That means it genuinely has to be a
  // setState-in-effect: computing it during render would either crash on
  // the server or (if guarded) return a different value server vs. client
  // and desync the hydration. The lint rule below assumes the value is
  // derivable during render, which isn't true for a browser-only media
  // query — this is the documented escape hatch for that case, not a
  // bypass of a real issue.
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const springX = useSpring(x, { stiffness: 500, damping: 40, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 500, damping: 40, mass: 0.4 });

  useEffect(() => {
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canHover || reduceMotion) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above `enabled`'s declaration: this value is only derivable client-side (matchMedia), so it can't be computed during render without desyncing SSR/CSR hydration.
    setEnabled(true);

    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const target = e.target as HTMLElement;
      setHovering(!!target.closest('[data-cursor-hover="true"]'));
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [x, y]);

  if (!enabled) return null;

  return (
    <motion.div
      aria-hidden="true"
      style={{
        position: 'fixed', top: 0, left: 0, zIndex: 9998,
        pointerEvents: 'none', translateX: springX, translateY: springY,
      }}
    >
      <motion.div
        animate={{
          width: hovering ? 44 : 10,
          height: hovering ? 44 : 10,
          x: hovering ? -22 : -5,
          y: hovering ? -22 : -5,
          backgroundColor: hovering ? 'rgba(217,119,6,0.12)' : 'rgba(217,119,6,0.9)',
          border: hovering ? '1.5px solid rgba(217,119,6,0.8)' : '1.5px solid transparent',
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{ borderRadius: '50%' }}
      />
    </motion.div>
  );
}
