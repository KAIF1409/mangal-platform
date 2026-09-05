# MANGAL Ecosystem — Project Context

> **Read this file first, every session.** This is the curated working memory for the
> MANGAL ecosystem — what it is, what's built, what's broken, and what's next.
> The full, un-trimmed chronological session log (every `§N` entry, exact commits,
> byte-level measurements) lives in [`docs/SESSION_HISTORY.md`](docs/SESSION_HISTORY.md).
> This file distills that log into something scannable — when a section below
> references `§N`, that's where to find the full story.

---

## 1. Platform Vision & Ecosystem Overview

MANGAL is a single ecosystem, four connected products, one account:

| Product | Route | What it is |
|---|---|---|
| **WebMangal** | `/WebMangal` | Read manga, comics, and web novels — plus Books (PDF/EPUB) and Songs. Writers and artists publish original chapters, covers, and updates directly to readers, no publisher needed. |
| **KaTube** | `/katube` | A YouTube-style discovery feed for **original, AI-generated anime video** adaptations of WebMangal stories, made by the same creators. Not a pirated-anime site — every video is an original adaptation, avoiding copyright risk entirely. |
| **Kalpana Circle (K Circle)** | `/kalpana-circle` | The community layer — Instagram + Discord-style posts, stories, DMs/group chats, servers/channels/roles, broadcast channels, and Watch Together rooms. The reason people come back daily, not just on new-chapter days. |
| **Corporate / Official Portal** | `/about` | The public-facing company page describing the full ecosystem to investors, press, and new users. |

**The narrative thread:** *MANGAL writes the story. KaTube brings it to life. Kalpana
Circle is where the dreamers gather.*

**Current top strategic priority — "Unique for Mangal":** a three-piece
discovery → collaboration → recognition loop connecting the three products:

1. **Mangal Ideas** — a feed on KaTube's homepage surfacing trending WebMangal
   stories without a video adaptation yet, high-engagement K Circle audience
   requests, and admin/company-posted ideas — inviting creators to collaborate.
2. **Mangal of the Week** — a weekly, audience-voted leaderboard on K Circle;
   top 5 videos ranked, with a prize-money announcement (manual payout for now).
3. **WebMangal Writer of the Month** — a monthly award for the writer whose
   story drove the most collaboration activity that month.

Full phased build plan, schema design, and story walkthrough: `docs/SESSION_HISTORY.md`
§0.

### Core Design Principles

- **Zero-cost architecture by default.** KaTube never hosts video files — creators
  upload to their own YouTube channel; KaTube stores only metadata and embeds the
  player. No bandwidth cost regardless of scale.
- **Strict BYOK (Bring Your Own Key) privacy** for AI features. API keys are
  encrypted client-side and stored in `localStorage` only — never sent to or
  persisted in the backend/DB. On-device WebGPU inference is the default lane;
  BYOK cloud is a fallback.
- **Mobile-first, responsive execution.** Every page/feature pass includes an
  explicit mobile-compatibility audit (320–768px) before being marked done.
- **Dark mode by default**, with a light-mode toggle, across the whole platform.
- **Revenue flows to creators first** (YouTube ad revenue, MANGAL follower growth);
  platform monetization is a deliberately later-stage concern (see Roadmap).

---

## 2. Architecture & Tech Stack

**Frontend**
- Next.js 16 (App Router, Turbopack, TypeScript) + React 19
- Tailwind CSS 4
- Framer Motion + GSAP for animation (landing page, transitions)
- Tiptap (ProseMirror) for the rich-text writing/AI editor
- Recharts / Chart.js for Studio analytics dashboards

**AI**
- `@mlc-ai/web-llm` — on-device, in-browser LLM inference (WebGPU), the default
  lane for the AI Writing/Translation assistant
