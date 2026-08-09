'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

interface Tier {
  name: string;
  requirement: string;
  benefits: string[];
  active: boolean;
}

const TIERS: Tier[] = [
  { name: 'Starter', requirement: 'Every creator', active: true, benefits: ['Publish unlimited chapters', 'Basic analytics', 'Community forum access'] },
  { name: 'Rising', requirement: '1,000+ total readers', active: false, benefits: ['Priority review for featured slots', 'Advanced analytics', 'Early access to new tools'] },
  { name: 'Elite', requirement: '10,000+ total readers', active: false, benefits: ['Dedicated support line', 'Custom series branding', 'Revenue share bonus'] },
];

export default function PerksPage() {
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
          🎁 PERKS
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>Creator Perks</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 32px' }}>
          Unlock more benefits as your stories grow their readership.
        </p>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            {TIERS.map((tier) => (
              <div key={tier.name} style={{
                background: 'var(--bg-card)',
                border: tier.active ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                borderRadius: '14px', padding: '22px', position: 'relative',
              }}>
                {tier.active && (
                  <div style={{
                    position: 'absolute', top: '14px', right: '14px', fontSize: '10px', fontWeight: 800,
                    color: 'var(--accent)', background: 'rgba(var(--accent-rgb), 0.12)', padding: '3px 8px', borderRadius: '6px',
                  }}>
                    CURRENT
                  </div>
                )}
                <div style={{ fontWeight: 800, fontSize: '17px', marginBottom: '4px' }}>{tier.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>{tier.requirement}</div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '8px' }}>
                  {tier.benefits.map((b) => (
                    <li key={b} style={{ fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--accent)' }}>✓</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
