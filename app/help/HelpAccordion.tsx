'use client';

import { useState } from 'react';

interface FaqItem {
  q: string;
  a: string;
}

interface FaqSection {
  title: string;
  items: FaqItem[];
}

export default function HelpAccordion({ sections }: { sections: FaqSection[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
      {sections.map(section => (
        <div key={section.title}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 14px', letterSpacing: '-0.01em' }}>
            {section.title}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {section.items.map(item => {
              const key = `${section.title}::${item.q}`;
              const open = openKey === key;
              return (
                <div
                  key={key}
                  style={{
                    borderRadius: '10px', border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)', overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setOpenKey(open ? null : key)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '14px 16px',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                      fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)',
                      fontFamily: 'inherit',
                    }}
                  >
                    {item.q}
                    <span style={{
                      flexShrink: 0, fontSize: '13px', color: 'var(--text-tertiary)',
                      transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
                    }}>▾</span>
                  </button>
                  {open && (
                    <div style={{
                      padding: '0 16px 16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65,
                    }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
