'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { isDeveloperRole } from '../../lib/auth/roles';
import Link from 'next/link';
import { Lock, HardDriveUpload, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { setPostLoginRedirect } from '../../lib/auth/authRedirect';

interface MigrateFailure {
  table: string;
  column: string;
  id: string;
  from: string;
  to: string;
  ok: boolean;
  error?: string;
}

interface BatchResult {
  processed: number;
  succeeded: number;
  failed: MigrateFailure[];
  hasMore: boolean;
}

export default function AdminMigrateMediaPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const [running, setRunning] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [batchesRun, setBatchesRun] = useState(0);
  const [totalSucceeded, setTotalSucceeded] = useState(0);
  const [allFailures, setAllFailures] = useState<MigrateFailure[]>([]);
  const [lastResult, setLastResult] = useState<BatchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setPostLoginRedirect(window.location.pathname);
        window.location.href = '/login';
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', u.user.id)
        .single();

      setAllowed(isDeveloperRole(profile?.role));
      setLoading(false);
    };
    load();
  }, []);

  const runOneBatch = async (): Promise<BatchResult> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('No active session — try logging out and back in.');

    const res = await fetch('/api/admin/migrate-media', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ batchSize: 25 }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `Request failed: ${res.status}`);
    }

    return res.json();
  };

  const handleRunUntilDone = async () => {
    setRunning(true);
    setStopRequested(false);
    stopRef.current = false;
    setErrorMsg(null);

    try {
      let hasMore = true;
      while (hasMore && !stopRef.current) {
        const result = await runOneBatch();
        setLastResult(result);
        setBatchesRun(n => n + 1);
        setTotalSucceeded(n => n + result.succeeded);
        if (result.failed.length) {
          setAllFailures(prev => [...prev, ...result.failed]);
        }
        hasMore = result.hasMore;
        // Nothing processed and nothing left to do — backlog is empty.
        if (result.processed === 0) hasMore = false;
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  };

  const handleStop = () => {
    stopRef.current = true;
    setStopRequested(true);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
        Loading...
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: 'var(--text-tertiary)' }}><Lock size={32} strokeWidth={1.5} /></div>
          <div>This page is for developers only.</div>
          <Link href="/" style={{ color: '#d97706', textDecoration: 'none', fontSize: '13px', marginTop: '8px', display: 'block' }}>&larr; Back to Browse</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HardDriveUpload size={20} strokeWidth={2} /> Migrate Media to R2
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: '0 0 24px', lineHeight: 1.6 }}>
          One-time backlog migration of old Supabase-hosted images (comic pages, avatars,
          K Circle attachments) into Cloudflare R2. Safe to run repeatedly — already-migrated
          rows are skipped. Runs 25 rows per batch and keeps going automatically until the
          backlog is empty, or until you hit Stop.
        </p>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {!running ? (
            <button
              onClick={handleRunUntilDone}
              style={{
                padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', border: '1px solid #d97706', background: 'rgba(217,119,6,0.12)',
                color: '#d97706', display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <HardDriveUpload size={15} strokeWidth={2} /> Run migration
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={stopRequested}
              style={{
                padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                cursor: stopRequested ? 'default' : 'pointer', border: '1px solid var(--border-color)',
                background: 'var(--bg-card)', color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <Loader2 size={15} strokeWidth={2} className="animate-spin" />
              {stopRequested ? 'Stopping after current batch…' : 'Stop after current batch'}
            </button>
          )}
        </div>

        {errorMsg && (
          <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '13px', marginBottom: '16px' }}>
            <XCircle size={13} strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
            {errorMsg}
          </div>
        )}

        {(batchesRun > 0 || running) && (
          <div style={{
            padding: '16px 18px', borderRadius: '12px', background: 'var(--bg-card)',
            border: '1px solid var(--border-color)', marginBottom: '20px',
          }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Batches run: <strong>{batchesRun}</strong> &middot; Files migrated: <strong style={{ color: '#10b981' }}>{totalSucceeded}</strong>
              {allFailures.length > 0 && (
                <> &middot; Failures: <strong style={{ color: '#ef4444' }}>{allFailures.length}</strong></>
              )}
            </div>
            {running && (
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 size={12} strokeWidth={2} className="animate-spin" /> Working…
              </div>
            )}
            {!running && lastResult && !lastResult.hasMore && lastResult.processed === 0 && (
              <div style={{ fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={13} strokeWidth={2} /> Backlog is empty — nothing left to migrate.
              </div>
            )}
          </div>
        )}

        {allFailures.length > 0 && (
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 10px', color: '#ef4444' }}>Failures</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {allFailures.map((f, i) => (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-card)',
                  border: '1px solid rgba(239,68,68,0.25)', fontSize: '11px', color: 'var(--text-tertiary)',
                  fontFamily: 'monospace', wordBreak: 'break-all',
                }}>
                  <div>{f.table}.{f.column} — id {f.id}</div>
                  <div style={{ color: '#ef4444', marginTop: '2px' }}>{f.error}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
