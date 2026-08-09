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
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://vitals.vercel-insights.com https://va.vercel-scripts.com",
      "frame-ancestors 'none'",
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

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;