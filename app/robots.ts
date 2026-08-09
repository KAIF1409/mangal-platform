import type { MetadataRoute } from "next";

const siteUrl = "https://mangal-platform.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/settings",
        "/bookmarks",
        "/history",
        "/upload",
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