- BYOK cloud fallback (user's own Gemini AI Studio / Groq key, stored client-side only)

**Backend / Database**
- Supabase (PostgreSQL + PostgREST + Auth + Realtime + Storage), accessed via
  `@supabase/supabase-js` and `@supabase/ssr`
- Row-Level Security (RLS) on every table; SECURITY DEFINER RPCs for
  privileged operations (e.g. `admin_set_account_active`)
- **Schema changes must go through the Supabase MCP connector**
  (`project_id: rfxlavwzhpnbhwoumaha`) — this is the reliable, verified path.
  Supabase's current API-key system rejects legacy `service_role` keys over
  plain REST ("Forbidden use of secret API key in browser"); use the anon key
  or `supabase db query --linked` for direct probes instead.

**Payments**
- Direct-to-VPA UPI payments (no gateway account required) via `razorpay`'s
  QR/VPA primitives + `qrcode.react`, self-reported/manually verified — used
  because there's currently no live Razorpay merchant account.
- `NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS` feature flag is the switch to bring
  back the full multi-method (card/UPI/netbanking) + PayPal.me picker once a
  merchant account and/or international customers exist.

**Deployment**
- Cloudflare Workers via `@opennextjs/cloudflare` (`opennextjs-cloudflare build`
  + `wrangler deploy`) — the platform moved off Vercel onto Cloudflare Workers.
  The Worker is named `mangal`; live at `mangal-platform.mangak.workers.dev`.
- **Hard gate:** Cloudflare's free-plan Worker upload ceiling is **3,072 KiB
  gzipped**. Every deploy-affecting session must verify
  `wrangler deploy --dry-run` gzip size stays under this. See §4 for the
  recurring bundle-size failure mode and its fix.
- Standard commit gates before any push: `npx tsc --noEmit` (0 errors),
  `npm run lint` (0 errors — warnings tracked against a running baseline),
  `npm run build` (exit 0), and for deploy-affecting changes,
  `npx opennextjs-cloudflare build` + a wrangler dry-run size check.

---

## 3. Completed Features Index (Categorized)

### Reader Module (WebMangal)
- 4-theme reading engine (Light/Sepia/Dark/Midnight OLED), font-stack
  (serif/sans/mono) + 12–24px size + 1.2–2.0 line-height + margin controls
- Dual layout modes: scroll vs. paginated, plus manga-specific scroll/page/RTL modes
- Local + DB reading-progress tracking (works signed-out via `localStorage`,
  upserts to `book_reading_progress` when signed in)
- Real browser fullscreen mode, lazy-loaded chapter images, perf-audited
  series-page load path (waterfall/N+1 fixes across the whole WebMangal surface)
- Books (PDF/EPUB) and Songs (lyric-sheet, genre-tagged, linked to a
  series/chapter for attribution) as first-class content types alongside
  manga/novels, each with their own browse/discovery pages and
  Library/Bookmarks integration

### Mangal Studio Dashboard
- WebMangal Studio (Phase 2) shell — amber theming, KPI cards, full analytics
  engine (reading time, country, gender breakdown via Recharts)
- KaTube Studio (Phase 1) — chapter/video management, draft toggles, upload metrics
- Content dashboard unifying KaTube ↔ WebMangal tabs on real (not demo) data
- Codex tab — character profiles + lore codex, with the AI toolbar attached

### AI Writing & Translation Engine
- BYOK API-key verification and encrypted client-side storage (never touches DB/disk)
- On-device WebGPU inference by default, BYOK cloud fallback
- AI Writing Assistant (Polish & Hinglish Convert) across the universal editor
  (Studio writer, book/upload/song forms, codex panes)
- **AI Translation** as its own explicit toolbar action, split out from the
  writing assistant — auto-direction EN↔Hindi, distinct from the
  Hinglish→English polish pass

### Local Storyboard Converter
- Novel-to-comic panel splitter with drag-and-drop arranger
- JSON/script export

### Recommendation Engine
- Zero-cost cosine-similarity taste-vector scorer (genre 0.55 / author 0.20 /
  language 0.15 / popularity 0.10 weighting)
- Discovery rails: "For You", "Because you read `<seed>`", "Trending in `<genre>`"
- Cold-start fallback for new users; private cache headers

### KaTube
- Real YouTube Shorts-style ranking algorithm (`shortsRanking.ts`)
- Full-screen Shorts/Reels ("Fast Tap") experience, YouTube-parity desktop
  watch layout and top nav, working theme toggle
- Like/Dislike (one genuine like per user, YouTube-style formatting + bump animation)
- Channel ownership verification, public channel pages + custom channel URLs,
  per-video channel analytics
- Content moderation: NSFW + non-AI (real footage) upload detection, kept
  YouTube-API-Services-policy compliant by design (standing rule for every
  future KaTube change)
- Playlists, subscriptions feed, notifications, continue-watching, autoplay,
  trending, search + filters
- Sync-Play Watch Rooms (video + Shorts), including mid-session "add a friend" flow
- Review Hub (accuracy-to-source star ratings), Creator Bounties / "Visual Quests"
- Verified badge + creator leaderboard

### Kalpana Circle (Community)
- Instagram-style backend: posts, stories (with a "Close Friends" audience
  restriction), likes, comments, saved posts, live search
- Discord-style servers/channels/roles system (7 Supabase tables, RLS,
  SECURITY DEFINER helpers, realtime chat)
- Image/attachment messages in DMs and group chats
- Group chat settings (rename, add/remove member, leave)
- Notifications system, polls, broadcast channels (creator-authored, with a
  discovery feed) and creator-only community space
- Series ↔ K Circle cross-link, KaTube ↔ K Circle auto-post cross-link
- Double-tap-to-like with heart-burst animation, Discord-style desktop shell
  with a shared, viewport-pinned rail (rolled out across chat, Watch Together,
  and every browsing page)
- Platform-wide notification sound (synthesized Web Audio tone, no asset
  file, near-zero bundle cost) with a mute toggle on the notification bell,
  focused-tab suppression, and cross-tab/double-mount dedupe — also played
  when the MANGAL Assistant's reply lands in the chat (§152; the cold-start
  greeting stays silent)

