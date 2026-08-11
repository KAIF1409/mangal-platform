'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Link from 'next/link';

import { setPostLoginRedirect } from '../../lib/authRedirect';
interface DraftSeries {
  id: string;
  title: string;
  content_type: 'mangal' | 'novel';
  status: 'draft' | 'published';
  created_at: string;
}

export default function WorkspacePage() {
  const [user, setUser] = useState<User | null>(null);
  const [drafts, setDrafts] = useState<DraftSeries[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setPostLoginRedirect(window.location.pathname);
        window.location.href = '/login';
        return;
      }
      setUser(data.user);

      const { data: series } = await supabase
        .from('series')
        .select('id, title, content_type, status, created_at')
        .eq('creator_id', data.user.id)
        .order('created_at', { ascending: false });

      setDrafts(series || []);
      setLoading(false);
    };
    init();
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px' }}>
          🗂️ MY WORKSPACE
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>Where your work lives</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 32px' }}>
          Every series and draft you own, in one place — jump back in whenever you&apos;re ready.
        </p>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading your workspace…</div>
        ) : drafts.length === 0 ? (
          <div style={{
            border: '1px dashed var(--border-color)', borderRadius: '14px', padding: '50px 20px',
            textAlign: 'center', background: 'var(--bg-card)',
          }}>
            <div style={{ fontSize: '34px', marginBottom: '10px' }}>🗂️</div>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>Nothing here yet</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', marginBottom: '18px' }}>
              Start a new series and it will show up in your workspace automatically.
            </div>
            <Link href="/upload" style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: '8px',
              background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '13px', textDecoration: 'none',
            }}>
              + Start a Series
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {drafts.map((d) => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 18px', borderRadius: '12px', background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{d.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '3px' }}>
                    {d.content_type === 'novel' ? '📖 Novel' : '🖼️ Mangal'} · {d.status === 'draft' ? 'Draft' : 'Published'}
                  </div>
                </div>
                <Link href="/dashboard" style={{
                  fontSize: '12px', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none',
                }}>
                  Open →
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
