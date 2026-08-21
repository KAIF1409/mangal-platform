import type { MetadataRoute } from "next";

// Bug fix: this pointed at a Vercel domain (mangal-platform.vercel.app)
// that hasn't served this app since §89 moved everything to Cloudflare
// Workers — layout.tsx already got this fix (fbc8a26), this file was
// missed in that pass. Now matches the real Workers domain.
const siteUrl = "https://mangal-platform.mangak.workers.dev";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/settings",
        "/WebMangal/bookmarks",
        "/WebMangal/history",
        "/WebMangal/upload",
        "/admin",
        "/api",
        "/login",
        "/parent-consent",
        "/parent-consent-result",
        "/auth",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