### Landing Page & Ecosystem Showcase
- Framer Motion scroll/entrance animations + particle field, dark-by-default
- Split-screen login redesign with hero video, mobile responsive
- Mobile hero fit (§152): svh-based hero height + focal background-position
  at ≤768px, so the 16:9 hero art frames its subject on phones instead of
  over-zooming into an arbitrary cover-crop
- Always-visible product-door descriptions (WebMangal/KaTube/K Circle) — fixed
  a hover-only visibility bug that hid copy from all touch/mobile visitors
- Per-platform capability grid ("features section") on `/about`, reused on
  the homepage — audited feature-by-feature against real shipped code before
  writing any copy
- The MANGAL Assistant — one floating AI chatbot widget present on every route

### Platform-wide Engineering
- Repo restructure: flat `app/` → `src/app/`, `lib/`/`components/` split by
  domain, WebMangal-specific routes moved under `WebMangal/`
- Post-login default destination is `/WebMangal` everywhere (§152) — links,
  login/OAuth fallbacks, and the legacy `/home` redirect all point at the
  browse/front door; `/WebMangal/home` remains the personalized feed but is
  no longer a nav-link target or default landing (explicit `?next=` deep
  links to it are still honored)
- Site-wide mobile-compatibility sweep (bookmarks, history, rankings, tags,
  upload, library, and beyond) using a `mangal-*` BEM + `@media` convention
- Performance/architecture hardening pass — pagination/infinite scroll,
  single SWR client-cache layer, HTTP cache headers, memoized recompute, DB
  indexes on filter/sort/join columns, asset optimization (full ledger:
  `docs/SESSION_HISTORY.md` §139–140)
- Direct-to-VPA UPI payments end-to-end (tips, Remove Ads, book unlocks),
  admin verification queue

---

## 4. Known Issues & Fixes Ledger

### 🔴 Supabase migration drift — DO NOT run `supabase db push` (open, needs a dedicated session)
The local `supabase/migrations/` folder is out of sync with the live database
beyond what's already been reconciled. As of the last fix (`§136`, full detail
in `docs/SESSION_HISTORY.md`), migration history is a **deliberate three-entry
state**:
1. `20260901091246` — the real Books schema-cache DDL, applied live via the
   Supabase MCP connector. Has no local file (existing local files already
   match its output).
2. `20260822000000` — repair-marked applied, to stop `db push` from re-running
   the module file (which would regress the `updated_at` trigger functions to
   an un-hardened body missing `set search_path = ''`).
3. `20260825000000` — same repair-marking, same rationale.

**~40 additional pre-existing local-only migration versions** were applied
out-of-band under auto-generated timestamps and are still unreconciled.
**Do not run `npx supabase db push`** until a dedicated reconciliation
session audits every drifted file against the live schema and repair-marks
what's already applied. Per-file applies (Dashboard SQL Editor / MCP /
`supabase db query --linked -f <file>`) remain the safe path in the meantime.

### Cloudflare Worker bundle-size — recurring failure mode, fixed (watch for recurrence)
The Cloudflare Workers free-plan gzip upload ceiling (3,072 KiB) has been
breached twice by the same root cause: browser-only libraries
(`@mlc-ai/web-llm`, `jspdf`, `@tiptap/*`) getting traced into the
server-side bundle even when only *dynamically* imported, because any
component that statically imports a dynamic-importer still gets that
importer's whole subtree traced into its SSR graph.

**The fix pattern (apply to any future offender):**
1. Wrap the offending component in `next/dynamic(() => import(...), { ssr: false })`
   at every page that renders it — this is what actually removes a module
   from the server trace, not `serverExternalPackages` alone (which keeps a
   package out of `handler.mjs` but *not* out of the Next.js file-trace, and
   on Windows causes an `EPERM: symlink` build crash via OpenNext's traced
   junctions).
2. For libraries only needed for their runtime, not for SSR at all (e.g.
   jsPDF), load them at runtime via a `<script>`-tag-injected vendor bundle
   (`public/vendor/*.umd.min.js`) instead of an npm import, keeping the
   `import type` for compile-time types only (erased, never traced).
3. Add the package to `next.config.ts`'s `serverExternalPackages` as
   defense-in-depth against a future accidental server-reachable re-import.
4. Verify with: `npx opennextjs-cloudflare build` → check
   `.open-next/server-functions/default/handler.mjs` raw size and the
   `.nft.json` trace files for the package name (should be 0 hits), then
   `npx wrangler deploy --dry-run --outdir <dir>` for the real gzip number.

