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
      // BUG FIX: script-src previously only allowed 'self' and Vercel's
      // analytics script. KaTube Shorts loads the real YouTube IFrame
      // Player API (`https://www.youtube.com/iframe_api`, which in turn
      // loads its widget script from the same www.youtube.com origin) so
      // it can drive playback/seek/mute through a proper `YT.Player`
      // object instead of guessing via raw postMessage. With that origin
      // missing here, the browser refused to load the script entirely
      // ("Refused to load the script ... violates CSP directive
      // script-src") — so no player was ever created for any Short: the
      // seek bar had nothing to sync against, and the initial unmute
      // (which only runs inside the player's onReady callback) never
      // fired, leaving every Short stuck on the iframe URL's hardcoded
      // `mute=1` regardless of the saved sound preference.
      "script-src 'self' 'unsafe-inline' https://www.youtube.com https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://img.youtube.com https://i.ytimg.com",
      "font-src 'self' data:",
      // BUG FIX: connect-src previously only allowed https://*.supabase.co.
      // Supabase Realtime (used by Kalpana Circle's NotificationBell and
      // chat — supabase.channel(...).on('postgres_changes', ...)) connects
      // over a WebSocket (wss://), which is a *different* CSP scheme match
      // than https:// — the browser was silently blocking that connection,
      // which threw an uncaught error and crashed the whole page ("This
      // page couldn't load"). Every other product page that doesn't open a
      // Realtime socket was unaffected, which is why only Kalpana Circle
      // broke. Adding the wss:// scheme explicitly fixes it.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://va.vercel-scripts.com",
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
    // §87: Next's default /_next/image optimizer uses `sharp` (a native
    // binary) under the hood — Cloudflare Workers' V8 isolate has no
    // native addon support, so it can't run there. Serving images
    // unoptimized (as-is from Supabase storage) avoids a runtime crash;
    // Supabase's own storage CDN already handles caching/delivery.
    unoptimized: true,
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
      // /series and /read moved under the WebMangal namespace alongside
      // /home and /search (they're WebMangal-only pages, same reasoning
      // as the /home redirect above) — keep old bookmarks/shared
      // links/search-engine-indexed URLs working.
      {
        source: "/series/:seriesId",
        destination: "/WebMangal/series/:seriesId",
        permanent: true,
      },
      {
        source: "/read/:chapterId",
        destination: "/WebMangal/read/:chapterId",
        permanent: true,
      },
      // Same reasoning — bookmarks, history, library, rankings, tags,
      // and upload are all WebMangal-only pages, moved under the
      // WebMangal namespace alongside home/search/series/read.
      {
        source: "/bookmarks",
        destination: "/WebMangal/bookmarks",
        permanent: true,
      },
      {
        source: "/history",
        destination: "/WebMangal/history",
        permanent: true,
      },
      {
        source: "/library",
        destination: "/WebMangal/library",
        permanent: true,
      },
      {
        source: "/rankings",
        destination: "/WebMangal/rankings",
        permanent: true,
      },
      {
        source: "/tags",
        destination: "/WebMangal/tags",
        permanent: true,
      },
      {
        source: "/tags/:slug",
        destination: "/WebMangal/tags/:slug",
        permanent: true,
      },
      {
        source: "/upload",
        destination: "/WebMangal/upload",
        permanent: true,
      },
      // creator/[username] is content-wise WebMangal-only (renders a
      // series grid) - KaTube and Kalpana Circle have their own
      // dedicated profile pages now (/katube/channel/[username],
      // /kalpana-circle/profile/[username], planned).
      {
        source: "/creator/:username",
        destination: "/WebMangal/creator/:username",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;