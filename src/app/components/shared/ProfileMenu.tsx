'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useUiLanguage } from '../../lib/i18n';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';

interface ProfileMenuProps {
  user: User;
  isCreator: boolean;
  isDeveloper?: boolean;
}

/**
 * Shared profile dropdown — use on every page that has a logged-in user
 * (Homepage, Series page, Reader, Dashboard).
 *
 * - Developer accounts (role === 'developer') get full creator + reader
 *   access everywhere, with no "Become a Creator" form — see hasCreatorAccess()
 *   in lib/roles.ts, used wherever creator-gated UI is decided.
 * - Creator accounts see: Dashboard, Reader View, Create New, Settings, Sign Out
 * - Reader accounts see: Reading History, Bookmarks, Settings, "Become a Creator", Sign Out
 */
export default function ProfileMenu({ user, isCreator, isDeveloper = false }: ProfileMenuProps) {
  const { t } = useUiLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  if (!user) return null;

  const initials = (user?.user_metadata?.full_name || user?.email || '?')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 12px', borderRadius: '8px',
    fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)',
    textDecoration: 'none', width: '100%', textAlign: 'left' as const,
    background: 'none', border: '1px solid transparent', cursor: 'pointer',
    transition: 'transform 0.12s ease, border-color 0.12s ease, background 0.12s ease',
  };

  // Visible hover feedback so it's clear which item the cursor is over
  // before clicking — a border appears and the item scales up slightly.
  const handleItemHover = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'var(--text-secondary)';
    e.currentTarget.style.background = 'var(--bg-input)';
    e.currentTarget.style.transform = 'scale(1.03)';
  };
  const handleItemLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'transparent';
    e.currentTarget.style.background = 'none';
    e.currentTarget.style.transform = 'scale(1)';
  };
  // Sign Out already has a red border/background at rest — hover should
  // intensify that red rather than switching to the neutral style above.
  const handleSignOutHover = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'rgba(239,68,68,0.6)';
    e.currentTarget.style.background = 'rgba(239,68,68,0.16)';
    e.currentTarget.style.transform = 'scale(1.03)';
  };
  const handleSignOutLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)';
    e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
    e.currentTarget.style.transform = 'scale(1)';
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Account menu"
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: open ? 'var(--bg-input)' : 'transparent',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '6px 10px 6px 6px',
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
      >
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>
          {initials}
        </div>
        <span style={{
          fontSize: '10px', color: 'var(--text-tertiary)',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
        }}>▾</span>
      </button>

      {/* Sliding dropdown panel — email/name only shown here, on click,
          per founder request (was previously always visible in the closed
          button, taking up nav space) */}
      <div style={{
        position: 'absolute', top: 'calc(100% + 10px)', right: 0,
        width: '270px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '14px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        transformOrigin: 'top right',
        transform: open ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(-8px)',
        opacity: open ? 1 : 0,
        visibility: open ? 'visible' as const : 'hidden' as const,
        transition: 'transform 0.18s ease, opacity 0.18s ease',
        zIndex: 100,
      }}>
        {/* Identity header */}
        <div style={{ padding: '18px 18px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #7f1d1d, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '15px', fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {user?.user_metadata?.full_name || (isCreator ? t('roleCreator') : t('roleReader'))}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {user?.email}
            </div>
            <span style={{
              display: 'inline-block', marginTop: '4px',
              fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
              textTransform: 'uppercase' as const, letterSpacing: '0.06em',
              background: isDeveloper ? 'rgba(168,85,247,0.18)' : isCreator ? 'rgba(217,119,6,0.15)' : 'rgba(107,114,128,0.15)',
              color: isDeveloper ? '#c084fc' : isCreator ? '#d97706' : 'var(--text-tertiary)',
            }}>
              {isDeveloper ? t('roleDeveloper') : isCreator ? t('roleCreator') : t('roleReader')}
            </span>
          </div>
        </div>

        <div style={{ padding: '8px' }}>
          {isCreator ? (
            <>
              <a href="/dashboard" style={itemStyle} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>{t('pmDashboard')}</a>
              <Link href="/" style={itemStyle} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>{t('pmReaderView')}</Link>
              <a href="/WebMangal/upload" style={itemStyle} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>{t('pmCreateNewSeries')}</a>
              <div style={{ height: '1px', background: 'var(--border-color)', margin: '6px 4px' }} />
              <a href="/WebMangal/history" style={itemStyle} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>{t('pmReadingHistory')}</a>
              <a href="/WebMangal/bookmarks" style={itemStyle} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>{t('pmBookmarks')}</a>
              {isDeveloper && (
                <>
                  <div style={{ height: '1px', background: 'var(--border-color)', margin: '6px 4px' }} />
                  <a href="/admin/reports" style={{ ...itemStyle, color: '#c084fc' }} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>{t('pmAdminReports')}</a>
                </>
              )}
            </>
          ) : (
            <>
              <a href="/WebMangal/history" style={itemStyle} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>{t('pmReadingHistory')}</a>
              <a href="/WebMangal/bookmarks" style={itemStyle} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>{t('pmBookmarks')}</a>
              <div style={{ height: '1px', background: 'var(--border-color)', margin: '6px 4px' }} />
              {/* The ONLY path from reader to creator tools — no shortcuts elsewhere */}
              <a href="/become-creator" style={{
                ...itemStyle,
                color: '#d97706', fontWeight: 700,
              }} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>{t('pmBecomeCreator')}</a>
            </>
          )}

          {/* Settings — available to all roles */}
          <div style={{ height: '1px', background: 'var(--border-color)', margin: '6px 4px' }} />
          <a href="/settings" style={itemStyle} onMouseEnter={handleItemHover} onMouseLeave={handleItemLeave}>{t('pmSettings')}</a>
        </div>

        <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 8px' }} />

        <div style={{ padding: '8px' }}>
          <button
            onClick={handleSignOut}
            onMouseEnter={handleSignOutHover}
            onMouseLeave={handleSignOutLeave}
            style={{
              ...itemStyle,
              color: '#f87171',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            {t('pmSignOut')}
          </button>
        </div>
      </div>
    </div>
  );
}