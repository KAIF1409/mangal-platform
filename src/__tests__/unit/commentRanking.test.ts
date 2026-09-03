import { describe, expect, it } from 'vitest';
import {
  COMMENT_PAGE_SIZE,
  REVIEW_PAGE_SIZE,
  instagramPreviewComments,
  sortByScore,
  webnovelCommentScore,
  youtubeCommentScore,
} from '@/app/lib/commentRanking';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

describe('webnovelCommentScore — the WebMangal "Popular" algorithm', () => {
  it('gives a zero-like comment a positive score', () => {
    expect(webnovelCommentScore(0, hoursAgo(1))).toBeGreaterThan(0);
  });

  it('ranks a newer comment above an equally-liked older one (long-tail decay)', () => {
    const fresh = webnovelCommentScore(10, hoursAgo(1));
    const old = webnovelCommentScore(10, hoursAgo(24 * 180)); // ~6 months
    expect(fresh).toBeGreaterThan(old);
  });

  it('keeps decay gentle on reading platforms: a 1-year-old comment with 10x likes still wins', () => {
    // Webnovel-style sections stay relevant for months — decay is per-month,
    // not per-hour, so likes matter far more than freshness.
    const oldWellLiked = webnovelCommentScore(100, hoursAgo(24 * 365));
    const freshBarelyLiked = webnovelCommentScore(1, hoursAgo(1));
    expect(oldWellLiked).toBeGreaterThan(freshBarelyLiked);
  });

  it('decays monotonically as a comment ages (likes fixed)', () => {
    let prev = Infinity;
    for (const h of [0, 6, 24, 24 * 30, 24 * 365]) {
      const score = webnovelCommentScore(10, hoursAgo(h));
      expect(score).toBeLessThan(prev);
      prev = score;
    }
  });

  it('is strictly increasing in likes (recency fixed)', () => {
    expect(webnovelCommentScore(5, hoursAgo(2))).toBeLessThan(
      webnovelCommentScore(50, hoursAgo(2)),
    );
  });

  it('is a different algorithm from the KaTube (YouTube) scorer', () => {
    // WebMangal must NOT inherit the video-platform decay curve.
    const likes = 10;
    const createdAt = hoursAgo(24 * 30); // a month old
    expect(webnovelCommentScore(likes, createdAt)).not.toEqual(
      youtubeCommentScore(likes, createdAt),
    );
  });
});

describe('sortByScore', () => {
  const comments = [
    { id: 'a', likes: 2, createdAt: hoursAgo(1) },
    { id: 'b', likes: 50, createdAt: hoursAgo(100) },
    { id: 'c', likes: 3, createdAt: hoursAgo(2) },
  ];

  it('sorts highest-score first using the supplied accessors', () => {
    const sorted = sortByScore(comments, (c) => c.likes, (c) => c.createdAt, webnovelCommentScore);
    expect(sorted[0].id).toBe('b');
  });

  it('does not mutate the input array (pure function)', () => {
    const copy = [...comments];
    sortByScore(comments, (c) => c.likes, (c) => c.createdAt, webnovelCommentScore);
    expect(comments).toEqual(copy);
  });
});

describe('instagramPreviewComments (K Circle uses it; WebMangal must not)', () => {
  it('returns only the previewCount most-liked comments, oldest first on ties', () => {
    const comments = [
      { id: 'x', likes: 1, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'y', likes: 9, createdAt: '2026-02-01T00:00:00Z' },
      { id: 'z', likes: 9, createdAt: '2026-01-15T00:00:00Z' },
    ];
    const preview = instagramPreviewComments(comments, (c) => c.likes, (c) => c.createdAt, 2);
    expect(preview.map((c) => c.id)).toEqual(['z', 'y']); // tie → older (z) first
  });

  it('never returns more comments than exist', () => {
    const comments = [{ id: 'only', likes: 0, createdAt: '2026-01-01T00:00:00Z' }];
    const preview = instagramPreviewComments(comments, (c) => c.likes, (c) => c.createdAt, 2);
    expect(preview).toHaveLength(1);
  });
});

describe('pagination limits', () => {
  it('WebMangal renders comments in small webnovel-style pages', () => {
    expect(COMMENT_PAGE_SIZE.webmangal).toBe(15);
  });

  it('WebMangal written reviews use their own (smaller) fetch page', () => {
    expect(REVIEW_PAGE_SIZE.webmangal).toBe(10);
  });
});
