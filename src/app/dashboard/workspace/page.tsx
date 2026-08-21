'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/shared/Navbar';
import Footer from '../../components/shared/Footer';
import Link from 'next/link';
import ProductScopeSwitcher, { ProductScope } from '../../components/shared/ProductScope';
import { FolderOpen, BookOpen, ScrollText, Smartphone, PlaySquare, Users2, ArrowRight, type LucideIcon } from 'lucide-react';

import { setPostLoginRedirect } from '../../lib/auth/authRedirect';

interface DraftSeries {
  id: string;
  title: string;
  content_type: 'mangal' | 'novel';
  status: 'draft' | 'published';
  created_at: string;
}

interface KatubeVideo {
  id: string;
  title: string;
  is_short: boolean;
  views: number;
  created_at: string;
}

interface KcirclePost {
  id: string;
  caption: string | null;
  tag: string | null;
  created_at: string;
}

// One workspace item shape all three products get flattened into, so the
// list below doesn't need three separate render branches.
type WorkItem = {
  id: string;
  product: Exclude<ProductScope, 'all'>;
  title: string;
  meta: string;
  icon: LucideIcon;
  created_at: string;
  href: string;
};

export default function WorkspacePage() {
  const [user, setUser] = useState<User | null>(null);
  const [drafts, setDrafts] = useState<DraftSeries[]>([]);
  const [videos, setVideos] = useState<KatubeVideo[]>([]);
  const [posts, setPosts] = useState<KcirclePost[]>([]);
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

      const [seriesRes, videosRes, postsRes] = await Promise.all([
        supabase
          .from('series')
          .select('id, title, content_type, status, created_at')
          .eq('creator_id', data.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('videos')
          .select('id, title, is_short, views, created_at')
          .eq('creator_id', data.user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('kcircle_posts')
          .select('id, caption, tag, created_at')
          .eq('author_id', data.user.id)
          .order('created_at', { ascending: false }),
      ]);

      setDrafts(seriesRes.data || []);
      setVideos(videosRes.data || []);
      setPosts(postsRes.data || []);
      setLoading(false);
    };
    init();
  }, []);

  const items: WorkItem[] = useMemo(() => {
    const fromSeries: WorkItem[] = drafts.map((d) => ({
      id: `series-${d.id}`,
      product: 'webmangal',
      title: d.title,
      meta: `${d.content_type === 'novel' ? 'Novel' : 'Mangal'} · ${d.status === 'draft' ? 'Draft' : 'Published'}`,
      icon: d.content_type === 'novel' ? BookOpen : ScrollText,
      created_at: d.created_at,
      href: '/dashboard',
    }));
    const fromVideos: WorkItem[] = videos.map((v) => ({
      id: `video-${v.id}`,
      product: 'katube',
      title: v.title,
      meta: `${v.is_short ? 'Short' : 'Video'} · ${v.views} views`,
      icon: v.is_short ? Smartphone : PlaySquare,
      created_at: v.created_at,
      href: '/mangal-studio/katube',
    }));
    const fromPosts: WorkItem[] = posts.map((p) => ({
      id: `post-${p.id}`,
      product: 'kcircle',
      title: p.caption?.trim() ? p.caption.slice(0, 60) : 'Untitled post',
      meta: `Post${p.tag ? ` · #${p.tag}` : ''}`,
      icon: Users2,
      created_at: p.created_at,
      href: '/kalpana-circle',
    }));

    const all = [...fromSeries, ...fromVideos, ...fromPosts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return scope === 'all' ? all : all.filter((i) => i.product === scope);
  }, [drafts, videos, posts, scope]);

  const emptyCopy: Record<ProductScope, { title: string; sub: string; cta: string; href: string }> = {
    all: {
      title: 'Nothing here yet',
      sub: 'Start a new series, upload a video, or post to Kalpana Circle — it will show up here automatically.',
      cta: '+ Start a Series',
      href: '/WebMangal/upload',
    },
    webmangal: {
      title: 'No WebMangal series yet',
      sub: 'Start a new series and it will show up in your workspace automatically.',
      cta: '+ Start a Series',
      href: '/WebMangal/upload',
    },
    katube: {
      title: 'No KaTube uploads yet',
      sub: 'Upload a video or Short from your KaTube dashboard to see it here.',
      cta: 'Go to KaTube Dashboard',
      href: '/mangal-studio/katube',
    },
    kcircle: {
      title: 'No Kalpana Circle posts yet',
      sub: 'Share a post in Kalpana Circle and it will show up in your workspace automatically.',
      cta: 'Open Kalpana Circle',
      href: '/kalpana-circle',
    },
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <FolderOpen size={12} strokeWidth={2.5} /> MY WORKSPACE
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>Where your work lives</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 24px' }}>
          Every series, video, and post you own, across every MANGAL product — jump back in whenever you&apos;re ready.
        </p>

        <ProductScopeSwitcher value={scope} onChange={setScope} />

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading your workspace…</div>
        ) : items.length === 0 ? (
          <div style={{
            border: '1px dashed var(--border-color)', borderRadius: '14px', padding: '50px 20px',
            textAlign: 'center', background: 'var(--bg-card)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-tertiary)', marginBottom: '10px' }}><FolderOpen size={34} strokeWidth={1.5} /></div>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>{emptyCopy[scope].title}</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', marginBottom: '18px' }}>
              {emptyCopy[scope].sub}
            </div>
            <Link href={emptyCopy[scope].href} style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: '8px',
              background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '13px', textDecoration: 'none',
            }}>
              {emptyCopy[scope].cta}
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {items.map((item) => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 18px', borderRadius: '12px', background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <item.icon size={18} strokeWidth={1.75} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{item.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '3px' }}>
                      {item.meta}
                    </div>
                  </div>
                </div>
                <Link href={item.href} style={{
                  fontSize: '12px', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                }}>
                  Open <ArrowRight size={12} strokeWidth={2} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
