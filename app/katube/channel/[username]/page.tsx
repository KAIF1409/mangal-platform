'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import VideoGridCard, { type GridVideo } from '../../components/VideoGridCard';
import { KaTubeShell } from '../../components/VideoGridCard';
import { Users, Video as VideoIcon, Eye } from 'lucide-react';

// §28b — Public channel page + custom channel URL
// (`/katube/channel/[username]`), distinct from `/dashboard/katube` which
// is the creator's own private management view. Reuses the exact
// follow/unfollow pattern already proven on the watch page (optimistic
// toggle + rollback-on-error) rather than inventing a second one.
//
// No banner image or channel-trailer video yet — creator_profiles has no
// column for either, and adding one plus the upload UI for it is a
// separate, slower piece of work than this page itself. Flagged as a
// follow-up in CONTEXT.md rather than silently skipped.

interface ChannelInfo {
  userId: string;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
}

export default function KaTubeChannelPage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<GridVideo[]>([]);
  const [shorts, setShorts] = useState<{ id: string; title: string; youtube_id: string; views: number }[]>([]);
  const [totalViews, setTotalViews] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const followLockRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  useEffect(() => {
    if (!username) return;
    (async () => {
      const { data: profile } = await supabase.from('creator_profiles')
        .select('user_id, username, bio, avatar_url')
        .eq('username', username)
        .maybeSingle();

      if (!profile) { setNotFound(true); setLoading(false); return; }

      setChannel({ userId: profile.user_id, username: profile.username, bio: profile.bio, avatarUrl: profile.avatar_url });

      const [videosRes, shortsRes, followerRes] = await Promise.all([
        supabase.from('videos').select('id, title, youtube_id, views, created_at, series_id')
          .eq('creator_id', profile.user_id).eq('is_short', false).order('created_at', { ascending: false }),
        supabase.from('videos').select('id, title, youtube_id, views')
          .eq('creator_id', profile.user_id).eq('is_short', true).order('created_at', { ascending: false }).limit(12),
        supabase.from('creator_follows').select('follower_id', { count: 'exact', head: true }).eq('creator_id', profile.user_id),
      ]);

      const rows = videosRes.data || [];
      const seriesIds = [...new Set(rows.map(r => r.series_id).filter(Boolean))];
      const seriesRes = seriesIds.length
        ? await supabase.from('series').select('id, title').in('id', seriesIds)
        : { data: [] as { id: string; title: string }[] };
      const seriesMap = new Map((seriesRes.data || []).map(s => [s.id, s.title]));

      setVideos(rows.map(r => ({
        id: r.id, title: r.title, youtube_id: r.youtube_id, views: r.views, created_at: r.created_at,
        creator: profile.username, basedOn: r.series_id ? (seriesMap.get(r.series_id) || null) : null,
      })));
      setShorts(shortsRes.data || []);
      setTotalViews(rows.reduce((sum, r) => sum + (r.views || 0), 0) + (shortsRes.data || []).reduce((s, r) => s + (r.views || 0), 0));
      setFollowerCount(followerRes.count || 0);
      setLoading(false);
    })();
  }, [username]);

  useEffect(() => {
    if (!channel || !userId) return;
    let cancelled = false;
    supabase.from('creator_follows').select('creator_id').eq('creator_id', channel.userId).eq('follower_id', userId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setFollowing(!!data); });
    return () => { cancelled = true; };
  }, [channel, userId]);

  async function handleFollow() {
    if (!channel) return;
    if (!userId) { router.push('/login?next=' + encodeURIComponent(`/katube/channel/${username}`)); return; }
    if (userId === channel.userId) return;
    if (followLockRef.current) return;
    followLockRef.current = true;
    setFollowBusy(true);

    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setFollowerCount(c => Math.max(0, c + (wasFollowing ? -1 : 1)));

    const { error } = wasFollowing
      ? await supabase.from('creator_follows').delete().eq('creator_id', channel.userId).eq('follower_id', userId)
      : await supabase.from('creator_follows').insert({ creator_id: channel.userId, follower_id: userId });

    if (error) {
      setFollowing(wasFollowing);
      setFollowerCount(c => Math.max(0, c + (wasFollowing ? 1 : -1)));
    }
    followLockRef.current = false;
    setFollowBusy(false);
  }

  if (loading) {
    return <KaTubeShell title="Channel"><div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280', fontSize: '13px' }}>Loading…</div></KaTubeShell>;
  }
  if (notFound || !channel) {
    return (
      <KaTubeShell title="Channel not found">
        <div style={{ maxWidth: '600px', margin: '40px auto', padding: '18px 22px', borderRadius: '12px', background: '#0d0d14', border: '1px dashed rgba(255,255,255,0.18)', textAlign: 'center' }}>
          <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: 0 }}>No KaTube channel found for @{username}.</p>
        </div>
      </KaTubeShell>
    );
  }

  const isOwnChannel = userId === channel.userId;

  return (
    <KaTubeShell title={`@${channel.username}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ width: '84px', height: '84px', borderRadius: '50%', overflow: 'hidden', background: '#1a1a22', flexShrink: 0, position: 'relative' }}>
          {channel.avatarUrl ? (
            <Image src={channel.avatarUrl} alt={channel.username} fill sizes="84px" style={{ objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px', fontWeight: 900, color: '#f97316' }}>
              {channel.username[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 4px' }}>{channel.username}</h2>
          <div style={{ display: 'flex', gap: '16px', fontSize: '12.5px', color: '#9ca3af', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Users size={13} /> {followerCount} followers</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><VideoIcon size={13} /> {videos.length + shorts.length} videos</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Eye size={13} /> {totalViews.toLocaleString()} views</span>
          </div>
          {channel.bio && <p style={{ fontSize: '12.5px', color: '#c9c9d1', margin: '8px 0 0', maxWidth: '520px', lineHeight: 1.5 }}>{channel.bio}</p>}
        </div>
        {!isOwnChannel && (
          <button
            onClick={handleFollow}
            disabled={followBusy}
            style={{
              padding: '9px 22px', borderRadius: '22px', border: 'none', fontSize: '13px', fontWeight: 800,
              cursor: followBusy ? 'default' : 'pointer', flexShrink: 0,
              background: following ? 'rgba(255,255,255,0.1)' : '#f97316',
              color: following ? '#fff' : '#fff',
            }}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        )}
        {isOwnChannel && (
          <Link href="/dashboard/katube" style={{
            padding: '9px 22px', borderRadius: '22px', border: '1px solid rgba(255,255,255,0.2)', fontSize: '13px',
            fontWeight: 700, color: '#fff', textDecoration: 'none', flexShrink: 0,
          }}>Manage channel</Link>
        )}
      </div>

      {shorts.length > 0 && (
        <>
          <h3 style={{ fontSize: '14px', fontWeight: 800, margin: '24px 0 12px' }}>Fast tap</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '10px' }}>
            {shorts.map(s => (
              <div
                key={s.id}
                onClick={() => router.push(`/katube/watch/${s.id}`)}
                style={{ cursor: 'pointer', borderRadius: '12px', overflow: 'hidden', aspectRatio: '9/16', background: '#000', position: 'relative' }}
              >
                <img src={`https://img.youtube.com/vi/${s.youtube_id}/hqdefault.jpg`} alt={s.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </>
      )}

      <h3 style={{ fontSize: '14px', fontWeight: 800, margin: '24px 0 12px' }}>Videos</h3>
      {videos.length === 0 ? (
        <div style={{ padding: '18px 22px', borderRadius: '12px', background: '#0d0d14', border: '1px dashed rgba(255,255,255,0.18)', textAlign: 'center' }}>
          <p style={{ fontSize: '12.5px', color: '#9ca3af', margin: 0 }}>No videos uploaded yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          {videos.map(v => <VideoGridCard key={v.id} video={v} />)}
        </div>
      )}
    </KaTubeShell>
  );
}
