import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

type Props = {
  children: React.ReactNode;
  params: Promise<{ seriesId: string }>;
};

const fallback: Metadata = {
  title: "Series",
  description: "Read manga, comics and web novels on MANGAL.",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { seriesId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return fallback;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: series } = await supabase
      .from("series")
      .select("title, synopsis, cover_url, genre, content_type")
      .eq("id", seriesId)
      .single();

    if (!series) return fallback;

    const description = series.synopsis
      ? series.synopsis.slice(0, 200)
      : `Read ${series.title} on MANGAL.`;

    return {
      title: series.title,
      description,
      openGraph: {
        title: series.title,
        description,
        images: series.cover_url ? [{ url: series.cover_url }] : undefined,
        type: "article",
      },
      twitter: {
        card: "summary_large_image",
        title: series.title,
        description,
        images: series.cover_url ? [series.cover_url] : undefined,
      },
    };
  } catch {
    return fallback;
  }
}

export default function SeriesLayout({ children }: Props) {
  return children;
}
