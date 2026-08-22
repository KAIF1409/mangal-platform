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
      // Bug fix / cleanup: this app runs entirely on Cloudflare Workers
      // now (§89) — nothing is served by or calls out to Vercel anymore.
      // The va.vercel-scripts.com / vitals.vercel-insights.com allowances
      // were leftovers from before that move (and from the now-removed
      // <Analytics /> component, see layout.tsx) — dropped since they no
      // longer correspond to anything this app actually loads.
      "script-src 'self' 'unsafe-inline' https://www.youtube.com",
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
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
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

  // Bug fix (build failure, Cloudflare Workers deploy — "exceeded size
  // limit of 3 MiB"): the Books module's reader (pdfjs-dist + epubjs,
  // both browser-only — canvas/DOM rendering, never touched server-side)
  // was only ever loaded via `await import(...)` inside client-side
  // useEffects, but Next's server compiler still statically pulled both
  // packages' full module graphs into the RSC/SSR build for the reader
  // page, since it's reachable from a normal static `import BookReader`
  // and OpenNext bundles that server build into one Worker script with no
  // real lazy-chunk loading at the edge. That alone pushed the server
  // handler to ~13 MB, over the free-plan 3 MiB Worker size limit.
  // serverExternalPackages tells Next's server compiler to leave these
  // two packages out of the server bundle entirely (require()'d, never
  // actually reached at runtime server-side) instead of inlining them.
  serverExternalPackages: ["pdfjs-dist", "epubjs"],

  // §123 follow-up: keep sharp (and its @img/* native binaries) out of the
  // SERVER FILE TRACE as well. Images are served unoptimized (see images
  // config below — Workers can't run sharp's native addon anyway), yet NFT
  // still traced next's optional sharp dependency, and Next 16's standalone
  // output emits it under a hashed name (node_modules/sharp-<hash>) that
  // slips past OpenNext's own EXCLUDED_PACKAGES regex. Two problems from
  // that: dead weight in the bundled Worker, and — locally on Windows —
  // OpenNext crashes with `EPERM: operation not permitted, symlink` when it
  // tries to re-create those hashed symlinks while copying traced files
  // (symlink creation needs admin/Developer Mode there). Excluding the real
  // paths here means they never enter the trace at all, fixing both.
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
    ],
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