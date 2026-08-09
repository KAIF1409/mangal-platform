'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface TagWithCount {
  id: string;
  name: string;
  slug: string;
  count: number;
}

export default function TagsIndexPage() {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Single embedded-count query — same pattern as chapter counts on the
      // homepage, avoids an N+1 loop over every tag.
      const { data } = await supabase
        .from('tags')
        .select('id, name, slug, series_tags(count)')
        .order('name');
      if (data) {
        const withCounts = data
          .map((t: any) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            count: Array.isArray(t.series_tags) ? (t.series_tags[0]?.count ?? 0) : 0,
          }))
          .sort((a, b) => b.count - a.count);
        setTags(withCounts);
      }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#07070a', color: '#f9fafb' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '48px 24px' }}>
        <a href="/home" style={{ fontSize: '12px', color: '#6b7280', textDecoration: 'none' }}>← Back to MANGAL</a>
        <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 900, margin: '12px 0 8px', letterSpacing: '-0.02em' }}>
          Browse by Tag
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 32px' }}>
          Find your next read by the tropes and themes you're in the mood for.
        </p>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#374151' }}>Loading tags...</div>
        ) : tags.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#374151' }}>No tags yet.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {tags.map(tag => (
              <a
                key={tag.id}
                href={`/tags/${tag.slug}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  fontSize: '13px', fontWeight: 700, color: '#e5e7eb',
                  background: '#0d0d14', border: '1px solid #1a1a26',
                  padding: '10px 16px', borderRadius: '24px', textDecoration: 'none',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(217,119,6,0.5)'; (e.currentTarget as HTMLElement).style.color = '#d97706'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#1a1a26'; (e.currentTarget as HTMLElement).style.color = '#e5e7eb'; }}
              >
                #{tag.name}
                <span style={{ fontSize: '11px', color: '#4b5563', fontWeight: 600 }}>{tag.count}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
