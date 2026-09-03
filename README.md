# MANGAL Ecosystem

**WebMangal · KaTube · Kalpana Circle**

**Live app:** [mangal-platform.mangak.workers.dev](https://mangal-platform.mangak.workers.dev/)

MANGAL is an Indian, zero-cost-infrastructure platform for people who love
manga, comics, web novels, anime, and the communities built around them. It's
three connected products sharing one account:

- **📚 WebMangal** — read manga, comics, web novels, Books, and Songs. Writers
  and artists publish original chapters directly to readers, no publisher needed.
- **🎬 KaTube** — a YouTube-style discovery feed for *original*, AI-generated
  anime adaptations of WebMangal stories, made by the same creators who wrote
  them. Never pirated or reposted anime.
- **💬 Kalpana Circle** — the community layer. Instagram-style posts and
  stories, Discord-style servers/channels/roles, DMs, group chats, and
  Watch Together rooms.

**For readers:** one account gets you a library, a video feed, and a
community — all built around the same stories.

**For creators:** publish a story on WebMangal, adapt it into video on
KaTube, and build a following on Kalpana Circle — three audiences from one
piece of original work, with an AI writing/translation assistant helping at
every step.

> Full project context, architecture rationale, and session-by-session build
> history: [`CONTEXT.md`](CONTEXT.md) and [`docs/SESSION_HISTORY.md`](docs/SESSION_HISTORY.md).

---

## ✨ Feature Showcase

- **📖 Immersive Reader** — 4 themes (Light/Sepia/Dark/Midnight OLED),
  adjustable typography, scroll or paginated layout, manga RTL mode, and
  reading progress that syncs across devices.
- **🤖 BYOK AI Literary Assistant** — an in-browser writing assistant
  (on-device WebGPU by default, your own API key as a cloud fallback) that
  polishes prose without ever sending your key to our servers.
- **🌐 Hinglish & Hindi Translation** — a dedicated AI translation mode,
  separate from the writing-polish pass, with auto-direction between
  English and Hindi.
- **🖼️ Webtoon Storyboard Converter** — turn a chapter of prose into a
  drag-and-drop comic-panel storyboard, exportable as JSON.
- **📊 Mangal Studio Analytics** — a real analytics dashboard per creator:
  reading time, audience geography, retention/drop-off by chapter, and video
  performance.
- **🎥 KaTube** — Shorts-style ranking, Watch Together sync-play rooms,
  playlists, subscriptions, and channel analytics — all on top of
  zero-cost YouTube-embedded video.
- **🫂 Kalpana Circle** — Discord-style servers/channels/roles, realtime
  chat with image attachments, stories with Close-Friends audience control,
  and creator broadcast channels.

---

## 🛠️ Tech Stack & Prerequisites

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, Framer Motion, GSAP |
| Editor | Tiptap / ProseMirror |
| AI | `@mlc-ai/web-llm` (on-device WebGPU inference) + BYOK cloud fallback |
| Backend | Supabase (PostgreSQL, PostgREST, Auth, Realtime, Storage), Row-Level Security |
| Payments | Direct-to-VPA UPI + Razorpay primitives |
| Deployment | Cloudflare Workers via `@opennextjs/cloudflare` + Wrangler |

**Prerequisites**
- Node.js **20+**
- npm (the lockfile is `package-lock.json`; pnpm/yarn are not tested against
  this repo)
- A Supabase project (for local development against your own database)

---

## 🚀 Quickstart & Local Development

```bash
git clone https://github.com/KAIF1409/mangal-platform.git
cd mangal-platform
npm install
cp .env.example .env.local   # fill in your own values — see below
npm run dev
```

The app runs at `http://localhost:3000`.

Other scripts:

```bash
npm run build     # production build
npm run start     # run the production build locally
npm run lint       # eslint
npm run preview    # opennextjs-cloudflare build + local Workers preview
npm run deploy      # opennextjs-cloudflare build + wrangler deploy
```

---

## 🔐 Environment Variables & BYOK Setup

Copy `.env.example` to `.env.local` and fill in your own values. Never
commit `.env.local` — it's already `.gitignore`d.

```bash
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- App ---
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- Razorpay (optional — payments) ---
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# --- Direct UPI payments — no gateway account needed ---
FOUNDER_UPI_ID=
FOUNDER_UPI_NAME=
NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS=

# --- Resend (transactional email) ---
RESEND_API_KEY=

# --- YouTube Data API (KaTube creator verification) ---
YOUTUBE_API_KEY=

# --- Cold storage encryption (DPDP compliance) ---
COLD_STORAGE_ENCRYPTION_KEY=
```

### BYOK (Bring Your Own Key) for AI features

The AI Writing Assistant and Translation tool default to **on-device
inference** via WebGPU (`@mlc-ai/web-llm`) — nothing leaves your browser. If
you'd rather use a cloud model, you can add your own API key (Gemini AI
Studio or Groq) directly in the app's AI settings panel. That key is
**encrypted and stored in your browser's `localStorage` only** — it is never
sent to or persisted by the MANGAL backend.

### Database schema changes

Supabase schema changes in this project go through the **Supabase MCP
connector** rather than raw `supabase db push` — the migration history has
some deliberate drift documented in [`CONTEXT.md`](CONTEXT.md#4-known-issues--fixes-ledger).
Read that section before touching `supabase/migrations/`.

---

## 📁 Project Directory Structure

```
mangal-platform/
├── src/
│   └── app/
│       ├── WebMangal/          # Reader platform: books, songs, series, upload, search
│       ├── katube/             # Video feed: watch, shorts, channel, dashboard, upload
│       ├── kalpana-circle/     # Community: chat, stories, groups, watch-together
│       ├── mangal-studio/      # Creator Studio (per-product: webmangal/, katube/)
│       ├── dashboard/          # Unified creator dashboard (earnings, perks, tools…)
│       ├── admin/              # Admin tools: reports, moderation, media migration
│       ├── api/                # Route handlers (AI, payments, media, recommendations…)
│       ├── components/         # Shared + product-specific React components
│       ├── lib/                # Shared logic: ai/, auth/, compliance/, media/, payments/, sound/
│       ├── login/, auth/       # Authentication flows
│       └── about/, help/, …    # Static/marketing pages
├── supabase/
│   ├── migrations/             # SQL migrations (see drift note above before touching)
│   └── functions/              # Edge functions (e.g. purge-cold-storage)
├── public/                     # Static assets + runtime-loaded vendor bundles
├── docs/
│   └── SESSION_HISTORY.md      # Full chronological build log
├── CONTEXT.md                  # Curated project context — read this first
├── next.config.ts
├── open-next.config.ts
└── wrangler.jsonc               # Cloudflare Workers deployment config
```

---

## 🤝 Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines. Before opening a PR,
please read [`CONTEXT.md`](CONTEXT.md) — it covers standing conventions
(mobile-check requirements, deploy gates, the bundle-size failure mode) that
apply to every change.

## 📄 License

See repository settings / `LICENSE` if present; contact the maintainer for
licensing questions.
