'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import ThemeToggle from '../components/ThemeToggle';
import NotificationBell from '../components/NotificationBell';
import { supabase } from '../lib/supabase';
import { setPostLoginRedirect } from '../lib/authRedirect';

// ── K Circle — Instagram-style social layer for MANGAL ──
// Posts + likes + comments + stories + DMs (chat is a separate route,
// /kalpana-circle/chat). Backend: supabase/migrations/20260812_kcircle_social.sql
// (kcircle_posts, kcircle_post_likes, kcircle_post_comments, kcircle_stories,
// kcircle_story_views, kcircle_conversations, kcircle_messages).
// No Reels here on purpose — KaTube already owns short-form video.
// Brand: radiant grey (not Instagram's pink/orange/purple), see RADIANT below.
// Images upload to the dedicated 'kcircle-media' storage bucket
// (posts/... and stories/... prefixes) — previously reused 'manga-pages'
// under a 'kcircle/' prefix; moved to its own bucket for clean ownership.

const RADIANT = 'linear-gradient(135deg, #71717a 0%, #d4d4d8 45%, #f4f4f5 60%, #a1a1aa 100%)';
const RADIANT_SOLID = '#71717a';
const GREEN = '#22c55e'; // close-friends story ring/badge — matches Instagram's convention

interface AuthorInfo {
  username: string;
}

interface PollOption {
  id: string;
  option_text: string;
  position: number;
  votes: number;
}

interface KPost {
  id: string;
  author_id: string;
  caption: string | null;
  image_url: string | null;
  tag: string | null;
  created_at: string;
  author?: AuthorInfo;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  savedByMe: boolean;
  poll: PollOption[] | null; // null = not a poll; [] shouldn't happen but guarded
  myVoteOptionId: string | null;
  pinnedAt: string | null; // set = this is the author's pinned "Dreamer of the Week" post
}

interface KComment {
  id: string;
  post_id: string;
  author_id: string;
  text: string;
  created_at: string;
  author?: AuthorInfo;
}

interface StoryGroup {
  authorId: string;
  username: string;
  stories: { id: string; image_url: string; created_at: string; closeFriendsOnly: boolean }[];
  seen: boolean;
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: RADIANT, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 800, color: '#27272a',
    }}>
      {initials(name)}
    </div>
  );
}

// Wrapper: useSearchParams requires a Suspense boundary (same pattern as
// app/upload/page.tsx) since it's used to read the ?tag= cross-link param
// from series pages ("💬 Discuss on Kalpana Circle").
export default function KalpanaCirclePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
        Loading...
      </div>
    }>
      <KalpanaCircleInner />
    </Suspense>
  );
}

function KalpanaCircleInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tagFilter = searchParams.get('tag'); // set when arriving via a series page's "Discuss on Kalpana Circle" link
  const [userId, setUserId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);

  const [posts, setPosts] = useState<KPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [isCreator, setIsCreator] = useState(false);

  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [viewingStory, setViewingStory] = useState<{ groupIdx: number; storyIdx: number } | null>(null);

  const [draft, setDraft] = useState('');
  const [composerTag, setComposerTag] = useState('');
  const [composerImage, setComposerImage] = useState<File | null>(null);
  const [composerPreview, setComposerPreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [pollMode, setPollMode] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  const [openComments, setOpenComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, KComment[]>>({});
  const [commentDraft, setCommentDraft] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const storyFileInputRef = useRef<HTMLInputElement>(null);

  // ── search (was a disabled "coming soon" placeholder) ──
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [userResults, setUserResults] = useState<{ user_id: string; username: string }[]>([]);
  const [postResults, setPostResults] = useState<{ id: string; caption: string | null; username: string }[]>([]);

  // ── auth ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null); // eslint-disable-line react-hooks/set-state-in-effect -- mirrors katube/upload pattern
    });
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- data fetch on userId change, same pattern as katube/upload */
  useEffect(() => {
    if (!userId) { setMyUsername(null); return; }
    supabase.from('creator_profiles').select('username').eq('user_id', userId).maybeSingle()
      .then(({ data }) => setMyUsername(data?.username ?? null));
  }, [userId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── am I a creator? ── mirrors kcircle_enforce_pin_permission's own
  // check (verified YouTube channel OR owns a series) so the pin button
  // only shows where the server would actually allow the pin — RLS
  // additionally restricts pinning to your own posts (kcircle_posts_own_update
  // is author-only), so this only ever appears on posts you wrote.
  /* eslint-disable react-hooks/set-state-in-effect -- data fetch on userId change, same pattern as above */
  useEffect(() => {
    if (!userId) { setIsCreator(false); return; }
    Promise.all([
      supabase.from('creator_profiles').select('verified_youtube_channel_id').eq('user_id', userId).maybeSingle(),
      supabase.from('series').select('id').eq('creator_id', userId).limit(1),
    ]).then(([profRes, seriesRes]) => {
      setIsCreator(!!profRes.data?.verified_youtube_channel_id || (seriesRes.data?.length ?? 0) > 0);
    });
  }, [userId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── load feed ──
  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    let query = supabase
      .from('kcircle_posts').select('id, author_id, caption, image_url, tag, created_at, pinned_at')
      .order('created_at', { ascending: false }).limit(30);
    if (tagFilter) query = query.ilike('tag', tagFilter); // case-insensitive exact match on series title
    const { data: rows } = await query;

    if (!rows || rows.length === 0) { setPosts([]); setLoadingPosts(false); return; }

    const postIds = rows.map(r => r.id);
    const authorIds = Array.from(new Set(rows.map(r => r.author_id)));

    const [profilesRes, likesRes, commentsRes, myLikesRes, mySavesRes, pollOptRes, pollVoteRes, myVoteRes] = await Promise.all([
      supabase.from('creator_profiles').select('user_id, username').in('user_id', authorIds),
      supabase.from('kcircle_post_likes').select('post_id').in('post_id', postIds),
      supabase.from('kcircle_post_comments').select('post_id').in('post_id', postIds),
      userId
        ? supabase.from('kcircle_post_likes').select('post_id').eq('liker_id', userId).in('post_id', postIds)
        : Promise.resolve({ data: [] as { post_id: string }[] }),
      userId
        ? supabase.from('kcircle_saved_posts').select('post_id').eq('user_id', userId).in('post_id', postIds)
        : Promise.resolve({ data: [] as { post_id: string }[] }),
      supabase.from('kcircle_poll_options').select('id, post_id, option_text, position').in('post_id', postIds).order('position', { ascending: true }),
      supabase.from('kcircle_poll_votes').select('post_id, option_id').in('post_id', postIds),
      userId
        ? supabase.from('kcircle_poll_votes').select('post_id, option_id').eq('voter_id', userId).in('post_id', postIds)
        : Promise.resolve({ data: [] as { post_id: string; option_id: string }[] }),
    ]);

    const usernameMap = new Map((profilesRes.data ?? []).map(p => [p.user_id, p.username]));
    const likeCounts = new Map<string, number>();
    (likesRes.data ?? []).forEach(l => likeCounts.set(l.post_id, (likeCounts.get(l.post_id) ?? 0) + 1));
    const commentCounts = new Map<string, number>();
    (commentsRes.data ?? []).forEach(c => commentCounts.set(c.post_id, (commentCounts.get(c.post_id) ?? 0) + 1));
    const myLiked = new Set((myLikesRes.data ?? []).map(l => l.post_id));
    const mySaved = new Set((mySavesRes.data ?? []).map(s => s.post_id));

    const voteCounts = new Map<string, number>(); // keyed by option_id
    (pollVoteRes.data ?? []).forEach(v => voteCounts.set(v.option_id, (voteCounts.get(v.option_id) ?? 0) + 1));
    const optionsByPost = new Map<string, PollOption[]>();
    (pollOptRes.data ?? []).forEach(o => {
      const list = optionsByPost.get(o.post_id) ?? [];
      list.push({ id: o.id, option_text: o.option_text, position: o.position, votes: voteCounts.get(o.id) ?? 0 });
      optionsByPost.set(o.post_id, list);
    });
    const myVoteByPost = new Map((myVoteRes.data ?? []).map(v => [v.post_id, v.option_id]));

    const mapped = rows.map(r => ({
      ...r,
      author: { username: usernameMap.get(r.author_id) ?? 'dreamer' },
      likeCount: likeCounts.get(r.id) ?? 0,
      commentCount: commentCounts.get(r.id) ?? 0,
      likedByMe: myLiked.has(r.id),
      savedByMe: mySaved.has(r.id),
      poll: optionsByPost.get(r.id) ?? null,
      myVoteOptionId: myVoteByPost.get(r.id) ?? null,
      pinnedAt: r.pinned_at,
    }));
    // Pinned ("Dreamer of the Week") posts float to the top, most
    // recently pinned first; everything else keeps the created_at order
    // the query already fetched it in.
    mapped.sort((a, b) => {
      if (a.pinnedAt && b.pinnedAt) return b.pinnedAt.localeCompare(a.pinnedAt);
      if (a.pinnedAt) return -1;
      if (b.pinnedAt) return 1;
      return 0;
    });
    setPosts(mapped);
    setLoadingPosts(false);
  }, [userId, tagFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/userId/tagFilter change, same pattern as katube/upload
  useEffect(() => { loadPosts(); }, [loadPosts]);

  // Arriving via a series page's cross-link ("?tag=SeriesTitle") — prefill the
  // composer's tag field once so a reply naturally stays tagged to that series too.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill from URL, mirrors loadPosts pattern above
  useEffect(() => { if (tagFilter) setComposerTag(tagFilter); }, [tagFilter]);

  // ── load stories ──
  const loadStories = useCallback(async () => {
    const { data: rows } = await supabase
      .from('kcircle_stories').select('id, author_id, image_url, created_at, close_friends_only')
      .order('created_at', { ascending: true });
    if (!rows || rows.length === 0) { setStories([]); return; }

    const authorIds = Array.from(new Set(rows.map(r => r.author_id)));
    const [profilesRes, viewsRes] = await Promise.all([
      supabase.from('creator_profiles').select('user_id, username').in('user_id', authorIds),
      userId
        ? supabase.from('kcircle_story_views').select('story_id').eq('viewer_id', userId)
        : Promise.resolve({ data: [] as { story_id: string }[] }),
    ]);
    const usernameMap = new Map((profilesRes.data ?? []).map(p => [p.user_id, p.username]));
    const seenIds = new Set((viewsRes.data ?? []).map(v => v.story_id));

    const grouped = new Map<string, StoryGroup>();
    rows.forEach(r => {
      const g: StoryGroup = grouped.get(r.author_id) ?? {
        authorId: r.author_id, username: usernameMap.get(r.author_id) ?? 'dreamer',
        stories: [] as StoryGroup['stories'], seen: true,
      };
      g.stories.push({ id: r.id, image_url: r.image_url, created_at: r.created_at, closeFriendsOnly: r.close_friends_only });
      if (!seenIds.has(r.id)) g.seen = false;
      grouped.set(r.author_id, g);
    });
    setStories(Array.from(grouped.values()));
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/userId change, same pattern as katube/upload
  useEffect(() => { loadStories(); }, [loadStories]);

  // ── composer ──
  const handleComposerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setComposerImage(file);
    setComposerPreview(URL.createObjectURL(file));
  };

  const submitPost = async () => {
    if (!userId) { setPostError('Log in to post.'); return; }
    if (!draft.trim() && !composerImage) { setPostError('Write something or add a photo first.'); return; }
    const cleanOptions = pollMode ? pollOptions.map(o => o.trim()).filter(Boolean) : [];
    if (pollMode && cleanOptions.length < 2) { setPostError('A poll needs at least 2 options.'); return; }
    setPosting(true); setPostError('');

    let imageUrl: string | null = null;
    if (composerImage) {
      const ext = composerImage.name.split('.').pop();
      const path = `posts/${userId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('kcircle-media').upload(path, composerImage, { upsert: true });
      if (upErr) { setPostError(`Upload failed: ${upErr.message}`); setPosting(false); return; }
      imageUrl = supabase.storage.from('kcircle-media').getPublicUrl(path).data.publicUrl;
    }

    const { error, data: newPost } = await supabase.from('kcircle_posts').insert({
      author_id: userId, caption: draft.trim() || null, image_url: imageUrl,
      tag: composerTag.trim() || null,
    }).select('id').single();
    if (error) { setPostError(error.message); setPosting(false); return; }

    if (cleanOptions.length && newPost) {
      const { error: pollErr } = await supabase.from('kcircle_poll_options')
        .insert(cleanOptions.map((option_text, position) => ({ post_id: newPost.id, option_text, position })));
      if (pollErr) { setPostError(`Post published, but the poll failed to save: ${pollErr.message}`); }
    }

    setDraft(''); setComposerImage(null); setComposerPreview(null);
    setPollMode(false); setPollOptions(['', '']);
    setPosting(false);
    loadPosts();
  };

  // ── notifications ── fire-and-forget insert, actor-scoped per RLS
  // (kcircle_notifications_actor_insert), skipped for self-actions so a
  // user liking/commenting their own post never trips the "actor_id <>
  // recipient_id" check or clutters their own inbox.
  const notify = (recipientId: string, type: 'like' | 'comment' | 'message' | 'group_add', extra: { post_id?: string; conversation_id?: string; preview?: string } = {}) => {
    if (!userId || userId === recipientId) return;
    supabase.from('kcircle_notifications').insert({ recipient_id: recipientId, actor_id: userId, type, ...extra }).then();
  };

  // ── likes ──
  const toggleLike = async (post: KPost) => {
    if (!userId) { setPostLoginRedirect('/kalpana-circle'); router.push('/login?next=/kalpana-circle'); return; }
    setPosts(prev => prev.map(p => p.id === post.id
      ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
      : p));
    if (post.likedByMe) {
      await supabase.from('kcircle_post_likes').delete().eq('post_id', post.id).eq('liker_id', userId);
    } else {
      await supabase.from('kcircle_post_likes').insert({ post_id: post.id, liker_id: userId });
      notify(post.author_id, 'like', { post_id: post.id });
    }
  };

  // ── poll voting ── one vote per user per poll (kcircle_poll_votes PK),
  // but can switch — insert if no existing vote, update to move it,
  // delete to retract by tapping the same option again.
  const castVote = async (post: KPost, optionId: string) => {
    if (!userId) { setPostLoginRedirect('/kalpana-circle'); router.push('/login?next=/kalpana-circle'); return; }
    if (!post.poll) return;
    const prevOptionId = post.myVoteOptionId;
    const retracting = prevOptionId === optionId;

    setPosts(prev => prev.map(p => {
      if (p.id !== post.id || !p.poll) return p;
      const poll = p.poll.map(o => {
        if (retracting && o.id === optionId) return { ...o, votes: o.votes - 1 };
        if (!retracting && o.id === optionId) return { ...o, votes: o.votes + 1 };
        if (!retracting && prevOptionId && o.id === prevOptionId) return { ...o, votes: o.votes - 1 };
        return o;
      });
      return { ...p, poll, myVoteOptionId: retracting ? null : optionId };
    }));

    if (retracting) {
      await supabase.from('kcircle_poll_votes').delete().eq('post_id', post.id).eq('voter_id', userId);
    } else if (prevOptionId) {
      await supabase.from('kcircle_poll_votes').update({ option_id: optionId }).eq('post_id', post.id).eq('voter_id', userId);
    } else {
      await supabase.from('kcircle_poll_votes').insert({ post_id: post.id, option_id: optionId, voter_id: userId });
    }
  };

  // ── dreamer of the week ── RLS only allows updating your own posts
  // (kcircle_posts_own_update), so despite the server trigger's broader
  // "any creator can pin" check, in practice this only ever pins your own
  // post. The trigger sets/clears pinned_at automatically.
  const togglePin = async (post: KPost) => {
    if (!userId) return;
    const pinning = !post.pinnedAt;
    const { error } = await supabase.from('kcircle_posts')
      .update({ pinned_by: pinning ? userId : null }).eq('id', post.id);
    if (error) return;
    loadPosts();
  };

  // ── saves ──
  const toggleSave = async (post: KPost) => {
    if (!userId) { setPostLoginRedirect('/kalpana-circle'); router.push('/login?next=/kalpana-circle'); return; }
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, savedByMe: !p.savedByMe } : p));
    if (post.savedByMe) {
      await supabase.from('kcircle_saved_posts').delete().eq('post_id', post.id).eq('user_id', userId);
    } else {
      await supabase.from('kcircle_saved_posts').insert({ post_id: post.id, user_id: userId });
    }
  };

  // ── comments ──
  const toggleComments = async (postId: string) => {
    if (openComments === postId) { setOpenComments(null); return; }
    setOpenComments(postId);
    if (!comments[postId]) {
      const { data: rows } = await supabase.from('kcircle_post_comments')
        .select('id, post_id, author_id, text, created_at').eq('post_id', postId).order('created_at', { ascending: true });
      const authorIds = Array.from(new Set((rows ?? []).map(r => r.author_id)));
      const { data: profs } = authorIds.length
        ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', authorIds)
        : { data: [] as { user_id: string; username: string }[] };
      const usernameMap = new Map((profs ?? []).map(p => [p.user_id, p.username]));
      setComments(prev => ({
        ...prev,
        [postId]: (rows ?? []).map(r => ({ ...r, author: { username: usernameMap.get(r.author_id) ?? 'dreamer' } })),
      }));
    }
  };

  const submitComment = async (postId: string) => {
    if (!userId) { setPostLoginRedirect('/kalpana-circle'); router.push('/login?next=/kalpana-circle'); return; }
    if (!commentDraft.trim()) return;
    const text = commentDraft.trim();
    setCommentDraft('');
    const { error, data } = await supabase.from('kcircle_post_comments')
      .insert({ post_id: postId, author_id: userId, text }).select('id, post_id, author_id, text, created_at').single();
    if (!error && data) {
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] ?? []), { ...data, author: { username: myUsername ?? 'you' } }] }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p));
      const owner = posts.find(p => p.id === postId)?.author_id;
      if (owner) notify(owner, 'comment', { post_id: postId, preview: text.slice(0, 80) });
    }
  };

  // ── stories: add + view ──
  // Two-step: file select stages a pending upload, then a small audience
  // picker (Public vs 🟢 Close Friends) decides kcircle_stories.close_friends_only
  // before the actual upload fires.
  const [pendingStoryFile, setPendingStoryFile] = useState<File | null>(null);
  const [postingStory, setPostingStory] = useState(false);

  const handleAddStory = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!userId) { setPostLoginRedirect('/kalpana-circle'); router.push('/login?next=/kalpana-circle'); return; }
    setPendingStoryFile(file);
  };

  const uploadStory = async (closeFriendsOnly: boolean) => {
    if (!pendingStoryFile || !userId) return;
    setPostingStory(true);
    const file = pendingStoryFile;
    const ext = file.name.split('.').pop();
    const path = `stories/${userId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('kcircle-media').upload(path, file, { upsert: true });
    if (upErr) { setPostingStory(false); setPendingStoryFile(null); return; }
    const imageUrl = supabase.storage.from('kcircle-media').getPublicUrl(path).data.publicUrl;
    await supabase.from('kcircle_stories').insert({ author_id: userId, image_url: imageUrl, close_friends_only: closeFriendsOnly });
    setPendingStoryFile(null);
    setPostingStory(false);
    loadStories();
  };

  const openStoryGroup = (idx: number) => setViewingStory({ groupIdx: idx, storyIdx: 0 });

  const advanceStory = useCallback(async () => {
    if (!viewingStory) return;
    const group = stories[viewingStory.groupIdx];
    if (!group) { setViewingStory(null); return; }
    const story = group.stories[viewingStory.storyIdx];
    if (userId && story) {
      const { error: viewErr } = await supabase.from('kcircle_story_views').upsert({ story_id: story.id, viewer_id: userId });
      // Previously this error was swallowed and the "seen" ring only ever
      // updated on a full reload (loadStories() was never re-called after
      // viewing). Now: log failures, and flip the ring locally right away
      // on success so it doesn't require a refresh.
      if (viewErr) {
        console.error('Failed to mark story as viewed:', viewErr.message);
      } else {
        setStories(prev => prev.map((g, i) => i === viewingStory.groupIdx ? { ...g, seen: true } : g));
      }
    }
    if (viewingStory.storyIdx + 1 < group.stories.length) {
      setViewingStory({ ...viewingStory, storyIdx: viewingStory.storyIdx + 1 });
    } else if (viewingStory.groupIdx + 1 < stories.length) {
      setViewingStory({ groupIdx: viewingStory.groupIdx + 1, storyIdx: 0 });
    } else {
      setViewingStory(null);
      loadStories();
    }
  }, [viewingStory, stories, userId, loadStories]);

  useEffect(() => {
    if (!viewingStory) return;
    const t = setTimeout(() => { advanceStory(); }, 4000);
    return () => clearTimeout(t);
  }, [viewingStory, advanceStory]);

  // ── search: debounced, searches usernames + post captions in parallel ──
  /* eslint-disable react-hooks/set-state-in-effect -- clearing/loading state for a debounced search, same pattern used elsewhere in this file */
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setUserResults([]); setPostResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      const [usersRes, postsRes] = await Promise.all([
        supabase.from('creator_profiles').select('user_id, username').ilike('username', `%${q}%`).limit(10),
        supabase.from('kcircle_posts').select('id, caption, author_id').ilike('caption', `%${q}%`).limit(10),
      ]);
      const authorIds = Array.from(new Set((postsRes.data ?? []).map(p => p.author_id)));
      const { data: profiles } = authorIds.length
        ? await supabase.from('creator_profiles').select('user_id, username').in('user_id', authorIds)
        : { data: [] as { user_id: string; username: string }[] };
      const usernameMap = new Map((profiles ?? []).map(p => [p.user_id, p.username]));
      setUserResults(usersRes.data ?? []);
      setPostResults((postsRes.data ?? []).map(p => ({ id: p.id, caption: p.caption, username: usernameMap.get(p.author_id) ?? 'dreamer' })));
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const closeSearch = () => { setShowSearch(false); setSearchQuery(''); setUserResults([]); setPostResults([]); };

  const navHref = (path: string) => (userId ? path : `/login?next=${encodeURIComponent(path)}`);
  const profileHref = userId ? (myUsername ? `/creator/${myUsername}` : '/home') : '/login?next=/kalpana-circle';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', overflowX: 'hidden' }} className="kc-page">

      {/* Responsive rules (plain <style> tag: media queries can't be
          expressed with inline style={{}} objects) — same pattern as
          app/WebMangal/View.tsx. Desktop/laptop = Instagram-web layout
          (top icon nav, no bottom tab bar). Mobile = Instagram-mobile-web
          layout (compact top header + bottom tab bar). Breakpoint matches
          the rest of the codebase (768px). */}
      <style>{`
        .kc-nav-desktop { display: none; }
        .kc-nav-mobile { display: flex; }
        .kc-bottom-nav { display: flex; }
        .kc-page { padding-bottom: 76px; }
        @media (min-width: 768px) {
          .kc-nav-desktop { display: flex; }
          .kc-nav-mobile { display: none; }
          .kc-bottom-nav { display: none; }
          .kc-page { padding-bottom: 40px; }
        }
        /* Very-small-phone tier (same 380px breakpoint app/page.tsx and
           app/home/page.tsx already use for their own nav bars) — the
           mobile nav's three chunks (MANGAL icon, K Circle wordmark logo,
           KaTube pill + theme toggle) were sized only for >=~320px and had
           no room to give up, so anything narrower silently squeezed the
           KaTube pill's text against the wordmark logo. Below 380px the
           KaTube pill drops to icon-only (still a real tappable link, just
           without the label) and side padding/gap shrink to claim back a
           few px. */
        @media (max-width: 380px) {
          .kc-nav-mobile { padding: 0 10px !important; gap: 4px; }
          .kc-katube-badge-text { display: none; }
          .kc-katube-badge { padding: 7px 8px !important; }
        }
      `}</style>

      {/* ── MOBILE NAV (Instagram mobile-web style: compact header, icons live in the bottom tab bar) ── */}
      <nav className="kc-nav-mobile" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 14px', height: '58px',
        alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0, minWidth: 0 }}>
          <Image src="/icon.png" alt="MANGAL" width={28} height={28} style={{ display: 'block', borderRadius: '7px', flexShrink: 0 }} />
        </Link>
        <Image src="/kcircle-logo.png" alt="K Circle" width={130} height={56} style={{ display: 'block', height: '28px', width: 'auto', objectFit: 'contain' }} priority />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <Link href="/katube" className="kc-katube-badge" style={{
            padding: '7px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
            color: '#2563eb', textDecoration: 'none', border: '1px solid rgba(37,99,235,0.35)',
            whiteSpace: 'nowrap',
          }}>🎬<span className="kc-katube-badge-text"> KaTube</span></Link>
          <NotificationBell userId={userId} iconSize={18} />
          <ThemeToggle size={28} />
        </div>
      </nav>

      {/* ── DESKTOP/LAPTOP NAV (Instagram-web style: full top bar with home/chat/create/profile icons, no bottom tab bar) ── */}
      <nav className="kc-nav-desktop" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 24px', height: '64px',
        alignItems: 'center', justifyContent: 'space-between', gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}>
            <Image src="/icon.png" alt="MANGAL" width={30} height={30} style={{ display: 'block', borderRadius: '8px' }} />
          </Link>
          <Image src="/kcircle-logo.png" alt="K Circle" width={150} height={64} style={{ display: 'block', height: '32px', width: 'auto', objectFit: 'contain' }} priority />
          <button onClick={() => setShowSearch(true)} style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '280px',
            fontSize: '12.5px', color: 'var(--text-tertiary)', background: 'var(--bg-card)',
            border: '1px solid var(--border-color)', borderRadius: '20px', padding: '8px 14px', cursor: 'pointer',
          }}>🔍 Search</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexShrink: 0 }}>
          <Link href="/kalpana-circle" title="Home" style={{ fontSize: '19px', textDecoration: 'none', color: RADIANT_SOLID }}>🏠</Link>
          <Link href={navHref('/kalpana-circle/chat')} title="Chat" style={{ fontSize: '19px', textDecoration: 'none', color: 'var(--text-tertiary)' }}>💬</Link>
          <Link href={navHref('/kalpana-circle/saved')} title="Saved" style={{ fontSize: '19px', textDecoration: 'none', color: 'var(--text-tertiary)' }}>🔖</Link>
          <button onClick={() => fileInputRef.current?.click()} title="Create post" style={{
            background: RADIANT, border: 'none', width: '32px', height: '32px', borderRadius: '9px',
            fontSize: '16px', fontWeight: 900, color: '#27272a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>+</button>
          <NotificationBell userId={userId} iconSize={19} />
          <Link href={profileHref} title="Profile" style={{ textDecoration: 'none' }}>
            <Avatar name={myUsername ?? 'you'} size={28} />
          </Link>
          <Link href="/katube" style={{
            padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            color: '#2563eb', textDecoration: 'none', border: '1px solid rgba(37,99,235,0.35)', whiteSpace: 'nowrap',
          }}>🎬 KaTube</Link>
          <ThemeToggle size={28} />
        </div>
      </nav>

      {/* ── SEARCH OVERLAY ── */}
      {showSearch && (
        <div onClick={closeSearch} style={{
          position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '8vh',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '92%', maxWidth: '480px', maxHeight: '76vh', display: 'flex', flexDirection: 'column',
            background: 'var(--bg-primary)', borderRadius: '14px', border: '1px solid var(--border-color)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search dreamers or posts…"
                style={{
                  flex: 1, fontSize: '13.5px', padding: '9px 12px', borderRadius: '8px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none',
                }}
              />
              <button onClick={closeSearch} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-primary)' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '4px 0' }}>
              {searchLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12.5px', padding: '24px 0' }}>Searching…</p>
              ) : !searchQuery.trim() ? (
                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12.5px', padding: '24px 14px' }}>Search for a username or something someone posted.</p>
              ) : userResults.length === 0 && postResults.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12.5px', padding: '24px 0' }}>No results for &ldquo;{searchQuery}&rdquo;.</p>
              ) : (
                <>
                  {userResults.length > 0 && (
                    <div style={{ padding: '6px 14px' }}>
                      <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.05em', margin: '6px 0' }}>DREAMERS</div>
                      {userResults.map(u => (
                        <Link key={u.user_id} href={`/creator/${u.username}`} onClick={closeSearch} style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', textDecoration: 'none', color: 'var(--text-primary)',
                        }}>
                          <Avatar name={u.username} size={32} />
                          <span style={{ fontSize: '13px', fontWeight: 700 }}>{u.username}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                  {postResults.length > 0 && (
                    <div style={{ padding: '6px 14px', borderTop: userResults.length ? '1px solid var(--border-color)' : 'none' }}>
                      <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.05em', margin: '6px 0' }}>POSTS</div>
                      {postResults.map(p => (
                        <Link key={p.id} href={`/creator/${p.username}`} onClick={closeSearch} style={{
                          display: 'block', padding: '8px 0', textDecoration: 'none', color: 'var(--text-primary)',
                        }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)' }}>@{p.username}</div>
                          <div style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.caption}</div>
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── STORIES BAR ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '14px', overflowX: 'auto', padding: '14px 14px 4px',
        maxWidth: '640px', margin: '0 auto', WebkitOverflowScrolling: 'touch',
      }}>
        <div onClick={() => storyFileInputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', flexShrink: 0, cursor: 'pointer', width: '62px' }}>
          <div style={{ position: 'relative', width: '58px', height: '58px' }}>
            <Avatar name={myUsername ?? 'you'} size={58} />
            <div style={{
              position: 'absolute', bottom: -2, right: -2, width: '20px', height: '20px', borderRadius: '50%',
              background: RADIANT_SOLID, border: '2px solid var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', color: '#fff', fontWeight: 900, lineHeight: 1,
            }}>+</div>
          </div>
          <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', fontWeight: 600 }}>Your Story</span>
        </div>
        <input ref={storyFileInputRef} type="file" accept="image/*" onChange={handleAddStory} style={{ display: 'none' }} />

        {stories.map((g, idx) => {
          const isCloseFriendsStory = g.stories.some(s => s.closeFriendsOnly);
          return (
            <div key={g.authorId} onClick={() => openStoryGroup(idx)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', flexShrink: 0, cursor: 'pointer', width: '62px' }}>
              <div style={{
                width: '58px', height: '58px', borderRadius: '50%', padding: '2.5px',
                background: g.seen ? 'var(--border-color)' : (isCloseFriendsStory ? GREEN : RADIANT),
              }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: '2px solid var(--bg-primary)', overflow: 'hidden' }}>
                  <Avatar name={g.username} size={51} />
                </div>
              </div>
              <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '62px' }}>{g.username}</span>
            </div>
          );
        })}
      </div>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 14px 12px', textAlign: 'right' }}>
        <Link href={navHref('/kalpana-circle/close-friends')} style={{ fontSize: '10.5px', fontWeight: 700, color: GREEN, textDecoration: 'none' }}>
          🟢 Manage Close Friends
        </Link>
      </div>

      {/* ── STORY AUDIENCE PICKER — shown after choosing a file, before upload ── */}
      {pendingStoryFile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '340px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 800, margin: '0 0 4px' }}>Share your story with…</h3>
            <p style={{ fontSize: '11.5px', color: 'var(--text-tertiary)', margin: '0 0 16px' }}>Visible for 24 hours.</p>
            <button onClick={() => uploadStory(false)} disabled={postingStory} style={{
              width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: '10px', marginBottom: '8px',
              border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)',
              cursor: postingStory ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 700,
            }}>🌍 Everyone</button>
            <button onClick={() => uploadStory(true)} disabled={postingStory} style={{
              width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: '10px', marginBottom: '14px',
              border: `1px solid ${GREEN}`, background: 'rgba(34,197,94,0.1)', color: GREEN,
              cursor: postingStory ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 700,
            }}>🟢 Close Friends</button>
            <button onClick={() => setPendingStoryFile(null)} disabled={postingStory} style={{
              width: '100%', textAlign: 'center', padding: '8px', border: 'none', background: 'transparent',
              color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '12px',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── STORY VIEWER ── */}
      {viewingStory && stories[viewingStory.groupIdx] && (
        <div onClick={() => advanceStory()} style={{
          position: 'fixed', inset: 0, zIndex: 300, background: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <button onClick={(e) => { e.stopPropagation(); setViewingStory(null); }} style={{
            position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.15)', border: 'none',
            color: '#fff', width: '34px', height: '34px', borderRadius: '50%', fontSize: '18px', cursor: 'pointer', zIndex: 2,
          }}>✕</button>
          <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', display: 'flex', gap: '4px' }}>
            {stories[viewingStory.groupIdx].stories.map((_, i) => (
              <div key={i} style={{ flex: 1, height: '2.5px', borderRadius: '2px', background: i <= viewingStory.storyIdx ? '#fff' : 'rgba(255,255,255,0.35)' }} />
            ))}
          </div>
          <div style={{ position: 'absolute', top: '22px', left: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Avatar name={stories[viewingStory.groupIdx].username} size={30} />
            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>{stories[viewingStory.groupIdx].username}</span>
            {stories[viewingStory.groupIdx].stories[viewingStory.storyIdx].closeFriendsOnly && (
              <span style={{ fontSize: '10px', fontWeight: 800, color: GREEN, background: 'rgba(34,197,94,0.18)', padding: '2px 8px', borderRadius: '10px' }}>
                🟢 Close Friends
              </span>
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={stories[viewingStory.groupIdx].stories[viewingStory.storyIdx].image_url}
            alt="story"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      )}

      {/* ── TAG FILTER BANNER — shown when arriving via a series page's
          "💬 Discuss on Kalpana Circle" link (?tag=SeriesTitle) ── */}
      {tagFilter && (
        <div style={{ maxWidth: '640px', margin: '0 auto 12px', padding: '0 14px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            padding: '10px 14px', borderRadius: '10px', background: 'rgba(124,58,237,0.1)',
            border: '1px solid rgba(124,58,237,0.3)', fontSize: '12.5px', fontWeight: 600, color: '#a78bfa',
          }}>
            <span>Showing posts tagged &ldquo;{tagFilter}&rdquo;</span>
            <Link href="/kalpana-circle" style={{ color: '#a78bfa', fontWeight: 800, textDecoration: 'none' }}>✕ Clear</Link>
          </div>
        </div>
      )}

      {/* ── COMPOSER ── */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 14px' }}>
        <div style={{
          padding: '14px 16px', borderRadius: '14px', background: 'var(--bg-card)',
          border: '1px solid var(--border-color)', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Avatar name={myUsername ?? 'you'} size={36} />
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={userId ? 'Share a theory, fan art, or request...' : 'Log in to post...'}
              rows={2}
              disabled={!userId}
              style={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none', resize: 'none',
                background: 'transparent', color: 'var(--text-primary)', fontSize: '13.5px',
                fontFamily: 'inherit',
              }}
            />
          </div>
          {userId && (
            <input
              value={composerTag}
              onChange={e => setComposerTag(e.target.value)}
              placeholder="🏷️ Tag a series (optional) — e.g. exact series title"
              style={{
                width: '100%', marginTop: '8px', padding: '7px 10px', borderRadius: '8px',
                border: '1px solid var(--border-color)', background: 'transparent',
                color: 'var(--text-secondary)', fontSize: '12px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          )}
          {composerPreview && (
            <div style={{ position: 'relative', marginTop: '10px', borderRadius: '10px', overflow: 'hidden', maxHeight: '260px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={composerPreview} alt="preview" style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', display: 'block' }} />
              <button onClick={() => { setComposerImage(null); setComposerPreview(null); }} style={{
                position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.55)', border: 'none',
                color: '#fff', width: '26px', height: '26px', borderRadius: '50%', cursor: 'pointer',
              }}>✕</button>
            </div>
          )}
          {pollMode && (
            <div style={{ marginTop: '10px', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <label style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>POLL OPTIONS</label>
              {pollOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <input
                    value={opt}
                    onChange={e => setPollOptions(prev => prev.map((o, j) => j === i ? e.target.value : o))}
                    placeholder={`Option ${i + 1}`}
                    maxLength={80}
                    style={{
                      flex: 1, minWidth: 0, fontSize: '12.5px', padding: '7px 10px', borderRadius: '8px',
                      border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none',
                    }}
                  />
                  {pollOptions.length > 2 && (
                    <button onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))} style={{
                      background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '15px', padding: '0 4px',
                    }}>✕</button>
                  )}
                </div>
              ))}
              {pollOptions.length < 4 && (
                <button onClick={() => setPollOptions(prev => [...prev, ''])} style={{
                  marginTop: '8px', background: 'none', border: 'none', color: RADIANT_SOLID, fontWeight: 700,
                  fontSize: '12px', cursor: 'pointer', padding: 0,
                }}>+ Add option</button>
              )}
            </div>
          )}
          {postError && <p style={{ fontSize: '12px', color: '#ef4444', margin: '8px 0 0' }}>{postError}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => fileInputRef.current?.click()} disabled={!userId} style={{
                fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', background: 'transparent',
                border: '1px solid var(--border-color)', borderRadius: '8px', padding: '7px 12px', cursor: userId ? 'pointer' : 'not-allowed',
              }}>📷 Photo</button>
              <button onClick={() => setPollMode(v => !v)} disabled={!userId} style={{
                fontSize: '12px', fontWeight: 700, color: pollMode ? RADIANT_SOLID : 'var(--text-secondary)',
                background: 'transparent', border: `1px solid ${pollMode ? RADIANT_SOLID : 'var(--border-color)'}`,
                borderRadius: '8px', padding: '7px 12px', cursor: userId ? 'pointer' : 'not-allowed',
              }}>📊 Poll</button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleComposerFile} style={{ display: 'none' }} />
            {userId ? (
              <button onClick={submitPost} disabled={posting} style={{
                fontSize: '12.5px', fontWeight: 800, padding: '8px 20px', borderRadius: '8px', border: 'none',
                background: RADIANT, color: '#27272a', cursor: posting ? 'wait' : 'pointer',
              }}>{posting ? 'Posting…' : 'Post'}</button>
            ) : (
              <Link href="/login?next=/kalpana-circle" style={{
                fontSize: '12.5px', fontWeight: 800, padding: '8px 20px', borderRadius: '8px',
                background: RADIANT, color: '#27272a', textDecoration: 'none',
              }}>Log in to post</Link>
            )}
          </div>
        </div>

        {/* ── FEED ── */}
        {loadingPosts ? (
          <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px', padding: '30px 0' }}>Loading feed…</p>
        ) : posts.length === 0 ? (
          <div style={{ padding: '16px 20px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)', textAlign: 'center' }}>
            <p style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
              No posts yet — be the first to share a theory, fan art, or request.
            </p>
          </div>
        ) : posts.map(post => (
          <div key={post.id} style={{
            borderRadius: '14px', background: 'var(--bg-card)', border: `1px solid ${post.pinnedAt ? RADIANT_SOLID : 'var(--border-color)'}`,
            marginBottom: '14px', overflow: 'hidden',
          }}>
            {post.pinnedAt && (
              <div style={{
                padding: '6px 14px', fontSize: '11px', fontWeight: 800, color: '#27272a', background: RADIANT,
                display: 'flex', alignItems: 'center', gap: '5px',
              }}>🌟 Dreamer of the Week</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px' }}>
              <Avatar name={post.author?.username ?? 'dreamer'} size={34} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.author?.username}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{timeAgo(post.created_at)} ago</div>
              </div>
              {isCreator && post.author_id === userId && (
                <button onClick={() => togglePin(post)} title={post.pinnedAt ? 'Unpin' : 'Pin as Dreamer of the Week'} style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px',
                  color: post.pinnedAt ? RADIANT_SOLID : 'var(--text-tertiary)', flexShrink: 0,
                }}>📌</button>
              )}
            </div>

            {post.caption && (
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 10px', padding: '0 14px' }}>
                {post.caption}
              </p>
            )}

            {post.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.image_url} alt="" style={{ width: '100%', maxHeight: '520px', objectFit: 'cover', display: 'block' }} />
            )}

            {post.poll && post.poll.length > 0 && (() => {
              const total = post.poll.reduce((sum, o) => sum + o.votes, 0);
              return (
                <div style={{ padding: '2px 14px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {post.poll.map(opt => {
                    const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
                    const mine = post.myVoteOptionId === opt.id;
                    return (
                      <button key={opt.id} onClick={() => castVote(post, opt.id)} style={{
                        position: 'relative', textAlign: 'left', border: `1px solid ${mine ? RADIANT_SOLID : 'var(--border-color)'}`,
                        borderRadius: '9px', padding: '8px 12px', cursor: 'pointer', background: 'var(--bg-primary)',
                        overflow: 'hidden', fontSize: '12.5px', fontWeight: mine ? 800 : 600, color: 'var(--text-primary)',
                      }}>
                        <div style={{
                          position: 'absolute', inset: 0, width: `${pct}%`, background: mine ? 'rgba(113,113,122,0.28)' : 'rgba(113,113,122,0.14)',
                          transition: 'width 0.25s ease',
                        }} />
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                          <span>{mine ? '✓ ' : ''}{opt.option_text}</span>
                          <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{pct}% · {opt.votes}</span>
                        </div>
                      </button>
                    );
                  })}
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{total} vote{total === 1 ? '' : 's'}{post.myVoteOptionId ? ' · tap your pick again to retract' : ''}</span>
                </div>
              );
            })()}

            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '12px 14px' }}>
              <button onClick={() => toggleLike(post)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: '12.5px', color: post.likedByMe ? '#ef4444' : 'var(--text-tertiary)',
                display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700,
              }}>{post.likedByMe ? '❤️' : '🤍'} {post.likeCount}</button>
              <button onClick={() => toggleComments(post.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: '12.5px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700,
              }}>💬 {post.commentCount}</button>
              <button onClick={() => toggleSave(post)} title={post.savedByMe ? 'Unsave' : 'Save'} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 'auto',
                fontSize: '15px', color: post.savedByMe ? RADIANT_SOLID : 'var(--text-tertiary)',
              }}>{post.savedByMe ? '🔖' : '📑'}</button>
            </div>

            {openComments === post.id && (
              <div style={{ borderTop: '1px solid var(--border-color)', padding: '10px 14px 14px' }}>
                {(comments[post.id] ?? []).map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <Avatar name={c.author?.username ?? 'dreamer'} size={24} />
                    <p style={{ fontSize: '12.5px', margin: 0, lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 800 }}>{c.author?.username} </span>
                      <span style={{ color: 'var(--text-secondary)' }}>{c.text}</span>
                    </p>
                  </div>
                ))}
                {userId ? (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <input
                      value={commentDraft}
                      onChange={e => setCommentDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitComment(post.id); }}
                      placeholder="Add a comment…"
                      style={{
                        flex: 1, minWidth: 0, fontSize: '12.5px', padding: '8px 10px', borderRadius: '8px',
                        border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none',
                      }}
                    />
                    <button onClick={() => submitComment(post.id)} style={{
                      fontSize: '12px', fontWeight: 800, padding: '8px 14px', borderRadius: '8px', border: 'none',
                      background: RADIANT, color: '#27272a', cursor: 'pointer', flexShrink: 0,
                    }}>Send</button>
                  </div>
                ) : (
                  <Link href="/login?next=/kalpana-circle" style={{ fontSize: '12px', color: RADIANT_SOLID, fontWeight: 700 }}>Log in to comment</Link>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── BOTTOM TAB BAR — mobile only (Instagram mobile-web pattern); hidden on desktop via .kc-bottom-nav in the <style> block above, where the top nav's icons take over ── */}
      <div className="kc-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--nav-bg)', backdropFilter: 'blur(16px)', borderTop: '1px solid var(--border-color)',
        alignItems: 'center', justifyContent: 'space-around', height: '58px', maxWidth: '640px', margin: '0 auto',
      }}>
        <Link href="/kalpana-circle" style={{ fontSize: '20px', textDecoration: 'none', color: RADIANT_SOLID }}>🏠</Link>
        <button onClick={() => setShowSearch(true)} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--text-tertiary)', cursor: 'pointer' }}>🔍</button>
        <button onClick={() => fileInputRef.current?.click()} style={{
          background: RADIANT, border: 'none', width: '34px', height: '34px', borderRadius: '9px',
          fontSize: '17px', fontWeight: 900, color: '#27272a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>+</button>
        <Link href={navHref('/kalpana-circle/chat')} style={{ fontSize: '20px', textDecoration: 'none', color: 'var(--text-tertiary)' }}>💬</Link>
        <Link href={navHref('/kalpana-circle/saved')} style={{ fontSize: '20px', textDecoration: 'none', color: 'var(--text-tertiary)' }}>🔖</Link>
        <Link href={userId ? (myUsername ? `/creator/${myUsername}` : '/home') : '/login?next=/kalpana-circle'} style={{ fontSize: '20px', textDecoration: 'none', color: 'var(--text-tertiary)' }}>👤</Link>
      </div>
    </div>
  );
}
