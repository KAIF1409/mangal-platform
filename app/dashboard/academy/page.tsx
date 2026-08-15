'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { GraduationCap } from 'lucide-react';

import { setPostLoginRedirect } from '../../lib/authRedirect';
interface Article {
  title: string;
  blurb: string;
  tag: string;
}

const ARTICLES: Article[] = [
  { tag: 'Getting Started', title: 'How to publish your first chapter', blurb: 'A quick walkthrough of formatting, cover art, and going live.' },
  { tag: 'Growth', title: 'Why consistent upload schedules matter', blurb: 'Readers follow series that show up reliably — here is how to plan one.' },
  { tag: 'Writing', title: 'Hooking readers in the first 500 words', blurb: 'Opening lines that make people tap "next chapter" instead of leaving.' },
  { tag: 'Community', title: 'Turning comments into loyal readers', blurb: 'Simple ways to reply to your audience without burning out.' },
];

export default function AcademyPage() {
  const [user, setUser] = useState<User | null>(null);
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
      setLoading(false);
    };
    init();
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navbar />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <GraduationCap size={12} strokeWidth={2.5} /> ACADEMY
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>Creator Academy</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 32px' }}>
          Guides and tips to help you grow as a storyteller on Mangal.
        </p>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {ARTICLES.map((a) => (
              <div key={a.title} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: '12px', padding: '18px 20px', cursor: 'default',
              }}>
                <div style={{
                  display: 'inline-block', fontSize: '10px', fontWeight: 800, color: 'var(--accent)',
                  background: 'rgba(var(--accent-rgb), 0.12)', padding: '3px 8px', borderRadius: '6px', marginBottom: '10px',
                }}>
                  {a.tag}
                </div>
                <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '5px' }}>{a.title}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{a.blurb}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
