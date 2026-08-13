# MANGAL — Manga/Novel Reading, AI-Anime Discovery & Fan Community

**Live:** [mangal-platform.vercel.app](https://mangal-platform.vercel.app)

A solo-built, production Next.js ecosystem with three connected products sharing one
codebase, one Supabase project, and one Vercel deployment — built for Indian manga/novel
creators and readers.

| Product | Route | What it does |
|---|---|---|
| **MangaNovels** | `/`, `/search`, `/read/...` | Read & publish manga, comics and web novels — one account, no split between formats. **Live, in active use.** |
| **KaTube** | `/katube` | YouTube-style discovery feed for AI-generated anime videos made by MANGAL creators, adapted from their own series. Grid + Shorts feed, watch pages, upload flow, channel-ownership verification, automated content moderation. |
| **Kalpana Circle** | `/kalpana-circle` | Instagram-meets-Discord fan community — posts, stories, DMs/group chats, notifications, polls, close friends, creator broadcast channels, and full Discord-style channels & roles. |

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime) — every table locked down with
  row-level security, no service-role key used client-side
- **Styling:** inline CSS-variable theming (light/dark), no CSS framework at runtime
- **Media/AI:** NSFWJS + TensorFlow.js for automated content moderation, `sharp` for
  server-side image processing, YouTube Data API v3 for channel verification & metadata
- **Motion:** Framer Motion + GSAP for the landing page
- **Deployment:** Vercel, with Vercel Analytics

## Engineering highlights

A few things worth a closer look in the code, not just the feature list:

- **Zero-cost, ToS-safe video architecture** — KaTube never stores or rehosts video files;
  it only stores YouTube video IDs + metadata and plays back through YouTube's own embed,
  which keeps the product both free to run and compliant with YouTube's API Terms of
  Service (no branding removal, no scraping, no download tooling).
- **Server-verified channel ownership** — creators prove they own a YouTube channel via a
  one-time verification-code handshake, then every single upload is independently checked
  server-side against that verified channel ID before it's accepted, closing the obvious
  "upload someone else's video" exploit.
- **Automated moderation pipeline** — NSFW thumbnail classification (NSFWJS) and
  AI-disclosure checks (via YouTube's `containsSyntheticMedia` field) auto-flag risky
  uploads into a review queue instead of hard-blocking, to avoid false-positive creator
  friction while still catching real problems.
- **Discord-style permission system built from scratch** — bitmask role permissions,
  per-channel allow/deny overwrites, and a resolution order that mirrors Discord's own
  (role permissions → channel denies → channel allows → admin override), enforced at the
  RLS layer (not just hidden in the UI) with a role-hierarchy guard so a member can never
  edit or assign a role ranked above their own.
- **Found and fixed real RLS security holes** — including a participant-insert policy that
  had degraded to an always-true check (letting any user join any private conversation)
  and a self-referential policy comparison that leaked group membership across the
  platform. Both traced, root-caused, and patched with regression-safe migrations.
- **Race-condition-safe interactions** — like/follow/vote actions use a synchronous ref
  lock (not just React state) to close a double-click window that async state batching
  would otherwise leave open.

## Privacy & compliance

Built with India's data protection and IT rules in mind: explicit consent at signup, extra
protection and parental consent for under-18 users, self-serve data export/delete, and a
dedicated support channel with a guaranteed response time. KaTube's public-facing pages
disclose YouTube API Services usage per YouTube's ToS requirements.

## Status

MangaNovels is live and in active use. KaTube and Kalpana Circle are both live on real
Supabase data with the feature sets described above — see the table at the top for what's
shipped per product. Reader-to-creator monetization (tips, unlocking premium chapters) and
platform-side sponsorship on KaTube are the next planned steps, gated behind reader/viewer
growth.

## About

Built solo, end-to-end — architecture, backend, and frontend — by **Mohammed Kaif**,
B.Tech CSE, PES University (2026).
[LinkedIn](https://www.linkedin.com/in/mohammed-kaif-714a79242) ·
[Email](mailto:kaifmohammed.work@gmail.com)
