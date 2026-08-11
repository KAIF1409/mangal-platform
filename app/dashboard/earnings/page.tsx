'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

import { setPostLoginRedirect } from '../../lib/authRedirect';
function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '12px', padding: '18px 20px',
    }}>
      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 900 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

export default function EarningsPage() {
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
        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px' }}>
          💰 EARNINGS
        </div>
        <h1 style={{ fontSize: '30px', fontWeight: 900, margin: '0 0 8px' }}>Your Earnings</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px', margin: '0 0 32px' }}>
          Track what your stories have earned and request a payout once you cross the minimum threshold.
        </p>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading earnings…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '28px' }}>
              <StatBox label="Total Earned" value="₹0" sub="+0.00% this month" />
              <StatBox label="Available to Withdraw" value="₹0" />
              <StatBox label="Pending" value="₹0" />
              <StatBox label="Lifetime Payouts" value="₹0" />
            </div>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: '12px', padding: '24px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
            }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>No earnings yet</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  Publish chapters and grow your readers to start earning from your stories.
                </div>
              </div>
              <button
                disabled
                style={{
                  padding: '10px 18px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  background: 'transparent', color: 'var(--text-faint)', fontWeight: 700, fontSize: '13px',
                  cursor: 'not-allowed',
                }}
              >
                Request Payout
              </button>
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
