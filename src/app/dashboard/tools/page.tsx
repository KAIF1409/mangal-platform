'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import Link from 'next/link';
import ProductScopeSwitcher, { ProductScope } from '../../components/shared/ProductScope';
import {
  Upload, PenTool, BarChart3, Globe, CalendarClock, Wrench,
  PlaySquare as PlaySquareIcon, Bookmark, Captions,
  type LucideIcon,
} from 'lucide-react';

import { setPostLoginRedirect } from '../../lib/auth/authRedirect';

// Tools retrofit per CONTEXT.md §43. Unlike Academy/Nova this tab links to
// real routes, so getting the per-product hrefs right matters — WebMangal's
// two live tools already existed (/upload, /dashboard); KaTube and Kalpana
// Circle get their own live tools pointing at their real, already-shipped
// routes (/katube/upload, /katube/dashboard, /kalpana-circle,
// /kalpana-circle/saved). Nothing here is a new route — this only surfaces
// existing pages as "tools" plus the same still-unbuilt utility tools
// (word counter, translation, scheduler) marked SOON per product.

interface Tool {
  icon: LucideIcon;
  title: string;
  desc: string;
  href: string;
  live: boolean;
}

type ProductKey = 'webmangal' | 'katube' | 'kcircle';

const TOOLS_BY_PRODUCT: Record<ProductKey, { label: string; icon: LucideIcon; tools: Tool[] }> = {
  webmangal: {
    label: 'WebMangal', icon: PenTool,
    tools: [
      { icon: Upload, title: 'Chapter Uploader', desc: 'Publish a new chapter to any of your series.', href: '/WebMangal/upload', live: true },
      { icon: PenTool, title: 'Series Editor', desc: 'Edit titles, synopsis, cover and genre from your dashboard.', href: '/dashboard', live: true },
      { icon: BarChart3, title: 'Word Counter', desc: 'Chapter length + read-time live in the chapter editor.', href: '/WebMangal/upload', live: true },
      { icon: Globe, title: 'Translation Helper', desc: 'Hinglish→English conversion in the AI Writer.', href: '/mangal-studio/webmangal/write', live: true },
      { icon: CalendarClock, title: 'Release Scheduler', desc: 'Queue chapters to publish automatically on a schedule.', href: '#', live: false },
    ],
  },
  katube: {
    label: 'KaTube', icon: PlaySquareIcon,
    tools: [
      { icon: Upload, title: 'Video Uploader', desc: 'Upload a new video or Short to your channel.', href: '/katube/upload', live: true },
      { icon: PlaySquareIcon, title: 'Channel Dashboard', desc: 'Manage your uploads, verification and channel details.', href: '/mangal-studio/katube', live: true },
      { icon: Captions, title: 'Auto Captions', desc: 'Generate captions for your videos automatically.', href: '#', live: false },
      { icon: CalendarClock, title: 'Release Scheduler', desc: 'Queue videos to publish automatically on a schedule.', href: '#', live: false },
    ],
  },
  kcircle: {
    label: 'Kalpana Circle', icon: Bookmark,
    tools: [
      { icon: PenTool, title: 'Compose a Post', desc: 'Write a theory, fan art post or discussion in the Circle feed.', href: '/kalpana-circle', live: true },
      { icon: Bookmark, title: 'Saved Posts', desc: 'Review posts you\u2019ve bookmarked from the feed.', href: '/kalpana-circle/saved', live: true },
      { icon: CalendarClock, title: 'Release Scheduler', desc: 'Queue posts to publish automatically on a schedule.', href: '#', live: false },
    ],
  },
};

const SUB: Record<ProductScope, string> = {
  all: 'Everything you need to write, upload and manage your work.',
  webmangal: 'Everything you need to write, publish and manage your stories.',
  katube: 'Everything you need to upload, edit and manage your videos.',
  kcircle: 'Everything you need to post and manage your Kalpana Circle activity.',
};

export default function ToolsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<ProductScope>('all');

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setPostLoginRedirect(window.location.pathname);
        window.location.href = '/login';
        return;
      }
      setUser(data.user);
      setLoading(false);
    };
    init();
  }, []);

  const visibleProducts: ProductKey[] = useMemo(
    () => (scope === 'all' ? ['webmangal', 'katube', 'kcircle'] : [scope]),
    [scope]
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <div style={{ flex: 1, maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Wrench size={12} strokeWidth={2.5} /> TOOLS
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>Creator Tools</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 24px' }}>
          {SUB[scope]}
        </p>

        <ProductScopeSwitcher value={scope} onChange={setScope} />

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <>
            {visibleProducts.map((p) => {
              const { label, icon: ProductIcon, tools } = TOOLS_BY_PRODUCT[p];
              return (
                <div key={p} style={{ marginBottom: '32px' }}>
                  {scope === 'all' && (
                    <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ProductIcon size={14} strokeWidth={2} /> {label}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '12px' }}>
                    {tools.map((tool) => (
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
                        <div style={{ marginBottom: '10px', color: 'var(--accent)' }}><tool.icon size={22} strokeWidth={1.75} /></div>
                        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '5px' }}>{tool.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{tool.desc}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
