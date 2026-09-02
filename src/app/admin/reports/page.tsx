'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { isDeveloperRole } from '../../lib/auth/roles';
import Link from 'next/link';
import { Lock, Flag, Inbox, Bot, CheckCircle2, Check, AlertTriangle, Trash2, Ban } from 'lucide-react';


import { setPostLoginRedirect } from '../../lib/auth/authRedirect';
interface Report {
  id: string;
  target_type: 'series' | 'chapter' | 'comment' | 'video';
  target_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: 'open' | 'reviewed' | 'dismissed';
  created_at: string;
  is_auto_flagged: boolean;
}

interface ActionState {
  removeConfirm: boolean;
  banConfirm: boolean;
  removing: boolean;
  banning: boolean;
  removed: boolean;
  banned: boolean;
}

const defaultActionState = (): ActionState => ({
  removeConfirm: false, banConfirm: false,
  removing: false, banning: false,
  removed: false, banned: false,
});

// §139-A11 — page size for the §82 `.range()` + "Load more" pattern. The
// reports table only ever grows, and this page used to fetch every report
// ever filed on every visit; admin-only doesn't make that unbounded list OK.
const REPORTS_PAGE_SIZE = 50;

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'reviewed' | 'dismissed'>('open');
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  // §139-A11 — true total (count:'exact') + load-more flag.
  const [reportsTotal, setReportsTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setPostLoginRedirect(window.location.pathname); window.location.href = '/login'; return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', u.user.id)
        .single();

      if (!isDeveloperRole(profile?.role)) {
        setAllowed(false);
        setLoading(false);
        return;
      }
      setAllowed(true);

      // §139-A11 — newest page only; older pages load via loadMoreReports().
      const { data, count } = await supabase
        .from('reports')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(0, REPORTS_PAGE_SIZE - 1);
      if (data) {
        setReports(data);
        const states: Record<string, ActionState> = {};
        data.forEach((r: Report) => { states[r.id] = defaultActionState(); });
        setActionStates(states);
      }
      if (typeof count === 'number') setReportsTotal(count);
      setLoading(false);
    };
    load();
  }, []);

  // §139-A11 — next page of reports. Offsets can shift when new reports land
  // mid-view, so the append de-dupes by id and registers fresh action states.
  const loadMoreReports = async () => {
    if (loadingMore) return;
    const total = reportsTotal ?? reports.length;
    if (reports.length >= total) return;
    setLoadingMore(true);
    const { data } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .range(reports.length, reports.length + REPORTS_PAGE_SIZE - 1);
    if (data && data.length > 0) {
      const known = new Set(reports.map(r => r.id));
      const fresh = (data as Report[]).filter(r => !known.has(r.id));
      setReports(rs => [...rs, ...fresh]);
      setActionStates(prev => {
        const next = { ...prev };
        fresh.forEach(r => { if (!next[r.id]) next[r.id] = defaultActionState(); });
        return next;
      });
    }
    setLoadingMore(false);
  };

  const patchAction = (id: string, patch: Partial<ActionState>) =>
    setActionStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const updateStatus = async (id: string, status: Report['status']) => {
    setReports(rs => rs.map(r => (r.id === id ? { ...r, status } : r)));
    await supabase.from('reports').update({ status }).eq('id', id);
  };

  const handleRemoveContent = async (r: Report) => {
    if (!actionStates[r.id]?.removeConfirm) {
      patchAction(r.id, { removeConfirm: true, banConfirm: false });
      return;
    }
    patchAction(r.id, { removing: true });

    const table =
      r.target_type === 'series' ? 'series'
      : r.target_type === 'chapter' ? 'chapters'
      : r.target_type === 'video' ? 'videos'
      : 'comments';

    const { error } = await supabase.from(table).delete().eq('id', r.target_id);

    if (error) {
      patchAction(r.id, { removing: false, removeConfirm: false });
      alert(`Failed to remove content: ${error.message}`);
      return;
    }

    await supabase
      .from('reports')
      .update({ status: 'reviewed' })
      .eq('target_type', r.target_type)
      .eq('target_id', r.target_id);

    setReports(rs =>
      rs.map(rep =>
        rep.target_type === r.target_type && rep.target_id === r.target_id
          ? { ...rep, status: 'reviewed' }
          : rep
      )
    );
    patchAction(r.id, { removing: false, removeConfirm: false, removed: true });
  };

  const handleBanUser = async (r: Report) => {
    if (!actionStates[r.id]?.banConfirm) {
      patchAction(r.id, { banConfirm: true, removeConfirm: false });
      return;
    }
    patchAction(r.id, { banning: true });

    let userId: string | null = null;

    if (r.target_type === 'series') {
      const { data } = await supabase
        .from('series')
        .select('creator_id')
        .eq('id', r.target_id)
        .single();
      userId = data?.creator_id ?? null;
    } else if (r.target_type === 'chapter') {
      const { data: ch } = await supabase
        .from('chapters')
        .select('series_id')
        .eq('id', r.target_id)
        .single();
      if (ch?.series_id) {
        const { data: s } = await supabase
          .from('series')
          .select('creator_id')
          .eq('id', ch.series_id)
          .single();
        userId = s?.creator_id ?? null;
      }
    } else if (r.target_type === 'comment') {
      const { data } = await supabase
        .from('comments')
        .select('reader_id')        // FIXED: was author_id, actual column is reader_id
        .eq('id', r.target_id)
        .single();
      userId = data?.reader_id ?? null;  // FIXED
    } else if (r.target_type === 'video') {
      const { data } = await supabase
        .from('videos')
        .select('creator_id')
        .eq('id', r.target_id)
        .single();
      userId = data?.creator_id ?? null;
    }

    if (!userId) {
      patchAction(r.id, { banning: false, banConfirm: false });
      alert('Could not find the user to ban — they may have already been deleted.');
      return;
    }

    // Server-verified RPC (checks the caller is actually a developer)
    // instead of updating another user's row directly - see the security
    // migration for why the old direct update never actually worked.
    const { error } = await supabase.rpc('admin_set_account_active', {
      p_target_user_id: userId,
      p_active: false,
    });

    if (error) {
      patchAction(r.id, { banning: false, banConfirm: false });
      alert(`Failed to ban user: ${error.message}`);
      return;
    }

    await supabase.from('reports').update({ status: 'reviewed' }).eq('id', r.id);
    setReports(rs => rs.map(rep => rep.id === r.id ? { ...rep, status: 'reviewed' } : rep));
    patchAction(r.id, { banning: false, banConfirm: false, banned: true });
  };

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', }}>
        Loading...
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: 'var(--text-tertiary)' }}><Lock size={32} strokeWidth={1.5} /></div>
          <div>This page is for developers only.</div>
          <Link href="/" style={{ color: '#d97706', textDecoration: 'none', fontSize: '13px', marginTop: '8px', display: 'block' }}>&larr; Back to Browse</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}><Flag size={20} strokeWidth={2} /> Reports</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: '0 0 24px' }}>
          {reports.filter(r => r.status === 'open').length} open &middot; {reportsTotal ?? reports.length} total
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {(['open', 'reviewed', 'dismissed', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                textTransform: 'capitalize', cursor: 'pointer',
                border: filter === f ? '1px solid #d97706' : '1px solid var(--border-color)',
                background: filter === f ? 'rgba(217,119,6,0.12)' : 'var(--bg-card)',
                color: filter === f ? '#d97706' : 'var(--text-secondary)',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: 'var(--text-muted)' }}><Inbox size={32} strokeWidth={1.5} /></div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>No {filter !== 'all' ? filter : ''} reports.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map(r => {
              const as = actionStates[r.id] ?? defaultActionState();
              return (
                <div key={r.id} style={{
                  padding: '16px 18px', borderRadius: '12px',
                  background: 'var(--bg-card)', border: `1px solid ${as.removed || as.banned ? 'rgba(16,185,129,0.3)' : 'var(--border-color)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, color: '#d97706', background: 'rgba(120,53,15,0.25)',
                        border: '1px solid rgba(180,83,9,0.4)', padding: '3px 9px', borderRadius: '12px',
                        textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '8px',
                      }}>
                        {r.target_type}
                      </span>
                      {r.is_auto_flagged && (
                        <span style={{
                          fontSize: '9px', fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.12)',
                          border: '1px solid rgba(168,85,247,0.35)', padding: '3px 9px', borderRadius: '12px',
                          textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '8px',
                        }} title="Created automatically by KaTube's upload-time moderation checks, not a user report">
                          <Bot size={11} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Auto-flagged
                        </span>
                      )}
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{r.reason}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        background: r.status === 'open' ? 'rgba(239,68,68,0.12)' : r.status === 'reviewed' ? 'rgba(16,185,129,0.12)' : 'var(--border-color)',
                        color: r.status === 'open' ? '#ef4444' : r.status === 'reviewed' ? '#10b981' : 'var(--text-tertiary)',
                        border: r.status === 'open' ? '1px solid rgba(239,68,68,0.3)' : r.status === 'reviewed' ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border-color)',
                      }}>
                        {r.status}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: r.details ? '8px' : '12px' }}>
                    target_id: <span style={{ color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{r.target_id}</span>
                  </div>

                  {r.details && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>{r.details}</p>
                  )}

                  {as.removed && (
                    <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: '12px', marginBottom: '10px' }}>
                      <CheckCircle2 size={13} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '5px' }} />Content removed successfully.
                    </div>
                  )}
                  {as.banned && (
                    <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', fontSize: '12px', marginBottom: '10px' }}>
                      <CheckCircle2 size={13} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '5px' }} />User banned — account_active set to false.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => updateStatus(r.id, 'reviewed')}
                      disabled={r.status === 'reviewed'}
                      style={{
                        padding: '6px 12px', borderRadius: '7px', fontSize: '11px', fontWeight: 700,
                        cursor: r.status === 'reviewed' ? 'default' : 'pointer',
                        background: r.status === 'reviewed' ? 'var(--border-color)' : 'rgba(16,185,129,0.12)',
                        border: r.status === 'reviewed' ? '1px solid var(--border-color)' : '1px solid rgba(16,185,129,0.3)',
                        color: r.status === 'reviewed' ? 'var(--text-muted)' : '#10b981',
                      }}
                    >
                      <Check size={12} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Mark Reviewed
                    </button>

                    <button
                      onClick={() => updateStatus(r.id, 'dismissed')}
                      disabled={r.status === 'dismissed'}
                      style={{
                        padding: '6px 12px', borderRadius: '7px', fontSize: '11px', fontWeight: 700,
                        cursor: r.status === 'dismissed' ? 'default' : 'pointer',
                        background: r.status === 'dismissed' ? 'var(--border-color)' : 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: r.status === 'dismissed' ? 'var(--text-muted)' : 'var(--text-secondary)',
                      }}
                    >
                      Dismiss
                    </button>

                    {r.status !== 'open' && (
                      <button
                        onClick={() => updateStatus(r.id, 'open')}
                        style={{
                          padding: '6px 12px', borderRadius: '7px', fontSize: '11px', fontWeight: 700,
                          cursor: 'pointer', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                        }}
                      >
                        Reopen
                      </button>
                    )}

                    <div style={{ width: '1px', background: 'var(--border-color)', margin: '0 2px' }} />

                    {!as.removed && (
                      <button
                        onClick={() => handleRemoveContent(r)}
                        disabled={as.removing}
                        style={{
                          padding: '6px 12px', borderRadius: '7px', fontSize: '11px', fontWeight: 700,
                          cursor: as.removing ? 'not-allowed' : 'pointer',
                          background: as.removeConfirm ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.08)',
                          border: `1px solid ${as.removeConfirm ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.25)'}`,
                          color: '#ef4444',
                          transition: 'all 0.15s',
                        }}
                      >
                        {as.removing ? 'Removing…' : as.removeConfirm ? (<><AlertTriangle size={12} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Confirm Remove</>) : (<><Trash2 size={12} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Remove Content</>)}
                      </button>
                    )}

                    {!as.banned && (
                      <button
                        onClick={() => handleBanUser(r)}
                        disabled={as.banning}
                        style={{
                          padding: '6px 12px', borderRadius: '7px', fontSize: '11px', fontWeight: 700,
                          cursor: as.banning ? 'not-allowed' : 'pointer',
                          background: as.banConfirm ? 'rgba(220,38,38,0.25)' : 'rgba(127,29,29,0.15)',
                          border: `1px solid ${as.banConfirm ? 'rgba(220,38,38,0.7)' : 'rgba(127,29,29,0.4)'}`,
                          color: as.banConfirm ? '#fca5a5' : '#f87171',
                          transition: 'all 0.15s',
                        }}
                      >
                        {as.banning ? 'Banning…' : as.banConfirm ? (<><AlertTriangle size={12} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Confirm Ban</>) : (<><Ban size={12} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Ban User</>)}
                      </button>
                    )}

                    {(as.removeConfirm || as.banConfirm) && (
                      <button
                        onClick={() => patchAction(r.id, { removeConfirm: false, banConfirm: false })}
                        style={{
                          padding: '6px 12px', borderRadius: '7px', fontSize: '11px', fontWeight: 700,
                          cursor: 'pointer', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-tertiary)',
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {reportsTotal !== null && reports.length < reportsTotal && (
              <button
                onClick={loadMoreReports}
                disabled={loadingMore}
                style={{
                  alignSelf: 'center', marginTop: '8px', fontSize: '12px', fontWeight: 700,
                  cursor: loadingMore ? 'default' : 'pointer',
                  color: 'var(--text-secondary)', background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)', borderRadius: '20px', padding: '9px 18px',
                }}
              >
                {loadingMore ? 'Loading…' : `Load older reports (${reports.length}/${reportsTotal})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}