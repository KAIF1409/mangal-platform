'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Link from 'next/link';

interface Tool {
  icon: string;
  title: string;
  desc: string;
  href: string;
  live: boolean;
}

const TOOLS: Tool[] = [
  { icon: '📤', title: 'Chapter Uploader', desc: 'Publish a new chapter to any of your series.', href: '/upload', live: true },
  { icon: '🖋️', title: 'Series Editor', desc: 'Edit titles, synopsis, cover and genre from your dashboard.', href: '/dashboard', live: true },
  { icon: '📊', title: 'Word Counter', desc: 'Check chapter length before publishing.', href: '#', live: false },
  { icon: '🌐', title: 'Translation Helper', desc: 'Draft chapters in multiple languages.', href: '#', live: false },
  { icon: '🗓️', title: 'Release Scheduler', desc: 'Queue chapters to publish automatically on a schedule.', href: '#', live: false },
];

export default function ToolsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = '/login';
        return;
      }
      setUser(data.user);
      setLoading(false);
    };
    init();
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px' }}>
          🧰 TOOLS
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>Creator Tools</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 32px' }}>
          Everything you need to write, publish and manage your stories.
        </p>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {TOOLS.map((tool) => (
              <Link
                key={tool.title}
                href={tool.live ? tool.href : '#'}
                style={{
                  display: 'block', background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '14px', padding: '20px', textDecoration: 'none', color: 'inherit',
                  opacity: tool.live ? 1 : 0.55, cursor: tool.live ? 'pointer' : 'default',
                  position: 'relative',
                }}
                onClick={(e) => { if (!tool.live) e.preventDefault(); }}
              >
                {!tool.live && (
                  <div style={{
                    position: 'absolute', top: '14px', right: '14px', fontSize: '9px', fontWeight: 800,
                    color: 'var(--text-tertiary)', background: 'var(--bg-input)', padding: '3px 7px', borderRadius: '6px',
                  }}>
                    SOON
                  </div>
                )}
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>{tool.icon}</div>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '5px' }}>{tool.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{tool.desc}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
