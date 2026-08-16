import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

type Props = {
  children: React.ReactNode;
  params: Promise<{ chapterId: string }>;
};

const fallback: Metadata = {
  title: "Reading",
  description: "Read manga, comics and web novels on MANGAL.",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { chapterId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return fallback;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: chapter } = await supabase
      .from("chapters")
      .select("chapter_number, title, is_draft, scheduled_at, series(title, cover_url)")
      .eq("id", chapterId)
      .single();

    // Don't expose draft/unpublished-scheduled chapter titles in link
    // previews or search results — same gating the reader page itself uses.
    const isFutureScheduled =
      !!chapter?.scheduled_at && new Date(chapter.scheduled_at).getTime() > Date.now();
    if (!chapter || chapter.is_draft || isFutureScheduled) return fallback;

    const series = Array.isArray(chapter.series) ? chapter.series[0] : chapter.series;
    const seriesTitle = (series as { title?: string } | null)?.title;
    const coverUrl = (series as { cover_url?: string } | null)?.cover_url;

    const title = seriesTitle
      ? `Ch. ${chapter.chapter_number}: ${chapter.title} — ${seriesTitle}`
      : `Ch. ${chapter.chapter_number}: ${chapter.title}`;
    const description = seriesTitle
      ? `Read Chapter ${chapter.chapter_number} of ${seriesTitle} on MANGAL.`
      : `Read Chapter ${chapter.chapter_number} on MANGAL.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: coverUrl ? [{ url: coverUrl }] : undefined,
        type: "article",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: coverUrl ? [coverUrl] : undefined,
      },
    };
  } catch {
    return fallback;
  }
}

export default function ReadLayout({ children }: Props) {
  return children;
}
