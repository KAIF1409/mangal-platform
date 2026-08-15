'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import ThemeToggle from '../../../components/ThemeToggle';
import { useKCircleTheme } from '../../theme';
import { Lock, Menu, X, Settings, Camera } from 'lucide-react';
import {
  PERM, PERMISSION_LABELS, resolveBasePermissions, resolveChannelPermissions, can, highestRolePosition, canManageRoleAt,
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
// Same bucket + size limit chat/page.tsx uses for DM/group message attachments (§12d).
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

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
  const { setIsLight, themeVars, dataTheme } = useKCircleTheme();
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
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [attachError, setAttachError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [roleNames, setRoleNames] = useState<Map<string, { name: string; color: string | null }>>(new Map());
  const [overwrites, setOverwrites] = useState<OverwriteRow[]>([]);
  const [myRoleIds, setMyRoleIds] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const [panel, setPanel] = useState<'channels' | 'roles' | 'overwrites' | null>(null);
  const [overwriteChannelId, setOverwriteChannelId] = useState<string | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      setCheckedAuth(true);
      if (!uid) router.replace(`/login?next=/kalpana-circle`);
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
    setRoles(roleRows.map(r => ({ id: r.id, permissions: r.permissions, is_default: r.is_default, position: r.position })));
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
  const myHighestPosition = highestRolePosition(myRoleRows);
  const iAmAdmin = can(myBasePerms, 'ADMINISTRATOR');

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

  const sendMessage = async () => {
    if (!userId || !activeChannelId || (!draft.trim() && !attachFile)) return;
    const text = draft.trim();
    const file = attachFile;
    setPosting(true);

    let imageUrl: string | null = null;
    if (file) {
      const ext = file.name.split('.').pop();
      // eslint-disable-next-line react-hooks/purity -- Date.now() used inside an event handler (onClick), not during render; same pattern as ../../chat/page.tsx sendMessage
      const path = `messages/${userId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('kcircle-media').upload(path, file, { upsert: true });
      if (upErr) { setPosting(false); setAttachError(`Upload failed: ${upErr.message}`); return; }
      imageUrl = supabase.storage.from('kcircle-media').getPublicUrl(path).data.publicUrl;
    }

    const { error } = await supabase.from('kcircle_channel_messages').insert({
      channel_id: activeChannelId, author_id: userId, text: text || null, image_url: imageUrl,
    });
    setPosting(false);
    if (error) return;
    setDraft('');
    clearAttach();
    await loadMessages(activeChannelId);
  };

  const handleAttachPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttachError('');
    if (!file.type.startsWith('image/')) { setAttachError('Only images for now.'); return; }
    if (file.size > MAX_ATTACHMENT_BYTES) { setAttachError('Image too large (5MB max).'); return; }
    setAttachFile(file);
    setAttachPreview(URL.createObjectURL(file));
  };

  const clearAttach = () => { setAttachFile(null); setAttachPreview(null); setAttachError(''); };

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

  // Swap two adjacent channels' positions. Uses the pair's array indices
  // (not their stored position values) as the new positions, which also
  // self-normalizes any duplicate/gapped position values from past inserts.
  const moveChannel = async (index: number, direction: -1 | 1) => {
    if (!canManageChannels) return;
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= channels.length) return;
    const a = channels[index];
    const b = channels[otherIndex];
    await Promise.all([
      supabase.from('kcircle_group_channels').update({ position: otherIndex }).eq('id', a.id),
      supabase.from('kcircle_group_channels').update({ position: index }).eq('id', b.id),
    ]);
    await loadAll();
  };

  const createRole = async () => {
    if (!newRoleName.trim() || !canManageRoles) return;
    // New role must rank strictly below my own highest role, unless I'm admin —
    // same rank rule the DB enforces (kcircle_my_highest_role_position).
    const position = iAmAdmin ? roles.length : Math.max(0, myHighestPosition - 1);
    const { error } = await supabase.from('kcircle_group_roles').insert({
      conversation_id: conversationId, name: newRoleName.trim(), color: '#94a3b8',
      position, permissions: PERM.VIEW_CHANNEL | PERM.SEND_MESSAGES,
    });
    if (!error) { setNewRoleName(''); await loadAll(); }
  };

  const deleteRole = async (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    if (!role || !canManageRoleAt(myRoleRows, role.position)) return;
    if (!confirm('Delete this role?')) return;
    await supabase.from('kcircle_group_roles').delete().eq('id', roleId);
    await loadAll();
  };

  const toggleRolePermission = async (roleId: string, permKey: keyof typeof PERM) => {
    const role = roles.find(r => r.id === roleId);
    if (!role || !canManageRoleAt(myRoleRows, role.position)) return;
    const next = role.permissions ^ PERM[permKey];
    await supabase.from('kcircle_group_roles').update({ permissions: next }).eq('id', roleId);
    await loadAll();
  };

  const toggleMemberRole = async (userIdTarget: string, roleId: string, has: boolean) => {
    const role = roles.find(r => r.id === roleId);
    if (!role || !canManageRoleAt(myRoleRows, role.position)) return;
    if (has) {
      await supabase.from('kcircle_group_role_members').delete().eq('role_id', roleId).eq('user_id', userIdTarget);
    } else {
      await supabase.from('kcircle_group_role_members').insert({ role_id: roleId, user_id: userIdTarget });
    }
    await loadAll();
  };

  // Per-channel role overwrite: 3-state cycle inherit -> allow -> deny -> inherit,
  // same states Discord's channel permission editor uses. Gated the same way
  // the RLS policy is (MANAGE_ROLES + the overwritten role must rank below
  // the caller's own highest role) via canManageRoleAt.
  const getOverwriteState = (channelId: string, roleId: string, permKey: keyof typeof PERM): 'inherit' | 'allow' | 'deny' => {
    const bit = PERM[permKey];
    const o = overwrites.find(ow => ow.channel_id === channelId && ow.role_id === roleId);
    if (!o) return 'inherit';
    if (o.allow & bit) return 'allow';
    if (o.deny & bit) return 'deny';
    return 'inherit';
  };

  const cycleOverwrite = async (channelId: string, roleId: string, permKey: keyof typeof PERM) => {
    const role = roles.find(r => r.id === roleId);
    if (!role || !canManageRoleAt(myRoleRows, role.position)) return;
    const bit = PERM[permKey];
    const existing = overwrites.find(ow => ow.channel_id === channelId && ow.role_id === roleId);
    const allow = existing?.allow ?? 0;
    const deny = existing?.deny ?? 0;
    const state = getOverwriteState(channelId, roleId, permKey);
    let nextAllow = allow;
    let nextDeny = deny;
    if (state === 'inherit') { nextAllow = allow | bit; nextDeny = deny & ~bit; }
    else if (state === 'allow') { nextAllow = allow & ~bit; nextDeny = deny | bit; }
    else { nextAllow = allow & ~bit; nextDeny = deny & ~bit; }

    if (nextAllow === 0 && nextDeny === 0) {
      if (existing) await supabase.from('kcircle_channel_overwrites').delete().eq('channel_id', channelId).eq('role_id', roleId);
    } else {
      await supabase.from('kcircle_channel_overwrites').upsert({ channel_id: channelId, role_id: roleId, allow: nextAllow, deny: nextDeny });
    }
    await loadAll();
  };

  if (!checkedAuth || loading) {
    return <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-primary)' }}>Loading…</div>;
  }

  if (notAllowed) {
    return (
      <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)', padding: '24px', textAlign: 'center' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}><Lock size={32} strokeWidth={1.5} /></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>You&apos;re not a member of this group.</p>
          <Link href="/kalpana-circle/chat" style={{ color: ACCENT, fontSize: '12px', fontWeight: 700 }}>← Back to Chat</Link>
        </div>
      </div>
    );
  }

  return (
    <div data-theme={dataTheme} style={{ ...themeVars, minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (max-width: 700px) {
          .kc-group-sidebar { display: none !important; }
          .kc-group-sidebar.kc-group-sidebar-open { display: flex !important; position: fixed !important; inset: 56px 0 0 0; z-index: 90; background: var(--bg-primary); width: 100% !important; }
          .kc-group-hamburger { display: inline-flex !important; }
          .kc-group-sidebar-close { display: inline-flex !important; }
        }
      `}</style>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100, background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)', padding: '0 14px', height: '56px',
        display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
      }}>
        <Link href="/kalpana-circle/chat" style={{ fontSize: '18px', textDecoration: 'none', color: 'var(--text-primary)' }}>←</Link>
        <button
          className="kc-group-hamburger"
          onClick={() => setMobileSidebarOpen(v => !v)}
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', alignItems: 'center', justifyContent: 'center' }}
          title="Channels"
        ><Menu size={18} strokeWidth={2} /></button>
        <span style={{ fontWeight: 800, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupTitle}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', flexShrink: 0 }}>
          {canManageChannels && (
            <button onClick={() => setPanel(p => p === 'channels' ? null : 'channels')} style={{ background: 'none', border: 'none', fontSize: '12.5px', fontWeight: 700, color: panel === 'channels' ? ACCENT : 'var(--text-tertiary)', cursor: 'pointer' }}>+ Channel</button>
          )}
          {canManageRoles && (
            <button onClick={() => setPanel(p => p === 'roles' ? null : 'roles')} style={{ background: 'none', border: 'none', fontSize: '12.5px', fontWeight: 700, color: panel === 'roles' ? ACCENT : 'var(--text-tertiary)', cursor: 'pointer' }}>Roles</button>
          )}
          <ThemeToggle size={26} onChange={setIsLight} defaultLight={false} syncGlobal={false} />
        </div>
      </nav>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div className={`kc-group-sidebar${mobileSidebarOpen ? ' kc-group-sidebar-open' : ''}`} style={{ width: '180px', flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button
            className="kc-group-sidebar-close"
            onClick={() => setMobileSidebarOpen(false)}
            style={{ display: 'none', alignSelf: 'flex-end', background: 'none', border: 'none', fontSize: '13px', color: 'var(--text-tertiary)', cursor: 'pointer', marginBottom: '8px' }}
          ><X size={13} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Close</button>
          {channels.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {canManageChannels && (
                <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  <button
                    onClick={() => moveChannel(i, -1)} disabled={i === 0} title="Move up"
                    style={{ background: 'none', border: 'none', color: i === 0 ? 'var(--border-color)' : 'var(--text-faint)', fontSize: '9px', lineHeight: 1, cursor: i === 0 ? 'default' : 'pointer', padding: '1px 0' }}
                  >▲</button>
                  <button
                    onClick={() => moveChannel(i, 1)} disabled={i === channels.length - 1} title="Move down"
                    style={{ background: 'none', border: 'none', color: i === channels.length - 1 ? 'var(--border-color)' : 'var(--text-faint)', fontSize: '9px', lineHeight: 1, cursor: i === channels.length - 1 ? 'default' : 'pointer', padding: '1px 0' }}
                  >▼</button>
                </div>
              )}
              <button onClick={() => { setActiveChannelId(c.id); setMobileSidebarOpen(false); }} style={{
                flex: 1, textAlign: 'left', background: activeChannelId === c.id ? 'var(--bg-card)' : 'none', border: 'none',
                borderRadius: '6px', padding: '7px 8px', fontSize: '13px', fontWeight: activeChannelId === c.id ? 700 : 500,
                color: activeChannelId === c.id ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}># {c.name}</button>
              {canManageChannels && (
                <button onClick={() => deleteChannel(c.id)} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex' }}><X size={11} strokeWidth={2.5} /></button>
              )}
              {canManageRoles && (
                <button onClick={() => { setOverwriteChannelId(c.id); setPanel('overwrites'); }} title="Channel permissions" style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex' }}><Settings size={11} strokeWidth={2} /></button>
              )}
            </div>
          ))}
          {channels.length === 0 && <div style={{ fontSize: '11.5px', color: 'var(--text-faint)', padding: '6px 8px' }}>No channels yet</div>}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!activeChannelId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>Select a channel</div>
          ) : !canViewHere ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '13px', gap: '6px' }}><Lock size={14} strokeWidth={2} /> You don&apos;t have access to this channel</div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '12.5px', marginTop: '40px' }}>No messages yet — say hi</div>
                ) : messages.map(m => (
                  <div key={m.id} style={{ maxWidth: '80%' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 800, fontSize: '12.5px' }}>@{m.author}</span>
                      <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>{timeAgo(m.created_at)}</span>
                    </div>
                    {m.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element -- same pattern as ../../chat/page.tsx for chat attachments
                      <img src={m.image_url} alt="attachment" style={{ maxWidth: '260px', maxHeight: '260px', borderRadius: '10px', marginTop: '4px', display: 'block', border: '1px solid var(--border-color)' }} />
                    )}
                    {m.text && <p style={{ fontSize: '13.5px', margin: '3px 0 0', whiteSpace: 'pre-wrap' }}>{m.text}</p>}
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid var(--border-color)' }}>
                {canSendHere ? (
                  <>
                    {attachPreview && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px 0' }}>
                        <div style={{ position: 'relative' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, same pattern as ../../chat/page.tsx */}
                          <img src={attachPreview} alt="preview" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
                          <button onClick={clearAttach} style={{
                            position: 'absolute', top: '-6px', right: '-6px', width: '16px', height: '16px', borderRadius: '50%',
                            border: 'none', background: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                          }}><X size={10} strokeWidth={2.5} /></button>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Photo attached</span>
                      </div>
                    )}
                    {attachError && <p style={{ fontSize: '11px', color: '#ef4444', padding: '6px 14px 0', margin: 0 }}>{attachError}</p>}
                    <div style={{ padding: '10px 14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAttachPick} style={{ display: 'none' }} />
                      <button
                        onClick={() => fileInputRef.current?.click()} title="Attach photo"
                        style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      ><Camera size={14} strokeWidth={2} /></button>
                      <input
                        value={draft} onChange={e => setDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
                        placeholder={`Message #${channels.find(c => c.id === activeChannelId)?.name ?? ''}`}
                        style={{ flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: '10px', fontSize: '13px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none' }}
                      />
                      <button onClick={sendMessage} disabled={posting || (!draft.trim() && !attachFile)} style={{
                        fontSize: '12.5px', fontWeight: 800, padding: '9px 18px', borderRadius: '10px', border: 'none',
                        background: RADIANT, color: '#27272a', cursor: posting ? 'wait' : 'pointer', opacity: (draft.trim() || attachFile) ? 1 : 0.6,
                      }}>{posting ? '…' : 'Send'}</button>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-faint)', padding: '10px 14px' }}>You can view this channel but can&apos;t post here</div>
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
              const manageable = canManageRoleAt(myRoleRows, r.position);
              return (
                <div key={r.id} style={{ marginBottom: '8px', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden', opacity: manageable ? 1 : 0.55 }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', cursor: manageable ? 'pointer' : 'default' }}
                    onClick={() => manageable && setEditingRoleId(editingRoleId === r.id ? null : r.id)}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: meta?.color ?? '#94a3b8', flexShrink: 0 }} />
                    <span style={{ fontSize: '12.5px', fontWeight: 700, flex: 1 }}>{meta?.name}{r.is_default ? ' (default)' : ''}</span>
                    {!manageable && <span title="Ranked above your highest role — you can't manage this" style={{ display: 'flex' }}><Lock size={11} strokeWidth={2} /></span>}
                    {!r.is_default && manageable && (
                      <button onClick={e => { e.stopPropagation(); deleteRole(r.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex' }}><X size={11} strokeWidth={2.5} /></button>
                    )}
                  </div>
                  {editingRoleId === r.id && manageable && (
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
                  {roles.filter(r => !r.is_default && canManageRoleAt(myRoleRows, r.position)).map(r => {
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

        {panel === 'overwrites' && overwriteChannelId && canManageRoles && (() => {
          const chan = channels.find(c => c.id === overwriteChannelId);
          const editableRoles = roles.filter(r => canManageRoleAt(myRoleRows, r.position));
          return (
            <div style={{ width: '300px', flexShrink: 0, borderLeft: '1px solid var(--border-color)', padding: '16px', overflowY: 'auto' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 4px' }}># {chan?.name ?? ''} permissions</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '0 0 14px' }}>Per-role overrides for this channel only. Tap a chip to cycle Inherit → Allow → Deny.</p>

              {editableRoles.length === 0 && (
                <div style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>No roles you can edit here.</div>
              )}

              {editableRoles.map(r => {
                const meta = roleNames.get(r.id);
                return (
                  <div key={r.id} style={{ marginBottom: '10px', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: meta?.color ?? '#94a3b8', flexShrink: 0 }} />
                      <span style={{ fontSize: '12.5px', fontWeight: 700 }}>{meta?.name}{r.is_default ? ' (default)' : ''}</span>
                    </div>
                    {PERMISSION_LABELS.map(p => {
                      const state = getOverwriteState(overwriteChannelId, r.id, p.key);
                      const colors: Record<typeof state, { bg: string; fg: string; label: string }> = {
                        inherit: { bg: 'transparent', fg: 'var(--text-tertiary)', label: 'Inherit' },
                        allow: { bg: 'rgba(34,197,94,0.15)', fg: '#22c55e', label: 'Allow' },
                        deny: { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444', label: 'Deny' },
                      };
                      const c = colors[state];
                      return (
                        <div key={p.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
                          <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{p.label}</span>
                          <button
                            onClick={() => cycleOverwrite(overwriteChannelId, r.id, p.key)}
                            style={{
                              fontSize: '10px', fontWeight: 800, padding: '2px 9px', borderRadius: '9px',
                              border: `1px solid ${state === 'inherit' ? 'var(--border-color)' : c.fg}`,
                              background: c.bg, color: c.fg, cursor: 'pointer', minWidth: '58px',
                            }}
                          >{c.label}</button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
