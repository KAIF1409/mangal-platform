import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

// Bug fix: this pointed at a Vercel domain (mangal-platform.vercel.app)
// that hasn't served this app since §89 moved everything to Cloudflare
// Workers — layout.tsx already got this fix (fbc8a26), this file was
// missed in that pass. Now matches the real Workers domain.
const siteUrl = "https://mangal-platform.mangak.workers.dev";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/WebMangal`, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/become-creator`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/grievance`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Best-effort: include published series so search engines can discover and
  // index individual manga/novel pages. If env vars are missing at build
  // time (unlikely on the deployed Worker, but defensive for local builds)
  // we just fall back to the static routes rather than failing the whole build.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return staticRoutes;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: series } = await supabase
      .from("series")
      .select("id")
      .eq("status", "published")
      .limit(5000);

    const seriesRoutes: MetadataRoute.Sitemap = (series ?? []).map((s) => ({
      url: `${siteUrl}/WebMangal/series/${s.id}`,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    return [...staticRoutes, ...seriesRoutes];
  } catch {
    return staticRoutes;
  }
}
