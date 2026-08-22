'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

// §116/§126 follow-up (Phase 2): WebMangal Studio. This hook is a direct
// extraction of the real analytics block already shipped on
// `/dashboard` (`fetchStories` + `fetchAnalytics`, see that file) into a
// standalone hook Studio can consume — same queries, same honesty rules
// (zeroed/empty when there isn't enough data yet, never estimated), just
// relocated per §114's "extract, don't rebuild" note for WebMangal.

export interface StorySummary {
  id: string;
  title: string;
  views: number;
  content_type: 'mangal' | 'novel';
  completion_status: 'ongoing' | 'completed' | 'hiatus';
  chapterCount: number;
}

export interface SeriesViewStat {
  id: string;
  title: string;
  views: number;
}

export interface ChapterRetentionStat {
  chapterId: string;
  seriesId: string;
  seriesTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  started: number;
  completed: number;
}

export interface WebMangalAnalytics {
  totalViews: number;
  totalFollowers: number;
  newFollowersThisWeek: number;
  totalComments: number;
  totalChapters: number;
  totalWords: number;
  viewsPerSeries: SeriesViewStat[];
  dailyViews: { date: string; count: number }[];
  hourlyViews: number[];
  countryCounts: Record<string, number>;
  genderCounts: { male: number; female: number; unspecified: number; unknown: number };
  completion: { started: number; completed: number };
  chapterRetention: ChapterRetentionStat[];
}

