'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import {
  PERM, PERMISSION_LABELS, resolveBasePermissions, resolveChannelPermissions, can,
  type RoleRow, type OverwriteRow,
} from '../../../lib/kcirclePermissions';

// ── K Circle — Discord-style channels + roles for a group ──
// Every group gets an auto-created @everyone role, an Owner role, and a
// #general channel (trigger on kcircle_conversations insert). This page
// lets participants browse/post in channels, and members with
// MANAGE_ROLES/MANAGE_CHANNELS manage roles, role membership, channels,
// and per-channel role overwrites.
// Schema: supabase/migrations/20260813170000_kcircle_channels_roles.sql
// Permission resolution: app/lib/kcirclePermissions.ts

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';
const ACCENT = '#a78bfa';

interface ChannelRow { id: string; name: string; topic: string | null; position: number }
interface Msg { id: string; author_id: string; text: string | null; image_url: string | null; created_at: string; author: string }
interface Member { user_id: string; username: string; roleIds: string[] }

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function GroupChannelsPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.conversationId as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [notAllowed, setNotAllowed] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [loading, setLoading] = useState(true);

  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [roleNames, setRoleNames] = useState<Map<string, { name: string; color: string | null }>>(new Map());
  const [overwrites, setOverwrites] = useState<OverwriteRow[]>([]);
  const [myRoleIds, setMyRoleIds] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [panel, setPanel] = useState<'channels' | 'roles' | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      setCheckedAuth(true);
      if (!uid) router.replace(`/login?next=/kalpana-circle/group/${conversationId}`);
    });
  }, [router, conversationId]);

  const loadAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const { data: participant } = await supabase
      .from('kcircle_conversation_participants').select('user_id')
      .eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle();
    if (!participant) { setNotAllowed(true); setLoading(false); return; }

    const [convoRes, channelsRes, rolesRes, roleMembersRes, overwritesRes, participantsRes] = await Promise.all([
      supabase.from('kcircle_conversations').select('title').eq('id', conversationId).single(),
      supabase.from('kcircle_group_channels').select('id, name, topic, position').eq('conversation_id', conversationId).order('position'),
      supabase.from('kcircle_group_roles').select('id, name, color, permissions, is_default, position').eq('conversation_id', conversationId).order('position', { ascending: false }),
      supabase.from('kcircle_group_role_members').select('role_id, user_id'),
      supabase.from('kcircle_channel_overwrites').select('channel_id, role_id, allow, deny'),
      supabase.from('kcircle_conversation_participants').select('user_id').eq('conversation_id', conversationId),
    ]);

    setGroupTitle(convoRes.data?.title ?? 'Group');
    const channelRows = channelsRes.data ?? [];
    setChannels(channelRows);
    setActiveChannelId(prev => prev ?? channelRows[0]?.id ?? null);

    const roleRows = (rolesRes.data ?? []) as (RoleRow & { name: string; color: string | null })[];
    setRoles(roleRows.map(r => ({ id: r.id, permissions: r.permissions, is_default: r.is_default })));
    setRoleNames(new Map(roleRows.map(r => [r.id, { name: r.name, color: r.color }])));

    const roleIdSet = new Set(roleRows.map(r => r.id));
    const myMemberships = (roleMembersRes.data ?? []).filter(rm => rm.user_id === userId && roleIdSet.has(rm.role_id));
    const defaultRoleId = roleRows.find(r => r.is_default)?.id;
    const myIds = Array.from(new Set([...myMemberships.map(m => m.role_id), ...(defaultRoleId ? [defaultRoleId] : [])]));
    setMyRoleIds(myIds);

    setOverwrites((overwritesRes.data ?? []) as OverwriteRow[]);

    const participantIds = (participantsRes.data ?? []).map(p => p.user_id);
    const { data: profiles } = participantIds.length
      ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', participantIds)
      : { data: [] as { user_id: string; username: string }[] };
    const roleMembersByUser = new Map<string, string[]>();
    (roleMembersRes.data ?? []).forEach(rm => {
      if (!roleIdSet.has(rm.role_id)) return;
      const list = roleMembersByUser.get(rm.user_id) ?? [];
      list.push(rm.role_id);
      roleMembersByUser.set(rm.user_id, list);
    });
    setMembers((profiles ?? []).map(p => ({
      user_id: p.user_id, username: p.username,
      roleIds: [...(roleMembersByUser.get(p.user_id) ?? []), ...(defaultRoleId ? [defaultRoleId] : [])],
    })));

    setLoading(false);
  }, [userId, conversationId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/userId change, same pattern as ../../saved/page.tsx
  useEffect(() => { loadAll(); }, [loadAll]);

  const myRoleRows = roles.filter(r => myRoleIds.includes(r.id));
  const myBasePerms = resolveBasePermissions(myRoleRows);
  const myChannelPerms = activeChannelId ? resolveChannelPermissions(myRoleRows, activeChannelId, overwrites) : 0;
  const canManageChannels = can(myBasePerms, 'MANAGE_CHANNELS');
  const canManageRoles = can(myBasePerms, 'MANAGE_ROLES');
  const canSendHere = can(myChannelPerms, 'SEND_MESSAGES');
  const canViewHere = can(myChannelPerms, 'VIEW_CHANNEL');

  const loadMessages = useCallback(async (channelId: string) => {
    const { data: rows } = await supabase
      .from('kcircle_channel_messages').select('id, author_id, text, image_url, created_at')
      .eq('channel_id', channelId).order('created_at', { ascending: true }).limit(100);
    const authorIds = Array.from(new Set((rows ?? []).map(r => r.author_id)));
    const { data: profiles } = authorIds.length
      ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', authorIds)
      : { data: [] as { user_id: string; username: string }[] };
    const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.username]));
    setMessages((rows ?? []).map(r => ({ ...r, author: nameMap.get(r.author_id) ?? 'dreamer' })));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on active channel change, same pattern as ../../broadcast/[username]/page.tsx
  useEffect(() => { if (activeChannelId) loadMessages(activeChannelId); }, [activeChannelId, loadMessages]);

  const postMessage = async () => {
    if (!userId || !activeChannelId || !draft.trim()) return;
    setPosting(true);
    const { error } = await supabase.from('kcircle_channel_messages').insert({
      channel_id: activeChannelId, author_id: userId, text: draft.trim(),
    });
    setPosting(false);
    if (error) return;
    setDraft('');
    await loadMessages(activeChannelId);
  };

  const createChannel = async () => {
    if (!newChannelName.trim()) return;
    const name = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    const { error } = await supabase.from('kcircle_group_channels').insert({
      conversation_id: conversationId, name, created_by: userId, position: channels.length,
    });
    if (!error) { setNewChannelName(''); await loadAll(); }
  };

  const deleteChannel = async (channelId: string) => {
    if (!confirm('Delete this channel? Its messages will be lost.')) return;
    await supabase.from('kcircle_group_channels').delete().eq('id', channelId);
    if (activeChannelId === channelId) setActiveChannelId(null);
    await loadAll();
  };

  const createRole = async () => {
    if (!newRoleName.trim()) return;
    const { error } = await supabase.from('kcircle_group_roles').insert({
      conversation_id: conversationId, name: newRoleName.trim(), color: '#94a3b8',
      position: roles.length, permissions: PERM.VIEW_CHANNEL | PERM.SEND_MESSAGES,
    });
    if (!error) { setNewRoleName(''); await loadAll(); }
  };

  const deleteRole = async (roleId: string) => {
    if (!confirm('Delete this role?')) return;
    await supabase.from('kcircle_group_roles').delete().eq('id', roleId);
    await loadAll();
  };

  const toggleRolePermission = async (roleId: string, permKey: keyof typeof PERM) => {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;
    const next = role.permissions ^ PERM[permKey];
    await supabase.from('kcircle_group_roles').update({ permissions: next }).eq('id', roleId);
    await loadAll();
  };

  const toggleMemberRole = async (userIdTarget: string, roleId: string, has: boolean) => {
    if (has) {
      await supabase.from('kcircle_group_role_members').delete().eq('role_id', roleId).eq('user_id', userIdTarget);
    } else {
      await supabase.from('kcircle_group_role_members').insert({ role_id: roleId, user_id: userIdTarget });
    }
    await loadAll();
  };

  if (!checkedAuth || loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-primary)' }}>Loading…</div>;
  }

  if (notAllowed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)', padding: '24px', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>🔒</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>You&apos;re not a member of this group.</p>
          <Link href="/kalpana-circle/chat" style={{ color: ACCENT, fontSize: '12px', fontWeight: 700 }}>← Back to Chat</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 700px) {
          .kc-group-sidebar { display: none !important; }
          .kc-group-sidebar.kc-group-sidebar-open { display: flex !important; position: fixed !important; inset: 56px 0 0 0; z-index: 90; background: var(--bg-primary); }
        }
      `}</style>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100, background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)', padding: '0 14px', height: '56px',
        display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
      }}>
        <Link href="/kalpana-circle/chat" style={{ fontSize: '18px', textDecoration: 'none', color: 'var(--text-primary)' }}>←</Link>
        <span style={{ fontWeight: 800, fontSize: '15px' }}>{groupTitle}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
          {canManageChannels && (
            <button onClick={() => setPanel(p => p === 'channels' ? null : 'channels')} style={{ background: 'none', border: 'none', fontSize: '12.5px', fontWeight: 700, color: panel === 'channels' ? ACCENT : 'var(--text-tertiary)', cursor: 'pointer' }}>+ Channel</button>
          )}
          {canManageRoles && (
            <button onClick={() => setPanel(p => p === 'roles' ? null : 'roles')} style={{ background: 'none', border: 'none', fontSize: '12.5px', fontWeight: 700, color: panel === 'roles' ? ACCENT : 'var(--text-tertiary)', cursor: 'pointer' }}>Roles</button>
          )}
        </div>
      </nav>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div className="kc-group-sidebar" style={{ width: '180px', flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {channels.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button onClick={() => setActiveChannelId(c.id)} style={{
                flex: 1, textAlign: 'left', background: activeChannelId === c.id ? 'var(--bg-card)' : 'none', border: 'none',
                borderRadius: '6px', padding: '7px 8px', fontSize: '13px', fontWeight: activeChannelId === c.id ? 700 : 500,
                color: activeChannelId === c.id ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}># {c.name}</button>
              {canManageChannels && (
                <button onClick={() => deleteChannel(c.id)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '11px', cursor: 'pointer' }}>✕</button>
              )}
            </div>
          ))}
          {channels.length === 0 && <div style={{ fontSize: '11.5px', color: 'var(--text-faint)', padding: '6px 8px' }}>No channels yet</div>}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!activeChannelId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>Select a channel</div>
          ) : !canViewHere ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>🔒 You don&apos;t have access to this channel</div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '12.5px', marginTop: '40px' }}>No messages yet — say hi 👋</div>
                ) : messages.map(m => (
                  <div key={m.id} style={{ maxWidth: '80%' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 800, fontSize: '12.5px' }}>@{m.author}</span>
                      <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>{timeAgo(m.created_at)}</span>
                    </div>
                    {m.text && <p style={{ fontSize: '13.5px', margin: '3px 0 0', whiteSpace: 'pre-wrap' }}>{m.text}</p>}
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
                {canSendHere ? (
                  <>
                    <input
                      value={draft} onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') postMessage(); }}
                      placeholder={`Message #${channels.find(c => c.id === activeChannelId)?.name ?? ''}`}
                      style={{ flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: '10px', fontSize: '13px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                    <button onClick={postMessage} disabled={posting || !draft.trim()} style={{
                      fontSize: '12.5px', fontWeight: 800, padding: '9px 18px', borderRadius: '10px', border: 'none',
                      background: RADIANT, color: '#27272a', cursor: posting ? 'wait' : 'pointer', opacity: draft.trim() ? 1 : 0.6,
                    }}>Send</button>
                  </>
                ) : (
                  <div style={{ flex: 1, textAlign: 'center', fontSize: '12px', color: 'var(--text-faint)', padding: '6px 0' }}>You can view this channel but can&apos;t post here</div>
                )}
              </div>
            </>
          )}
        </div>

        {panel === 'channels' && canManageChannels && (
          <div style={{ width: '260px', flexShrink: 0, borderLeft: '1px solid var(--border-color)', padding: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 10px' }}>New channel</h3>
            <input
              value={newChannelName} onChange={e => setNewChannelName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createChannel(); }}
              placeholder="channel-name"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', outline: 'none', marginBottom: '8px' }}
            />
            <button onClick={createChannel} disabled={!newChannelName.trim()} style={{
              width: '100%', fontSize: '12.5px', fontWeight: 800, padding: '8px', borderRadius: '8px', border: 'none',
              background: RADIANT, color: '#27272a', cursor: 'pointer', opacity: newChannelName.trim() ? 1 : 0.6,
            }}>Create</button>
          </div>
        )}

        {panel === 'roles' && canManageRoles && (
          <div style={{ width: '300px', flexShrink: 0, borderLeft: '1px solid var(--border-color)', padding: '16px', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 10px' }}>Roles</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <input
                value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createRole(); }}
                placeholder="New role name"
                style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: '8px', fontSize: '12.5px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', outline: 'none' }}
              />
              <button onClick={createRole} disabled={!newRoleName.trim()} style={{
                fontSize: '12px', fontWeight: 800, padding: '7px 12px', borderRadius: '8px', border: 'none',
                background: RADIANT, color: '#27272a', cursor: 'pointer', opacity: newRoleName.trim() ? 1 : 0.6,
              }}>Add</button>
            </div>

            {roles.map(r => {
              const meta = roleNames.get(r.id);
              return (
                <div key={r.id} style={{ marginBottom: '8px', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', cursor: 'pointer' }} onClick={() => setEditingRoleId(editingRoleId === r.id ? null : r.id)}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: meta?.color ?? '#94a3b8', flexShrink: 0 }} />
                    <span style={{ fontSize: '12.5px', fontWeight: 700, flex: 1 }}>{meta?.name}{r.is_default ? ' (default)' : ''}</span>
                    {!r.is_default && (
                      <button onClick={e => { e.stopPropagation(); deleteRole(r.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                    )}
                  </div>
                  {editingRoleId === r.id && (
                    <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)' }}>
                      {PERMISSION_LABELS.map(p => (
                        <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', padding: '3px 0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={(r.permissions & PERM[p.key]) !== 0} onChange={() => toggleRolePermission(r.id, p.key)} />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '18px 0 10px' }}>Members</h3>
            {members.map(m => (
              <div key={m.user_id} style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '3px' }}>@{m.username}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {roles.filter(r => !r.is_default).map(r => {
                    const has = m.roleIds.includes(r.id);
                    const meta = roleNames.get(r.id);
                    return (
                      <button key={r.id} onClick={() => toggleMemberRole(m.user_id, r.id, has)} style={{
                        fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', borderRadius: '10px',
                        border: `1px solid ${has ? (meta?.color ?? ACCENT) : 'var(--border-color)'}`,
                        background: has ? `${meta?.color ?? ACCENT}22` : 'transparent',
                        color: has ? (meta?.color ?? ACCENT) : 'var(--text-tertiary)', cursor: 'pointer',
                      }}>{meta?.name}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
