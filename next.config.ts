import type { NextConfig } from "next";
import path from "path";

// Security headers — applied to every route. CSP is scoped to what this app
// actually needs: self-hosted assets, Supabase (DB/Auth/Storage — URL is
// project-specific but *.supabase.co covers it), and Vercel Analytics.
// 'unsafe-inline' stays on script-src/style-src because Next.js injects
// small inline hydration scripts and this app uses React inline `style={{}}`
// everywhere — a nonce-based CSP would be stricter but requires touching
// every component; this is still a major improvement over no CSP at all.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://img.youtube.com https://i.ytimg.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://vitals.vercel-insights.com https://va.vercel-scripts.com",
      "frame-ancestors 'none'",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },

  allowedDevOrigins: [
    "192.168.*.*",
  ],

  devIndicators: false,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/kalpanaverse",
        destination: "/katube",
        permanent: true,
      },
      // /home moved under the WebMangal namespace (it's WebMangal's own
      // signed-in home feed, not an ecosystem-level home) — keep old
      // bookmarks/shares working.
      {
        source: "/home",
        destination: "/WebMangal/home",
        permanent: true,
      },
      // KaTube's creator-profile/channel-verify tab moved out of the
      // shared /dashboard namespace into /katube/dashboard, so every
      // KaTube-product page lives under /katube (per-product namespacing,
      // see CONTEXT.md). Same page, same StudioSidebar shell — URL only.
      {
        source: "/dashboard/katube",
        destination: "/katube/dashboard",
        permanent: true,
      },
      // Old /search links carried a `?q=` search keyword — those go to the
      // new dedicated search route with the param renamed to `?keyword=`
      // (matches m.webnovel.com/search?keyword=... which this route now
      // mirrors). Plain /search with no query is just old-style browsing.
      {
        source: "/search",
        has: [{ type: "query", key: "q" }],
        destination: "/WebMangal/search?keyword=:q",
        permanent: true,
      },
      {
        source: "/search",
        destination: "/WebMangal",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;