export function useWebMangalAnalytics() {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [analytics, setAnalytics] = useState<WebMangalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const creatorId = authData.user?.id;
      if (!creatorId) { setLoading(false); return; }

      try {
        const { data: seriesData, error } = await supabase
          .from('series')
          .select('id, title, views, content_type, completion_status')
          .eq('creator_id', creatorId);
        if (error) throw error;

        const seriesIds = (seriesData || []).map((s: { id: string }) => s.id);
        if (seriesIds.length === 0) {
          if (!cancelled) {
            setStories([]);
            setAnalytics({
              totalViews: 0, totalFollowers: 0, newFollowersThisWeek: 0, totalComments: 0,
              totalChapters: 0, totalWords: 0, viewsPerSeries: [], dailyViews: [],
              hourlyViews: new Array(24).fill(0), countryCounts: {},
              genderCounts: { male: 0, female: 0, unspecified: 0, unknown: 0 },
              completion: { started: 0, completed: 0 }, chapterRetention: [],
            });
            setLoading(false);
          }
          return;
        }

        const { data: chapterRows, error: chaptersError } = await supabase
          .from('chapters')
          .select('id, series_id, chapter_number, title, word_count')
          .in('series_id', seriesIds);
        if (chaptersError) throw chaptersError;

        const chapterIds = (chapterRows || []).map((r: { id: string }) => r.id);
        const countBySeriesId: Record<string, number> = {};
        const chapterMeta: Record<string, { seriesId: string; seriesTitle: string; chapterNumber: number; chapterTitle: string }> = {};
        const seriesTitleById: Record<string, string> = {};
        (seriesData || []).forEach((s: { id: string; title: string }) => { seriesTitleById[s.id] = s.title; });
        (chapterRows || []).forEach((row: { id: string; series_id: string; chapter_number: number; title: string }) => {
          countBySeriesId[row.series_id] = (countBySeriesId[row.series_id] || 0) + 1;
          chapterMeta[row.id] = {
            seriesId: row.series_id,
            seriesTitle: seriesTitleById[row.series_id] || '',
            chapterNumber: row.chapter_number,
            chapterTitle: row.title,
          };
        });

        const storySummaries: StorySummary[] = (seriesData || []).map((s: { id: string; title: string; views: number; content_type: 'mangal' | 'novel'; completion_status: 'ongoing' | 'completed' | 'hiatus' }) => ({
          ...s,
          chapterCount: countBySeriesId[s.id] || 0,
        }));

        const totalViews = storySummaries.reduce((sum, s) => sum + (s.views || 0), 0);
        const viewsPerSeries: SeriesViewStat[] = storySummaries
          .map((s) => ({ id: s.id, title: s.title, views: s.views || 0 }))
          .sort((a, b) => b.views - a.views);

        const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [followResult, commentsResult, wordsResult, viewEventsResult, progressResult, pagesResult] = await Promise.all([
          supabase.from('follows').select('created_at, reader_id').in('series_id', seriesIds),
          chapterIds.length > 0
            ? supabase.from('comments').select('id', { count: 'exact', head: true }).in('chapter_id', chapterIds)
            : Promise.resolve({ data: null, count: 0, error: null }),
          chapterIds.length > 0
            ? supabase.from('chapters').select('series_id, word_count').in('id', chapterIds)
            : Promise.resolve({ data: [], error: null }),
          supabase.from('view_events').select('created_at, country_code').in('series_id', seriesIds).gte('created_at', weekAgoIso),
          supabase.from('reading_progress').select('chapter_id, page_number').in('series_id', seriesIds),
          chapterIds.length > 0
            ? supabase.from('pages').select('chapter_id, page_number').in('chapter_id', chapterIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (followResult.error) throw followResult.error;
        if (commentsResult.error) throw commentsResult.error;
        if (wordsResult.error) throw wordsResult.error;
        if (viewEventsResult.error) throw viewEventsResult.error;
        if (progressResult.error) throw progressResult.error;
        if (pagesResult.error) throw pagesResult.error;

        const followRows = followResult.data || [];
        const totalFollowers = followRows.length;
        const newFollowersThisWeek = followRows.filter((f: { created_at: string }) => f.created_at >= weekAgoIso).length;

        let totalWords = 0;
        (wordsResult.data || []).forEach((row: { word_count: number | null }) => { totalWords += row.word_count || 0; });

        const dailyMap: Record<string, number> = {};
        const hourlyViews = new Array(24).fill(0);
        const countryCounts: Record<string, number> = {};
        for (let i = 6; i >= 0; i--) {
          const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          dailyMap[d.toISOString().slice(0, 10)] = 0;
        }
        (viewEventsResult.data || []).forEach((row: { created_at: string; country_code: string | null }) => {
          const d = new Date(row.created_at);
          const dayKey = row.created_at.slice(0, 10);
          if (dayKey in dailyMap) dailyMap[dayKey]++;
          hourlyViews[d.getHours()]++;
          if (row.country_code) countryCounts[row.country_code] = (countryCounts[row.country_code] || 0) + 1;
        });
        const dailyViews = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

        const genderCounts = { male: 0, female: 0, unspecified: 0, unknown: 0 };
        const { data: genderRow } = await supabase
          .rpc('get_follower_gender_breakdown', { p_creator_id: creatorId })
          .maybeSingle() as { data: { male: number; female: number; unspecified: number; unknown: number } | null };
        if (genderRow) {
          genderCounts.male = Number(genderRow.male) || 0;
          genderCounts.female = Number(genderRow.female) || 0;
          genderCounts.unspecified = Number(genderRow.unspecified) || 0;
          genderCounts.unknown = Number(genderRow.unknown) || 0;
        }

        const lastPageByChapter: Record<string, number> = {};
        (pagesResult.data || []).forEach((p: { chapter_id: string; page_number: number }) => {
          lastPageByChapter[p.chapter_id] = Math.max(lastPageByChapter[p.chapter_id] || 0, p.page_number);
        });
        let started = 0;
        let completed = 0;
        const perChapter: Record<string, { started: number; completed: number }> = {};
        (progressResult.data || []).forEach((row: { chapter_id: string; page_number: number }) => {
          const lastPage = lastPageByChapter[row.chapter_id];
          if (lastPage === undefined) return;
          started++;
          const isDone = row.page_number >= lastPage;
          if (isDone) completed++;
          if (!perChapter[row.chapter_id]) perChapter[row.chapter_id] = { started: 0, completed: 0 };
          perChapter[row.chapter_id].started++;
          if (isDone) perChapter[row.chapter_id].completed++;
        });

        const chapterRetention: ChapterRetentionStat[] = Object.entries(perChapter)
          .filter(([, v]) => v.started >= 3)
          .map(([chapterId, v]) => {
            const meta = chapterMeta[chapterId];
            return {
              chapterId,
              seriesId: meta?.seriesId || '',
              seriesTitle: meta?.seriesTitle || '',
              chapterNumber: meta?.chapterNumber ?? 0,
              chapterTitle: meta?.chapterTitle || '',
              started: v.started,
              completed: v.completed,
            };
          })
          .sort((a, b) => (a.completed / a.started) - (b.completed / b.started))
          .slice(0, 15);

        if (!cancelled) {
          setStories(storySummaries);
          setAnalytics({
            totalViews, totalFollowers, newFollowersThisWeek,
            totalComments: commentsResult.count || 0,
            totalChapters: chapterIds.length, totalWords, viewsPerSeries,
            dailyViews, hourlyViews, countryCounts, genderCounts,
            completion: { started, completed }, chapterRetention,
          });
        }
      } catch (err) {
        console.error('Error fetching WebMangal Studio analytics:', err instanceof Error ? err.message : err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, []);

  return { stories, analytics, loading };
}