Last measured result after the fix: handler.mjs raw dropped from 15.5 MB to
8.1 MB (−48%), gzip upload 2.17 MiB — roughly 0.9 MiB of headroom under the
3,072 KiB ceiling. Full before/after numbers: `docs/SESSION_HISTORY.md` §141.

### Auth: banned-user screen was showing the wrong message
`login/page.tsx` mapped `account_active === false` to the "waiting for parent
consent" DPDP screen in both `checkSession` and `handleLogin` — but
`account_active=false` is shared by banned users *and* minors pending parent
consent. Fix: branch on `is_minor` / `parent_consent_status` instead of
`account_active` alone before deciding which screen to show.

### Admin reports: song reports were silently failing
The `reports_target_type_check` DB constraint didn't include `'song'` as a
valid `target_type`, so every song report from `ReportButton.tsx` failed at
insert. The admin page's content-removal table map and ban-flow owner lookup
also had no branch for `song`/`kcircle_post` targets, causing wrong-table
deletes. Needs an idempotent constraint rebuild adding `'song'`, plus the
admin-page union/table-map/owner-lookup updates (tracked in `docs/SESSION_HISTORY.md` §143).

### Three-finding fix round — batch-splitter, notification race, UPI capture guard (§153, fixed)
`editorAssist.ts`'s page-batch splitter had no actual word-level fallback
for a paragraph with zero sentence punctuation (a giant no-period paste
sailed past the 22k/24k budgets); `notify-followers`'s `notified_at`
idempotency guard was a non-atomic read-early/write-late race that could
double-email every follower on a double-click or retry; the UPI manual-
capture route had no guard against capturing a payment still in `'created'`
status. All three fixed and verified (`tsc` clean, isolated repro for the
splitter). `npm run build` could not be run to completion in the fix
sandbox (no egress to `fonts.googleapis.com` for `next/font`) — full detail
and gate results: `docs/SESSION_HISTORY.md` §153.

---

## 5. Active Roadmap & Pending Tasks

Priority order, per the founder's latest direction:

1. **"Unique for Mangal" (§0)** — Mangal Ideas feed, Mangal of the Week,
   WebMangal Writer of the Month. Standing rule: no other backlog item should
   be picked up until this is done, unless the founder explicitly redirects.
2. **Unify `/dashboard`'s tabs** into one shell with a per-product scope
   switcher (Workspace/Earnings/Perks/Boost/Academy/Nova/Tools) — flagged
   high priority, some sub-tabs retrofitted, not fully complete.
3. **R2 media migration follow-through** — media upload/read/delete now goes
   through Cloudflare R2 instead of Supabase Storage; still need to run the
   `/api/admin/migrate-media` backlog-migration route repeatedly (post-deploy)
   until `hasMore: false`, to finish moving pre-existing files off the old
   Supabase buckets. Only clean up those buckets once migration is confirmed complete.
4. **Verify the Workers AI model ID** (`@cf/llava-hf/llava-1.5-7b-hf`) against
   the live Cloudflare dashboard — unresolved because the build sandbox has
   no network access to Cloudflare's API.
5. **KaTube §28b remainder** — native KaTube community-update posts (channel
   analytics and public channel pages are already done).
6. **K Circle Studio (Phase 3)** — not started.
7. **AI features backlog** (by product, cost-minimization prioritized) —
   AI-written chapter/series blurbs, AI-generated video tags/description +
   moderation assist, AI-summarized K Circle discussion threads. Full
   priority/cost breakdown: `docs/SESSION_HISTORY.md` §58.
8. **Creator-side retention & monetization features** — tipping, memberships,
   bounty payouts (items 1–3 of the original §27 list) — scoped but not started.
9. **Affiliate "AI Toolkit" page for creators** — idea discussed and scoped,
   backlog.
10. **Novel-to-video Creator Collaboration pipeline** — discussed and
    critiqued from an investor lens (flagged as not currently a path to
    profit on its own); revenue-first recommendations exist in
    `docs/SESSION_HISTORY.md` §29–§31 and should be read before resuming this.
11. **Storage/bandwidth strategy** (Supabase Storage vs. Cloudflare R2) —
    analyzed, largely superseded by the R2 migration already in progress (item 3).

**Standing conventions carried into all future work:**
- Every deploy-affecting change re-runs the full gate sequence (§2) before
  being called done, including the wrangler dry-run size check.
- Every UI-affecting change gets an explicit mobile check at 320–768px
  before being marked done, not assumed from desktop behavior.
- Feature-status claims (landing-page copy, `/about` capability grid, etc.)
  must be audited against real shipped code, not written speculatively —
  the §147 audit table in `docs/SESSION_HISTORY.md` is the reference pattern
  for how to do this.
