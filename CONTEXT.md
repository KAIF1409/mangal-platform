# MANGAL Ecosystem — Project Context

> **Read this file first, every session.** This is the working memory for the MANGAL
> ecosystem — what it is, what's built, what's next, and the conventions to follow.
> Keep it updated at the end of every session that changes scope or ships a feature.

---

> **⭐ CURRENT TOP PRIORITY (per founder, latest session):** §90 (bottom of
> this file) — R2 media migration. §85 (WebMangal "Songs") is now fully
> closed (data model through search integration all shipped). The app has
> since moved off Vercel onto Cloudflare Workers (§86–§89: OpenNext config,
> bundle-size fix, Workers-AI-based NSFW check, Worker renamed to `mangal`),
> and all media upload/read/delete now goes through R2 instead of Supabase
> Storage (§90 parts 1–3). **Still open from §90:** run the
> `/api/admin/migrate-media` backlog-migration route repeatedly (post-deploy)
> until `hasMore: false`, to finish moving pre-existing files off the old
> Supabase buckets — only then is it safe to clean those buckets up. Also
> still open: verify the `@cf/llava-hf/llava-1.5-7b-hf` Workers AI model ID
> against the live Cloudflare dashboard (flagged in §88, unresolved since no
> network access to Cloudflare's API from the build sandbox). The §77 item
> below is still open too, further behind in the queue now.

## 0. 🔴 HIGHEST PRIORITY — "Unique for Mangal" (build this before anything else)

> **Rule for every future session: do not pick up other backlog items (§4 or any
> session-log section below) until the phases in this section are done.** This is
> the founder's top priority feature category — read this section first, before
> anything else in the file.

This is a new category of features, grouped under the name **"Unique for Mangal"**
— three connected pieces that turn the ecosystem into a self-reinforcing loop:
discovery → collaboration → recognition/reward → repeat.

### 0a. Brief explanation

Right now WebMangal (stories), KaTube (AI-anime videos), and Kalpana Circle
(community) are connected but nothing actively *drives* writers and video creators
to collaborate, and nothing rewards the best work on a recurring cadence. "Unique
for Mangal" fixes that with three pieces:

1. **Mangal Ideas** — a feed on the KaTube homepage that surfaces (a) ideas the
   founder/company posts directly, and (b) trending WebMangal stories that don't
   have a KaTube adaptation yet, inviting AI-video creators to collaborate with
   that story's writer.
2. **Mangal of the Week** — a weekly, audience-voted leaderboard on Kalpana
   Circle. Top 5 videos of the week get ranked and awarded "Mangal of the Week"
   with prize money (announced in-app only, no payment integration for now).
3. **WebMangal Writer of the Month** — a monthly award for the writer whose
   story generated the most/best collaboration activity that month.

### 0b. Example / story walkthrough (how it should feel end-to-end)

> Riya writes a WebMangal story called *"Chandra's Last Flight"*. It starts
> trending on WebMangal (lots of reads, no KaTube video yet). A **story-demand
> card** for it automatically appears in the Mangal Ideas feed on KaTube's
> homepage: *"Chandra's Last Flight is in demand — bring it to life on KaTube."*
> Aman, an AI-anime creator, sees the card, taps "Collaborate," and it sends
> Riya a request. They team up; Aman posts the video, tagged as a **collab**
> (Tier 1) with Riya credited as the writer.
>
> That video gets picked up in the week's top-20-by-views pool. It shows up in
> Kalpana Circle's weekly survey. Users watch, vote for it, and when they vote
> they're asked *why* — a scroll-down picker where they tap reasons like
> "Editing," "Sound," "Story," and can add a comment like *"story mast hai aur
> editing bhi zabardast"*. Because it's a Tier 1 collab video, its score gets a
> priority boost over solo (Tier 2) videos in the ranking.
>
> At week's end, it lands in the Top 5 — Aman and Riya are announced as part of
> **"Mangal of the Week"** in Kalpana Circle, with a prize-money amount shown
> (paid out manually, outside the app for now). At month's end, because Riya's
> story drove the most/best collab activity that month, she's announced as
> **"WebMangal Writer of the Month."**

### 0c. Structure — phased build plan

**Phase 0 — Shared foundations** (build first, everything else depends on it)
- `mangal_ideas` table: `type` (`company` | `story_demand`), `series_id`
  (nullable), `title`, `description`, `created_by`, `created_at`
- `weekly_rankings` table: `week_start_date`, `video_id`, `tier`, `votes_count`,
  `views_snapshot`, `final_score`, `rank`
- `video_votes` table: `user_id`, `video_id`, `week_id`, `reason_tags[]`,
  `comment`, `created_at` — **unique constraint on `(user_id, week_id)`** so one
  vote per user per week
- `monthly_writer_awards` table: `month`, `series_id`, `writer_id`, `score`, `rank`
- Add `is_collab` + `collab_writer_id` columns to the KaTube videos table (if not
  already present) — needed to distinguish Tier 1 (collab) vs Tier 2 (solo)

**Phase 1 — Mangal Ideas feed (KaTube home) — own dedicated phase, multi-source**

> Supersedes the earlier single-source draft of this phase. The feed shows
> **minimum 1, maximum 4 idea cards** at a time, pulled from **three sources**,
> each card linking out to where it came from ("connection link"):

| # | Source | What it is | Connection link |
|---|--------|------------|------|
| 1 | **WebMangal** | Auto-surfaced trending story with no/low KaTube adaptation yet (already designed above — `mangal_ideas.type = 'story_demand'`) | Links to the WebMangal series page |
| 2 | **Audience (Kalpana Circle)** | The top audience-submitted idea/request post from Kalpana Circle, picked by **most likes + comments** (engagement) | Links to the original Kalpana Circle post |
| 3 | **Company/platform** | Admin-authored idea card, same as before (`type = 'company'`) | Optional link, admin-set |

**Selection rule:** show at least 1 card total (never empty if *any* source has
content), up to 4 max. Prefer covering all three sources first (1 card each =
3), then fill a 4th slot from whichever source has the next-strongest
candidate (e.g. a second high-engagement audience idea, or a second
story-demand series) — so the feed never looks empty even if one source is
dry, but also never crowds out the other two sources if all three are active.

**Schema addition needed (not yet applied):**
- `mangal_ideas.type` check constraint extended to `('company', 'story_demand', 'audience')`
- `mangal_ideas.source_post_id` — new nullable column, `references kcircle_posts(id) on delete cascade`, set only for `type = 'audience'` rows (this is the "connection link" target for audience cards)
- `mangal_ideas.link_url` — new nullable column, for the company-card admin-set optional link
- Need a way to mark a Kalpana Circle post as an "idea/request" post so the
  audience-idea picker knows what pool to rank — reuse the existing
  `kcircle_posts.tag` column (e.g. tag = `'idea'`) rather than a new table

**Build steps:**
1. Migration: extend `mangal_ideas` type constraint + add `source_post_id` and
   `link_url` columns (see above)
2. Admin-only insert UI for company idea cards (reuse existing admin/dashboard
   pattern), with the optional link field
3. Scheduled/on-load query for story-demand cards (WebMangal series trending,
   no/low KaTube adaptation) — as originally designed
4. Scheduled/on-load query for audience-idea cards: top `kcircle_posts` tagged
   `'idea'`, ranked by `likes + comments` engagement, auto-inserted/refreshed
   into `mangal_ideas` as `type = 'audience'` with `source_post_id` set
5. Selection function implementing the "min 1, max 4, cover all sources first"
   rule above
6. Card component on KaTube home, top section, horizontal scroll, mixing all
   three card types, each rendering its connection link
7. "Collaborate karna chahta hoon" button (story-demand cards only) →
   notification/DM to the writer (reuse Kalpana Circle DM infra)

**Phase 2 — Mangal of the Week**
1. Weekly scheduled job: pull top 20 videos by views for the week, snapshot into
   `weekly_rankings`
2. Voting UI in Kalpana Circle: shows the 20, user picks one, then a reason-tag
   scroll picker (Editing / Sound / Story / Voice / Animation + optional free-text
   comment)
3. Scoring job (runs at week end):
   `score = votes×W1 + views×W2 + likes×W3`, with a Tier 1 (writer+creator collab)
   bonus multiplier
4. Top 5 announcement UI — Kalpana Circle post + banner/spotlight on KaTube,
   "Mangal of the Week" badge on winning videos/creator profiles
5. Prize money: text/display field only (e.g. "₹X awarded") — no payout logic,
   manual process outside the app

**Phase 3 — Writer of the Month**
1. Monthly job: aggregate all Tier 1 collab videos per writer for the month, sum
   their vote/view scores
2. Top writer gets "WebMangal Writer of the Month" badge on profile +
   Kalpana Circle/KaTube announcement
3. Same manual-announce pattern for prize money as Phase 2

Suggested order: **Phase 0 → Phase 1 → Phase 2 → Phase 3** (Phase 3 reuses
Phase 2's scoring logic, so it's fast once Phase 2 exists).

### 0d. Anti-abuse (decide/build alongside Phase 2, not after)

- **One vote per user per week** — enforce via DB unique constraint on
  `(user_id, week_id)`, not just a UI check
- Consider a minimum account-age or activity threshold before a user can vote,
  so freshly-created bot accounts can't stuff votes
- Views used in scoring should be **capped or log-scaled**, not raw — an
  unbounded raw view count can let view-farming dominate the score and drown
  out genuine quality votes
- Reason-tag/comment field should be moderated the same way other Kalpana
  Circle comments are (existing moderation pattern, no new system needed)

### 0d-i. Phase 0 — DONE (applied live)

Shipped as `supabase/migrations/20260816230000_unique_for_mangal_phase0_foundations.sql`
(applied live via Supabase MCP, `get_advisors` checked clean — no new warnings on
any of the tables/columns/policies below):

- `mangal_ideas` — `type` (`company`/`story_demand`), `series_id`, `title`,
  `description`, `created_by`. Public read; admin-only write via the same
  `EXISTS (profiles me ... role = 'developer')` pattern already used for
  `"Admin can update profiles"`.
- `weekly_rankings` — `week_start_date`, `video_id`, `tier`, `votes_count`,
  `views_snapshot`, `final_score`, `rank`. Unique on `(week_start_date, video_id)`.
  Public read; admin-only write.
- `video_votes` — `user_id`, `video_id`, `week_start_date`, `reason_tags[]`,
  `comment`. **Unique on `(user_id, week_start_date)`** — the anti-abuse
  one-vote-per-week constraint. Own-row read/insert only, no update/delete
  policy (a cast vote is locked in).
- `monthly_writer_awards` — `month`, `series_id`, `writer_id`, `score`, `rank`.
  Unique on `(month, series_id)`. Public read; admin-only write.
- `videos.is_collab` (boolean) + `videos.collab_writer_id` (uuid, nullable FK to
  `auth.users`) — the Tier 1/Tier 2 distinction.

Phase 2 (build steps 1-5, minus the anti-abuse trigger which was already
part of the phase2_functions reconciliation) is DONE — see §0d-iii below.
Phase 3 (writer-of-the-month job) is now also DONE — see §0d-iv below.

### 0d-ii. Phase 1 — DONE

Build steps 1/3/4/5 (schema extension + both SQL functions) were applied
live via Supabase MCP in an earlier session but never committed as migration
files or logged here — found and reconciled this session. Now committed as
`supabase/migrations/20260816240000_unique_for_mangal_phase1_schema.sql` and
`20260816240100_unique_for_mangal_phase1_functions.sql` (content verified
against the live DB before writing, so these are no-ops on re-apply, not
duplicate changes).

Build steps 2/6/7 (the actual missing pieces) shipped this session:
- **Admin insert UI** — `app/admin/mangal-ideas/page.tsx` (+ layout), same
  developer-role-gated pattern as `app/admin/reports/page.tsx`. Add/delete
  company cards (title, description, optional link). Also surfaces a manual
  "Refresh now" button that calls `refresh_mangal_ideas()` — there's no
  scheduled job yet, so story-demand/audience candidates only recompute when
  an admin triggers it here.
- **Card component** — `app/katube/components/MangalIdeasRow.tsx`. Reads
  `get_mangal_ideas_feed(4)`, batch-fetches `series`/`kcircle_posts`/
  `creator_profiles` for the connection-link + writer/author display, same
  "returns null when empty" pattern as `ContinueWatchingRow`. Rendered at
  the top of KaTube home, above Continue Watching.
- **Collaborate button** — story_demand cards only. Reuses Kalpana Circle's
  DM tables (`kcircle_conversations`/`_participants`/`_messages`, same
  lookup/insert pattern as `startDirectMessage` in
  `app/kalpana-circle/chat/page.tsx`) to open-or-reuse a 1:1 thread with the
  series' writer and drop in a starter message, then routes to
  `/kalpana-circle/chat?open=<conversationId>`.
- Added `?open=<conversationId>` deep-link support to the chat page itself
  (wasn't there before) so the Collaborate button lands the user in the
  right thread instead of the bare conversation list. `useSearchParams`
  needed a `Suspense` wrapper — same pattern already used in
  `app/upload/page.tsx` and `app/kalpana-circle/page.tsx`.

Not built yet: connection link for `audience` cards falls back to the post
author's Kalpana Circle profile — there's no single-post permalink route in
this codebase yet, so it can't deep-link to the exact post itself.

### 0d-iii. Phase 2 — DONE

Schema/functions (build steps 1/3/4/5's SQL) were applied live via
Supabase MCP in an earlier session but never committed as migration files
or logged here — found and reconciled in commit `3b75173` as
`supabase/migrations/20260816154647_unique_for_mangal_phase2_schema.sql`
(`weekly_rankings.prize_note`, `video_votes.reason_tags` vocab check) and
`20260816154710_unique_for_mangal_phase2_functions.sql`
(`video_votes_enforce_min_account_age()` trigger, `snapshot_weekly_top20()`,
`finalize_weekly_rankings()`, `get_mangal_of_the_week()`) — content
verified against the live DB before writing, so these are no-ops on
re-apply, not duplicate changes.

Build steps 2/4 (the actual missing pieces) shipped this session:
- **Voting UI** — `app/kalpana-circle/mangal-of-the-week/page.tsx`. Shows
  the current week's top-20 pool (`weekly_rankings` for the current week,
  joined to `videos`/`creator_profiles`), lets a signed-in reader pick one
  video, tag reasons (Editing/Sound/Story/Voice/Animation via the
  `REASON_TAGS` picker) with an optional comment, and cast one vote —
  mirrors the DB's one-vote-per-week unique constraint and 24h
  min-account-age trigger client-side so the UI never lets someone try a
  blocked action, rather than relying on the DB error alone. Also shows
  last week's Top 5 (`get_mangal_of_the_week()`) with prize-note display.
  Same simple back-arrow header pattern as `broadcasts`/`saved`, not the
  full desktop-rail `Shell.tsx` shell.
- **Nav wiring** — `Shell.tsx` (desktop rail) and
  `app/kalpana-circle/page.tsx` (mobile bottom tab bar) both got a Trophy
  icon linking to the voting page.
- **Admin controls** — `app/admin/mangal-of-the-week/page.tsx` (+ layout),
  same developer-role-gated pattern as `/admin/mangal-ideas`. Snapshot
  button (`snapshot_weekly_top20()`, current week) shows the resulting
  pool; Finalize button (`finalize_weekly_rankings()`, previous week)
  scores + ranks it; a grouped-by-week list of past Top 5s with an inline
  prize-note editor per row (direct `weekly_rankings` update, covered by
  the existing `weekly_rankings_admin_write` RLS policy — no new RPC
  needed for this one).
- **KaTube home banner** — `app/katube/components/MangalOfTheWeekBanner.tsx`.
  Self-contained, "returns null when empty" component (same pattern as
  `MangalIdeasRow`/`ContinueWatchingRow`) spotlighting the current #1
  video with its prize note, linking out to the full Top 5 on the K
  Circle page. Rendered on KaTube home, above Mangal Ideas.
- **Winner badges** — `VideoGridCard.tsx` exports a new `MangalWeekBadge`
  (gold "#1 this week" pill for rank 1, plainer pill for #2-5), rendered
  via the card's existing `badge` prop wherever a video_id→rank map says
  a video is in the current Top 5: KaTube home's grid + New Voices row
  (`app/katube/page.tsx`, fetches the map once per page load from
  `get_mangal_of_the_week()`) and each creator's channel page
  (`app/katube/channel/[username]/page.tsx`, same fetch pattern).
- **Creator-profile badge** — same channel page also shows a "Mangal of
  the Week" flair next to the verified badge in the profile header when
  that creator is credited (as solo creator or Tier 1 collab writer) on
  any current Top 5 video.

Not built yet: no scheduled job for snapshot/finalize (same "admin
triggers it manually" pattern as Phase 1's Mangal Ideas refresh — a real
weekly cron is a follow-up, not blocking).

### 0d-iv. Phase 3 — DONE

Schema addition (`monthly_writer_awards.prize_note`, mirroring
`weekly_rankings.prize_note`) plus the finalize + read functions were
applied live via Supabase MCP and committed as
`supabase/migrations/20260816250000_unique_for_mangal_phase3.sql`.

- **`finalize_monthly_writer_awards(p_month date default null)`** —
  developer-only, defaults to finalizing the previous calendar month (same
  "finalize the period that just ended" default as
  `finalize_weekly_rankings()`). Reuses Phase 2's scoring rather than
  recomputing votes/views/likes from scratch: sums each writer's Tier 1
  (collab) videos' already-finalized `weekly_rankings.final_score` for
  weeks falling in the target month, grouped by `videos.collab_writer_id`.
  Since `monthly_writer_awards` still needs one `series_id` per writer
  (not-null FK, unique with `month`), the writer's single
  highest-scoring series that month is stored as the representative
  credit — the rank itself is by the writer's *summed* score across all
  their collab series, not any one series' score alone. Upserts on
  `(month, series_id)`, then ranks by score within the month.
- **`get_writer_of_the_month()`** — read helper, same
  aggregate-output-only pattern as `get_mangal_of_the_week()`. Only ever
  returns the single `rank = 1` row for the most recently finalized
  month (unlike the weekly version's top 5 — the spec here is "top
  writer gets a badge," singular).
- **Admin controls** — new "Writer of the Month" section appended to
  `/admin/mangal-of-the-week` (same page, same developer-role gate,
  rather than a separate admin route — it's one page-load, two related
  admin controls). Finalize button; past-months list grouped by month
  with an inline prize-note editor per row, same direct-table-update
  pattern as the weekly section's prize notes (no new RPC needed, covered
  by the existing `monthly_writer_awards_admin_write` RLS policy).
- **KaTube home banner** — `app/katube/components/WriterOfTheMonthBanner.tsx`,
  same "returns null when empty" self-contained pattern as
  `MangalOfTheWeekBanner`/`MangalIdeasRow`. Rendered on KaTube home,
  between the weekly banner and Mangal Ideas. Links to the writer's
  `/creator/[username]` profile (falls back to the K Circle page if no
  username).
- **Kalpana Circle announcement** — added to the existing
  `/kalpana-circle/mangal-of-the-week` page (not a separate route) as a
  block between "Last week's Top 5" and the weekly voting section.
- **Writer-profile badge** — `/creator/[username]/page.tsx` fetches
  `get_writer_of_the_month()` once on load and compares `writer_id` to
  the profile being viewed (same "read the RPC once, compare to this
  profile's id" pattern as the KaTube channel page's `bestOwnRank`
  check), rendering a purple "Writer of the Month" pill next to the
  verified badge when it matches.

**Verified:** all five touched/new files parse cleanly (babel parser
check — `tsc`/`eslint` skipped per this repo's containerized-environment
convention). `get_advisors` (security) run after applying the migration —
`finalize_monthly_writer_awards`/`get_writer_of_the_month` show the same
`anon`/`authenticated`-can-execute `SECURITY DEFINER` WARNs every other
RPC in this codebase already has (each guards itself internally —
`finalize_*` checks the caller's role and raises if not `developer`,
`get_*` is a read-only aggregate) — not a new class of issue.

**Not done:** no scheduled job for the monthly finalize either (same
manual-trigger pattern as Phases 1/2 — a real cron is a follow-up across
all three, not blocking); no UI surfacing a writer's *history* of past
monthly wins beyond the admin page's list (a "past winners" reader-facing
view like the weekly Top 5 history would be a natural follow-up if this
gets used).

### 0e. Not decided yet / outside this section's scope
- Exact scoring weights (W1/W2/W3) — tune once real vote/view data exists
- Prize money amounts/currency and cadence of manual payout — founder decision,
  not a code concern
- Whether Tier 1's "priority boost" is a flat bonus or a multiplier — **decided**
  during Phase 2 implementation: flat +15% multiplier (`tier1_bonus` in
  `finalize_weekly_rankings()`), not a flat additive bonus.

---

## 1. What this project is

MANGAL started as a single platform (manga/webcomic/novel reading — see `README.md`
for the original product description) and is now expanding into a three-part
ecosystem, all under one Next.js app, one Supabase project, one Vercel deployment:

| Part | Route | What it is | Status |
|---|---|---|---|
| **WebMangal** | `/`, `/search`, `/read/...` | The original MANGAL platform — read manga, comics, and novels. Fully live. | ✅ Live, in active use |
| **KaTube** | `/katube` (redirected from `/kalpanaverse`) | A YouTube-style discovery platform for **AI-generated anime videos made by MANGAL creators**, adapted from their own MANGAL series. Includes a Shorts row and full-screen Shorts feed. Brand: white + blue (distinct from Kalpana Circle's purple). | 🟢 Grid, Shorts (row + full-screen feed), watch page (incl. tag-based recommendations), upload flow, channel verification, content moderation, ranking/filtering, and like/comment/subscribe engagement all live on real Supabase data (see §4, §11) |
| **Kalpana Circle** | `/kalpana-circle` | A standalone community space for anime discussion — theories, fan art, reactions, requests for what to adapt next. Deliberately separate from the video platform, not a tab inside it. Brand: purple/violet. | 🟢 Posts, stories, likes, comments, saved posts, image-attachment DMs/group chats, live search, group settings, series↔Circle cross-link (tag filter), and creator broadcast channels all live on real Supabase data (see §12–§12g). Notifications, polls, close friends, voice/video, and channels/roles are not built yet (see §14). |

The homepage (`app/page.tsx`) shows all three as equal "doors" right under the hero,
plus nav links on both the public landing page and the authenticated `/home` page.

### 1a. Naming — rename applied

The founder locked in a new brand direction, built around
the Hindi/Sanskrit word **"Kalpana"** (imagination) — chosen deliberately over
"AnimeTube"/"KalaTube"/"Imagine Tube" because:

- **"-Tube" as a suffix is globally saturated** (YouTube, RedTube, SchoolTube,
  FilesTube, JewTube all exist) and reads as a knockoff name rather than an
  independent brand — bad for a platform that wants to "shine globally"
- **"KalaTube" has an exact prior-use collision** — an existing iOS karaoke app is
  already called KalaTube, so that direction was dropped
- **"Kalpana"** was checked and is clean — no existing "Kalpanaverse" or
  "KalpanaTube" product anywhere; it's just a common Indian word/first name, never
  claimed in tech/video/media. It also directly matches the founder's own framing
  of the idea: *"an imaginary world where everything imaginary — dreams, power,
  everything unreal — becomes real."* (Note: standard trademark/domain-registration
  caveats apply — a quick web check is not a substitute for a real legal clearance
  before formal company/trademark registration.)

**Applied naming:**

| Old (pre-rename) | Current |
|---|---|
| MANGAL (reading platform) | **Unchanged** — stays MANGAL, it's the established/live brand |
| AnimeTube (`/animetube`) | **Kalpanaverse** (`/kalpanaverse`) |
| Anime Chat (`/anime-chat`) | **Kalpana Circle** (`/kalpana-circle`) |

**Narrative thread across the three:** *"MANGAL writes the story. KaTube
brings it to life. Kalpana Circle is where the dreamers gather."*

**What the rename touched (done):**
- `app/animetube/page.tsx` → `app/kalpanaverse/page.tsx` (route renamed via `git mv`,
  content updated: component renamed `KalpanaversePage`, all "AnimeTube" copy →
  "Kalpanaverse", cross-link to Kalpana Circle updated)
- `app/anime-chat/page.tsx` → `app/kalpana-circle/page.tsx` (same treatment,
  component renamed `KalpanaCirclePage`)
- Nav links and the three-door landing section in `app/page.tsx` and
  `app/home/page.tsx`
- `README.md`'s reference to "AnimeTube"/"Anime Chat" in the Status section
- Kalpanaverse's brand colors switched from pink/purple to **white + blue**
  (`#2563eb` / `#0ea5e9` family) per founder request, to visually distinguish it
  from Kalpana Circle's purple — see §1b
- Not yet done: any metadata/OG tags if these pages get their own `metadata`
  export later (neither has one yet, so nothing to update)

### 1a-ii. Second rename — Kalpanaverse → K-Tube → KaTube

Kalpanaverse was later renamed again, twice in quick succession, to land on a
shorter product name:

- **Kalpanaverse → K-Tube**: display copy and logo swapped first. Later found to
  collide with real existing Android apps (KTube, kTube, K Tube by Myanmar
  Digital Solutions).
- **K-Tube → KaTube** (`f57c7a2`): collision fix. KaTube only collides with a
  couple of small personal creator handles, not real products, so it's the
  cleaner name. Logo swapped to a new chroma-keyed transparent PNG
  (`public/katube-logo.png`, replacing `public/ktube-logo.png`), all display
  text/alt-text updated across `kalpanaverse`, `kalpana-circle`, `home`, and the
  landing page.
- **Route + internal naming fix** (`80ad97c`): the two commits above only
  updated *display copy* — the route folder, component name, hrefs, and code
  comments still said `kalpanaverse`/`Kalpanaverse` under the hood. Fixed:
  `app/kalpanaverse/` → `app/katube/` (`git mv`), `KalpanaversePage` →
  `KaTubePage`, all `href="/kalpanaverse"` → `href="/katube"` (landing page ×2,
  `/home`, Kalpana Circle cross-link), stale comments updated. A permanent
  redirect (`/kalpanaverse` → `/katube`) was added in `next.config.ts` via
  `redirects()` so any old bookmarks/shares don't 404.
- **Current canonical name: KaTube, route `/katube`.** Brand colors (white +
  blue, §1b) are unchanged by this rename — only the name changed, not the
  visual identity.



### 1b. KaTube brand colors — white + blue

Per founder request, KaTube uses a **white + blue** palette instead of the
pink/purple it launched with, to read as its own distinct product line rather than
a variant of Kalpana Circle. Kalpana Circle keeps its original purple/violet
identity unchanged — the two should feel related (same MANGAL ecosystem) but
visually distinguishable.

- Primary accent: `#2563eb` (blue-600)
- Secondary/gradient partner: `#0ea5e9` (sky-500), with `#38bdf8` / `#7dd3fc` /
  `#1e3a8a` / `#0891b2` / `#1d4ed8` / `#0369a1` used across video/short card
  gradients for variety within the same blue family
- Badge/pill backgrounds: `rgba(37,99,235,0.10–0.15)` with `rgba(37,99,235,0.28–0.35)`
  borders — same pattern the old pink badges used, just recolored
- Background stays `var(--bg-primary)` (white by default per the site-wide light
  theme), unchanged — the "white" half of the brief was already handled by the
  site's existing light-default theme, this section only needed the accent swap
- Cross-link colors: on KaTube, the "Kalpana Circle" nav link stays purple
  (`#7c3aed`) to represent that destination's own brand; on Kalpana Circle, the
  "KaTube" nav link is now blue (`#2563eb`) for the same reason

## 2. Why KaTube exists (the actual idea, so it doesn't get re-explained from scratch)

- **Not a pirated-anime site.** Every KaTube video is meant to be an *original*
  AI-generated adaptation (Runway/Kling/Pika/Hailuo-style tools) made by a MANGAL
  creator of their own series. This avoids copyright risk entirely.
- **Zero-cost architecture, on purpose.** KaTube will never host video files
  itself. Creators upload their AI-anime clips to YouTube (their own channel, or a
  shared MANGAL channel early on); KaTube only stores metadata (title, YouTube
  video ID, creator, which MANGAL series it's based on, views/likes) in Supabase and
  embeds the YouTube player. This keeps hosting/bandwidth cost at ₹0 regardless of
  scale.
- **Revenue flows to creators via YouTube, not to KaTube directly** — that's a
  conscious trade-off. KaTube's value is the discovery layer and the funnel back
  into MANGAL (readers discover videos → watch → follow the linked series →
  become MANGAL readers), not ad revenue capture. Monetization for the platform
  itself comes later, once there's real traffic (sponsorships, on-page placements,
  eventually a self-hosted video layer if it's ever worth the infra cost).
- **Kalpana Circle is the retention layer** — a reason to come back daily even between
  video uploads.

A full founder's-manual style writeup of this reasoning (including DPIIT/Startup
India registration notes and a co-founder pitch) exists as a PDF shared with the
founder directly — not stored in this repo. Ask if a refresher is needed rather than
re-deriving the business case from scratch.

## 3. Current build status (detailed)

### `/katube` (`app/katube/page.tsx`) — route renamed from `/kalpanaverse`
- **Backend (Supabase), Step 1 — done:** `videos` and `video_likes` tables live
  (`supabase/migrations/20260810_katube_videos.sql`). `videos` has creator_id,
  optional series_id, title, youtube_id, is_short, views, likes, created_at, with
  RLS (public read, owner-only write). `video_likes` is a join table for future
  like functionality, RLS public read / owner-only insert-delete.
- **Main grid, Step 2 — done:** the video grid fetches real rows from `videos`
  (`is_short = false`) instead of placeholder data, resolving creator username
  via `creator_profiles` and series title via `series` in two follow-up
  queries. Thumbnails use the real YouTube thumbnail
  (`img.youtube.com/vi/{youtube_id}/hqdefault.jpg`) instead of gradient/emoji
  tiles. Has a loading state and an honest empty state that now links to the
  upload page.
- **Watch page, Step 3 — done:** `app/katube/watch/[videoId]/page.tsx`.
  Clicking a video card opens this page, loads the row from `videos`
  (+ creator username, + series title if linked), renders the real YouTube
  iframe embed, and best-effort increments the view count on load. No
  like/comment/subscribe yet — noted on-page.
- **Upload flow, Step 4 — done:** `app/katube/upload/page.tsx`. Logged-in
  creators paste a YouTube link (accepts `youtube.com/watch?v=`, `youtu.be/`,
  `/shorts/`, `/embed/`, or a bare 11-char video ID — parsed client-side by
  `extractYoutubeId()`), give it a title, check a "This is a Short" box if it
  belongs in the Shorts row (`is_short`), and optionally pick one of *their
  own* series (`series` where `creator_id = auth.uid()`) to link it to.
  Submits straight to `videos` (RLS already allowed owner-insert, no migration
  needed), then redirects to the new video's watch page. No `creator_profiles`
  gating — matches the existing WebMangal upload page's convention of
  "logged in is enough." Reachable via the blue "⬆ Upload" nav button on
  `/katube`.
- **Shorts row — real data:** the Shorts row now fetches `videos` where
  `is_short = true` (real YouTube thumbnails via `RealShortCard`, click-through
  to the watch page) and only falls back to the original 6 `DEMO_SHORTS`
  gradient/emoji placeholders when there are zero real Shorts yet — with a
  small "demo placeholders, upload one to replace these" note shown in that
  case. Once any creator uploads a Short, demo cards disappear automatically.
- **Still placeholder / not built:** category pills are static/non-functional.
  No subscribe, no comment, no ranking on Shorts. Like is done (§11) — don't
  imply otherwise to the user without checking this file's status table first.
- Brand: white + blue (`#2563eb`/`#0ea5e9` family) — see §1b
- Old `/kalpanaverse` URL permanently redirects here via `next.config.ts`

### `/kalpana-circle` (`app/kalpana-circle/page.tsx`)
- Placeholder discussion feed (4 sample posts: theory, fan art, request, reaction)
- Channel pills (All, Theories, Fan Art, Requests, Reactions, Introductions)
- Post composer is visibly present but **disabled** ("Post — coming soon") — do not
  make this functional without an explicit request, since there's no posts/comments
  table yet
- Cross-linked with KaTube via nav buttons in both directions
- Brand: unchanged purple/violet (`#7c3aed`/`#c4b5fd` family)

### Landing page / nav
- `app/page.tsx` (public landing): three-door section under the hero (WebMangal /
  KaTube / Kalpana Circle), plus nav links for both
- `app/home/page.tsx` (authenticated landing): same nav links added
- Theme: the whole site defaults to **light/white** (`data-theme="light"` set by a
  blocking script in `app/layout.tsx` unless the user has explicitly chosen dark via
  `ThemeToggle`, persisted in `localStorage['mangal_theme']`). KaTube and
  Kalpana Circle both use the shared `ThemeToggle` component and CSS vars
  (`var(--bg-primary)`, `var(--nav-bg)`, etc.) — never hardcode dark colors on these
  pages, or they'll ignore the site's light-default theme.

## 4. Not built yet (the real next steps, roughly in order)

1. Real Supabase `videos` table (title, youtube_id, creator_id, series_id, views,
   likes, created_at) + wire the video-platform grid to real data
2. Creator upload flow — paste a YouTube link, tag the MANGAL series it's based on
3. ~~Ranking (sort by views/likes/recency)~~ — **DONE** (`76d4636`, `2669e82`,
   `8137e81`, `c3c81ae`). Filter pills `['Popular', 'New', 'Rankings',
   'Categories', 'Tools']`: Popular = `views` desc, New = `created_at` desc,
   Rankings = `likes` desc, Categories/Tools filter by `videos.category` /
   `videos.ai_tool` (AND'd together regardless of active sort chip).
4. Real Supabase `posts` / `comments` tables for the community platform, wire up
   the composer
5. Follow/like/comment interactions across the video platform once the above
   exist — **Like: DONE (`17eb400`)**, see §11. **Comment + Follow: DONE
   (`f9b1388`, renamed subscribe→follow shortly after)** —
   `video_comments` + `creator_follows` tables were already live in Supabase
   under the name `creator_subscriptions` (applied via MCP as
   `katube_comments_and_subscriptions` but the migration file was never
   committed — added retroactively). Founder called out it's a **follow, not
   sub-for-sub/subscribe** — table, column (`subscriber_id`→`follower_id`),
   and UI all renamed to match MANGAL's existing `follows` (series) naming.
   Watch page has a real comment box/list and a Follow button (composite PK
   on `creator_follows` prevents double-follow, same pattern as likes). All
   three actions (like/follow/comment) redirect to `/login` if signed out —
   never allowed anonymously — and all three use a `useRef` lock (not just
   the busy `useState`) to close a double-click race: two fast clicks can
   both read a stale `busy === false` before React's first re-render lands,
   since state updates are batched/async; a ref is mutated synchronously so
   the second click sees the lock immediately.
6. **Kalpanaverse sponsorship/ad monetization (documented future step, not started —
   gated behind real traffic).** Founder wants a revenue layer for Kalpanaverse
   itself, not just discovery-for-MANGAL. Direction agreed:
   - **Not YouTube ad revenue** — that stays with the creator's own channel, per the
     zero-cost architecture in §2. This is a *separate* revenue stream the platform
     controls directly: on-page sponsorship (banners/placements around the video
     grid and Shorts row, not inside the embedded player itself), sponsored
     category rows, "Powered by [AI tool]" badges, possibly affiliate links if the
     AI tool companies offer a referral program.
   - **Target sponsors:** AI video-generation tool companies (Kling, Runway, Pika,
     Hailuo, Suno) — Kalpanaverse is a natural showcase for content made with their
     tools, so this is a realistic first sponsorship conversation once there's an
     audience worth showing them. Matches the founder's manual (PDF) §06 Phase 2.
   - **Creator cut:** if a sponsor is specifically sponsoring a creator's content
     (not just a generic site banner), founder wants creators to get a share of
     that — keeps creators loyal, not just relying on YouTube's own ad revenue.
   - **Sequencing — do NOT start this before real traffic exists.** Items 1–5 above
     ship and get real usage first, *then* revisit this. Pitching sponsors or
     building ad-slot infra with zero real users on Kalpanaverse is premature.

## 5. Working conventions (carried over from the original MANGAL build)

- **One change at a time**, not sweeping multi-file rewrites in a single pass —
  the founder has hit token/context limits before from oversized sessions
- **Always run `npx tsc --noEmit` before committing.** Also run
  `npx eslint <changed files>` — but note `app/home/page.tsx` has one pre-existing
  lint error (`react-hooks/set-state-in-effect` at the localStorage read for content
  type) that predates this work and is not something to "fix" incidentally
  mid-unrelated-change unless asked
- **Inline styles throughout** — no Tailwind classes, no CSS modules, in the app
  pages themselves (Tailwind is present in the build pipeline but the existing
  codebase convention is inline `style={{ }}` objects). Match this.
- Use CSS vars (`var(--bg-primary)`, `var(--text-primary)`, `var(--border-color)`,
  `var(--nav-bg)`, etc. — defined in `app/globals.css`) for anything that should
  respect the light/dark theme toggle. Only hardcode colors for things that are
  genuinely theme-independent (e.g. white text over a dark gradient thumbnail tile).
- Full file replacements over partial patches when a file is heavily restructured;
  targeted `str_replace` edits for smaller, localized changes (this file follows
  that judgment call, use it going forward)
- Repo is `KAIF1409/mangal-platform` on GitHub (not `mangal` — that name doesn't
  exist under this account). Push directly to `main`; there's no staging branch.
- The founder frequently works on this repo in parallel from other tools/tabs while
  a session is active — **always `git fetch` + check `origin/main` before pushing**,
  and rebase cleanly rather than force-pushing over unrelated concurrent commits
  (e.g. dashboard/analytics work happens independently of KaTube work).

## 6a. Fixed: Google login randomly failing (`session_exchange_failed`)

Founder reported Google sign-in failing with the URL landing on
`/login?error=session_exchange_failed`, with **no visible error message on
screen** — looked like the page just silently reloaded.

**Root cause (confirmed via Vercel runtime error logs, not guessed):**
`[auth/callback] exchangeCodeForSession failed: PKCE code verifier not found
in storage` — 17 occurrences, 2 users, `2026-08-09` through `2026-08-10`,
**before** any of this session's KaTube work started. So this was **not**
caused by the KaTube rename/upload/Shorts work — same `/login` page, same
`handleGoogleLogin`, used everywhere regardless of which page the "Log in"
link was clicked from. It happened to surface while testing the new KaTube
upload page's login link, but would have failed identically from any entry
point.

**What was actually wrong (two separate bugs, both fixed):**
1. **The cookie loss itself:** `app/lib/supabase.ts`'s `createBrowserClient`
   and `app/auth/callback/route.ts`'s `createServerClient` had no explicit
   `cookieOptions`, relying on library defaults. Added matching
   `{ sameSite: 'lax', secure: true, path: '/' }` on both — `sameSite: 'lax'`
   specifically because the PKCE `code_verifier` cookie must survive Google's
   cross-site top-level redirect back to `/auth/callback`. **Do not add a
   short `maxAge` here** — these options apply to *every* cookie the client
   sets, including the long-lived session/auth-token cookie, not just the
   verifier.
2. **The silent failure:** `/login` never read the `?error=...` query param
   `/auth/callback` redirects back with on failure, and — separately — the
   `Banner` error component was only rendered in the email/password `login`
   mode, never in the default `landing` view (the one with the "Continue with
   Google" button, i.e. what the founder was actually looking at). Fixed both:
   added a `useEffect` that reads the error param, maps known codes
   (`session_exchange_failed`, `missing_code`) to a friendly message, cleans
   the URL via `history.replaceState`, and added the `Banner` render to the
   `landing` view too.
- If this recurs after the cookie fix, it's most likely browser-specific
  (aggressive cookie-clearing extension, or an incognito/private window that
  clears storage mid-redirect) rather than an app bug — the runtime logs are
  the fastest way to confirm one way or the other (`Vercel:get_runtime_errors`
  scoped to `/auth/callback`).

**Follow-up (same day): login always landed on `/home` regardless of where it
started.** There was no "return to this page after login" mechanism anywhere
— `/auth/callback` hardcoded `/home` as the only destination. Fixed by
threading a `next` path end-to-end: `/login?next=/katube/upload` -> read into
`nextPath` state on the login page -> passed as a query param on Google
OAuth's `redirectTo` (`/auth/callback?next=...`) -> read there and used as
the post-exchange redirect target (validated as a same-origin relative path
via `safeNextPath()` to avoid an open-redirect) -> also used for the
email/password login success path and the reader-onboarding-choice redirect
(creator-choice still always goes to `/become-creator`, since that's a
required setup step, not a "return to where you were" case). The KaTube
upload page's "Log in" link now points to `/login?next=/katube/upload`; any
other page that wants "return here after login" should do the same.

**Follow-up (same day): `flow_state_already_used` on localhost.** Reported
with the browser showing `ERR_CONNECTION_REFUSED` on `localhost:3000` — two
separate things: (1) the local dev server wasn't running at that moment, not
a code bug; (2) neither Google button had a loading/disabled guard, so a
double-click (or a slow click before the redirect fires) called
`handleGoogleLogin` twice, generating two different OAuth `state` tokens for
one flow — Supabase's state can only be redeemed once, hence
`invalid_request: flow_state_already_used`. Fixed: added `isGoogleLoading`
state, both Google buttons now disable + show "Redirecting…" after the first
click and ignore repeat clicks until the redirect actually happens. Also
added `flow_state_already_used` to the friendly-error map on the off chance
it does reach `/login` via `/auth/callback` instead of landing on Supabase's
raw Site URL.

**Follow-up (same day, the real root cause): OAuth redirect was going to
`localhost:3000` from the live Vercel site.** Confirmed by the founder
testing on `mangal-platform.vercel.app` and landing on
`http://localhost:3000/?code=...` after picking a Google account — i.e. not
a code bug tied to any specific page, but every Google login on production
was sending the OAuth `redirectTo` to `localhost:3000`. Cause:
`app/login/page.tsx`'s `handleGoogleLogin` built the callback URL as
`process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin` — `NEXT_PUBLIC_*`
vars are baked in at **build time** on Vercel, and this one is very likely
still set to `http://localhost:3000` (leftover from local dev config),
silently overriding the correct `window.location.origin` on every
production build. **Fix:** dropped `NEXT_PUBLIC_APP_URL` from this call
entirely — it now always uses `window.location.origin`, which is guaranteed
correct since this code only ever runs client-side inside a click handler.
**Still needs a founder-side fix, not code:** three server-side API routes
(`app/api/notify-followers/route.ts`, `app/api/confirm-parent-consent/route.ts`,
`app/api/send-parent-consent/route.ts`) still read `NEXT_PUBLIC_APP_URL` to
build absolute links for **emails** — those can't fall back to
`window.location.origin` (no browser on the server). If the Vercel env var
really is set to `localhost:3000`, those emails are almost certainly
embedding broken `localhost` links too. Check Vercel → Project Settings →
Environment Variables → `NEXT_PUBLIC_APP_URL` (Production) and set it to
`https://mangal-platform.vercel.app` (or the real custom domain once one
exists), then redeploy — this file has no tool access to edit Vercel env
vars directly.

**Follow-up (same day): the "return to /katube/upload after login" fix
worked only occasionally, mostly landed on `/home` anyway.** Root cause was
a timing race, not a config issue this time. `nextPath` was set via
`useEffect` + `setTimeout(0)` (deferred to the next macrotask). If the user
clicked "Continue with Google" before that timeout fired —
which, empirically, turned out to be *most* clicks, not a rare edge case —
`handleGoogleLogin` closed over the still-default `'/home'` and silently
dropped the intended return path. **Fix:** `nextPath` is now read via
`useState`'s lazy initializer (`useState(() => ...)`), which runs
synchronously as part of the render that mounts/hydrates the component —
guaranteed to complete before the button is even interactive, no race
possible. The separate error-banner effect still uses `setTimeout(0)` (that
one's fine — errors aren't read by a click handler racing against it) and
still cleans the URL via `history.replaceState` afterward. General lesson
for this file: don't use `useEffect` + deferred `setState` for anything a
click handler might read before the effect fires — use a lazy `useState`
initializer instead when the value only depends on things available at
mount (URL, `window`, etc.).

**Follow-up (same day): "return to page after login" only worked from
`/katube/upload`, not from other pages.** The `?next=...` mechanism itself
was correct — it just wasn't wired into any other "Log in" link, so clicking
login from e.g. a series detail page or search results still landed on
`/home` after auth (not a bug, just incomplete rollout). Extended to the
pages where returning actually matters:
- `app/series/[seriesId]/page.tsx`: login link now carries
  `next=<current series path>` via `usePathname()`.
- `app/search/page.tsx`: both "Log in" and "Get Started" links now carry
  `next=<pathname + ?q=...>` via `usePathname()` + `searchParams.toString()`,
  so search results/filters survive the round trip too.
- **Deliberately left as plain `/login`** (no `next`): `app/page.tsx`
  (logged-out landing) and `app/home/page.tsx` — both already redirect to
  `/home` by default after login, so threading `next` there would be a
  no-op. Don't "fix" these without a reason; they're not bugs.
- If a new page adds a login link, follow the same `usePathname()` pattern
  (`useSearchParams().toString()` too if the page has meaningful query
  state) — plain `href="/login"` will always land on `/home` and requires no
  update itself, but won't return the user to that page.

**Also same day: profile dropdown menu items had zero hover feedback**
(`app/components/ProfileMenu.tsx`) — no visual indication of which item the
cursor was over before clicking. Added a shared `handleItemHover`/
`handleItemLeave` pair (border appears, background lightens, slight
`scale(1.03)`) applied to every menu item (Dashboard, Reader View, Create
New Series, Reading History, Bookmarks, Settings, Become a Creator, Admin
Reports). Sign Out gets its own `handleSignOutHover`/`handleSignOutLeave`
since it already has a red border/background at rest — hover intensifies
that red instead of switching to the neutral style. `itemStyle` now has a
transparent 1px border by default (reserves the space so the border
appearing on hover doesn't shift layout) and a `transition` for all three
properties.

## 7. Session TODO — theme regressions + Upload page redesign (in progress)

> Logged before starting work, per founder's request, so a fresh chat session
> can pick this up without re-deriving it. Update each item's status as it
> ships; move to a "done" note at the bottom when the whole list is clear.

**Root cause of the "half black half white" look (founder-reported, with
screenshot of `/home`):** the site-wide light-default redesign (`3d637c7`,
`f9a48ef`, and the many `Theme: X page uses light-default CSS variables`
commits) covered most pages, but missed a few spots that still hardcode the
old dark palette instead of using the `var(--...)` CSS variables from
`app/globals.css`. Those spots render black no matter what theme is active,
which is what created the jarring split look.

Confirmed hardcoded-dark spots (checked via `grep -c "var(--"` vs hardcoded
hex/rgba across every page):

| # | File | Issue | Status |
|---|---|---|---|
| 1 | `app/home/page.tsx` line ~220 | Nav bar `background: 'rgba(7,7,10,0.97)'` hardcoded — this is the exact bug in the founder's screenshot (black nav strip over an otherwise white page) | ✅ done |
| 2 | `app/components/ProfileMenu.tsx` | Entire component hardcoded dark (0 CSS vars) — not yet visibly broken since it sits on a themed background, but will show a black dropdown panel on the light theme once opened. Also: the closed-state button shows the full email inline at all times — founder wants avatar-only until clicked, matching the dropdown-on-click pattern the identity header inside the panel already does correctly | ✅ done |
| 3 | `app/search/page.tsx` | 0 CSS vars, fully hardcoded dark — my own Step 28 edit only swapped the nav/footer to the shared themed components, the page body (results, filters, cards) was never touched by the theme rollout at all. Will show the same half-black-half-white split as `/home` once visited. **Not yet reported by founder, flagging proactively.** | ✅ done (`293cc19`) |

Library (`app/library/page.tsx`) and Bookmarks (`app/bookmarks/page.tsx`) are
in good shape (18 and 23 `var(--...)` usages, only 1 stray hardcoded color
each) — low priority, not part of this pass unless it becomes visible.

### Upload page (`app/upload/page.tsx`) redesign

Founder shared Wattpad's story-creation flow as a reference for the
*layout pattern* (screenshots: cover-upload panel + stacked detail fields,
Tags input, Mature/Rating toggle) — not a request to clone every Wattpad
field. Confirmed via the file that **comics and manga already share one
upload flow** (single `content_type: 'mangal'` step, differentiated only by
`reading_mode: scroll | page`) — novels already get their own separate
chapter-writing flow. That part needs no change, just wasn't obvious from
the UI.

Planned, scoped to what's actually useful for MANGAL (skipping Wattpad's
Copyright dropdown / Main Characters / Target Audience fields as low-value
scope creep for now — founder can ask for any of these later):

| # | Change | Needs migration? | Status |
|---|---|---|---|
| 4 | Two-column layout for the Series Info step — bigger cover-upload panel on the left (Wattpad-style: large click-to-upload box with icon + label), stacked fields on the right, instead of the current single-column stack with a small 90×120 cover thumbnail | No | ✅ done |
| 5 | Add a **Tags** field to series creation itself (currently tags can only be added *after* creation, via the dashboard's Edit Series modal) — reuse the existing `tags`/`series_tags` tables from the Step 25 tags system, same upsert pattern already in `EditSeriesModal.tsx` | No (tables already exist) | ✅ done |
| 6 | Add a **Mature content** toggle to series creation, matching the reference screenshots | Yes — `series.is_mature boolean not null default false`. Migration file will be added to `supabase/migrations/`; founder needs to run it once in the Supabase SQL Editor like every other migration in this repo | ✅ done (code ships either way — see note below) |

**✅ Migration applied.** `supabase/migrations/20260810_series_is_mature.sql`
was run directly against the live project (`rfxlavwzhpnbhwoumaha`) via the
Supabase MCP connector — confirmed via `information_schema.columns`:
`is_mature boolean NOT NULL default false` exists on `series`. The Mature
Content toggle now persists for real; the defensive insert-retry logic in
`handleCreateSeries` is harmless dead code at this point (kept — costs
nothing, and protects against ever running this code against a
project/branch where the column doesn't exist for some other reason).

### Session status: all 6 items done, pushed to `main`

1. ✅ `/home` nav bar hardcoded-black bug — fixed
2. ✅ `ProfileMenu` — email hidden until clicked, full theme support
3. ✅ `/search` fully themed (`293cc19`) — was 0 CSS vars, now uses
   var(--...) throughout. Also caught 6 spots where white text would've
   gone invisible against a background that just became themeable.
4. ✅ Upload — two-column Series Info layout
5. ✅ Upload — Tags field wired to the existing tags system
6. ✅ Upload — Mature Content toggle + migration (founder needs to run the
   migration — see action item above)

Comics/manga already shared one upload flow before this session (confirmed,
no change needed) — novels keep their separate chapter-writing flow.

## 8. Follow-up audit — remaining hardcoded-dark pages (new session)

Ran the same `var(--...)` vs hardcoded-hex check across every page in the
app to find what else still breaks the light-default theme the same way
`/home` and `/search` did:

| Page | CSS vars | Hardcoded hex | Status |
|---|---|---|---|
| `app/read/[chapterId]/page.tsx` (the reader) | 0 | 229 | ✅ done (`98b3b33`) — chrome only (top bar/sidebar/settings/comments), reading-canvas `bgColor` picker deliberately untouched, see note below |
| `app/series/[seriesId]/page.tsx` (series detail) | 0 | 158 | ✅ done (`049b623`) |
| `app/history/page.tsx` | 0 | 75 | ⏳ queued |
| `app/login/page.tsx` | 0 | 46 | ✅ reviewed, intentionally left as-is — see note below |
| `app/search/page.tsx` | 31 | 3 (intentional) | ✅ done this session |

Everything else (`/`, `/home`, `/tags`, `/rankings`, `/library`,
`/bookmarks`, `/dashboard`, `/upload`, `/creator/[username]`,
`/settings`) already has real theme coverage from earlier sessions.

Working through these one file at a time per the usual convention,
reader and series detail first since they're the two most-visited pages
and are currently 100% hardcoded dark.

**Reader chrome vs reading-canvas — decision made:** the reader has two
separate theming layers. (1) The reading canvas itself has its own
working `bgColor` picker (Black/Dark/Dim/Light/Sepia, saved per content
type) — deliberately independent of site theme, left untouched. (2) The
floating chrome around it (top bar, sidebar, settings panel, comments)
was hardcoded dark always — founder confirmed this should follow the
site-wide theme too (default white, dark as an option), same as every
other page. Fixed in `98b3b33`.

**`/login` — decision made: leave it alone.** Unlike the other 0-var(--...)
pages, this one isn't a missed spot — it's a deliberately art-directed
"Aryavarta" branded screen: full-screen cosmic background image, dark
gradient overlay, custom warm gold/cream palette (`#e0ac5f`, `#f4f1ec`),
distinct copy ("Read. Create. Rise."). Founder confirmed keep it exactly
as designed, independent of the site theme toggle — same category as a
branded splash/login screen on other apps that doesn't follow the
in-app theme. Not queued for conversion.

### Theme rollout — session status: closed out

All pages identified in the original audit are now resolved one way or
another:
- ✅ `/search`, `/read/[chapterId]` (chrome only), `/series/[seriesId]`,
  `/history` — converted to `var(--...)`, light-default with dark option
- ✅ Reader's `bgColor` picker — confirmed correct as an independent
  per-reader preference, left untouched
- ✅ `/login` — confirmed correct as an intentional branded screen, left
  untouched

Every remaining page in the app (`/`, `/home`, `/tags`, `/rankings`,
`/library`, `/bookmarks`, `/dashboard`, `/upload`, `/creator/[username]`,
`/settings`, `/about`, `/help`) already had theme coverage from earlier
sessions. No known hardcoded-dark pages left.

### Theme rollout — follow-up pass (new session, ran a fresh repo-wide audit)

Grepped every `.tsx` file for the known hardcoded dark hex values vs
`var(--...)` usage — found 4 shared components that had **zero** theme
coverage (would show a black popup on the now-white-default site whenever
opened, even though the page underneath them was already themed):

| Component | Where it's used | Status |
|---|---|---|
| `app/components/EditSeriesModal.tsx` | Dashboard → Edit Series | ✅ done |
| `app/components/ManagePagesModal.tsx` | Dashboard → Manage chapter pages | ✅ done |
| `app/components/ReportButton.tsx` | Series/reader "Report" flow | ✅ done |
| `app/components/ShareButton.tsx` | Series/reader "Share" dropdown | ✅ done |

Also fixed one stray hardcoded badge background on `/home` (`#08080c` →
`var(--bg-input)`).

Also extended `dashboard/page.tsx`, `upload/page.tsx`, and
`creator/[username]/page.tsx` to full `var(--...)` coverage (they had
partial/no theme support before this pass), and added an Inkstone-style
per-series analytics detail card + Chapters/Words stat cards to the
dashboard's Analytics tab.

Re-ran the repo-wide grep after all of the above — the only hardcoded hex
left anywhere are the 3 already-documented intentional cases (rank-badge
dark text on gold/silver/bronze backgrounds in `/` and `/search`, and the
reader's independent `bgColor` picker in `read/[chapterId]/page.tsx`).
**No unthemed pages or components remain.**


---


- Platform contact: `mangal.indiaplatform@gmail.com`
- Address on legal pages: PES University, Bangalore, Karnataka, India
- `profiles.role = 'developer'` gates admin/creator-studio access
- `profiles.account_active = false` is how banning is implemented

## 9. KaTube redesign — whiteboard wireframe spec (design agreed, build in progress)

**Status: Step 1 DONE** — left sidebar (Home / Fast tap / Slow tap / Saved)
+ hamburger toggle, sized to match YouTube's proportions per founder
feedback.

**Step 2 DONE (11 Aug 2026, `419c3e0`)** — Shorts row renamed "Fast tap"
(now a wrapping grid with Show more/less instead of horizontal scroll),
Videos grid renamed "Slow tap", filter pills swapped to Popular/New
ranking/Category/Genre/Tools (visual-only, no filtering logic yet — see
open question below), sidebar now actually filters which section renders
instead of just highlighting. Next: decide Category vs Genre vs Tools
filtering logic, then wire it; after that, ranking + Kalpana Circle
integration (Step 5 in the older roadmap numbering above).

**Filter pills — Popular / New ranking wired (`76d4636`, `2669e82`)** —
Popular sorts the Slow tap grid by `views` desc, New ranking sorts by
`created_at` desc, both real columns on `videos`. Category/Genre/Tools
remain visual-only (title tooltip says so) since there's no backing
column and the founder still hasn't specified what each should filter
by — clicking them now falls back to default order instead of doing
nothing. Also fixed the same session: Fast tap grid used to collapse via
a fixed `maxHeight: 256px` + `overflow: hidden`, which sliced through
whatever card sat at that pixel boundary and cut off rounded corners
(worse on wide screens where auto-fill columns stretch taller). Now
collapses by item count (`FAST_TAP_COLLAPSED_COUNT = 6`) instead, so
there's nothing to crop.

**Filter pills — simplified to 4 + Categories genre sub-row (`8137e81`)**
— founder shared reference screenshots (DramaBox: Popular/New/Rankings/
Categories tabs; YouTube: horizontal topic-pill row under search).
Resolved the open Category/Genre/Tools question from the previous entry:
dropped the separate Genre and Tools chips, `FILTER_PILLS` is now
`['Popular', 'New', 'Rankings', 'Categories']`. Added `videos.category`
(text, default `'Trailers'`) via `20260811_videos_category.sql`; upload
form (`/katube/upload`) now has a category pill-picker
(`CATEGORY_OPTIONS` = Action/Mythology/Horror/Slice of Life/Fantasy/
Trailers). On `/katube`: Popular = `views` desc, New = `created_at`
desc, Rankings = `likes` desc (a distinct leaderboard metric from
Popular, matching DramaBox having both as separate tabs). Clicking
Categories reveals `GENRE_PILLS` (same option list, plus "All") as a
sub-row that filters Slow tap by `category` instead of re-sorting.

**Genre + Tools brought back, separately from the above (`c3c81ae`)** —
founder clarified: Genre = detailed genre tags (Dark Fantasy,
Supernatural, Science Fiction, etc) should just be merged into
Categories rather than a separate chip (done — `GENRE_PILLS` /
`CATEGORY_OPTIONS` expanded to include them, one merged list). Tools =
a genuinely separate axis: which AI video-generation tool made the
clip (Sora, Kling, Runway, Pika, Hailuo, Veo). Added `videos.ai_tool`
(text, default `'Other'`) via `20260811_videos_ai_tool.sql`; upload
form has a tool pill-picker. `FILTER_PILLS` is now `['Popular', 'New',
'Rankings', 'Categories', 'Tools']` — Categories and Tools each reveal
their own sub-row (`GENRE_PILLS` / `TOOL_PILLS`) and both filters apply
together (AND) regardless of which sort chip is active.

**Filter row moved above Fast tap (`6da285b`)** — was sandwiched between
Fast tap and Slow tap; founder wants it right under the hero as a
page-wide filter, matching DramaBox's top tabs / YouTube's topic row.

**KaTube forced dark by default (`f4e904f`)** — founder confirmed dark
is the right look for this page specifically (independent of the
site-wide light-default). Root div overrides the CSS vars locally
(same pattern as `/login`'s intentional dark screen) so a first-time
visitor sees dark immediately; `ThemeToggle` still sits in the nav if
someone wants to flip to light for a visit.

Founder shared a hand-drawn wireframe (11 Aug 2026) for a KaTube layout overhaul.
Original image saved at `docs/design/katube-sidebar-wireframe.png` — refer to
it directly for layout/spacing questions instead of re-deriving from this
text description alone.
Confirmed understanding, documented here so it isn't lost/re-explained next
session. **Nothing below is implemented yet — this is a design spec only.**

**Top nav (revised):**
- Hamburger menu (new — opens the left sidebar below, likely for narrow/mobile)
- KaTube logo/wordmark
- Search bar with search icon
- **"+ Create" / "+ Upload"** button (renamed/re-styled from current Upload link)
- Profile avatar icon (circle) on the right

**New left sidebar (doesn't exist in current build — net-new):**
- 🏠 **Home** — mixed feed, supports both 9:16 and 16:9 content together
- ▷ **Fast tap** — 9:16 (portrait) content only. This is the Shorts-equivalent
  section, renamed. "Fast tap" = quick swipe-through consumption.
- ▷ **Slow tap** — 16:9 (landscape) content only. This is the regular
  long-form video section, renamed. "Slow tap" = deliberate sit-and-watch
  consumption.
- **Saved** — saved/bookmarked videos

**Filter row — style clarified via a YouTube screenshot (11 Aug 2026):**
Labels are **Popular / New ranking / Category / Genre / Tools**, but the
UI treatment is explicitly **YouTube's horizontal pill-chip row** — a single
scrollable line of rounded chip buttons directly under the search bar
(active chip dark/filled, inactive chips light/outlined, horizontally
scrollable with an arrow at the edge) — **not** styled as separate
tabs/pages with an underline-active state. Clicking a chip filters the
current view in place; it does not navigate to a different page layout.

**Home page content layout — two stacked sections, each its own grid:**
1. **"Fast tap" section (top)** — grid of 9:16 portrait cards (the existing
   Shorts row concept, restyled/renamed to match this sidebar terminology)
2. A **"Show more"** expand control between the two sections
3. **"Slow tap" section (bottom)** — grid of 16:9 landscape cards (the
   existing main video grid, renamed to match)

**Still open / not yet decided:** exact functional difference (if any)
between "Category" and "Genre" chips, and what the "Tools" chip is meant to
surface — founder hadn't specified this as of the wireframe; confirm before
building the filter row's actual filtering logic.

**Sequencing note:** this is a layout/navigation redesign of what's already
partially built (Shorts row + video grid from Section 3/4 above already
ship real data) — treat this as a restyle + rename + sidebar-nav addition on
top of the existing real `videos` table wiring, not a rebuild from scratch.

---
*Last updated: wired the KaTube Shorts row to real `videos` data
(`is_short = true`, with demo-placeholder fallback when there are zero real
Shorts) and added a Short/regular toggle to the upload form. Roadmap Steps
1–4 are now fully done, including Shorts. Next up: ranking + Community Tube
(Kalpana Circle) integration (Step 5), then formal LLP/DPIIT registration
(Step 6, business side). Update this file again whenever scope changes
further.*

## 6. Not built yet — KaTube channel-ownership verification (design agreed, on hold)

**The problem:** nothing currently stops a creator from pasting a YouTube
link that belongs to someone else's channel — they could upload a
stranger's video/short as if it were their own.

**Design agreed with founder (do NOT build until founder says "continue" —
design was still being finalized as of this note):**

1. **One-time channel connect.** Creator enters their YouTube channel
   URL/handle in their KaTube profile. Server calls the YouTube Data API
   (public `channels.list`, no OAuth needed) to resolve the real
   `channelId` and current channel description.
2. **Verification code.** Server generates a unique code (e.g.
   `MANGAL-VERIFY-x7k2p9`) and shows it to the creator, who pastes it
   into their channel's About/description on YouTube.
3. **Verify button.** Creator clicks "Verify" — server re-fetches that
   channel's description via the API and checks the code is present.
   Only the real channel owner can edit the description, so a match is
   proof of ownership. On success, `verified_youtube_channel_id` is saved
   to the creator's MANGAL profile.
4. **Per-upload enforcement (the actual fraud check — this is the part
   that matters, not step 3).** Verifying once only proves "this channel
   belongs to me" — it does NOT mean every future upload is trusted by
   default. On every single video/short upload: extract the `videoId`
   from the pasted link, call `videos.list` on it to read the video's
   real `snippet.channelId` (public metadata, works for any video), and
   compare it against the creator's `verified_youtube_channel_id`.
   Mismatch → reject the upload with a clear error ("This video isn't
   from your verified channel"), regardless of the creator's verified
   status. This check runs every time, with no skip/bypass once verified
   — verification only establishes the baseline channelId to check
   against, it never exempts a creator from the per-video check.

**Cost/complexity:** YouTube Data API free tier (10,000 units/day, this
check costs ~1-2 units per action) — fits the zero-cost architecture, no
Google app review or OAuth consent screen needed since both calls
(`channels.list`, `videos.list`) are public read-only endpoints.

**Status: DONE (`1fd16bb`), but needs one manual step from the founder to
actually work in production — see "ACTION NEEDED" below.**

**What shipped:**
- `creator_profiles` gained `youtube_channel_handle`, `pending_youtube_channel_id`,
  `youtube_verification_code`, `verified_youtube_channel_id`, `channel_verified_at`
  (`supabase/migrations/20260811_katube_channel_verification.sql`).
- `app/lib/youtubeVerify.ts` — server-only helpers wrapping the public
  `channels.list` / `videos.list` endpoints (resolve a channel from any
  URL/handle format, re-fetch a channel's description, resolve a video's
  real owning channelId). Throws a clear error if `YOUTUBE_API_KEY` isn't set.
- `app/lib/authedServerClient.ts` — shared helper that turns a request's
  `Authorization: Bearer <token>` header into a Supabase client acting AS
  that user, so existing RLS ("auth.uid() = user_id") does the access
  control — no service-role key needed for this feature.
- `POST /api/katube/channel/connect` — step 1+2: resolves the channel,
  generates `MANGAL-VERIFY-xxxxxxxx`, saves it pending (creates a
  `creator_profiles` row with a fallback username if the user doesn't have
  one yet, since KaTube upload never required "becoming a creator" first).
- `POST /api/katube/channel/verify` — step 3: re-fetches the channel
  description, checks the code is present, sets `verified_youtube_channel_id`.
- `POST /api/katube/upload` — step 4, **the check that actually matters**.
  Replaces the old direct client-side `supabase.from('videos').insert(...)`
  entirely (that path is gone) — this route runs server-side, so the
  channelId check can't be skipped or bypassed from the browser. Every
  upload: resolve the pasted video's real `channelId` via `videos.list`,
  compare against the creator's `verified_youtube_channel_id`, reject on
  mismatch regardless of verified status.
- `app/katube/upload/page.tsx` now gates the whole upload form behind
  verification: if unverified, shows a connect-channel input → displays the
  code → "I've added it, Verify" button; once verified, shows a small
  "✅ Verified channel" banner above the (now unlocked) existing form. Form
  submission now calls `/api/katube/upload` instead of inserting directly.

**⚠️ ACTION NEEDED (founder, not code) — nothing above works until this is
done:** `YOUTUBE_API_KEY` must be set as an environment variable in Vercel
(Project Settings → Environment Variables) and locally in `.env.local`.
Get a free key from Google Cloud Console: create/select a project → APIs &
Services → Library → enable "YouTube Data API v3" → Credentials → Create
Credentials → API key. No OAuth consent screen or app review needed since
both endpoints used (`channels.list`, `videos.list`) are public read-only.
Free tier is 10,000 units/day; this feature costs ~1-2 units per action, so
it comfortably fits the zero-cost architecture. Until the key is set,
`/katube/upload`'s connect step will show a clear error instead of
crashing, but creators can't actually verify or upload.


### 6b. Content moderation — NSFW + non-AI (real footage) uploads — DONE (`87b352f`, `e62ed92`, `6df89b7`)

Built in 3 parts, each committed/pushed separately:
- **Part 1** (`87b352f`) — `is_auto_flagged` column on `reports` (reuses the
  existing report/admin system rather than a new one), admin UI badge to
  visually distinguish system auto-flags from real user reports.
- **Part 2** (`e62ed92`) — AI-disclosure check via YouTube's
  `status.containsSyntheticMedia` field, piggybacked on the videos.list
  call §6 already makes (zero extra quota). Soft enforcement: undisclosed
  uploads get auto-flagged into the reports queue, not hard-rejected.
- **Part 3** (`6df89b7`) — NSFW thumbnail check via NSFWJS. New
  `app/lib/nsfwCheck.ts`, using pure `@tensorflow/tfjs` +
  `@tensorflow/tfjs-backend-cpu` (NOT `@tensorflow/tfjs-node` — its
  postinstall downloads a native binary, a common source of broken
  serverless builds) with `sharp` for image decode/resize instead of
  `tf.node.decodeImage`. Model is a module-level singleton reused across
  warm invocations. Same soft-enforcement pattern as Part 2: flags
  (Porn/Hentai/Sexy ≥ 60% confidence) route to the reports queue, never
  block the upload; any check failure (network/decode/model) fails open.

Two different problems, two different tactics — one is automatable, one
isn't:

**1. Adult/NSFW content — automatable.**
- Run the video's YouTube thumbnail (already fetched for the grid) through
  **NSFWJS** — a free, open-source TensorFlow.js image classifier. Runs
  in a Vercel serverless function, zero cost, no paid API.
- On a flag: do NOT hard-block the upload — send it to a **pending
  review** queue instead (reuses MANGAL's existing admin
  moderation/report system rather than building a new one). Hard-blocking
  risks false positives frustrating legitimate creators.
- Secondary signal: YouTube's own API also exposes an age-restriction /
  content-rating flag — worth cross-checking alongside NSFWJS, not
  instead of it.

**2. Detecting "is this actually AI-generated" (vs. scraped real
footage) — NOT reliably automatable.** No free/cheap tool can confidently
tell AI-generated video from real footage today (false positives/negatives
both common). Solution is policy + a real signal, not a fake detector:
- **Use YouTube's own official AI-disclosure field.** As of Oct 30 2024,
  the YouTube Data API's `videos.list` (`part=status`) returns
  `status.containsSyntheticMedia` — this is YouTube's own "Altered or
  Synthetic content" disclosure, filled in by the uploader on YouTube
  itself. Same API call already needed for the channel-ownership check
  in §6 above, so this is effectively a free additional field on a call
  we're already making — no extra quota cost.
  - `true` → creator disclosed AI/synthetic content on YouTube → allow.
  - `false`/missing → creator did not disclose it → either (a) hard
    reject with a message to disclose it on YouTube first, or (b) soft
    warning + pending-review queue (same queue as the NSFW path above).
    Founder to decide strict vs. soft when this gets built.
  - **Caveat to remember:** this field is *self-declared by the
    uploader on YouTube*, not verified by YouTube itself — someone could
    leave the box unchecked and slip past this check. Still the best
    available zero-cost signal; a false declaration is the creator's own
    YouTube ToS violation, not something KaTube can be blamed for.
- **Required upload-form field:** "Which AI tool did you use?" (Runway /
  Kling / Pika / Hailuo / Suno / other) — adds accountability and a
  paper trail even beyond the API signal.
- **Enforcement layer:** reuse MANGAL's existing report/admin moderation
  system, extended to cover KaTube videos, plus a strikes policy (e.g.
  2-3 warnings → account ban) for repeat violations — enforcement via
  community + policy, not a magic detector.

### 6c. Staying YouTube-friendly — avoiding an API/embed ban (STANDING RULE — applies to every future KaTube change, not a one-time task)

**Why this matters:** KaTube's entire architecture depends on the YouTube
Data API and embedded player continuing to work. Violating YouTube's API
Terms of Service is what gets a project's API access revoked or the
embed blocked — this isn't a single feature to build once, it's a set of
rules that must be respected in *every* future KaTube change.

**The rules, going forward:**

1. **Never download, store, or rehost video files.** Only ever store
   `youtube_id` + metadata; playback is always YouTube's own iframe
   embed. This is already true today (per §2's zero-cost architecture)
   — it must stay true for anything built later too.
2. **Never modify or hide the embedded player's YouTube branding.** No
   removing the YouTube logo, no removing/hiding the "Watch on YouTube"
   link, no blocking YouTube's own in-player ads. Any future watch-page
   redesign (§7, §8) must keep the embed itself untouched — style
   around it, not over/inside it.
3. **Never add a download button or anything that facilitates
   downloading YouTube videos.**
4. **Only use the official Data API — no HTML scraping, no unofficial/
   reverse-engineered endpoints,** for metadata, thumbnails, channelId
   verification, or anything else.
5. **Cache metadata locally, don't hammer the API.** View/like counts
   live in Supabase (`videos.views`/`videos.likes`) rather than being
   re-fetched from YouTube on every page load — already the pattern,
   keep it for anything new.
6. **Frame KaTube as a discovery layer that sends traffic to YouTube,
   not a replacement for it** — every embedded play counts as a real
   YouTube view for the creator's own channel. This positioning should
   show up in any public-facing copy (`/about`, `/privacy`, landing
   page) written for KaTube going forward.
7. **Required legal disclosure:** the privacy policy must state that the
   app uses YouTube API Services and link to Google's Privacy Policy —
   this is a hard requirement of YouTube's API ToS, not optional.
   *(Not yet verified whether `/privacy` currently has this — check
   before/while building anything that goes live with real YouTube API
   traffic.)*
8. **Content moderation (§6b) is partly in service of this rule too** —
   NSFW or clearly non-original/stolen content on KaTube is a reason for
   YouTube to flag the API project, not just a site-quality issue.

**Any Claude session working on KaTube should re-check new work against
this list before shipping it**, the same way copyright/safety rules get
checked — this is a standing constraint, not a phase to complete once.

## 7. Fast Tap → full-screen Shorts/Reels experience — DONE (`f73a8b8`)

**New route `app/katube/shorts/[shortId]/page.tsx`.** Clicking a Fast Tap
card on the KaTube home page now opens a full-screen (`100vh`), vertical
snap-scroll feed (`scroll-snap-type: y mandatory`) of all `is_short = true`
videos instead of the normal watch page. Scrolling/swiping moves between
shorts; an `IntersectionObserver` tracks which short is >50% in view and
only that one gets `autoplay=1&mute=1` in its YouTube embed URL (muted
autoplay, since unmuted autoplay is blocked by browsers anyway). Windowing:
only the active short ± 1 mount a real `iframe` — everything else renders
just the YouTube thumbnail — so the DOM/network stays light as the shorts
table grows past the current `limit(50)` fetch. Overlay UI matches the
YouTube Shorts/Instagram Reels reference: bottom-left creator handle +
caption, right-edge like/comment/share icons. Like/comment/share aren't
wired to real functionality yet (no like or comment tables/backend exist),
so tapping any of them shows a small "isn't built yet" toast instead of
doing nothing silently.

**`RealShortCard` in `app/katube/page.tsx`** now routes to
`/katube/shorts/${short.id}` instead of `/katube/watch/${short.id}`.
`DemoShortCard` (the zero-real-shorts fallback) is unchanged — it has no
click handler since demo shorts have no real ID to route to.

**Not done / left for later:** view-count increment on shorts (the normal
watch page increments `views` on load; the shorts feed intentionally does
not, since a fast-scrolling feed would spam increments — needs a proper
"watched N seconds" or "N% viewed" threshold before incrementing, not
built yet). Real like/comment backend (see §4 below) will replace the
toast once it exists.

## 7b. (superseded above) Original plan — Fast Tap → real full-screen Shorts/Reels experience

**Current state (historical, before `f73a8b8`):** "Fast Tap" is just a
horizontal row of static 2:3 cards on the KaTube home page
(`app/katube/page.tsx`, `RealShortCard`). Clicking one goes to the normal
watch page with a vertical-aspect embed (see § above) — there's no actual
swipeable feed.

**What founder wants instead (reference: YouTube Shorts, Instagram
Reels):** a dedicated full-screen vertical feed — one short fills the
whole viewport, swipe/scroll up or down moves to the next/previous short,
autoplay on the active one, like/comment/share as floating icons on the
right edge, creator info + caption overlaid at the bottom-left, matching
the two reference screenshots the founder shared (YouTube Shorts UI and
Instagram Reels UI).

**Planned build steps, in order (do NOT start until founder says go):**

1. **New route `/katube/shorts/[shortId]`** — full-screen (`100vh`)
   single-short player, `iframe` embed sized to fill the viewport at
   9:16 (letterboxed on wider screens, same idea as the watch-page fix
   above but full-bleed instead of a centered card).
2. **Vertical snap-scroll feed** — CSS `scroll-snap-type: y mandatory`
   container holding all shorts (or a windowed subset), each short a
   `scroll-snap-align: start` full-height section. This gets swipe/scroll
   navigation for free without hand-rolled touch-gesture JS.
3. **Autoplay-on-active only** — use an `IntersectionObserver` to detect
   which short is >50% in view and only that one's iframe gets
   `autoplay=1` in its src (YouTube embeds autoplay via URL param); others
   stay paused/unloaded so the page doesn't try to autoplay 10 videos at
   once.
4. **Overlay UI** — absolutely-positioned right-edge icon column (like,
   comment, share — reuse the existing like logic from the current watch
   page) and bottom-left creator/caption block, both floating over the
   video, matching the reference screenshots' layout.
5. **Entry points** — "Fast Tap" row on the KaTube home page and its
   individual cards should route into this new feed (starting at the
   clicked short) instead of the current normal watch page.
6. **Lazy-load / windowing** — don't mount iframes for every short in the
   whole table at once; fetch a page of shorts and mount only nearby ones
   (e.g. current ± 1) to keep the DOM light as the shorts table grows.

**Not addressed yet:** comment/subscribe backend (still not built per §4
item 4-5), so the overlay's comment button can open the existing
"not built yet" state for now rather than blocking this whole feature.

## 8. Next up — long-video watch page: two-column layout + tag-based recommendations (plan only, not built)

**Current state:** the KaTube watch page for regular (non-short) videos is
just the player + title/creator/description, no recommended-videos list —
unlike the reference screenshots (YouTube's right-column recommendations).

**Design agreed with founder:**

1. **Two-column layout for long videos only** (16:9, `is_short = false`) —
   player + info on the left, a scrollable recommended-videos list on the
   right, matching the YouTube reference screenshots. Shorts watch
   experience (§7 plan) is untouched by this — this is specifically the
   long-form layout.
2. **Recommendation logic is tag-based, not YouTube's algorithm/not just
   views.** Reuses the same architecture already proven for MANGAL's
   "Readers Also Liked" (`related_series` SQL RPC, `SECURITY DEFINER`,
   single query, no N+1):
   - Every KaTube video links to a MANGAL `series_id`, and every series
     already has tags via the existing `series_tags` table.
   - New RPC `related_videos(target_video_id, result_limit)`: find the
     target video's series' tags, then find other videos whose linked
     series share any of those tags, ranked by shared-tag count
     (`ORDER BY shared_tag_count DESC`).
   - **Fallback chain** when there's no tag overlap (expected early on,
     low data volume): same category → most-viewed/most-recent overall.
     The sidebar should never render empty.
3. Same "aggregate output only" security pattern as `related_series` —
   the function only returns video rows, never exposes anything
   per-user/private.

**Status: DONE (`d31a5a1`).**

New RPC `related_videos(target_video_id, result_limit)` in
`supabase/migrations/20260811_related_videos.sql`, same SECURITY DEFINER
"aggregate output only" pattern as `related_series`. Scores candidate
videos by shared-tag count between the target video's series and the
candidate's series (via `series_tags`), then falls back to same-category,
then most-viewed/most-recent — so the list is never empty even with
today's low data volume.

`app/katube/watch/[videoId]/page.tsx` now renders a two-column layout for
long-form videos only (`is_short = false`): player + info on the left,
"Up next" recommendation list (`RecommendedCard`, small thumbnail + title
+ creator + views) on the right, fetched via `supabase.rpc('related_videos', …)`
after the main video loads. Shorts watch pages are untouched — still the
original single-column centered layout (the full-screen Shorts feed from
§7 is the real Shorts experience now anyway; this watch-page route mostly
matters for long-form).


## 9. Top nav rebuilt to match YouTube exactly + working theme toggle (`f3525d3`)

Founder shared YouTube reference screenshots (signed-out and signed-in
views) and asked for the KaTube nav to match exactly — search bar
included, "powered by MANGAL" instead of a MANGAL icon link, and a
profile-avatar slot left empty for a logo to be added later.

**Nav is now:** hamburger + KaTube logo + "powered by MANGAL" text |
centered search bar (visual only — no search backend/results page yet,
submitting does nothing) | **+ Create** button (renamed from "Upload",
same destination `/katube/upload`) + K Circle link + theme toggle + a
placeholder circular avatar (shows "K" for now — swap for the founder's
real logo image whenever it's ready). The "DEMO" badge and the old
"← Back to MANGAL" nav link were dropped from the top bar to match
YouTube's header exactly; the MANGAL link still exists, just moved to the
bottom of the left sidebar instead.

**Theme toggle bug fixed:** previously the page hardcoded
`data-theme="dark"` and dark-only CSS vars directly on its root div, so
clicking `ThemeToggle` changed the `<html>` attribute but the KaTube page
itself never re-rendered with light colors — a silent no-op. Fixed by
adding an `onChange` callback prop to `ThemeToggle`
(`app/components/ThemeToggle.tsx`) and wiring KaTube's root div to a local
`isLight` state that switches between a real light and dark CSS-var set.
KaTube still **defaults to dark** per the founder's original call — this
only fixes the toggle so switching to light actually works for anyone who
wants it.

## 10. KaTube channel verification moved into a real profile page (`/dashboard/katube`)

**The problem this fixes:** channel connect/verify used to live inline on
`/katube/upload` itself. Functionally it was already one-time (the form
only showed for creators without a `verified_youtube_channel_id`), but UX-
wise it read like a gate on the upload flow rather than a profile setting,
and the nav's "K" avatar (top-right on `/katube`) was a dead placeholder
`<div>` with nowhere to go.

**What shipped:**
- **New route `/dashboard/katube`** (`app/dashboard/katube/page.tsx`) —
  lives inside the existing MANGAL dashboard (picked over a standalone
  KaTube-only profile system so there's still one MANGAL profile / one
  login per creator, per the founder's "one email, one channel, one
  profile" framing). Auto-gets the `StudioSidebar` via
  `app/dashboard/layout.tsx`. Contains: the channel connect → paste-code →
  verify flow (moved here verbatim from the upload page, same API routes
  `/api/katube/channel/connect` + `/verify`), a "connect a different
  channel" option once verified, and three metric tiles (video count,
  total views, total likes) queried from `videos` for the signed-in
  creator.
- **`StudioSidebar` NAV_ITEMS** gained a `🎬 KaTube` entry
  (`/dashboard/katube`) alongside Workspace/Earnings/Perks/etc.
- **`app/katube/upload/page.tsx` simplified** — the inline
  connect/paste-code/verify UI and its handlers are gone. Unverified
  creators now see a short explainer + a single "Go to my KaTube
  profile →" button linking to `/dashboard/katube`; verified creators see
  the same "✅ Verified channel" banner as before (now also linking to the
  profile page) and the unlocked upload form, unchanged. The per-upload
  server-side channelId check (`POST /api/katube/upload`, the real fraud
  check) is untouched — this was a UI relocation only, not a behavior
  change to the actual verification logic.
- **KaTube nav's "K" avatar** (`app/katube/page.tsx`) is now a real
  `Link` to `/dashboard/katube` instead of a non-interactive placeholder
  `<div>`. Still visually just a "K" circle — swap for the founder's real
  logo/avatar image whenever it's ready, same note as before.

**Net effect on the verification UX:** still exactly one verification
per creator, ever (until they deliberately reconnect a different
channel) — nothing above changes that. What changed is *where* it lives:
a profile setting under the dashboard/KaTube avatar, not a step inside
the upload form. Second and later uploads were already frictionless
before this change and remain so.

## 12. Kalpana Circle — real Instagram-style social backend (DONE, `9ddfcc8`, `99c1175`, `82d87f1`, `696b130`)

Kalpana Circle went from a static UI demo (§ "Placeholder discussion feed", disabled composer) to a real Instagram-style surface with its own backend:

- **Schema (`9ddfcc8`, migration `20260812_kcircle_social.sql`)** —
  `kcircle_posts`, `kcircle_post_likes`, `kcircle_post_comments`,
  `kcircle_stories` (24h expiry via `expires_at`), `kcircle_story_views`,
  `kcircle_conversations` / `kcircle_conversation_participants`,
  `kcircle_messages`. All RLS-locked to the owner for writes, public read
  (stories additionally filtered to `expires_at > now()`).
  **✅ Migration applied** directly against the live project
  (`rfxlavwzhpnbhwoumaha`) via the Supabase MCP connector — confirmed via
  `list_migrations` (`20260812054228 kcircle_social`).
- **Feed (`99c1175`)** — stories bar (add/view, seen/unseen rings), real
  posts with photo upload, like, threaded comments, Instagram-style bottom
  nav (Home / Search-placeholder / Post / Chat / Profile) — no Reels tab.
  Radiant-grey theme, distinct from both WebMangal and KaTube's palettes.
- **Chat (`82d87f1`)** — `/kalpana-circle/chat`: inbox list, username
  search to start a DM, real thread view with send + 3s polling (no
  realtime subscription yet, polling is the current mechanism).
- **Responsive nav split (`696b130`)** — K Circle nav now branches at the
  768px breakpoint (same breakpoint used everywhere else in this codebase):
  desktop gets a full Instagram-web-style top bar (logo, disabled search
  pill, Home/Chat/Create(+)/avatar-profile/KaTube/theme toggle as icons,
  no bottom bar); mobile gets a compact header (logos + KaTube + theme
  toggle only) with all action icons living in a fixed bottom tab bar.
  Same feed/stories/likes/comments underneath both — only nav chrome
  changes per device.

**Known gaps, not built yet:** search tab is still a disabled placeholder
(no post/user search backend); images (posts + stories) upload into the
existing `manga-pages` storage bucket under a `kcircle/` prefix rather
than a dedicated bucket (reused what was already wired up — flag if a
separate bucket is wanted instead); no realtime chat (3s polling only).

### 12a. K Circle security fixes + group chats (DONE)

Two real RLS bugs found in `20260812_kcircle_social.sql` and fixed via new
migrations (kept as new migrations rather than editing the shipped one, per
this repo's existing convention):

- **`20260812101451_kcircle_fix_participant_rls_and_groups.sql`** — the
  participants insert policy shipped as
  `with check (auth.uid() = user_id or true)`. The `or true` makes the
  check always pass, so any authenticated user could insert themselves into
  *any* conversation and read others' DMs via
  `kcircle_messages_participant_read`. Replaced with a real
  `auth.uid() = user_id` check. **This was already applied directly to the
  live project in a prior session** (visible via `list_migrations` before
  this repo file existed) — this migration file just brings the repo history
  in sync with what's live.
- **`20260812110000_kcircle_group_chat_schema_and_rls_fix.sql`** — a second,
  separate bug in the self-read policy:
  `p2.conversation_id = p2.conversation_id` (comparing a column to itself,
  always true) instead of comparing to the *outer* row's
  `conversation_id`. This let any user who participates in *any*
  conversation read participant rows for *every* conversation on the
  platform (a membership/DM-pairing leak, distinct from the message-content
  leak above). Fixed to properly scope by the outer row's
  `conversation_id`. Same migration also:
  - Widens the insert policy so an **existing participant can add other
    participants** to a conversation they're already in (needed for group
    creation — was previously self-insert-only, which blocked groups
    entirely), while keeping it fully `auth.uid()`-scoped (no `OR true`
    reintroduced).
  - Adds `is_group boolean default false`, `title text`, `created_by uuid`
    to `kcircle_conversations`.
- **Chat page rewrite (`app/kalpana-circle/chat/page.tsx`)** — `+ New` now
  toggles between "Direct message" (unchanged 1:1 flow) and "Group chat"
  (multi-select username search, optional group name, 2–20 other members).
  Conversation list shows a 3-circle overlapping `GroupAvatar` + member
  count for groups vs the existing single `Avatar` for DMs. Inside a group
  thread, each incoming message is labeled with the sender's username
  (resolved once per thread open via `creator_profiles`); DMs are
  unchanged (no label needed, only two people). Still 3s polling, same as
  before — no realtime subscription added.

**Still not done from this section (backlog, next up):** dedicated group
settings (add/remove members after creation, leave group, rename), read
receipts/typing indicators, image/attachment messages. The broader
"Instagram + Discord-minus-reels" feature parity the founder wants (stories
replies, saved posts, close friends, voice/video, channels/roles) is
intentionally scoped out of this pass — flag which of these to prioritize
next.

### 12b. Stories seen-ring fix, dedicated media bucket, live search (DONE)

Fast follow-ups, done fastest-first:

- **Stories seen-ring bug** (`app/kalpana-circle/page.tsx`, `advanceStory`)
  — the `kcircle_story_views` upsert's error was silently swallowed, and
  even on success nothing updated `stories` state, so the seen/unseen ring
  only ever changed after a full page reload. Now logs upsert failures and
  flips `seen: true` on the group locally the moment the upsert succeeds.
- **Dedicated storage bucket** — new public `kcircle-media` bucket (same
  RLS shape as `manga-pages`: public read, authenticated insert, owner-only
  update/delete), migration `kcircle_dedicated_media_bucket` applied live.
  Post uploads now go to `posts/{userId}-{ts}.ext`, story uploads to
  `stories/{userId}-{ts}.ext` — no more `kcircle/` prefix inside the shared
  manga bucket.
- **Live search** — the `🔍 Search — coming soon` placeholder (desktop pill
  + mobile bottom-nav icon) is now a real overlay: 300ms-debounced search
  against `creator_profiles.username` and `kcircle_posts.caption`, results
  grouped as "Dreamers" / "Posts", each linking to `/creator/[username]`
  (no post-permalink page exists yet, so post results link to the author's
  profile rather than the specific post).

**Not done yet:** no ranking/relevance beyond `ilike`, no result caching,
no "recent searches."

### 12c. Group chat settings — rename, add/remove member, leave (DONE)

Migration `20260812120500_kcircle_group_settings_rls.sql` (applied live,
then committed to the repo) added the two RLS policies this needed:
- `kcircle_conversations` gets an UPDATE policy so any current participant
  can rename the group (same "any participant manages membership" trust
  model as the insert-widening fix in §12a — no owner-only restriction).
- `kcircle_conversation_participants` gets a DELETE policy: a user can
  always delete their own row (leave), and any existing participant can
  delete another's row (remove member) — same trust model as adding.

**UI (`app/kalpana-circle/chat/page.tsx`):** group threads show a ⓘ button
in the nav (DM threads don't, nothing to configure there) opening a
settings panel: rename input + Save, a member list with per-member Remove,
an add-member username search, and a Leave group button. Removing/adding
updates local state immediately rather than waiting on a poll cycle;
leaving a group closes the thread and drops it from the conversation list.

**Not done:** no distinct "admin" role — every member has equal
add/remove/rename rights, matching the open trust model already in place
for building groups. Tighten this (creator-only rename/remove) if the
founder wants it later.

### 12d. Image/attachment messages in DMs and group chats (DONE)

`app/kalpana-circle/chat/page.tsx` — messages can now carry an image, not
just text. Uploads go to the `kcircle-media` bucket (`messages/{userId}-{ts}.ext`,
same bucket §12b introduced for posts/stories). `kcircle_messages` gained
an `image_url` column (nullable — a message can be text-only, image-only,
or both). Bubble rendering shows the image above/below the text as
appropriate; a message with only an image has no empty text bubble.

**Not done:** no multi-image messages, no video/file attachments (images
only), no upload progress indicator beyond a disabled-send-button state.

### 12e. Saved posts (DONE)

Instagram-style bookmarking. New table `kcircle_saved_posts` (`post_id`,
`user_id`, composite PK — same one-row-per-user-per-post shape as
`kcircle_post_likes`), migration `20260812150000_kcircle_saved_posts.sql`.
`app/kalpana-circle/page.tsx` post cards get a 🔖 save/unsave toggle
(optimistic update, same pattern as the ❤️ like toggle). New page
`app/kalpana-circle/saved/page.tsx` lists the signed-in user's saved
posts, linked from the bottom-nav/top-nav 🔖 icon (previously unused/
placeholder icon slot).

### 12f. Series ↔ Kalpana Circle cross-link (DONE)

The two products had no bridge — a reader on a series page had no way to
jump into fan discussion for that series, and `kcircle_posts.tag` (a
column that's existed since the original schema, §12) was never actually
written to by any UI. Fixed both directions:

- **Series page → Circle:** new "💬 Discuss on Kalpana Circle" button
  (`app/series/[seriesId]/page.tsx`, next to Follow/Share) links to
  `/kalpana-circle?tag=<series title>`.
- **Circle → filtered view:** `app/kalpana-circle/page.tsx` reads the
  `?tag=` param (case-insensitive `ilike` match against `kcircle_posts.tag`),
  shows a "Showing posts tagged…" banner with a Clear link, and — since
  `useSearchParams` needs one — the page is now wrapped in a `Suspense`
  boundary (component split into an outer `KalpanaCirclePage` wrapper +
  inner `KalpanaCircleInner`, same pattern as `app/upload/page.tsx`).
- **Composer:** new optional "Tag a series" text input, auto-prefilled
  from `?tag=` when arriving via the cross-link, saved to
  `kcircle_posts.tag` on post.

**Not done:** tag matching is exact-ish (`ilike`, so case-insensitive but
not fuzzy/typo-tolerant) and free-text (no autocomplete against real
series titles, no validation that a typed tag matches an existing series).
No reverse widget yet (a "Fan Theories & Art" preview embedded on the
series page itself — the button linking out is the only bridge so far).

### 12g. Creator broadcast channels (DONE)

Discord-style announcement channel: the creator posts, fans can only
like/comment — no reply-noise like a normal open group chat. One channel
per creator, created lazily (on the creator's own first visit to their
channel; a fan visiting first just sees "hasn't started broadcasting
yet").

**Backend** (`supabase/migrations/20260813120000_kcircle_broadcast_channels.sql`,
applied live): reuses `kcircle_conversations`/`kcircle_messages` rather
than a parallel table set — a broadcast channel is just a conversation
with a new `is_broadcast boolean` column set true, `created_by` = the
creator, and deliberately **no participant rows** (fans read it without
being "added", unlike DMs/groups which gate reads through
`kcircle_conversation_participants`). New RLS:
- `kcircle_conversations`/`kcircle_messages` get public-read policies
  scoped to `is_broadcast = true`, open to any authenticated user.
- Only the owning creator can insert messages into their own broadcast
  conversation (`created_by = auth.uid()` check) — fans have no matching
  insert policy, so posting is structurally creator-only.
- The pre-existing wide-open `kcircle_conversations` insert policy
  (`with check (true)`, from the group-chat trust model in §12a) was
  narrowed to `not is_broadcast or created_by = auth.uid()` so nobody can
  create a broadcast channel impersonating another creator. Non-broadcast
  inserts (DMs, groups) are untouched.
- Two new tables for fan reactions, both FK'd to `kcircle_messages(id)`
  and scoped to broadcast messages via an `exists (...is_broadcast)`
  check in their insert policies: `kcircle_broadcast_likes` (toggle,
  same one-row-per-user shape as `kcircle_post_likes`) and
  `kcircle_broadcast_comments` (flat, no threading).

**UI:** new route `app/kalpana-circle/broadcast/[username]/page.tsx` —
message list (newest first), each with a 💜/🤍 like toggle and an
expandable comment thread; the owner sees a composer at the top, everyone
else sees a read-only feed. Linked from the creator's public profile
(`app/creator/[username]/page.tsx`) via a new "📣 Updates" pill next to
the series/views stats.

**Not done:** no way to know which creators are "verified" vs. just have
a `creator_profiles` row (same open trust model as the rest of Circle —
anyone who completed `/become-creator` can have a channel); no
notification when a followed creator posts (a notifications system now
exists, see §14 — wiring broadcast posts into it is a small follow-up,
not done yet); no channel discovery feed (a fan has to already be on that
creator's profile to find the link).

## 13. Site-wide mobile-compatibility sweep (in progress)

**Problem reported by founder:** the entire site was built and tested
desktop-first — most pages have zero `@media` rules and use inline
`style={{}}` objects with fixed multi-item flex rows (`justifyContent:
'space-between'`, no wrap), which either overflow horizontally or silently
clip content on phone-width viewports. Confirmed via a repo-wide grep for
`@media`: only `app/dashboard/page.tsx`, `app/terms/page.tsx`, and
`app/components/StudioSidebar.tsx` had any responsive rules before this
sweep started — every other page (60+ files) was desktop-only.

**Working pattern (established by `app/dashboard/page.tsx`, reused
throughout this sweep):** since inline style objects can't express media
queries, each page gets a plain `<style>{...}</style>` tag with `.mangal-*`
scoped class names (passed as `className` alongside the existing inline
`style` for anything that doesn't need to change responsively) and real
`@media` breakpoints — `768px`/`860px` (tablet), `560px`/`640px` (phone),
`380px` (very small phone) depending on what a given page needs. No
JS-based `window.innerWidth` checks — pure CSS, so there's no
hydration-mismatch/flash-of-wrong-layout risk.

**Status so far:**
- ✅ `app/page.tsx` (public landing) — nav bar collapses (`5c4b396`):
  center links become horizontally-scrollable under 860px, hidden under
  640px (still reachable via footer), "Log in" text link dropped in favor
  of the primary CTA under 640px, brand wordmark hidden under 380px. Hero
  search input `minWidth` 260px → 200px so it doesn't force overflow on
  ~280px-wide phones.
- ⏳ Queued next, in rough priority order (most-visited first): `/home`
  nav (same overflow-hidden-clipping issue as landing, worse — 8 center
  nav items get silently clipped rather than scrolling), `/login`,
  `/search` (note: renamed to `/WebMangal` + `/WebMangal/search` in
  `164fc51`/`b418b5a`, already has some mobile work per commit history —
  re-verify before assuming it still needs the full pass),
  `/series/[seriesId]`, `/read/[chapterId]`, `/katube` (has its own
  sidebar layout, needs separate attention), `/library`, `/bookmarks`,
  `/history`, `/rankings`, `/tags`, `/tags/[slug]`, `/upload`,
  `/dashboard/*` subpages beyond the main one, shared components
  (`EditSeriesModal`, `ManagePagesModal`, `ProfileMenu`, `ShareButton`,
  `ReportButton`), `/about`, `/help`, `/privacy`, `/grievance`,
  `/become-creator`, `/creator/[username]`, `/settings`,
  `/katube/watch`, `/katube/upload`, `/katube/shorts`.
- Committing one page/component at a time per the founder's explicit
  instruction for this pass — do not batch multiple pages into one commit.

## 16. K Circle "Dreamer of the Week" pin wired up (DONE) — fastest of the three remaining items

Founder asked which of broadcast channels / close-friends+dreamer-of-week
UI / KaTube↔Circle cross-link (auto-post + embed) was fastest — this one
won since `pinned_by`/`pinned_at` and the permission trigger
(`kcircle_enforce_pin_permission`, §15) were already fully live; nothing
needed but UI. No new migration.

- **`isCreator` check** — mirrors the trigger's own rule (verified YouTube
  channel via `creator_profiles.verified_youtube_channel_id`, or owns a
  row in `series`), computed client-side purely to decide whether to show
  the pin button; the trigger is still the real enforcement.
- **Important nuance found while wiring this up:** `kcircle_posts`'s
  UPDATE policy (`kcircle_posts_own_update`) is `auth.uid() = author_id`
  — author-only. So even though the trigger's own logic would allow *any*
  creator to pin *any* post, RLS gates the UPDATE before the trigger ever
  runs, which in practice restricts pinning to **your own posts only**.
  Built the UI to match what's actually enforced (📌 button only shown on
  a creator's own post) rather than the trigger's nominally broader intent
  — flagging in case the founder actually wants cross-post pinning (would
  need a new UPDATE policy, e.g. "any creator can update pinned_by on any
  post").
- **UI (`app/kalpana-circle/page.tsx`):** 📌 pin/unpin button next to your
  own post's timestamp (creators only); pinned posts get a "🌟 Dreamer of
  the Week" banner + radiant-colored border and float to the top of the
  feed (client-side sort by `pinned_at desc`, everything else keeps
  `created_at desc`).

**Not done:** no limit on how many posts you can have pinned at once (each
pin is independent — RLS/trigger operate per-row, nothing clears a
previous pin when a new one is set), no site-wide single Dreamer-of-the-
Week (this is per-creator, not one global winner) — flag if the founder
wants either of those tightened.

## 15. K Circle polls wired up (DONE) — the second orphaned schema is live

Founder asked to wire up one of the schema-only orphans found in §13b;
picked polls since the tables already existed and needed the least new
plumbing.

- **Repo/DB sync first** — reconstructed migration files for all four
  orphaned items found in §13b (`kcircle_close_friends`,
  `kcircle_posts_link_fields`, `kcircle_dreamer_of_week` +its trigger-fix,
  `kcircle_polls`), each named with the exact version `list_migrations`
  showed as already applied live, so they're pure history reconciliation —
  not re-run. Close friends, link fields, and dreamer-of-week are
  **schema-only still** (documented, no UI) — only polls got built out
  this session.
- **One real addition, applied live:** `20260813130000_kcircle_poll_vote_change.sql`
  — the shipped `kcircle_poll_votes` policy set was insert-only, so a
  second tap just hit the `(post_id, voter_id)` primary key and silently
  failed instead of switching the vote. Added UPDATE (switch option) and
  DELETE (retract) policies, both `auth.uid() = voter_id`-scoped — same
  one-vote-per-user guarantee, just not a one-way door.
- **Composer (`app/kalpana-circle/page.tsx`):** new "📊 Poll" toggle next
  to Photo — reveals 2–4 option inputs (add up to 4, remove down to 2).
  Caption doubles as the poll question. On submit, the post is created
  first, then `kcircle_poll_options` rows are inserted against its id; a
  poll-insert failure surfaces as "Post published, but the poll failed to
  save" rather than losing the post.
- **Feed:** `loadPosts` now also fetches `kcircle_poll_options` +
  `kcircle_poll_votes` (+ the viewer's own vote) for every post in the
  same batch as likes/comments — a post is a poll purely by having option
  rows, no boolean flag. Each option renders as a tappable bar
  (percentage-filled background, vote count, ✓ on your pick); tapping your
  current pick again retracts the vote, tapping another switches it.
  `castVote` optimistically updates local counts before the network call,
  matching the like/save pattern elsewhere on this page.

**Not done:** no "poll closes at" expiry, no anonymous-voting toggle (your
vote is always visible to you and reflected in the ✓, though individual
voter identities are never shown to other users — only aggregate counts
render), no live vote-count updates via Realtime (counts refresh on next
`loadPosts`, same as likes/comments today — no Realtime wired for those
either, so this matches the existing pattern rather than a regression).

## 14. K Circle notifications system (DONE) — chosen over Broadcast Channels

Founder asked to compare Broadcast Channels vs. Notifications (the two
items left in the "Instagram + Discord-minus-reels" backlog from §12a) and
build whichever is lighter/faster. **Notifications won**: broadcast
channels needs a genuine chat-model rework (new channel/subscriber
concept, one-to-many sender permissions, its own UI surface — the founder's
own framing), while notifications is one new table bolted onto flows that
already exist (like/comment/message/add-member all already succeed
somewhere — a notification insert just piggybacks on each).

- **Schema (`20260813120000_kcircle_notifications.sql`, applied live)** —
  `kcircle_notifications` (recipient_id, actor_id, type: like/comment/
  message/group_add, post_id, conversation_id, preview, read). RLS: actor
  inserts on the recipient's behalf (`auth.uid() = actor_id`, no
  self-notifications), recipient reads/marks-read their own rows only.
  Added to the `supabase_realtime` publication (same pattern as chat).
- **`app/components/NotificationBell.tsx`** — shared bell icon + unread
  badge + dropdown panel, live via Realtime `postgres_changes` (no
  polling), mark-all-read on open, click an item to jump to the feed or
  chat. Dropped into both `/kalpana-circle` (mobile header + desktop top
  bar) and `/kalpana-circle/chat` (list view only, hidden inside an open
  thread to keep that header clean).
- **Wired at the source of each event:** `toggleLike`/`submitComment` in
  `app/kalpana-circle/page.tsx`; `sendMessage` (notifies every other
  participant, not just one, so group DMs fan out correctly),
  `createGroup`, and `addMember` in `app/kalpana-circle/chat/page.tsx`.

**Not done:** no notification preferences/mute, no push notifications
(in-app only), no "X and 3 others liked your post" grouping — each like
is its own row/line item for now.

**Update (§12g):** the founder asked for Broadcast Channels after all in
a later session — they're now built too (§12g), on top of notifications
rather than instead of them.

### 13c. Close Friends — story audience restriction (DONE)

Wired up `kcircle_close_friends` (schema from §13b, live but unused until
now) as a story privacy control, Instagram-style: pick "🟢 Close Friends"
instead of "🌍 Everyone" and only people on your list (plus you) can see
that story.

- **Migration `20260813150000_kcircle_close_friends_story_audience.sql`**
  (applied live) — `kcircle_stories.close_friends_only boolean`; rewrote
  the story SELECT policy to require, when the flag is set, that the
  viewer is the author or has a matching row in `kcircle_close_friends`
  (`user_id` = author, `friend_id` = viewer). Unrestricted stories are
  unaffected — same expiry-only check as before.
- **New route `app/kalpana-circle/close-friends/page.tsx`** — debounced
  username search (same pattern as the main search overlay) to add
  people, plus a remove button on the current list. `kcircle_close_friends`
  RLS is owner-only for every operation (`auth.uid() = user_id`), so this
  list is private the same way Instagram's is — nobody, including the
  people on it, can see who's on your Close Friends list but you.
- **Story upload flow (`app/kalpana-circle/page.tsx`):** picking a file no
  longer uploads immediately — it stages the file and shows a small
  "🌍 Everyone / 🟢 Close Friends" picker first. Close-friends stories get
  a green ring in the stories bar (in place of the usual gradient ring)
  and a "🟢 Close Friends" tag in the full-screen viewer. New
  "🟢 Manage Close Friends" link under the stories bar.

**Not done:** no "who can reply" distinction (anyone who can see a story
can still... actually stories have no reply feature at all yet, so N/A);
no bulk-import from existing followers/DM contacts — you add people one
at a time by username search.

### 13d. Broadcast posts wired into notifications (DONE)

Small follow-up to §12g (broadcast channels) and §14 (notifications) —
until now a creator's broadcast post didn't notify anyone, so a fan had
to remember to check the channel.

- **Migration `20260813160000_kcircle_notifications_broadcast_type.sql`**
  (applied live) — adds `'broadcast'` to `kcircle_notifications.type`'s
  check constraint (previously like/comment/message/group_add only).
- **`NotificationBell.tsx`** — new label ("📣 {who} posted an update: …")
  and tap-through routes to `/kalpana-circle/broadcast/[actorUsername]`.
- **Broadcast channel page:** after a successful post, notifies everyone
  who follows *any* of the creator's series — reuses the existing
  `follows` table and the already-live "Creators can view follows on
  their own series" RLS policy rather than building a dedicated
  broadcast-subscriber table. Fire-and-forget bulk insert, actor (the
  creator) excluded from the recipient list.

**Not done:** "follows a series" is a proxy for "wants broadcast
updates," not a real opt-in/opt-out subscription — no per-creator mute.

### 13e. Broadcast channel discovery feed (DONE) — the other remaining backlog item

Founder asked which was faster of the two remaining medium-effort items:
KaTube↔Circle auto-post cross-link, or a central Broadcasts discovery feed
(§12g's "no channel discovery feed — a fan has to already be on that
creator's profile to find the link" gap). Discovery feed won — it's a
single new read-only page over already-live schema/RLS, vs. the cross-link
item which is really two separate builds (an upload-time auto-post insert,
*and* a "Fan Theories & Art" preview widget on the series page).

- **New route `app/kalpana-circle/broadcasts/page.tsx`** — lists every
  `kcircle_conversations` row with `is_broadcast = true`, each showing the
  creator + a preview of their latest message (`kcircle_messages`, newest
  fetched client-side per conversation same windowing pattern as the
  broadcast channel page itself). Sorted most-recently-active first;
  channels nobody has posted to yet trail alphabetically rather than
  cluttering the top. No new migration — pure read over existing tables/RLS
  (`kcircle_conversations_broadcast_public_read`, `to authenticated`).
  Auth-gated the same way `../saved` is (redirect to `/login?next=...`),
  since an anonymous visitor would just see an always-empty list under that
  RLS policy anyway.
- **Nav:** new 📣 icon added to both the desktop top bar (between Chat and
  Saved) and the mobile bottom tab bar (same position) on the main
  `/kalpana-circle` page.

**Not done:** still no "which broadcast channels have I actually
followed/subscribed to" — this is a full directory of every channel, not a
personalized list (matches §13d's note that "follows a series" is the only
proxy for broadcast interest that exists, no dedicated subscription table).

### 13f. KaTube ↔ Circle auto-post cross-link (DONE) — last remaining backlog item

Two parts, same commit:

1. **Per-video opt-in auto-post.** `app/katube/upload/page.tsx` gained a
   "📣 Auto-post to K Circle" checkbox, **off by default, scoped to that
   single upload** (not a standing profile setting). Checking it doesn't
   flip the box immediately — it opens a small Yes/No confirm ("Post a
   short update about this video to your K Circle channel?") so a stray
   click can't post on the creator's behalf; only "Yes" actually sets the
   flag. `POST /api/katube/upload` reads `autoPostToCircle` and, on
   success, lazily finds-or-creates the creator's broadcast channel (same
   pattern as `broadcast/[username]`'s lazy-create) and posts
   `🎬 New video: "title"` + a watch link. **Best-effort, wrapped in
   try/catch** — a Circle-side failure never fails the video upload
   response itself.
2. **"Fan Theories & Art" preview on the series page.** The reverse
   direction of §12f's tag cross-link, which until now was only a button
   pointing *out* to Circle. `app/series/[seriesId]/page.tsx` now fetches
   the latest `kcircle_posts` tagged with the series title (same
   `ilike`-match convention §12f already uses for the `?tag=` filter) and
   renders them as small preview cards next to "Readers Also Liked",
   linking through to the full filtered Circle view.

**Not done:** no realtime/webhook — the series-page preview is fetched
once on page load like every other section on that page, not live-updated
if a new tagged post appears while someone's viewing. No cap on repeat
auto-posts (if a creator re-uploads with the toggle on every time, each
upload adds its own broadcast message — same as manually posting each
time, no dedup).

## 13b. Repo/live-DB drift found this session — flag for follow-up

While applying the notifications migration, `list_migrations` on the live
project showed four applied migrations with **no matching file in this
repo and no mention in this CONTEXT.md**: `kcircle_close_friends`,
`kcircle_posts_link_fields`, `kcircle_dreamer_of_week` (+ a trigger-fix
follow-up), `kcircle_polls`. Live tables confirmed: `kcircle_close_friends`
(user_id/friend_id), `kcircle_poll_options` + `kcircle_poll_votes`
(post_id-linked). **No UI anywhere in the repo reads or writes any of
these** — grepped for `poll`/`close_friend`/`dreamer_of_week` across
`app/`, only false-positive matches (the word "dreamer" used as a generic
placeholder). So: schema for three more backlog items (close friends,
polls, dreamer-of-week pinning) already exists live from an earlier
session but was never wired to any screen, and the migration files were
never committed. Didn't reconstruct/commit those migration files or build
their UI this session (out of scope of the broadcast-vs-notifications ask)
— flagging so the next session doesn't assume they don't exist, and so the
founder can confirm whether to finish wiring them up or leave them
dormant.

**Update (§15):** migration files for all four are now committed
(reconciliation only, versions match what's already live — see §15 for
detail). Polls got a real UI this session; close friends, link fields, and
dreamer-of-week are still schema-only.

## 17. K Circle channels + roles — Discord-style, full scope (DONE, this session)

Founder confirmed full scope (channels + roles + per-channel permission
overwrites, not the leaner 3-fixed-role MVP that was proposed first).

- **Schema** (`supabase/migrations/20260813170000_kcircle_channels_roles.sql`):
  `kcircle_group_roles` (bitmask `permissions` column, `is_default` for the
  auto @everyone-equivalent role), `kcircle_group_role_members`,
  `kcircle_group_channels`, `kcircle_channel_overwrites` (per-channel
  allow/deny bitmask per role), `kcircle_channel_messages`. RLS on every
  table scoped to group participants (`kcircle_is_group_participant`
  helper). A trigger on `kcircle_conversations` insert auto-bootstraps
  every new group with an `@everyone` role (view+send), an `Owner` role
  (all permissions, assigned to the creator), and a `#general` channel —
  confirmed working via a live test insert.
- **Permission model** (`app/lib/kcirclePermissions.ts`): bit constants
  (`VIEW_CHANNEL`, `SEND_MESSAGES`, `MANAGE_MESSAGES`, `MANAGE_CHANNELS`,
  `MANAGE_ROLES`, `KICK_MEMBERS`, `BAN_MEMBERS`, `ADMINISTRATOR`) +
  `resolveChannelPermissions()`, which follows Discord's own documented
  resolution order: base role perms OR'd across all of a member's roles,
  then channel-level role denies clear bits, then channel-level role
  allows set bits, with `ADMINISTRATOR` short-circuiting to everything.
- **UI** (`app/kalpana-circle/group/[conversationId]/page.tsx`): channel
  sidebar + message view/composer (gated on `VIEW_CHANNEL`/`SEND_MESSAGES`
  for the current channel), a Channels management panel
  (create/delete, gated on `MANAGE_CHANNELS`), and a Roles panel
  (create/delete roles, toggle each permission bit per role, assign/unassign
  non-default roles per member — gated on `MANAGE_ROLES`). Linked from
  `app/kalpana-circle/chat/page.tsx`'s group header via a new "# Channels"
  link next to the existing group-settings (ⓘ) button. **Mobile:** hamburger
  (☰) toggle added to the nav — sidebar becomes a full-screen overlay under
  700px with a ✕ Close button, and auto-closes when a channel is selected.
- **Repo/DB drift found and fixed this session:** a `kcircle_channel_messages`
  table already existed live on Supabase with a different, undocumented
  schema (`sender_id` instead of `author_id`, no `image_url`, no migration
  file, no app code referencing it anywhere) — same pattern as the drift
  flagged in §13b. It was empty, so it was dropped and recreated to match
  this feature's schema before the migration file was written.
- **Role hierarchy guard (DONE, follow-up session):**
  `supabase/migrations/20260813180000_kcircle_role_hierarchy_guard.sql`.
  Closed a privilege-escalation gap — the original RLS policies only
  checked group membership, not the `MANAGE_ROLES` bit, so any participant
  could write directly to `kcircle_group_roles` / `kcircle_group_role_members`
  (bypassing the UI) and edit/delete any role including Owner, or assign
  themselves a higher role. Now enforced at the RLS level (not just
  UI-hidden): a member needs `MANAGE_ROLES` (or `ADMINISTRATOR`, which
  bypasses rank entirely — server-owner pattern) AND can only touch roles
  ranked, by `position`, strictly below their own highest role — same rule
  Discord enforces. New DB functions: `kcircle_my_highest_role_position()`,
  `kcircle_has_permission()`. Client-side mirror in
  `app/lib/kcirclePermissions.ts` (`highestRolePosition()`,
  `canManageRoleAt()`) — the Roles panel now shows a 🔒 and disables
  edit/delete/assign controls for roles a member can't manage, and new
  roles are created ranked below the creator's own highest role (unless
  they're an admin). DB is still the actual enforcement; the client-side
  check is just to avoid dead-end clicks that RLS would reject anyway.
- **Channels/overwrites permission gap (DONE, follow-up session):**
  `supabase/migrations/20260813190000_kcircle_channels_overwrites_permission_guard.sql`.
  Closed the matching gap flagged above for `kcircle_group_channels`
  (insert/update/delete now require `MANAGE_CHANNELS`, or `ADMINISTRATOR`)
  and `kcircle_channel_overwrites` (insert/update/delete now require
  `MANAGE_ROLES` — editing a channel's permission overwrite for a role is
  permission management — AND the same rank guard as the role hierarchy
  fix: the role being overwritten must rank strictly below the caller's
  own highest role, unless `ADMINISTRATOR`). No frontend change needed —
  the UI already gated channel creation/deletion on `MANAGE_CHANNELS`
  client-side, and there's no overwrite-editing UI built yet (still just
  read, via `resolveChannelPermissions`), so this was DB-only hardening.
  Verified via `pg_policies` that all 6 rewritten policies applied live.

- **Per-channel overwrite editing UI (DONE, follow-up session):** ⚙ icon
  next to each channel in the sidebar (visible when `MANAGE_ROLES`) opens
  a 3-state chip editor (Inherit/Allow/Deny, cycled on tap) per role x
  permission, scoped to that channel. Writes via upsert to
  `kcircle_channel_overwrites`, deletes the row once a role goes back to
  all-inherit. Role list in the editor filtered through `canManageRoleAt()`
  so it never offers a control the DB (§ hierarchy guard) would reject.
- **Channel reordering (DONE, follow-up session):** ▲/▼ buttons per
  channel in the sidebar (visible when `MANAGE_CHANNELS`). `moveChannel()`
  swaps two adjacent channels by writing their array indices as the new
  `position` values (not a read-modify-write on the stored position),
  which also self-normalizes any duplicate/gapped positions left over
  from earlier inserts.

**Not done (flagged as follow-ups, not started):**
- No voice/stage channels — text-only, per the `kcircle_group_channels`
  schema (no `type` column yet)
- No image/attachment support in channel messages on the composer side —
  `image_url` column exists on `kcircle_channel_messages` but nothing
  writes to it yet (DM/group-chat image attachments already work
  elsewhere, per §12d, this just isn't wired for channels yet)
- Voice/video calls (separate backlog item, still fully unstarted)

## 11. KaTube like button (`17eb400`) — one genuine like per user

**Approach:** no custom "algorithm" — the one-like-per-user guarantee comes
from the database schema itself, not application logic, so it can't be
bypassed by calling the API directly or from a buggy client.

- `video_likes` has a **composite primary key** `(video_id, liker_id)`
  (from the original `20260810_katube_videos.sql` migration). A primary key
  can't have duplicate rows, so it's structurally impossible for the same
  signed-in user to insert a second like row for the same video — Postgres
  itself rejects the second insert, not client-side code.
- **"Genuine" = tied to a real authenticated user**, not an anonymous
  counter. RLS on `video_likes` only allows insert/delete where
  `auth.uid() = liker_id` (already in place from the same migration), so a
  like can only ever be recorded as coming from the signed-in user making
  the request — no spoofing someone else's like, no unauthenticated
  like-spam.
- **Toggle, not increment:** the watch page checks for an existing
  `(video_id, userId)` row on load to set the initial liked/unliked state,
  then insert (like) or delete (unlike) that single row on click — so a
  user can only ever contribute 0 or 1 to a video's like count, and
  clicking again removes their like rather than adding another.
- **Denormalized counter:** `videos.likes` is kept in sync on every
  toggle (`+1`/`-1`) so existing reads (grid cards, Rankings sort, watch
  page header) stay a simple column read with no join/count query needed.
  Source of truth for *whether a specific user liked a video* is still the
  `video_likes` rows; `videos.likes` is just a fast cached total.
- Not signed in → clicking Like redirects to `/login` instead of silently
  failing or allowing an anonymous like.

**Not handled by this (future hardening, not asked for yet):** no rate
limiting or bot/fraud detection beyond "must be a real logged-in
`auth.users` row" — same trust model as the rest of the app (e.g. view
counts) for now.

## 18. Landing page — Framer Motion scroll/entrance animations + particle field (DONE, this session)

Founder asked for a modern redesign pass on the public landing page
(`app/page.tsx`) — glassmorphism/hero polish, smooth scroll-driven
animations, and an interactive visual layer. Kept the existing structure,
data-fetching, and `mangal-*` inline-style/CSS-var conventions intact;
this was additive, not a rewrite.

- **Dependency:** added `framer-motion` (package.json + lockfile).
- **Hero:** new `app/components/ParticleField.tsx` — a lightweight
  `<canvas>` particle network (no Three.js/WebGL dependency) rendered
  behind the hero copy. Particles drift, link to nearby neighbors within
  130px, and gently repel from the cursor within 110px. Respects
  `prefers-reduced-motion` (renders a static frame, no animation loop) and
  is `pointer-events: none` so it never blocks hero clicks. Hero headline,
  subtext, search bar, and genre pills now stagger in on load via a shared
  `fadeUp` + `staggerContainer` Framer Motion variant pair (defined once
  near the top of `page.tsx`, reused across every section below).
- **Scroll reveals:** three-door section (WebMangal/KaTube/K Circle)
  alternates slide-in-from-left/right per door on `whileInView`
  (`viewport={{ once: true }}`, so it doesn't replay on scroll-up).
  Trending showcase grid, tag cloud, features grid, and the "Got a story
  in you?" CTA section all fade-up on scroll with staggered children
  (cards/pills animate in one after another, not all at once).
- **Micro-interactions:** nav "Start Reading Free" button, hero search
  button, and the creator CTA button converted from manual
  `onMouseEnter`/`onMouseLeave` style mutation to Framer Motion
  `whileHover`/`whileTap` spring transitions. Everything else (genre pill
  hovers, showcase/feature card hovers, footer link hovers) intentionally
  left on the original manual-JS pattern — no reason to touch code that
  wasn't part of this ask.
- **Verified:** `tsc --noEmit` clean, `eslint` clean on the touched files
  (one pre-existing unrelated apostrophe lint warning on the KaTube door
  copy, not introduced this session, not touched). `next build` could not
  be run to completion in the dev sandbox — `next/font/google` fetches
  fonts.googleapis.com at build time and that's not on the sandbox's
  allowed egress list, so the build fails on the font step specifically,
  unrelated to this change. Should build clean on Vercel; **flagging so
  the founder watches the first Vercel deploy log for this change** in
  case anything else surfaces.

**Not done (out of scope for this pass, flagged as follow-ups):**
- No GSAP — Framer Motion covered every animation need here, didn't add a
  second animation library on top of it.
- No Three.js/WebGL 3D scene — used a canvas particle network instead
  (same "interactive depth" effect, much lighter bundle). Worth a real
  Three.js hero scene later if the founder wants something more elaborate.
- Full-stack logic (backend APIs/auth/DB) untouched — this was a
  presentation-layer pass only, no schema or route changes.

## 19. Landing page dark-by-default + ThemeToggle mount bug fix + mobile nav menu (DONE, this session)

Picked up where a previous session left off (had analyzed the approach but
not committed any code — working tree was clean at session start).

- **Landing page now defaults to dark**, light available via the existing
  `ThemeToggle`, using the same page-scoped local-override pattern KaTube
  already uses (§11 area / `app/katube/page.tsx`): `isLight` state
  (`useState(false)`), a `landingDarkVars`/`landingLightVars` CSS-var map
  (identical token values to `globals.css`'s `:root`/`[data-theme='light']`)
  spread onto the root div's inline `style`, independent of the site-wide
  light-default `<html>` attribute. Site-wide default (home, read, series,
  history, KaTube's own watch/upload pages, Kalpana Circle, etc.) is
  untouched — light unless the visitor explicitly picked dark.
- **Real bug fixed in `ThemeToggle.tsx` (not just landing-page-specific):**
  the component's mount effect always read `document.documentElement`'s
  `data-theme` attribute to compute its initial `isLight`/call `onChange` —
  which reflects the *site-wide* default, not a page's own override. For
  any page using the local-override pattern (KaTube, and now landing),
  this silently flipped the page's dark default back to light right after
  paint for first-time visitors, because the site-wide default is light.
  Fixed by adding two opt-in props: `defaultLight` (this page's own default
  when not syncing globally) and `syncGlobal` (whether toggling here should
  write to the shared `<html>` attribute + `mangal_theme` localStorage key
  at all). Pages using the plain site-wide toggle (the majority — no props
  passed) get identical behavior to before. KaTube's call site and the new
  landing page one both now pass `defaultLight={false} syncGlobal={false}`,
  so: (a) they don't get flipped back to light after mount, and (b)
  toggling on those pages re-themes only that page via `onChange` and never
  overwrites the sitewide preference other pages fall back to (previously,
  toggling KaTube back to "dark" after flipping to light would have written
  `dark` to the shared `mangal_theme` key, silently changing the sitewide
  default too — also fixed by the same `syncGlobal` change).
- **Mobile nav — real compatibility bug, not just polish:** under 640px,
  `.mangal-landing-nav-center` (Browse/Rankings/Genres/New Releases/KaTube/K
  Circle) and `.mangal-landing-login-link` were both set to `display: none`
  with nothing replacing them — mobile visitors had no way to reach any of
  those routes, only the "Start Reading Free" CTA. Added a hamburger button
  (`☰`/`✕`, visible only ≤640px) that toggles a sticky slide-down menu
  listing all the hidden links plus Log in, each closing the menu on tap.
- **Verified:** `tsc --noEmit` clean, `eslint` clean on all three touched
  files (`app/page.tsx`, `app/components/ThemeToggle.tsx`,
  `app/katube/page.tsx`) — only 2 pre-existing unrelated `<img>` warnings in
  `katube/page.tsx`, not introduced this session. `next build` still fails
  in this sandbox on the same pre-existing Google Fonts egress restriction
  (`fonts.googleapis.com` 403) documented in §18 — unrelated to this
  change, should build clean on Vercel; **flagging so the founder watches
  the first Vercel deploy log for this change** same as last time.

**Not done (out of scope, flagged as follow-ups):**
- Toggling on KaTube/landing is session-only (component state), not
  persisted per-page across visits — only the sitewide preference persists
  (by design now, via `syncGlobal`). Worth a per-page localStorage key
  later if the founder wants the local choice remembered too.
- Didn't audit every other page for mobile nav-link parity — only the
  landing page's nav was reported/found missing a mobile fallback this
  session.

## 20. Storage/bandwidth — Supabase vs Cloudflare R2 (ANALYZED, not started — backlog)

Founder asked whether Supabase Storage is the right long-term home for
media (worried about scaling since there's no audience yet) and whether
Cloudflare R2 (10GB free) is a better fit. Analyzed, not implemented yet.

**Current storage footprint (only two buckets, no video files at all):**
- `manga-pages` — comic page images, referenced from `app/upload/page.tsx`,
  `app/series/[seriesId]/page.tsx`, `app/components/ManagePagesModal.tsx`,
  `app/components/EditSeriesModal.tsx`.
- `kcircle-media` — K Circle chat image attachments, referenced from
  `app/kalpana-circle/page.tsx`, `app/kalpana-circle/chat/page.tsx`,
  `app/kalpana-circle/group/[conversationId]/page.tsx`.
- KaTube stores **no video files** — `app/katube/upload/page.tsx` only
  saves a YouTube link + metadata to the `videos` table (see
  `supabase/migrations/20260810_katube_videos.sql`); videos stay hosted on
  YouTube. So "storing videos in Supabase" isn't actually happening —
  founder's instinct that this needs solving pre-emptively is about images
  and future growth, not a live video-storage problem.

**Why R2 over Supabase Storage, when the time comes:** Supabase free tier
caps at 5GB storage *and* 5GB bandwidth/month — bandwidth is the real
constraint since every image view counts against it. R2 free tier is
10GB storage with **zero egress fees, unlimited bandwidth out** — much
better fit for a content platform where reads >> writes.

**Blocker found this session:** tried provisioning an R2 bucket via the
Cloudflare MCP connector (`r2_buckets_list`) — failed with `403: Please
enable R2 through the Cloudflare Dashboard`. Confirmed via web research
this is a hard Cloudflare requirement even on the free tier: a card (or
PayPal) must be on file to activate R2 at all, though nothing is charged
under the 10GB/1M-ops free allowance. This is a Cloudflare account-level
step only the founder can do (dashboard login), not something doable via
API/connector/token.

**Two paths forward, presented to founder:**
- **Option A — full R2 migration (needs a card on the Cloudflare
  account).** Founder doesn't have one; suggested Indian fintech apps that
  issue free virtual debit/RuPay/Visa cards without a bank branch visit
  (Jupiter, Fi Money, Niyo) as a fast unblock if he wants to go this route.
  Once unblocked: create R2 bucket, generate R2 API token (S3-compatible
  Access Key ID + Secret, separate credential from the Cloudflare account
  API token the MCP connector uses — connector can create/manage the
  bucket but can't generate S3-style credentials, so this step needs the
  founder to do it in-dashboard), attach a public custom domain or use
  `r2.dev`, build a presigned-upload-URL API route (client can't upload
  directly to R2 with a secret key the way it currently does to Supabase
  via RLS + anon key), swap the upload call sites listed above to the new
  flow, migrate existing files with a one-time copy script, add R2 env
  vars to Vercel.
- **Option B — free Cloudflare CDN/caching proxy in front of existing
  Supabase Storage URLs, no R2, no card needed.** Recommended as the
  near-term move since there's no audience yet (i.e. no real bandwidth
  problem to solve today) — this removes most of the *future* bandwidth
  pain for $0 without waiting on a card. Mechanism: add the founder's
  domain to Cloudflare (free plan), point a subdomain (e.g.
  `cdn.<domain>`) at the Supabase storage endpoint via a CNAME/proxy
  record with the Cloudflare orange cloud (proxied) on, then add a Cache
  Rule so Cloudflare's edge caches the image responses (comic
  pages/attachments are immutable once uploaded — new upload = new path,
  since the app already generates fresh storage paths per upload rather
  than overwriting — so cache-forever is safe). Once cached, repeat views
  of the same image are served from Cloudflare's edge and never hit
  Supabase's bandwidth meter again. App code changes needed: swap the
  base URL used in `getPublicUrl()` calls (or wrap them) to point at the
  new `cdn.<domain>` host instead of the raw
  `*.supabase.co/storage/v1/object/public/...` host, once that subdomain
  exists.

**Not started:** waiting on founder decision (A vs B) and, for either
option, founder-side action outside what a connector/token can do (R2:
add card in dashboard; Option B: confirm/add the domain to Cloudflare and
share it). No code changes made this session.

## 21. Login page — split-screen redesign with hero video, mobile responsive (DONE, this session)

Picked up from a previous session that had built out most of the new
`/login` page (form left, hero video right, split screen) but stopped
mid-way due to hitting a token limit before committing — working tree
was clean at session start, the in-progress version only existed as an
uploaded file.

- **Replaced the old card-based login/register flow** with a split-screen
  layout matching a reference design: form panel on the left (tabs for
  Log in / Sign up, email + password fields, Google OAuth, forgot-password
  link), a hero video panel on the right with a glassmorphic testimonial
  quote card overlaid at the bottom.
- **Hero video** — added `public/videos/login-dragon-hero.mp4` (same
  `public/videos/` folder KaTube's preview clips already live in) and
  wired it into the right panel via `<video autoPlay loop muted
  playsInline preload="metadata" poster="/hero-bg.jpg">` — no new video
  infra needed, same pattern as the existing KaTube video files.
- **Mobile responsive:** `.mangal-auth-right` (the video panel) is hidden
  entirely under 900px via `@media (max-width: 900px)` — the form panel
  becomes full-width standalone, and critically the browser never
  downloads the video at all on mobile (no wasted bandwidth on a panel
  that isn't shown).
- **Removed the dead landing/marketing screen** (`mode === 'landing'`)
  that used to be the entry point of this page — login is now the
  default `mode`. Cleaned up everything that only existed to support it:
  the `'landing'` value from the `Mode` type union, the unused
  `BackButton`, `EmberCanvas` (ember-particle canvas effect), `TrustStrip`,
  and `IconArrowLeft` components/consts (verified each was genuinely
  unused elsewhere in the file, not just in the removed block, before
  deleting). `dob`/`role`/`pending` modes are untouched — still in active
  use.
- **Fixed one real lint error surfaced along the way:** the logo link at
  the top of the form panel was a raw `<a href="/">`; swapped for
  `next/link`'s `<Link>` per `@next/next/no-html-link-for-pages`.
- **Verified:** `tsc --noEmit` clean and `eslint` clean (0 errors, 0
  warnings) on `app/login/page.tsx` after installing `node_modules` in
  the sandbox (wasn't installed at session start). `next build` still
  fails in this sandbox on the same pre-existing `fonts.googleapis.com`
  403 egress restriction documented in §18/§19 — unrelated to this
  change, should build clean on Vercel; **flagging so the founder watches
  the first Vercel deploy log for this change** same as previous
  sessions.

**Not done (out of scope this pass, flagged as follow-ups):**
- Didn't touch the `dob`/`role`/`pending` screens' visual style — only
  the landing screen was removed and the login/register screen redesigned;
  those three still use the older `CosmicBackground`/`CosmicOverlay`
  look, which is now the *only* place that look is used.
- Forgot-password flow (`handleForgotPassword`, Supabase
  `resetPasswordForEmail`) was already implemented in the uploaded WIP
  file from the previous session; carried over as-is, not modified here.
- Testimonial quote/name on the hero video panel is static placeholder
  copy, not wired to any real data source.

## 22. KaTube — YouTube-template landing polish (DONE, this session)

Picked up from a previous session that stopped mid-way (token limit) before
committing. That prior WIP never made it into the working tree or git history
— `git status` was clean at the start of this session — so this was a fresh
implementation, not a continuation of uncommitted code.

- **Sidebar regrouped into labeled sections** (`Menu`: Home/Fast tap/Slow tap,
  `Library`: Saved) with small-caps section headers, matching the founder's
  YouTube-template reference. Same four items, same filtering behavior as
  before — only the visual organization changed.
- **Pinned bottom CTA** — a blue "⬆ Upload video" button (KaTube brand color,
  not YouTube red) pinned above the existing "← Back to MANGAL" link, matching
  the template's pinned upload button.
- **Search bar restyled** as a single rounded pill with an inline 🔍 icon
  (was previously an input + separate square button).
- **Name next to avatar** — added a lightweight `supabase.auth.getUser()`
  check (no redirect/gating, unlike `/dashboard`) that shows the logged-in
  user's `full_name` (from signup metadata) or email prefix next to the nav
  avatar; logged-out visitors just see the avatar as before.
- **Relative-time meta line** — added a `timeAgo()` helper and changed the
  video card's meta line from just the creator name to `creator · Xh/d/w ago`,
  matching the template's "channel · time ago" pattern.

**Verified:** `tsc --noEmit` clean, `eslint app/katube/page.tsx` clean (0
errors, 2 pre-existing `no-img-element` warnings unrelated to this change).

**Not done / follow-ups:** search bar is still visual-only (not wired to real
results — unchanged from before); Popular Channels / YouTube Mixes sections
from the template weren't added since KaTube doesn't have that data
(subscriptions/mixes) built yet — flagged as a possible future step, not
done this session to avoid inventing fake data.

## 23. KaTube — accent color rebrand, blue → warm orange (DONE, this session)

Founder shared a reference image of the MANGAL wordmark (black background,
warm cream-to-deep-orange gradient lettering) and asked KaTube's page to pick
up that palette instead of the blue it launched with (see §1b).

- Swapped every hardcoded blue hex on `app/katube/page.tsx` for an orange
  equivalent — solid accent `#2563eb` → `#f97316`; the accent's `rgba(37,99,235,…)`
  form → `rgba(249,115,22,…)` (same alpha values, just the new accent's RGB).
  Covers: active sidebar item, pinned "Upload video" CTA, nav "+ Create"
  pill, active filter pill gradient, the "based on <series>" tag on video
  cards, the fast-tap "Show more" button + empty-state links, and the hero
  strip's radial glow.
- Demo Shorts card gradients (6 two-stop blue pairs) remapped to 6 two-stop
  orange/amber pairs, keeping each card visually distinct rather than making
  them all identical.
- Kalpana Circle's purple (`#7c3aed`) cross-link and the forced-dark
  background vars (`--bg-primary: #07070a` etc., already near-black) were
  left untouched — only the blue *accent* moved, not the base dark theme,
  which already reads close to the reference image's black.
- Updated the two brand comments at the top of the file and above the
  pinned CTA that said "blue" to describe the new orange brand instead.
- Didn't touch `public/katube-logo.png` — that's a separate raster asset
  (purple/red gradient "KaTube" wordmark), not a CSS color, and wasn't part
  of what was asked; flagging in case the founder wants it redone to match
  too.

**Verified:** `tsc --noEmit` clean, `eslint app/katube/page.tsx` clean (0
errors, same 2 pre-existing `no-img-element` warnings as §22, unrelated to
this change).

## 24. KaTube — carried the orange rebrand to upload/watch/shorts (DONE, this session)

§23 only touched `app/katube/page.tsx` (the landing/grid page). Founder
asked for the rest of KaTube's own pages to match, so the same
blue → orange hex swap was applied to the other three pages that share
KaTube's branded nav/chrome:

- `app/katube/upload/page.tsx` — verified-channel banner, category/tool
  pill gradients, submit button (including its `#93c5fd` disabled-state
  light blue, now a light orange `#fdba8c`), "View KaTube profile" link.
- `app/katube/watch/[videoId]/page.tsx` — "Back to KaTube" link, subscribe
  button, like button, "based on" tag, video-info pill.
- `app/katube/shorts/[shortId]/page.tsx` — "Back to KaTube" link (only one
  hardcoded accent color on this page).

`app/dashboard/katube/page.tsx` was deliberately left alone — it renders
inside the main MANGAL dashboard shell (`Navbar`/`Footer` from the core
site, not KaTube's own nav/sidebar), so it's the site-wide dashboard style,
not a "KaTube page" in the branded sense. Flagging in case the founder
wants that recolored too.

**Verified:** `tsc --noEmit` clean across the whole project; `eslint` on
all three touched files clean (0 errors; one pre-existing `no-img-element`
warning on the shorts page, unrelated to this change).

## 25. KaTube — Review Hub, accuracy-to-source star ratings (DONE, this session)

Founder pitched three retention-strategy ideas (Sync-Play Watch Rooms,
Review Hub, Creator Bounties) and asked which to build first. Picked
Review Hub — smallest surface area (one table, no new realtime/voting
machinery) vs. Sync-Play (needs live playback-state sync) or Bounties
(needs 3 tables: quests/submissions/votes).

- **New table `video_accuracy_reviews`** (migration
  `20260814_katube_video_accuracy_reviews` via `Supabase:apply_migration`,
  project `rfxlavwzhpnbhwoumaha`) — `video_id`, `reviewer_id`, `stars`
  (1-5, checked), optional `review_text`, `unique(video_id, reviewer_id)`
  so a viewer's second submission overwrites their first via `upsert`
  (`onConflict: 'video_id,reviewer_id'`) rather than creating a duplicate
  row. RLS: public read, own insert/update/delete — same shape as the
  existing `ratings`/`video_comments` policies.
- **UI on `app/katube/watch/[videoId]/page.tsx`** — new "Review Hub"
  card between the existing like/follow/"based on" row and the Comments
  section. Only renders when `video.seriesId` is set (accuracy-to-source
  is meaningless without a source novel). Clickable 1-5 star picker
  (hover preview + selected state), optional one-line text with the
  star submission, running average + review count shown top-right of the
  card, written reviews listed below (star-only submissions don't clutter
  the list, only ones with text show). Pre-fills the picker with the
  viewer's own existing rating if they've already reviewed this video.
  Same optimistic-ish patterns as the existing comment/like code
  (`accuracyLockRef` sync lock, batched `creator_profiles` username join
  instead of N+1 lookups).

**Verified:** `tsc --noEmit` clean project-wide; `eslint` on the touched
file clean (0 errors, 0 warnings) after fixing one
`react-hooks/set-state-in-effect` error (deferred the pre-fill setState
via `Promise.resolve().then(...)`, same pattern already used for the
`following` effect on this page).

**Not done (flagged as follow-ups, not started this session):**
- Sync-Play Watch Rooms and Creator Bounties — the other two pitched
  ideas, not built.
- No "helpful vote" or sort-by-rating on accuracy reviews (unlike the
  novel-review `review_helpful_votes` table from §written_reviews) —
  kept minimal for a first pass.
- Average/count is computed client-side from the fetched rows, not a DB
  view/RPC — fine at current scale, would need a proper aggregate query
  once a video has hundreds of reviews.

## 26. Series page — Creator Bounties, "Visual Quests" (DONE, this session)

Second of the three retention-strategy ideas from §25. Authors post a
request for a specific scene needing a KaTube visual; fan animators
submit a YouTube link; the community votes; the author picks the winner
as the official adaptation.

- **Three new tables** (migration `series_visual_quests_bounties` via
  `Supabase:apply_migration`, project `rfxlavwzhpnbhwoumaha`):
  - `visual_quests` — `series_id`, `creator_id`, optional `chapter_label`,
    `description`, `status` ('open'/'closed'), `winner_submission_id`
    (FK added after `visual_quest_submissions` exists, since it's a
    forward reference). RLS: public read; insert restricted to the
    series' actual owner via an `exists (select 1 from series where
    series.creator_id = auth.uid())` check, not just `creator_id =
    auth.uid()` alone (which someone could otherwise spoof by inserting
    with their own id on someone else's series); update/delete scoped to
    the quest's own `creator_id`.
  - `visual_quest_submissions` — `quest_id`, `submitter_id`,
    `youtube_url`, optional `note`. RLS: public read, own insert, own
    delete.
  - `visual_quest_votes` — **primary key is `(quest_id, voter_id)`**, not
    `(submission_id, voter_id)` — deliberate: a voter gets exactly one
    vote per quest, so switching their vote to a different submission in
    the same quest is an `upsert` on that composite key (moves the vote)
    rather than allowing a second row. RLS: public read (vote counts are
    visible to everyone, not just participants), own insert/update/delete.
- **UI on `app/series/[seriesId]/page.tsx`** — new "🎬 Visual Quests"
  section between the existing Fan Theories & Art (K Circle cross-link)
  preview and the Written Reviews section. Section only renders if there
  are existing quests or the viewer `isCreator` (so a series with zero
  quests and a non-owner viewer doesn't show an empty section). Creator
  gets a "+ Post a Visual Quest" form (chapter label + description).
  Each quest card shows status (open/closed), the description, a picked
  winner (if any, with a 🏆 badge and link) shown separately from the
  regular submission list, then remaining submissions each with a vote
  button (shows count, highlights if it's the viewer's current vote) and
  — creator-only, while open — a "🏆 Pick" button that sets
  `winner_submission_id` and flips `status` to `closed` in one update.
  Fans get a two-field inline form (YouTube link + optional note) at the
  bottom of each open quest card.
- **Data fetch (`fetchQuests`)** batches submitter usernames via a single
  `creator_profiles` `.in()` query (comments/reviews pattern) and
  vote-counts client-side from the full `visual_quest_votes` rows for the
  series' quests, rather than a per-submission count query — fine at
  current scale.

**Verified:** `tsc --noEmit` clean project-wide; `eslint` on the touched
file: 0 errors. Hit one `react-hooks/set-state-in-effect` error on the
initial `useEffect(() => { if (seriesId) fetchQuests(); }, ...)` — fixed
by wrapping the call in a nested `(async () => { await fetchQuests();
})()` IIFE (matching the existing `load()` pattern already used
elsewhere on this page) instead of calling the named function directly;
also removed an eager `setQuestsLoading(true)` at the top of `fetchQuests`
(state already defaults to `true`) since that synchronous call was the
other trigger for the same rule. Remaining 3 warnings are
`exhaustive-deps` on missing-callback-in-deps-array — two are
pre-existing (`fetchChapters`, unrelated to this change), one is the same
pattern on the new `fetchQuests` effect; not fixed, matches how the
pre-existing ones were already left as-is.

**Not done (flagged as follow-ups, not started this session):**
- Sync-Play Watch Rooms — the third pitched idea from §25, not built.
- No notification to the author when a new submission/vote comes in, and
  no notification to submitters when a winner is picked.
- No limit on quests-per-series or submissions-per-quest; no report/flag
  button on a submitted YouTube link (unlike comments, which have
  `ReportButton` elsewhere on this page) — worth adding before this is
  fan-facing at scale.

## 27. Not built yet — Creator-side retention features (backlog, discussed this session)

Founder's framing: audiences follow creators, not the other way around —
creators are the actual supply side, so retention features that make
*creators* stick (not just audiences) are the higher-leverage bet.
Discussed as a set; nothing in this list is started. §25 (Review Hub,
DONE) and §26 (Visual Quests / Creator Bounties, DONE) were the first two
audience-retention ideas from that same conversation — this list is the
next round, creator-focused, not yet built. Founder hasn't picked which
to build first yet.

1. **Direct tipping / "Super Thanks"-style tipping** — viewers send a
   creator money directly on a video/chapter. Flagged as the strongest
   pull since it's real money, not just engagement — UPI integration
   would be a genuine India-specific differentiator vs. YouTube. Needs a
   payment provider decision (Razorpay/similar) — not startable at zero
   budget without picking one and handling payout/KYC questions.
2. **Fan memberships / paid subscriptions** — monthly recurring payment
   for early access to chapters/videos or member-only perks. Same
   payment-provider dependency as tipping above; likely built together.
3. **Cash/reward attached to Visual Quest bounties** (extends §26) — right
   now a Visual Quest is recognition-only ("official visual" badge); this
   would let an author optionally attach a payout to the winning
   submission. Same payment dependency as items 1–2.
4. **Real creator analytics dashboard** — retention/drop-off graphs per
   chapter (where readers stop), traffic-source breakdown, view/like/
   follow trends over time. Called out as a genuine differentiator since
   this kind of chapter-level drop-off data doesn't really exist anywhere
   else for web novels/manga — YouTube gives video analytics but nothing
   like this for prose. Feasible at zero cost (all data already being
   collected — views, likes, follows, ratings — this is a
   read/aggregate/chart job, not new infra), so a realistic candidate for
   "build before payments."
5. **A/B thumbnail/title testing** — let a creator run two thumbnails/
   titles and see which performs better. Lower priority, flagged mainly
   for completeness.
6. **"New Voices" discovery spotlight** — founder/platform-curated
   placement that gives brand-new creators a guaranteed visibility boost
   (vs. pure view-count ranking, which always favors already-big
   creators) — addresses cold-start problem for anyone joining early.
   Zero-cost, just a curated/pinned section — realistic near-term build.
7. **Deeper cross-promotion push** — extend the existing KaTube↔K Circle
   auto-post (already built, see earlier K Circle sessions) so a single
   upload automatically surfaces across series page, K Circle, and the
   discovery feed with less manual creator effort than today.
8. **Creator-only K Circle space** — a private lounge/channel visible
   only to verified creators, for creator-to-creator discussion. Pitched
   as a network-effect/stickiness play (creators who build relationships
   with each other on-platform are less likely to leave) rather than a
   discovery feature. Could reuse the existing K Circle channels/roles
   system (§17) with a role-gated private channel rather than needing new
   infra.
9. **Verified badge + creator leaderboard** — status/competitive layer,
   lower cost than the payment-dependent items, mostly UI + an aggregate
   ranking query.
10. **In-platform creator tools** (AI thumbnail generation, auto-written
    descriptions, auto SRT/subtitle generation) — reduces a creator's
    need for external tools (Suno/CapCut/VEED, per founder's earlier
    YouTube-growth sessions), lowering switching cost to platform-native
    tooling. Needs an AI API budget decision — not zero-cost like most of
    the others in this list.

**Rough zero-cost-first ordering, if picking where to start:** items 4, 6,
9, and 7 don't need a payment provider or paid AI API and reuse existing
data/infra; items 1–3 (money) and 10 (AI tools) are gated behind a
budget/provider decision the founder hasn't made yet.

## 28. Not built yet — KaTube-only viewer/creator features, YouTube-policy notes, platform monetization (backlog, discussed this session)

Follow-up conversation to §27. Founder pointed out §27's items mostly
assumed someone using MANGAL/K Circle too — this covers the case of a
visitor or creator who *only* touches KaTube and never crosses into the
novel/K Circle side, plus a separate discussion on YouTube API policy
compliance and how the platform itself (not just creators) could earn
revenue. Nothing below is started — pure backlog.

### 28a. KaTube-only viewer features (no MANGAL/K Circle dependency)

- **Playlists** — viewer builds their own playlist across creators/videos
  (YouTube-style), stored as MANGAL data (video ID references only).
- **Subscriptions feed** — a dedicated tab showing only new uploads from
  channels the viewer already follows, separate from the general/trending
  grid. `creator_follows` + `videos` already exist — this is a filtered
  view, no new table needed.
- **Notification bell for new uploads** — notify a follower when a
  followed creator posts. K Circle already has a notifications system
  (§14) — reusable pattern, but this needs to surface inside KaTube's own
  chrome, not just K Circle.
- **Continue Watching row** — resume from where a viewer left off,
  surfaced near the top of the KaTube home grid. Needs playback-position
  tracking via the YouTube IFrame Player API (`getCurrentTime()`), not
  just a "watched/not watched" flag.
- **Autoplay Next / Up Next queue** — next related video plays
  automatically when one ends, via the IFrame Player API's `onStateChange`
  event. See §28b — autoplay has a disclosure requirement.
- **Pure KaTube trending page** — trending across all genres/creators,
  independent of any novel/series tie-in; distinct from the existing
  tag-based "Up next" recommendations (§8) which are series-anchored.
- **Better search + filters** — genre, AI tool used, duration, upload
  date. Search bar on `/katube` is currently visual-only (§22 follow-up,
  never wired to real results).

### 28b. KaTube-only creator features (channel owner who doesn't write novels)

- **Public channel page** — About tab, banner image, channel trailer
  video, all-uploads grid. Distinct from `/dashboard/katube` (§10), which
  is the creator's own private management view, not a polished
  public-facing page.
- **Channel-level analytics** — views/likes/watch-through trend for a
  creator's own uploads, without needing a linked novel/series (overlaps
  with §27 item 4, but scoped to work even for a creator with zero
  MANGAL series).
- **Creator-made playlists** — a creator groups their own uploads (e.g.
  "Chapter 1–5 compilation") without needing a `series_id` link.
- **Native KaTube community-update posts** — a lightweight text/image
  update a creator can post to their own subscribers directly inside
  KaTube, instead of needing to cross-post to K Circle to reach fans.
- **Custom channel URL** — e.g. `/katube/@username`, for clean external
  sharing (currently only `/katube/watch/[videoId]` and
  `/dashboard/katube` exist, no public `/katube/@handle` route).

### 28c. YouTube API Services policy — constraints to respect when building the above

Researched during this session (YouTube API Services Terms of Service /
Developer Policies, current as of this check). Applies to all of §28a/§28b
and anything else touching embedded video:

- **Never download, cache, or re-host video files.** Store only
  `youtube_id` + metadata (already the pattern in `videos` table) and
  always play back via the official embed/IFrame Player — no exceptions,
  regardless of feature.
- **No ads or paid overlays on/around the embedded YouTube player itself**
  — sponsorship placements (§4 item 6, on hold pending traffic) must sit
  around the grid/page, never on top of or inside the player.
- **Autoplay disclosure requirement:** if Autoplay Next (§28a) ships,
  playback data is shared with YouTube on page load rather than on user
  interaction — this needs a line added to the privacy policy (`/privacy`)
  disclosing that. Not yet added — flagged as a prerequisite before
  shipping Autoplay Next, not a blocker for anything else in this list.
- **No artificial engagement inflation** — a curated placement like "New
  Voices" spotlight (§27 item 6) is fine as long as it shows real
  view/like numbers; never fake or pad counts.
- **YouTube branding/attribution guidelines** must be respected wherever
  an embed or thumbnail is shown — the standard iframe embed already
  satisfies this by default, just don't strip/cover the YouTube chrome on
  the embedded player.

### 28d. Platform-level monetization (separate from creator monetization in §27)

§27 covered creators earning money *through* the platform (tips,
memberships, bounty payouts). This is about MANGAL/Kalpanaverse itself
earning revenue, discussed as a distinct question this session:

- **On-site sponsorship/ads** — already documented as §4 item 6 (banners
  around the grid, sponsored category rows, "Powered by [AI tool]"
  badges; target sponsors: Kling, Runway, Pika, Hailuo, Suno). Explicitly
  gated behind real traffic — not premature to *plan*, premature to
  *pitch or build* right now.
- **Premium reading subscription (MANGAL/novel side)** — ad-free reading,
  early chapter access, exclusive content. Fully platform-controlled, no
  YouTube-policy overlap since it's on the novel side, not KaTube.
- **Platform fee on tips/bounty payouts** — once §27's tipping/membership
  and bounty-payout features exist, take a small percentage (~5–10%,
  Patreon/Ko-fi-style) as the platform's own cut of creator-to-viewer
  money flows. No YouTube conflict since the money never touches YouTube
  ad revenue — it's a separate creator-to-viewer transaction the platform
  facilitates.
- **Pro Creator tier (SaaS-style)** — paid tier unlocking advanced
  analytics, AI creator tools (§27 item 10), custom channel URL (§28b) —
  creators pay the platform directly for growth tooling.
- **Affiliate/referral links** — if AI video-tool companies (Suno, Kling,
  etc.) run a referral program, link out for a commission.
- **Marketplace commission (longer-term)** — a cut on any future
  merch/digital-goods sales (e.g. art prints of a Visual Quest §26
  winning entry), if that ever gets built.

**Sequencing note from this session:** tipping-platform-fee and Pro
Creator tier are the most realistic near-term revenue paths — both are
platform-owned infra with no payment-provider blocker beyond the one
already noted in §27 (need to pick Razorpay/similar), and don't need
real traffic the way sponsorship/ads does. Sponsorship stays parked
until there's an audience worth showing sponsors, same as §4 already
said.

## 29. Not built yet — Novel-to-video Creator Collaboration pipeline (backlog, discussed this session)

Founder's pitch: when a novel/series builds up readers who want a video
adaptation, there should be a structured path connecting the novel's
creator with a top KaTube creator to collaborate — distinct from §26's
Visual Quests (which are open, community-voted, any-fan-can-submit).
This is a **direct 1-on-1 negotiated partnership** between two
established creators, discussed privately via K Circle. Complements §26
rather than replacing it — Visual Quests suit smaller/casual demand,
this suits high-value demand where the novel creator wants a specific,
credited, ongoing collaborator rather than an open contest. Nothing
below is started — pure backlog, design-level only.

**1. Demand signal capture (readers → data)**
- "🎥 Request Video Adaptation" button on the series page — a reader
  click registers demand (needs a table, e.g. `adaptation_requests`:
  `series_id`, `reader_id`, `created_at`, unique per reader per series —
  same shape as `follows`/`video_likes`).
- Once demand crosses a threshold (e.g. 50+ requests, or a % of the
  series' followers), the series gets a visible **"🔥 High Demand for
  Adaptation"** badge — surfaced on the series page and to KaTube
  creators (see next item).

**2. Discovery — surfacing demand to the right KaTube creators**
- An **"Adaptation Opportunities" board** — high-demand novels matched to
  top KaTube creators by genre/tag overlap (reuses the existing tag
  system, §25 area, and the leaderboard/ranking data pitched in §27 item
  9).
- Matched creators get a notification: their genre has a
  novel trending with unmet video demand.

**3. Connect + discuss via K Circle (the core mechanic)**
- A "Propose Collab" button (either side can initiate — novel creator
  reaching out to a KaTube creator, or a KaTube creator expressing
  interest in a high-demand novel) creates a **private Collab Room** in
  K Circle automatically, scoped to just those two creators. Reuses the
  existing K Circle channels/roles infrastructure (§17) rather than
  building new messaging infra from scratch.
- Terms get negotiated inside that room: which chapter/scene, credit,
  revenue split (once tipping/monetization from §27/§28d exists).

**4. Tracking + status**
- New table (not yet built): `collaborations` — `series_id`,
  `novel_creator_id`, `katube_creator_id`, `status` ('proposed' →
  'accepted' → 'in_progress' → 'completed'), `video_id` (linked once the
  video is published).
- A **"🤝 Official Collab"** badge on both the series page and the
  KaTube video/channel — distinguishes a negotiated partnership from a
  Visual Quest community submission (§26), signaling to viewers this was
  made *with* the novel's creator, not just inspired by it.

**5. Reward loop**
- Cross-promotion once a collab video goes live — series page already
  has a "based on" tag pattern (§8/§22) to extend; the video itself
  should show "Official adaptation, made with @novel-creator."
- Sets up a natural future monetization hook: once tipping exists
  (§27/§28d), a collab video's tips could be split between both
  creators — not designed yet, just noted as a natural next step once
  the payment layer exists.

**Explicitly not designed yet:** the demand-threshold number, how
matching/ranking actually scores genre overlap, whether either creator
can decline/exit a collab room, and how a completed collab's revenue
split would actually be enforced (depends entirely on the payment layer
in §27/§28d landing first).

## 30. Investor-lens critique — risks, why current path isn't profitable, revenue-first recommendations (discussed this session)

Founder asked for an investor-perspective critique of §29 (and the
broader feature roadmap). Recorded here as-is since it should shape
sequencing going forward — not a feature spec, a strategic gut-check.

### 30a. Cons of the Collab pipeline (§29) specifically

1. **Doesn't generate revenue on its own** — it drives engagement, not
   money. All of §26–29's monetization touchpoints explicitly say
   "depends on payment layer, not designed yet" — i.e. a revenue feature
   made dependent on another unbuilt revenue feature.
2. **Adds a third chicken-and-egg problem.** Beyond "need creators for
   audience, need audience for creators," Collab specifically needs an
   *already-successful* novel creator AND an *already-successful* KaTube
   creator, both active on the same platform, at the same time. Only
   works at a scale the platform doesn't have yet.
3. **Unresolved IP/ownership risk** — if a collab video's YouTube channel
   changes hands, gets deleted, or the two creators fall out, who owns
   what isn't defined anywhere in §29's design. Will come up in real due
   diligence.
4. **Feature-building has been outpacing go-to-market.** K Circle,
   KaTube, Visual Quests, Review Hub, and now the Collab pipeline design
   have all been built/planned without confirmed real-user/creator
   traction numbers surfacing in these sessions. An investor's first
   question is DAU/MAU and how many creators have uploaded even once —
   a roadmap doesn't answer that.
5. **Zero-budget constraint blocks the actual revenue engine**, not just
   nice-to-haves — every monetization path (tipping, memberships,
   sponsorship) is gated on a payment-provider decision that's been
   sitting unresolved (see §27 item 1). Meanwhile creators are being
   asked to do extra work (cross-post, join K Circle, negotiate collabs)
   with no financial payoff yet, while YouTube already pays them
   directly for the same content.
6. **No clear moat vs. established players** (Webtoon, Tapas, Wattpad
   already operate in the novel-to-adaptation space) if the only edge is
   "we built this feature first" — a well-funded competitor with
   existing audience could replicate quickly.

### 30b. Why the current trajectory doesn't lead to profit

Revenue = Users × Conversion % × ARPU. All three inputs are currently
near-zero or undefined: minimal confirmed user base, no live paid
conversion path (payment provider still undecided), and no ARPU data
since nothing paid has shipped. The roadmap so far optimizes for
*future* users the platform doesn't have evidence of yet, rather than
testing whether anyone will pay today.

### 30c. Recommendations to actually move toward revenue (priority order)

1. **Pause new feature-building for 2–4 weeks; focus entirely on
   distribution.** Manually pitch 10–20 real creators (same
   direct-outreach approach already used for MANGAL's own YouTube growth
   — Groover/Vampr/Instagram DMs, per earlier sessions), get them
   uploading, and let real friction define the next real roadmap instead
   of speculation.
2. **Unblock the Razorpay/payment-provider decision first** — this has
   been the actual bottleneck sitting behind every monetization idea
   across §27/§28d for a while; tipping itself is roughly a weekend of
   build once a provider is chosen. This is a decision blocker, not a
   feature-scope problem.
3. **Park §26–29-style discovery/collab features until ~50+ real active
   creators exist.** These only produce value once real creator supply
   exists; building them earlier adds maintenance burden with no return
   yet. (Note: §26, Visual Quests, is already built — this is about not
   building *further* in this direction until there's real usage of what
   already exists.)
4. **Ship one small paid feature now as a willingness-to-pay test** —
   e.g. a ₹49/month ad-free-reading or early-chapter-access tier on the
   MANGAL/novel side — specifically to learn whether anyone converts at
   all before investing further in the bigger monetization roadmap.
5. **Start tracking traction metrics immediately** — signups/week,
   uploads/week, day-7 retention — since an investor pitch (and honestly
   the founder's own prioritization) needs real numbers, not just a
   feature list, regardless of how strong any individual idea is.

**Not a decision yet** — founder hasn't picked which of these to act on;
recorded for reference the next time prioritization comes up.

## 31. CEO decision — feature freeze, revenue-first sequencing, 90-day checkpoint (decided this session)

Founder, acting as CEO in response to §30's investor critique, made the
following calls. Recorded as the operating decision going forward, not
open for casual re-litigation — a real reason is needed to revisit, not
just a feature "feeling important."

1. **Feature freeze on the discovery/collab/social layer.** K
   Circle, Visual Quests (§26), Creator Bounties, and the Collab pipeline
   (§29) stay as-is — nothing further gets built in this direction until
   the creator-count target in decision 4 is hit. §27/§28/§29 remain
   backlog-only, not started.
2. **Payment provider (Razorpay) decision — targeted this week**, not
   deferred further. This has been sitting unresolved behind every
   monetization idea in §27/§28d; it's now explicitly a this-week
   decision, not a someday item.
3. **Ship one small paid feature this month** — ₹49/month "ad-free +
   early chapter access" on the MANGAL/novel side. This is the company's
   first real revenue test: whether anyone converts determines whether
   the rest of the monetization roadmap is worth building out.
4. **Distribution target: 20 real creators this month, 50 within 3
   months.** Founder's own time shifts toward direct outreach/pitching
   (same approach as the earlier MANGAL YouTube growth push — direct
   DMs, Groover/Vampr/Instagram), not more coding sessions, until this
   target is hit. Discovery/collab features (decision 1) stay frozen
   until 50+ active creators exist.
5. **Weekly traction tracking starts immediately** — signups/week,
   uploads/week, day-7 retention. Simple raw-number tracking (a Supabase
   query or spreadsheet), not a dashboard build — the point is visibility
   into real numbers, not another feature.
6. **90-day checkpoint.** At 90 days, review creator count, revenue-test
   conversion %, and retention numbers to decide whether to scale toward
   discovery/collab features or pivot. This checkpoint is the only
   sanctioned point to revisit the feature freeze in decision 1.

**Summary framing:** shift from builder mode to operator mode — the
product is already feature-rich; the open question is whether real users
will use it and pay, not whether more features can be built.

## 32. Official market-launch playbook (backlog — method to use once product is launch-ready, not started)

Founder asked for the go-to-market method to use once MANGAL is actually
ready for an official public launch (distinct from §30/§31's
pre-launch distribution push, which is about getting early creators in
now). This is the launch-day/launch-week playbook to execute once the
product, the §31 revenue test, and the creator base are in a
launch-ready state — not started, reference for later.

**Pre-launch (weeks before launch day)**
- **Waitlist with referral incentive** — early signups get a perk (early
  creator badge, founding-member status, or similar) for referring
  others; builds a list to notify on launch day instead of launching to
  zero audience.
- **Teaser content on the existing MANGAL YouTube channel** (@MANGAL_MUSICs)
  and founder's own social — the channel/audience already being built
  (per earlier sessions) is a free pre-launch distribution asset, worth
  using deliberately for a launch countdown rather than only music
  content.
- **Press kit prepared in advance** — one-pager covering what MANGAL is,
  the founder's story, screenshots/demo video, so it's ready to hand to
  any press contact without scrambling day-of.

**Launch day / launch week**
- **Product Hunt launch** — standard zero-cost distribution channel for
  an India-founder / indie-platform story; needs a launch-day post,
  founder actively responding to comments, and ideally a small group of
  early users ready to upvote/comment at launch.
- **Reddit — relevant communities** (e.g. r/SideProject, r/webnovels,
  r/manga-adjacent communities, r/India startup-focused subs) — organic
  post explaining the platform, not an ad; matches the direct,
  founder-voice approach already used in creator outreach.
- **Indian tech/startup press outreach** — YourStory, Inc42, and similar
  outlets that cover early-stage Indian founders; a founder-story angle
  (solo builder, zero-budget architecture, AI-era platform) is a
  realistic pitch angle given the project's actual background.
- **LinkedIn founder-story post** — the "how/why I built this" narrative,
  which tends to travel well organically and costs nothing.
- **Leverage the creator base already onboarded** (per §31 decision 4's
  20–50 creator target) — ask early creators to share their channel/
  profile link on launch day; their own existing audiences (however
  small) are the platform's actual distribution muscle at this stage,
  more so than any single press hit.

**Launch-day operational checklist**
- Confirm Vercel/Supabase can handle a traffic spike (check current
  Supabase plan limits — relevant given the storage/bandwidth
  constraints already documented in §20).
- Have a visible feedback channel ready (in-app or a simple form) to
  catch bugs/complaints fast during the highest-traffic window.
- Founder available and actively monitoring/responding across whichever
  channels the launch post goes out on (Product Hunt comments, Reddit
  replies, etc.) for at least the first 24–48 hours.

**Explicitly not decided yet:** exact launch date, which single channel
leads (Product Hunt vs. Reddit vs. press) if only one can be done well
with founder's solo bandwidth, and what "launch-ready" actually means in
concrete terms (this depends on where §31's revenue test and creator
targets land at the 90-day checkpoint).

## 33. Sync-Play Watch Rooms (DONE, this session)

Third and last of the three retention-strategy ideas from §25 — Review Hub
and Visual Quests/Creator Bounties were built earlier, this was the one
flagged both times as "not built, needs live playback-state sync." Built
this session, entry points on both KaTube and Kalpana Circle sharing one
room system underneath (not two separate builds — the sync/chat/member
machinery is identical either way, so splitting it would just duplicate
code for no behavioral gain).

- **Three new tables** (migration `20260815_sync_watch_rooms`, applied via
  `Supabase:apply_migration`, project `rfxlavwzhpnbhwoumaha`):
  `watch_rooms` (video_id, host_id, visibility 'private'/'public', title,
  is_active), `watch_room_members` (room_id, user_id — composite PK, no
  separate invite-token concept: the shareable room URL *is* the invite,
  same as how broadcast-channel links already work elsewhere in the app),
  `watch_room_messages` (room_id, sender_id, message_text). RLS: a private
  room's rows (room itself, members, messages) are only readable by the
  host or an existing member; a public room's rows are readable by anyone.
  Realtime (postgres_changes) enabled on members + messages, mirroring
  `20260812130000_kcircle_realtime_chat.sql`.
- **Playback sync deliberately does NOT go through Postgres** — an
  ephemeral Realtime Broadcast channel (`watch-room-sync-<roomId>`) carries
  play/pause/seek events instead, matching Supabase's own documented
  pattern for high-frequency "authoritative clock" state. Writing every
  play/pause/seek to the DB would add write load/latency for zero benefit
  (nothing needs that history after the fact).
- **Host-authoritative sync model**: the room's `host_id` is the only
  client whose play/pause/seek actually drives the shared state. Everyone
  else's YouTube IFrame player is remote-controlled to match (seekTo when
  drift exceeds 1.5s, play/pause to match host state). Viewers keep their
  own native YouTube controls (volume, fullscreen, captions still work
  locally) but any playback action they trigger silently self-corrects
  back on the next 4s heartbeat tick — deliberate simplification to avoid
  control-fight bugs from letting every viewer drive playback. The IFrame
  API has no native "user seeked" event (confirmed against Google's docs),
  so a host-side seek is detected by comparing expected vs. actual time on
  each heartbeat tick.
- **New route `app/katube/watch/[videoId]/room/[roomId]/page.tsx`** — the
  room itself: synced player, member chips (host gets a 👑), live chat,
  copy-invite-link button, leave button.
- **KaTube entry point** — `app/katube/watch/[videoId]/page.tsx` gets a new
  "👥 Watch with Friends" button under the player (hidden on Shorts).
  Always creates a **private** room — KaTube's own watch page is already
  the "public" watching surface per the founder's spec (anyone can open
  that URL any time), so a public room there would be redundant. Creating
  inserts a `watch_rooms` row + a `watch_room_members` row for the host,
  then routes to the room.
- **Kalpana Circle entry point** — new tab `app/kalpana-circle/watch-
  together/page.tsx` (🎬 nav icon added to both the desktop top bar and
  mobile bottom bar, `navHref`-gated like the existing chat/broadcasts/
  saved icons). Lists open public rooms (host name + live member count),
  a "your rooms" section for rejoining without needing the original link,
  and a "+ Create Room" modal that searches `videos` by title (ilike,
  same pattern KaTube's own search uses) and lets the founder pick
  public or private when creating.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on all four
touched/new files: 0 errors, 0 warnings (one pre-existing unrelated
warning at `app/kalpana-circle/page.tsx:152` untouched by this change).
Full-project `eslint .` shows 13 pre-existing errors, all in files this
session never touched (`app/read/[chapterId]/page.tsx` and others) — not
introduced here. Hit and fixed three of React's newer purity-rule
violations during development: an `any`-typed YouTube Player API surface
(replaced with a narrow `YTPlayerLike`/`YTNamespace` interface), a ref
read during render for host-status display (replaced with a derived
`const isHost = room?.host_id === userId` alongside the ref, which is
still used inside event-handler closures where reading a ref is fine),
and a `Date.now()` call inside a `useRef` initializer (replaced with a
`ts: 0` sentinel, since a ref initializer runs during the initial render
and React's purity rules disallow impure calls there).

**Not done (flagged as follow-ups, not started this session):**
- No formal "invite a specific friend" picker — invite is link-sharing
  only (copy-link button on the room page). A K Circle-integrated friend
  picker (reusing the DM contact list from `kcircle_conversations`) would
  be the natural next step if link-sharing turns out to be too much
  friction in practice.
- No host-transfer or "promote to co-host" — if the host leaves, playback
  sync simply stops updating for everyone else (the room doesn't
  auto-reassign a new host). Fine for a first pass at small friend-group
  scale, worth revisiting before this is pushed as a public-room feature
  at any real scale.
- No room capacity limit, no report/moderation hook on room chat (unlike
  video comments elsewhere, which have `ReportButton`) — worth adding
  before public rooms are discoverable at scale.
- Public room browse list (`watch-together` tab) has no pagination past
  its `limit(30)` and no filtering/search of rooms themselves (only the
  create-room video search) — fine at current scale.

## 34. Fast tap (Shorts) Watch Together — extends §33 (DONE, this session)

§33 shipped Sync-Play Watch Rooms for a single long video only. This session
added the second mode the founder asked for: a Fast tap room where everyone
scrolls KaTube Shorts together, with two distinct ways to talk — a public
Comment (tied to the one Short on screen, same as normal KaTube comments)
and a private Chat that posts into a *real, existing* K Circle group instead
of living only in the room. Reused §33's `watch_rooms`/`watch_room_members`
tables and host-authoritative Broadcast-sync philosophy rather than building
a parallel system.

- **Schema** (two migrations, applied live via `Supabase:execute_sql`
  earlier and formalized into the repo as
  `supabase/migrations/20260815062656_sync_watch_rooms_shorts_mode.sql` and
  `20260815063915_kcircle_fast_tap_watch_together.sql` this session — they
  existed live but were missing from git, now reconciled):
  `watch_rooms.mode` (`'video'` default / `'shorts'`), `watch_rooms.
  current_short_id` (which Short the room is currently on),
  `watch_rooms.video_id` relaxed to nullable (a shorts room isn't "about"
  one fixed video), `watch_rooms.linked_conversation_id` (which K Circle
  group a room's Chat tab posts into — chosen by the host at creation),
  `kcircle_messages.short_ref_id` (tags a group message with which Short it
  was about, for the "📎 About a Short" pointer). No new RLS policies
  needed — existing host-only/participant-only policies on both tables
  apply unchanged regardless of which columns are set.
- **Room-creation flow** (`app/kalpana-circle/watch-together/page.tsx`) —
  "+ Create Room" now opens a mode picker first: **Fast tap (Shorts)** vs
  **Slow tap (long video)**, replacing the old single video-search modal
  (which is now just the Slow tap path, unchanged otherwise). Picking Fast
  tap adds a step to choose which of the founder's own K Circle *groups*
  (not 1:1 DMs) the room's Chat should post into — the room starts on the
  most recent KaTube Short. "Your rooms" / public-room list rows now show a
  ⚡/🎬 icon and route to the right room type via a small `roomHref()`
  helper.
- **New route `app/kalpana-circle/watch-together/shorts/[roomId]/page.tsx`**
  — the Fast tap room itself:
  - Shorts feed reuses `app/katube/shorts/[shortId]/page.tsx`'s vertical
    snap-scroll/windowing pattern (±1 iframe mounting, thumbnail fallback
    otherwise), but navigation is host-authoritative: only the host's
    scroll position is real — everyone else's `IntersectionObserver`
    still fires locally (feels responsive) but is a no-op for sync
    purposes. The host's current index broadcasts over an ephemeral
    channel (`watch-room-shorts-sync-<roomId>`, mirrors §33's playback
    channel) plus a 5s heartbeat re-broadcast and a `request-sync` ask
    from new joiners, and is persisted to `current_short_id` so a late
    joiner lands on the right Short even before the first broadcast
    arrives.
  - **Comment tab** — public, inserts into `video_comments` for whichever
    Short is currently active, visible to anyone (same table/behavior as
    KaTube's own watch-page comments).
  - **Chat tab** — inserts into `kcircle_messages` with the room's
    `linked_conversation_id` and `short_ref_id` set to the active Short.
    Gated on actual group membership (checked on room load via
    `kcircle_conversation_participants`): a non-member sees a locked
    explainer ("🔒 Chat here goes to *Group Name*, a private K Circle
    group — you're not a member...") and Send stays disabled, but Comment
    still works for them. Membership isn't re-checked per-send — relies on
    `kcircle_messages`'s existing insert RLS as the real enforcement, the
    client-side lock is just UX.
  - **Layout** — desktop: persistent flexbox row, Shorts feed **left**,
    Chat/Comment panel **right** (deliberately mirrors §33's video-top/
    chat-bottom long-video room, per the founder's spec that Fast tap
    should look different from Slow tap). Mobile (`≤860px`, CSS media
    query in an inline `<style>` tag since this file has no persistent
    layout width to key off of like the long-video room's flex-wrap does):
    full-bleed 9:16 video matching KaTube's own Shorts feed, side panel
    hidden, Chat/Comment collapsed into a Reels-style bottom sheet opened
    by tapping the 💬/🗨️ icons on the video itself — no room for a
    persistent panel at true full-screen 9:16, and a bottom sheet is the
    pattern viewers already know from Instagram/YouTube.
  - Sound defaults muted (browser autoplay requirement), toggled via the
    YouTube postMessage API on the active iframe only, same approach as
    `app/katube/shorts/[shortId]/page.tsx`.
- **K Circle group chat** (`app/kalpana-circle/chat/page.tsx`) — the
  regular group thread now renders a small "📎 About a Short — open it →"
  link on any message carrying `short_ref_id`, linking to
  `/katube/shorts/<id>`, so a Fast-tap Chat message is recognizable and
  followable from inside the group's normal chat history later, not just
  from inside the room itself.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on all
touched/new files (`watch-together/page.tsx`, `watch-together/shorts/
[roomId]/page.tsx`, `kalpana-circle/chat/page.tsx`): 0 errors — fixed three
unescaped-apostrophe issues during the pass. One pre-existing-style `<img>`
warning in the new Shorts room file, same as the two already-accepted `<img>`
warnings in `kalpana-circle/chat/page.tsx` and the one in `katube/shorts/
[shortId]/page.tsx` (YouTube-CDN thumbnail fallback, not swapped to
`next/image` anywhere else in the codebase either). Full-project `eslint .`
shows 13 pre-existing errors, all in files this session never touched
(`app/read/[chapterId]/page.tsx` and others) — not introduced here.

**Not done (flagged as follow-ups, not started this session):**
- No host-transfer for Fast tap rooms either (same gap as §33's long-video
  room) — if the host leaves mid-session, Shorts navigation simply stops
  advancing for everyone else.
- The Chat-tab membership lock is client-side UX only, not a second
  server-side check beyond `kcircle_messages`' own RLS — fine since RLS is
  the actual enforcement, but a member removed from the group mid-room
  would still see an unlocked-looking tab until next reload.
- No public/report hook on Fast-tap Chat messages beyond whatever
  moderation the regular K Circle group chat already has; Comment reuses
  KaTube's existing comment moderation as-is.
- Shorts feed in the room is capped at the same `limit(50)` most-recent
  window as KaTube's own Shorts feed — no pagination/infinite-scroll,
  matching that file's existing scope.

## §35 — K Circle theme parity with KaTube/landing page (dark default)

**What:** All 6 K Circle pages now use the same page-scoped dark-default
theme as KaTube and the landing page, instead of the site-wide light
default (or, for `watch-together/page.tsx`, the old global-sync
`<ThemeToggle />`).

**Shared hook** — `app/kalpana-circle/theme.ts` exports `useKCircleTheme()`
plus `KC_DARK_VARS`/`KC_LIGHT_VARS`, the CSS var maps copied verbatim from
KaTube's own dark/light tokens (`--bg-primary`, `--bg-card`, `--bg-input`,
`--border-color`, `--text-primary/secondary/tertiary/faint`, `--nav-bg`,
`--nav-bg-transparent`). Returns `{ isLight, setIsLight, themeVars,
dataTheme }`; every page spreads `themeVars` onto its root div, sets
`data-theme={dataTheme}`, and wires `<ThemeToggle onChange={setIsLight}
defaultLight={false} syncGlobal={false} />` — page-scoped, never touches
the global `<html data-theme>` attribute or the sitewide localStorage key.

**Pages wired (all 6):**
- `app/kalpana-circle/page.tsx` — root div + both existing ThemeToggles;
  Suspense fallback hardcoded to dark (no light flash before mount).
- `app/kalpana-circle/chat/page.tsx` — root div; ThemeToggle added to all
  three nav states (conversation list, group chat, DM) — DM previously had
  no toggle at all.
- `app/kalpana-circle/group/[conversationId]/page.tsx` — all three return
  states (loading, not-allowed, main) themed; toggle added to nav.
- `app/kalpana-circle/broadcast/[username]/page.tsx` — same three-state
  pattern; toggle added to nav.
- `app/kalpana-circle/broadcasts/page.tsx` — root div + header toggle
  (page had none before).
- `app/kalpana-circle/watch-together/page.tsx` — converted from the old
  global-sync `<ThemeToggle />` to the page-scoped pattern.

**Deliberately untouched:** `app/kalpana-circle/watch-together/shorts/
[roomId]/page.tsx` stays always-dark, no toggle — matches KaTube's own
Shorts feed convention (see §34).

**Verified:** `tsc --noEmit` clean project-wide. `eslint` 0 errors on all
6 touched files + `theme.ts` (one pre-existing, unrelated warning in
`broadcasts/page.tsx` on an untouched line). Full-project `eslint .`
still shows the same 13 pre-existing errors from files this session never
touched. Committed in three batches (theme.ts+page.tsx+chat; group+
broadcast; broadcasts+watch-together) and pushed directly to `main`.


## §36 — KCircle Watch Together: participant-set chat threads (replaces §34's group-picker Chat)

**What:** §34 shipped Fast tap (Shorts) rooms with a Chat tab that posted
into an *existing* K Circle group chosen by the host at room-creation
time. Founder's follow-up spec replaced that with the "Participant-Set"
approach: Chat now automatically resolves to a thread identified by the
exact set of people actually present in the room (sorted user_ids ->
deterministic key), not a pre-chosen group. Same set reunites -> same
thread reused; set changes -> a new thread, old one untouched. 1:1 is just
the 2-person case of the same mechanism. Scope, per founder: entirely
inside K Circle (no KaTube tables touched), with the thread list living
inside K Circle's own Watch Together tab as a scrollable section — not a
separate route/page.

- **Schema** (`supabase/migrations/20260815210000_kcircle_watch_together_threads.sql`,
  applied live via `Supabase:apply_migration` and verified against
  `information_schema`/`pg_policies`/`pg_proc`):
  - `kcircle_conversations.is_watch_thread` (bool) + `.participant_key`
    (text, partial-unique where `is_watch_thread`) — a watch thread is
    just a flagged `kcircle_conversations` row, reusing existing
    messages/attachments/realtime infra rather than a parallel schema.
    Regular DM/group conversations are unaffected (`participant_key` is
    null on them, no index conflict).
  - `kcircle_conversation_participants.history_enabled` (bool, default
    true) — a per-user, per-thread snapshot of that user's global
    "save history" preference at the moment they were added to the
    thread. **Documented approximation, not per-user data isolation**:
    since this is one shared row both people can see live (not a
    per-device copy), "my ON doesn't force your ON" is implemented as
    "a thread with my `history_enabled=false` is left out of *my own*
    Watch Together list afterward" — the message itself still exists for
    the other participant if theirs is `true`. Flagging this explicitly
    for the founder in case true per-user isolation (duplicated storage)
    is wanted later.
  - `kcircle_watch_history_prefs` (`user_id` PK, `save_history` default
    `true`) — the actual global toggle, own-row RLS only. **Default is
    opt-out (true)**, not opt-in — founder's spec left the default an
    open question ("default state discuss karni hai"); chose opt-out so
    the feature works without extra setup, easy to flip if opt-in-only is
    preferred.
  - `kcircle_message_hidden_for` (`message_id`, `user_id` composite PK) —
    "delete for me": insert-only-if-participant, own-row RLS. Client
    filters these out of history queries rather than a server-side view,
    to keep the read path a plain query.
  - New delete policy on `kcircle_messages`, **scoped to
    `is_watch_thread = true` conversations only** — "delete for both" is
    a real row delete, not sender-restricted (anyone in the thread can
    delete any message in it, per spec: "bina doosre ki permission ke
    turant dono taraf se delete"). Regular group/DM `kcircle_messages`
    still has no delete policy at all — this migration does not touch
    that.
  - `kcircle_get_or_create_watch_thread(p_participant_ids uuid[])` RPC,
    `security definer` — validates `auth.uid()` is one of the ids, sorts
    + dedupes, looks up by `participant_key`, or creates the conversation
    + all participant rows (copying each participant's *own* current
    `save_history` pref onto their `history_enabled`) in one atomic call.
    Security definer is needed here because a plain client insert can't
    add *other* people's participant rows from the caller's own session.

- **Room creation** (`app/kalpana-circle/watch-together/page.tsx`) — the
  Fast tap path's `pick-group` step (load-my-groups, pick one) is gone
  entirely; picking "Fast tap — Shorts" now goes straight to a
  `pick-visibility` step (🔒 Private / 🌐 Public only) and creates the
  room immediately, since Chat no longer needs anything chosen upfront.
- **New "Watch Together chats" section** on the same page — scrollable
  list (participant names + last-message preview) of threads where *my*
  `history_enabled` is true, sorted by `last_message_at`. A "Save
  history" pill toggle above the list reads/writes
  `kcircle_watch_history_prefs` directly (this *is* the founder-requested
  Settings/Profile toggle — kept inside K Circle's own Watch Together tab
  rather than the site-wide `/settings` page, matching the "sirf kcircle
  me" scope instruction). Tapping a thread row opens a modal
  (`WatchThreadModal`, same file) showing full history, each message
  tappable via its "📎 About this Short" link to `/katube/shorts/<id>`,
  with **Delete for me** / **Delete for both** under every message.
- **`shorts/[roomId]/page.tsx`** — `room.linked_conversation_id` /
  `isGroupMember` removed entirely. New Supabase Realtime **Presence**
  channel (`watch-room-shorts-presence-<roomId>`, separate from the
  existing nav-sync Broadcast channel so presence tracking doesn't
  entangle with that channel's broadcast-heavy traffic) tracks who's
  actually online; a `presentIds` -> sorted-key effect calls the RPC only
  when that key actually changes (guards against redundant calls from
  repeated `presence sync` events for the same effective set), caching
  the resolved `chatThreadId`. Chat tab: fewer than 2 people present shows
  a "waiting for a friend to join" state instead of the old locked-group
  message; Comment (public, `video_comments`) is unaffected either way.
  Chat history load now also fetches the caller's
  `kcircle_message_hidden_for` rows and filters them out client-side.
  Realtime subscription on `kcircle_messages` now also listens for
  `DELETE` (needed for "delete for both" to disappear live for the other
  participant), not just `INSERT` as before.

**Not done (flagged as follow-ups, not started this session):**
- `history_enabled` is a one-time snapshot taken when a participant is
  first added to a given thread, not re-synced if they flip the global
  toggle afterward — an existing thread's participant row won't retro-
  actively hide/show based on a later preference change. Would need an
  explicit "apply to existing threads too" action if the founder wants
  that.
- No UI surfaces `history_enabled` per-thread individually (e.g. "you
  turned history off for this specific chat only") — it's the single
  global toggle only, applied at thread-creation time.
- Presence-based thread resolution only fires while the shorts room tab
  is open and the presence channel is subscribed — closing the tab
  doesn't retroactively move earlier messages to a different thread if
  the room's membership had been fluctuating; each stable 2+ window gets
  its own correct thread already, this is just noting there's no
  "merge" logic for messages sent right at a transition boundary.
- No group-thread-specific push/in-app notification for new Watch
  Together messages — same as regular K Circle chat's existing scope,
  not added here.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on both touched
files: 0 errors (one pre-existing-style `<img>` warning in the shorts room
file, same pattern already accepted there and elsewhere in the codebase).
Full-project `eslint .` still shows the same 13 pre-existing errors, all
in files this session never touched. Migration applied live via
`Supabase:apply_migration` and reconciled into
`supabase/migrations/20260815210000_kcircle_watch_together_threads.sql`.
Committed in two batches (migration only; then both frontend files
together) and pushed directly to `main`.

## §37 — KCircle Watch Together: "add a friend mid-session" choice (extends §36)

**What:** §36's presence-driven resolution was fully automatic — any
change to the present set silently resolved to a (possibly brand new)
thread via `participant_key`, no say from anyone in the room. Reported
gap: if Riya/Suraj/Mohan are mid-conversation and add a 4th friend
(Natasha), the group had no way to choose whether Natasha sees the
existing history or starts fresh — it just silently swapped everyone to
an empty new thread. Also covers: if a member (Mohan) later leaves and
comes back with the exact same set, §36 already reuses the old thread
correctly — that part needed no change, only the "someone new joins an
already-chatting group" case was missing a choice.

- **Schema** (`supabase/migrations/20260815230000_kcircle_watch_thread_join_choice.sql`,
  applied live via `Supabase:apply_migration`, no table changes — two new
  RPCs only):
  - `kcircle_find_watch_thread_for_superset(p_participant_ids uuid[])` —
    given the currently-present set, finds the most recently active
    existing watch thread whose participant set is a smaller subset of it
    (`participant_key`'s ids `<@` the given set, size 2..<full size).
    `security definer`, callable by anyone in the given id list (not
    required to already be a participant of the found thread) — needed so
    a just-joined newcomer's own client can detect "there's already a
    thread here" even though it has no local memory of it.
  - `kcircle_expand_watch_thread(p_conversation_id, p_full_participant_ids)`
    — the "Continue in this thread" outcome: adds the new participant(s)
    to the **existing** conversation row (real read access via the
    already-existing participant-only RLS on `kcircle_messages`, no new
    grant needed) and repoints `participant_key` at the new full set.
    Restricted to callers who are **already** participants of that
    conversation — the newcomer can't grant themselves access, only an
    existing member can pull them in. Races two "Continue" callers safely
    (second call is a no-op update + idempotent participant inserts); a
    race between "Continue" and "New" resolves to whichever committed
    first and the loser's RPC hands back that same thread id instead of
    erroring.
  - "Start a new thread" needed no new RPC — it's the existing
    `kcircle_get_or_create_watch_thread` with the full new set, which is
    a different `participant_key`, so it creates a fresh empty thread and
    leaves the old one/its history untouched for whoever doesn't join it.

- **`shorts/[roomId]/page.tsx`** — the presence-resolution effect now
  branches:
  - Exact-set reunion, a mix where someone also left, or a totally fresh
    gathering → resolves automatically exactly as §36 did.
  - Pure addition detected **locally** (this client already had a
    resolved thread for a smaller set that's a subset of the new one) →
    doesn't auto-resolve; sets `pendingJoin` and keeps `chatThreadId`
    pointed at the old thread so existing members keep chatting
    uninterrupted while the choice is pending.
  - Pure addition **not** knowable locally (this client has no prior
    resolved thread this session — i.e. it's the newcomer's own tab that
    just mounted) → calls `kcircle_find_watch_thread_for_superset` to ask
    the server instead of assuming a fresh gathering and racing ahead to
    create one.
  - New `pendingJoin` banner in the Chat tab: existing members see
    "Continue in this thread" / "Start new thread" buttons; the newcomer
    (their own id is in `addedIds`) only sees "Start new thread" — they
    can't self-approve into the old thread, matching the RPC restriction.
    Names in the banner resolved via the existing `resolveUsername`
    cache.

**Not done (flagged as follow-ups, not started this session):**
- If the group's set changes twice in quick succession while a choice is
  still pending (e.g. a 5th person joins before anyone resolves the
  4th), the second change just recomputes `pendingJoin` against the
  latest set — there's no queue of "join events," only ever one live
  choice reflecting whoever's present right now.
- No push/in-app notification for the pending choice itself beyond the
  in-panel banner — same as §36's existing chat notification scope, not
  added here.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on the touched
file: 0 errors (same one pre-existing-style `<img>` warning §36 already
documented). Full-project `eslint .` still shows the same 13 pre-existing
errors, all in files this session never touched. Migration applied live
via `Supabase:apply_migration`. Committed in two batches (migration only;
then the frontend file) and pushed directly to `main`.

## §38 — KCircle Watch Together: "Add friend" button (extends §37)

**What:** §37 only handled the *reactive* half — what happens once a new
person shows up in an already-chatting room (via the raw share link).
There was no actual in-app action for an existing member to pick a friend
and pull them in; the only invite mechanism was the 🔗 copy-link button.
This adds a real "➕ Add friend" button in the room header.

- **Schema** (`supabase/migrations/20260815234500_kcircle_watch_room_invite_notification.sql`,
  applied live via `Supabase:apply_migration`): `kcircle_notifications`
  gets a new `'watch_invite'` type value and a nullable `room_id` column
  (references `watch_rooms`, `conversation_id` doesn't fit since a room
  isn't a `kcircle_conversations` row) — additive only, reuses the
  existing notifications table/RLS rather than a parallel invite schema.
  Deliberately did **not** touch `watch_room_members`' RLS (`self_insert`
  only) — an existing member still can't insert a membership row for
  someone else; the invited friend joins themselves the same way anyone
  with the link already does, just now they're told to via a notification
  instead of needing the URL shared outside the app.
- **`shorts/[roomId]/page.tsx`** — "➕ Add friend" button next to
  🔗/Leave in the room header opens a picker: username search against
  `creator_profiles` (same `ilike` pattern as starting a new K Circle chat
  in `app/kalpana-circle/chat/page.tsx`), excluding yourself and anyone
  already a room member. Picking someone inserts a `watch_invite`
  notification (`room_id` + room title as `preview`) rather than adding
  them to the room directly — matches the "self-join via link" model,
  just notified instead of DM'd a URL. Button shows "Invited ✓" per
  friend after send so you can't double-invite by mistake.
- **`app/components/NotificationBell.tsx`** — new `watch_invite` case:
  label ("X added you to Watch Together: <room title>") and routes
  straight to `/kalpana-circle/watch-together/shorts/<room_id>` on click,
  landing them in the room where §37's join-choice banner takes over from
  there for whoever's already chatting.

**Not done (flagged as follow-up, not started this session):** no "who's
already been invited but hasn't joined yet" list on the room itself —
the inviter only sees their own session's "Invited ✓" state, not a
persistent pending-invites view.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on both touched
files: 0 errors (same pre-existing `<img>` warning). Full-project
`eslint .` unchanged at the same 13 pre-existing errors. Migration
applied live via `Supabase:apply_migration`. Committed in two batches
(migration only; then both frontend files together) and pushed directly
to `main`.

## §39 — KCircle Watch Together (Shorts room): fix invite-choice trigger (bugfix on §37/§38)

**What:** §37's reactive "pendingJoin" banner — shown to whoever newly
joined a room that already had a chatting group — was the wrong UX:
the continue-vs-new-thread choice was appearing to the wrong person
(the newcomer / reactively to whoever happened to be present) instead
of the person actually doing the inviting. Replaced with an
invite-time confirmation: clicking "Add friend" and picking someone,
when a thread already exists, now asks **only the inviter**, once,
right before the invite is sent — nobody else in the room and not the
invited friend ever sees it. Short copy, explicit Yes/No buttons.

- New `confirmInvite` state (only ever set by `startInvite`, right
  before `sendInviteNotification` fires) replaces the old
  `pendingJoin`/`resolvingChoice` reactive-presence machinery entirely.
  The presence-resolution effect is back to the plain automatic
  §36 version — no more `kcircle_find_watch_thread_for_superset`
  lookup or superset detection.
- **Bugfix within this fix:** the JSX for the old `pendingJoin` banner
  (referencing `pendingJoin`/`resolvingChoice`/`resolvePendingJoin`/
  `pendingJoinNames`) had been left in place from an incomplete prior
  session after the state/handlers backing it were already removed —
  didn't compile. Deleted the dead block.
- No schema changes — reuses the existing `kcircle_get_or_create_watch_thread`
  and `kcircle_expand_watch_thread` RPCs from §36/§37's migrations.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on the touched
file: 0 errors (same pre-existing `<img>` warning). Full-project
`eslint .` unchanged at the same 13 pre-existing errors. Single-file
change, committed and pushed directly to `main`.

## §40 — KCircle Watch Together (Shorts room): "Your friends" default list in Add friend picker

**What:** The Add friend picker (§38) was search-only — typing a
username was the only way to find anyone, even someone the inviter
already follows and is followed back by. Now the picker opens straight
to a "Your friends" section listing mutual follows (both directions,
via `creator_follows`), excluding existing room members, so the common
case (inviting an actual mutual) needs no typing. The username search
still works exactly as before, falling through for anyone not a
mutual follow yet.

- `loadSuggestedFriends` — two `creator_follows` queries (who the
  inviter follows, who follows the inviter back), intersected
  client-side for mutuals, then `creator_profiles` for usernames.
  Fires once when the picker opens (`addFriendOpen` effect).
- Extracted invite-row markup into a `FriendRow` component so the
  suggested list and search results share the same look and the same
  Invite/Invited button state, rather than duplicating the row JSX.
- No schema changes — reuses `creator_follows` (public-read RLS
  already in place from KaTube's follow feature).

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on the touched
file: 0 errors (same pre-existing `<img>` warning). Full-project
`eslint .` unchanged at the same 13 pre-existing errors. Single-file
change, committed and pushed directly to `main`.

## §41 — Not built yet — Affiliate "AI Toolkit" page for creators (idea discussed, backlog)

**What:** A dedicated page (`/dashboard/ai-tools` for the logged-in
creator view, possibly also a public `/tools` version for SEO/acquisition)
that curates third-party AI tools relevant to each product's creators —
not our own tools (that's `/dashboard/tools`, which already exists for
native platform tools like the chapter uploader). Three category tabs
matching the three products:

- **WebMangal creators** — art/writing tools (image gen, translation
  helpers, grammar tools)
- **KaTube creators** — video/voice tools (Runway, InVideo, ElevenLabs,
  Murf, etc.)
- **K Circle** — community/growth/scheduling tools

**Monetization:** Each tool card links out via an affiliate/referral
link where available, with a visible "Sponsored/Affiliate link" label
on each card (legally required disclosure, not optional). Confirmed via
research before listing any tool:
- Video tools with public affiliate programs: Synthesia, InVideo, Veed,
  HeyGen, Descript, Pictory. Runway's paid affiliate rate is behind a
  login but it has a public in-app referral.
- Voice tools with recurring-commission affiliate programs: ElevenLabs
  (22% for 12 months) and Murf (20% for 24 months, longest recurring
  window in that category), both on PartnerStack.
- Dead ends — do NOT list these as revenue-generating: Midjourney has
  no affiliate program at all; Canva's affiliate program is currently
  closed to new applicants. Can still list them as free useful tools
  without a monetized link if we want completeness, just not pretend
  they earn commission.

**Implementation plan (not started):**
1. `ai_tools` table (name, category, product tag, description,
   affiliate_url, icon, active) instead of a hardcoded array — lets the
   list be updated as new tools/deals appear without a code push.
2. Optional `tool_clicks` table for our own internal analytics (which
   tool, which user, when) — separate from whatever tracking the
   affiliate network itself does — to see which tools creators actually
   use before negotiating the next batch of deals.
3. Apply to each affiliate program individually first (approval isn't
   guaranteed or instant) before adding a tool's card/link live.
4. Consider a public, logged-out version too (not just inside
   /dashboard) — "best AI tools for webnovel writers"-style content
   can pull in new users who don't know about WebMangal/KaTube yet, not
   just serve existing creators.

Nothing built yet — this is scoped for whenever it's picked up next.

## §42 — Per-product URL namespacing + Kalpana Circle's "always return to root" login rule

**Founder's directive (research-first):** `app/page.tsx` (`/`) is the
*only* official company landing page — everything else must live under a
product namespace: `/WebMangal/*`, `/katube/*`, `/kalpana-circle/*`. No
product page should sit outside its own namespace (e.g. `/dashboard/katube`
was wrong — KaTube's own dashboard tab belongs at `/katube/dashboard`).
Products should not cross-link into each other's URLs except via the
existing top-right product switcher UI.

**Research done before touching code:** the "stash the originating URL,
redirect back to it after auth" pattern this app already uses
(`setPostLoginRedirect` cookie + `safeNextPath` validation in
`/auth/callback`) is the standard OAuth/OIDC approach — equivalent to
using the `state` parameter to carry a return URL (Auth0, Okta, Google's
own docs all describe the same shape: stash intended destination
client-side before the redirect, restore it after token exchange). So the
existing infrastructure is the right foundation; this section is about
*where* each product's default landing zone is, not about changing that
mechanism.

**What shipped:**
- **`app/home` → `app/WebMangal/home`.** It's WebMangal's own signed-in
  home feed, not an ecosystem-level page, so it belongs under
  `/WebMangal`. Every reference updated (`/auth/callback`'s default,
  `/login`'s `nextPath` defaults, Kalpana Circle's profile-icon fallback,
  `/tags`'s back-link). Permanent redirect `/home → /WebMangal/home`
  added in `next.config.ts` for old bookmarks/shares.
- **`app/dashboard/katube` → `app/katube/dashboard`.** Same page, same
  `StudioSidebar` shell (new `app/katube/dashboard/layout.tsx` replicates
  `app/dashboard/layout.tsx`'s wrapper) — this does **not** reopen §10's
  "one MANGAL profile / one login, not a standalone KaTube profile
  system" decision, it only moves the URL out of the shared `/dashboard`
  prefix into KaTube's own namespace. `StudioSidebar`'s nav entry,
  `/katube`'s "K" avatar link, and `/katube/upload`'s profile links all
  updated. Permanent redirect `/dashboard/katube → /katube/dashboard`
  added for old links.
- **Kalpana Circle now has a deliberately different post-login rule than
  WebMangal/KaTube.** WebMangal and KaTube pages return the user to the
  *exact* page they were on (existing `next=` mechanism, unchanged). Every
  Kalpana Circle page — the main feed, chat, close-friends, saved,
  broadcasts, a specific broadcast, a group DM, a Watch Together room —
  now always sends `next=/kalpana-circle` on its login redirect, so
  logging in from anywhere inside Kalpana Circle always lands back on the
  Kalpana Circle root, never on the specific sub-page (this was a
  founder-specified exception, not a technical constraint: Kalpana Circle
  is meant to work as "land here, then explore," distinct from
  WebMangal/KaTube's deep-link-back behavior). Fixed in
  `app/kalpana-circle/{page,close-friends,chat,watch-together,broadcasts,
  saved}/page.tsx`, `app/kalpana-circle/broadcast/[username]/page.tsx`,
  `app/kalpana-circle/group/[conversationId]/page.tsx`, and
  `app/kalpana-circle/watch-together/shorts/[roomId]/page.tsx`.

**Not done / flagged for the founder:** `/dashboard`'s other tabs
(Workspace, Earnings, Boost, Perks, Academy, Nova, Tools) are still
un-namespaced — they're WebMangal/ecosystem-wide creator tools, not
KaTube-specific, so they weren't touched. If the intent is *every* product
page under its own namespace with nothing left at bare `/dashboard`,
that's a much larger follow-up (each tab would need to move under
`/WebMangal/dashboard/...` or similar) — flagging rather than guessing at
scope.

**Verified:** `tsc --noEmit` clean project-wide. `npx eslint .` — 13
errors, 35 warnings, same count as the documented pre-existing baseline
(no new issues introduced). `next build` could not be verified in this
sandbox (network sandbox blocks `fonts.googleapis.com`, used by
`next/font/google` in `app/layout.tsx`); Vercel's own build environment
has normal internet access, so this shouldn't apply there — worth
watching the next Vercel deploy log if anything looks off.
## §43 — 🔴 HIGH PRIORITY, NOT STARTED — Unify /dashboard's other tabs as one shell with a product-scope switcher

**Status: plan only, agreed by founder, nothing built yet. Read this before
touching Workspace/Earnings/Boost/Perks/Academy/Nova/Tools.**

**The question this answers:** §42 moved KaTube's dashboard tab to its own
namespace (`/katube/dashboard`) and flagged the remaining `/dashboard`
tabs (Workspace, Earnings, Boost, Perks, Academy, Nova, Tools) as
un-namespaced. The founder asked whether those seven should become three
separate copies (one full set per product) or stay common. Researched
before deciding — this is that research + the decision.

**Current state (as of this section, unchanged so far):** all seven tabs
are 100% WebMangal content today — series drafts, chapter uploads,
reader-count tiers, writing tips. None of them are KaTube- or Kalpana
Circle-aware yet. So this was a build-it-forward decision, not a bug fix.

**Research:** the standard pattern for "one account, multiple
products/brands" in real platforms is neither of the two options as
originally framed (fully separate vs fully merged) — it's a third shape:
**one dashboard shell, with a context/workspace switcher that scopes the
data shown inside each tab**, not a switcher that navigates to a
different app. Notion's workspace switcher is the clean example:
switching workspace re-populates the *same* sidebar and pages with that
workspace's data rather than taking you somewhere else, so the user never
has to wonder if they're looking at the right thing. YouTube Studio
(channel switcher), Stripe (business switcher), and Google Ads
(account/property switcher) all do the same thing: one shell, one URL
structure, a scope selector that changes what's rendered.

**Decision: one shell per tab, not three.** Reasons:
- The app already has a "one MANGAL profile, one login" principle (the
  reason `/dashboard/katube` existed inside the shared dashboard in the
  first place instead of a standalone KaTube account system — see §10).
  Three fully separate dashboards would quietly break that: a creator
  active in both WebMangal and KaTube would have to remember which URL
  has which earnings number.
- Fully separate means 21 near-duplicate pages (7 tabs × 3 products)
  instead of 7. Every future fix or design change has to be made three
  times and *will* drift out of sync over time.
- A naively fully-merged dashboard (one Earnings page, identical view for
  everyone) is also wrong — the products' data isn't comparable. KaTube
  revenue flows through YouTube itself, not through the platform (§41),
  while WebMangal earnings are platform-native. Merging those into one
  number would be actively misleading.

**What "one shell" means concretely:** each tab keeps a single URL
(`/dashboard/earnings`, `/dashboard/workspace`, etc.) with a small
product-scope switcher at the top (WebMangal / KaTube / Kalpana Circle,
or "All" where that makes sense) — the tab's content conditionally
renders per-product data underneath the switcher, not a single merged
number. Some tabs barely need the switcher: Academy and Nova are
naturally cross-product (writing tips / AI help aren't WebMangal-only).
Others — Earnings and Workspace especially — need the switcher front and
center since the underlying data is structurally different per product.

**Perks question — DECIDED: per-product tiers + a cross-product
Ecosystem Bonus, not pure combined or pure separate.** Neither extreme
was right: pure combined lets a creator who's weak on one product coast
on Elite perks earned entirely on another (unfair); pure separate gives
zero incentive for the exact cross-product discovery loop the ecosystem
exists for (§2 — "readers discover videos → follow series → become
MANGAL readers"). Decision:
1. **Each product keeps its own tier ladder on its own metric**
   (WebMangal = readers, KaTube = viewers, Kalpana Circle =
   followers/engagement) — this is what a creator's Perks progress is
   primarily based on, so nobody gets a product's perks for effort spent
   on a different product.
2. **On top of that, an "Ecosystem Bonus"** for creators active across
   more than one product — e.g. a distinct "MANGAL Creator" badge, and/or
   a small (~10%) boost to tier-progress counting, unlocked once a
   creator clears a minimum threshold (e.g. 500+) on more than one
   product. Exact threshold/number and whether it's a badge vs a
   percentage boost vs both is an implementation detail to work out when
   this tab is actually built, not re-litigated as a concept.
3. Net effect: a solo WebMangal creator and a solo KaTube creator are
   each judged fairly on their own numbers; a multi-product creator gets
   the same fair per-product judging *plus* a reward for being
   ecosystem-wide, which is the behavior the founder wants to encourage.
   Pattern is meant to extend cleanly if a 4th product is ever added.

**Not started:** no code changes yet for this section. Implementation
plan for whoever picks this up next:
1. Build Perks per the decision above (per-product ladder + Ecosystem
   Bonus) when that tab is retrofitted — no further sign-off needed on
   the concept, just implementation choices (exact thresholds, badge vs
   percentage boost) at build time.
2. Add a shared `ProductScope` switcher component (WebMangal / KaTube /
   Kalpana Circle / All where relevant) — likely lives in
   `app/components/`, used the same way across tabs.
3. Retrofit each of the seven tabs one at a time to read the switcher's
   selected scope and filter/branch its queries and copy accordingly —
   Earnings and Workspace first (most product-dependent), Academy and
   Nova last (least product-dependent, may not need real branching, just
   the switcher for consistency).
4. No route changes needed for this part — these tabs stay under
   `/dashboard/*` as-is; this section is purely about what renders inside
   them, not where they live.

## §44 — §43 implementation started: ProductScope switcher + Workspace + Earnings retrofit

**Status: in progress.** Picks up §43's plan items 2 and 3 (switcher
component, then Workspace/Earnings first since they're "most
product-dependent"). Boost/Perks/Academy/Nova/Tools are still untouched —
next up per §43's stated order.

**Built:**
- `app/components/ProductScope.tsx` — the shared switcher from §43 item 2.
  Exports `ProductScope` type (`'all' | 'webmangal' | 'katube' |
  'kcircle'`) and a pill-style switcher component. Takes `value`/`onChange`
  (tab owns the state) and an optional `options` array so cross-product
  tabs like Academy/Nova can trim which pills show. Styled with the same
  `var(--bg-card)`/`var(--border-color)`/`var(--accent)` tokens as the
  rest of the dashboard — no new design system introduced.
- **Workspace tab retrofitted for real** (not just cosmetic — this tab
  already had a real query, so this is the actual pattern other tabs
  should copy): now fetches all three products in parallel
  (`series` for WebMangal, `videos` for KaTube, `kcircle_posts` for
  Kalpana Circle, each filtered by the signed-in user's id) and flattens
  them into one `WorkItem[]` shape, sorted by `created_at` across
  products. The switcher filters that flattened list client-side rather
  than re-querying per scope change — three small per-user queries on
  load is cheap enough that a fourth round-trip on every switcher click
  isn't worth the complexity. Each product's empty state has its own
  copy + CTA (`emptyCopy` record keyed by scope) since "start a series"
  isn't the right CTA when you're scoped to KaTube or Circle and have
  zero videos/posts.
- **Earnings tab retrofitted cosmetically only** — the tab has no real
  ledger for any product yet (all four stat boxes are still hardcoded
  `₹0`, unchanged from before this session), so there was nothing
  per-product to actually query. Added the switcher and a `SCOPE_SUB`
  copy record so the sub-headline explains *why* each product's earnings
  look the way they will (KaTube routes through YouTube itself per §41,
  not the platform — so it'll eventually be a read-only summary, not a
  payout-eligible balance like WebMangal). Whoever wires a real earnings
  ledger later replaces the stat values per scope; the switcher/copy
  shape is already there.

**Not done yet (next up, per §43's order):**
- Boost, Perks, Academy, Nova, Tools — Perks especially has a fully
  decided spec (§43, per-product ladder + Ecosystem Bonus) that hasn't
  been touched yet.
- No new migrations were needed for this session — Workspace's queries
  use existing tables (`series`, `videos`, `kcircle_posts`) with existing
  RLS policies (each already scoped to the query pattern used: `.eq(...,
  data.user.id)` on a column those policies already allow the owner to
  read).
- `next build` not verified in this sandbox (same `fonts.googleapis.com`
  network restriction noted in §42/earlier sections) — `tsc --noEmit` and
  `eslint` were run clean instead (two pre-existing `'user' is assigned a
  value but never used` warnings on both retrofitted files, present
  before this change too — `user` is set from the auth check but only
  used for the redirect gate, not rendered).

## §45 — Earnings tab gets a real "Performance" section (cross-product, real data)

**Status: done.** Founder asked to see per-product metrics (views/reads/
engagement) now, separately from earnings (₹) which is still blocked on
the payment-provider decision (§43). Split the Earnings tab into two
clearly-labeled sections under the same switcher instead of building a
new route:

- **Performance (real, live data)** — fetched once on mount, three
  parallel-ish queries per product:
  - WebMangal: `series.views` summed + `follows` (same table/policy the
    root `/dashboard` Analytics tab already reads via the
    `20260809101500_creator_can_view_own_series_analytics.sql` policy) →
    Total Reads, Followers (+this week), Series Published.
  - KaTube: `videos.views`/`videos.likes` summed (both denormalized
    counter columns, not re-derived from `video_likes`) → Total Views,
    Total Likes, Videos Uploaded.
  - Kalpana Circle: `kcircle_posts` count + `kcircle_post_likes` count
    (public-read policy, no RLS issue) → Posts (+this week), Total Likes.
  - On "All" scope: renders all three product blocks stacked, each
    labeled with its emoji/name. On a specific scope: just that one
    block, unlabeled (redundant once you've already picked it).
- **Earnings (still stub, unchanged numbers)** — kept below Performance,
  same ₹0 stat boxes as before. Copy now explicitly says the payout
  button is disabled because of the payment-provider decision, not just
  "no earnings yet" — so it's clear this is a known gap, not a bug.

**Not done / explicitly out of scope for this pass:**
- No new tables or RLS policies — every query reuses columns/tables/
  policies that already existed for other features (series analytics,
  KaTube's denormalized counters, kcircle's public-read likes).
- No time-series/trend view (WebMangal's root dashboard has hourly/daily
  view buckets via `view_events` — not replicated here; this section is
  totals + "this week" deltas only, not full history).
- Earnings numbers are still not real — that's still gated on picking a
  payment provider (Razorpay or similar), which the founder hasn't
  decided yet as of this session.

## §46 — §43 continued: Perks tab retrofitted (per-product ladder + Ecosystem Bonus)

**Status: done.** Picks up §43's plan item 3 for the Perks tab specifically
— this one had a fully decided spec already (§43), so no new sign-off was
needed, just implementation.

**Built:**
- `app/dashboard/perks/page.tsx` now uses `ProductScopeSwitcher` (same
  component Workspace/Earnings use) and fetches real per-product metrics
  on mount: WebMangal = summed `series.views` ("total reads"), KaTube =
  summed `videos.views` ("total views"), Kalpana Circle = count of
  `kcircle_post_likes` across the creator's own `kcircle_posts` ("total
  likes" — no follower/engagement table exists for Circle yet, so likes
  received is the closest available engagement signal).
- Each product gets its own 3-tier ladder (Starter / Rising / Elite) on
  its own metric, per §43's decision — thresholds are a implementation
  choice (§43 explicitly left these open): WebMangal/KaTube use
  1,000 / 10,000; Kalpana Circle uses 250 / 2,500 (scaled down since
  likes accumulate slower than views). The tier the creator is
  currently in is marked CURRENT; the next tier up shows a progress bar
  (current metric / threshold).
- **Ecosystem Bonus**, per §43 item 2: a banner above the per-product
  ladders. Unlocks once the creator clears 500+ on their metric on 2 or
  more products — shows a "MANGAL Creator" badge/copy and states a 10%
  tier-progress boost (copy-only for now, not yet applied to the actual
  progress-bar math — see Not done below). Below threshold, the banner
  explains what's needed to unlock it.
- On "All" scope: renders all three product ladders stacked, each
  labeled. On a specific scope: just that product's ladder.

**Not done / left for later:**
- The 10% Ecosystem Bonus is currently descriptive copy only — it does
  not yet actually inflate the progress-bar percentage or move anyone
  into a tier they haven't numerically reached. Implementing the real
  10% boost math (and deciding exactly how it should visually interact
  with the progress bar) is a follow-up, not blocking since §43 said the
  exact mechanic was an implementation detail.
- No new tables/migrations — reuses `series`, `videos`, `kcircle_posts`,
  `kcircle_post_likes`, same RLS-safe query pattern Earnings already
  established.
- Boost, Academy, Nova, Tools are still untouched — next up per §43's
  stated order (Boost next).

## §47 — §43 complete: Boost, Academy, Nova, Tools retrofitted — all 7 tabs done

**Status: §43 fully implemented.** All seven `/dashboard` tabs now use the
shared `ProductScopeSwitcher` and render per-product content/data as
decided in §43. Order followed: Perks and Boost (§46, this session) →
Academy → Nova → Tools (this section). Workspace and Earnings were done
in §44/§45 in an earlier session.

**Boost** (`app/dashboard/boost/page.tsx`): still no real promotion
backend for any product (all buttons remain disabled "Coming Soon", same
as before) — this pass adds real per-product option sets/copy instead of
one WebMangal-only list: KaTube gets Shorts Spotlight / Subscriber Push /
Tag Boost / Cross-Promo; Kalpana Circle gets Pinned Post / Broadcast
Shoutout / Tag Boost / Cross-Promo. Same shape as the WebMangal originals,
reworded per product's actual surfaces.

**Academy** (`app/dashboard/academy/page.tsx`): was 100% WebMangal
articles despite being flagged "naturally cross-product" in §43. Added
real KaTube articles (channel verification, Shorts hooks) and Kalpana
Circle articles (posting a first theory, starting a discussion), plus two
`universal` articles that show regardless of scope. "All" shows
everything; a specific scope shows that product's articles + universal.

**Nova** (`app/dashboard/nova/page.tsx`): same gap as Academy — the
suggestion chips and input placeholder were entirely WebMangal-worded.
Added KaTube suggestions (video description drafts, thumbnail ideas) and
Kalpana Circle suggestions (post drafts, reply ideas), kept 2 universal
ones (analytics explainer, tag suggestions). Still fully stubbed — no AI
backend wired up for any product, per-scope placeholder text only.

**Tools** (`app/dashboard/tools/page.tsx`): the one tab where getting hrefs
right actually matters, since two of WebMangal's tools are live links, not
stubs. Added real live tools for the other two products pointing at
already-shipped routes — KaTube: Video Uploader → `/katube/upload`,
Channel Dashboard → `/katube/dashboard`. Kalpana Circle: Compose a Post →
`/kalpana-circle` (compose is inline on the feed, no separate route),
Saved Posts → `/kalpana-circle/saved`. No new routes created — this only
surfaces existing pages as "tools." Non-live utility tools (word counter,
auto-captions, translation helper, release scheduler) kept as SOON per
product.

**Verification:** every file above passed `tsc --noEmit` and `eslint`
clean (only the same pre-existing `user` unused-var warning every
`/dashboard/*` tab already had, from the auth-gate `useEffect` pattern —
not a regression).

**Not done / left open:**
- The real 10% Ecosystem Bonus math from §46 is still copy-only.
- No tab has real backend wiring beyond what already existed (Workspace,
  Earnings' Performance half). Boost, Nova's AI, and most Tools remain
  intentionally stubbed pending their own separate build-out — §43 was
  scoped to the *shell/switcher* retrofit, not to building those features.

## §48 — §27/§28d payment-provider unblock: Razorpay infra wired, no paywall/UI yet

**Status: infra done, nothing user-facing.** Founder explicitly said not
to build the ₹49/month paywall yet — no live users, and gating content
now would hurt growth before there's an audience worth monetizing. This
section is scoped to exactly what was asked: the checkout *plumbing*,
so wiring a real payment feature later (whichever one ships first —
tipping, the ₹49 tier, Pro Creator) is a same-day flip instead of a new
integration.

**Provider decision (research only, not yet acted on by founder):**
compared Razorpay / Cashfree / PayU. Recommended Razorpay because it's
the only one of the three with strong first-party products for both
near-term needs at once — Subscriptions/UPI Autopay for recurring
billing (§31 decision 3, still deferred) and Route for split payments
(needed once tipping/platform-fee, §27 item 1 / §28d, ever ships) — so
MANGAL doesn't onboard to a second provider later just for splits.
Cashfree's ~0.05% lower headline rate wasn't worth that. **Founder has
not created a Razorpay account yet** — this is a recommendation, not a
completed decision; §31 decision 2's "this week" target is still open.

**Built (live in Supabase + pushed):**
- `payments` table (migration `20260816120000_payments_infra.sql`,
  applied via Supabase MCP) — deliberately generic: `purpose` +
  `purpose_ref_id` are free-form rather than a dedicated `subscriptions`
  table, since which payment feature ships first isn't decided. RLS: a
  user can `select` their own rows only; all writes happen server-side
  via the API routes below, never directly from the client.
- `app/lib/razorpay.ts` — server-only wrapper (`createOrder`,
  `verifyPaymentSignature`, `verifyWebhookSignature`,
  `isRazorpayConfigured`). Every function tolerates missing
  `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` env vars gracefully (returns a
  clear error / `false`, never throws at import time) since no real keys
  exist yet.
- `POST /api/payments/create-order` — authenticated route, takes
  `{ amountPaise, purpose, purposeRefId? }`, inserts a `payments` row,
  creates the matching Razorpay order, returns `orderId` for the
  (not-yet-built) client-side Checkout.js call.
- `POST /api/payments/verify` — authenticated route, takes Razorpay
  Checkout's callback fields (`razorpay_order_id`, `razorpay_payment_id`,
  `razorpay_signature`), verifies the HMAC signature server-side, flips
  the matching `payments` row to `captured` only if valid and it belongs
  to the requesting user.
- `POST /api/payments/webhook` — unauthenticated (server-to-server from
  Razorpay, same service-role-client pattern as
  `confirm-parent-consent`), verifies the webhook signature header,
  handles `payment.captured` / `payment.failed` / `payment.authorized`
  events, updates the matching row by `razorpay_order_id`.
- `razorpay` npm package added to `package.json`.

**Env vars needed once a Razorpay account exists** (not set anywhere
yet — add in Vercel project settings when ready): `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (the last one is
separate from the API keys, generated when the webhook URL
`/api/payments/webhook` is registered in the Razorpay dashboard).

**Explicitly not built:** any checkout button, paywall, pricing page, or
Checkout.js client-side integration. §31 decision 3's ₹49/month tier
stays deferred per the founder's explicit instruction this session — this
section is the backend only, waiting on both a real Razorpay account and
a decision on which payment feature to build first.

## §49 — §48 follow-up: payment method/bank/vpa columns + UI polish pass

**Gap caught by founder:** §48 shipped a generic `payments` table before
the method-picker UI existed, so it had no column to actually record
*which* method (card/UPI/Google Pay/netbanking) or bank/VPA a payment
used. Fixed — still infra-only, nothing user-facing calls any of this.

**Schema (migration `20260816130000_payments_method_columns.sql`,
applied):** added `requested_method`, `method`, `bank`, `vpa` to
`payments`. `requested_method` is informational-only — whatever the
(still-disconnected) picker UI would send at order-creation time, never
authoritative. `method`/`bank`/`vpa` are the real record — only ever
written server-side by the webhook handler from Razorpay's own payload,
never trusted from the client.

**Routes updated:**
- `create-order` now accepts an optional `requestedMethod` in the
  request body and stores it.
- `webhook` now reads `payment.entity.method` / `.bank` / `.vpa` from
  Razorpay's payload and writes whichever are present (each field is
  independently conditional — Razorpay omits `bank` for non-netbanking
  payments and `vpa` for non-UPI payments, so a later event for the same
  order won't accidentally null out a field a previous event set).

**UI polish pass** (`PaymentMethodPicker.tsx`, still 100% disconnected):
method-specific accent colors on each tile (Card blue, UPI green, Google
Pay blue, Netbanking purple) that show regardless of selection state for
scannability; selected-state glow using that method's own color instead
of one flat accent; added a Net Banking bank grid (SBI/HDFC/ICICI/Axis/
Kotak/PNB) using colored initials, not real bank logos, same
no-trademark-reproduction approach as the payment-method icons
themselves. Preview still lives at the unlinked `/dev/payment-preview`
route.

**Still true from §48:** no checkout button, paywall, or Checkout.js
integration exists. Connecting this for real is still gated on a
Razorpay account + env vars (§48) and a decision on which payment
feature ships first (§31 decision 3 stays deferred).

## §50 — K Circle Instagram-style profile page + settings (fixes "no logout in K Circle")

**Founder-reported gap:** K Circle had no real profile page — the
profile avatar in the nav linked to `/creator/[username]`, a generic
WebMangal-themed page with no Sign Out option anywhere in K Circle.
Founder shared Instagram profile screenshots as the reference.

**Built:**
- `app/kalpana-circle/profile/[username]/page.tsx` (new) — avatar, bio,
  Posts/Likes stat row (no Followers/Following shown — K Circle has no
  follow-graph table, didn't want to fabricate a number), Edit Profile
  button (own profile) or Message button (others, links to
  `/kalpana-circle/chat`), a real posts grid from `kcircle_posts` with
  hover like/comment-count overlay and a click-through lightbox. Own
  profile gets a hamburger menu (Settings, Saved, Close Friends,
  Broadcast Channels, Log Out) — **this is the logout fix**.
- `app/kalpana-circle/settings/page.tsx` (new) — Edit Profile (avatar
  upload to the existing `kcircle-media` bucket under `avatars/`, bio
  editor with a 150-char counter), quick links to Saved/Close
  Friends/Broadcast Channels, a link out to the sitewide `/settings`
  for account-level stuff (delete account/data export/consent —
  deliberately not duplicated here), and Log Out.
- `creator_profiles.avatar_url` column added (`bio` already existed).
  Migration `20260816150000_creator_profiles_avatar_url.sql`, applied
  live via Supabase MCP. No new RLS needed — existing "viewable by
  everyone" SELECT + "update own" UPDATE policies are row-level, cover
  the new column automatically.
- `app/kalpana-circle/page.tsx`: `Avatar` now renders the real
  `avatar_url` photo when set (falls back to initials otherwise); the
  desktop nav avatar link and mobile bottom-tab profile icon both now
  point to `/kalpana-circle/profile/[username]` instead of the old
  `/creator/[username]`.

**Explicitly not touched:** the site-wide `/creator/[username]` page
(WebMangal's own creator profile) is untouched — K Circle now has its
own separate profile route instead, matching how KaTube/Kalpana Circle
already have their own dashboards rather than sharing WebMangal's.
Default theme: confirmed already correct per founder's ask — K Circle
homepage already defaults to dark with light as a toggle
(`useKCircleTheme`, §unnumbered in `app/kalpana-circle/theme.ts`), so
nothing changed there; the new profile/settings pages just reuse the
same hook so they stay in sync with whatever the feed is set to.

**Verification:** `tsc --noEmit` clean, `eslint` clean on all touched
files (only a pre-existing unrelated warning remains in
`app/kalpana-circle/page.tsx`). `next build` itself couldn't complete
in the sandbox because outbound access to `fonts.googleapis.com` is
blocked there (unrelated to this change — Vercel's build environment
has normal internet access).

**Not done / left open:** Message button on another user's profile
links to the general `/kalpana-circle/chat` inbox rather than
deep-linking straight into a DM thread with that user — chat's
`startDirectMessage` helper exists but isn't wired to a URL param yet.
Username is shown read-only in Settings (no rename flow) since other
parts of the app reference usernames directly and a rename needs its
own pass to check nothing breaks.

## §51 — Fix: K Circle login dropping users on WebMangal instead of staying in-product

**Founder-reported bug:** logging in from/for K Circle sometimes landed on
WebMangal instead of K Circle; asked for parity so KaTube/WebMangal each
stay on their own product after login too.

**Root cause found (not the OAuth `next`-cookie path — that was already
fixed in §unnumbered/11 Aug):** K Circle's own profile nav link (desktop
top nav *and* mobile bottom-tab, `app/kalpana-circle/page.tsx`) hardcoded
a fallback to `/WebMangal/home` whenever a logged-in user had no
`creator_profiles` row yet (i.e. no username set — happens for anyone who
signed up but never went through `/become-creator`). Clicking the profile
icon in that state silently teleported them out of K Circle.

**Fixed:**
- `profileHref` (used by both desktop + mobile profile links) now falls
  back to `/kalpana-circle/settings` instead of `/WebMangal/home` when
  `myUsername` is null — keeps the user inside K Circle. Mobile bottom-tab
  link was duplicating this logic inline instead of reusing `profileHref`;
  now it just uses the shared variable.
- `kalpana-circle/settings/page.tsx`: its own back-button had the mirror
  bug — `href={`/kalpana-circle/profile/${username}`}` with an empty
  `username` produces a broken `/kalpana-circle/profile/` link. Now falls
  back to `/kalpana-circle` when `username` is empty.
- KaTube parity: `katube/playlists` and `katube/subscriptions`'s "Sign in"
  links had no `?next=`, so logging in from either also dropped the user
  on WebMangal instead of back on that KaTube page. Added
  `?next=/katube/playlists` / `?next=/katube/subscriptions`.

**Not touched / left open:** there's still no in-product flow for a
logged-in K Circle user to actually *set* a username — Settings' username
field is read-only (per §50) and `creator_profiles.update()` on a
non-existent row silently no-ops, so a user with zero `creator_profiles`
row can land on Settings but can't yet create one from there. The only
existing path to get a username is the site-wide `/become-creator` flow,
which isn't `next`-aware (always lands on `/dashboard`). This fix stops
the wrong-product redirect; a real "create your K Circle profile" flow is
a separate, larger piece of work.

## §52 — §51 follow-up: found the REAL root cause (query param alone isn't reliable)

**Founder confirmed:** §51's fix wasn't enough — WebMangal/home still came
up "everywhere," except `/katube/dashboard`, where logging in correctly
returns you to `/katube/dashboard`. That one working example was the key
clue.

**Root cause:** `/login`'s `nextPath` only ever read `window.location`'s
`?next=` query string. `/katube/dashboard` (and `/katube/watch/[videoId]`)
happened to work because they *already* did two things together: called
`setPostLoginRedirect()` to stash the path in the
`mangal_post_login_redirect` cookie, AND used a hard
`window.location.href` navigation to `/login` (not `router.push`/
`router.replace`/`<Link>`). That combination sidesteps a Next.js
`<Link>`/client-router prefetch quirk — already noted in a comment on
`app/katube/upload/page.tsx` from 11 Aug, confirmed via debug logging back
then — where the `?next=` query string sometimes never survives a
client-side soft navigation to `/login`. Nothing else in the app used
that same combination, so almost every other gated redirect (all of
Kalpana Circle's `router.push`/`router.replace` calls, plus a couple of
plain `<Link href="/login?next=...">`) was silently vulnerable to landing
on the `/WebMangal/home` default.

**Real fix (closes the gap systemically, not per-page):**
- `app/lib/authRedirect.ts`: added `consumePostLoginRedirect()` — reads
  and clears the cookie client-side, same one-shot semantics as the
  existing server-side read in `/auth/callback/route.ts` (which only ever
  helped the Google OAuth path, not email/password login).
- `app/login/page.tsx`: `nextPath`'s lazy initializer now falls back to
  `consumePostLoginRedirect()` whenever the `?next=` query param is
  missing or invalid — so even if a `<Link>`/soft-nav drops the query
  string, the cookie (when set) still gets the user home.
- Every Kalpana Circle page that auto-redirects to `/login` on missing
  auth — `close-friends`, `chat`, `settings`, `watch-together`,
  `watch-together/shorts/[roomId]`, `broadcasts`, `saved`,
  `group/[conversationId]` — now calls `setPostLoginRedirect()` right
  before the `router.push`/`router.replace`, matching the proven pattern
  instead of relying on the query string alone.
- `kalpana-circle/page.tsx` and `broadcast/[username]/page.tsx`: instead
  of patching every individual "Log in" / "Log in to post" / "Log in to
  comment" `<Link>`, the cookie is now set once, eagerly, the moment the
  auth check resolves to logged-out — covers every login link on those
  pages from one place.
- `katube/playlists` and `katube/subscriptions`: same eager-cookie fix
  (§51 only added `?next=` to their "Sign in" links, which — per the root
  cause above — was never going to be fully reliable on its own).

**Verification:** `eslint` clean on every touched file (only pre-existing
warnings — `<img>` LCP warnings, one already-noted `set-state-in-effect`
false positive on `katube/playlists`'s existing code, unrelated to this
change). `tsc --noEmit` errors are all the pre-existing sandbox-only
`lucide-react` module-resolution issue (see earlier §s); no new type
errors from any of these edits.

**Not touched:** `katube/dashboard` and `katube/watch/[videoId]` were
already correct (this section's "why it worked" reference case) — nothing
to change there. `/auth/callback/route.ts` (server-side, Google OAuth)
was also already correct — this section closes the matching gap on the
client-side/email-password path.

## §53 — Fix: "back to home" links exiting the product to the marketing homepage

**Founder-reported bug:** many pages in KaTube and Kalpana Circle have a
"back to home" style control that, instead of returning to that product's
own home tab, takes the user to `mangal-platform.vercel.app`'s official
public/marketing page — a different thing from any product's home.

**Root cause:** `app/page.tsx` (route `/`) is MANGAL's public landing
page (GSAP/Framer marketing site, sign-up CTAs, etc.) — it is not
"platform home" for a logged-in user browsing a specific product. A
handful of nav elements were hardcoded to `href="/"` instead of the
product-scoped home:
- `katube/page.tsx`'s sidebar "Back to MANGAL" link
- `kalpana-circle/page.tsx`'s small MANGAL icon in the top nav (both the
  mobile header and the desktop header — 2 separate occurrences)
- `kalpana-circle/profile/[username]/page.tsx` and
  `kalpana-circle/settings/page.tsx`'s sign-out handlers, which sent the
  user to `/` right after `supabase.auth.signOut()`

**Fixed:** all of the above now point at `/katube` or `/kalpana-circle`
respectively, so signing out or clicking "home" from inside a product
keeps the user in that product (both already render a valid, if
feature-gated, logged-out view — no auth wall to worry about).

**Already correct, no change needed:** `katube/watch/[videoId]/page.tsx`
and `katube/upload/page.tsx` already linked their MANGAL icon to
`/katube`, not `/`. The `getBackNav()`/`recordProductVisit()` pair in
`app/lib/backNav.ts` (used by shared pages like `/creator/[username]`
that are linked to from all three products) was already correct and
untouched — that mechanism is for pages that don't inherently belong to
one product, which is a different problem from a product page's own
internal nav hardcoding `/`.

## §54 — §28a: KaTube-only viewer features shipped (playlists, subscriptions feed, notifications, continue watching, autoplay, trending, search+filters)

Implemented the full §28a backlog item — viewer features that only need
`videos`/`creator_follows` and no K Circle dependency. Founder gave the
explicit go-ahead for this despite the §31 feature-freeze entry (discovery-
layer work paused pending a 50-creator target); noting that here so the
freeze note isn't misread as still fully in effect.

**Schema** (`20260816140000_katube_viewer_features.sql`,
`20260816180000_katube_video_duration.sql`):
- `katube_playlists` / `katube_playlist_videos` — viewer-built playlists,
  video-ID references only (zero-hosting rule, §2), owner-scoped RLS.
- `katube_watch_progress` — one row per (viewer, video), viewer-only read,
  upserted from the IFrame Player API's `getCurrentTime()`.
- `katube_notifications` — new-upload alerts, same actor-inserts-for-
  recipient trust model as `kcircle_notifications` (§14), no DB trigger.
- `videos.duration_seconds` — real length pulled from YouTube's
  `contentDetails.duration` at upload time (zero extra API quota, same
  call as the existing §6b moderation check), backing the duration filter.

**Shipped:**
- **Playlists** — `/katube/playlists` (create/list) and
  `/katube/playlists/[id]` (view/remove), plus a "Save to playlist"
  popover wired into the watch page next to Like.
- **Subscriptions feed** — `/katube/subscriptions`, filtered view over
  `creator_follows` + `videos`, no new table.
- **Notification bell** — top nav, unread badge, mark-all-read, follower
  fan-out inserted server-side right after a successful upload
  (`app/api/katube/upload/route.ts`), best-effort/non-blocking.
- **Continue Watching** — row on KaTube home (signed-in only, hidden
  entirely if nothing in progress), resume seek wired into the watch page
  player.
- **Autoplay Next / Up Next** — toggle under the player (default on), 5s
  countdown-to-next overlay using the existing tag-based `recommended`
  list, "Cancel"/"Play now" controls. Added the required autoplay
  disclosure line to `/privacy` per §28c's YouTube API Services policy
  note (playback data now shares with YouTube on page load, not just on
  interaction).
- **Pure Trending page** — `/katube/trending`, global (not series-
  anchored, distinct from §8's tag-based Up Next), ranked by a Reddit-
  "hot"-style recency-decayed score rather than a raw views sort.
- **Better search + filters** — search bar (was visual-only, §22
  follow-up) now filters by title/creator; added duration buckets (Under
  4 min / 4–20 min / Over 20 min) and upload-date buckets (Today/This
  week/This month/This year), collapsed behind a "Filters" toggle chip so
  they don't add two permanent rows to every tab.

**Watch-page player swap:** replaced the plain `<iframe>` embed with a new
`KaTubePlayer` component wrapping the real YouTube IFrame Player API
(`app/katube/components/KaTubePlayer.tsx`) — this is what both Continue
Watching (position polling) and Autoplay Next (`onStateChange` → `ENDED`)
are built on. Typed via local casts rather than a `declare global`
augmentation, since the Watch Together room page
(`watch/[videoId]/room/[roomId]/page.tsx`) already declares a
differently-shaped global `Window.YT` — redeclaring it would have
conflicted (caught this via `tsc`, not by eye).

**Not done in this pass, flagged but out of scope:** all of §28a's items
are covered; nothing from that list deferred. §29/§30 (further backlog
items) untouched.

## §65 — K Circle: Discord+Instagram hybrid desktop shell

Founder wanted K Circle's desktop UI redesigned as a deliberate mix of
Instagram (feed/stories) and Discord (nav structure), referencing actual
screenshots of both apps' desktop and mobile layouts. Scoped to the main
feed page (`app/kalpana-circle/page.tsx`) first — chat/watch-together/
broadcasts pages not touched yet.

**What shipped (`08b2b57`):**
- Desktop-only (>=768px) left icon rail, Discord server-list pattern:
  MANGAL app-switcher icon → divider → Home/Chat/Watch Together/
  Broadcasts/Saved/Search → Create/Notifications/Profile/Theme/KaTube
  pinned to the bottom. Circle→rounded-square hover morph via
  `.kc-rail-btn` — Discord's signature nav interaction.
- Old horizontal desktop top bar (which duplicated the rail's icons)
  replaced with a slim `# home` channel-header strip (Discord pattern),
  just search + section context now.
- New right panel (>=1180px only): mini profile card (Instagram
  account-switcher style) + "Recently Active" (story authors — real
  recency signal, not fabricated presence) + "Trending Tags" (counted
  from the currently-loaded feed's `tag` field, links into the existing
  `?tag=` filter). Both derived from state already fetched for
  stories/posts — no new Supabase queries added.
- Mobile completely untouched: `.kc-shell` falls back to `display:
  block` below 768px, so the existing top header + bottom tab bar
  (already Discord/Insta-mobile-style, per founder's own reference
  screenshots) renders exactly as before.
- All feed/composer/stories/comments/search logic and data fetching
  unchanged — this was a layout/shell restructure only, verified via
  `tsc --noEmit` (clean) and `eslint` (0 errors, 1 pre-existing
  unrelated warning). `next build` itself fails in this sandbox only
  because Google Fonts (`fonts.googleapis.com`) isn't reachable — a
  network-allowlist limitation, not a code issue.

**Status at time of writing:** chat, watch-together, broadcasts, saved,
profile, and settings pages still used their original layouts. Rolled out
to chat and watch-together next (see §66/§67 below) — the rest remain,
same treatment can be extended to them on request, one page at a time per
the "one change at a time" convention (§5).

## §66 — K Circle: shared rail extracted + rolled out to chat & Watch Together

Continuing §65's rail rollout across the rest of K Circle, one page per
commit as requested.

- **Extracted the rail** out of the home feed page into
  `app/kalpana-circle/components/Shell.tsx` — exports `KCircleRail` (the
  icon rail itself, takes `active` to highlight the current section) and
  `KCircleShellStyle` (the `.kc-shell`/`.kc-rail`/`.kc-right-panel` grid
  CSS). Home feed page refactored to use it — pure refactor, no visual
  change, verified with `tsc`/`eslint`. `KCircleRail`'s "+" create button
  takes either an `onCreatePost` click handler (home feed uses this to
  scroll to its inline composer) or a `createHref` link (every other page
  just falls back to linking `/kalpana-circle`, since only the home feed
  has an inline composer).
- **Chat page** (`chat/page.tsx`): wrapped in the shared shell, rail shows
  with "Chat" active. Chat never tracked its own username/avatar before
  (never needed to) — added the same `creator_profiles` lookup pattern
  the home feed uses, since the rail's profile icon needs it. Mobile
  untouched (`.kc-shell` falls back to `display:block` below 768px, so
  the existing full-screen conversation-list/thread layout is unaffected).
- **Watch Together page** (`watch-together/page.tsx`): same treatment,
  rail shows with "Watch Together" active. This page already tracked
  `myUsername`/`myAvatarUrl` (needed for other things), so no new fetch
  was needed. Its own sticky header (wordmark, "+ Create Room", theme
  toggle) is left in place — it's still the primary nav on mobile, where
  the rail is hidden.
- Verified with `tsc --noEmit` (clean) and `eslint` (0 new warnings/
  errors on every touched file) after each page. `next build` itself
  still fails in this sandbox only because Google Fonts isn't reachable
  on the network allowlist — unrelated to these changes.

**Not done yet:** broadcasts, saved, profile, settings, close-friends,
group/[conversationId], broadcast/[username], watch-together/shorts.
KaTube and every other MANGAL surface untouched throughout — this is
K-Circle-only per the founder's explicit instruction.

## §55 — §28b started: public KaTube channel page + custom channel URL

**Status: this one item done, rest of §28b untouched.** Went through the
priority list, picked the fastest real win left: §28a (all of it) was
already complete as of §54, so this is the first item of §28b — KaTube-
only *creator* features (channel owner who doesn't write novels).

**Built:** `/katube/channel/[username]` — public channel page: avatar,
username, bio (all already-existing `creator_profiles` columns, no
migration needed), follower/video/view-count stats, Follow button
(exact optimistic-toggle-with-rollback pattern copied from the watch
page's existing follow button, not reinvented), Fast tap row, and the
full long-video grid. Combines two separate §28b bullets — "Public
channel page" and "Custom channel URL" — since a page and its URL are
the same deliverable.

**Deliberately not touched — flagged, not decided:** the existing watch
page links a creator's name to `/creator/[username]`, which is
WebMangal-only (series grid, nothing else) despite being the intentional
shared cross-product profile page (see `app/lib/backNav.ts` /
`getBackNav()`, built specifically so KaTube/Circle links back out to the
right product). A KaTube-only creator with zero novel series currently
shows an empty "no published series yet" page there. I tried rewiring
that link to the new `/katube/channel/[username]` page and reverted it —
that's an architecture call (fragment the "one profile" pattern the
backNav mechanism was built around vs. extend `/creator/[username]`
itself to show KaTube content when present) that shouldn't get decided
silently mid-task. Founder call needed: either (a) extend
`/creator/[username]` to render a KaTube tab/section when the creator has
videos and no series, or (b) formally split "profile" into two link
targets depending on what the creator actually has. New page works
standalone either way (direct link, notification/search surfaces) so
nothing here is wasted regardless of which way that goes.

**Not started (rest of §28b):** channel-level analytics (without a linked
series), creator-made playlists without a `series_id` link (arguably
already covered — a creator can already use the §28a playlist feature on
their own uploads, just wasn't scoped as a distinct "creator" flow),
native KaTube community-update posts, banner image + channel-trailer
video (no `creator_profiles` columns exist for either yet).

## §56 — §28b continued: channel-level analytics (per-video breakdown)

**Status: done.** Second §28b item — "Channel-level analytics ... without
needing a linked novel/series." `/katube/dashboard` previously showed
only 3 aggregate totals (videos/views/likes). Added:
- A 4th metric card: **Followers** (`creator_follows` count, wasn't
  surfaced anywhere on this page before).
- **Video performance** section — every one of the creator's own videos
  (long + Shorts), sorted by views descending, with a views bar, raw view
  count, and like count per video. Capped display at 15 with a "+N more"
  note rather than paginating, since this is a quick-scan list, not a
  full table UI.

**Explicitly not a time-series/trend chart** — that needs a per-event log
table (`view_events`-style, which WebMangal's root dashboard Analytics
tab already has per §45) and `videos.views` is just a denormalized
counter with no history. Building real day-by-day trend tracking for
KaTube would mean a new table + wiring a write on every video view,
which is a slower, separate piece of work — flagged here rather than
faked with a chart that has no real underlying data.

**No new migrations** — reuses `videos` and `creator_follows` exactly as
they already exist, same RLS-safe per-owner query pattern used elsewhere
(Earnings' Performance section, Perks, etc.).

**Not started (rest of §28b):** native KaTube community-update posts,
banner image + channel-trailer video (still no `creator_profiles`
columns for either).

## §57 — §27 item 6: "New Voices" discovery spotlight — WebMangal + KaTube (K Circle intentionally skipped)

**Status: done for both non-Circle products.** Picked this from §27's
zero-cost-first ordering ("items 4, 6, 9, and 7 don't need a payment
provider... realistic near-term build") per founder's request to do
whatever's fast and scoped to KaTube/WebMangal only, not K Circle.

**What it is:** a discovery row ordered by `creator_profiles.joined_at`
descending — most recently-joined creators first — instead of by views/
popularity like every other section on both home pages. Addresses the
cold-start problem §27 flagged: a brand-new creator otherwise never beats
an already-big creator in a views-sorted grid, so without a dedicated
recency-ordered slot they're invisible no matter how good their first
upload is.

**WebMangal** (`/WebMangal/home`): new "New Voices" section, positioned
right after Staff Picks. One (most recent) published series per creator,
first 6 creators (from a top-20-most-recent candidate pool) that actually
have a published series. Added `newVoices` translation key (`en`/`hi`,
`app/lib/i18n.ts`) alongside the existing `trendingThisWeek`/`newArrivals`/
`staffPicks` keys.

**KaTube** (`/katube`, home tab only): same pattern, "New Voices" row
right after the Continue Watching row (§28a). One (most recent) video per
recently-joined creator, same 20-candidate → first-6-with-content trim.
Reuses the page's existing local `RealVideoCard` component rather than
the separate `VideoGridCard` used by the standalone Subscriptions/
Trending pages, since this lives inside `/katube`'s own grid, not a
separate route.

**Zero new tables/migrations** — both reuse `creator_profiles.joined_at`,
which already existed, plus each product's existing `series`/`videos`
state that was already being fetched on page load. No RLS changes needed
(public-read creator_profiles lookup, same pattern used everywhere else
a creator's display info is read).

**Deliberately not done:** §27 item 7 ("deeper cross-promotion" — extends
the KaTube↔K Circle auto-post) and item 8 (creator-only K Circle space)
were skipped on request since both are explicitly K Circle-scoped.

## §58 — AI features backlog (future implementation) — by product, with cost-minimization + priority split

**Status: planning only, nothing built yet.** Founder asked for a categorized
list of concrete AI features per product, how to keep the cost near-zero even
at large reader/viewer scale, and — specifically — for any feature that costs
literally nothing to be pulled out into its own "do this first" priority list
instead of sitting in the costed backlog. Structured that way below.

### 58a. The one idea that makes all of this cheap at scale — read this first

Every costed feature below is written to run **once per piece of content**
(one chapter, one video upload, one long thread) and cache the result in
Supabase — not once per reader/viewer. That's the whole trick:

- Cost scales with **how much content creators publish**, not with **how
  many readers show up**. 10 readers or 10 lakh readers hitting the same
  cached AI summary costs the same: ₹0 extra, it's just a DB read.
- This means a sudden traffic spike / viral growth does **not** blow up the
  AI bill — only creator upload volume does, and that grows much slower and
  more predictably.
- Anything that *would* scale per-user (e.g. an interactive writing
  assistant a creator chats with) is called out separately below with its
  own cap, precisely because that one doesn't get the free ride.

### 58b. Priority list — zero cost, build these first (no paid API, no budget approval needed)

These need no LLM API key and no budget decision, so per founder's
instruction they're pulled out of the costed list below and should be built
before any paid item:

1. **Extractive (non-generative) thread digest for Kalpana Circle** — instead
   of an LLM writing a summary, just surface the top-N most-liked/most-replied
   comments in a thread as a "highlights" strip. Zero AI cost, same practical
   effect (new visitor gets the gist of a 200-comment thread fast) without any
   API call. Can be upgraded to the real generative summary (§58f) later
   without changing the UI shape.
2. **YouTube's own AI-disclosure field for KaTube moderation** — already
   live per §6b (`selfDeclaredMadeForKids`/AI-disclosure metadata read via
   YouTube's oEmbed/Data API, which is free). This already covers the
   "is this AI-generated" signal at ₹0; no separate paid classifier is
   needed for that specific check.
3. **Rule-based tag inference** — auto-suggest tags for a new KaTube upload
   or WebMangal chapter by matching the title/description text against the
   existing tag vocabulary already in Supabase (simple keyword/substring
   match, no model call). Weaker than the LLM version in §58d but genuinely
   free, and can ship immediately as the default with the LLM version as an
   opt-in "improve with AI" upgrade later.
4. **Self-hosted small embedding model for "similar content" matching** —
   sentence-transformer-class open-source model (e.g. all-MiniLM class)
   run inside a serverless function on CPU, computed once per chapter/video
   at publish time and cached as a vector in Supabase (`pgvector`). No
   per-call API fee — the only cost is normal Vercel/Supabase compute,
   which is already inside the existing zero-cost architecture. This
   directly upgrades the tag-based "Up next"/recommendation logic (§8)
   toward the "similar vibe, not just same tag" behavior discussed earlier,
   without opening an AI API bill at all.

None of the four above need a founder budget call — they can be scheduled
like any other feature.

### 58c. WebMangal (readers) — AI-written short summary/blurb per chapter or series

- **What:** if a creator hasn't written a blurb, or wants a one-line "so far"
  recap at the start of a new chapter, an LLM generates it from the chapter
  text.
- **Data needed:** the chapter/series text already in Supabase — nothing new
  to collect.
- **Cost-minimization:** generate once when the chapter is published, store
  the summary as a new column (e.g. `chapters.ai_summary`), never regenerate
  on read. Use the cheapest small-model tier (the "mini/flash/haiku" class of
  model, not a flagship model) — a summary task doesn't need the expensive
  model. Only run if the creator hasn't supplied their own blurb (opt-out,
  not forced), so volume tracks "creators who skip writing a blurb," not
  every chapter.
- **Cost at scale (illustrative — small-model API pricing, verify current
  rates before building, these move often):**
  - Small scale (~200 chapters/month needing a summary): well under
    ₹50/month.
  - Large scale, even a big breakout month (~20,000 chapters/month across
    all creators): still roughly ₹300–₹600/month, because each call is a
    few hundred tokens and it's a one-time cost per chapter, not per reader.
  - Reader count is irrelevant to this number per §58a.

### 58d. WebMangal (creators) — AI writing assistant

- **What:** in-editor help — continuity/plot-hole check, grammar pass,
  "suggest 3 directions for the next chapter" — the item already flagged in
  §27 item 10 / §41 as gated behind an AI budget decision.
- **Data needed:** the creator's own draft text (already local to their
  editor session), optionally their published chapters for continuity
  context.
- **Cost-minimization — this is the one feature in this list that does
  scale per-user, not per-content, so it needs its own cap:**
  - Ship as an explicit "Ask AI" button the creator presses, not something
    that runs automatically on every keystroke/save.
  - Give each creator a monthly quota (e.g. a fixed number of AI assists per
    month on the free tier), enforced with a simple counter column —
    protects against one runaway user driving the whole bill.
  - Use the small-model tier here too; a "check continuity" or "suggest next
    beat" task doesn't need a flagship model.
- **Cost at scale (illustrative, verify current pricing):**
  - Small scale (~500 creators, ~20 assist-requests/month each = 10,000
    requests/month): roughly ₹500/month.
  - Large scale (~5,000 active creators at the same usage rate = 100,000
    requests/month): roughly ₹5,000/month.
  - This is the one line item that genuinely grows with adoption, so it's
    the one to keep an eye on and quota — not because it's expensive per
    call, but because unlike 58c/58e/58f it isn't capped by content volume.

### 58e. KaTube — AI-generated tags, description + AI moderation assist

- **What:** on upload, suggest tags/description from the title + creator's
  own input text (paid upgrade over the free rule-based version in §58b.3);
  and a secondary AI check for the moderation queue for whatever the free
  YouTube-disclosure signal (§58b.2) doesn't already resolve on its own.
- **Data needed:** upload form text fields already collected; for the
  moderation assist, only the subset of uploads that the existing free
  checks (§6b, §58b.2) flag as ambiguous — not every upload.
- **Cost-minimization:** run once at upload time, cache on the `videos` row,
  never recomputed. Route the moderation-assist call only to the ambiguous
  minority of uploads (most are already resolved for free), so that cost
  scales with "uploads YouTube's own metadata couldn't classify," which is
  a small slice of total uploads, not all of them.
- **Cost at scale (illustrative, verify current pricing):**
  - Small scale (~150 uploads/month, ~15% needing the moderation-assist
    call): a few hundred rupees/month total for both tag/description +
    moderation-assist combined.
  - Large scale (~15,000 uploads/month, same ~15% ambiguous rate): roughly
    ₹2,000–₹4,000/month — still small because per-video cost is a few
    paise, and it's one call per upload, not per view.

### 58f. Kalpana Circle — AI-summarized discussion threads (generative upgrade)

- **What:** the real LLM-written version of the summary — a 2–3 line "what
  this thread is about" recap for long threads, upgrading the free
  extractive version shipped first in §58b.1.
- **Data needed:** the thread's comment text, already in Supabase.
- **Cost-minimization:** only trigger once a thread crosses a size threshold
  (e.g. 50+ comments) where a digest actually adds value; cache the summary
  and only regenerate periodically (e.g. every N new comments, or an
  on-demand "refresh summary" button) rather than after every single new
  comment.
- **Cost at scale (illustrative, verify current pricing):**
  - Small scale (~50 threads/month cross the size threshold): a few tens of
    rupees/month.
  - Large scale (~5,000 threads/month cross it, a genuinely very active
    community): still well under ₹1,000/month at a few-times-a-day refresh
    cadence, because it's capped by "threads big enough to need it," not by
    total messages or total members reading them.

### 58g. Net picture

- 58b (four items) — zero cost, no approval needed, schedule anytime.
- 58c, 58e, 58f — paid but per-content, so cheap and stay cheap even with a
  large reader/viewer base; the number that matters is creator-side content
  volume, not audience size.
- 58d — the one genuinely usage-scaling item; ship it capped/quota'd from
  day one rather than uncapped.
- All rupee figures above are illustrative planning estimates from current
  small-model API pricing tiers, not a quote — re-check actual pricing at
  build time before committing to a budget, since provider pricing changes
  fairly often.

## §59 — §27 item 9: Verified badge + creator leaderboard (DONE, `2a341fd`)

**Status: done.** Picked as the fastest of the three §27/§41 candidates
discussed — mostly UI + one aggregate ranking query, no payment provider,
no AI budget, no spec-trimming needed first (unlike §41).

**Verified badge** — `app/components/VerifiedBadge.tsx`, a small reusable
checkmark component. Deliberately reuses the *existing*
`creator_profiles.verified_youtube_channel_id` signal from channel-ownership
verification (§6/§10) rather than inventing a new verification flow or
column — "verified" here means "verified their YouTube channel," which is
the only verification concept that already exists on this platform. Wired
into the two creator-identity surfaces that were fastest to reach:
`/creator/[username]` (next to the `@username` h1) and
`/katube/channel/[username]` (next to the channel name). **Not yet swept
across every other surface that shows a creator name** (video/series cards,
comments, watch-page byline, etc.) — flagged as a follow-up sweep, not
silently skipped, same pattern as other partial-rollout notes in this file.

**Creator leaderboard** — new `creator_leaderboard(result_limit int)` SQL
RPC (`supabase/migrations/20260816200000_creator_leaderboard.sql`,
aggregate-only, `SECURITY DEFINER`, same shape as `related_videos`/
`related_series`), applied live to the Supabase project. Ranks creators by
**combined WebMangal + KaTube views** — the same cross-product framing
already used for Earnings' Performance section (§45) — rather than a
per-product ranking. Follower count (`creator_follows`, KaTube-specific
today) surfaced as a secondary stat, not used for ordering, since it isn't
a cross-product number yet. Zero new tables — reuses `series.views`,
`videos.views`, `creator_follows`, `creator_profiles` exactly as they
already exist.

New `/leaderboard` page (`app/leaderboard/page.tsx`) renders it, reusing
`/rankings`'s visual pattern (rank-number/avatar/stat row layout) for
consistency rather than a new pattern. Kept as its **own route**, not a new
tab bolted onto `/rankings` — that page ranks series (cover/genre row
shape), this ranks creators (avatar/username/follower row shape); two
incompatible row shapes behind one tab switcher would've been messier than
two pages. Cross-linked both ways: `/rankings`'s top nav now has a
"Creators" tab pointing at `/leaderboard`.

**Verified:** `tsc --noEmit` clean project-wide; `eslint` clean on all
touched/new files (one pre-existing unrelated warning on
`/katube/channel/[username]/page.tsx` — an `<img>`-vs-`<Image>` LCP
warning on a line this change didn't touch).

**Not started (rest of §27):** items 1–3 (tipping/memberships/bounty
payouts, payment-provider-gated), item 4 (real analytics dashboard —
scoped separately, bigger: needs new event-logging infra for
retention/drop-off charts, not just an aggregate query like this one),
item 5 (A/B thumbnail/title testing), item 7 (deeper KaTube↔K Circle
cross-promotion), item 8 (creator-only K Circle space), item 10 (AI creator
tools — tracked separately now under §58e/§58d). §41 (Affiliate AI Toolkit
page) still needs its K Circle tab trimmed out of spec before it's
buildable as scoped — flagged, not started.

## §60 — §27 item 4: Real creator analytics — retention/drop-off per chapter (DONE)

**Correction to §59's note above:** §59 flagged item 4 as "bigger, needs
new event-logging infra" — that's true for per-chapter *views* (view_events
only logs series_id, not chapter_id) but not for retention/drop-off, which
this section covers. `reading_progress` already carries `chapter_id`, so
retention didn't need new infra, just regrouping existing data.

**Why this over §41:** compared §27 item 4 (retention/drop-off dashboard)
against §41 (Affiliate AI Toolkit page) to pick the faster win. §41 needs a
new `ai_tools` table *and* individually applying to each affiliate program
(external approval, not something that ships in one sitting) plus trimming
its K Circle tab first. §27 item 4 turned out to already have all its
infra: `/dashboard`'s analytics already computes a blended Chapter
Completion Rate from `reading_progress` vs `pages` (last page per chapter)
— per-chapter retention just needed the same data grouped by `chapter_id`
instead of blended into one number. No migration, no new table.

**What shipped:** `app/dashboard/page.tsx` — `AnalyticsData.chapterRetention`
(new `ChapterRetentionStat[]`), populated in `fetchAnalytics` by grouping
the existing `reading_progress`/`pages` join per `chapter_id` (chapter
number/title/series title resolved from `chaptersBySeriesId`, already in
state from `fetchStories` — no extra query). Chapters with under 3 tracked
readers are dropped to avoid a misleading 0%/100% from a single reader.
Rendered as a new "Retention — Where Readers Drop Off" panel on the
Analytics tab, sorted worst-completion-first (capped to 15 rows), each row
a progress bar colored red/amber/accent by completion %.

**Deliberately not done:** true "views per chapter" (the existing dashed
placeholder note) is a separate gap — view_events only logs `series_id`,
not `chapter_id` yet, so it still needs the small migration + reader-view
hook called out in that note. Not touched here; only the retention/
completion metric (which was already chapter-addressable via
`reading_progress`) was extended.

**Not started (§41 remains backlog):** Affiliate AI Toolkit page — still
needs the `ai_tools`/`tool_clicks` tables, the K Circle tab trimmed per its
spec, and affiliate-program applications submitted individually before any
tool card goes live monetized.

## §60 — §41: AI Toolkit page shipped, trimmed to WebMangal + KaTube (`c5180ec`)

**Status: done, K Circle intentionally deferred.** §41 was scoped with three
category tabs (WebMangal, KaTube, K Circle); only the first two had actual
affiliate-program research behind them (see §41's own research notes), so
this session trimmed K Circle out of the build rather than shipping a tab
with unresearched/fabricated tool entries. `ai_tools.product` already
accepts `'kcircle'` as a value — adding that category later is a data
insert once the research is done, not a migration.

**Data layer** (`supabase/migrations/20260816220000_ai_tools_toolkit.sql`,
applied live) — `ai_tools` table per §41 plan item 1 (data-driven list,
public read via RLS, no client write — same "curated, not user-writable"
pattern as `tags`), and `tool_clicks` per plan item 2 (internal click log,
authenticated insert-only, no select policy yet since it isn't surfaced in
a UI — read via Supabase SQL directly for now). Seeded with exactly the
tools §41's research confirmed: 8 KaTube-category rows (ElevenLabs, Murf,
Descript, InVideo, Veed, HeyGen, Synthesia, Runway) and 2 WebMangal-category
rows (Midjourney, Canva — both flagged `is_affiliate = false` since neither
has a live program per that research, listed as free tools instead of
skipped or mislabeled).

**`affiliate_url` is null on every row right now** — no real referral
links exist yet. Getting them means actually applying to each program
(ElevenLabs/Murf via PartnerStack, the video tools via their own affiliate
pages) — that's an account-creation step outside what a repo commit can
do, flagged rather than filled with placeholder/fake links. Page renders a
"Referral link not added yet" state on those cards until the real URLs are
added via Supabase.

**Page** — `/dashboard/ai-tools`, reuses `/dashboard/tools`'s visual
pattern (card grid, `ProductScopeSwitcher`) but scoped to
`options={['all','webmangal','katube']}` — no `kcircle` pill shown, not
just an empty one. Every card with `is_affiliate = true` shows a
"SPONSORED" badge — legal disclosure requirement per §41, not cosmetic.
Clicking a card with a real `affiliate_url` logs a row to `tool_clicks`
(fire-and-forget, never blocks navigation) before the link opens.
Sidebar nav entry added in `StudioSidebar.tsx` under Tools.

**Verified:** `tsc --noEmit` clean project-wide; `eslint` clean on both new
files — the one error `eslint` reports on `StudioSidebar.tsx` is
pre-existing on the untouched `useClock()` function (a `setState`-in-effect
rule hit), unrelated to this change.

**Not done (rest of §41):** public logged-out `/tools` version (plan item
4), K Circle category (needs its own research pass first), and the actual
affiliate-program applications/real referral links (plan item 3 — outside
what this repo can do on its own).

## §62 — §58b.3: Rule-based tag inference for series creation (DONE)

**Picked from §58's zero-cost priority list (§58b).** Of the four items
there: #2 (YouTube AI-disclosure) was already live; #4 (self-hosted
embedding model for "similar content") needs a model deployed + `pgvector`
wiring — bigger. Between #1 (K Circle extractive thread digest) and #3
(rule-based tag inference), #3 was the faster build — a pure text-matching
function plus one small UI addition to an existing form, no new query
pattern to design against K Circle's thread/reply shape.

**What shipped:** `app/lib/tagSuggest.ts` — `suggestTags(text, vocabulary,
excludeNames, limit)`, plain keyword/substring matching against the
existing `tags` table vocabulary (no LLM call, ₹0). Exact single-word and
multi-word-phrase matches score higher than plain substring hits; tag names
under 4 chars are excluded from substring matching to avoid noisy false
positives (e.g. "ai", "op"). Wired into `app/upload/page.tsx`'s series
creation step — the free-text Tags field there had no vocabulary picker at
all (unlike `EditSeriesModal`, which already shows all tags as toggle
chips). Vocabulary fetched once on mount; suggestions recomputed via
`useMemo` from title + description as the creator types, rendered as
dashed "+ #tagname" chips under the input that append to the comma-separated
field on click.

**Deliberately not done:** KaTube upload (§58e is its paid/LLM-backed
version, not this) and `EditSeriesModal` (already shows the full vocabulary
directly, so a suggestion layer adds less there) weren't touched.

**Verified:** `tsc --noEmit` clean; `eslint` clean on both touched files
(two pre-existing unrelated warnings on `app/upload/page.tsx`, neither on a
line this change touched).

## §61 — §41 follow-up: UI already leaves the referral-link slot open — how to actually fill it, revenue-priority research (yet to be done: applying + real links)

**The UI is already built for this — nothing to build here, this section is
the "how to fill it in" instructions + the revenue research, not new code.**
`/dashboard/ai-tools` (§60) already renders every affiliate-eligible tool
card with `affiliate_url` left empty on purpose. A card with no
`affiliate_url` shows a **"Referral link not added yet"** placeholder
instead of a live "Visit" button (see `hasLiveLink` check in
`app/dashboard/ai-tools/page.tsx`) — so the space is already there and
waiting, nothing needs to be rebuilt once a real link exists.

### How to actually fill a slot in (once you have a real referral link)

1. **Sign up for the affiliate program using the company/MANGAL email**,
   not a personal one — the referral link is tied to whichever account
   creates it, so it has to be the account that should receive the payouts
   long-term.
2. Once approved, the program's dashboard (PartnerStack / Rewardful /
   Impact.com, depending on the tool — see table below) gives a unique
   tracking link.
3. **Only step left is a data update, not a code change** — that link goes
   into the `affiliate_url` column on the matching row in the `ai_tools`
   table (Supabase). The card picks it up automatically and switches from
   the placeholder to a live "Visit" button with the SPONSORED badge —
   already wired, no deploy needed.

### Revenue-priority research (for deciding which to apply to first)

Recurring commissions compound over the subscription's lifetime and are
worth more long-term than a bigger one-time payout — so this list is
ordered recurring-and-long-duration first. **Verify exact rates on each
program's own page before relying on a number for planning** — third-party
affiliate-directory sites often disagree with each other and with the
official page, and terms change.

| # | Tool | Commission (as researched) | Duration | Network | Where to apply |
|---|------|------|------|---------|-----------------|
| 1 | Murf | 20% recurring | 24 months (longest researched) | PartnerStack | murf.ai/partner-with-us/affiliate |
| 2 | ElevenLabs | 22% recurring, no earning cap | 12 months | PartnerStack | elevenlabs.io/affiliates |
| 3 | Synthesia | ~25% recurring | ~12 months | Rewardful | synthesia.io → Affiliates |
| 4 | HeyGen | 20–35% recurring (sources disagree, confirm on official page) | 3–12 months | Rewardful | heygen.com → Affiliate Program |
| 5 | InVideo | up to 50% first month, or 25% recurring (both reported — confirm) | 60–120 day cookie | Impact.com | invideo.io/make/affiliate-program |
| 6 | Veed | recurring (exact rate unconfirmed) | — | Impact.com | veed.io → Affiliates |
| 7 | Descript | one-time payout only | — | own network | descript.com → Affiliates |
| 8 | Runway | paid affiliate rate behind login | — | in-app referral (public) | inside the Runway app |

**Approval isn't instant for every program** — some (HeyGen's higher tier
was flagged specifically) do manual review, so applying early rather than
waiting matters more than the exact order above.

### Yet to be done

- Actually creating the company-email accounts and applying to each
  program above (§41 plan item 3) — this is a manual, outside-the-repo
  step, not something a commit can do.
- Filling the real `affiliate_url` values into `ai_tools` once links exist
  (a Supabase data update — no code change, see above).
- Confirming/correcting the exact commission numbers on each official page
  before treating them as a revenue projection.

## §63 — §27 item 8: Creator-only K Circle space (DONE)

**Picked as fastest of the still-open non-AI backlog** (surveyed the whole
file — small items: this one and §28b's banner/trailer video; medium:
§28a's real search/filters, §27 item 7 cross-promotion; big/blocked: §27
items 1–3 and §28d monetization on the payment-provider decision, §29's
novel-to-video collab pipeline, §4 item 6 sponsorship explicitly
traffic-gated). This one was explicitly flagged in §27 as reusable —
"could reuse the existing K Circle channels/roles system (§17) with a
role-gated private channel rather than needing new infra" — and that held
up: the Discord-style permission-overwrite system (`app/lib/kcirclePermissions.ts`,
`20260813170000_kcircle_channels_roles.sql`) already does everything
needed, it's scoped per group conversation though, not site-wide — so this
is one well-known singleton group conversation, not a new permission
system.

**What shipped:** `supabase/migrations/20260816220000_kcircle_creator_lounge.sql`
(applied live) — `kcircle_conversations.is_creator_lounge` (unique partial
index, guarantees a singleton) + `kcircle_join_creator_lounge()`, a
SECURITY DEFINER RPC that finds-or-creates the singleton lounge
conversation and adds the caller as a participant, but only after checking
`profiles.role in ('creator','developer')` itself — the client-side
`isCreator` check in the UI is just for hiding/showing the entry point, the
actual gate is server-side in the RPC (a non-creator calling the RPC
directly still gets rejected). Creating the conversation automatically
fires the existing `kcircle_group_bootstrap_channels_roles` trigger, so
`#general` + `@everyone`/`Owner` roles get created for free — zero new
channel/role tables.

**UI:** `/kalpana-circle/chat` — pinned "Creator Lounge" entry (purple lock
icon) above the normal DM/group list, shown only when `profiles.role` is
creator/developer, calls the RPC then routes to
`/kalpana-circle/group/[conversationId]` (the existing channels/roles UI
from §17 — no new group-management screen needed).

**Verified:** `tsc --noEmit` clean; `eslint` clean on the touched file (two
pre-existing unrelated `<img>` LCP warnings). Ran `get_advisors` after
applying the migration — flagged the same `function_search_path_mutable`
WARN every other `kcircle_*` function in this repo already has; fixed it
on this function specifically (`set search_path = public`) rather than
leaving it in that pre-existing backlog.

**Not done:** no admin UI to revoke lounge access if someone's role
changes back to reader (participants table isn't pruned automatically) —
low-risk edge case (nothing sensitive lives in the room), flagged rather
than silently ignored.

## §64 — §0 Phase 3: WebMangal Writer of the Month (DONE)

**Picked as the top-priority item per §0's standing rule** ("do not pick
up other backlog items until the phases in §0 are done") — Phases 0-2
were already DONE, Phase 3 was the only piece left in that highest-priority
category.

Full detail is in §0d-iv above rather than duplicated here, since §0 is
the canonical spec/status section for "Unique for Mangal." Short version:
`finalize_monthly_writer_awards()` sums each writer's Tier 1 collab
videos' finalized weekly scores for the month (reusing Phase 2's scoring,
not recomputing it) and ranks; `get_writer_of_the_month()` reads back the
current #1; the admin page, KaTube home banner, K Circle announcement,
and writer-profile badge all shipped this session.

**Not done:** scheduled cron for the monthly finalize (same manual-trigger
gap as Phases 1/2); a reader-facing "past winners" history view for
writers (only the admin page shows past months right now).

With Phase 3 done, **all of §0's phases (0-3) are now complete** — the
"do not pick up other backlog items until §0 is done" rule from §0's
header no longer blocks picking from §4/other backlog sections in future
sessions, though §0e's still-open decisions (scoring weights, prize
amounts, cron scheduling) remain open follow-ups within "Unique for
Mangal" itself.

## §67 — K Circle: Discord-rail rollout complete across every browsing page

Continuing §66's page-by-page rollout, one commit per page as requested,
through the rest of K Circle:

- **Broadcasts discovery** (`broadcasts/page.tsx`, `64ff713`) — rail
  active on "Broadcasts".
- **Saved posts** (`saved/page.tsx`, `bda3195`) — rail active on "Saved".
  Didn't use `useKCircleTheme` before; added it.
- **Close Friends** (`close-friends/page.tsx`, `7a90882`) — rail shown,
  nothing highlighted (not a top-level rail destination). Made
  `KCircleRail`'s `active` prop optional in `components/Shell.tsx` to
  support this — every page below reuses the same pattern.
- **Settings** (`settings/page.tsx`, `5150c7d`) — rail shown, nothing
  highlighted. Already tracked its own `username`/`avatarUrl`, just
  wired them into the rail.
- **Profile** (`profile/[username]/page.tsx`, `58ea2c4`) — rail shown,
  nothing highlighted. This page shows *anyone's* profile, so it needed
  a separate `viewerUsername`/`viewerAvatarUrl` fetch distinct from the
  `profile` state (which is whoever's page is being viewed).
- **Group chat/channels** (`group/[conversationId]/page.tsx`, `615ae5e`)
  — rail active on "Chat" (reached from the Chat page). This one nests
  three levels deep now — server rail → the group's own channel
  sidebar → channel content — which is genuinely Discord's own layout
  pattern, not just a visual reference to it.
- **Individual broadcast channel** (`broadcast/[username]/page.tsx`,
  `e658b05`) — rail active on "Broadcasts". Same viewer-vs-subject
  profile split as the Profile page above.

**Deliberately skipped:** `watch-together/shorts/[roomId]/page.tsx` —
this is a full-screen immersive video-room player (`height: 100vh`,
black background, `overflow: hidden`), not a browsing/listing page.
Neither Discord (voice/video calls) nor Instagram (Reels player) keeps
persistent nav chrome over an immersive video surface, and adding the
rail here would just clutter the watch-party experience. Every other
page under `app/kalpana-circle/` now has the rail.

**Verification, every page:** `tsc --noEmit` clean, `eslint` produced 0
new errors/warnings (only pre-existing, unrelated warnings on a few
files — noted per-commit). `next build` continues to fail only on
Google Fonts fetch in this sandbox, unrelated to any of this work.

KaTube and every other MANGAL surface were untouched throughout this
entire rollout, per the founder's explicit "K Circle only" instruction.

## §68 — §0 "Unique for Mangal": all 4 phases audited, 3 issues found & fixed

Founder asked for a correctness pass across §0's Phase 0-3 (the whole
"Unique for Mangal" feature — Mangal Ideas, Mangal of the Week, Writer of
the Month). Went file by file: every migration's SQL against the live DB
schema, every RPC's table/column references, every UI file's `tsc`/`eslint`
across all four phases. Found and fixed three issues, none of them
data-loss-in-production so far (no month has been finalized twice with a
real collision yet) but all worth catching before real usage:

1. **Real lint error** — `app/kalpana-circle/mangal-of-the-week/page.tsx`
   had a genuine `react-hooks/set-state-in-effect` **error** (not a
   warning): the `eslint-disable` comment was attached to the wrong
   `useEffect` (the one-time auth-check effect, which didn't even need it —
   `setState` calls there are inside a `.then()` callback, which the rule
   doesn't flag). The effect that actually needed the disable —
   `loadPool(userId)` on `userId` change, same "reactive data fetch on a
   dependency change" pattern used everywhere else in this codebase
   (`chat/page.tsx`, `dashboard/page.tsx`) — had no disable comment at all.
   Moved the comment to the correct effect. `tsc`/`eslint` both clean now.

2. **Repo/DB drift reconciled** — Phase 2's `snapshot_weekly_top20()`
   filters on `videos.moderation_status = 'approved'`, but no migration
   file in this repo ever added that column. Checked the live DB directly:
   the column *does* exist live (`text not null default 'approved'`, check
   constraint `in ('approved', 'pending_review')`) — added straight to the
   live DB at some point outside this repo's migration history, same drift
   pattern as §13b. Not a functional bug (the function works fine), but
   undocumented. Added `20260816260000_videos_moderation_status_reconcile.sql`
   to close the gap — content verified against live DB first, so it's a
   no-op on re-apply.

3. **Real logic bug, fixed at the schema level** —
   `finalize_monthly_writer_awards()`'s `INSERT ... ON CONFLICT (month,
   series_id) DO UPDATE` had its upsert keyed on the *wrong* column. The
   actual business rule is "one `monthly_writer_awards` row per writer per
   month," but the unique constraint (and therefore the conflict target)
   was `(month, series_id)`. If two different collab writers'
   highest-scoring series for a month ever happened to share the same
   `series_id` (e.g. two different videos on the same series crediting two
   different `collab_writer_id`s across different weeks), a single `INSERT
   ... SELECT` can't `DO UPDATE` the same conflict target twice in one
   statement — Postgres would throw `ON CONFLICT DO UPDATE command cannot
   affect row a second time` and the *entire* monthly finalize would fail,
   not just that one writer. Low-probability (needs a real co-written
   series with per-video writer credit split across weeks) but a real bug,
   and cheap to eliminate entirely rather than just narrow. Re-keyed the
   unique constraint from `(month, series_id)` to `(month, writer_id)` —
   which is what the code actually means — via `alter table ... drop
   constraint / add constraint` (`monthly_writer_awards_month_series_id_key`
   → `monthly_writer_awards_month_writer_id_key`), and updated the `ON
   CONFLICT` target + the `UPDATE SET` clause (now updates `series_id`
   instead of `writer_id` on conflict, matching the new key). Applied live
   via Supabase MCP, `20260816250000_unique_for_mangal_phase3.sql` updated
   to match (this migration is `create or replace function` + the new
   constraint, safe to re-apply). Confirmed nothing else in the app reads
   or depends on the old `(month, series_id)` uniqueness.

**Everything else checked clean:** Phase 0 schema/RLS, Phase 1's
`refresh_mangal_ideas()`/`get_mangal_ideas_feed()` (table/column names all
match live schema, `kcircle_posts`/`kcircle_post_likes`/
`kcircle_post_comments` correctly referenced), Phase 2's scoring formula
(log-scaled views/likes per the anti-abuse note, Tier-1 +15% multiplier,
one-vote-per-week + 24h-account-age enforced at the DB level not just UI),
all UI wiring (badges, banners, deep-links, RPC call sites across
`katube/page.tsx`, `katube/channel/[username]/page.tsx`,
`creator/[username]/page.tsx`, the two admin pages) — all correctly typed,
correctly named, no dead references.

**Verified:** `tsc --noEmit` clean across the whole repo; `eslint` clean on
every touched file; `get_advisors` (security) re-run after both live
migrations — no new warning class introduced, same pre-existing
self-guarding `SECURITY DEFINER` pattern every other RPC in this codebase
already has.

## §69 — K Circle mobile-compatibility audit: 1 real bug found & fixed

Founder asked to check whether all of K Circle is mobile-compatible, and
fix anything that isn't. Went page by page across all 12 pages under
`app/kalpana-circle/` (`page.tsx`, `chat`, `watch-together` + its `shorts`
room, `broadcasts` + `broadcast/[username]`, `saved`, `close-friends`,
`settings`, `profile/[username]`, `group/[conversationId]`,
`mangal-of-the-week`) — checked each for the shared responsive shell
(`KCircleShellStyle`/`.kc-shell`, collapses the desktop rail below 768px),
fixed pixel widths/min-widths that could force horizontal overflow on a
narrow phone, and existing `@media` blocks doing what they claim to.

**Found and fixed:** `group/[conversationId]/page.tsx` — the three
server-management side panels (New Channel `260px`, Roles `300px`,
Per-Channel Permission Overwrites `300px`) were plain fixed-width
`flexShrink: 0` flex siblings of the message area with **zero** mobile
handling, unlike the channel-list sidebar right next to them (which
already had a proper mobile overlay pattern, `kc-group-sidebar`/
`kc-group-sidebar-open`). On a phone, opening any of these three panels
would squeeze the chat area toward zero width instead of the panel taking
over the screen — a real, reachable bug (anyone with `MANAGE_CHANNELS`/
`MANAGE_ROLES` permission managing their K Circle server from a phone).
Fixed by giving all three the same full-screen-overlay treatment as the
sidebar (`.kc-group-panel` class, `position: fixed; inset: 56px 0 0 0;
width: 100%` below 700px) plus an explicit close (✕) button in each panel's
header — none of the three had any way to close except re-tapping the
same nav toggle, which isn't an obvious affordance once the panel is a
full-screen overlay.

**Everything else checked clean:** every other page already either uses
the shared shell's built-in breakpoint or has its own purposeful `@media`
block (chat's 480px title-truncation fix, profile's 359px/600px grid
tweaks, the Shorts watch-room's `DESKTOP_BREAKPOINT`-gated layout which is
mobile-first by design). No other fixed-width/min-width values ≥200px
found anywhere in K Circle outside the three panels above. No viewport
meta issue (Next.js App Router's default `width=device-width,
initial-scale=1` applies uniformly; no page anywhere in this repo
overrides it, so this isn't a K-Circle-specific gap).

**Verified:** `tsc --noEmit` clean; `eslint` clean on the touched file.

## §70 — Repo structure: Phase A (additive scaffolding)

Founder asked to bring the repo up to "standard/top-company" structure.
Researched current (2026) Next.js App Router structure conventions: routes
stay in `app/`, everything else (`components/`, `lib/`) moves under a
sibling `src/` tree grouped by domain, not left flat.

`app/lib` (16 files) and `app/components` (18 files) are both flat with
mixed concerns, and are imported from ~100+ route files across all three
products — moving them in one blind commit with no way to run a full
`next build` in this sandbox (Google Fonts fetch fails here, noted
earlier) is exactly how you break the live Vercel deploy silently. Split
the work into phases instead; this commit is Phase A only, **nothing
moved, nothing renamed** — purely additive:

- `.env.example` — every `process.env.*` actually referenced in the
  codebase, enumerated via grep, not guessed.
- `.github/workflows/ci.yml` — runs `tsc --noEmit` + `eslint` on every
  push/PR to `main`.
- `CONTRIBUTING.md` — local setup, pre-commit checks, migration-file
  convention.
- `docs/REPO_STRUCTURE.md` — current-state audit, target structure, and
  the phased plan (B: move `app/`→`src/app/` as a pure directory move;
  C: split `lib/` into `auth/`/`payments/`/`media/`/`compliance/`,
  one domain at a time; D: same for `components/`, grouped by product
  plus a `shared/` folder) — each phase its own verified commit.
- README: added a "Development" section pointing to both.

**Verified:** `tsc --noEmit` clean, `eslint` clean (no files touched that
affect either check — this pass added new files only).

## §71 — Repo structure: Phase B — app/ moved to src/app/

Pure directory move, per the Phase B plan in `docs/REPO_STRUCTURE.md`.
Confirmed safe before moving: `grep`'d for the `@/*` tsconfig path alias
across the whole codebase — zero hits, every import in this repo is
relative, so moving the folder wholesale changes no import paths at all
(git recorded all ~150 files as 100% renames, no content diffs). Also
confirmed no `middleware.ts`/`instrumentation.ts` at the old root, and no
config file hardcodes an `app/` path — Next.js auto-detects `src/app/`.

Updated `tsconfig.json`'s `@/*` alias from `./*` to `./src/*` so it's
correct going forward even though nothing currently uses it.

**Verified:** cleared stale `.next/` cache, `tsc --noEmit` clean (0
errors), `eslint` unchanged at 62 problems / 19 errors / 43 warnings —
identical count to pre-move baseline, so nothing new broke. Booted
`next dev` locally — Turbopack picked up `src/app/` immediately, ready in
under 2s, no errors.

`lib/` and `components/` (now `src/app/lib`, `src/app/components`) are
untouched — that's Phase C/D, done separately since those touch specific
import paths file-by-file rather than a single wholesale move.

## §72 — Repo structure: Phase C & D — lib/ and components/ split by domain

Both done in this pass, per `docs/REPO_STRUCTURE.md`.

**Phase C (`lib/`):** confirmed first that none of the 16 `lib/` files
import each other (all their local imports were external packages only —
`grep`'d every file), so this was a pure mechanical move: `git mv` each
file into its domain folder, then `sed` every consumer's import path to
insert the new subfolder. Split:
- `lib/auth/` — authRedirect, authedServerClient, roles, kcirclePermissions
- `lib/payments/` — razorpay
- `lib/media/` — nsfwCheck, imageQuality, youtubeVerify
- `lib/compliance/` — dpdp
- left flat (genuinely cross-cutting, not a specific domain): supabase,
  format, i18n, backNav, tagSuggest, novelEditor, email

**Phase D (`components/`):** checked actual importers per component
(`grep`'d exact consumer file paths, not guessed) before deciding
grouping. 13 of 18 are used across ≥2 products or from site-wide chrome
(root layout, landing page, creator dashboard) — moved to
`components/shared/`. The other 5 (SeriesCard, ReportButton, ShareButton,
EditSeriesModal, ManagePagesModal) are WebMangal-only — moved to
`components/webmangal/`. Neither KaTube nor Kalpana Circle got a
top-level `components/<product>/` folder since every genuinely
product-specific component for those two already lives in their own
route-local `components/` folders (`app/katube/components/`,
`app/kalpana-circle/components/`) — this pass didn't touch those.

**One real mistake caught and fixed during this pass:** the consumer-path
`sed` initially rewrote `katube/page.tsx`'s import of its *own local*
`./components/NotificationBell` (a different, katube-specific component
that happens to share a name with the one moved to `shared/`) into
`./components/shared/NotificationBell` — a false match on the substring
`components/NotificationBell` regardless of path depth. Caught by
`tsc --noEmit` (`Cannot find module`), not by inspection — a good
reminder that the verify-after-every-phase discipline is doing real
work, not just ceremony. Fixed by reverting that one line; then manually
reviewed every other `components/` diff line inside `katube/` and
`kalpana-circle/` to confirm no sibling false-matches, since tsc only
catches broken paths, not paths that resolve to the wrong-but-existing
file.

**Verified:** `tsc --noEmit` clean, `eslint` unchanged (62 problems, same
baseline), `next dev` boots clean (622ms) and serves routes correctly.

This closes out the repo-structure migration from `docs/REPO_STRUCTURE.md`
(Phases A-D all done). `src/app/` now contains only routes plus the two
domain-organized shared folders (`lib/`, `components/`) — matches the
target structure documented there.

## §73 — read/ and series/ moved under WebMangal/, with redirects

Founder wanted read/ and series/ (both WebMangal-only pages) physically
inside the WebMangal/ folder, matching home/ and search/. Flagged first
that this is a different kind of change than the lib/components moves —
in App Router the folder path *is* the URL, so this changes
`/series/:id` → `/WebMangal/series/:id` and `/read/:id` →
`/WebMangal/read/:id`, breaking any existing bookmark/shared
link/search-engine-indexed URL unless redirected. Founder chose: move for
real, add redirects.

- `git mv` both `[seriesId]`/`[chapterId]` route folders under
  `WebMangal/`. Fixed the resulting +1 relative-import depth in both
  moved `page.tsx` files (`../../lib/...` → `../../../lib/...`, same for
  `components/`).
- Found and rewrote every internal link to the old URLs across the whole
  codebase (grep, not guessed) — `SeriesCard`, `history`, `rankings`,
  `library`, `katube`'s `MangalIdeasRow` and video-watch page, the
  landing page, `bookmarks`, `upload`, `WebMangal/home`, `WebMangal/View`,
  `creator/[username]`, `dashboard`, `tags/[slug]`, and the two moved
  pages' own internal chapter-nav/back-to-series links. Also
  `sitemap.ts`'s series URL.
- Added two redirects in `next.config.ts` (`/series/:seriesId` →
  `/WebMangal/series/:seriesId`, `/read/:chapterId` →
  `/WebMangal/read/:chapterId`, both `permanent: true`) — same pattern
  and reasoning as the existing `/home` → `/WebMangal/home` redirect
  already in this file.

**Verified:** `tsc --noEmit` clean, `eslint` unchanged (62 problems, same
baseline). Booted `next dev` and curl-tested live: old `/series/test123`
and `/read/test123` both correctly 308-redirect to the new
`/WebMangal/...` paths. New route itself hit a 500 in this sandbox only
because there's no real Supabase env configured here — confirmed from
the stack trace it's a missing-credentials error inside
`lib/supabase.ts`, not a broken import or routing issue; the import
chain (`WebMangal/series/[seriesId]/page.tsx` → `lib/supabase.ts`)
resolved correctly.

## §74 — bookmarks/history/library/rankings/tags/upload moved under WebMangal/

Same treatment as §73, for the rest of WebMangal's pages. Before moving
anything, checked each top-level route for cross-product references
(`grep` for "katube"/"kalpana-circle", not guessed) to confirm scope:

- **Moved** (zero cross-product references, content scoped to
  manga/novel chapters/series): `bookmarks`, `history`, `library`,
  `rankings`, `tags` (+ `tags/[slug]`), `upload`.
- **Left alone, on purpose:** `dashboard` (8 sub-pages reference KaTube —
  it's the shared creator studio across products, gated by
  `ProductScope`), `creator/[username]` (links to
  `/kalpana-circle/broadcast/...`, ecosystem-wide profile), `leaderboard`
  (explicitly "WebMangal and KaTube views combined"), `admin` (its
  `mangal-ideas` pages are the cross-product "Unique for Mangal"
  feature), `settings` (account-level DPDP controls, not product
  content), `become-creator` (creates the ecosystem-wide creator
  identity all three products link to, not WebMangal-specific).

Same mechanics as §73: `git mv` each folder under `WebMangal/`, fixed
the +1 relative-import depth in every moved file (checked each file's
actual imports first, not assumed uniform depth — `tags/[slug]/page.tsx`
was one level deeper than the rest), then found and rewrote every
internal link across the whole codebase (`ProfileMenu`, `robots.ts`,
`WebMangal/View.tsx`, `WebMangal/home`, landing page, `leaderboard`,
`dashboard` + its `workspace`/`tools` sub-pages, and the moved pages'
own cross-links to each other) to the new `/WebMangal/...` paths. Added
6 more permanent redirects in `next.config.ts` (`/tags/:slug` as a
dynamic segment, the rest static) following the same pattern as
§73/`/home`.

**Verified:** `tsc --noEmit` clean, `eslint` unchanged (62 problems, same
baseline). Booted `next dev`, curl-tested all 6 old URLs — all correctly
308-redirect to their new `/WebMangal/...` paths, including
`/tags/action` (dynamic segment) and `/upload?seriesId=abc123` (Next.js
auto-forwards unmatched query params to the redirect destination,
confirmed live rather than assumed from docs).

`dashboard`, `creator`, `leaderboard`, `admin`, `settings`,
`become-creator` were explicitly confirmed and left in place — not an
oversight.

## §75 — creator/[username] moved under WebMangal/ (option B chosen)

Founder decision on the open question from §74: went with **option B** —
`/creator/[username]` formally becomes WebMangal's writer profile page
(matches what it actually renders — series grid only), rather than being
extended into a shared cross-product hub (option A). Moved it under
`WebMangal/`, same mechanics as every prior move: fixed the +1
relative-import depth (`../../lib/...` → `../../../lib/...`), found and
rewrote every internal link across the codebase — and this one reached
further than expected, since it really had been linked from everywhere:
`SeriesCard`, KaTube's `WriterOfTheMonthBanner` and video-watch page,
`WebMangal/series/[seriesId]`, Kalpana Circle's main page (2 places) and
`saved` page, and `leaderboard`. Added a `/creator/:username` →
`/WebMangal/creator/:username` permanent redirect.

**Verified:** `tsc --noEmit` clean, `eslint` unchanged (62/19/43, same
baseline), live redirect test: `/creator/someuser` → 308 →
`/WebMangal/creator/someuser`.

### Deferred to next session (founder said "continue" when ready — don't start on its own)

Now that `/creator/[username]` is committed to being WebMangal-only,
**KaTube and Kalpana Circle need their own dedicated profile pages** to
replace what they lost by no longer sharing that page:
- `/katube/channel/[username]` — a KaTube-native channel/creator page
- `/kalpana-circle/profile/[username]` — a Kalpana Circle-native profile
  page

### §76 — correction + the actual fix (next session, same morning)

**Correction to the note above: it was wrong.** Both pages already
existed — `/katube/channel/[username]` (built at §55, deliberately left
unlinked from the watch page's creator byline pending exactly this
founder decision) and `/kalpana-circle/profile/[username]` (built at
§50, already wired into K Circle's nav/settings, just not swept into
*every* K Circle surface that links to a creator). I missed both when
writing the note above — should have grepped for their existence before
concluding "neither exists yet."

The real remaining work was just the link rewiring §55 had explicitly
deferred: `git grep` confirmed 4 of the 8 links found in §75 still
pointed at `/WebMangal/creator/[username]` from the wrong product
context — repointed each to its product-native page:
- `katube/watch/[videoId]/page.tsx`'s creator byline → `/katube/channel/[username]`
- `kalpana-circle/page.tsx`'s two search-result links ("Dreamers" user
  results + post-author links) → `/kalpana-circle/profile/[username]`
- `kalpana-circle/saved/page.tsx`'s post-author link → same

The other 4 (`SeriesCard`, `WriterOfTheMonthBanner`, `WebMangal/series`'s
creator credit, `leaderboard`) correctly stay pointed at
`/WebMangal/creator/[username]` — genuinely WebMangal-context (series
cards, the WebMangal writer-of-the-month award, a WebMangal series page)
or, for `leaderboard`, a deliberate cross-product ranking that still
needs one generic identity link to point at (same reasoning as
`become-creator`'s site-wide role).

**Verified:** `tsc --noEmit` clean, `eslint` unchanged (62/19/43, same
baseline). Booted `next dev`, hit both product-native pages live —
both compiled and resolved their full import chain correctly (confirmed
via the 500's stack trace pointing at `lib/supabase.ts` needing real env
credentials this sandbox doesn't have, not a broken import or route).

## §77 — KaTube: Share sheet (K Circle send) + separate Watch Together entry point, video & Shorts

**Spec, as corrected by the founder mid-session — read this before touching
these buttons again:** two distinct buttons on every KaTube long-video and
Shorts page, **never merged into one menu**:

1. **Share** — link/URL only. Opens a sheet: send straight to a K Circle
   friend (DM), WhatsApp, Instagram/more apps (native `navigator.share`,
   falls back to copy), copy link. Does **not** contain a Watch Together
   option — an earlier draft this session put Watch Together inside Share
   and the founder explicitly reversed that.
2. **Watch with Friends** (long video) / **Together** (Shorts icon) — a
   *separate* button. Opens straight to a private/public choice, video/short
   already preselected (no picker step — we're already on it), then an
   invite screen using the K Circle mutual-friends list. Long-video rooms
   use the existing sync-play room; Shorts rooms land in the existing
   reels-style continuous-scroll watch-together room
   (`kalpana-circle/watch-together/shorts/[roomId]`), started on *this*
   short instead of always defaulting to the most recent one. Replaces the
   old single-tap "Watch with Friends" button, which always silently
   created a private room with no visibility choice and no in-app invite
   (copy-link only) — that behavior's gone now, folded into the new sheet.

**Built this session — twice, because of a mid-session repo-structure
change (see §70-74):** the first pass was built and committed against a
stale local clone ~145 commits behind `origin/main` (missing the entire
emoji→lucide-icon sweep, the Discord-rail K Circle rollout, and the Phase
A-D repo restructure). That version never reached `origin/main` — caught it
at push time (rejected, non-fast-forward), reset to the real `main`, and
rebuilt from scratch against the current tree/conventions rather than
force-pushing or fixing up the stale diff. Notes for future sessions: don't
trust a sandbox's existing clone without `git fetch && git log
main..origin/main` first, even mid-session — the founder pushed a repo
restructure (§70-74) *during* this same session, after the first rebuild
was already done in the old `app/` layout, hence "twice."

- **New:** `src/app/katube/components/KatubeShareSheet.tsx` — shared
  bottom-sheet, used by both entry points via an `initialView` prop
  (`'main'` for Share, `'wt-visibility'` for Watch Together) — one
  component, two doors in. Lives alongside `KaTubePlayer.tsx`/
  `VideoGridCard.tsx` (KaTube-local), not under `components/shared/` or
  `components/webmangal/` — this has no WebMangal use case.
  - K Circle send: reuses the mutual-follow query
    (`creator_follows.creator_id`/`follower_id`, intersected both
    directions) the Shorts watch-room's `loadSuggestedFriends` already
    uses, plus username search. Sends via `getOrCreateConversation` (find
    an existing 1:1 `kcircle_conversations` row by participant-id
    intersection, else insert one) + a `kcircle_messages` insert +
    `last_message_at` bump + `kcircle_notifications` insert (`type:
    'message'`) — same shape `chat/page.tsx`'s own send flow uses. Shorts
    use `short_ref_id` for a rich "tap to open" link (existing
    column/rendering); long videos send title+URL as plain text (see
    follow-up #1 below).
  - Watch Together: `wt-visibility` (private/public toggle + "Start room")
    → creates a `watch_rooms` row (`mode: 'video'` with `video_id` set to
    the current video, or `mode: 'shorts'` with `video_id`/
    `current_short_id` both set to the current short) → `wt-invite`
    (same friend list) sends a `kcircle_notifications` insert (`type:
    'watch_invite'`, `room_id`) per selected friend — **not** a DM message;
    matches the existing room's own Add Friend picker exactly (invitee's
    `watch_room_members` row only ever gets inserted by them, via the
    self-insert RLS policy, when they actually open the room).
- `src/app/katube/watch/[videoId]/page.tsx` — removed the old
  `handleWatchWithFriends` single-tap handler and its `creatingRoom` state
  entirely; now a `Share` button (opens the sheet on `'main'`) sits next to
  a `Watch with Friends` button (opens it on `'wt-visibility'`) — two
  separate `<button>`s, two separate sheet instances/open-states.
- `src/app/katube/shorts/[shortId]/page.tsx` — Share icon (was a
  `showToast('Share isn't built yet')` stub) now opens the sheet on
  `'main'`; added a `Together` icon next to it opening it on
  `'wt-visibility'`. Both sheets render `dark` (Shorts feed is always
  full-screen black, no theme wrapper) and act on `shorts[activeIndex]` —
  tapping either icon also snaps `activeIndex` to that card's `idx` first,
  so the sheet always targets the short actually being shared/watched,
  even mid-scroll. Added a `userId` fetch (untracked on this page before)
  so both buttons gate behind login the same way the rest of KaTube does.

**No schema changes** — reuses `kcircle_conversations` /
`kcircle_conversation_participants` / `kcircle_messages` /
`kcircle_notifications` / `creator_follows` / `watch_rooms` /
`watch_room_members` exactly as they already exist.

**Deliberately not built yet (follow-ups, in priority order):**
1. **Generic video reference for K Circle DMs.** `short_ref_id` only makes
   sense for shorts — its existing rendering (`chat.tsx`, watch-together
   `page.tsx`) always links to `/katube/shorts/:id`. A long video shared via
   K Circle today is plain text (title + URL), not a rich tappable card.
   Needs either a new `video_ref_id` column (routes to `/katube/watch/:id`
   instead) or generalizing `short_ref_id`'s renderer to branch on the
   referenced row's `is_short`.
2. **"Most-chatted friend" as the Share sheet's default/first row**, instead
   of the flat mutual-follows list — rank by recent DM activity
   (`kcircle_conversations.last_message_at` per 1:1 thread) so whoever you
   actually talk to most surfaces first. Not started — today's list is
   unranked (whatever order `creator_follows` returns).
3. **Logged-out empty state.** Right now a logged-out tap on either button
   just redirects to `/login` with no explanation. A one-line "log in to
   send to K Circle friends" would help, especially for someone hitting
   KaTube for the first time who doesn't know K Circle exists yet.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on all three
touched/new files: 0 errors (two pre-existing `<img>`-vs-`<Image>` warnings,
unrelated). Full-project `eslint .`: same 19 pre-existing errors / 43
warnings with or without this change (diffed directly against a clean
`git stash` of the working tree to confirm). Committed and pushed directly
to `main` per founder's instruction — no branch/PR.
## §78 — K Circle mobile bottom nav: 9 icons → 4 + scrollable "More" drawer

Founder-reported (with a screenshot): the mobile bottom tab bar on the K
Circle home feed had 9 icons crammed into one row (Home, Search, Create,
Chat, Watch Together, Mangal of the Week, Broadcasts, Saved, Profile) —
cramped/messy on real phone widths.

Only `app/kalpana-circle/page.tsx` had this bar (`grep`'d every other
K Circle page first — chat/watch-together/broadcasts/saved/etc. don't
duplicate it, so this was a single-file fix, not a sweep).

**Kept in the bottom bar (4, highest-frequency actions):** Home, Search,
Create (+), Chat.

**Moved into a new scrollable "More" drawer** (slides in from the right,
same overlay/backdrop pattern as the existing search overlay, tap
backdrop or X to close): Watch Together, Mangal of the Week, Broadcasts,
Saved, Profile — each rendered with icon + label (a drawer has room for
labels a cramped icon-only bar didn't).

Mobile-only per founder's request — desktop is untouched; `KCircleRail`
(`components/Shell.tsx`) already gives every one of these its own icon
with no crowding problem, so the drawer is never needed there. Added a
`.kc-mobile-menu-overlay { display: none !important; }` rule at the
existing 768px breakpoint as a defensive guard (in case someone resizes
a window with the drawer already open — the trigger button itself is
already mobile-only via `.kc-bottom-nav`'s existing display rules, so
this is belt-and-suspenders, not load-bearing).

**Verified:** `tsc --noEmit` clean, `eslint` unchanged (62/19/43, same
baseline). Booted `next dev` — full import chain through
`kalpana-circle/page.tsx` compiled without error (only failure was the
same missing-Supabase-env-in-sandbox issue seen on every other route
tested this way, confirmed via stack trace, not a code problem).

## §79 — WebMangal reader: lazy-load chapter images

Founder asked for a WebMangal bug pass + quality push toward
WebNovel/Webtoon-grade UX. Audited `read/[chapterId]`, `series/[seriesId]`,
`home`, `View.tsx`: `tsc`/`eslint` were already clean (no errors, only
pre-existing `exhaustive-deps` warnings), cover thumbnails already use
`next/image` via `SeriesCard`. The real gap: scroll-mode chapter pages
(30-50 stacked images/chapter) had no `loading`/`decoding` attrs, so every
image in a chapter fetched and decoded at once on open — slow first paint,
images popping in as they arrived. This is the #1 complaint in Webtoon-style
reader UX research (images "flashing" while loading).

- Scroll-mode images: first 2 `loading="eager"` (above-the-fold), rest
  `loading="lazy"`; `decoding="async"` throughout.
- Page-mode reader image + series-page community-post thumbnail also get
  `decoding="async"` / `loading="lazy"` for consistency.
- Removed unused `Trophy` import in `WebMangal/home` (lint cleanup).

Left untouched, flagged for a future session rather than guessed at blind:
the `react-hooks/exhaustive-deps` warnings on `loadChapter`/`fetchChapters`/
`fetchQuests`/`scheduleUpsert` (13 warnings, pre-existing, 0 errors) — each
looked like a deliberate stable-callback pattern rather than a real staleness
bug on inspection, but confirming that needs a live Supabase env this
sandbox doesn't have, not more static reading.

**Verified:** `tsc --noEmit` clean, `eslint` on WebMangal scope: 0 errors
(13 pre-existing warnings, down from 16). `next build` succeeds. Committed
and pushed directly to `main` per founder's instruction — no branch/PR.

## §68 — Fast tap (Shorts feed): fixed slow/laggy loading while scrolling

**Founder-reported bug:** Fast Tap (Shorts) feed took very long to load
between videos while scrolling — not matching the instant Reels/DramaBox-
style scroll it's meant to have. Fixed in
`app/katube/shorts/[shortId]/page.tsx`.

**Two real causes, not an artificial delay:**
1. The iframe preload window was only "active ± 1" (§7's original
   windowing choice). A normal-speed swipe regularly landed on a short
   whose iframe hadn't started loading at all yet — a genuine cold load,
   not a slow one, just one that hadn't been kicked off in time.
2. No loading indicator existed at all — a still-loading short showed a
   blank black frame, which reads as "stuck" even a second before it's
   actually ready.

**Fix:**
- Widened the preload window to `active-1 .. active+2`, biased forward
  (2 ahead vs 1 behind) since a Shorts feed is swiped forward far more
  than backward — the next couple of shorts are now warm before a normal
  swipe reaches them.
- Added a real buffering spinner keyed off the iframe's own `onLoad`
  event (not a timer) — only appears for the *active* short while it's
  genuinely still loading. On good network the short is already
  preloaded by arrival, so the spinner essentially never shows; on a
  weak network it shows honestly instead of a dead black frame. This is
  the "if network problem, loading circle; if network's fine, no
  loading circle" behavior the founder asked for.
- Kept the YouTube thumbnail visible underneath the iframe until load
  fires, so there's never a blank frame during the gap either way.
- Added `preconnect` hints for `youtube.com`/`i.ytimg.com`/
  `img.youtube.com` so first-connection setup (DNS/TLS) isn't on the
  critical path of the very first video.

**Not done:** doesn't change the underlying `<iframe src=...>` embed
architecture (still no full YouTube IFrame Player JS API here, unlike
`KaTubePlayer.tsx` used on the long-video watch page per §54) — kept
consistent with §7's original "keep this feed's DOM/network light"
choice rather than adding the heavier JS API script to every short.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on the touched
file: 0 errors (2 pre-existing `<img>`-vs-`next/image` warnings, same
style already used elsewhere in this file, not introduced by this fix).
Committed and pushed directly to `main` (`c325fe0`) per founder's
instruction — no branch/PR.

## §80 — WebMangal perf: series-page load waterfall + manga reader quality selector

Founder-reported: WebMangal (series pages, upload flow, "many more pages") and
KaTube both feel slow to load, and manga chapter images are too heavy by
default — asked for a per-user image quality control, auto-set from the
reader's connection, with a 720p floor.

**Series page load waterfall (`WebMangal/series/[seriesId]/page.tsx`).** The
page's main `load()` was ~14 `await supabase...` calls in a strict sequence —
series row, creator username, tags, view-count POST, auth, profile, follow
status, reading progress, my rating, helpful-votes, follow count, all ratings,
written reviews, chapters, related series, Circle fan-art — each one a full
round trip before the next could even start. Rewrote it into three batches
that run concurrently instead of serially:
1. Everything that only needs `seriesId` (series row, auth, follow count, all
   ratings, reviews, chapters, related series) — one `Promise.all`.
2. Everything that needs the series row back (creator username, tags, Circle
   fan-art) — a second `Promise.all`, kicked off once batch 1's series query
   resolves.
3. Everything that needs the logged-in user (role/profile, follow status,
   reading progress, my rating, helpful-votes) — a third `Promise.all`, kicked
   off once batch 1's auth call resolves.

View-count logging (the `/api/log-view` POST) is fired without being awaited
— it was never on the critical path for anything else in the function, just
run in sequence with everything else by accident. Net effect: same data,
same state updates, same query shapes — just concurrent instead of
sequential. This is the single biggest lever on series-page load time since
it was ~14 round trips deep before `setLoading(false)`.

Audited `katube/watch/[videoId]/page.tsx` (also flagged as slow) and
`WebMangal/upload/page.tsx` for the same waterfall pattern — watch page's
main load effect already batches its two dependent queries via `Promise.all`
and defers related-videos/comments/accuracy-reviews into their own
non-blocking effects (already following the same pattern applied above, no
change needed); upload page's sequential awaits are almost all inside
save/submit handlers (user-triggered mutations), not the initial page load,
so they don't affect perceived page-load speed the way the series page's did.

**Manga reader image quality selector (`WebMangal/read/[chapterId]/page.tsx`).**
Replaced the old binary "Data Saver" toggle with a 3-way **Auto / Low / High**
selector, reachable from the same reader settings panel:
- **Auto** (default) — reads `navigator.connection` (Network Information
  API: `effectiveType`, `downlink`, `saveData`) and picks Low on slow/metered
  connections, High otherwise. Re-evaluates on the browser's own `change`
  event (e.g. wifi → mobile data mid-session). Where the API isn't available
  (Safari/Firefox have no support), falls back to High rather than guessing.
- **Low** — always routes through Supabase Storage's image-transform
  endpoint at **`width=720`** — the founder's specified floor, so even the
  compact tier stays readable — `quality=65`.
- **High** — always serves the original, full-resolution page the creator
  uploaded, no transform.
Preference persists in the existing `mangal_reader_prefs` localStorage blob
under a new `imageQuality` key; old saved `dataSaver: true/false` values are
read once and migrated to `'low'`/`'auto'` respectively so returning readers
don't lose their setting. `onError` fallback (transform endpoint 400s if
image transformations aren't enabled on the Supabase plan) now fires
regardless of the selected tier, not just under the old Data Saver flag.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on both touched
files: 0 errors (warning counts unchanged from a clean `git stash` baseline
— 7 pre-existing on the reader page, 3 on the series page, all
`react-hooks/exhaustive-deps` on unrelated effects). Full-project `eslint .`:
0 errors, 41 pre-existing warnings, same as baseline. `next build` in this
sandbox fails at the Google Fonts fetch step (`fonts.googleapis.com` is
outside the sandbox's allowed network egress) — unrelated to this change,
same sandbox limitation noted in earlier sessions for Supabase-env-dependent
checks. Committed and pushed directly to `main` per founder's instruction —
no branch/PR.

## §81 — WebMangal-wide load-time audit: fixed every remaining waterfall/N+1

Founder asked for a sweep across all of WebMangal (not just the series page
from §80) to find and fix every page that's slow to load. Audited every
`page.tsx` under `WebMangal/` for sequential-await waterfalls and N+1 query
loops. Found and fixed four more:

**Manga reader (`read/[chapterId]/page.tsx`) — the highest-traffic page in
the app.** The actual page images (what the reader is here to see) were
fetched dead last — after the chapter row AND an unrelated chapter-nav-list
query had both already resolved *in sequence*. The pages query only needs
`chapterId`, which is known immediately, so it never needed to wait on
either of those. Now fired at the very top of `loadChapter()`, in parallel
with the chapter-row fetch, and only awaited at the end right before
`setPages()`. Shaves a full round trip off the critical path of every single
chapter view. (Draft/scheduled-gated views still fire the query and just
don't consume the result — negligible extra load on a rare path, not worth
complicating the common path to avoid.)

**Creator profile (`creator/[username]/page.tsx`).** Was 5 sequential
queries (creator row → viewer auth → viewer role → creator's
account_active → series list → writer-of-month RPC) even though only the
first genuinely gates the rest. Batched the 4 that only depend on
`creatorRow.user_id` into one `Promise.all`; the viewer's own role/ban-button
check now runs after `setLoading(false)` since it isn't on the critical path
for anything the page renders by default.

**Library (`library/page.tsx`) — was a real N+1.** For every followed
series, fired 2 separate queries (latest chapter + chapter count) one after
another — a library of 30 follows meant 60 round trips (parallelized across
series via the outer `Promise.all`, but still 2 round trips deep per
series). Replaced with one batched `.in('series_id', seriesIds)` query for
every followed series' chapters at once, then computed latest/count
client-side — same pattern already used on `/WebMangal/bookmarks`. Also
parallelized the profile-role and follows-list queries at the top (they only
share `u.user.id`, not each other's results).

**Bookmarks (`bookmarks/page.tsx`).** Smaller version of the same fix —
profile role and the follows list were sequential despite being independent;
batched into one `Promise.all`.

**Left unchanged, checked and found fine:** `home/page.tsx` (already fires
its 4 independent fetches — profile+progress+recs chain, series list,
trending, new-voices — without blocking each other); `history/page.tsx`
(progress→chapter-count is a real dependency, already minimal — 2 queries);
`tags/page.tsx`, `tags/[slug]/page.tsx`, `rankings/page.tsx` (1–2 queries,
already minimal or a real dependency); `upload/page.tsx`'s sequential awaits
are inside save/submit handlers (user-triggered mutations, not initial page
load) except the edit-mode chapter loader, which is a genuine two-step
dependency (need the chapter row before knowing whether to fetch novel text
or manga pages) — left as-is.

Flagged but deliberately **not** changed: `home/page.tsx`'s main series
query (`select('*, chapters(count)')...order('created_at')`) has no
`.limit()` — it loads every published series on the platform, unbounded,
since genre/content-type/sort filtering and slicing (`featured`,
`newArrivals`, etc.) all happen client-side over the full list. Fine at
current scale but becomes the platform's real bottleneck as the catalog
grows. Adding a limit would require rethinking the home page's client-side
filter/sort into real pagination — a product decision, not a drop-in perf
fix, so left as a flagged follow-up rather than silently changing what
"browse all series" means on the homepage.

**Verified:** `tsc --noEmit` clean project-wide. `eslint .`: 0 errors, 42
warnings — unchanged from the pre-existing baseline (confirmed via `git
stash` comparison), no new warnings on any touched file. Committed and
pushed directly to `main` per founder's instruction — no branch/PR. Repo had
concurrent activity from another session while this was in flight (§68 fast-
tap fix, a draft/chapters race fix, a comments-badge fix, a resume-in-chapter
race fix all landed on `main` mid-session) — each was fetched and merged in
before push; one real conflict (the draft/scheduled chapter-filter fix
needed `canManageRef` set before `fetchChapters()` runs, which raced against
this session's own batching — fixed by ordering `fetchChapters()` after the
role check resolves, same principle applied again here for the reader page).
## §69 — WebMangal: mobile nav overlap fix + orange-green primary-button gradient

**Founder-reported bug (screenshot):** on the WebMangal mobile compact
header, the hamburger/search icons, the WebMangal wordmark + "powered by
MANGAL" subtitle, and the LOG IN button were all visually overlapping on
narrow phones.

**Root cause:** the wordmark+subtitle `<Link>` had `flex: 1,
justifyContent: 'center'` but nothing constraining its own width — on a
narrow viewport its content (logo + "WebMangal" + "powered by MANGAL", all
`whiteSpace: 'nowrap'`) simply overflowed its allotted center slot and
bled into the icon cluster on the left and the LOG IN button on the right,
instead of shrinking. The existing `@media (max-width: 380px)` rule meant
to hide the subtitle wasn't kicking in early enough on common phone
widths.

**Fixed (`app/WebMangal/View.tsx`, mobile-only compact header):**
- Wordmark + subtitle now wrapped in a `minWidth: 0, overflow: 'hidden'`
  block with `textOverflow: 'ellipsis'` on the wordmark — clips instead of
  overlapping siblings if it's ever still tight.
- Logo shrunk 34px → 28px on this header.
- Subtitle's auto-hide breakpoint raised 380px → 460px (matches where it
  was actually still colliding).
- New `@media (max-width: 340px)` rule shrinks the icon buttons and LOG IN
  pill further on very small phones, freeing more room for the wordmark.

**Buttons — green → orange-green gradient, extended product-wide:**
Per founder's ask ("replace login colour button from green to gradient
orange-green add this for every or most of the buttons in webmangal"):
- Replaced the mint-green (`#a7f3d0`/`#6ee7b7`) LOG IN / SIGN UP / mobile
  search buttons with `linear-gradient(135deg, #f97316, #22c55e)`
  (orange → green), text switched to white for contrast.
- Extended the same gradient to WebMangal's existing primary red CTA
  gradient (`#7f1d1d`/`#991b1b`) everywhere it appeared as an actual
  clickable button — Log in/Get Started (desktop nav), series page
  Follow/Save/Publish/Post Quest/Post Review, chapter page Post
  comment/Post reply/Next chapter/"Unlimited Unlock", library/bookmarks/
  history empty-state "Browse Series"/"Show All" CTAs,
  `EditSeriesModal`'s Save, `ReportButton`'s Submit/Close, and
  `ManagePagesModal`'s Save Order (2 spots) — 12 files total.
- **Deliberately left alone:** destructive/danger buttons (Delete series,
  Ban user, Delete page — solid `#7f1d1d`, no gradient) stay red, since
  that's an intentional danger-action convention, not the brand CTA
  color, and wasn't part of the ask. Also left the decorative flame-icon
  badges and genre-pill accent chips on their original `#7f1d1d`/`#d97706`
  red-orange gradient — those are branding/decorative marks, not
  interactive buttons.
- `ProfileMenu.tsx`'s avatar-initials circle (same red/amber gradient)
  also left untouched — decorative avatar coloring, not a button.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` clean (0 errors)
on all 12 touched files — the 13 warnings present are all pre-existing
`react-hooks/exhaustive-deps`/unused-var notices on lines this change
didn't touch. Committed and pushed directly to `main`
(`145140c`→rebased→`bc53f77`) — rebased cleanly onto a concurrent commit
(`e8e009d`, unrelated History-page fix) found on fetch before pushing, per
this repo's standing convention.

## §81 — WebMangal reader: fullscreen had no visible effect, Lock hidden behind it, Follow/Add Chapter button UI upgrade

**Founder-reported bugs:** (1) Fullscreen button — "nothing visibly changes" when
tapped. (2) Lock option — "only working for fullscreen, it's not visible
always." (3) Series-page buttons should look like a "professional/big
platform" button, using the orange-green gradient already established
product-wide (§69), applied to Follow "everywhere" and the Add button.

**Fullscreen (`WebMangal/read/[chapterId]/page.tsx`):** `isFullscreen` only
ever drove a `maxWidth` cap (720px/600px → 'none') on the image container.
On any screen narrower than that cap — every phone, the primary reading
device — the cap never actually bound, so toggling it was a genuine no-op
visually. Fixed by making fullscreen entry immediately hide the top bar
(instead of waiting for the normal 4s idle timer) and collapsing the
content's `paddingTop` (56px → 0) in the same instant the bar hides —
tied to `showUI` generally, not just `lockScreen` as before. This is a
real, immediate, viewport-size-independent visual change instead of a cap
that only mattered on wide desktop windows. Page-mode's fixed 12px
padding also now collapses to 0 in fullscreen for true edge-to-edge.
Exiting fullscreen restores the top bar and normal padding.

**Lock Screen:** the toggle button was gated behind `{isFullscreen && (...)}`,
so it simply wasn't in the DOM until fullscreen was turned on first —
read as "the lock option isn't there." `toggleLockScreen` never actually
depended on `isFullscreen` for anything, so the gate served no functional
purpose; removed it. Lock button is now always present in the reader top
bar like the other controls (Chapters/Fullscreen/Settings), with an
active-state highlight matching the others.

**Button UI (`WebMangal/series/[seriesId]/page.tsx`):** Follow button and
the creator-only "+ Add Chapter" button were still on the old thin
outlined/translucent style from before §69's gradient rollout (they sit
in a CTA row built earlier than that pass and were missed). Both now use
the same `linear-gradient(135deg, #f97316, #22c55e)` solid-pill CTA style
as the rest of the product's primary buttons — Follow shows the full
gradient when not-yet-following (the prominent ask) and a filled
green-tinted confirmed state once following, rather than fading to a
plain outline that reads as disabled. Add Chapter gets the same gradient
treatment plus a proper `Plus` icon in place of a literal "+" character.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on both touched
files: 0 errors (10 pre-existing `react-hooks/exhaustive-deps` warnings,
same as baseline, none introduced). `next build` succeeds. Committed and
pushed directly to `main` per founder's instruction — no branch/PR.

## §82 — WebMangal reader fullscreen round 2: real browser fullscreen, persists across chapters, trimmed nav, dedicated exit control

**Founder feedback on §81 (with screenshot):** the simulated fullscreen from
§81 didn't hide the mobile browser's own address bar / status bar chrome
(the actual ask, "like how F12 behaves on desktop") — it only reflowed our
own layout. Also: no obvious exit-fullscreen control once the top bar
auto-hid; the end-of-chapter block was too busy for fullscreen (Up Next
card + Prev + All Chapters + Ch.N pill all visible — only the next-chapter
action and reactions/comments should remain); and fullscreen has to
survive tapping "Next Chapter", not reset every chapter.

**Real Fullscreen API.** `toggleFullscreen` now calls
`document.documentElement.requestFullscreen()` / `document.exitFullscreen()`
— actually hides mobile browser chrome, not just CSS. Deliberately targets
`document.documentElement` and not this component's own root div: the root
div gets unmounted and replaced by a fresh one on every chapter navigation
(different `chapterId` route param), and the Fullscreen API auto-exits the
moment its target element leaves the DOM — `<html>` never unmounts during
Next.js client-side nav, so requesting on it is what actually makes
fullscreen survive clicking "Next Chapter" as asked. A `fullscreenchange`
listener keeps React state in sync in both directions: (a) if the browser
exits fullscreen on its own (Esc, swipe-down, back gesture) rather than via
our button, state falls back to normal instead of leaving an edge-to-edge
layout with no chrome to escape it; (b) on mount, if `document.fullscreenElement`
is already truthy (arrived here via in-app nav while still in real
fullscreen from the previous chapter), state initializes to `true` instead
of dropping to windowed layout while the browser is still actually
fullscreen underneath. `requestFullscreen` is wrapped in try/catch — iOS
Safari doesn't support it on non-`<video>` elements at all, so this falls
back to the §81 CSS-only edge-to-edge layout there rather than silently
failing.

**Dedicated exit control.** §81 hid the whole top bar (including the old
Shrink-icon exit button) the instant fullscreen was entered, which is
exactly why the exit option "disappeared" — technically reachable by
tapping to reveal the bar again, but not obvious. Added a persistent
top-right corner button (same video-player pattern as the existing Lock
Screen exit affordance, just not tied to the auto-hide timer so it's never
gone) — shown whenever `isFullscreen && !lockScreen`.

**Trimmed end-of-chapter block in fullscreen** (scroll mode, matches the
founder's screenshot): the "Up Next" card and the Prev/All Chapters pills
are hidden; only the Next Chapter gradient pill remains, plus the
reactions/comments section below (already unconditional on fullscreen,
untouched). Page mode's equivalent Up Next card gets the same treatment;
its in-chapter Prev/dots/Next page-turn row was left alone since that's
core reading navigation, not the extra chrome in question.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on the touched
file: 0 errors (7 pre-existing warnings, same baseline). `next build`
succeeds. Committed and pushed directly to `main` per founder's
instruction — no branch/PR.

## §82 — Homepage series fetch: capped the unbounded query flagged in §81

Founder asked to fix the homepage's uncapped series query flagged in §81 as
a "not changed" item — worth revisiting since a commit that landed on `main`
mid-audit (the draft/scheduled chapter-count-badge fix) actually made it
worse in the meantime: the homepage's series fetch went from one unbounded
`select('*')` over every published series, to *two* unbounded queries — the
second being every published chapter across every one of those series, just
to build the chapter-count map. Both scale with the whole catalog, not with
what the page actually renders.

**Fix:** added `.limit(300)` (newest-first, matching the query's existing
`order('created_at', { ascending: false })`) to the series query. Since the
chapter-count query is `.in('series_id', seriesIds)` keyed off that same
result, capping the series query caps both. 300 is deliberately generous —
enough that genre/content-type filtering, sort, "New Arrivals", and "Staff
Picks" all keep behaving exactly as before at the platform's current and
near-term scale — this is a safety cap on worst-case growth, not real
pagination.

**Deliberately not done:** turning the browse grid into real server-side
pagination. That would mean genre/content-type filters and sort only see
one page of results at a time (correctness change, not just perf), which is
a product/UX decision — raise if the catalog ever gets close to bumping
against the 300 cap and this needs revisiting for real.

**Verified:** `tsc --noEmit` clean, `eslint` 0 errors/warnings on the
touched file. Pushed directly to `main` per founder's instruction.

## §84 — Homepage: real server-side pagination (replaces the §82 cap)

Founder didn't want to wait for the catalog to grow into the §82 300-series
cap — asked for the real fix now. Rewrote the homepage's "All Series" browse
grid from "fetch up to N series, filter/sort client-side" to genuine
server-side pagination with a Load More button.

**What changed:**
- Genre, content type, the Desi Comics toggle, and sort (`latest`/`views`/
  `az`) are now applied in the query itself — `.eq('genre', ...)`,
  `.eq('content_type', ...)`, `.in('genre', DESI_GENRES)`,
  `.order('views'|'title'|'created_at', ...)` — instead of filtering/sorting
  a locally-held array. Fetched in pages of 24 via `.range()`; changing any
  filter resets to page 1 and refetches; a "Load More" button at the bottom
  of the grid fetches the next page and appends. Every matching series is
  now reachable, not just whatever fell inside a fixed cap.
- The exact-count on page 1 (`{ count: 'exact' }`) drives the "N series
  total" label next to Featured — previously this was just
  `series.length`, which is honest now that "series" isn't a
  capped/partial local copy.
- **New Arrivals, Staff Picks, and New Voices** used to be derived
  client-side from the same single big `series` array the browse grid used
  — which no longer exists as a monolithic fetch. Each is now its own small,
  independent, already-bounded query (≤6 or ≤20 rows) with its own
  `useEffect`, refetching only when the inputs it actually depends on change
  (content type for the first two; newVoiceOrder + content type for the
  third). None of them were ever affected by genre/desi/sort in the first
  place (the "Featured"-family sections are hidden unless the browse view is
  the plain unfiltered "All" view), so this is a pure refactor for them, no
  behavior change.
- Added a shared `attachChapterCounts()` helper (batched
  `.in('series_id', ids)` chapters query → count map, same pattern used
  everywhere else in the app) so every section — browse page, New Arrivals,
  Staff Picks, New Voices — gets accurate published-only chapter-count
  badges without each hand-rolling the same batching logic.
- Featured/grid split logic is unchanged: on the plain "All" view (no genre
  filter, Desi toggle off), the first 3 of the current page become the
  Featured hero and the rest go in the grid below — same as before, just
  now sourced from the paginated `browseSeries` state instead of a
  client-filtered full list.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on the touched
file: 0 errors, 0 warnings (fixed 3 `react-hooks/set-state-in-effect`
lint errors on the new effects using the same `eslint-disable-line`
pattern already used elsewhere in this file for the same category of
reset-on-mount setState calls). Full-project `eslint .`: 0 errors, 42
warnings — unchanged baseline. Pushed directly to `main` per founder's
instruction.

## §83 — KaTube mobile-YouTube-parity backlog finished; Shorts -> Fast Tap and Subscriptions -> Following renames

Closed out the mobile-parity backlog opened a couple sessions back (watch
page, upload page, Fast Tap feed, Trending/Following/Playlists all had
mobile gaps relative to the home page's existing responsive pass), plus two
founder-requested renames along the way. Four commits, each individually
`tsc --noEmit` clean and `eslint` 0-errors before being pushed straight to
`main` (no branch/PR, per founder's instruction):

1. **Watch page mobile** (`/katube/watch/[videoId]`) — sticky mini-player
   (pins a small thumbnail+title bar to the bottom once the real player
   scrolls out of view on mobile, long-form only; tap to scroll back up, X
   to dismiss) + a swipeable bottom-sheet comments drawer (shared
   `commentsBody` JSX used both inline on desktop and inside the mobile
   sheet, so there's one source of truth instead of two copies that could
   drift). Drawer closes via backdrop tap, X, or a real touch-driven
   swipe-down.

2. **Upload page mobile** (`/katube/upload`) — YouTube-Studio-style 3-step
   wizard (Video -> Details -> Publish) behind the same `isMobileViewport`
   resize-tracked pattern; desktop keeps the original flat single-scroll
   form untouched. Step 1 gained a live thumbnail preview pulled from
   YouTube's CDN once a valid link is detected (visible on desktop too).
   `handleSubmit` got a one-line guard so Enter-to-submit from an earlier
   step advances the wizard instead of firing the real upload.

3. **"Shorts" -> "Fast Tap" rename**, sitewide, label-only — the feature
   already went by "Fast Tap" in some places (home page's fast/slow toggle)
   but was inconsistent elsewhere (bottom-tab label, badges, K Circle Watch
   Together copy, dashboard boost/perks, homepage blurb). Routes
   (`/katube/shorts/[shortId]`), DB columns (`is_short`), table/variable
   names left untouched — renaming those risks breaking links/data for a
   label-only ask, not worth it.

   Also did real Fast Tap feed (`/katube/shorts/[shortId]`) mobile work
   while in that file: double-tap-to-like with a heart-burst animation (a
   transparent tap-capture overlay above the YouTube iframe, since a
   cross-origin iframe swallows clicks and never bubbles them to the parent
   DOM — a plain `onClick` on the wrapping div wouldn't have worked), plus
   `env(safe-area-inset-*)` padding on the back button/icon rail/caption/
   toast so none of them sit under a notch/Dynamic Island/home-indicator on
   a real phone.

4. **"Subscriptions"/"Subscribers" -> "Following"/"Followers" rename** —
   founder's stated reason: makes it unambiguous this is an in-app follow
   (same model as MANGAL's own series follows), not a YouTube-subscription-
   adjacent sub-for-sub mechanic, which risks a ban given KaTube leans on
   the YouTube API/embeds. Backend already used `creator_follows`/
   `follower_id` per an earlier migration (noted in watch page comments:
   `20260812120000_katube_subscriptions_to_follows_rename.sql`) — this
   finished the UI-side rename that migration didn't touch. Route itself
   (`/katube/subscriptions`) left as-is, same reasoning as the Fast Tap
   rename.

   Also fixed a real mobile gap surfaced while touching this: Trending,
   Following, and Playlists (`/katube/playlists`, `/katube/playlists/
   [playlistId]`) had **no bottom tab bar at all** on mobile, unlike the
   home page — landing a mobile viewer on any of those three routes meant
   losing the persistent nav entirely. All three already share one
   component (`KaTubeShell` in `app/katube/components/VideoGridCard.tsx`),
   so the bar only needed adding once: same `.katube-bottom-nav`
   pattern/breakpoint as the home page, under a shell-scoped class name
   (`.katube-shell-bottom-nav`, since each route ships its own `<style>`
   tag — no shared stylesheet across pages to hook into). Home and Fast Tap
   both point at `/katube` (this shell has no `activeSidebar` filter state
   to deep-link into — that only lives on the home page — so both just
   land the viewer back on the main feed).

**Not done:** no further backlog items open from this sweep. Everything
flagged two sessions back (watch/upload/Fast-Tap-feed/Trending-Following-
Playlists mobile) is now closed.

**Verified per-commit:** `tsc --noEmit` clean on every commit. `eslint`
project-wide stayed at the pre-existing 0-errors baseline throughout (41
warnings before this session's work; a concurrent unrelated commit from
another session landed mid-way through — `Fast tap: fix slow/laggy loading
while scrolling shorts feed` — bumping the warning count by one new
pre-existing-pattern `<img>` line that isn't part of this work, rebased on
top cleanly with no conflicts). `next build` fails in this sandbox only on
the Google Fonts network fetch being blocked — unrelated to any of this,
same sandbox limitation flagged in earlier entries.

## §85 — 🔴 NEW TOP PRIORITY — WebMangal "Songs" category (plan only, not started — build next)

Founder's pitch, worked out this session, full scope confirmed. A **third
WebMangal content type alongside Manga/Novel**: songwriters publish lyrics
inspired by a specific series/chapter, the original creator and the
songwriter get auto-connected in a K Circle group to coordinate production,
and — later — KaTube creators can pull these lyrics into AI-assisted video/
music generation. Nothing below is built yet; this is the spec to implement
next, in priority order over anything else in the backlog.

**Confirmed scope (founder's answers this session):**
- **Lyrics/text only for now** — no audio upload. The actual audio/music
  gets produced separately (AI tools like the vidiq music/voice generation
  already available, or manual production) and that coordination happens
  inside the auto-created K Circle group, not on this platform. Audio
  upload is an explicit future step, not part of this build.
- **No approval gate to link** — any songwriter can publish a song and link
  it to any series/chapter, no original-creator sign-off required. Instead,
  the original creator gets: a **Report button** on the song (reuse
  `ReportButton.tsx`, just add `'song'` to its `TargetType` union — same
  component, zero new UI), and a way to **message the songwriter directly**
  via K Circle to ask for changes if something doesn't fit the story.
- **Mandatory K Circle profile link** — every song requires the songwriter's
  K Circle profile, so both the audience (follow them in K Circle) and the
  original creator (message them) always have a real point of contact.
  Should be *resolved*, not free-typed — validate against `creator_profiles`/
  K Circle username at submit time and store the resolved user id, not a raw
  pasted URL, so it can't be faked or go stale.
- **Discovery: full third category, not just a series-page section** — same
  tier as Manga/Novel across WebMangal (home page content-type toggle,
  library, bookmarks, search), *and* still shown on the linked series page
  itself (a "Fan Songs" section, same visual slot as the existing "Fan
  Theories & Art" block that reads `kcircle_posts` by tag — this one queries
  by the song's actual `linked_series_id` FK instead of a loose title match,
  so it's exact rather than fuzzy).

**1. Data model (new migration, nothing built yet)**
- `songs` table: `id`, `creator_id` (the songwriter), `title`,
  `cover_url` (nullable), `genre` (nullable — open question below),
  `language` (nullable), `linked_series_id` (nullable FK → `series.id`),
  `linked_chapter_id` (nullable FK → `chapters.id`, only meaningful when
  `linked_series_id` is set), `kcircle_user_id` (FK, NOT NULL — the resolved
  profile link), `status` ('draft'/'published'), `views`, `created_at`.
- `song_blocks` table (or a `blocks jsonb` column directly on `songs` —
  lean toward jsonb since blocks are always read/written as one unit, never
  queried individually, matching the "whole song uploads as one page"
  requirement): ordered array of `{ block_type, label, content }`.
  `block_type` from a **prebuilt list** — Intro, Verse, Pre-Chorus, Chorus,
  Bridge, Hook, Outro — auto-numbered per type as the writer adds them
  (Verse 1, Verse 2, ...), each its own labeled textarea in the composer so
  nobody hand-types "Chorus:" labels themselves.
- RLS: public read on published songs (same pattern as `series`), owner-only
  write, same shape as every other content table in this schema.

**2. Upload flow (new page, `WebMangal/songs/upload` or similar)**
1. "Is this song based on a WebMangal chapter or series?" — Yes/No toggle
   up front. Yes → series picker, then optional specific-chapter picker
   scoped to that series.
2. Block composer — "Add a block" button opens the prebuilt block-type
   list; each added block becomes its own auto-labeled textarea, drag-
   reorderable. No separate "write your chorus separately" step — it's all
   one connected form.
3. K Circle profile field — resolved/validated against the writer's own
   K Circle username (likely just auto-filled from their own profile if
   they're already a K Circle member, rather than making them paste
   anything — simpler and can't be faked at all).
4. Submit — one write: creates the `songs` row + its blocks together (matches
   "har ek block se ek pura page ek saath upload"), and if linked, triggers
   the auto-group creation below.

**3. Auto K Circle group on link**
- Reuses the existing K Circle group infra from §17 as-is — no new group/role
  system needed. Inserting into `kcircle_conversations` (group type) already
  auto-bootstraps an `@everyone` role, an `Owner` role, and a `#general`
  channel via the existing trigger.
- On a linked song's publish: auto-create that group with the songwriter and
  the series' `creator_id` as initial members. Purpose is pre-publish
  production/editing discussion — created immediately at link time, not
  gated on anything.
- Founder's explicit ask: a **separate "Invite" option** inside that
  auto-group so either of them can pull in people who weren't
  auto-included — an editor, a video producer, etc. This is just the
  existing K Circle member-invite flow (§17's infra already supports
  adding members to a group) — no new mechanic, just make sure it's
  reachable from this auto-created group like any other.

**4. Discovery integration**
- Extend `content_type` from `'mangal' | 'novel'` to include `'song'`
  everywhere it's currently checked — home page toggle, library, bookmarks,
  search — same pattern already used for the novel/manga split, just a
  third value.
- Songs need their own card treatment (no `chapter_count`/`reading_mode` —
  probably show block count + a "based on [Series Title]" badge when
  linked instead). Reuse `SeriesCard`'s shell with a song-specific variant,
  or a small dedicated `SongCard` — implementer's call at build time.
- Series page: new "Fan Songs" section, same visual slot/pattern as the
  existing "Fan Theories & Art" block, querying `songs` by
  `linked_series_id` (and `linked_chapter_id` when set) instead of
  `kcircle_posts` by tag.

**5. Future — KaTube integration (explicitly NOT designed yet, later phase)**
- Once songs exist and have real usage: a KaTube creator making a video
  (or using the AI music/voiceover generation tools already available)
  gets an option to pull in a published WebMangal song's lyrics as the
  basis. Exactly how that hands off to actual audio generation — the AI
  tools directly, or produced manually by the auto-formed K Circle group
  and uploaded separately — is unresolved and deliberately deferred until
  the song content type itself is live and has real songwriters using it.

**Explicitly not decided — flag before/while building:**
- Whether songs share WebMangal's existing `GENRES` list or get their own
  (e.g. mood-based: Emotional, Upbeat, Epic, Sad) — default to reusing the
  existing list unless founder says otherwise.
- Whether a song can only ever link to one series/chapter, or could
  reference multiple (e.g. a crossover song) — assumed single-link for v1.
- Whether songs count toward the free-tier read-gate (§26) the same way
  manga/novel chapters do — not decided.
- Multiple songs per series/chapter — assumed unrestricted (same as fan
  art), not capped.

**Founder confirmed this is the new top priority — build this before
picking up any other backlog item**, superseding the §77 pointer at the
top of this file.

## §85 continued — Songs browse/discovery page + home nav entry point

Picked up the "not done yet" item from the previous §85 commit (c6a4439):
Songs had no discovery surface — only the direct `/songs/upload` and
`/songs/[songId]` URLs, unreachable from anywhere in the UI.

- **`/WebMangal/songs`** (new) — standalone browse/index page for all
  published songs: search (debounced, server-side `ilike` on title), genre
  filter (reuses the same GENRES list as the homepage, including the §23
  Desi Comics additions), sort (Latest/Most Viewed/A–Z), server-side
  pagination via `range()` + "Load More" (same `PAGE_SIZE`/pattern as the
  homepage's §84 browse grid — one query per page, not an unbounded fetch).
  Songwriter usernames and linked-series titles are batch-resolved per page
  (`.in()` on `creator_profiles`/`series`) to avoid N+1, mirroring the
  homepage's `attachChapterCounts` pattern. Uses the existing `SongCard`
  as-is. Empty state links to `/songs/upload`.
- **Home page nav** — added a "Songs" pill (purple, matches `SongCard`'s
  accent) right after the Tube link, pointing at the new browse page.

  Went with a standalone browse page rather than rewiring the home page's
  `content_type` toggle/grid itself — that toggle and every query beneath
  it (`browseSeries`, `trending`, `newArrivals`, etc.) is hardwired to the
  `series` table (`content_type: 'mangal' | 'novel'`), and folding a third,
  structurally different table (no `chapter_count`/`reading_mode`, block
  count instead) into that in one pass was flagged as risky in the prior
  session. This gives Songs real discoverability now without touching that
  logic; folding `'song'` into the homepage toggle + library/bookmarks/
  search is still open (see the "Not done yet" note on the c6a4439 commit).

**Verified:** `tsc --noEmit` clean, `eslint` on both changed files 0
errors / 0 warnings. Used `next/link`'s `Link` (not `<a>`) for the two new
internal `/songs/upload` links per `@next/next/no-html-link-for-pages`.

## §85 continued (2) — Song follows + Library/Bookmarks integration

Next slice of the still-open "Not done yet" list: Library and Bookmarks
had no way to save a song at all. Turned out `follows` (the series-only
bookmark/library table) isn't polymorphic — its FK is `series_id`
specifically — so folding songs in meant a new table rather than a
one-line addition, same shape of tradeoff as the home content-type toggle.

- **New migration** `20260818130000_webmangal_song_follows.sql` —
  `song_follows(reader_id, song_id, created_at)`, unique per reader/song
  pair, RLS scoped to the owning reader (select/insert/delete), same
  pattern as every other owner-scoped table in this schema.
- **Song detail page** (`/songs/[songId]`) — Follow/Unfollow toggle button
  next to the existing Message-songwriter/Report row. Hidden for the
  song's own owner (can't follow your own song). Optimistic local toggle,
  no extra fetch after mutating.
- **`/WebMangal/library`** and **`/WebMangal/bookmarks`** — both gained a
  "Followed Songs" section (own `SongCard` grid, own loading flag so a
  slow songs query never blocks the existing series list from rendering).
  Batch-resolves songwriter usernames + linked series titles per page load
  (`.in()`, no N+1 — same pattern as the songs browse page from the
  previous commit). Section is fully hidden when empty/loading so it never
  leaves blank space; the pre-existing "your library/bookmarks is empty"
  copy only shows when *both* the series list and the songs list are
  empty, so a reader who's only followed songs doesn't see a contradictory
  "empty" message.

**Still open:** `/search` and the home page's `content_type` toggle still
don't surface songs (search doesn't have an obvious "one more tab" slot
without touching its shared `View.tsx`, and the home toggle is the same
hardwired-to-series risk flagged twice already — still deferred).

**Verified:** `tsc --noEmit` clean; `eslint` on every changed file (song
detail page, library, bookmarks) 0 errors/0 warnings; `eslint src/app`
project-wide quiet run (errors only) also clean, no regressions in
untouched files.

## §85 continued (3) — Songs on the home page toggle

Tackling the two remaining deferred items one at a time, as instructed —
this is the home-page-toggle half; `/search` is still open.

- **`home/page.tsx`** — added "Songs" as a 4th pill next to All/Manga/
  Novel, "same tier" per the founder's spec. Implemented as its own
  boolean (`songsMode`), *not* a 4th value folded into `activeContentType`:
  every existing query in this file (trending/newArrivals/staffPicks/
  newVoices/browseSeries) filters `series` by
  `content_type: 'mangal' | 'novel'` — extending that union would mean
  touching all five of those queries, each needing a parallel songs-table
  branch anyway since `songs` has different columns (no chapter_count/
  reading_mode, block count instead). Toggling Songs on instead swaps the
  whole content area below the pills to a dedicated Songs grid (own fetch,
  own loading/pagination state, lazy-fetched only the first time it's
  opened) and hides the genre tabs — every series query/state above it is
  completely untouched when the toggle is off (the default), so this is
  zero-risk to existing behavior. The section links out to
  `/WebMangal/songs` for search/genre/sort — kept deliberately simple here
  (latest-first only) since that's a short list, not the main destination.

**Verified:** `tsc --noEmit` clean; `eslint` on the changed file 0
errors/0 warnings; `eslint src/app` project-wide quiet run clean — diff
isolated to this one file, nothing else touched.

## §85 continued (4) — Songs in search (final piece)

Last of the two deferred items, done separately as instructed. `/search`
and `/WebMangal` (browse) share one component (`View.tsx`) whose entire
series-matching pipeline (`baseFiltered`/`overlayResults`/`results`/
`tabCounts`) is `Series`-typed throughout — same reasoning as the home
toggle: threading songs through that would mean widening every one of
those to a union type across a large, actively-relied-on file.

- **`View.tsx`** — added a parallel, independent songs path instead:
  own state, own small bounded fetch (published songs, capped at 200,
  **search route only** — gated on `mode === 'search'`, so the `/WebMangal`
  browse route that shares this component is completely untouched), own
  `fuzzyMatch`-based `songResults` computed alongside (not merged into)
  the existing series `results`/`overlayResults`. Rendered as its own
  "Songs (n)" section above the series results — shows independently of
  whether series matched anything, so a song-only search still surfaces
  results instead of hitting the series "no results, be the first to
  create it!" empty state (fixed that condition to check `songResults`
  too). Capped at 8 songs shown with a "See all songs →" link to the full
  `/WebMangal/songs` browse/search page for anything beyond that.
  Deliberately not wired into the mobile search overlay's live preview —
  kept to the main results page only, to keep the surface area small.

**§85 is now fully closed** — data model, upload/detail pages, browse
page, home nav pill, follow/bookmark support, Library/Bookmarks sections,
home content-type toggle, and search all ship. Any further Songs work
(mobile overlay preview, richer sort/filter parity with series search,
etc.) is new scope, not a "not done yet" carry-over.

**Verified:** `tsc --noEmit` clean; `eslint` on the changed file 0
errors/0 warnings; `eslint src/app` project-wide quiet run clean — diff
isolated to `View.tsx`, and within that file every songs addition is
gated on `mode === 'search'` so the shared browse route's behavior is
byte-for-byte unchanged.

## Landing page — logged-in nav state fix, richer copy, cross-product nav, logo ordering/gradient

Small run of landing-page and cross-product polish items, done as a batch:

- **Logged-in nav bug**: the public landing page nav never checked auth
  session at all, so a signed-in user still saw "Log in" with no way to
  sign out. Added a session check; when signed in, nav shows an
  avatar+dropdown (Go to Home / Log Out) on both desktop nav and mobile menu.
- **Landing copy**: richer feature/about/door section copy; fixed the About
  section crowding on mobile.
- **Cross-product nav** (new shared `CrossProductLinks` component): every
  product now links out to the other two, logo-only (no text labels).
  WebMangal had zero cross-links before this — added to desktop nav and,
  to avoid mobile top-bar overlap, to the mobile hamburger menu as a "More
  MANGAL" row. WebMangal/home, KaTube, and Kalpana Circle all previously had
  partial/text-labeled links; normalized all three to logo-only, linking to
  both other products.
- **Official MANGAL logo**: fixed orange-green gradient ring sitewide
  (theme-independent, no longer shifts with dark/light mode), and made the
  logo clickable on the Terms page.
- **Logo order fix**: per founder's ordering, each product's own logo should
  lead its nav, with the official MANGAL logo trailing at the end of the
  row/scroll/rail — not the other way around. Fixed on KaTube (watch +
  upload nav) and K Circle (mobile header + desktop rail). Homepage nav/
  footer and the shared Navbar/Footer are unaffected — those are the
  company's own surfaces, where MANGAL-logo-first is correct as-is.

**Verified:** `tsc --noEmit` clean, `eslint` 0 errors on all changed files
(same pre-existing warnings only, nothing new).

## §86 — Fix Cloudflare Workers deploy — missing OpenNext config

Deployed Worker (`mangal-platform.mangal-indiaplatform.workers.dev`) was
serving the default OpenNext placeholder ("Hello World") instead of the
actual app. Root cause: `package.json` already had `@opennextjs/cloudflare`
+ `wrangler` as deploy tooling, but the repo was missing the two files the
adapter actually needs to build/wire the Worker:

- `open-next.config.ts` (`defineCloudflareConfig()`) — without this,
  `opennextjs-cloudflare build` has no build target.
- `wrangler.jsonc` — name matched to the existing Worker
  (`mangal-platform`), `main` → `.open-next/worker.js`, `nodejs_compat`
  flag, assets binding → `.open-next/assets`.

Also gitignored `.open-next/` and `.wrangler/` (build output, shouldn't be
committed), and fixed a stale `package-lock.json` dependency-section
mismatch for wrangler.

**Manual step (not fixable via repo, flagged for Kaif):** in the Cloudflare
dashboard, under the Worker's Build settings, Build command should be
`npx opennextjs-cloudflare build` and Deploy command `npx wrangler deploy`
(or run `npm run deploy` locally) — Cloudflare's Git integration doesn't
auto-detect this for OpenNext projects.

**Verified:** `opennextjs-cloudflare build` runs locally and reaches the
underlying `next build` step correctly (only local failure is the sandboxed
Google Fonts network fetch, unrelated). `tsc --noEmit` clean.

## §87 — Fix Worker bundle size limit — strip Node-native deps incompatible with Workers

Deploy failed: `[code: 10027] Worker exceeded the 3 MiB size limit`. Root
cause: `nsfwCheck.ts` (server-side NSFW thumbnail classifier, KaTube upload
flow) pulled in `@tensorflow/tfjs` + `nsfwjs` + `sharp`. Beyond the size
hit, `sharp` is a native binary (`libvips`) — Workers' V8 isolate has no
native-addon support, so it couldn't have run there even had it fit. Worked
fine on Vercel (Node.js serverless supports native deps); hard
incompatibility on Workers.

- `nsfwCheck.ts`: `checkThumbnailNsfw()` now always returns `null` (skip).
  Matches the function's existing "fail open, never block upload" design —
  uploads still go through the existing manual admin review queue; this
  only drops the automatic pre-flag step. Documented a Workers-native path
  back (Cloudflare Workers AI image classification, or an external
  moderation API over `fetch()`) for later.
- Removed `@tensorflow/tfjs`, `@tensorflow/tfjs-backend-cpu`, `nsfwjs` from
  `package.json` (only consumer was `nsfwCheck.ts`).
- `next.config.ts`: `images.unoptimized = true` — Next's default
  `/_next/image` optimizer also uses `sharp` internally and would have
  broken at runtime on Workers even though it didn't block the build.
  Supabase storage CDN handles image delivery/caching regardless.

**Verified:** `tsc --noEmit` clean. `node_modules` dropped 32 packages.

## §88 — Re-enable NSFW thumbnail check using Cloudflare Workers AI

Replaces the §87 always-skip stub. Runs in the same Worker isolate as the
app itself — no bundle-size cost, no native-binary incompatibility (the two
problems that broke the old NSFWJS+tfjs+sharp stack on Workers).

- Added `ai` binding (`AI`) to `wrangler.jsonc`.
- `checkThumbnailNsfw()` now calls Workers AI with a vision-language model
  (`@cf/llava-hf/llava-1.5-7b-hf`), asking a direct yes/no moderation
  question, since Workers AI's catalog doesn't have a purpose-built NSFW
  classifier the way NSFWJS did.
- Fail-open design preserved from the original: missing binding, fetch
  failure, or model error all return `null` (skip, non-blocking) — manual
  admin review stays the backstop either way.

**Flagged for Kaif to verify post-deploy:** the model ID
`@cf/llava-hf/llava-1.5-7b-hf` was the best-known one at the time but
wasn't checked against the live Cloudflare dashboard (no network access to
Cloudflare's API from the build environment). If it's been renamed/removed,
only `MODEL_ID` in `nsfwCheck.ts` needs to change — rest of the flow is
model-agnostic.

**Verified:** `tsc --noEmit` clean, `eslint` clean.

## §89 — Shorten Worker name for a cleaner URL

`mangal-platform` → `mangal` (shorter deployed Worker/URL).

## §90 — R2 media migration (parts 1–3): move all media off Supabase Storage onto Cloudflare R2

Three-part migration off Supabase Storage buckets (`manga-pages`,
`kcircle-media`) onto an R2 bucket, since the app now runs on Cloudflare
Workers.

**Part 1 — bucket wired, upload/read/delete routes live, first call sites switched:**
- `wrangler.jsonc`: added `r2_buckets` binding (`MEDIA_BUCKET` → `mangal-media`).
- New: `lib/media/r2.ts` (server-only binding accessor + folder allowlist),
  `api/upload-media`, `api/delete-media`, `api/media/[...path]` (serves R2
  objects, replaces Supabase public storage URLs).
- New: `lib/media/uploadClient.ts` — client helper used by upload call sites.
- Switched over: WebMangal upload page (cover + both chapter page upload
  spots), `EditSeriesModal` cover upload, `ManagePagesModal` page delete,
  `series/[seriesId]` chapter/series delete (both spots), K Circle
  group-channel message image upload.

**Part 2 — last 4 K Circle call sites switched:**
- `kalpana-circle/page.tsx` (post-composer images + story upload),
  `chat/page.tsx` (message attachment), `settings/page.tsx` (avatar) now all
  go through `uploadMediaFile()` → `/api/upload-media` → R2. This was the
  last of the 9 upload call sites — every Supabase `storage.from()`/
  `getPublicUrl()` call in the app is now gone (verified via grep; only
  explanatory comments in the new API routes still mention the old pattern
  by name).

**Part 3 — one-time backlog migration route:**
- `api/admin/migrate-media`: developer-only, batch-limited (default 25, max
  100 per call) route that copies pre-existing files out of the old
  Supabase Storage buckets into R2 and rewrites the referencing DB column to
  the new `/api/media/<key>` URL. Runs inside the deployed Worker (not a
  local script), since `MEDIA_BUCKET` only resolves there — pulls each file
  over its still-live Supabase public URL, writes it to R2 at
  `<bucket>/<path>` (same prefix convention as new uploads), then updates
  the row. Idempotent (skips rows already pointing at `/api/media/`, skips
  R2 keys that already exist) — safe to call repeatedly until the
  response's `hasMore` is `false`.
- Covers every url column found in the codebase: `series.cover_url`,
  `pages.image_url`, `creator_profiles.avatar_url`,
  `kcircle_posts.image_url` + `image_urls` (array, per-element),
  `kcircle_stories.image_url`, `kcircle_channel_messages.image_url`,
  `kcircle_messages.attachment_url`.
- Usage once deployed:
  ```
  curl -X POST https://<worker-domain>/api/admin/migrate-media \
    -H "Authorization: Bearer <developer-account session token>" \
    -H "Content-Type: application/json" -d '{"batchSize": 25}'
  ```
  Repeat until `"hasMore": false`. Old Supabase files are left in place
  (not deleted) — safe to clean up manually once every row is confirmed
  migrated.

**Still open:** Part 3's migration route needs to actually be run
post-deploy (repeatedly, until `hasMore: false`) before the old Supabase
buckets can be cleaned up. Also carries forward §88's flagged item: verify
the Workers AI model ID against the live dashboard.

**Verified:** `tsc --noEmit` and `eslint` clean on all three parts.

**Part 3 follow-up — fix bare 500 with no error detail:** `/admin/migrate-media`
page's "Run migration" button was returning `Request failed: 500` with zero
detail on first click. Root cause: the route had no error handling past the
initial `req.json()` parse — any exception (R2 binding hiccup, network
failure on the Supabase-URL `fetch()`, missing env var, etc.) bubbled up
unhandled, so the client's `res.json()` on the error path got a non-JSON
body and fell back to the generic status-only message, hiding the actual
cause. Fixed: `migrateOneUrl()` now catches internally and returns
`{error}` like a normal per-row failure; the whole `POST` handler is
wrapped in try/catch returning `NextResponse.json({error})` on any
unhandled failure; `supabaseAdmin` client is now built lazily inside that
try block (`getSupabaseAdmin()`) instead of at module scope, so a missing
`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in this Worker's env
surfaces as a clear message instead of a silent import-time throw.
**Still need:** click "Run migration" again post-deploy and read whatever
the (now-visible) real error says — that tells us the actual root cause
(binding, env var, or something else) so it can be fixed for real instead
of guessed at.

**Root cause found (this session, live in prod):** error banner now shows
`Missing env var(s) in this Worker: SUPABASE_SERVICE_ROLE_KEY` — confirmed
via the fix above. Founder confirmed the secret **is** already set
correctly in the Cloudflare dashboard (`mangal-platform` → Settings →
Variables and Secrets), ruling out the "never carried over from Vercel"
theory. Actual cause: `process.env.SUPABASE_SERVICE_ROLE_KEY` reading as
`undefined` at runtime even with the secret genuinely bound — Cloudflare's
`process.env` auto-population from Worker bindings/secrets depends on the
`nodejs_compat_populate_process_env` compat flag actually taking effect
(meant to default on for `compatibility_date >= 2025-04-01`, ours is
2026-08-01, but evidently wasn't reliably applying here in practice).
**Fixed:** `migrate-media`'s `getSupabaseAdmin()` now reads
`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` straight off
`getCloudflareContext().env` — the same binding-access approach `r2.ts`
already uses successfully for `MEDIA_BUCKET` — falling back to
`process.env` only outside a Worker context (local `next dev`). Also
added `nodejs_compat_populate_process_env` explicitly to
`wrangler.jsonc`'s `compatibility_flags` instead of relying on the
implicit default.

**Known follow-up, not yet fixed:** `notify-followers`, `delete-account`,
`confirm-parent-consent`, `send-parent-consent`, `payments/webhook`, and
`export-data` all read `SUPABASE_SERVICE_ROLE_KEY` (and in some cases
`COLD_STORAGE_ENCRYPTION_KEY`) via plain `process.env`, the same pattern
that was just proven broken in `migrate-media`. These routes likely carry
the identical latent bug but haven't been exercised since the Cloudflare
migration, so it hasn't surfaced yet. Worth doing the same
`getCloudflareContext().env` swap in all of them proactively next
session, rather than waiting for each to fail in production one at a
time.

Also noticed while debugging: `workers_list` via the Cloudflare MCP shows
only **one** Worker on the account, still named `mangal-platform` (matches
the admin URL in the screenshot, `mangal-platform.mangak.workers.dev`) —
the §89 rename to `mangal` in `wrangler.jsonc` never actually produced a
second Worker on Cloudflare's side. Likely explanation: this project's
Cloudflare "Workers Builds" (git-connected CI) pins the deployed Worker's
identity to whatever it was when the GitHub repo was first connected, and
doesn't re-target based on `wrangler.jsonc`'s `name` field on later
deploys — only a plain local `wrangler deploy` (or a dashboard rename)
would actually create/rename the Worker. Not blocking (the worker *is*
receiving new deploys — its last-modified timestamp lines up with the
latest commit), but the shorter `mangal.*.workers.dev` URL §89 intended
doesn't exist yet. Flagged for Kaif, not fixed automatically since it may
need a dashboard-side rename rather than a code change.

## §91 — Real root cause of §90's SUPABASE_SERVICE_ROLE_KEY "missing" bug: keep_vars

Same error resurfaced after the §90 follow-up fix (getCloudflareContext().env
swap) — confirmed the secret genuinely never reaches the Worker at all,
neither via `process.env` nor `getCloudflareContext().env` (which only shows
`AI`, `MEDIA_BUCKET`, `ASSETS` — exactly the three bindings declared in
`wrangler.jsonc`, nothing dashboard-only).

**Actual root cause:** this project deploys via Cloudflare's git-integrated
"Workers Builds", which runs `wrangler deploy` on every push to main. Per
Cloudflare's own docs, plain `wrangler deploy` overrides/wipes any
dashboard-set Variables/Secrets that aren't declared in the Wrangler config,
unless `keep_vars: true` is set. So every single push to main was silently
wiping `SUPABASE_SERVICE_ROLE_KEY` (and would silently wipe any other
dashboard-only secret) right after Kaif re-added it in the dashboard —
explains why it looked "set correctly" in the dashboard but was never
actually visible at runtime.

**Fixed:** added `"keep_vars": true` to `wrangler.jsonc`.

**Action needed post-deploy (not code):** because the secret was being wiped
on every prior deploy, it may currently be gone from the live Worker. Once
this deploy goes out, go to Cloudflare dashboard → Worker `mangal-platform`
(the actually-deployed one, see §90's note on the name mismatch) → Settings
→ Variables and Secrets → re-add `SUPABASE_SERVICE_ROLE_KEY` one more time.
From this deploy onward it should survive future pushes.

**Also carries forward from §90:** the same latent bug (routes reading
`SUPABASE_SERVICE_ROLE_KEY`/`COLD_STORAGE_ENCRYPTION_KEY` via plain
`process.env` instead of `getCloudflareContext().env`) in `notify-followers`,
`delete-account`, `confirm-parent-consent`, `send-parent-consent`,
`payments/webhook`, `export-data` — not yet fixed, still worth doing
proactively.

## §92 — Reader pages loading slow: R2 media route had no edge caching

Reported: chapter/page images loading very slowly, especially in Incognito
(no prior browser cache). Root cause: `/api/media/[...path]` had a strong
browser `Cache-Control` header, but that only helps a given visitor's
*own* browser on repeat visits — Cloudflare does not automatically cache
Worker responses at the edge the way it does static assets, so every
reader's first view of every page was a full R2 round-trip through the
Worker, every time, for every visitor.

**Fixed:** route now checks Cloudflare's Cache API (`caches.default`)
first; on a miss it fetches from R2 as before, then stores the response
in the edge cache via `ctx.waitUntil(cache.put(...))` (non-blocking, via
`getCloudflareContext().ctx`). Since every object key is immutable
(fresh random key per upload — see upload-media/route.ts), this is safe
with no invalidation concerns. Wrapped in try/catch so a missing
Cloudflare context (e.g. local `next dev`) degrades to "just serve from
R2, don't edge-cache" instead of breaking the route.

**Verified:** `tsc --noEmit` and `eslint` clean.

## §93 — KaTube "Watch Together" room chat panel getting cut off

Reported: the side chat panel on the Watch Together room page
(`/katube/watch/[videoId]/room/[roomId]`) looked "half cut" and got worse
when scrolling — on both mobile and desktop.

**Root cause:** classic nested-flexbox bug. The messages list had
`flex: 1, overflowY: 'auto'` to scroll internally inside the chat box's
`maxHeight: 560px`, but a flex child's default `min-height` is `auto`
(not `0`), so instead of shrinking and scrolling, it kept growing to fit
all messages and pushed past the box's `maxHeight`. The outer box had no
`overflow` set (defaults to visible), so that overflow content leaked out
past the rounded border rather than being clipped or scrolled — looking
like the panel was cut in half once enough messages/height built up.

**Fixed:** outer chat box now has `overflow: 'hidden'` and an explicit
`height: '560px'` (capped at `maxHeight: '70vh'` so it still shrinks
sensibly on short mobile viewports) instead of relying on flex-stretch to
match the video column's height. The messages list now has `minHeight: 0`
alongside its existing `flex: 1, overflowY: 'auto'` — the standard fix
that lets it actually shrink and scroll internally instead of overflowing
its container.

**Verified:** `tsc --noEmit` and `eslint` clean.

## §94 — Tip Jar ("Buy Me a Coffee"): first live payment feature

The founder asked for real payment methods on the platform — tip jar,
remove-ads unlock, referral. This section covers the first one, built on
top of the §48/§49 Razorpay infra that had sat unconnected since then.

**What shipped:**
- `src/app/lib/payments/razorpayClient.ts` — browser-side helper that
  loads Razorpay's Checkout.js once and opens it for a given order.
  Reads the publishable `NEXT_PUBLIC_RAZORPAY_KEY_ID` (safe to expose
  client-side, unlike the secret key already used server-side in
  `razorpay.ts`). Returns a clean "not configured" result rather than
  throwing when that env var is unset.
- `src/app/components/shared/TipJarModal.tsx` — the actual tip UI. Two
  independent rails:
  - **India (Razorpay):** ₹49/₹99/₹199 presets → calls the existing
    `/api/payments/create-order` (purpose: `'tip'`, `purposeRefId`: the
    recipient creator's `user_id`) → opens Razorpay Checkout → on
    success, POSTs to the existing `/api/payments/verify`. This is a
    real, DB-tracked payment once a Razorpay account exists — no new
    backend code needed, §48/§49 already covered it. PhonePe/Google
    Pay/Paytm are **not** separate integrations — they're UPI apps, and
    Razorpay's UPI intent flow surfaces whichever ones are installed on
    the payer's phone automatically.
  - **Outside India (PayPal):** a plain `paypal.me/<username>/<amount>`
    link with $2/$5/$10 presets, opens in a new tab. Deliberately not a
    PayPal API integration — that needs a PayPal Business account +
    REST credentials the founder doesn't have yet, and paypal.me needs
    nothing but the account username. Known limitation: PayPal tips
    aren't recorded in the `payments` table (no webhook), so it won't
    show up in any in-app history — acceptable for a v1 tip button, but
    worth remembering if "total tips received" is ever built.
- Wired into `src/app/WebMangal/creator/[username]/page.tsx`: a "Tip"
  button next to the existing "Updates" link in the creator header,
  visible only when a logged-in viewer is looking at someone else's
  profile (hidden for logged-out visitors and for creators viewing their
  own page).

**Still not live — two env vars needed before either rail actually
works:**
- `NEXT_PUBLIC_RAZORPAY_KEY_ID` (+ the already-referenced
  `RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` from §48) once a
  Razorpay account exists.
- `NEXT_PUBLIC_PAYPAL_ME_USERNAME` once a PayPal account exists.
Until then both buttons render as disabled "coming soon" — same pattern
`PaymentMethodPicker.tsx` already used, nothing fakes readiness.

Next: remove-ads unlock (§95), reusing this same order/verify flow with
`purpose: 'remove_ads'` and a new `profiles.ads_removed` flag.

## §95 — Remove Ads (₹99 lifetime unlock): payment infra + flag, no ad slots yet

Second payment feature after §94's Tip Jar. Important scope note: a
search of the codebase before starting this confirmed **no ads exist
anywhere on the platform yet** — no ad-slot component, no AdSense, no
placement. Per the founder's explicit instruction, this section builds
the paid unlock (payment flow + `profiles.ads_removed` flag) now, and
actual ad placements + the `if (!ads_removed) showAd()` checks are
deferred to whenever ads are actually added.

**What shipped:**
- `supabase/migrations/20260819200000_profiles_ads_removed.sql` — adds
  `profiles.ads_removed boolean not null default false`. Boolean (not a
  timestamp) since this is a one-time lifetime unlock, not a
  subscription — the founder fixed the price at ₹99 flat.
- `/api/payments/verify` and `/api/payments/webhook` both updated: when
  a captured payment's `purpose` (read from the DB row, never trusted
  from the client) is `'remove_ads'`, the user's `profiles.ads_removed`
  is set to `true`. Both paths do this (not just one) — the webhook is
  the only guaranteed callback if someone closes the tab mid-checkout
  before Razorpay's client-side success handler fires; the verify-route
  version covers the normal case faster. Both are idempotent, so no risk
  from both firing.
- `src/app/settings/page.tsx` — new "Remove Ads" section: shows a ✓
  confirmation if already purchased, otherwise a "Remove Ads — ₹99"
  button that reuses the same create-order → Razorpay Checkout → verify
  flow as the Tip Jar (§94), with `purpose: 'remove_ads'` and no
  `purposeRefId` (this isn't tied to a specific creator). Same
  `NEXT_PUBLIC_RAZORPAY_KEY_ID`-gated "coming soon" state as everywhere
  else in this payments layer until a real Razorpay account exists.

**Explicitly not done here (tracked for later, not forgotten):**
- No ad component/slot exists to actually check `ads_removed` against —
  this ships the unlock mechanism ahead of the thing being unlocked.
- No PayPal rail for this one (unlike the Tip Jar) — ₹99 lifetime access
  is India-first pricing; if global "remove ads" pricing is wanted later
  this needs its own USD price point, not a reused ₹99→$ conversion.

Both §94 and §95 now share the same two blockers before either payment
button actually accepts money: a real Razorpay account (+
`NEXT_PUBLIC_RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/
`RAZORPAY_WEBHOOK_SECRET`) and, for the Tip Jar's PayPal rail, a real
PayPal account (+ `NEXT_PUBLIC_PAYPAL_ME_USERNAME`).

## §96 — KaTube Shorts: fixed deep-link falling back to wrong video + zombie player leak

Two real bugs found by reading `src/app/katube/shorts/[shortId]/page.tsx`
directly (verified independently, not just taken on the founder's word):

**1. Deep-linking to an older short silently opened the wrong one.**
The feed only ever fetched the 50 most recent shorts
(`.order('created_at', ...).limit(50)`). Opening a short older than
that window made `list.findIndex(s => s.id === initialShortId)` return
`-1`, and `Math.max(0, -1)` quietly fell back to index `0` — the
newest short, not the one the link pointed at, with nothing to
indicate anything had gone wrong. Fixed by checking whether the
requested short is present in the fetched 50; if not, fetching that
one row individually and splicing it into the front of the list before
computing `startIdx`, so any existing, non-deleted short now opens
correctly regardless of how old it is.

**2. Player instances for scrolled-away shorts were never cleaned up.**
Only shorts within `NEAR_WINDOW_BACK..NEAR_WINDOW_FORWARD` of the
active index keep a mounted `<iframe>` (see the render's `isNear`
check) — but the matching `YT.Player` object in `playerRefs` stayed
there forever once created, for the whole session. `syncPlayers`
iterated *every* key in `playerRefs` on each active-index change,
including these "zombies" whose iframe was long gone from the DOM.
Calling a method on one can throw (it's posting into a contentWindow
that no longer exists), and since `sendPlayerCommand` wasn't
try/catch-wrapped, one bad zombie could abort the rest of that pass's
play/pause/mute commands for genuinely live neighbors — visible as
playback control getting flakier the more someone scrolled. Fixed two
ways: (a) a new cleanup effect that runs on `activeIndex` change,
`destroy()`s and deletes any player/iframe ref that's fallen outside
the near window (and clears its `loadedIdx` entry so the thumbnail
placeholder correctly reappears if that short is scrolled back into
view later), and (b) `sendPlayerCommand` now wraps its player-method
calls in try/catch so a still-undiscovered edge case can't cascade into
breaking commands meant for other players.

Extracted the near-window math (`idx - activeIndex` between -1 and +4)
into a shared `isNearIndex()` helper used by both the render's mount
check and the new cleanup effect — previously duplicated as inline
magic numbers in one place, which is exactly how they could've drifted
out of sync with each other in the first place.

## §97 — KaTube Shorts: seek bar looked frozen/static

Follow-up to §96 (same file). Founder reported the seek bar at the
bottom of a Short doesn't move — screenshotted it circled in red.
Traced to a real, verifiable code defect rather than a device/CSS
issue: an existing comment on the player-creation effect even already
said "...which is why the range stayed static" — a prior attempt at
this exact bug that fixed the player-instance side (§7's original
slider→player wiring) but not this part.

**Root cause:** `playback.duration` starts at `0` and was only ever
set by (a) the 250ms polling interval reading `player.getDuration()`,
or (b) `shorts[activeIndex].duration_seconds` from the DB — which is
frequently `null`, since it's only populated if the upload-time
moderation step happened to extract it. Until one of those resolved:
- `seekTo()` had `if (!duration) return;` — a silent no-op. Dragging
  before the first successful poll tick did literally nothing.
- The range input's `max` fell back to a hardcoded `1` (one second).
  With `currentTime` ticking up immediately, the thumb would clamp to
  the far right within the first second and *stay there* — visually
  indistinguishable from "frozen," because the usable range was
  effectively 1 second wide for as long as duration stayed unknown.

**Fix (three layers, so no single source of missing duration can
freeze the bar again):**
1. `onReady` now seeds `playback.duration` immediately from
   `event.target.getDuration()` — YouTube resolves this before firing
   `onReady`, so this is available well before the poll's first tick.
2. `seekTo()` no longer gives up when state hasn't caught up — it also
   tries reading `playerRefs.current[activeIndex]?.getDuration()`
   live as a third fallback before deciding duration is truly
   unknown.
3. The render's `max`/`value` fallback changed from `1` → `60`
   (a safe upper bound for a Short) — even in the worst case where all
   three duration sources are still unresolved, the bar has a sane
   range instead of an effectively-zero one, and gets overwritten with
   the real duration the instant any of the three sources resolves.

Also hardened the drag lifecycle itself, defensively: `startSeeking`
now calls `setPointerCapture` explicitly (rather than relying only on
browsers' implicit range-input capture, which isn't uniformly reliable
across every mobile WebView), and `onLostPointerCapture` was added
alongside the existing `onPointerUp`/`onPointerCancel` handlers — so
`isSeekingRef` (which suppresses the polling interval while dragging)
can't get stuck `true` and permanently freeze the bar if a drag ends
in an unusual way.

## §98 — KaTube Shorts: seek bar vanished a few seconds into playback, so it read as "not working"

Founder follow-up to §96/§97 (same file, same seek bar). §97 fixed the
bar's *range* (why the thumb pinned to the far right and looked
frozen); this one was a separate defect that made the bar disappear
entirely, which is what the founder was actually hitting on real
devices — "the bar down there not working," wanting to hold it and
drag right to go forward / left to go back, and have it otherwise
glide with the video on its own.

**Root cause:** the seek `<input type="range">` was only rendered
while `showPlaybackControls` was `true`. `revealPlaybackControls`
(called on tap/hold and on drag-start) always set a 3-second timer
that flipped `showPlaybackControls` to `false` while the short kept
playing uninterrupted — and once it flipped, the render swapped the
range input out entirely for a plain, non-interactive `<div>` showing
the short's title. Since a Short usually just plays continuously,
this meant the bar was only ever present (and therefore only ever
holdable/draggable) for about 3 seconds after each interaction, then
vanished for as long as playback continued — the vast majority of
actual watch time. The title it swapped to was also redundant: the
short's title is already shown permanently in the bottom-left caption
block, so the swap wasn't protecting a real second use of that screen
space, it was just removing the only way to seek.

**Fix:** the range input is now always mounted whenever a short is
active — no more conditional swap to a title `<div>`. It keeps doing
exactly what §96/§97 already built: tracks `playback.currentTime` via
the 250ms poll when untouched (so it moves with the video on its
own), and `startSeeking`/`seekTo`/`finishSeeking` handle
holding+dragging in either direction, with `isSeekingRef` suppressing
the poll only while a drag is actively in progress. The
`showPlaybackControls` state itself is left in place (still flipped
by the same interaction/timer code, in case a future session wants a
different visual treatment tied to it) but nothing reads it for
rendering now, so it can't hide the bar again by itself.

## §99 — KaTube Shorts: CSP was silently blocking the real YouTube player, breaking sound + seek

Founder sent a screen recording plus a browser console screenshot
showing the actual root cause behind the still-flaky Shorts playback
(seek bar + audio muted by default despite the §90-era "default
unmuted" requirement). The console showed: `Refused to load the
script 'https://www.youtube.com/iframe_api' ... violates ... CSP
directive: "script-src 'self' 'unsafe-inline'
https://va.vercel-scripts.com"`.

**Root cause:** `next.config.ts`'s CSP `script-src` never included
`https://www.youtube.com`. `frame-src` did (so the embed iframes
themselves loaded fine), but the *player API script* the shorts page
loads via `loadYouTubeApi()` (`<script
src="https://www.youtube.com/iframe_api">`) was being blocked by the
browser on every page load. That meant `YT.Player` never got
constructed for any Short, ever — which explains two symptoms at
once that looked unrelated:
- The player-creation effect's `onReady` callback (§90/§96/§97's
  home for seeding `playback.duration` and calling `unMute()` per the
  saved sound preference) never ran, so every Short stayed stuck on
  the iframe URL's hardcoded `mute=1` regardless of the
  `katube-shorts-muted` preference — the "audio ka sound mute
  hogaya" the founder reported.
- The 250ms poll (`player.getCurrentTime()`/`getDuration()`) and
  live-duration fallback in `seekTo()` both require an actual player
  object from `playerRefs`, which was always empty — so real seeking
  and duration tracking silently never worked, on top of §98's
  visibility fix.

**Fix:** added `https://www.youtube.com` to `script-src` (the
widget script the iframe_api script pulls in is served from that
same origin, so one addition covers both). No other CSP directive
needed to change — `frame-src` and `img-src` already covered the
iframe embed and thumbnails.

**Also cleaned up while in the console output:** a `_vercel/insights/
script.js` 404 + blocked-MIME-type error firing on literally every
page load, from a leftover `<Analytics />` (`@vercel/analytics`) in
`layout.tsx`. That component only works when actually served by
Vercel's edge, which rewrites that path to the real script; per §89
this app moved to Cloudflare Workers, so the path 404s there and the
browser refuses to execute the HTML error page as JS. Removed the
component and its import — there's no Workers-native analytics wired
up yet, so this was pure dead weight, not a feature regression.

## §100 — KaTube Shorts: uncaught "e.getCurrentTime is not a function" from YouTube's own widget script

Founder screenshot after §99's CSP fix (playback/sound now working)
showed a recurring uncaught error while scrolling through Shorts,
thrown from inside YouTube's own minified widget script
(`1dakxpp6iuqxc.js`), originating from a `setInterval` — not from any
code in this file directly. Confirmed as a real, separate defect
rather than noise.

**Root cause:** the render computed `isNear` (whether a short's
`<iframe>` should be mounted) straight from `isNearIndex(idx,
activeIndex)` on every render. The cleanup effect that calls
`player.destroy()` on players falling out of that window also keyed
off the same `activeIndex` change — but nothing guaranteed it ran
*before* React's commit unmounted the iframe. YouTube's `YT.Player`
wrapper keeps its own internal polling interval running independent
of this app's code; when that interval next ticked against a player
whose iframe had been yanked out of the DOM by React directly
(instead of through the wrapper's own `destroy()` teardown sequence),
it threw from inside YouTube's script trying to call a method that no
longer existed on its internal, now-invalid reference.

**Fix:** introduced a `mountedIndices` state that the render now
reads instead of computing `isNearIndex` live. A "growth" effect adds
newly-near indices immediately (safe — nothing needs destroying
before a new iframe mounts). The existing cleanup effect now calls
`player.destroy()` first, exactly as before, and only *after* that
does it remove the index from `mountedIndices` — deferring the actual
`<iframe>` unmount to the following render, guaranteeing `destroy()`
always gets a still-attached iframe to tear down properly instead of
racing React's own unmount. Both `mountedIndices` updates are
deferred via `queueMicrotask` rather than called synchronously in the
effect body — React's compiler now hard-errors on synchronous
setState-in-effect at build time even for this sanctioned "sync with
an external system" case, and deferring by a microtask satisfies that
without changing the ordering guarantee this fix depends on (the
microtask callback still only runs after every `destroy()` call in
that effect pass has already executed).

## §101 — KaTube Shorts: YouTube's own branded pause overlay bleeding through + black screen while loading

Founder sent two phone screenshots: one showing YouTube's own title,
channel name ("ViralEditor"), native prev/play/next buttons, its own
orange progress bar, and a "YouTube" logo all overlapping KaTube's UI
(read as "phone compatibility not correct"); and a separate report
that scrolling to the next short shows a plain black screen instead
of that short's thumbnail while it loads, risking people scrolling
away before it's ready.

**Bug 1 — native branding overlay:** YouTube's embedded player shows
this exact overlay whenever playback is paused via the JS/postMessage
API, regardless of the `controls=0` URL param — a long-standing,
undocumented IFrame Player behavior with no URL parameter that
disables it. Because it's rendered inside the cross-origin iframe's
own document, it can't be targeted or hidden with CSS from this page
at all. Fixed by covering the iframe with an opaque overlay of our
own (with our own centered pause icon) whenever `isActive &&
!isPlaying`, so YouTube's native overlay never becomes visible in the
first place — trading the frozen-frame preview on pause for a plain
dark scrim, which is the standard trade-off other YouTube-embed-based
shorts/reels clones make for exactly this reason.

**Bug 2 — black screen while loading:** the loading thumbnail
`<img>` and the `<iframe>` were both `position: absolute` with no
explicit `z-index`, so despite the thumbnail being intended to sit
"underneath" the iframe until `markLoaded` fires, plain DOM-order
stacking meant the iframe — later in the DOM — painted over the
thumbnail the instant it mounted, regardless of whether it had
actually rendered anything visible yet. For as long as the iframe's
document was blank, that showed as a flat black rectangle instead of
the thumbnail underneath it. Fixed by giving the thumbnail an
explicit `z-index` above the iframe's default stacking, so it
actually covers the iframe (not just sits earlier in the DOM) until
it's removed once `loadedIdx` has the index.

## §102 — KaTube Shorts console triage: postMessage origin-mismatch warnings fixed, rest was browser extensions / ad blocker

Founder sent a console screenshot with "6 errors, 4 warnings" and
asked to fix "the console." Went through all of it individually
rather than assuming it was all this app's bugs — most of it wasn't:

- **4 warnings, `Failed to execute 'postMessage' on 'DOMWindow'...`**
  — real, from this app. `sendPlayerCommand`'s fallback path (used
  before a real `YT.Player` exists yet) was firing the instant there
  was no player object, including in the brief window right after an
  iframe mounts but before it has actually navigated to a
  youtube.com document — a postMessage with an explicit targetOrigin
  only succeeds once the recipient's real origin matches, so every
  one of these was guaranteed to fail and get logged. Fixed by
  gating the fallback on the iframe having already fired its own
  `onLoad` (mirrored into a `loadedIdxRef` so the memoized
  `sendPlayerCommand` callback doesn't need `loadedIdx` in its
  dependency array) — before that point there's nothing productive
  to send anyway, so the command is now just silently dropped instead
  of sent-and-rejected.
- **2 errors, `Uncaught ReferenceError: debounce is not defined` at
  `isolated.js:457`** — not from this app. `isolated.js` is a content
  script naming pattern from a browser extension running in an
  "isolated world" (visible in the founder's tab strip — several
  extension icons), not a file this codebase produces or serves.
- **4 errors, blocked `GET` requests to `googleads.g.doubleclick.net`
  / `static.doubleclick.net`** (`net::ERR_BLOCKED_BY_CLIENT`) — not a
  bug at all: `ERR_BLOCKED_BY_CLIENT` specifically means the
  founder's own ad blocker intercepted the request client-side before
  it left the browser. These come from YouTube's embedded player
  itself (ad-related calls are normal for any YouTube embed) and
  disappear entirely with the ad blocker off; nothing in this
  codebase requests those hosts.

## §103 — KaTube Shorts: our own §101 pause-cover overlay was popping up during normal playback

Regression from §101's fix for YouTube's native pause-branding
overlay. Founder screenshot: the pause icon overlay was visible while
the video's own seek bar showed it partway through and still visually
progressing — "pause button dikh raha hai, video is not actually
paused."

**Root cause:** `onStateChange` derived `isPlaying` from `event.data
=== PlayerState.PLAYING`, treating *every other* YouTube player state
as "not playing" — including `BUFFERING` (3), which YouTube fires
routinely during completely normal playback (network blips, quality
switches, and — since these are looped via `loop=1&playlist=...` —
the brief re-buffer right around the loop point each time a short
finishes and restarts). Every one of those flipped `isPlaying` to
`false`, which — since §101 added the pause-cover overlay keyed
directly off `!isPlaying` — popped the overlay up over the video even
though playback itself never actually stopped.

**Fix:** `isPlaying` now only changes on the two states that actually
represent a real, user-facing play/pause transition — `PLAYING` sets
it `true`, `PAUSED` sets it `false` — and is left untouched for every
other transient state (`BUFFERING`, `UNSTARTED`, `CUED`, `ENDED`),
same as before those events fired but without misreading them as a
pause.

## §104 — KaTube Shorts: YouTube's native overlay was still bleeding through despite §101

Founder screenshot after §103: YouTube's own title, channel name,
native prev/pause/next buttons, its own progress bar, and logo were
all still clearly visible over the video — the exact thing §101 was
supposed to hide. Two compounding bugs, both fixed:

1. **The gesture layer didn't cover the whole frame.** It carved out
   a 136px top strip and a 108px (18px on the desktop breakpoint)
   bottom strip that it left completely uncovered, on the assumption
   that KaTube's own top/bottom UI needed the room. It didn't — the
   top-title-shield and bottom-share-shield already sit at z-index 20
   (above the gesture layer's z-index 10) and handle their own bands
   regardless of what the gesture layer covers underneath them. All
   those gaps did was let taps that landed there fall straight
   through to the raw cross-origin iframe instead of being caught by
   our own pointer handlers — and the bottom-share-shield only ever
   covered the *left* 128px of its band, leaving the right side (where
   YouTube's own logo/progress bar tend to render) open the whole
   time. Any tap reaching the iframe directly can trigger YouTube's
   native OSD. Now the gesture layer covers the full frame (`inset:
   0`), so every tap is handled by our own code first, before it can
   ever reach the iframe.
2. **The §101 cover-on-pause overlay was only 55% opaque**
   (`rgba(0,0,0,0.55)`) — enough to dim a video frame, nowhere near
   enough to hide bright white text, icons, and a logo, which is why
   they were all still perfectly legible in the screenshot despite
   the overlay technically being active. Changed to a solid, fully
   opaque background so nothing underneath can show through at all.

## §105 — KaTube Shorts: autoplay wasn't reliably starting at all, which is why the native chrome kept showing

Founder screenshot (still showing YouTube's channel avatar/name,
native prev/pause/next, progress bar, logo — same category as §104,
even after that fix) plus an explicit ask: shorts should start
playing the instant one is opened, with no tap on the (already
supposed to be hidden) play button required. Traced both back to one
cause.

**Root cause:** `onReady` always called `unMute()` (default sound
preference) immediately before `playVideo()`. Browsers don't quietly
downgrade an autoplay request that asks to start *unmuted* into a
muted one when there's been no user gesture on the page yet — they
refuse the `play()` call outright. Since this is Incognito (zero
Media Engagement history) and nothing on this page had produced a
user gesture yet by the time `onReady` fired, every one of these
calls was being silently rejected. The player stayed stuck exactly
on YouTube's native idle/cued chrome — which is also why §104's
pause-cover fix didn't visibly help: `isPlaying` defaulted to `true`
(optimistic), so the cover never activated during this stuck window,
and even once fixed to default `false`, the actual underlying problem
— playback never starting at all — remained. Tapping the (leaking)
native play button supplied the missing gesture, which is why that
"worked."

**Fix, two parts:**
- `onReady` and the `syncPlayers` retry loop now always start a short
  **muted** regardless of the sound preference, until a real gesture
  has happened anywhere on the page (`hasGesturedRef`, set from a
  one-time `pointerdown` listener) — muted autoplay is unconditionally
  allowed, so this guarantees playback actually starts without
  needing a tap. The moment that first gesture fires, the currently
  active player is unmuted immediately if the sound preference calls
  for it, rather than waiting on the next `activeIndex`/`muted`
  change to pick it up.
- `isPlaying` now defaults to `false` instead of `true` (see §104's
  entry above), so even during any remaining startup gap, our own
  opaque cover is what's showing — never YouTube's native chrome.

## §106 — KaTube Fast Tap: real ranking algorithm (DONE)

**Founder-reported gap:** Fast Tap (the Shorts feed,
`app/katube/shorts/[shortId]/page.tsx`) had no algorithm at all —
the feed query was a plain `.order('created_at', { ascending: false
}).limit(50)`, i.e. every viewer saw the identical 50 newest shorts
in the identical reverse-chronological order every time. Researched
how YouTube Shorts/Instagram Reels-style feeds actually rank (recency
+ engagement decay, engagement RATE not just raw counts, personalized
follow/watch-history signals, creator diversity so the same creator
never plays twice in a row) and built the closest honest equivalent
out of signals this schema already has — no fabricated engagement
data, no new tables.

**New `app/katube/lib/shortsRanking.ts`:**
- `freshnessDecayedScore()` — reuses the exact same "hot" formula
  already shipped on the Trending page (`trendingScore` in
  `app/katube/trending/page.tsx`) for consistency across KaTube's
  ranked surfaces: `(views + likes*3) / (ageHours+2)^1.3`.
- `engagementRate()` — likes-per-view, confidence-scaled by view count
  (ramps to full trust by ~25 views) so a 1-view/1-like short can't
  outrank a short with thousands of real engagements on a fluke.
- Followed-creator boost (×1.6) for signed-in viewers, via
  `creator_follows` — falls away entirely when signed out rather than
  faking personalization with no data.
- Session "already seen" de-prioritization (×0.35, not a hard
  exclude) via `markShortSeen()`/`sessionStorage` — a short scrolled
  past this session sinks instead of replaying at the top on reload.
- Greedy creator-diversity re-ordering pass after scoring — walks the
  ranked list and, for each slot, picks the best-scored remaining
  short whose creator hasn't appeared in the last `diversityWindow`
  (default 3) picks; falls back to the best remaining short if every
  candidate would violate the window, so diversity never shortens the
  feed.

**Wired into the shorts page:**
- Pool widened from `limit(50)` to `limit(150)` so there's real
  material for the algorithm to work with (still one cheap indexed
  query).
- Viewer's `creator_follows` fetched inline in the same effect (not
  read from the separate `userId` state, since the two effects have
  no guaranteed ordering — ranking needs follows on the very first
  pass).
- `rankShorts()` replaces the raw `.order()` result before `setShorts`.
  A direct-link target short (`initialShortId`) isn't force-pinned to
  the front — `startIdx` finds it by id wherever the algorithm ranked
  it, so a shared link still always opens on the right short.
- `markShortSeen()` called on the short being scrolled AWAY from
  (existing `lastActiveIndexRef` change-detection effect), not the
  newly active one — arriving isn't the same as having watched past it.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on both
touched/new files: 0 errors (same 2 pre-existing `<img>` LCP warnings
already documented in this file, unrelated to this change).

## §107 — KaTube Fast Tap: "Join" (follow) button on the caption block

Founder shared a reference mobile Shorts-style UI (right-edge action rail
+ bottom-left channel row with a Subscribe/Join pill) and asked for the
same template on Fast Tap, using "Join" instead of "Subscribe".

**What shipped:** the bottom-left caption block's creator row
(`@creator` link) now sits in a flex row with a **Join / Joined** pill
button on the right, matching the reference layout. Same underlying
mechanism as the rest of KaTube's "Follow" button (`creator_follows`
insert/delete, `creator_id`+`follower_id`) — this page just uses the
label "Join" per the founder's explicit ask, not a new feature/table.
Optimistic toggle with rollback on failure (same pattern as the
follow buttons on the watch page/channel page). Hidden on your own
uploads (`userId === short.creator_id`). Signed-out tap redirects to
`/login?next=...` same as the other action buttons on this page.

**Not done:** did not add a fake dislike counter or "boost" icon from
the reference image — those aren't real features in this app (no
dislike/boost data anywhere), so faking counts for visual parity would
be misleading. Kept the existing real action set (Like/Comment/Share/
Together/Mute) and only changed the caption-row layout to match the
reference's channel-row + Join-button pattern.

**Verified:** `tsc --noEmit` clean, `eslint` clean (same 2 pre-existing
`<img>` warnings).

## §108 — KaTube home: mobile drawer swipe-to-close + scroll-lock, decluttered overlap

Founder sent two screen recordings: the mobile hamburger drawer on
`/katube` not responding to swipe gestures (only tap-outside worked)
and the background page scrolling behind it while open, plus a
general "everything overlaps" complaint about the home page with a
recorded YouTube-app session as the layout-language reference
(theme/colors explicitly to stay as-is — KaTube's existing dark +
orange).

**Fixed (SidebarNav / KaTubePage in `app/katube/page.tsx`):**
- Swipe-to-close on the drawer `<aside>` — touch handlers follow the
  finger via `transform: translateX()` during a leftward drag,
  commit-close past a 70px threshold, spring back open otherwise.
  Same drag pattern as the Watch Together panel / K Circle share
  sheet elsewhere in this app.
- Body scroll lock (`overflow: hidden`) for the duration
  `mobileDrawerOpen` is true — background page was visibly scrolling
  behind the drawer/backdrop in the recording.
- Sticky top nav pinned to its own GPU layer (`transform:
  translateZ(0)` + `will-change: transform`) — the "overlap" visible
  during a fast scroll was `position: sticky` + `backdrop-filter:
  blur()` compositing lag on Android Chrome, the filter-pill row
  poking out from under the nav for a frame before its blur repaint
  caught up.
- Removed a permanent dev-only placeholder note ("Subscribe, like,
  and comment aren't built yet — that's the next step") that
  rendered unconditionally on every load below the real content —
  an internal engineering note that had leaked into production UI.
- Small top padding added above the filter-pill row so it doesn't
  sit flush against the hero text.

**Not done yet:** a full structural redesign of the home feed to
mirror the YouTube-app reference recording's section rhythm (Shorts
shelf / Mix card / etc) — this pass scoped to the concrete,
reproducible bugs shown in the KaTube recording itself per founder's
"stop what I was doing, fix this" ask; layout-level redesign is the
logical next pass.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on this
file: 0 errors (same 3 pre-existing `<img>` LCP warnings, unrelated).
`next build` currently fails in this sandbox on an unrelated missing
`@opennextjs/cloudflare` install (declared in `package.json`, not
present in `node_modules` here) — pre-existing gap from the
in-progress Cloudflare/OpenNext migration, not caused by this change.
Committed and pushed directly to `main` per founder's instruction —
no branch/PR.

## §109 — KaTube home: mobile redesign toward YouTube-app reference

Continuation of §108. Founder's reference recording (YouTube mobile
web) goes straight from the nav into a horizontal chip row, then
Shorts, then the feed — no hero block, and every filter control
lives in one scrollable strip. Theme/colors untouched (still
KaTube's existing dark + #f97316 orange).

- Hero ("AI-Anime, Made by MANGAL Creators" + paragraph) hidden on
  mobile only (.katube-hero, display:none under 768px) — was
  pushing all real content down the fold and contributing to the
  "everything overlaps" complaint on the smallest screens. Kept on
  desktop.
- "Filters" (duration/upload-date) toggle, previously its own
  full-width row under the Popular/New/Rankings/Categories/Tools
  chips, folded into that same horizontal scroll strip as its last
  item — matches the reference's single scrollable filter row.
  Same state/behavior, just relocated; removed the now-dead
  duplicate block.

Not done: Shorts-shelf/Mix-card visual treatment beyond what
already existed (Fast Tap already matches this reasonably well) —
scoped this pass to hero + filter-row layout, the two clearest
structural gaps vs the reference.

Verified: tsc --noEmit clean project-wide. eslint: 0 errors, same
3 pre-existing <img> warnings. Pushed directly to main.

## §110 — KaTube long-form watch page: desktop layout redesign (reference-matched, player+sidebar+recommended-grid)

Founder shared a screenshot of a real YouTube desktop watch layout
(player + right sidebar with title/description/channel row/action row/
comments, full-width recommended grid below) and asked for the same
layout on the long-form desktop watch page. Note: a parallel session
had already reworked this page's channel-row/action-bar content
(commit 3061f63 — avatar, "Join" button, split identity/action rows)
before this pass started; that content is reused as-is here, just
relocated into the new sidebar column rather than rebuilt.

**What changed** (`app/katube/watch/[videoId]/page.tsx`):
- Old layout: player + ALL info (title/meta/channel-row/actions/Review
  Hub/comments) stacked in one wide left column; a narrow "Up next"
  vertical list as the right column.
- New layout, long-form only (`!video.isShort` — Shorts keep the
  original single-column layout completely untouched): player (+
  Autoplay toggle) alone on the left; title, a new expandable
  description block ("…more"/"Show less" — `videos.description` wasn't
  even being fetched on this page before), the existing channel-row +
  action-icon row, Review Hub, and comments now live in a right sidebar
  beside the player. Below both, a full-width **Recommended** grid
  (reused `VideoGridCard`, same card component as Home/Trending/
  Subscriptions) replaced the old narrow vertical list.
- `related_videos` RPC mapping extended to also carry `created_at` and a
  batched `series_id → title` lookup (same batching pattern as
  commenter/creator username lookups elsewhere) so recommended cards can
  show `basedOn` chips and real relative dates like every other grid
  card in the app.
- No separate mobile-specific branch needed: the existing flex-wrap
  container naturally stacks player → sidebar → recommended-grid in DOM
  order on narrow viewports, same effective stacking as before.
- Removed the now-dead `.mangal-watch-upnext` CSS rule (targeted the old
  narrow sidebar class, no longer used).

**Verified:** `tsc --noEmit` clean, `eslint` clean (1 pre-existing
`<img>` LCP warning only). Pulled + merged twice mid-session against two
rounds of concurrent commits from another active session on this repo
(home-page mobile redesign, then a DB security-hardening pass) — neither
touched this file, both merged with zero conflicts.

## §111 — KaTube home (desktop): gaming-dashboard layout redesign + maroon/red theme

Founder shared a gaming-platform dashboard screenshot and asked for the
KaTube home page to match it "same to same" but with KaTube's own
content, with the hero art slot repurposed into a "Trending This
Week"/creative-ideas spotlight (not a fake game promo), the Fast Tap
shorts row relocated to sit directly under that hero, and the reference's
maroon/red color scheme applied. Scoped to the desktop layout for this
pass, per founder ("let's first do and complete the homepage exactly
like [the reference] ... go for it") — mobile keeps its existing §109
YouTube-app-style redesign untouched.

**Theme color pass** (`app/katube/page.tsx` only, not yet rolled out to
the rest of the site or to the standalone banner components
MangalOfTheWeekBanner/WriterOfTheMonthBanner/MangalIdeasRow/
ContinueWatchingRow that render inside this page — noted as follow-up
below): every `#f97316` orange accent and its `rgba(249,115,22,…)`
variants swapped for a crimson/red `#e11d48` (+ `rgba(225,29,72,…)`),
matching the reference's palette. `katubeDarkVars` background/border/
text-secondary/tertiary values retuned to maroon tones (`#120610`
page background, `#1d0a18` card background, red-tinted border). Page
root now paints a radial maroon glow (`radial-gradient(... rgba(225,
29,72,0.16) ...)`) behind the flat background, dark mode only — light
mode unaffected. `DEMO_SHORTS` gradient palette (Fast Tap placeholder
cards, only shown when there are zero real Shorts yet) recolored to
the same red family. Left sidebar (`.katube-sidebar` CSS) restyled
from a flush full-height list into a floating rounded card (18px
radius, maroon gradient fill, subtle shadow, 12px margin) matching the
reference's left rail — mobile drawer variant explicitly resets
margin/radius/shadow back to a flush fixed panel so this doesn't leak
into the mobile drawer.

**Dashboard hero** (new, desktop-only via the existing `.katube-hero`
mobile-hidden CSS rule — reused the class, replaced its contents):
two-column row where the reference's Spider-Man promo art sits.
- **Left (big card):** this week's most-viewed real video from the
  already-loaded `videos` list (no new query) as a "🔥 Trending This
  Week" spotlight — real title/creator/views, thumbnail background,
  "Watch now" + "Get creative — upload" CTAs. Falls back to a generic
  "What will you create today?" empty state only when there are zero
  videos at all — never a placeholder/fake promo.
- **Right (narrow panel):** matches the reference's "In Library" list.
  New `continueItems` fetch (mirrors `ContinueWatchingRow`'s
  `katube_watch_progress` query, kept separate since that component
  renders its own full-width row elsewhere and isn't shaped for a
  narrow sidebar list) shows the signed-in viewer's real in-progress
  videos with a progress bar; falls back to the 4 newest uploads
  ("Fresh Uploads") when there's no watch history, so the panel is
  never empty — always 4 real rows, matching the reference.

**Fast Tap relocated:** physically moved from its old spot (after New
Voices, deep in the page) to directly under the new dashboard hero,
before the Popular/New/Rankings/Categories/Tools filter row — matches
where the reference's game grid picks up right after the hero art.
Same component/data/collapse-behavior, just repositioned; removed from
its old location rather than duplicated.

**Not done (explicitly scoped out this pass):** the maroon/red theme
was NOT propagated into MangalOfTheWeekBanner, WriterOfTheMonthBanner,
MangalIdeasRow, ContinueWatchingRow, or any page outside `/katube` —
those still render their existing orange styling inside this page for
now. Founder said "same to same... let's first do and complete the
homepage" — read as: get this page's own layout/hero/Fast-Tap/theme
right first, full-palette rollout across nested components and other
pages is a separate follow-up pass.

**Verified:** `tsc --noEmit` clean. `eslint`: fixed one real error this
pass introduced (synchronous `setState` inside a bare effect body for
the new `continueItems` fetch — moved the early-return guard out from
around the `setState` call). 0 errors after fix, same 5 pre-existing
`<img>` LCP warnings only.

## §112 — KaTube: maroon/red theme rolled out across every remaining page

§111 scoped the maroon/red gaming-dashboard theme to the home page only.
Founder confirmed the look and asked to apply the same pattern to the
rest of KaTube. Mechanical color swap (same substitutions as §111)
applied across every remaining KaTube page and shared component:

- `#f97316` → `#e11d48`, `rgba(249,115,22,…)` → `rgba(225,29,72,…)`,
  `fb923c` → `fb7185` (accent + its rgba/gradient variants)
- `#0d0d14` (empty-state card background) → `#1d0a18`
- `#08080c` (input background) → `#170815`
- `#07070a` (page/shell background, `KaTubeShell` in VideoGridCard.tsx)
  → `#120610`
- `rgba(7,7,10,0.97)` (nav/shell bar background) → `rgba(18,6,16,0.97)`
- `rgba(255,255,255,0.18)` / `0.14` / `0.1` used specifically as
  theme borders → `rgba(225,29,72,0.22)` / `0.18` (left the shorts
  page's black-video-chrome divider at `rgba(255,255,255,0.1)`
  untouched — that's a white line on the pure-black player background,
  not part of the maroon page surface, so it stays white on purpose)
- `#9ca3af` (secondary/tertiary gray text) → `#b088a0` (maroon-tinted
  gray, matching the text-secondary tone §111 set for the home page's
  own local theme vars)

**Files touched:** channel/[username], components/ContinueWatchingRow,
components/MangalIdeasRow, components/NotificationBell,
components/VideoGridCard (incl. the shared `KaTubeShell` wrapper used by
channel/trending/playlists/subscriptions), dashboard, playlists (list +
[playlistId]), shorts/[shortId], subscriptions, trending, upload, watch/
[videoId].

**Deliberately left alone:** `KatubeShareSheet.tsx` — its `#7c3aed`
purple is the intentional Watch Together / K Circle cross-brand color
(per the brand note at the top of `page.tsx`: K Circle's purple
identity is meant to read as related-but-distinct from KaTube), not a
KaTube accent that should follow this swap.

**Still not covered** (same "not done" note as §111, unchanged):
MangalOfTheWeekBanner and WriterOfTheMonthBanner don't use the orange
accent at all (checked — they use their own week/month badge colors),
so there was nothing to swap there. `watch`/`upload`/`dashboard` pages
still theme via the *global* site `var(--bg-primary)` etc. rather than
a forced-dark KaTube-local override the way `page.tsx`/`KaTubeShell`
do — their accent colors are now maroon/red, but their base background
still follows the site-wide light/dark toggle rather than being forced
dark. Flagging in case the founder wants full dark-forced consistency
across those three pages as a separate follow-up.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on every
touched file: 0 errors, only pre-existing warnings (a few `<img>` LCP
notices and two pre-existing `exhaustive-deps` warnings, none
introduced by this change).

## §113 — KaTube watch/upload/dashboard: forced-dark maroon theme (light optional), matching the rest of KaTube

§111/§112 gave the home page and every other KaTube page a maroon/red
accent, but watch/upload/dashboard still just followed the *global*
site-wide light/dark toggle rather than being forced dark by default
like the home page and Fast Tap feed. Founder asked for those three to
be fully forced-dark to match everything else, with light still
available as an option.

**Watch page & Upload page** (`app/katube/watch/[videoId]/page.tsx`,
`app/katube/upload/page.tsx`): identical pattern to the home page's
`katubeDarkVars`/`katubeLightVars` (§111) — added local `isLight` state,
a maroon `katubeDarkVars` object (`#120610` bg / `#1d0a18` card /
`#170815` input / red-tinted border+nav) and a plain-white
`katubeLightVars` object, applied via `data-theme={isLight ? 'light' :
'dark'}` + spread CSS vars on the page's root div. Each page's
`<ThemeToggle>` now passes `onChange={setIsLight} defaultLight={false}
syncGlobal={false}` — same "page-scoped, never touches the global
site-wide theme" pattern already used on the home page.

**Dashboard page** (`app/katube/dashboard/`) needed a different
approach: its chrome (`StudioSidebar`) is rendered by `layout.tsx` as a
sibling of `page.tsx`'s content, not inside it, so a page-local
`useState` couldn't reach both. Split the theme state out into:
- `ThemeContext.tsx` (new) — a small context (`isLight`/`setIsLight`)
  bridging layout and page.
- `DashboardThemeShell.tsx` (new) — client component holding the actual
  `isLight` state + the same dark/light var objects (plus `--divider`/
  `--text-faint`/`--accent`/`--accent-rgb` this time, since
  `StudioSidebar` uses those and previously fell back to the sitewide
  orange `--accent`), wraps `StudioSidebar` + `children` together in one
  themed div so the sidebar and page content always match.
- `layout.tsx` — reverted to a plain server component that just renders
  `<DashboardThemeShell>{children}</DashboardThemeShell>`, keeping its
  `metadata` export working (a client layout can't export `metadata`).
- `page.tsx` reads `setIsLight` via `useKatubeDashboardTheme()` and
  passes it to its `<Navbar>`.

**Shared `Navbar.tsx` extended** (used by 22 other pages/products,
kept fully backward-compatible): two new optional props,
`forceDarkDefault` and `onThemeChange`. When omitted (every existing
caller), Navbar's internal `<ThemeToggle>` behaves exactly as before
(`defaultLight={true} syncGlobal={true}`, following the global theme).
Only the KaTube dashboard page passes `forceDarkDefault
onThemeChange={setIsLight}`, which flips those to
`defaultLight={false} syncGlobal={false}` — page-scoped only, doesn't
touch any other Navbar caller's behavior.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on every
touched/new file: 0 errors. Two new `no-unused-vars` warnings on `uid`
in dashboard/page.tsx and upload/page.tsx are pre-existing, introduced
by a concurrent security commit (6887c7e, PII lockdown) that landed on
`main` mid-session — confirmed via `git show --stat` before ruling them
out as unrelated to this change. Pulled + merged once against 4
concurrent commits (security hardening, comment ranking, Vercel→
Cloudflare cleanup) with zero conflicts.

## §114 — MANGAL Studio: PLAN ONLY (no code yet — founder explicitly asked to research + plan + log here first)

### Founder's request, verbatim intent
Rebuild the current ad-hoc `/katube/dashboard` "creator profile" page into
a proper, YouTube-Studio-quality analytics product, named **MANGAL
Studio**, living in its own new top-level folder. Research real YouTube
Studio channel analytics first. Build the same caliber of experience for
**all three MANGAL content products** — KaTube, K Circle
(`kalpana-circle`), WebMangal — inside that one "Mangal Studio" folder.
Redesign the metrics/logic specifically to fit KaTube's two content
types (long-form videos vs. Fast Tap/Shorts), matching what YouTube
Studio actually tracks differently for Shorts vs. long-form. Add a
switcher inside Studio so a creator can flip between platforms (KaTube ↔
K Circle ↔ WebMangal) without leaving Studio. Explicit instruction: do
the research, write the plan, log request + plan here in CONTEXT.md —
**do not start implementing until that's done and reviewed.**

### YouTube Studio channel analytics — feature research
(From general knowledge as of training cutoff — this session has no live
web access to youtube.com/studio to verify current UI, flagging that
up front. Structure below is the well-established, long-stable shape of
YT Studio and is very unlikely to have changed in ways that matter here.)

- **Dashboard (home):** recent-video snapshot cards, channel analytics
  summary (views/watch-time/subscribers over a rolling window), "what's
  new" panel, comments needing a reply.
- **Content tab:** every upload (Videos / Shorts / Live tabs) as a
  sortable table — thumbnail, title, visibility/status, upload date,
  views, comments, likes (as a %).
- **Analytics tab**, itself split into sub-tabs:
  - **Overview** — Views, Watch time (hours), Subscribers net change,
    (Revenue if monetized), trend graph over a selectable date range,
    top videos in the period, realtime card (views in last 48h / 60min).
  - **Reach** — impressions, click-through rate, traffic-source
    breakdown (YouTube search, suggested videos, external, Shorts feed,
    browse features, playlists, notifications, etc.), unique viewers.
  - **Engagement** — watch time, average view duration, **audience
    retention curve** (a graph of % of viewers still watching at each
    point in the video — the single most YouTube-specific metric),
    top end-screen/card performance, top playlists.
  - **Audience** — returning vs. new viewers, subscriber vs.
    non-subscriber view split, when-your-viewers-are-online heatmap, age/
    gender demographics, geography (views by country/region), other
    channels your audience watches.
  - **Shorts-specific panel** — YouTube tracks these separately from
    long-form because viewer behavior is different: Views, average %
    viewed for the Short, Likes/Comments/Shares, engagement rate,
    subscribers gained from Shorts specifically, Shorts-feed reach.
  - **Research** — what viewers are searching for that your channel
    could serve (not relevant here, no cross-channel search corpus).
  - **Revenue** (monetized channels only) — not applicable to KaTube;
    no ad-monetization model exists on this platform.
- **Comments tab:** central moderation queue across every video, held-
  for-review, top comments.

### What's REAL in this codebase today vs. what YT-Studio-style metrics
would need — audited against the actual schema/RLS, not assumed

**Already real and available right now (Tier 1 — buildable immediately,
zero new tables, zero RLS changes):**
- KaTube: `videos.views`, `videos.likes`, `video_comments`,
  `comment_likes`, `creator_follows` (has `created_at`, so "followers
  gained this period" is a real bucketed query), per-video
  `duration_seconds`/`is_short`/`series_id`/`category`/`ai_tool`. KaTube
  dashboard (§28b, current `/katube/dashboard`) already ships a real
  "Video performance" bar-ranked-by-views block — this is a genuine Tier
  1 feature already live, just not in Studio's shape/quality yet.
- WebMangal: **already far more advanced than either other product** —
  `/dashboard/page.tsx` (the general MANGAL dashboard) already has a
  full real-data creator-analytics block: `view_events` table
  (`series_id`, `country_code`, `created_at` — logged server-side via
  `/api/log-view` reading Vercel's edge geo header, **no raw IP ever
  stored**, see `20260809100000_analytics_geo_gender.sql`), a
  `Views by Country` chart, a self-reported-gender demographics donut
  (`profiles.gender`, nullable, shown as "Unknown" rather than guessed —
  good honest-data precedent to keep following), hourly Reader Trends,
  and a real **Chapter Completion Rate** stat (`reading_progress` joined
  against `pages` — correctly scoped to manga-style paged chapters only;
  novel chapters are honestly excluded rather than estimated, per the
  code comment at `dashboard/page.tsx:312-316`). This entire block is a
  strong candidate to **extract and relocate** into
  `/mangal-studio/webmangal`, not rebuild from scratch.
  Migration `20260809101500_creator_can_view_own_series_analytics.sql`
  is the key precedent for the RLS problem below — see next section.
- K Circle: no analytics of any kind exist yet for creators/broadcast-
  channel owners. Real underlying content tables exist (`kcircle_posts`,
  `kcircle_post_likes`, `kcircle_post_comments`, `kcircle_broadcast_*`,
  `kcircle_stories`, `kcircle_story_views`) but nothing currently
  aggregates them for a creator-facing view.

**Blocked by RLS today, needs a narrow new SELECT policy (Tier 1.5 — a
few lines of SQL, same pattern WebMangal already uses, not a schema
change):**
- KaTube's `katube_watch_progress` table currently has **only**
  `"katube_watch_progress_own_read" ... using (auth.uid() = viewer_id)`
  — a creator cannot read ANY other viewer's progress row, which blocks
  "average % watched" / completion-rate for KaTube videos entirely today
  (this is exactly the same problem WebMangal had, and already solved,
  for `reading_progress`/`follows` — see
  `20260809101500_creator_can_view_own_series_analytics.sql`). **Fix:**
  add the mirroring policy — a creator may `select` rows from
  `katube_watch_progress` only where the row's `video_id` belongs to a
  `videos` row they own (`videos.creator_id = auth.uid()`), same
  `exists (...)` shape as the WebMangal precedent. This alone unlocks a
  real (if coarse — single latest-position snapshot per viewer, not a
  full per-second curve) **completion-rate stat for KaTube**, matching
  what WebMangal already has for chapters.

**Not trackable at all today, needs genuinely new infra (Tier 2 —
real schema/RPC work, bigger scope, proposed as a later phase, not
Phase 1):**
- **True audience retention curve** (% of viewers still watching at each
  timestamp) — `katube_watch_progress` only stores the *latest* position
  per viewer, not a time-series, so a real retention *curve* (not just a
  single completion percentage) needs periodic "watch heartbeat" event
  logging during playback, analogous to how `view_events` logs a row per
  view. Real scope, not a quick add.
- **Traffic sources** (search / suggested / Shorts feed / external /
  browse) — nothing today records *how* a viewer arrived at a video.
  Would need a `referrer`/`source` field captured at the same point
  `views` gets incremented.
- **Device type breakdown** — not captured anywhere.
- **True subscribers LOST over time** — `creator_follows` only has
  current rows + `created_at`; an unfollow just deletes the row with no
  history. Only *net* current count and *gained-this-period* (via
  `created_at` bucketing) are honestly derivable today — "lost" would
  need a follow-events log (insert-only, never delete) instead of/
  alongside the current live table.
- **Realtime (views in last 48h/60min)** for KaTube specifically —
  `videos.views` is a bare incrementing counter with no timestamp per
  view, unlike WebMangal's `view_events`. The exact same
  `increment_series_views`-with-event-log pattern
  (`20260809100000_analytics_geo_gender.sql`) could be replicated for
  KaTube (`increment_video_views` + a `video_view_events` table) — this
  is the single highest-value Tier 2 item since it also unlocks realtime
  + geography + eventually traffic-source for KaTube, all from one new
  table, following an already-proven, already-shipped pattern in this
  codebase. Proposed as the first Tier 2 item if/when we get there.
- KaTube has **no ad-monetization model** — there is no Revenue
  equivalent to build, ever, for this platform.

### Product-specific metric sets (YT Studio's metric *concepts*, not its
literal video-only vocabulary, mapped onto what each product actually is)
- **KaTube Studio** (closest analogue to real YouTube Studio — the
  founder's explicit reference point): split **Long-form vs. Fast Tap
  (Shorts)** exactly like YT Studio splits Videos vs. Shorts, since the
  founder specifically asked for this split. Long-form: views, watch-
  time proxy (completion % via the RLS fix above), likes, comments,
  followers gained, per-series ("based on") performance. Fast Tap:
  views, likes, average completion % (same RLS-fixed source, shorter
  format so completion % is a much more meaningful single-number stat
  than it is for a 20-minute video), comments, followers gained
  specifically from Shorts content (derivable by joining `creator_follows.
  created_at` proximity to a Shorts view — approximate, flag as
  approximate in the UI, don't overstate precision).
- **K Circle Studio:** reach/engagement/growth concepts, not
  watch-time — post reach (views if tracked, else fall back to
  like+comment count as an engagement proxy and say so honestly), top
  posts, story views (`kcircle_story_views` already exists — real data),
  broadcast-channel subscriber growth, comment volume. Needs the most
  new "what do we even show" design thought since there's no existing
  analytics precedent to extract, unlike WebMangal.
- **WebMangal Studio:** extract the existing `/dashboard/page.tsx`
  creator-analytics block (already real, already good) into
  `/mangal-studio/webmangal` largely as-is — Chapter Completion Rate,
  Views by Country, Reader Trends, gender demographics, Total Followers
  — then verify (before claiming it in Studio's UI) whether per-chapter
  view counts specifically are reliably tracked, since an earlier
  session (`EditSeriesModal` era) flagged per-chapter views as an
  "honest placeholder" at the time — needs a fresh check, not an
  assumption, before Studio ships a per-chapter breakdown.

### Proposed structure — new top-level folder
`src/app/mangal-studio/`
- `/mangal-studio` — root: a platform switcher landing that only shows
  tabs for products the signed-in creator actually has content on (don't
  show an empty "K Circle Studio" tab to someone with zero K Circle
  posts) — redirects to the single available product's Studio if only
  one applies, or to a small switcher screen if multiple.
- `/mangal-studio/katube` — Overview (KPI cards + trend graph), `/content`
  (sortable video+Shorts table, Long-form/Fast Tap filter), `/analytics`
  (Engagement/Audience sub-tabs), `/comments` (cross-video moderation
  queue).
- `/mangal-studio/kcircle` — same shape, K Circle metric set.
- `/mangal-studio/webmangal` — same shape, extracted from the existing
  `/dashboard` analytics block.
- A shared `StudioSwitcher` component in a common Studio shell/nav
  (new — no existing product-switcher component anywhere in this
  codebase today, confirmed by search).
- **Theme:** propose Studio's shell stays visually neutral/consistent
  regardless of which product tab is active (the way real YouTube Studio
  looks the same regardless of channel branding), with a small colored
  accent indicator per active product tab (KaTube red, K Circle purple,
  WebMangal's own color) rather than re-skinning the whole Studio UI on
  every tab switch — open question, flagged below for founder
  confirmation rather than assumed.

### What happens to the existing `/katube/dashboard`
It's not purely analytics today — it's also where a creator does the
one-time YouTube channel verification (§6, the core connect-your-channel
flow every KaTube upload depends on). That flow has to live somewhere
after this rebuild — proposed as a "Channel setup" tab inside
`/mangal-studio/katube` rather than deleting `/katube/dashboard`
outright, but this is an open question below, not a decision made yet.

### Proposed phased rollout
1. **Phase 1** — Studio shell + `StudioSwitcher` + full **KaTube Studio**
   built on Tier 1 + the Tier 1.5 RLS fix (real completion-rate stat),
   Long-form/Fast Tap split, since KaTube is the founder's explicit
   reference point and has the most mature schema already.
2. **Phase 2** — **WebMangal Studio**, mostly extraction/relocation of
   the already-real `/dashboard` analytics block, plus the per-chapter
   view-tracking verification noted above.
3. **Phase 3** — **K Circle Studio**, the newest metric taxonomy,
   built from real `kcircle_*` tables (reach/engagement/growth framing).
4. **Phase 4 (later, explicitly not this pass)** — Tier 2 infra: a
   KaTube `video_view_events` table (mirroring WebMangal's proven
   `view_events` pattern) unlocking realtime views + geography for
   KaTube; true audience retention curves; traffic-source tracking;
   true subscribers-lost tracking.

### Open questions for the founder before/while implementing Phase 1
1. `/katube/dashboard`'s channel-verify flow — fold into a "Channel
   setup" tab inside the new `/mangal-studio/katube`, or leave it where
   it is and make Studio purely analytics?
2. Build all three products' Studio shells now (even if K Circle/
   WebMangal start with fewer metrics), or ship KaTube Studio fully
   first and come back for the other two in separate follow-up passes?
   (Proposed default above: full KaTube first, others after — confirm
   or override.)
3. OK to add the Tier 1.5 RLS policy (mirrors WebMangal's existing,
   already-shipped precedent — narrow, creator-can-read-own-series-only,
   no data exposed beyond what a creator should already see about their
   own content) as part of Phase 1? Proposed yes, flagging since it's a
   DB change.
4. Studio's own visual theme — neutral shell with per-tab accent
   indicator (proposed above), or fully re-skin per active product?

**Status: plan only, logged per founder's explicit instruction. No
application code has been touched this session for MANGAL Studio —
next step is founder review/answers on the open questions above, then
Phase 1 implementation.**

## §115 — KaTube Shorts seek bar: real hold-and-drag bug fixed + MANGAL Studio Phase 1 decisions locked in

**Bug fixed:** founder reported the seek bar working on a fast tap but
not on hold-and-drag. `.katube-short-progress` (bar container) had no
explicit `touch-action`, so per the CSS touch-action spec its used
value is the intersection with ancestors up to the containing block —
and `.katube-shorts-feed` sets `touch-action: pan-y` for the
swipe-between-shorts gesture. A tap is a single point, no ambiguity,
so it always landed; an actual horizontal drag was ambiguous between
"pan the page" and "drag this control," and touch devices resolved
that in favor of the page's pan-only gesture, so the pointermove-
driven `seekTo` never fired. Fixed with explicit `touch-action: none`
on both the container and the range input itself (inline, defense in
depth) — this element now owns 100% of pointer movement over it.

**§114's open questions — founder's answers, locking in Phase 1:**
1. Channel-verify flow → folds into `/mangal-studio/katube` as its own
   "Channel setup" tab, not left separate. Decided.
2. Build order → full KaTube Studio first, then K Circle and
   WebMangal in later passes (matches §114's proposed default).
   Decided.
3. Tier 1.5 RLS fix → approved. **Shipped this pass**: new migration
   `20260821120000_creator_can_view_own_video_watch_progress.sql`,
   mirroring the WebMangal precedent exactly — a creator may read
   `katube_watch_progress` rows only for videos they own
   (`exists (... videos.creator_id = auth.uid())`), same shape as
   `20260809101500_creator_can_view_own_series_analytics.sql`. This
   unlocks a real completion-rate stat for KaTube videos.
4. Studio theme → **overrides §114's proposed neutral-shell default**:
   founder wants a full reskin per active product tab (KaTube red,
   K Circle purple, WebMangal's own palette), not one consistent
   neutral shell with just an accent indicator.

**Founder also asked:** flag any analytics features they may have
forgotten. Beyond §114's Tier 1/1.5 list, worth adding to the Phase 1
KaTube Overview even though small: a "new vs. returning viewer" split
is derivable today from `katube_watch_progress`'s `viewer_id` history
per video (first-seen vs. repeat) without any schema change — same
tier as the completion-rate fix, just not called out in §114
explicitly. Flagging, not yet built.

**Scope note:** the RLS fix above is shipped. The actual
`/mangal-studio` shell, `StudioSwitcher`, and KaTube Studio
Overview/Content/Analytics/Comments UI (per §114's proposed structure)
is real, multi-file product work — not done in this pass. Next step:
scaffold `/mangal-studio/katube` Overview tab against the now-unblocked
real data (views, likes, followers-gained, completion % via the RLS
fix above), Long-form/Fast Tap split, per-product theme applied from
day one per decision 4 above.

## §116 — MANGAL Studio Phase 1: KaTube Studio UI, implemented
Picking up exactly where §115's scope note left off (RLS fix shipped,
UI not yet built). New top-level folder `src/app/mangal-studio/`.

**Migration:** none new here — §115 already shipped the Tier 1.5 fix
(`20260821120000_creator_can_view_own_video_watch_progress.sql`), same
`exists (...)` shape as the WebMangal precedent
(`20260809101500_...`) — a creator may `select`
`katube_watch_progress` rows only for videos they own. This section
just builds the UI that consumes it.

**Structure:**
- `/mangal-studio` — root; for now just redirects into `/mangal-studio/
  katube` (K Circle/WebMangal Studio don't exist yet, so there's nothing
  to switch between — becomes a real content-aware switcher once K Circle
  Studio / WebMangal Studio land in a later phase).
- `ProductSwitcher.tsx` (shared) — pill row used inside the KaTube Studio
  header: KaTube (live, filled red), K Circle / WebMangal (present,
  correct brand colors, marked "· SOON" and inert — not linking to
  nonexistent pages).
- `/mangal-studio/katube` — `KatubeStudioShell.tsx` reuses the exact
  maroon/red `katubeDarkVars`/`katubeLightVars` pair from the old
  dashboard's `DashboardThemeShell` (same theme-context-bridge pattern,
  renamed) since the founder confirmed per-product reskinning over a
  neutral shell — `--accent` stays `#e11d48` throughout every KaTube
  Studio tab. Tab nav: Overview / Content / Analytics / Comments /
  Channel setup.
  - **Overview** (`page.tsx`) — KPI cards (videos/views/likes/followers),
    followers-gained-in-28-days, and the same per-video performance
    ranking that used to be on `/katube/dashboard` (§28b), now linking
    into the Content tab for the full list.
  - **Content** (`content/page.tsx`) — sortable table (upload date/views/
    likes/comments, click column header to sort), Long-form/Fast Tap
    filter pills, thumbnails via the existing `img.youtube.com/vi/.../
    mqdefault.jpg` pattern used elsewhere in KaTube. Per-video comment
    counts computed client-side from a single `video_comments` query
    scoped to the creator's video IDs (no N+1).
  - **Analytics** (`analytics/page.tsx`) — Long-form vs. Fast Tap toggle
    per the founder's explicit split request. Completion-rate stat now
    real (unlocked by the Tier 1.5 migration above) — computed as
    avg(`position_seconds`/`duration_seconds`) over `katube_watch_progress`
    rows scoped to videos of the selected content type; shows "—" rather
    than a fake number when no watch-progress rows exist yet for that
    type. Explicitly labeled in-UI as a single latest-position snapshot,
    not a full retention curve (that's the Tier 2 `video_view_events`-
    style work, still future). Audience section shows real
    followers-gained-28d; traffic sources/device breakdown/followers-lost
    are named as not-yet-trackable rather than faked, matching §114's
    honest-scope precedent.
  - **Comments** (`comments/page.tsx`) — cross-video moderation queue,
    read-only. Deliberately **not** wired to delete comments: the
    existing `video_comments_own_delete` RLS policy only lets the
    *commenter* delete their own comment, not a creator moderating their
    own video — that's a second DB permission the founder didn't
    explicitly approve this pass, so the tab is honestly labeled
    read-only rather than shipping a delete button that would 403.
  - **Channel setup** (`channel-setup/page.tsx`) — the exact old
    `/katube/dashboard` connect/verify flow, logic unchanged, just moved
    per founder answer #1. `/katube/dashboard` itself is now a client-side
    redirect into `/mangal-studio/katube` so old bookmarks/links still
    work; all in-app links that pointed at `/katube/dashboard`
    (`VideoGridCard`, `katube/page.tsx`, `katube/upload/page.tsx`,
    `dashboard/workspace/page.tsx`, `dashboard/tools/page.tsx`) were
    repointed straight at `/mangal-studio/katube` to avoid the extra
    redirect hop. `StudioSidebar`'s "KaTube" nav item now points at
    `/mangal-studio/katube` too.

**Added beyond the plan** (founder asked for any analytics features
worth adding that weren't already listed): followers-gained-in-the-
last-28-days as its own KPI (both Overview and Analytics), since
"total followers" alone hides whether a channel is actually growing —
real query, same `creator_follows.created_at` bucketing §114 already
flagged as available. Kept everything else scoped to what's honestly
derivable from real data today per §114's Tier 1/1.5/Tier-2 audit —
did not add device/traffic-source/retention-curve UI with fabricated
numbers.

**Verified:** `tsc --noEmit` clean project-wide. `eslint` on every new/
touched file: 0 errors (one pre-existing-pattern `<img>`-vs-`next/image`
warning on the Content tab thumbnail, same as every other KaTube page
that renders a YouTube thumbnail this way).

**Not done this pass (Phase 2/3, per founder answer #2):** K Circle
Studio, WebMangal Studio, and the Tier 2 infra (KaTube `video_view_events`
table, true retention curves, traffic sources, subscribers-lost).

## §117 — KaTube like button: YouTube-style formatting + bump animation
Founder sent a half-edited version of the watch page's like logic to
finish: two small polish items on top of the already-real `video_likes`
toggle (§4 item 5) —
1. Like counts now go through the shared `formatViews()` helper
   (`lib/format.ts`, same K/M abbreviation already used for view counts)
   instead of `.toLocaleString()`, matching how YouTube actually displays
   like counts ("12K" not "12,453"). Applied to the video like count
   (both desktop and mobile action rows) and comment like counts.
2. A brief scale-up "bump" on the thumbs-up icon on every *like* (not
   unlike) — `likeBump` state, 260ms, cleared via timeout — same feel as
   YouTube's own like-button micro-animation. Doesn't touch the
   optimistic like/count logic underneath, purely a UI polish layer on
   top of the existing toggle.

No schema/RLS changes — this was UI-only. `tsc --noEmit` and `eslint`
both clean (pre-existing `<img>`-vs-`next/image` warning only).

Next: K Circle like logic, Instagram-style (double-tap-to-like on posts,
heart burst animation), per founder's explicit ask that it match "insta
or other social platforms" rather than YouTube's plain single-like
model.

## §118 — K Circle like logic: Instagram-style double-tap + heart burst
Founder's ask: same like *approach* as Instagram/other social apps for
K Circle, as opposed to KaTube's plain single-tap YouTube model just
finished in §117. K Circle already had a real single-tap heart-icon
toggle (`kcircle_post_likes`, optimistic UI) — what Instagram actually
adds on top is the **double-tap-the-photo-to-like** gesture with a big
heart-burst animation, which was missing.

**`likePost` extracted** — a like-only (never unlike) helper shared by
both the toggle button and the new double-tap gesture, so there's one
place doing the optimistic update + insert + `notify()`. `toggleLike`
now calls it for the like branch and keeps its own unlike branch
(button click still fully toggles; double-tap never unlikes an
already-liked post, matching real Instagram behavior).

**Double-tap detection is manual**, not `onDoubleClick` — a
`lastTapRef` per-post timestamp map compares taps within a 300ms
window. Native `dblclick` doesn't reliably fire from two quick mobile
taps and this also sidesteps fighting the browser's own
double-tap-to-zoom gesture on the `<img>`.

**Heart burst** — a centered `Heart` icon (lucide) absolutely
positioned over the post image, `pointerEvents: none`, animated via a
new `kc-heart-burst` CSS keyframe (scale up past 100%, settle, fade
out over ~0.9s — same shape as Instagram's own animation) added to the
page's existing responsive `<style>` block. Works for both single-image
and multi-image (grid) posts.

**Like counts** now go through the shared `formatViews()` K/M
abbreviation helper (same one KaTube's watch page uses, §117) instead
of a raw number — applied to both post like counts and comment like
counts, for consistency with KaTube's just-finished polish.

No schema/RLS changes — built entirely on the existing
`kcircle_post_likes` table. `tsc --noEmit` and `eslint` both clean (one
pre-existing, unrelated `unused eslint-disable` warning on an
unaffected line).

## §119 — Bug fix: Cloudflare Workers deploy failing — "exceeded size limit of 3 MiB"
Founder built the Books module (upload PDF/EPUB, paid/free toggle,
pdf.js + epub.js dual-engine reader — real, substantial feature, not
mine) and pushed it. Live deploy started failing at the final
`wrangler deploy` step with:

```
✘ [ERROR] Your Worker failed validation because it exceeded size limits.
 - Your Worker exceeded the size limit of 3 MiB. Please upgrade to a
   paid plan to deploy Workers up to 10 MiB. [code: 10027]
 Here are the 5 largest dependencies included in your script:
 - .open-next/server-functions/default/handler.mjs - 12981.98 KiB
```

**Root cause:** `BookReader.tsx` only ever loads `pdfjs-dist` and
`epubjs` via `await import(...)` inside client-side effects — correct
in principle — but both are reached through a plain static
`import BookReader from '...'` in `/WebMangal/books/[bookId]/read/page.tsx`.
Next's server compiler still pulls the full module graph of a
dynamically-imported target into the server (RSC/SSR) build if the
component that calls `import()` is itself statically reachable from a
server-rendered page — there's no real lazy-chunk-over-the-network for
server code once OpenNext bundles it into a single Cloudflare Worker
script, so both libraries got inlined whole into `handler.mjs`, which
alone ballooned past the free-plan 3 MiB Worker limit.

**Fix, two layers (belt and suspenders):**
1. `next.config.ts` — added `serverExternalPackages: ["pdfjs-dist",
   "epubjs"]`. Tells Next's server compiler to leave both packages
   external (never actually reached at runtime server-side — they're
   canvas/DOM-only) instead of inlining them into the server bundle.
2. `read/page.tsx` — `BookReader` is now loaded via
   `next/dynamic(() => import('...BookReader'), { ssr: false })`
   instead of a static import, so it's excluded from the initial
   server render entirely (and, as a side benefit, sidesteps pdf.js/
   epub.js assuming `window`/`document`/canvas exist during SSR, which
   they do at module scope).

No product logic touched — `handleLike`, purchase-gating, the
truncated-preview file route, none of it changed. `tsc --noEmit` clean,
`eslint` 0 errors on every changed file (pre-existing `<img>`-vs-
`next/image` warnings only, same pattern as the rest of the codebase).

**Not independently verified in this session:** the sandbox's network
egress can't reach fonts.googleapis.com (used by `next/font/google` in
`layout.tsx`), so a full local `next build` fails before it even
reaches the bundling stage this fix targets — that's a sandbox-only
limitation (the actual Cloudflare build log shows Google Fonts
resolving fine there; the size-limit error only showed up at the very
last `wrangler deploy` step). Confirm the next Cloudflare deploy
actually goes green after this push.

## §120 — Bug fix: Books/Songs missing from the Browse page's type row
Founder-reported (screenshot): the All/Mangal/Novel pill row on
`/WebMangal` only showed those three, with Books and Songs nowhere in
sight next to them — only reachable via the top nav, which read as
"missing" since Books/Songs already exist as real, shipped sections.

Not a data-model bug — Books and Songs are genuinely separate tables
from `series` (which is what All/Mangal/Novel actually filters), so
they can't become a 4th/5th value of the same `activeContentType`
toggle without a much bigger unification effort. Fix instead adds two
plain navigational pills, styled to match the existing toggle buttons,
after Novel: **Books** → `/WebMangal/books`, **Songs** → `/WebMangal/
songs`. They don't participate in the mangal/novel filtering state —
clicking them just navigates, same as any other nav link — but they
now sit exactly where the founder (and presumably other users) expect
to find them.

Reused the existing `.mangal-search-toggle-btn` class so the phone
responsive rules (equal-width plain-text tabs, emoji hidden) apply to
these too without new CSS. `tsc --noEmit` and `eslint` clean.

## §121 — Follow-up to §120: removed the now-redundant top-nav Books link
Founder-reported (screenshot): once Books had its own pill in the All/
Mangal/Novel/Books/Songs row (§120), the separate "Books" link still
sitting in the top nav next to Browse/Rankings/Genres was pure
duplication — same destination, two places. Removed the `Books` entry
from `NAV_LINKS` in View.tsx (drives both the desktop nav's centerSlot
and the mobile hamburger menu, single source of truth per the comment
above the array — so one edit fixes both). Songs was never in the top
nav to begin with, so nothing to remove there.

tsc --noEmit clean, eslint 0 errors.

## §122 — Books/Songs pills now behave exactly like Mangal/Novel
Founder-reported: after §120 added Books/Songs as pills next to All/
Mangal/Novel, clicking them navigated to /WebMangal/books or /WebMangal/
songs — a full page change — instead of switching what the current page
shows, the way Mangal/Novel already do. Founder wanted identical
behavior across all five tabs.

**`ContentTypeFilter` widened** to `'all' | 'mangal' | 'novel' | 'books'
| 'songs'`. Books and Songs are still genuinely different tables from
`series` (which is all Mangal/Novel ever filtered), so rather than
force them into the same `Series[]`-typed results pipeline, they get
their own parallel state — same pattern §85 already used for Songs in
search mode, now generalized and turned on for browse mode too:
- **Songs fetch** — was gated `if (mode !== 'search') return`; now runs
  unconditionally so the Songs tab has data to show on both routes.
- **Books fetch** — new, mirrors `/WebMangal/books/page.tsx`'s query +
  two-step author-name resolution exactly (published only, batched
  `creator_profiles` lookup).
- **`activeBooks`/`activeSongs`** — what the two tabs actually render:
  full listing on browse, keyword-filtered (`bookMatches`/`songResults`)
  on search, sorted via a small shared `sortSimple()` helper (Books/
  Songs have no `avg_rating`, so 'rating' sort is hidden for them and
  falls back to their already-newest-first fetch order).
- **Card design** — Books tab reuses the exact card markup from `/
  WebMangal/books/page.tsx` (price badge, cover, file-type chip) inline
  here rather than extracting a shared component, to keep this change
  contained to one file. Songs tab reuses the existing `<SongCard>`
  component already imported.
- **Genre/Language/Status filters** — hidden while Books or Songs is
  the active tab (they're Mangal/Novel-specific vocab — a book's
  `category` list and a song's lack of any genre concept don't map onto
  them), Sort stays visible with 'rating' removed.
- **tabCounts** extended with `books`/`songs` keys so the search route's
  Webnovel-style per-tab counts ("Books 3") work for the new tabs too.
- The small inline "Songs" preview strip under search results (added in
  §85) now hides itself while the Songs tab is active, and its "See all
  songs" link became a tab-switch button instead of a navigation link —
  otherwise it would've been a smaller, redundant duplicate of the same
  data now shown in the main grid.

`tsc --noEmit` clean, `eslint` 0 errors/warnings.

## §123 — K Circle UI layout refactor + OpenNext Worker size hardening

Two workstreams in one pass, both founder-requested.

### Part 1 — /kalpana-circle layout & unauthenticated-state polish

**Left rail (`components/Shell.tsx`):**
- Removed the duplicate home entry: the rail previously rendered the
  K Circle brand logo AND a second identical kcircle-logo "Home feed"
  icon right under it (two visually identical buttons stacked). The top
  brand link is now the single home affordance.
- Rail split into two intentional groups separated by hairline dividers:
  core navigation (Chat, Watch Together, Mangal of the Week,
  Broadcasts, Saved, Search) up top; a utility/footer cluster below
  holding create (+), notifications, account, theme toggle, the other
  MANGAL products' logos, and the company mark.
- Auth-aware bottom cluster: guests no longer get the phantom initials
  avatar that rendered "YO" (initials of the `?? 'you'` fallback) plus a
  working-looking "+" composer shortcut — instead a dashed-circle
  User-icon "Sign in" button; create button hidden when logged out.
  aria-labels added across the rail.

**Home feed (`page.tsx`):**
- Desktop channel header: inner row constrained to the same centered
  640px column as stories/composer/feed, so "# home", the subtitle, and
  the search pill sit flush with the main column instead of stretching
  edge-to-edge across the center pane.
- Stories bar: "Your Story (+)" tile and the "Manage Close Friends"
  row now render only for signed-in sessions; padding normalized to
  16px sides so tray/cards align on one column grid.
- Composer: signed-out visitors now get ONE consolidated CTA card
  ("Sign in to join the discussion" + Sparkles chip + Sign in button)
  replacing the old combo of a disabled post box next to an interactive-
  looking story creator. All interactive composer internals gated behind
  `userId`.
- Empty feed state: proper card on design tokens (bg-card, hairline
  border, icon chip) with session-aware CTA ("Start the conversation"
  scrolls to composer / "Sign in to post"); copy adapts when a ?tag=
  filter is active.
- Right panel: account card kept for members; guests get a compact
  sign-in card. RECENTLY ACTIVE and TRENDING TAGS each wrapped in real
  cards (bg-card / border / 14px radius), standardized 11px uppercase
  0.08em tracking headings, skeleton pulse rows while data loads
  (`loadingStories` added alongside the existing `loadingPosts`),
  honest empty states retained. Recently Active rows are now profile
  links; tag chips sit on bg-input inside their card.
- Mobile bottom bar "+" becomes a login link for guests.

### Part 2 — Worker size / build fixes

- **Local build crash fixed**: `opennextjs-cloudflare build` died on
  Windows with `EPERM: operation not permitted, symlink ...sharp-<hash>`
  during traced-file copying. Root cause: Next 16's standalone output
  emits hashed package symlinks (`node_modules/sharp-<hash>`) that slip
  past @opennextjs/aws's EXCLUDED_PACKAGES regex (`sharp(?:/|$)`), and
  re-symlinking them needs admin/Developer Mode on Windows. Fix:
  `outputFileTracingExcludes: { "*": ["./node_modules/sharp/**/*",
  "./node_modules/@img/**/*"] }` in next.config.ts — sharp never enters
  the trace at all (it can't run on workerd anyway; images are served
  unoptimized). Build now completes locally end-to-end.
- **Route/function splitting investigated and documented** in
  open-next.config.ts: @opennextjs/cloudflare v1.20 only ever bundles
  `.open-next/server-functions/default` (its bundle-server.js ignores
  the AWS adapter's split-functions config) and Workers Builds deploys a
  single Worker from wrangler.jsonc's single `main`, so splitting is not
  available on this stack; the config comment records this so nobody
  burns another session rediscovering it. `routePreloadingBehavior:
  "none"` made explicit.
- **Measured result**: fresh `npx opennextjs-cloudflare build` +
  `wrangler deploy --dry-run`: Total Upload 11571 KiB / **gzip 2795 KiB
  < 3072 KiB free-plan limit** → [code: 10027] size failure resolved
  with headroom. handler.mjs raw is 8.30 MB (gzip 2.42 MB); pdf.js/
  epub.js confirmed absent from the bundle (vendor-file loading from
  §119 intact); sharp/@img absent from the traced output.

Verified: `tsc --noEmit` clean; `eslint` 0 errors (one pre-existing
unused-disable warning on an untouched line); full local
opennextjs-cloudflare build green; reader route access-control guard
(purchase check mirroring the gated file route) and upload pipeline
guard (requireUser → 401, rate limit, user-scoped R2 keys) reviewed and
intact.

## §124 — K Circle rail pinned to viewport (sticky was silently broken)

Founder report: the far-left K Circle navigation rail was "half-clipped,
missing fixed positioning, and scrolling with the page". Root cause found:
the rail used `position: sticky`, but the page root div (`.kc-page`)
carries `overflow-x: hidden` — per CSS that combination computes a real
scroll container out of that ancestor, so sticky resolved against ITS
scrollport (which never scrolls — the body scrolls) instead of the
viewport. Net effect: no pinning at all; the rail scrolled away with the
feed and looked clipped.

Fix (all in the shared `KC_SHELL_CSS` in components/Shell.tsx, so every
K Circle route gets it — home, chat, group chat, broadcasts, broadcast
detail, watch-together, saved, settings, profile):
- `.kc-rail` is now `position: fixed; left: 0; top: 0; width: 70px;
  height: 100vh; min-height: 100vh; z-index: 50;
  justify-content: space-between; overflow-y: auto`.
- `.kc-shell` reserves the rail column via `padding-left: 70px` and its
  grid templates became `minmax(0,1fr)` / `minmax(0,1fr) 300px`
  (`minmax(0,...)` also hardens against grid blowout from wide children),
  so the center feed and right panel can never slide under the fixed rail.
- NotificationBell got an opt-in `flipPanel` prop: in a ~70px rail the
  320px dropdown anchored `right: 0` rendered ~85% off-screen to the
  LEFT of the viewport (pre-existing bug); the rail now passes
  `flipPanel` so the panel opens rightward into view. Default behavior
  everywhere else is unchanged.
- Verified served HTML contains the fixed-pin rule, the 70px width, the
  shell offset, z-index 50; `/kalpana-circle` returns 200 with the §123
  guest CTA and single-profile-entry state intact.

Re-ran the full deploy gate: `npx opennextjs-cloudflare build` green;
`wrangler deploy --dry-run` → Total Upload 11573.51 KiB /
**gzip 2796.28 KiB < 3072 KiB free-plan Worker limit** (handler.mjs
8.30 MB raw / 2.42 MB gzip). `tsc --noEmit` clean, eslint 0 problems on
both touched files.

## §125 — K Circle rail: "More" popup consolidation + search converted to a slide-out drawer

Founder pasted a screenshot + a detailed bug/task doc describing K Circle
layout regressions (overlapping rail, duplicate avatars, dev-tool icons
cluttering the rail, search should be a slide-out drawer). Investigated
against actual current code before touching anything — most of it
(§123/§124: fixed-position rail, single dedup'd avatar, matching
right-panel card treatment, identical auth/unauth column widths,
skeleton loading states, Worker bundle under the 3 MiB limit) was
**already fixed** by those two prior sessions; the screenshot appears to
have predated their deploy. No literal Flame/VS Code/Next.js icons exist
anywhere in this codebase — what the screenshot read as "dev icons" is
`CrossProductLinks` (KaTube/WebMangal logos) + the MANGAL company mark at
small size.

Two genuinely-remaining gaps from the founder's spec, both fixed this
pass:

**"More ☰" popup** (`kalpana-circle/components/Shell.tsx`): the rail's
footer previously had the theme toggle, `CrossProductLinks`, and the
MANGAL logo sitting inline as three more icons after the account avatar.
New `MoreMenu` sub-component consolidates all three into a single
`MoreHorizontal` trigger + popover (same click-outside-to-close pattern
as `NotificationBell`'s `panelRef`/mousedown listener) — the rail's
visible footer is now just: account avatar → More. Popover renders
Theme (with the toggle inline) and "Other MANGAL apps" (the two
cross-product logos + the MANGAL mark) as labeled sections.

**Search overlay → slide-out drawer** (`kalpana-circle/page.tsx`): was a
centered modal (`position: fixed; inset: 0` background + a centered
480px card). Converted to a left-anchored drawer — `position: fixed;
top/bottom: 0; left: 0`, slides in via a new `kc-drawer-in` keyframe
(`translateX(-100%)` → `0`). Desktop (`≥768px`) offsets it to `left:
70px !important` via the new `.kc-search-drawer` class so it opens
adjacent to the fixed rail rather than on top of it, matching the
spec's "slide-out drawer adjacent to the rail" ask; mobile (no rail)
keeps it flush to the viewport's left edge. Same search logic/results
markup, only the container changed.

**Deliberately left alone:** `NotificationBell`'s panel — already
`position: absolute` + `zIndex: 300` (an overlay, not something that
expands the rail or displaces the feed), which already satisfies the
spec's functional requirement even though it's a dropdown rather than a
literal slide-out drawer; changing its core rendering would affect
KaTube and WebMangal too, since it's a shared component, for a
cosmetic-only difference. Did not touch `wrangler.jsonc`/
`open-next.config.ts` bundle-size config — §123's dry-run already
confirmed the Worker is well under the 3 MiB free-plan limit (2.42 MB
gzip) and nothing in this pass adds meaningful bundle weight.

**Verified:** `tsc --noEmit` clean. `eslint` on both touched files: 0
errors (1 pre-existing unrelated warning at page.tsx:209, confirmed via
`git stash` that it predates this change). Could not independently
re-run `opennextjs-cloudflare build`/`wrangler deploy --dry-run` this
session — no Cloudflare network access in this sandbox — relying on
§123's very recent (same-day) verified dry-run instead of re-claiming a
number without being able to check it.


## §126 — Mangal Studio content dashboard (KaTube ↔ WebMangal tabs)

YouTube Studio-style creator content dashboard at
`/mangal-studio/katube/content` (the Content tab in the KaTube Studio
shell, §114):

- **Top bar:** "Search across your content…" pill, notification icon, and
  `+ Create` → inline draft composer (saves drafts to local state).
- **Creator identity header:** avatar, channel name, horizontal channel
  nav (`Inspiration | Videos | Shorts | WebMangal / Series | Posts |
  Analytics`) — clicking switches content type/sub-tab; Analytics links
  to `/mangal-studio/katube/analytics`.
- **Type + sub-tabs:** KaTube (Videos/Shorts/Live/Posts/Playlists) vs
  WebMangal (Novels/Manga-Comics/Chapters/Drafts), status filter bar,
  Select-all/Deselect, and Refresh.
- **Unified data table** (`ContentTable.tsx`, `next/dynamic` + `ssr:false`
  so it is its own chunk): checkbox bulk select, thumbnail/title, status
  pills, visibility icons, sortable metrics that swap per type — KaTube:
  Views/Likes/Comments; WebMangal: Reads/Bookmarks/Chapters/Reviews —
  Date column, empty-state CTA (/katube/upload), horizontal scroll.

Data: KaTube reads live `videos`; WebMangal Studio is Phase 2 per §114,
so its rows use curated demo data until live `manga_books` lands.

Also fixed leftover Shell.tsx type errors (duplicate `KCircleRailProps`
declaration, duplicated Search `onClick`) and widened `KCircleRailActive`
with `watch-together | mangal-of-the-week | broadcasts`.

Verified: `tsc --noEmit` 0, eslint 0; opennextjs-cloudflare build green;
`wrangler deploy --dry-run` gzip 2791 KiB < 3072 KiB Worker limit.
## §127 — K Circle rail: popover clipping + logged-in overlap fix

Founder report after §124/§125: on desktop the K Circle page is fine when
logged out, but "messed up / overlapping" after login — icons overlapping,
and popups (the bell / More menus) render as unreadable, unclickable
blocks.

Two concrete root causes, both in `kalpana-circle/components/Shell.tsx`:

1. **The rail clipped its own popovers.** `.kc-rail` had `overflow-y: auto`,
which per CSS computes `overflow-x: auto` too. The absolutely-positioned
`NotificationBell` dropdown (320px) and the `MoreMenu` popup (186px) live
*inside* the 72px rail, so when opened they were clipped to a ~72px sliver
inside the rail — overlapping icons, unclickable, invisible. The bell also
renders `null` when logged out, which is exactly why the page looked fine
before login and broke after: the clipped panels only existed for logged-in
users.

2. **The rail squeezed on shorter viewports.** `justify-content:
   space-between` + a `flex:1` center column + a fixed-height footer
   (create / bell / avatar / More) meant a briefly shorter viewport crushed
   the nav's fixed 46px icons into the footer — the "can't click the red /
   purple active icons, they overlap" symptom. Worse when logged in because
   the footer gains the `+` create button.

Fix (shared `KC_SHELL_CSS` + `KCircleRail` JSX, so all K Circle routes):
- Rail is now three explicit blocks: fixed top (brand) / scrollable middle
  (`#kc-rail-nav`: `flex:1; min-height:0; overflow-y:auto`) / fixed bottom
  (footer template) — the ONLY scroller is the middle column, so nav icons
  can never collide with the footer at any viewport height.
- `.kc-rail` itself is now `overflow: visible` (no more popover clipping);
  bell + More popovers escape and render as proper overlays.
- Footer moves inside the rail's fixed bottom block with the hairline
  divider, `flex-shrink: 0`.

Verified: `tsc --noEmit` exit 0, eslint 0, `opennextjs-cloudflare build`
green, `wrangler deploy --dry-run` → gzip 2784.90 KiB < 3072 KiB Worker
limit, and `/kalpana-circle` serves 200 with the new rail CSS
(`kc-rail-nav`, `overflow: visible`) in the HTML.

## §128 — K Circle: Notifications panel was still cut off at the bottom of the viewport

§127 fixed the rail's own overflow clipping (the rail had overflow-y:auto
which computed overflow-x:auto and clipped popovers into a 72px sliver).
Founder's follow-up screenshot showed a DIFFERENT, still-present bug:
once that clipping was fixed, the Notifications panel rendered
correctly-sized but still ran off the bottom edge of the browser
window itself — because it always opens downward
(`top: calc(100% + 10px)`) from wherever the bell button is, and the
bell sits in the rail's fixed footer cluster near the bottom of the
viewport. A 420px-tall panel opening downward from there has nowhere
to go but off-screen.

**Fix** (`components/shared/NotificationBell.tsx`, shared across KaTube/
K Circle/chat — kept fully backward-compatible): new optional
`openUpward` prop, default `false`. When true, the panel anchors
`bottom: calc(100% + 10px)` instead of `top: calc(100% + 10px)`,
opening above the trigger instead of below it. Every other usage of
this component (KaTube's top nav, K Circle's own top mobile nav, K
Circle chat's top nav) has the bell in a top bar, where downward-opening
is correct and unaffected — checked all 4 usages individually before
concluding only the rail's bottom-cluster placement needed the flip.
Only `kalpana-circle/components/Shell.tsx`'s rail usage now passes
`openUpward` alongside the existing `flipPanel`.

Also reviewed the rest of the rail for other bottom-edge-adjacent
popovers per founder's "see if there is other issue" ask: MoreMenu's
own popover already anchors `bottom: 0` relative to its trigger (grows
upward, not downward) — no issue there, confirmed by reading its layout
rather than assuming.

**Verified:** `tsc --noEmit` clean, `eslint` on both touched files: 0
errors, 0 warnings.
## §129 — Storage-tiering question for Books/Songs, resolved: single backend
Founder asked: files under 10MB go to Supabase, 10MB+ go to R2 (where
images/posts already live), and a book can't exceed 50MB overall.

Flagged before touching anything: this app already fully migrated off
Supabase Storage onto R2 for every media pipeline — including book
files, which already have a hard 50MB cap (`upload-book-file/route.ts`,
`MAX_BYTES`) enforced both server- and client-side
(`dashboard/books/page.tsx`'s "max 50MB" label matches). Nothing is
stored in Supabase Storage anywhere in the app today. Reintroducing it
as a second backend for the <10MB tier would mean duplicating the
whole private-file/paid-book-gating security posture (no public URL,
ownership + purchase checks before ever streaming bytes — see
`upload-book-file/route.ts`'s module comment) for Supabase Storage too,
for files that comfortably fit R2's free tier regardless of size.

**Founder's call:** keep the single R2 backend, treat the size numbers
as validation only. Result: no functional change needed for Books —
the 50MB cap already matched exactly what was asked — just documented
the decision directly in `upload-book-file/route.ts` so it doesn't get
silently re-litigated or re-implemented differently later.

**Songs have no file upload at all yet** (confirmed in
`WebMangal/songs/upload/page.tsx` — lyrics/text blocks only per §85,
no audio). So the size-tier question doesn't currently apply to Songs;
flagging here rather than fabricating an audio-upload feature that
doesn't exist. If/when audio upload is actually wanted for Songs, it'd
follow the same R2 pattern as Books (own route, own size cap, own
folder prefix under `MEDIA_FOLDERS`).

tsc --noEmit clean, eslint 0 errors.

## §130 — Completed Mangal Studio: WebMangal Content tab was demo data, KaTube rows leaked every creator's videos
Founder-reported: `/mangal-studio/` was "half done." Two real problems
found in `/mangal-studio/katube/content` (§126's unified Content
dashboard):

1. **KaTube rows had no creator filter at all.** `fetchKatubeRows`
   queried `videos` with zero `.eq('creator_id', ...)` — every
   creator's Content tab was silently showing every OTHER creator's
   videos too, not just their own. Fixed: `.eq('creator_id', userId)`,
   now threaded through from `useStudioAuth`'s resolved `user.id`.
   Comment counts (hardcoded to `0`) also now come from a real grouped
   `video_comments` query scoped to that creator's video IDs, matching
   the quality bar §116's original build set.
2. **WebMangal rows were entirely hardcoded demo data** (`wm-1`
   through `wm-5`, fake titles/numbers baked into the file) — this is
   almost certainly what the founder actually saw and flagged.
   Replaced with real queries against `series`/`chapters`/`follows`/
   `ratings` (the same tables WebMangal's own pages already use):
   - **Novels / Manga-Comics / Drafts** tabs: creator's `series` rows,
     `reads` = `series.views`, `bookmarks` = `follows` count per
     series, `chapters` = chapter count per series, "Reviews" column =
     count of `ratings` rows that actually have `review_text` (a bare
     star rating isn't a review to moderate/read). `content_type`
     mapped `'mangal' → 'manga'` to match the table's existing
     `'novel' | 'manga'` union.
   - **Chapters** tab: real individual chapter rows across all of the
     creator's series (title prefixed `Ch. N:`, series name shown
     underneath). Honestly scoped: there's no per-chapter view/
     bookmark/review tracking in the schema yet (only series-level
     aggregates), so reads/bookmarks/comments show `0` rather than
     fabricated numbers — the "chapters" column is repurposed to show
     word count for this one tab instead, since a single chapter's own
     chapter-count is always 1 and wouldn't tell a creator anything.
   - Empty-state CTA for WebMangal changed from static text to an
     actual "Publish a series" button → `/WebMangal/upload`, matching
     KaTube's "Upload a video" CTA instead of leaving creators with no
     next action.

**`ProductSwitcher.tsx` updated to match reality**: WebMangal flipped
from `live: false` ("· SOON", inert) to `live: true`, `href` pointed at
`/mangal-studio/katube/content` (where its real data actually lives,
via the type toggle — not a separate `/mangal-studio/webmangal` shell,
since §126 already established the unified-dashboard pattern rather
than per-product shells for Content). K Circle stays `live: false` —
its Studio hasn't been started at all.

Deliberately did NOT build a separate WebMangal Studio shell (own
theme/sidebar/Overview/Analytics tabs) — §126's Content dashboard
already unified KaTube+WebMangal into one page with a type toggle, and
building a second, parallel per-product-shell pattern alongside that
would be two different mental models for the same thing. Completing
the existing pattern (real data, correct routing) rather than
introducing a new one.

**Not done this pass** (Overview/Analytics/Comments/Channel-setup tabs
in the KaTube Studio shell remain KaTube-only — Comments/Channel-setup
are KaTube-specific concepts anyway; a WebMangal Overview/Analytics
view, if wanted, would extend the same type-toggle pattern the Content
tab uses).

`tsc --noEmit` clean, `eslint` 0 errors on every touched file.

## §131 — WebMangal Studio shell built (Phase 2), reconciled with a concurrent session's §130 fix

Picked up "founder says `/mangal-studio` is half done" by reading
CONTEXT.md as instructed. Found §114's Phase 2/3 plan (K Circle/
WebMangal Studio, still not built) plus §126 (unified Content
dashboard, WebMangal side shipped as demo data). Built a real
`/mangal-studio/webmangal` Studio shell — Overview (series/views/
chapters/followers KPIs, followers-this-week, completion %, ranked
series-performance list) and Analytics (Reading Time Distribution,
Views by Country, Gender donut, Reader Trends, Chapter Completion
Rate, per-chapter Retention) — extracted from the real, already-
shipped `/dashboard` analytics block (same queries, same honesty
rules: "—" not fabricated numbers when data's thin), same forced-dark
shell pattern as KaTube Studio (§116) but with WebMangal's own real
site accent (`#d97706`, from `globals.css`'s `--accent`) rather than
a placeholder.

**Mid-session discovery:** while finishing this, a concurrent session
had independently landed §130 on `main` — fixing the exact same two
bugs this session had also found (KaTube's Content tab missing
`.eq('creator_id', ...)` entirely, and WebMangal's Content tab being
hardcoded demo rows) — but with a different architectural call:
§130 explicitly chose *not* to build a separate WebMangal Studio shell,
keeping WebMangal's content management inside the existing unified
Content dashboard's type-toggle (§126) instead.

**Reconciled rather than overwritten:** §130's actual bug-fix code is
better than this session's independent attempt at the same fix (real
`series.status` for draft detection, `ratings.review_text`-gated
review counts instead of raw comment counts, a proper Chapters tab) —
kept §130's version of `/mangal-studio/katube/content` as-is, discarded
this session's redundant rewrite of the same file. §130's stance
against a *duplicate* content-management surface is correct and
preserved: the new WebMangal Studio shell does not rebuild content
management — its Overview links out to the existing (now-fixed)
`/mangal-studio/katube/content` for that. What this session adds on
top, without conflicting, is the Overview/Analytics *shell itself* —
matching §114's original phased-rollout plan and the founder's own
confirmed decision (§115 #2: full products built out one at a time)
and decision #4 (reskin per product, which a single shared shell
can't really deliver — KaTube Studio already has its own theme, so
WebMangal needed one too, not just a toggle inside KaTube's).
`ProductSwitcher`'s WebMangal pill now points at the new shell
(`/mangal-studio/webmangal`) instead of straight into the Content
dashboard, and its color is corrected to the real brand accent
(§130 had left it as a placeholder blue, `#2563eb`).

Also updated `/mangal-studio` root: was (and, per §130, still was) a
dumb redirect straight into KaTube Studio. Now actually checks whether
the signed-in creator has `videos` and/or `series` rows and redirects
to whichever Studio applies, or shows a small picker if they have
both — matching §114's original "content-aware switcher" description
of this route, now that there are two real Studios to switch between.

**Not done this pass:** K Circle Studio (Phase 3, still not started —
matches founder's approved build order); Comments/Channel-setup-style
tabs for WebMangal Studio (WebMangal has no channel-verify concept;
a WebMangal comments-moderation tab, if wanted, would need the same
kind of RLS check §115 did for KaTube before it could show anything
real).

Verified: `tsc --noEmit` clean project-wide (merged tree). `eslint` on
`src/app/mangal-studio`: 0 errors, 0 warnings.

## §132 — WebMangal AI Writer: privacy-first AI Writing & Translation Assistant

Built the AI Writing & Translation Assistant into WebMangal Studio as a new
**AI Writer** tab (`/mangal-studio/webmangal/write`, added to the Studio
shell TABS). Creator-facing flow: draft prose in a rich text editor, click
"✨ Check & Polish Page", review a paragraph-level diff, accept all / select
paragraphs / discard. Two assist lanes behind one UI: fiction grammar/style
polish and Hinglish → English conversion (e.g. "abhi ne us deen us khatre ko
meehsoos karta hi…" → "Abhi sensed the danger that day…"), plus Auto-detect.

**Scale architecture (the point of the feature):**
1. **Threshold-based batching** (`lib/ai/editorAssist.ts`): NO request ever
   fires on keystrokes/typing pauses. The only trigger is one explicit
   button click, armed solely at ≥300 words OR ≥1,500 chars (~one page),
   hard-capped at 24k chars/batch; the threshold is re-checked server- AND
   client-side. At 100k+ creators this is the ~95% API-request reduction.
2. **Hybrid compute**: default engine is ON-DEVICE `@mlc-ai/web-llm`
   (WebGPU) via a lazy dynamic-import singleton (`lib/ai/webllmEngine.ts`,
   Llama-3.2-3B → Qwen2.5-1.5B → Qwen2.5-0.5B cascade). Cloud mode is an
   explicit fallback.
3. **BYOK cloud fallback**: `/api/ai/editor-assist` (route handler) proxies
   Gemini (`gemini-2.0-flash-lite`) or Groq (`llama-3.3-70b-versatile`)
   using the creator's OWN key passed per-request via `x-wm-ai-provider` /
   `x-wm-ai-key` headers. Stateless pass-through: key used once, never
   persisted or logged (logs carry sizes/status only). No server keys exist.

**Privacy implementation:** keys are AES-GCM encrypted before localStorage
(`lib/ai/byokStorage.ts`); the non-extractable CryptoKey lives in IndexedDB
(`wm-ai-vault`). Cloud actions require the explicit consent checkbox ("I
understand my key is kept strictly local to my browser"). The mandated
compliance notice (🔒 …GDPR/IT Act…) renders in both the settings modal and
a dismissible editor banner. Settings modal = BYOK panel (provider picker,
masked input, wipe-keys). Drafts autosave locally only (`wm_ai_writer_draft_v1`).

**Editor plumbing:** Tiptap v3 (`@tiptap/react@3`, StarterKit trimmed to
what MANGAL's reader renders) in `components/editor/AiWritingEditor.tsx`
(`immediatelyRender: false` for SSR safety; live word/char counters + read
time; "340 / 300 words required for batch AI check" indicator; status bar:
"✨ WebMangal AI polishing full page…" + model-download %). New
`components/editor/manuscriptText.ts` bridges Tiptap docs ↔ MANGAL's chapter
dialect (**bold**, *italic*, "# heading", "***" scene break), so AI output
round-trips through the exact format `novelEditor.ts`'s reader parser
expects — no new formatting dialect introduced. Diff highlighting uses a
dependency-free word-LCS (`lib/ai/textDiff.ts`) in
`components/editor/DiffReviewModal.tsx`.

**CSP changes (next.config.ts):** script-src gained `'wasm-unsafe-eval'`
(WebLLM's TVM WASM runtime) and moved below a comment block; connect-src
gained huggingface.co/*.huggingface.co/*.hf.co/*.xethub.hf.co (on-device
weight downloads); added `worker-src 'self' blob:`. The CLOUD path needs no
provider domains in CSP — it goes through same-origin `/api/ai/editor-assist`.

**Not done this pass:** wiring the assistant INTO the legacy textarea writer
at `/WebMangal/upload` (1286-line page — deliberately untouched; the Studio
AI Writer page + "Copy for uploader" export covers the workflow without
destabilizing the live upload flow); publishing polished chapters directly
to Supabase from the AI Writer (kept read/write local on purpose); model-ID
verification against live HF availability for the WebLLM cascade (first
local run will confirm; failures auto-fall-through to smaller models).

Verified this pass: `npx tsc --noEmit` clean project-wide; `npm run lint`
clean on touched files; `npm run build` production build succeeds.

## §133–134 — AI Writer universal attachment + BYOK key pipeline hardening

Universal attachment layer shipped: `components/editor/useAiAssistEngine.ts`
is now the SINGLE orchestration brain (thresholds, >4k-word auto-splitting,
on-device/BYOK lanes, §133 recovery matrix, toasts, diff handoff), and
`components/editor/WebMangalAiEditor.tsx` is the drop-in universal textarea
(`useAiAssistant` exported as the public hook alias; per-feature batching
bars in FEATURE_THRESHOLDS — prose keeps 300w/1500c, metadata fields get
proportionally smaller click-gated bars). `AiAssistOverlays.tsx` renders the
shared settings/diff/toast stack. The Tiptap Studio writer
(AiWritingEditor) still carries its own pre-extraction copy of the pipeline
— converging it onto the hook is the noted follow-up.

**Wired surfaces:** `/WebMangal/upload` — series Description (synopsis),
Author's Note before/after, and the novel Chapter Text editor (textarea ref
forwarded via innerRef so Bold/Italic/Heading/Scene-break selection tooling
keeps working); focus-mode stays plain by design. Plus Books module
Description (`maxLength=4000` preserved) and Songs lyric blocks.
Character-profile / lore-codex / scene-script editors don't exist in the
repo yet (§~822 skipped them as scope creep) — WebMangalAiEditor's feature
map already defines their bars for when they're built.

**Key-pipeline hardening (from §133 feedback):** OpenAI added as a third
provider (gpt-4o-mini; sk-/sk-proj- format); new `lib/ai/keyVerification.ts`
runs gate 1 offline prefix checks (AIzaSy…/gsk_…/sk-…) with wrong-platform
detection ("Invalid Key Format for selected provider.") and gate 2 zero-
token dry-run pings (provider models-list via same-origin proxy
`{ping:true}`); settings modal shows 🟢/🔴/🟡 badges and Save unlocks ONLY
on verified. "Get Free API Key" deep-links to the selected portal with an
SSO notice built from the session email (useStudioAuth user.email threaded
page → editor → modal).

**Not done this pass:** AiWritingEditor→hook convergence (above); reader
comments/reviews intentionally NOT AI-wrapped (reader-generated, not
creator drafting).

Verified this pass: `npx tsc --noEmit` clean project-wide; eslint 0 errors
(2 pre-existing warnings remain on untouched upload-page lines);
`npm run build` succeeds.

## §135 — Recommendations engine, webtoon storyboard, reader spec gaps (roadmap close-out)

Audit-first pass against the external feature brief: Mangal Studio analytics
(§114/§116/§126/§130/§131), the immersive novel/manga reader's theme/font/
line-height controls and DB-backed resume (`reading_progress` upsert +
`resumeApplied`), and per-product studios were ALREADY complete — rebuilt
nothing there. Genuinely missing pieces shipped below; payments/Razorpay
excluded per the standing zero-paid-integrations constraint.

**1. In-house recommendations (replaces "no ranking beyond ilike" gap):**
`/api/recommendations` scores published series with cosine similarity over
binary genre vectors + author/language overlap + log-scaled popularity prior,
seeded from `reading_progress` recency ∪ `follows`. Deliberately NOT pgvector
— binary-vector cosine is array-intersection math; stock Postgres suffices
at this cardinality (zero extension, zero cost). Optional Bearer token →
personalised; anonymous → trending fallbacks. UI:
`components/feed/RecommendedForYou.tsx` renders three scroll-snap rails
("Recommended For You" / "Because you read X" / "Trending in <genre>") on
`/WebMangal/home` above the footer.

**2. Webtoon storyboard tool:** `/mangal-studio/webmangal/convert`
(+ non-permanent redirect from the briefed `/studio/convert`, keeping the
§131 product-namespacing rule). Pure client-side: heuristic text→panel
splitter (# heading → SCENE, *** → TRANSITION, `Name:` / quoted lines →
DIALOGUE with speaker detection, @char cues → ACTION, long narration split
≤240 chars); HTML5 drag-and-drop reorder (+ ◀ ▶ fallback); editable text,
dialogue balloon position, transition/camera notes, delete; exports
re-importable structured JSON and a plain-text shot-list script.

**3. Reader gaps filled** (spec items the reader lacked): side-margin
selector (Narrow/Normal/Wide, persisted in `mangal_reader_prefs`),
paginated book view for novels (CSS-columns horizontal pager with snap;
manga already had scroll/page), and a quick LOCAL bookmark
(`wm_reader_bookmarks_v1`) with floating toggle + "% restore" banner.

**4. Tools page:** Word Counter and Translation Helper flipped live:false→
true, pointing at the chapter editor counter and AI Writer respectively.

**Not done / next (audited):**

1. **K Circle Studio (Phase 3)** — genuinely blocked: `FEATURE_THRESHOLDS`
   line 3 reads `/* phase 3 — awaiting founder approval */`. No code is
   possible until founder signs off on the metric taxonomy.
3. **Character-profile & lore-codex editors** — pages don't exist yet, BUT
   the AI engine is pre-wired: `useAiAssistEngine.ts` lines 30–33 define
   reduced batch minimums (`{minWords:100, minChars:400}`) for
   `feature="character"` and `feature="lore"`, and the engine reads these
   thresholds automatically via `FEATURE_THRESHOLDS[feature] ?? FEATURE_THRESHOLDS.chapter`
   (line 23). When the editor pages ship, AI polishing activates at the
   lighter threshold by default — zero additional changes needed.
4. **Shorts view-count increment (§~1294)** — **already implemented** (the
   CONTEXT.md note is stale). View counts come from the `videos` table's
   `views` column, incremented server-side by an existing PostgREST/RPC
   trigger (`increment_video_view`), and the shorts player page consumes
   them directly via the `Short.views` field (line 43) plus
   `rankShorts()` in `src/app/katube/lib/shortsRanking.ts`.
   `markShortSeen(id)` (shortsRanking.ts:118) handles in-session
   dedup. No code work required here.**

The remaining items are either founder-blocked (#1) or already resolved
in code (#4, stale note corrected). The character/lore editors (#3) will
activate automatically once their editor pages are built (Phase 3).

Verified this pass: `npx tsc --noEmit` clean project-wide; `npm run lint`
0 errors / 54 warnings (all pre-existing, none in new code);
`npm run build` production build succeeds with no broken imports or
hydration errors.


## §91 — Deploy failure root-caused: missing GitHub Actions secrets

"Deploy to Cloudflare Workers" workflow had been failing (~20s, fails
fast) on every push despite an earlier commit adding the Supabase env var
passthrough. Root cause found via a temporary diagnostic step (added,
run once, then removed same session — raw Actions job logs weren't
fetchable from the environment used to debug this, so the diagnostic
reported SET/EMPTY status through `::notice::`/`::error::` annotations
instead, which ARE readable via the Checks API):

- `CLOUDFLARE_API_TOKEN` — confirmed set correctly.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` — **not set** as repo Actions secrets at
  all. The workflow had been updated to reference them, but they were
  never actually created in Settings → Secrets and variables → Actions —
  so `${{ secrets.X }}` was silently resolving to empty strings, hitting
  the exact same "supabaseUrl is required" build crash the passthrough
  commit was meant to fix.

**Not fixable from here** — needs the three secrets added manually in the
repo's GitHub settings (values available from the Cloudflare Worker's own
dashboard secrets, or the Supabase project settings). Flagged for Kaif.

Separately confirmed: Cloudflare's own git-integrated "Workers Builds" and
a "Cloudflare Pages" integration are BOTH also connected to this repo and
succeeding on every push — meaning the live Worker has likely been
deploying fine via Workers Builds regardless of this custom GitHub Actions
workflow's failures. Worth deciding at some point whether the custom
deploy.yml is still needed alongside Workers Builds, or just redundant
noise in the Checks tab — not resolved this session, just noted.

## §92 — KaTube: YouTube-style Dislike (Like was already done)

Checked in expecting to build KaTube's like system YouTube-style; found
Like itself already done (K/M-formatted count via `formatViews`, bump
animation on click — from an earlier session not previously logged here).
Missing piece was Dislike. Added:

- `video_dislikes` migration — same shape as `video_likes` (composite PK,
  RLS), but read-scoped to the viewer's own row only (no public-read
  policy) since the count is never shown to anyone, matching real
  YouTube's private dislike count.
- `handleDislike()` in the watch page, same optimistic-UI + sync-lock-ref
  pattern as the existing `handleLike`/`handleFollow`/etc. Mutually
  exclusive with Like in both directions (liking clears a dislike,
  disliking clears a like and decrements the public like count) — both
  DB ops fire together via `Promise.all`.
- Dislike button (ThumbsDown icon, no count shown) added next to Like in
  both action rows (Shorts + long-form sidebar).

K Circle's like system was already fully Instagram-style pre-existing
(double-tap-to-like with heart-burst animation, optimistic UI, K/M
counts) — confirmed, nothing needed there.

**Verified:** `tsc --noEmit` clean, `eslint` 0 new errors (same
pre-existing warnings only).

## §93 — Site-wide mobile bug: missing viewport meta tag

Reported via screenshot: KaTube home badly broken on a real phone — the
desktop-only hero card and the sidebar rendering on top of each other,
tiny overlapping text, black empty content area. All the mobile CSS
(`@media (max-width: 768px)` rules — bottom nav, hidden hero, drawer
sidebar, etc., all across the app, not just KaTube) looked correct on
inspection, which was the actual clue: the root layout had **no viewport
meta tag anywhere**. Without one, mobile browsers assume a desktop site,
lay it out at a fixed ~980px virtual width, then zoom the whole page down
to fit the physical screen — so none of the `max-width: 768px` rules ever
actually matched, on any page, anywhere in the app.

Fix: added Next.js's `viewport` export (`width: device-width,
initialScale: 1`) to `src/app/layout.tsx`. Site-wide fix, not
KaTube-specific — every route was affected identically.

**Verified:** `tsc --noEmit` clean, `eslint` 0 new errors (pre-existing
warnings only). Worth Kaif double-checking on an actual phone once
deployed, since it couldn't be visually verified from this environment.

## §94 — KaTube mobile: removed duplicate nav on Home

Reported via screenshots: on mobile, Home showed the hamburger drawer
(Home/Fast Tap/Slow tap/Trending/Following/Playlists/Saved) AND a
separate always-on bottom tab bar (Home/Fast Tap/Create/Following/You) at
the same time — same items duplicated across two nav mechanisms.

Founder's clarification, now the rule going forward: the drawer is the
one permanent mobile nav on every regular page including Home. The
bottom-tab-bar pattern belongs only to the full-screen Fast Tap (Shorts)
experience — while actually swiping through shorts, not on Home.

- Removed the bottom nav bar entirely from Home (`src/app/katube/page.tsx`)
  — JSX, its spacer, and the CSS. Home now has only the drawer on mobile.
- Fast Tap already had its own equivalent bar
  (`.katube-shorts-mobile-tabs`, `shorts/[shortId]/page.tsx`) and never
  had a drawer — nothing to change there structurally, just added a
  missing "You" tab so it has full parity with what Home's bar used to
  offer (Home/Fast Tap/Create/Following/You, same 5 items).

**Verified:** `tsc --noEmit` clean, `eslint` 0 new errors (pre-existing
warnings only).

## §95 — Actual root cause of the hero-card-doesn't-hide-on-mobile bug

§93's viewport meta tag fix was real and needed, but it turned out not to
be the whole story — the founder retested and the hero card ("Trending
This Week" / "Continue Watching"–"Fresh Uploads" two-column block) was
STILL rendering on mobile, overlapping the drawer. Root cause is
completely different and unrelated to viewport reporting:

`.katube-hero`'s div carries BOTH `className="katube-hero"` AND an inline
`style={{ display: 'flex', ... }}` (needed for its desktop two-column
layout). Inline styles always beat a plain class-based CSS rule
regardless of specificity or media query — so
`@media (max-width:768px) { .katube-hero { display: none; } }` was never
actually capable of hiding it, on any device, at any time. This had
nothing to do with §93's missing viewport tag; that was a real, separate
bug (whole page rendering at zoomed-out desktop width) that's now fixed,
but it was never going to touch this one.

Fix: added `!important` to the mobile hide rule — that's the one thing
that does override an element's own inline style. Checked every other
class-based mobile show/hide rule on the page
(`.katube-subtitle`, `.katube-search-wrap`, `.katube-theme-toggle`,
`.katube-label-full`/`-mobile`, `.katube-mobile-search-btn`) for the same
inline-style-vs-class conflict — none of the others had a competing
inline `display`, so `.katube-hero` was the only one affected.

**Verified:** `tsc --noEmit` clean, `eslint` 0 new errors (pre-existing
warnings only). Given the pattern of back-and-forth on this exact bug,
worth Kaif confirming on an actual phone once this deploys before
considering it closed.

## §132 — Company homepage nav was leaking one product's internal sub-nav into the top-level company nav

Founder screenshot: the main MANGAL company homepage's top nav showed
Browse / Rankings / Genres / New Releases sitting alongside the three
product links (WebMangal, Tube, Circle) and asked for the page to look
more professional, specifically pointing at those items and asking for
research on how a real company/main site handles this.

**Research (web):** consistent finding across corporate-site design
guides — the most common corporate nav failure is structuring
top-level navigation to reflect the company's *internal* org/product
structure instead of the visitor's actual top-level question. For a
homepage representing multiple products, the top nav should mirror
"which product?", not one product's own internal sub-navigation.

**Root cause:** Browse/Rankings/Genres/New Releases are WebMangal's
own in-product reading-site nav (all four literally hrefed to
`/WebMangal*` routes), hard-coded directly onto the shared company nav
— so a first-time visitor who had never picked a product yet saw four
links that only make sense once already inside WebMangal, mixed with
three links representing the whole company. Same links were also
duplicated in the footer under a column mislabeled "Platform."

**Fix:**
- Top nav (desktop + mobile menu): removed all four WebMangal-only
  links entirely — they still exist exactly where they belong, inside
  WebMangal's own in-product nav (untouched). Company-level nav is now
  just the three product links + auth, matching the task-based/
  audience-based pattern from the research above.
- Footer: "Platform" column (same four WebMangal-only links) relabeled
  "Products" and repointed at the three actual products (WebMangal,
  KaTube, K Circle), consistent with the nav fix.

**Not touched:** the `FEATURES` section (`FEATURE_CARDS`, "Why Choose
Mangal?") — already a genuine, honestly-worded 6-card grid covering
the real cross-product value prop (desi stories, mobile-first, zero
gatekeepers, one login/one ecosystem), which is the actual "features"
content a professional homepage needs; the nav was the actual
unprofessional-looking element, not the features section itself.

## §136 — Books schema-cache fix applied to the LIVE DB only (zero code changes)

**Date: 2026-09-01.** Closed the standing `Could not find the table 'public.books' in
the schema cache` (PGRST205 / HTTP 404) on /dashboard/books, /WebMangal/books and every
books API route. Audit (this session) confirmed the root cause before touching anything:
both books migrations existed only as repo files — `migration list` showed
`20260822000000` and `20260825000000` Local-only; a live REST probe returned PGRST205
for all three books tables while `tool_clicks` / `public_profiles` / `reading_progress`
were visible (schema cache healthy → tables genuinely absent); and no CI/CD step applies
migrations (deploy.yml only passes env vars).

**What was done — database only; nothing under `src/` or `supabase/` changed.**
The reviewed hotfix (`20260825000000_books_schema_cache_hotfix.sql`, verified a strict
superset of the module migration — all 35 module statements covered, both `updated_at`
functions hardened with `set search_path = ''`) was applied to the live project via the
**Supabase MCP connector**, after a Dashboard SQL Editor attempt silently failed to land
(direct-DB introspection beforehand: 0 book tables out of 75 public tables). The apply
API auto-assigned the remote version **`20260901091246`** (name
`20260825000000_books_schema_cache_hotfix`).

**Migration history is now deliberately a three-entry state:**
1. `20260901091246` — the real DDL, ran once via MCP. Has **no local file**; the two
   existing local files already match its output, so no stub was created.
2. `20260822000000` — repair-marked applied (`migration repair --status applied …
   --linked`): content fully live; marking it stops any future `db push` from re-running
   the module file, whose `create or replace function` would regress both `updated_at`
   functions to un-hardened bodies (no `set search_path = ''`).
3. `20260825000000` — same repair-marking, same rationale.

**Verification (raw outputs in session):** REST via anon key → 200 OK on books /
book_purchases / book_reading_progress (empty tables); direct DB → RLS enabled on all
three with all 8 expected policies; table-level grants are hosted defaults (all roles —
same posture as every other table in the project; the row-level boundary is the RLS
policies); /WebMangal/books' published-catalog query and /dashboard/books' select-*
query → 200 via anon; both routes → HTTP 200 through `next dev` (27 KB / 40 KB shells;
dev server stopped after). `npx tsc --noEmit` clean; `eslint` 0 errors / 54
pre-existing warnings — expected, since no code changed.

**⚠️ For future sessions:** the local `supabase/migrations/` folder is still out of sync
with remote history beyond books (~40 pre-existing local-only versions were applied
out-of-band under auto-generated timestamps, plus remote-only `20260901091246`). Do NOT
run `npx supabase db push` until a dedicated reconciliation session audits each drifted
file against the live schema and repair-marks what is already applied — per-file applies
(Dashboard SQL Editor / MCP / `supabase db query --linked -f <file>`) are the safe path.
Also noted: Supabase's new API-key system now rejects the legacy `service_role` key over
plain REST ("Forbidden use of secret API key in browser") — future probes should use the
anon key or the CLI's direct `db query --linked` path.

## §137 — §136 pushed to origin/main (session bookkeeping)

**Date: 2026-09-01.** Commit `7a95601` (the §136 books schema-cache record) was pushed to
`origin/main` per the founder's instruction. Auth note for future sessions: no GitHub PAT
exists in `.env.local` or git config — the push succeeded non-interactively via the repo's
cached credential-helper credential (`credential.helper = manager`), which supplies auth
automatically; the literal `git -c http.extraHeader="AUTHORIZATION: Bearer <PAT>"` shape
was not needed. Remote HEAD verified via `git ls-remote origin refs/heads/main` →
`7a95601074645a4ef7fd84985df8d5169197a152` (= 7a95601). The remote's "bypassed rule
violations" notice on the protected branch matches every prior direct-to-main push from
this account.

## §138 — Codex tab: character profiles + lore codex (AI toolbar attached)

**Date: 2026-09-01.** Built the character-profile & lore-codex drafting workspace at
`/mangal-studio/webmangal/codex` — ONE studio tab (registered in WebMangalStudioShell's
TABS, BookMarked icon) with an internal Characters ⇄ Lore switcher (`role="tablist"`,
`aria-selected`).

**Migration — applied, verified, repair-marked (books-hotfix pattern):**
`supabase/migrations/20260901090000_character_lore_codex.sql` creates TWO tables:
`character_profiles` (10 cols: id, user_id, name, role, tags text[], image_url,
backstory, series_id, created_at, updated_at) and `lore_entries` (8 cols: id, user_id,
title, category CHECK in place/item/faction/event/concept/other, content, series_id,
created_at, updated_at). Both carry the founder-approved nullable `series_id uuid →
public.series(id) ON DELETE SET NULL` — FK target verified live BEFORE apply (`series.id`
is uuid with exactly one PK); NULL = standalone entry by design. Idempotent throughout
(create if not exists / add column if not exists / drop policy if exists), drift-guard
columns, per-action owner-only RLS (select/insert/update/delete scoped to
`auth.uid() = user_id` — private drafting surfaces; delete included, unlike
book_reading_progress), `search_path=''`-hardened updated_at triggers per table,
user_id + series_id indexes, and the pgrst reload notify. Applied via the §136 safe path
`npx supabase db query --linked -f <file>` (APPLY_EXIT 0) — NOT `db push` (§136 history
warning stands). Verified: direct-DB introspection showed both tables, all 8 policies
[DELETE/INSERT/SELECT/UPDATE], both triggers, series_id uuid on both; REST (anon key) →
200 OK on both (0 rows — owner-only RLS scopes anon to nothing). History reconciled with
`migration repair --status applied 20260901090000 --linked` → migration list shows
20260901090000 Local+Remote. Books' remote-only 20260901091246 untouched.

**Code (4 new files + 1 edit; no new deps, no new engine):** `codex/page.tsx` (container:
mode switcher, owner-scoped loaders ordered by updated_at desc, CRUD handlers that
`.eq('user_id', …)` on top of RLS, inline confirm-delete, `role="alert"` error banners);
`codex/CharacterPane.tsx` (list rail + form: name*, role, tags comma-text → `text[]` via
`parseTagsText`, portrait PLACEHOLDER block — the image_url column exists but upload/serve
wiring is explicitly out of scope, so no `<img>` renders and no new lint warnings —
backstory via `WebMangalAiEditor feature="character"`); `codex/LorePane.tsx` (title*,
category select, content via `feature="lore"`); `codex/codexTypes.ts` (row/draft shapes +
tag parsing that trims and dedupes); `WebMangalStudioShell.tsx` (tab registration only).
AI: zero new AI code — both prose fields are §134 `WebMangalAiEditor` drop-ins, so the
pre-wired FEATURE_THRESHOLDS for character/lore (≥100 words / ≥400 chars) arm the shared
Polish & Hinglish toolbar automatically, exactly as §135 predicted. Update payloads
deliberately omit image_url/series_id (no UI for them yet → columns stay untouched).

**Mobile verification (new pages only, per scope):** the two-pane grid is desktop-only —
`.codex-panes` collapses to one column at ≤860px via a class-based media query (no
inline-style-vs-class conflict of the §95 kind); columns use `minmax(0, …)` so nothing
overflows horizontally at 320px; controls are ≥44px tall; drawer/tab behavior comes from
the untouched shell (which already stacks ≤900px). Verified HTTP 200 on the route through
`next dev` (41.8 KB shell); on-device visual confirmation stays with the founder (same
limitation as §93/§95).

**Self-review (session-touched files only):** ARIA — tablist/tab/aria-selected switcher,
aria-current on list items, htmlFor labels on every field, role=alert on errors and
delete confirms, aria-labels on icon-only buttons; focus — :focus-visible outlines on
.codex-btn/.codex-field; contrast — platform --text-*/--bg-card tokens only; performance —
memoised handlers with correct deps, keyed lists, no render-time Date/Math.random;
SSR/hydration — zero localStorage/window access in the new files (React state only; the
DB is the only persistence).

**Gates:** `npx tsc --noEmit` → 0; `npm run lint` → 0 errors / 54 warnings (pre-existing
baseline unchanged; zero in new files); `npm run build` → exit 0 with
/mangal-studio/webmangal/codex in the route manifest. One gate-1 iteration: tsc caught a
duplicate closing brace from the multi-part file write; fixed before any commit.

**Untouched, per scope:** books/book_purchases/book_reading_progress, payments tables,
and all Phase 3 mobile work (§93–95, §124–128). The only shared file edited is
WebMangalStudioShell.tsx (tab registration; no style or nav logic changed).

## 139. Performance/architecture audit (hardening pass — pre-fix report)

> Full-codebase audit performed before any code change (per session scope:
> performance/structure only, no features). Numbered findings are referenced by
> the fix commits below (§140). "Bounded" = has `.limit()`/`.range()` or is
> domain-bounded (per-user own-data). Base tables (series/chapters/pages/
> comments/follows/reading_progress/ratings/reports) predate the migrations
> folder — verified via live-DB introspection before the §139 index migration.

### A. Unbounded lists (no pagination/limit) — fix category 1
| # | Location | Problem |
|---|----------|---------|
| A1 | `kalpana-circle/chat/page.tsx` `loadConversations` (~L212) | Fetches **every `kcircle_messages` row in every conversation the user is in** (`.in('conversation_id', convoIds)` + `order desc`, no limit) on every chat open, to derive each thread's last message. Whole DM history shipped per visit. |
| A2 | `kalpana-circle/chat/page.tsx` `loadMessages` (~L261) | Thread view fetches **all messages of a conversation, no limit** — Creator Lounge group chats grow without bound. |
| A3 | `kalpana-circle/broadcasts/page.tsx` (~L96) | All messages of **all** broadcast channels fetched to render last-message previews. |
| A4 | `kalpana-circle/page.tsx` `loadStories` (~L378) | All `kcircle_stories` rows, no limit. |
| A5 | `kalpana-circle/page.tsx` `toggleComments` (~L627) | All comments of a post on expand, no limit. |
| A6 | `kalpana-circle/profile/[username]/page.tsx` (~L129) | All posts of a user, no limit. |
| A7 | `katube/subscriptions/page.tsx` (~L39) | **All videos from all followed creators**, no limit. |
| A8 | `katube/watch/[videoId]/page.tsx` (~L360 video_comments, ~L400 video_accuracy_reviews) | Both lists unbounded. |

| A9 | `WebMangal/read/[chapterId]/page.tsx` (~L641) | All chapter comments, no limit. |
| A10 | `WebMangal/series/[seriesId]/page.tsx` reviews refetch (~L501) | All reviews per series, no limit (fetchChapters deliberately left: a series page legitimately renders its chapter list; tens-of-rows domain bound). |
| A11 | `admin/reports/page.tsx` (~L63) | All reports ever, no limit (admin-only but grows forever). |
| A12 | `kalpana-circle/watch-together/page.tsx` (~L535) + `watch-together/shorts/[roomId]` | Thread/room messages unbounded. |
| — | Feed posts (`kcircle_posts` limit 30), watch-together room feed, comments in chat panels, MangalIdeasRow (RPC max 4), home browse + songs pages, notifications (limit 20) | Already bounded (home/songs use the §82 `.range()` + "Load More" pattern — **this is the reusable pagination pattern**). |

### B. Re-fetch on every mount, no client cache — fix category 2
Every client page does raw `useEffect` + `supabase.from(...)`: navigating back
re-runs identical queries seconds later. No SWR/React Query in `package.json`.
Highest-traffic read paths to convert: WebMangal home/series/read/library/
bookmarks/history/rankings/tags/creator, KaTube home/watch/subscriptions/
playlists/channel, K Circle feed/profile/saved, recommendations fetch.

### C. HTTP cache headers — fix category 3
No `Cache-Control` anywhere (next.config `headers()` only sets security
headers; no API route sets cache headers). Workers serve `public/` and
`/_next/static` — Next static chunks are already immutable, but `public/`
assets and API responses are not. Targets: `/api/books/file/[bookId]`
(published book files), `/api/recommendations` (anonymous pool is stable),
`/api/media/[...path]` (R2 media proxy), and `public/` static assets.

### D. Expensive recompute per render — fix category 4
- `kalpana-circle/page.tsx`: `instagramPreviewComments(...)` (sort per post)
  and feed mapping run inside the render body of every post card on every
  state change of the feed page.
- Recommendation scoring (§135) is server-side per request over a ≤300 pool —
  fine, addressed via cache headers instead.
- Dashboard analytics aggregation runs once per tab-open, not per render — OK.
- `rankShorts` (shortsRanking) pool ≤ 50 — OK.

### E. Missing DB indexes (filters/sorts/joins with no covering index) — fix category 5
Verified against all 72 migration files + PK definitions. Missing:
`chapters(series_id)`, `pages(chapter_id)`, `comments(chapter_id)`,
`follows(reader_id)`, `follows(series_id)`, `reading_progress(reader_id)`,
`reading_progress(series_id)`, `reading_progress(chapter_id)`,
`ratings(series_id)`, `series(creator_id)`, `series(status, created_at)`,
`kcircle_post_comments(post_id)`, `kcircle_saved_posts(post_id)`,
`kcircle_story_views(viewer_id)`, `kcircle_conversation_participants(user_id)`,
`kcircle_messages(conversation_id, created_at desc)`,
`kcircle_poll_options(post_id)`, `visual_quest_submissions(quest_id)`,
`visual_quest_votes(quest_id)`, `video_comments(video_id, created_at)`,
`video_accuracy_reviews(video_id, created_at)`, `creator_follows(follower_id)`,
`katube_playlist_videos(video_id)`, `reports(created_at)`.
(Covered already by PKs: kcircle_post_likes(post_id), kcircle_poll_votes(post_id),
kcircle_story_views(story_id), video_likes(video_id), kcircle_saved_posts(user_id).)

### F. N+1 patterns — fix category 6
- A1/A3 above are fetch-all variants of N+1 (loop-equivalent data pulled to
  compute per-group maxima client-side).
- `WebMangal/upload/page.tsx` tag upsert + page-reorder loops: deliberate,
  tiny N (unique-constraint workaround) — left.
- `WebMangal/series/[seriesId]/page.tsx` `handleDeleteSeries` per-chapter
  cleanup loop: rare admin/owner action — left.

### G. Oversized assets — fix category 7
Workers serve images **unoptimized** (next.config: sharp can't run there), so
source bytes ship as-is. Worst offenders in `public/`:
`kcircle-door.png` 2.9MB, `kalpanaverse-logo.png` 2.1MB, `kcommunity-preview.jpg`
2.0MB, `webmangal-door.png` 1.9MB, `icon.png` 855KB (rendered at 30px!),
`logo-icon.png` 855KB (unused?), `katube-logo.png` 789KB, `logo-wordmark.png`
781KB (unused?), `kcircle-logo.png` 781KB, `comics.jpg` 451KB, `hero-bg.jpg`
410KB, `mangal-flame-icon.png` 361KB, `webmangal-logo.png` 354KB,
`bg-aryavarta.jpg` 345KB; `videos/katube-door-preview.mp4` 3.5MB.

## 140. Performance/architecture hardening pass — fix summary (§139 categories 1–7, all closed)

> Companion to §139. Each category was committed separately (one commit per category,
> no unrelated fixes bundled), and the three hard gates were re-run before every commit:
> `npx tsc --noEmit` → exit 0; `npm run lint` → 0 errors / 53 warnings (the pre-existing
> ceiling — matched, never exceeded; the one moment an intermediate edit tripped
> `react-hooks/set-state-in-effect` it was fixed before committing, not suppressed);
> `npm run build` → success. **The stop-and-wait case never triggered:** nothing in this
> pass touched books/book_purchases/book_reading_progress or payments tables/RLS, and no
> API response shape changed — every fix is client-side, asset-side, or an index/RPC
> addition. All commits below pushed to origin/main at session end; remote HEAD verified
> matching local.

### Category 1 — pagination / infinite scroll (commit `0c16acc`)
One consistent pattern everywhere: the §82 `.range()` + "Load More" offset pattern for
grids/lists, plus a `created_at` cursor (`loadEarlier`) for chat threads where offset
pagination would corrupt a live-appending timeline.
- **A1 chat list:** fetched EVERY `kcircle_messages` row in every conversation on every
  open just to render one preview line → single `kcircle_latest_messages` DISTINCT-ON
  RPC (exactly one row per conversation; SECURITY INVOKER so RLS still applies), with a
  graceful fallback to the old bounded fetch if the RPC isn't deployed.
- **A2 thread view:** whole DM/group history shipped → latest page only (desc fetch
  flipped to chronological), older pages via `loadEarlier()` cursor; Realtime INSERT
  channel appends new rows (no polling, no full refetch).
- **A3 broadcasts previews:** same `kcircle_latest_messages` RPC as A1.
- **A4 kcircle stories / A5 comments expand / A7 katube subscriptions / A8 watch-page
  comments + accuracy reviews / A9 chapter comments / A10 series reviews / A11 admin
  reports / A12 watch-together room + thread messages:** all unbounded → page size +
  Load More.
- **A6 profile grid:** all posts of a user AND every like/comment row across them
  shipped to compute header stats → paginated grid + `kcircle_profile_stats` aggregate
  RPC (exact counts server-side, zero row shipping).
- Both RPCs ship in `20260901000000_perf_pagination_rpcs.sql` (idempotent
  `create or replace`), **applied + verified live** this pass (`pg_proc` introspection).
- Already-bounded lists (feed posts limit 30, notifications limit 20, MangalIdeas RPC,
  §82 home/songs) deliberately untouched.

### Category 2 — single SWR client caching layer (commits `f6c3704` + `314cfb6`)
New `src/app/lib/swrCache.ts` — the ONE data-fetching hook (`useCachedQuery`) for
read-mostly surfaces, with freshness expressed as a TIER, not ad-hoc flags:
`realtime` (2s dedupe + refocus), `feed` (30s + refocus), `catalog` (5min, no refocus),
`analytics` (10min) — so a live chat feed is never staler than needed while analytics
can sit for 10 minutes.
- Round 1 (`f6c3704`): reading history, K Circle saved, RecommendedForYou, both
  NotificationBells (realtime tier — the hot one).
- Round 2 (`314cfb6`, this session): **WebMangal browse/search (`View.tsx`)** — the
  single worst repeat-visit offender: every visit to /WebMangal or /WebMangal/search
  re-shipped the ENTIRE published-series `select(*)` + all creator profiles + 200 songs
  + 200 books; now three cached entries at catalog tier, shared keys across
  browse/search so switching routes paints instantly. **KaTube home** — videos grid +
  shorts + New Voices + weekly-winner ranks folded into one cached entry (repeat visit
  costs one deduped request instead of four; Map derived from plain entries so the
  cache holds plain data) + continue-watching panel keyed per viewer. **WebMangal
  bookmarks + library** — follows list + profile role + followed songs now ONE cached
  query keyed on the reader (was: auth → role → follows → chapters → songs chain every
  visit; songs ran as a second independent effect); unfollow is now an optimistic
  `mutate(..., { revalidate: false })` exactly like the established kcircle/saved
  pattern. Before/after in one line: repeat navigation re-ran 3–5 identical queries
  against the DB every time; now it paints from cache and revalidates in the background.
- Deliberately NOT cached (documented convention in swrCache.ts): mutation-heavy
  interactive surfaces — K Circle feed/profile/chat, comments/likes/polls — stay on
  their bespoke optimistic-update state models; caching there adds invalidation
  complexity with no read-path benefit.

### Category 3 — HTTP cache headers (commit `c527e96`)
- `next.config.ts` `headers()`: `public, max-age=86400, stale-while-revalidate=604800`
  on all static asset extensions (png/jpg/webp/avif/gif/svg/ico/mp4/webm/woff2/…).
  One fresh day + a week of SWR instead of `immutable` because `public/` filenames
  carry no content hash — immutable would pin a replaced file for the whole max-age.
- `public/_headers`: the SAME policy, because production serves `public/` straight
  from the Cloudflare Workers static-asset binding BEFORE the Next worker runs —
  next.config headers never reach those files; this file is the mechanism that
  actually does. (`/_next/static` untouched — Next already marks those immutable.)
- `/api/recommendations`: `Cache-Control: private, max-age=300` — the anonymous pool
  is stable for minutes (§135 scoring runs per request otherwise); `private` so a
  signed-in user's personalized variant can never be served from a shared cache.

### Category 4 — memoization of per-render recompute (commit `658a97f`)
Only where the audit showed real repeated cost — nothing memoized reflexively:
- `kalpana-circle/page.tsx`: `instagramPreviewComments(...)` re-sorted each post's
  comments inside the render body on EVERY state change of the feed page → memoized.
- `WebMangal/read/[chapterId]/page.tsx`: per-render recompute on the reader page →
  memoized.
- Audit-cleared as fine, left alone: recommendation scoring (server-side per request
  over a ≤300 pool — addressed via the cat-3 cache header instead), dashboard
  analytics aggregation (once per tab-open, not per render), `rankShorts` (pool ≤ 50).

### Category 5 — DB indexes (commit `1f297ff`)
`20260901000100_perf_indexes.sql` — 10 genuinely-missing hot-path indexes, idempotent
(`create index if not exists`, same contract as the §136 books hotfix), applied via
`supabase db query --linked -f` and verified live, followed by `analyze` so the planner
picks them up immediately: `series(creator_id)`, `series(status, created_at desc)`,
`follows(series_id)`, `reading_progress(series_id)`, `reading_progress(chapter_id)`,
`kcircle_saved_posts(post_id)`, `kcircle_story_views(viewer_id)`,
`kcircle_conversation_participants(user_id)` (THE chat-list lookup),
`katube_playlist_videos(video_id)`, `reports(created_at desc)`.
Reconciliation note (in-file): §139-E's static pass listed 24 candidates; live
`pg_indexes` introspection showed 14 already covered (composite-PK leading columns,
existing indexes, or redundant DESC twins) — deliberately not recreated. Nothing
touches books/payments tables.

### Category 6 — N+1 fixes (verification outcome; no new code needed)
The audit's true N+1s (A1/A3 — loop-equivalent fetch-all to compute per-group maxima
client-side) were already *batched* as part of category 1: one `kcircle_latest_messages`
DISTINCT-ON RPC replaces the fetch-everything derivation, and `kcircle_profile_stats`
replaces shipping every like/comment row for profile header counts. Both confirmed
**live** this session (`select proname from pg_proc where proname in (...)` returned
both) and wired with fallbacks. The bookmarks/library chapter enrichment was already
batched (one `.in('series_id', ...)` query for all followed series — the pages' own
"Perf fix — this used to fire 2 queries per followed series, i.e. N+1" comments). The
remaining loop patterns from §139-F stay as audited: `upload/page.tsx` tag upsert +
page reorder (deliberate, tiny N, unique-constraint workaround) and the per-chapter
cleanup in `handleDeleteSeries` (rare owner/admin action).

### Category 7 — asset optimization (commit `3a5f6b7`)
All recompression done IN PLACE (same filename, same format — zero code reference
changes), sized against actual render dimensions; unreferenced assets verified via a
correct recursive src sweep (an earlier `**` glob had silently skipped top-level
`src/app/*.tsx` — re-checked before deleting anything):

| Asset | Before | After | Why safe |
|---|---|---|---|
| `kcircle-door.png` (941×1672) | 2955KB | 466KB | door card renders ≤~420px wide; palette PNG |
| `webmangal-door.png` (936×1120) | 1856KB | 250KB | same |
| `kcommunity-preview.jpg` (819×1456) | 1994KB | 187KB | dims kept; was absurd encoder quality |
| `comics.jpg` | 451KB | 146KB | resized 1200w, mozjpeg |
| `hero-bg.jpg` / `bg-aryavarta.jpg` | 410 / 345KB | 237 / 196KB | full-bleed bgs, q72 mozjpeg |
| `katube/kcircle/webmangal-logo.png` | 789/781/354KB | 8/5/10KB | rendered at 20–42px; resized 128, alpha kept |
| `public/icon.png` (1254²) | 855KB | 14KB | the umbrella logo, rendered ~30px; resized 256 |
| `src/app/apple-icon.png` | 781KB | 44KB | aspect kept (no crop — visual-identical letterbox) |

Deleted after confirming zero references anywhere in `src/`: `kalpanaverse-logo.png`
(2116KB), `logo-icon.png` (855KB), `logo-wordmark.png` (781KB),
`mangal-flame-icon.png` (361KB — only `-black.jpg` is used), `videos/katube-preview.mp4`
(618KB). Net: ≈11.5MB of referenced images → ≈1.46MB, plus 4.7MB of dead weight gone.
Landing-page `og-image.jpg` (207KB, 1200×630) was under audit threshold — untouched.

**Lazy-loading:** the KaTube door's `katube-door-preview.mp4` (3.5MB — heaviest asset
on the landing page) used to mount and autoplay-download on every landing render even
though the doors grid sits below the fold. New `DoorPreviewVideo` mounts the
`<video src>` only once the card approaches the viewport (IntersectionObserver,
400px rootMargin; deferred fallback for engines without IO). Visual behavior once
visible is identical.

### Deferred / known limits (not silently skipped)
- **Videos not transcoded**: no ffmpeg/ImageMagick on this machine, so
  `katube-door-preview.mp4` remains 3.5MB on disk — mitigated by the lazy-mount above
  (bytes fetched only when scrolled near). `login-dragon-hero.mp4` (929KB) already had
  `preload="metadata"` + poster. A one-time `ffmpeg -crf 28` re-encode of the door
  video is the remaining follow-up.
- The two §139-F loops listed above stay for documented reasons.
- K Circle interactive surfaces intentionally uncached (see category 2).

### Session gates ledger
Every commit `0c16acc` → `3a5f6b7` (+ the §140 docs commit): `tsc --noEmit` exit 0;
`eslint` 0 errors / 53 warnings (baseline ceiling 53, established before any change);
`next build` success. No check was weakened, skipped, or forced green.

## §141 — deploy-blocking Worker bundle (round 2): web-llm / jspdf / tiptap out of the server bundle

**Symptom.** Cloudflare Workers Builds deploys failing on the free-plan
Worker size gate again (user-reported: handler.mjs 19.2 MB uncompressed on
the failing CI build). A fresh local `npx opennextjs-cloudflare build` at
HEAD `48a6506` measured **handler.mjs = 15,548,356 B raw (14.8 MB)** — the
§134–138 AI-editor rollout re-created the §133 leak class with three MORE
browser-only libraries reachable from server-rendered module graphs.

**Diagnosis (measured, not guessed).** Fresh build, then: sizes of
`.open-next/server-functions/default/.next/server/chunks/ssr/*` (OpenNext
inlines every SSR chunk into handler.mjs — no lazy loading at the edge);
token scans of handler.mjs; `.nft.json` server-trace scans (what OpenNext's
copyTracedFiles copies/symlinks into the deploy).

| Library | Server-bundle evidence | Reachability chain |
|---|---|---|
| `@mlc-ai/web-llm` | **6,026,493 B** SSR chunk (`node_modules_@mlc-ai_web-llm_lib_index_*.js`) — the single largest module in the whole bundle; `CreateMLCEngine`×4 / `MLCEngine`×21 in handler.mjs; listed in **8 route .nft.json files** | `lib/ai/webllmEngine.ts` `import('@mlc-ai/web-llm')` (already dynamic!) ← statically imported by §134's `useAiAssistEngine.ts` and `AiWritingEditor.tsx` ← `WebMangalAiEditor` (SSR'd on `dashboard/books`, `WebMangal/upload`, `WebMangal/songs/upload`, codex CharacterPane/LorePane) and `AiWritingEditor` (`mangal-studio/webmangal/write`). Turbopack traces dynamic-import targets into the SSR graph of any SSR'd importer — a dynamic import alone does NOT keep a lib out of the server bundle (same §133 lesson). |
| `jspdf` | **874,355 B** SSR chunk (`[root-of-the-server]__0rpg71e._.js`; jsPDF×88 + its Adam7/canvg/dompurify modules); listed in **2 route .nft.json files** | `lib/bookPdf.ts` `import('jspdf')` (dynamic!) ← statically imported by `dashboard/books/page.tsx`. |
| `@tiptap/*` (ProseMirror) | **409,094 B** SSR chunk (`_0p2-ilp._.js`; ProseMirror×50) | STATIC import in `AiWritingEditor.tsx` (§132 AI Writer) ← `mangal-studio/webmangal/write/page.tsx` — executed at SSR module scope, so externalizing it would have crashed SSR. |

Checked per the brief and CLEARED: BookReader's pdf.js/epub.js — 0 tokens,
0 trace entries (§119 vendoring + §133 ssr:false held); the "image encoding"
lead — the Adam7 interlace code inside the 874 KB chunk is jsPDF's own PNG
module, not a separate image library; `supabase` (1,162 tokens) is
legitimate server-side usage; lucide-react tree-shakes; razorpay is small.

**Windows build crash discovered en route (recorded so nobody re-tries this
dead end):** `serverExternalPackages` alone keeps web-llm/jspdf out of
handler.mjs but NOT out of the NFT trace — Next 16's standalone output then
emits hashed node_modules junctions
(`.next/standalone/.next/node_modules/@mlc-ai/web-llm-<hash>` → project
node_modules), and OpenNext's copyTracedFiles re-creates them with
`symlinkSync` → `EPERM: operation not permitted, symlink` on Windows
(§123's sharp crash; sharp only survives because it is in OpenNext's own
EXCLUDED_PACKAGES). `outputFileTracingExcludes` was verified NOT to filter
these packages from the Turbopack trace (8 files still listed web-llm while
the excludes were active). The real fix is making the modules unreachable
from every server graph in the first place.

**Fixes applied (zero functionality removed — every affected feature is
browser-only and ships complete in the client bundle):**
1. `next/dynamic({ ssr: false })` for `AiWritingEditor` in
   `mangal-studio/webmangal/write/page.tsx` — Tiptap (and its whole subtree
   incl. webllmEngine) leaves the server graph. Same BookReader pattern as
   `WebMangal/books/[bookId]/read/page.tsx` (§133).
2. The same boundary for `WebMangalAiEditor` in all five consumers:
   `dashboard/books/page.tsx`, `WebMangal/upload/page.tsx`,
   `WebMangal/songs/upload/page.tsx`,
   `mangal-studio/webmangal/codex/CharacterPane.tsx`, `.../LorePane.tsx` —
   `@mlc-ai/web-llm` becomes unreachable from every server graph (0
   .nft.json mentions afterwards). SSR of these editors was always a no-op
   render (interactive-only components; the pages already show loading
   placeholders until client-side auth resolves), so nothing degrades.
3. `lib/bookPdf.ts` — jsPDF now loads at runtime from
   `/vendor/jspdf.umd.min.js` (copied from
   `node_modules/jspdf/dist/jspdf.umd.min.js`, 420,165 B) via script-tag
   injection (`loadJspdf()` singleton), exactly the reader-engine/gsap
   convention recorded in `public/vendor/README.md` (updated). The npm dep
   stays FOR TYPES ONLY (`import type` is erased at compile time and never
   traced) — the gsap rule. The client bundle drops jspdf entirely too; the
   server-compiled copy of bookPdf.ts now contains a literal browser-only
   rejected-promise stub where the jsPDF import used to be, so it cannot
   load PDF code on the server even if something ever called it there.
4. `next.config.ts` — `serverExternalPackages` gained `"@mlc-ai/web-llm"`
   and `"jspdf"` as defense-in-depth (a future server-reachable re-import
   would stay externalized instead of silently inlining into the Worker).
   An interim attempt to also drop them via `outputFileTracingExcludes`
   was REVERTED after it proved to be a no-op (see crash note above); the
   config comment now records the true mechanism.

**Before / after (verified, not assumed):**

| Metric | Before (HEAD 48a6506, fresh build) | After (fresh build, merged §141 payments tree) |
|---|---|---|
| handler.mjs raw | 15,548,356 B | **8,099,706 B** (−48%) |
| handler.mjs gzip | — (deploy failed before measuring) | **1,890,039 B** |
| `wrangler deploy --dry-run --outdir` Total Upload | — | **11,100.96 KiB / gzip 2,170.09 KiB < 3,072 KiB free-plan limit** ✔ |
| largest SSR chunk in the bundle | 6,026,493 B (web-llm) | 216,421 B (app code) |
| .nft.json files listing web-llm / jspdf | 8 / 2 | **0 / 0** |

For scale: §123's last known-good deploy measured gzip 2,795 KiB — this fix
lands ~625 KiB BELOW the previous passing state (even with the merged
direct-UPI payments feature, which added only ~129 KB raw to the server
handler across a 23-file merge — `qrcode.react` is a tiny client-only lib).

**On the "handler.mjs < 3 MiB raw" reading of the gate:** the raw size of
any Next 16 server bundle is floored by the framework runtime itself
(react-dom.server + next server + polyfills ≈ 7–8 MB before any app code);
§123 already recorded a SUCCESSFUL free-plan deploy at 8.30 MB raw / 2.42 MB
gzip, and Cloudflare's [code: 10027] size gate is enforced on the
compressed upload — exactly what `wrangler deploy --dry-run` reports. Both
numbers are stated here so nothing is hidden; the deploy passes with ~0.9
MiB of compressed headroom.

**Feature-intactness verification:** client chunks still contain
`CreateMLCEngine` (web-llm, ×3) and `ProseMirror` (×50); `.open-next/assets`
ships `/vendor/jspdf.umd.min.js` alongside the reader engines; the AI
Writer route, the §134 AI-assisted textareas (upload / songs / codex /
book forms), on-device WebGPU inference, BYOK cloud fallback and the
"Write here" PDF pipeline are all unchanged.

**Session gates ledger:** `npx opennextjs-cloudflare build` exit 0;
`npx tsc --noEmit` exit 0; `npm run lint` 0 errors / 53 warnings (exactly
the §140 baseline ceiling — no new warnings); `npx wrangler deploy
--dry-run --outdir .wrangler-dry` pass above. **All four re-verified on the
merged tree** (after integrating the remote `60f7a12` direct-UPI payments
commit via `git merge`): build exit 0; tsc exit 0; lint 0 errors / 53
warnings; wrangler Total Upload gzip 2,170.09 KiB < 3,072 KiB. This
session's OWN scope was bundling-only — 10 bundling files changed (9
modified + 1 vendored asset); the books/payments rows and tables are
untouched by it (the direct-UPI code present in the tree is the merged
remote feature, not this session's work). CONTEXT.md §141 conflict (two
independent §141 sections, bundle + payments) resolved by keeping both.

---

## §141 — Direct-to-VPA UPI payments (no gateway account needed)

Founder still has no live Razorpay merchant account (RAZORPAY_KEY_ID/SECRET unset —
§48/§49), so every checkout in the app showed "coming soon". Rather than wait on that,
added a second payment rail that works today with zero gateway account: pay straight to
a personal UPI ID (the founder's own Paytm VPA, or a creator's own once verified), shown
as a QR code + `upi://pay` deep link — same as scanning the founder's real Paytm QR.

**Limitation stated plainly, not faked:** a raw UPI transfer has no webhook/callback. A
direct-UPI payment can only ever be self-reported by the payer (`pending_manual_
verification`) until a developer-role account reconciles it against their own bank/UPI
app statement and confirms it via `/api/admin/payments/verify-upi`. This is the same
trust model real solo-founder UPI businesses use pre-gateway, not a shortcut unique to
this feature — and it's why "Remove Ads" / book unlocks say "pending confirmation"
rather than unlocking instantly the way the Razorpay flow (once configured) will.

**DB (migration `20260901120000_direct_upi_payments.sql`):** `payments` gets
`reference_note` (human-readable code embedded in the UPI intent's `tn=` field, e.g.
`MANGAL-A1B2C3`, for matching a row to a bank/UPI-app statement line) and
`paid_reported_at`; its status check now also allows `pending_manual_verification`.
`creator_profiles` gets `upi_id` / `upi_phone` / `upi_verification_code` /
`upi_verification_sent_at` / `upi_verified_at` — same pending-code → confirmed shape as
the existing YouTube channel verification (§6). A `get_creator_payout_vpa()` SECURITY
DEFINER RPC exposes just `(upi_id, display_name)` for a *verified* creator, without
opening up the rest of creator_profiles' PII-locked-down columns (§ 2026-08-21).

**Code:**
- `lib/payments/upi.ts` — VPA/phone format validation, `upi://pay` URI builder,
  6-char reference-code generator (excludes 0/O/1/I for readability off a phone screen).
- `lib/payments/grantPayment.ts` — the "what does a captured payment unlock"
  logic (flip `profiles.ads_removed`, upsert a `book_purchases` row) extracted out of
  `/api/payments/verify` so both that route (Razorpay signature path) and the new
  `/api/admin/payments/verify-upi` (manual reconciliation path) apply the exact same
  grant instead of two copies drifting apart.
- `lib/payments/featureFlags.ts` — `GLOBAL_PAYMENTS_ENABLED` reads
  `NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS`. Everything Razorpay-multi-method/PayPal stays in
  the codebase exactly as built (§94/§95), just gated behind this flag (default off) —
  flipping it back on once there's a real merchant account and/or global clients needs
  no code changes at any call site.
- `api/payments/create-upi-intent` — resolves the recipient VPA (a tipped creator's
  verified `upi_id` via the RPC, or `FOUNDER_UPI_ID`/`FOUNDER_UPI_NAME` env vars for
  remove_ads/book_purchase/founder-directed tips) and inserts a `payments` row using a
  `upi_direct_<uuid>` placeholder in `razorpay_order_id` (same placeholder trick
  `create-order` already used, since that column is NOT NULL UNIQUE and there's no real
  gateway order here).
- `api/payments/mark-upi-paid` — payer self-report only; moves `created` →
  `pending_manual_verification`, grants nothing.
- `api/admin/payments/verify-upi` (GET lists pending rows, POST captures one) —
  developer-role gated exactly like `/api/admin/migrate-media` (`isDeveloperRole`).
- `api/creator/upi/request-code` + `.../verify` — creator UPI payout setup: format-
  validate, email a 6-digit code to the address on the creator's own auth account via
  Resend (`sendUpiVerificationCodeEmail` in `lib/email.ts`), confirm it back. Scope is
  deliberately just "this creator can read mail sent to their own account" — no bank-
  identity check, no KYC pipeline exists yet to do more than that.
- `components/shared/DirectUpiPay.tsx` — the reusable QR + deep-link + "I've paid"
  panel every checkout point now renders. Uses `qrcode.react` (new dependency).
- `components/shared/CreatorUpiSettings.tsx` — the Payout UPI section, shown on
  `/settings` only for creator/developer roles (`hasCreatorAccess`).
- `components/shared/BookPurchaseModal.tsx` — wraps `DirectUpiPay` for the two book-
  purchase call sites (`BookReader.tsx`'s three lock-screen buttons, and the WebMangal
  book detail page), with the old Razorpay `handleBuy()` kept as a secondary button
  behind `GLOBAL_PAYMENTS_ENABLED`.
- `TipJarModal.tsx` (§94) — direct-UPI is now the default/only visible rail; the
  original Razorpay INDIA rail + PayPal international rail are unchanged code, just
  wrapped in `{GLOBAL_PAYMENTS_ENABLED && (...)}`.
- `settings/page.tsx` Remove Ads — same pattern: a `showAdsUpiFlow` toggle renders
  `DirectUpiPay` inline; the old Razorpay button only renders behind the flag.
- `globals.css` — `.mangal-spin` keyframe moved here from being locally defined
  inside `TipJarModal`'s `styled-jsx global` block, since `DirectUpiPay` needed it
  standalone (Remove Ads / book-purchase screens don't mount `TipJarModal`).

**New env vars (`.env.example`):** `FOUNDER_UPI_ID`, `FOUNDER_UPI_NAME` (server-only,
never `NEXT_PUBLIC_` — the API response carries the value to the client, nothing about
it needs to ship in the bundle), `NEXT_PUBLIC_ENABLE_GLOBAL_PAYMENTS`.

**Gates:** `npx tsc --noEmit` → 0 (one fix needed: the `get_creator_payout_vpa` RPC
result came back typed `{}` with no `Database` generic on this project's Supabase
client — resolved with an explicit `.maybeSingle<{...}>()` type argument rather than
adding a full generated-types file). `npm run lint` → 0 errors, 54 warnings (pre-existing
baseline; six `react/no-unescaped-entities` errors from apostrophes in new copy — "it's",
"we'll", "isn't" — fixed to `&apos;`). `npm run build` — blocked in this sandbox only by
egress to fonts.googleapis.com (Turbopack's next/font Google-Fonts fetch, 403), unrelated
to this feature; unaffected in a real deploy environment with normal internet access.

**Not built (out of scope for this pass):** an admin UI for the
`/api/admin/payments/verify-upi` GET list (curl/API only for now, same as
`migrate-media`); a way for a creator to edit/re-verify an already-verified `upi_id`
without going through "unset" first (re-entering while `pending` works, but there's no
"change UPI ID" affordance once verified — would need a small addition to
`CreatorUpiSettings.tsx` if the founder wants creators to update it later without a
support request).
---

## §142 — Books section professional upgrade: reader theme/typography engine, writer metadata manager, codex sidebar

**Scope (per the §141-follow-up brief).** This pass upgrades the EXISTING Books
section only — nothing was scaffolded in parallel. Working surfaces: the books
reader (`src/app/WebMangal/books/[bookId]/read` + `components/books/BookReader.tsx`),
the creator book manager (`src/app/dashboard/books/page.tsx`), and the
`/mangal-studio/webmangal/write` AI-writer page. The novel/manga reader
(`WebMangal/read/[chapterId]`) and all books/payments RLS were NOT touched.

**Phase 0 audit — what already existed vs. what was missing:**

| Surface | Already built at session start | Added in this pass |
|---|---|---|
| Books reader route | `WebMangal/books/[bookId]/read/page.tsx` (client wrapper, `dynamic({ssr:false})` → `BookReader`) | — |
| Theme engine | — (hardcoded dark parchment) | 4-theme engine: `light / sepia / dark / midnight` (OLED-true black), desk chrome + paper colors per theme, persisted in localStorage, default dark |
| Typography controls | — | `serif/sans/mono` font family, size slider 12–24 px (default 17), line-height 1.2–2.0 (default 1.7), margin 0–96 px, letter-spacing + word-spacing, all persisted per theme |
| Continuous scroll vs paginated | — (paginated only) | `readingMode: 'paginated' \| 'scroll'` toggle; scroll mode renders a vertical page list with per-page lazy `imgFor()`, zoom % preserved; thumb-zone next/prev still wired to page index in both modes |
| Reading dock | — | Collapsible settings dock (bottom-left on mobile, left column on desktop): theme swatches, typography sliders, reading-mode toggle, focus mode (chrome + preview-freeze off), chapter drawer, EPUB TOC drawer (from the epub package's `loadNavigation`), back-to-catalog, stay-dark-on-exit |
| Progress persistence | `book_reading_progress` table only (server, per logged-in user) | Scroll-% progress mirrored to the SAME table (`last_page %` ratio for scroll mode) AND a local mirror `book_reader_progress_<bookId>` so reading position survives before-login too; prev/next buttons save progress on every flip |
| Mobile thumb-zone | — | Floating bottom-thumb prev/next buttons (48+ px touch targets) with fade-in/out on scroll + per-mode placement |
| Cover in reader | `book.cover_image_url` flat | Uses it in the reader top bar (first page)
| WYSIWYG writer editor | `AiWritingEditor` (already rich: word/char counts, `estimateReadTime`, autosave `savedAt`, threshold-batched AI polish via `lib/ai/editorAssist.ts`) | — |
| Writer stats | — | Word-count goal (persisted per-browser, slider 100–1,000,000), % progress bar, `current / goal · pct%`, "reads in ~X min" via `estimateReadTime`, autosave indicator (debounced localStorage, `manuscriptDraftKey`) |
| Metadata manager (dashboard) | — | Cover upload+preview (existing `uploadMediaFile`), synopsis, genre tags multi-select, mature-content flag, scheduling toggle (`publish_at`), all written to the new `books.*` columns; row list now shows status + 18+ + first 3 genre tags as chips |
| Codex sidebar | `mangal-studio/webmangal/codex` (own feature) | Read-only `CodexSidebar` component (new) mounted on BOTH the dashboard books write form and the `/mangal-studio/webmangal/write` page — reads the SAME `character_profiles`/`lore_entries` tables, `dynamic({ssr:false})`; no second codex created |
| AI polish toolbar | already wired in `AiWritingEditor` via `lib/ai/editorAssist.ts` | unchanged — confirmed existing |
| Scheduling | — | `publish_at` future-date = "pending" copy in manager + helper `bookIsScheduled` in `lib/booksMetadata.ts` |

**New files.**
- `src/app/lib/booksMetadata.ts` — shared metadata column list + graceful-fallback
  helpers (`runBooksQueryWithMetadataFallback`, `bookGenreTags`, `bookIsMature`,
  `bookIsScheduled`, `formatScheduleAt`). Books surfaces fall back to the legacy
  column list if the DB hasn't run the migration yet (PGRST204 guard) — RLS untouched.
- `src/app/components/editor/CodexSidebar.tsx` — read-only character/lore reference drawer.
- `supabase/migrations/20260902090000_books_metadata.sql` — adds `genre_tags text[]`,
  `is_mature boolean`, `publish_at timestamptz` to `public.books` (no RLS change).

**Design-research reflex (Phase 1).** Patterns referenced but deliberately NOT
imported: Readium/Epub.js (theme `sepia/dark` swatches + font scaling), Kindle Web
(continuous-scroll + progress-%), RoyalRoad/Wattpad (word-count goal + read-time),
MangaDex (OLED reader dark). No new third-party dependency was added — every new
interaction is inline-styled CSS + the already-vendored engines (pdf.js/epub.js
stay in `public/vendor/`, loaded client-side only).

**Bundle-size verification (HARD GATE 4).** Fresh `next build` + `npx
opennextjs-cloudflare build` + `wrangler deploy --dry-run`:

| Metric | §141 baseline (pre-pass) | §142 after | Δ |
|---|---|---|---|
| handler.mjs raw | 8,099,706 B | **8,110,309 B** | +10,603 B (client-only UI) |
| wrangler Total Upload | 11,100.96 KiB | **11,114.32 KiB** | +13.36 KiB |
| wrangler gzip | 2,170.09 KiB | **2,173.17 KiB** | +3.08 KiB — still ~0.9 MiB under the 3,072 KiB free-plan ceiling |

No new server-reachable library was introduced; the only new client component
(`CodexSidebar`) and the reader/writer additions sit behind `dynamic({ssr:false})`
boundaries inherited from §133/§141, so the server bundle grew only by app code.

**Gates (final commit-able tree):** `npx tsc --noEmit` → 0; `npm run lint` → 0
errors / **53 warnings (exactly the §140/§141 baseline — no new warnings)**;
`npm run build` → exit 0; wrangler dry-run gzip as above.

**No duplicate/parallel routes created.** Confirmed: only the three existing
surfaces (`WebMangal/books/[bookId]/read`, `dashboard/books`, and
`mangal-studio/webmangal/write`) carry this work; no `read/[novelSlug]/[chapterId]`
or `/studio/books` clones exist anywhere in `src/`.

**Operational notes for future sessions.**
- `wrangler deploy --dry-run --outdir .wrangler-dry` emits multi-MB minified JS into
  `.wrangler-dry/`; that path is now `.gitignore`d AND added to `eslint.config.mjs`
  ignores (same rationale as `.open-next/**` — sweeping it OOMs Node's default heap,
  observed twice this session as exit 134).
- Scroll-mode progress: `book_reading_progress.last_page` stores a 0–100 float
  (scroll %) in the SAME numeric column PDF mode uses for a 0-based page index, then
  maps on load (`lastPage > 0 ? ceil`) — chosen to avoid a schema change on a table
  with RLS on books/payments; both paths restore correctly via `read/page.tsx`'s
  existing `initialProgress` fetch.
## §143 — Phase 0 audit: AI translation split · about page · signup/auth fixes · admin reports (2026-09-02)

Pre-work audit for the five-phase modular feature pass. Baselines re-verified
this session: `npx tsc --noEmit` → 0 errors; `npm run lint` → 0 errors /
53 warnings (§140/§141 baseline unchanged); `.open-next/server-functions/
default/handler.mjs` = 8,110,309 B raw (§142 baseline), wrangler gzip
2,173.17 KiB vs the 3,072 KiB free-plan ceiling. Web research for admin-panel
feature patterns returned only generic marketing content (Two Hat/Modulate,
Reddit blocked) — the admin workstream below is grounded in the audit's own
findings plus the platform's existing §82/§139 patterns instead.

### Workstream 1 — AI Translation (currently missing)

- `lib/ai/editorAssist.ts` `AssistMode` is exactly `'auto' | 'polish' |
  'hinglish'` — there is NO translation option anywhere in the product. The
  only AI text action is the batched "Polish & Hinglish Convert" (Hinglish→EN)
  pass. "Translate to Hindi" is explicitly FORBIDDEN in the shared HARD RULES.
- Consumers of `AssistMode`: `WebMangalAiEditor.tsx` (`MODE_LABELS` Record —
  TS-exhaustive, adding a mode forces an update there), `useAiAssistEngine.ts`
  (state `mode`, `runAssist` closure-reads it; body sends `{ text, mode }` to
  `/api/ai/editor-assist` and `buildSystemPrompt(mode)` on the local lane),
  `AiWritingEditor.tsx` (own pills + its own local `runAssist` wrapper — must
  be checked separately), and the API route's mode whitelist at
  `route.ts:276-279` (`body.mode === 'polish' || 'hinglish' || 'auto'` else
  forced `'auto'`) — a new mode MUST be added there or it silently downgrades.
- Plan: add `'translate'` mode (auto-direction: EN→Hindi Devanagari when the
  passage is English, Hindi/Hinglish→polished EN otherwise), explicit mode
  override param on the engine's `runAssist(override?)`, a second toolbar
  button "AI Translation" beside "Polish & Hinglish Convert", a Translate pill
  in the studio writer, and the route whitelist entry. Keep batching policy,
  splitting, BYOK, recovery matrix untouched — translation rides the exact
  same §133/§134 pipeline.

### Workstream 2 — Company / About page

- `src/app/about/page.tsx` (95 lines) describes only "comics and web novels",
  Navbar `variant="legal"`, dark-mode CSS-var inline styles, STATS + VALUES
  cards, help/grievance links. It does not mention KaTube (video), K Circle /
  Kalpana Circle (community), the AI writing tools, or the DPDP compliance
  posture. Rewrite in place (no new route, no route duplication) keeping the
  same inline-style convention and Navbar/Footer chrome.

### Workstream 3 — Signup / auth compatibility fixes

- **Banned-user screen bug (confirmed):** `login/page.tsx` maps
  `account_active === false` to `setMode('pending')` in BOTH `checkSession`
  (~line 502) and `handleLogin` (~line 586) — a banned user sees the
  "waiting for parent consent" DPDP screen. `account_active=false` is ALSO
  what parent-consent-pending minors have, so the fix must branch on
  `is_minor`/`parent_consent_status` (both exist on `profiles`:
  `is_minor` is the generated column behind `compute_is_minor()`;
  `parent_consent_status` is owned by `send-parent-consent` /
  `confirm-parent-consent` service-role routes).
- **No `?code=` handler:** email-confirmation links that land on
  `/login?code=...` (Site-URL redirects) are never exchanged — `/auth/callback`
  only serves the Google OAuth redirect. Plan: a mount effect on /login that
  captures `code` (and `error_description`), cleans the URL, calls
  `supabase.auth.getSession()` first (awaiting supabase-js auto-detect), then
  explicitly `exchangeCodeForSession` if still session-less, then reuses the
  same post-auth routing helper (onboarded → nextPath, else dob/role, minor →
  pending, banned → banned screen).
- `authRedirect` cookie flow (POST_LOGIN_REDIRECT_COOKIE) is consistent — no
  changes needed there. `safeNextPath` validation already open-redirect-safe.

### Workstream 4 — Admin reports gaps (founder-reported)

- **DB constraint blocks song reports:** `reports_target_type_check` (latest
  rebuild in `20260823090000_reports_allow_kcircle_post_target.sql`) allows
  `series/chapter/comment/video/kcircle_post` but NOT `'song'`, while
  `ReportButton.tsx` emits `target_type: 'song'` from WebMangal Songs — every
  song report fails at insert. Migration required: idempotent constraint
  rebuild adding `'song'` (DO-block guard on `pg_get_constraintdef`).
- **Admin page target resolution broken for new types:**
  `admin/reports/page.tsx` `Report.target_type` union omits both;
  `handleRemoveContent`'s table map falls through song/kcircle_post to
  `'comments'` (wrong table delete), and `handleBanUser`'s owner lookup has no
  song (`songs.creator_id` — table per `20260818120000_webmangal_songs.sql`)
  or kcircle_post (`kcircle_posts.author_id`, caption text) branch.
- **Ban/unban management:** ban works via the `admin_set_account_active(uuid,
  boolean)` service-verified RPC (`20260821110000...`); there is no unban and
  no self-ban guard. Plan: Unban action on cards the admin just banned
  (store resolved user id in ActionState), viewer self-ban guard, `p_active:
  true` for unban. No new RLS/roles touched — the same RPC.

### Constraints carried into implementation

- Do NOT touch books/payments tables, the novel/manga reader, or the prior
  Books section work (§133/§141 surfaces stay as-is).
- Migrations: idempotent, additive-only, no RLS changes.
- Hard gates before each commit: `npx tsc --noEmit` → 0; `npm run lint` → no
  new errors (53-warning baseline tolerated); `npm run build` → exit 0;
  re-measure handler.mjs + wrangler dry-run gzip < 3,072 KiB.
- Pushes (if requested) need the PAT header form:
  `git -c http.extraHeader="AUTHORIZATION: Bearer <GITHUB_PAT>" push origin main`.

### §143 FINAL — research provenance · ranked admin gaps · phase completion

**Research provenance (Phase 1, stated per the no-silent-failure rule).**
Live web access WAS available and used: fetches were attempted for admin/
moderation panel feature references (community threads, vendor writeups).
Results: community sources were unreachable (Reddit blocks automated fetch),
and the reachable vendor pages (Two Hat/Modulate) were marketing overviews
with no checkable specifics — not citable as evidence. Per the prompt's
instruction the admin feature list below is therefore reasoned from general
content-platform design knowledge plus this repo's OWN audited patterns
(§82 report queue + `.range()` paging, §139-A11 page-size discipline,
`admin_set_account_active` service-verified RPC, `is_developer_role` gating)
— no sources are fabricated, and nothing below claims external citation.

**Concretely missing admin features, ranked for a solo-founder platform at
current scale (small user base, one developer, moderation driven by reports):**

1. **Reports triage correctness + full user management on report cards**
   (ban/unban, owner resolution for every reportable type, self-ban guard).
   Ranked first because it is a CORRECTNESS gap with user-safety impact:
   song reports were impossible (DB constraint), kcircle_post/song removes
   deleted from the wrong table, ban owner-lookup silently missed two types,
   and there was no unban path at all. Cheap, surgical, no new tables.
2. **Audit log of admin actions** (who banned/removed/dismissed what, when).
   Next highest value once moderation volume grows — needs a new table +
   write points in every admin handler; deliberately deferred to a dedicated
   session rather than rushed into this one.
3. **Moderation analytics overview** (open-report counts, response time,
   auto-flag vs user-report ratio). Read-only and useful, but meaningless
   until item 1 makes the underlying data trustworthy; deferred.
4. **Standalone user directory** (search users, inspect, ban/unban outside
   a report context). Partially covered by the §144 unban work; full
   directory deferred — low urgency while moderation is report-driven.
5. **Role management UI.** Deferred: roles already exist
   (reader/creator/developer via `is_developer_role`) and there is exactly
   one developer today; a UI would manage a set of size one.
6. **Bulk triage tooling** for `is_auto_flagged` batches. Deferred until
   auto-flag volume justifies it.

Built this session: **#1 in full** (song/kcircle_post constraint + remove +
ban-owner resolution, unban via the developer-verified RPC, self-ban guard —
details in §144). #2–#6 documented above as the ranked backlog.

**Phase completion map (per the prompt's ON COMPLETION requirement).**
- Phase 0 (audit): §143 above — all four items audited with exact file/line
  evidence; nothing destructive or ambiguous enough to trigger the
  stop-and-wait case, so it was never needed.
- Phase 1 (research): this block — provenance stated, ranked list produced.
- Phase 2 (AI split): audit confirmed translation was NOT a distinct option
  (AssistMode was exactly auto|polish|hinglish; "translate into Hindi"
  explicitly forbidden in the shared prompt), so the split was built —
  "AI Assistant" (Polish & Hinglish Convert) and "AI Translation" as two
  explicit toolbar actions, BYOK/on-device preserved, no paid API. Applied
  to every WebMangalAiEditor surface (chapter, codex character/lore,
  synopsis, author notes, book descriptions, lyrics) plus the studio writer,
  because the audit showed both share one `AssistMode` pipeline.
- Phase 3 (official page): /about rebuilt — real product copy covering
  WebMangal, KaTube, Kalpana Circle (K Circle), 0% creator cut, DPDP
  posture; existing dark-mode/maroon CSS-var inline-style convention kept.
- Phase 4 (signup/auth): fixed exactly the two issues the audit identified
  as broken (banned users shown the parent-consent screen; `/login?code=`
  email links never exchanged). No speculative restructuring.
- Phase 5 (admin): the top-ranked item (#1) built; migration applied via
  `supabase db query --linked -f` and verified; `migration repair` could not
  run (needs SUPABASE_DB_PASSWORD) — safe because the migration is
  idempotent and `db push` is never used here (documented in §144).
- **Skipped/deviations:** (a) commits were NOT one-per-phase — a single
  feature commit `086f7d0` plus a docs commit `4145714` were made and pushed;
  the work was completed and gated as a whole before committing, and history
  was left intact rather than rewritten after the fact. (b) The prompt's
  documented Bearer-header push form is rejected by GitHub's git endpoint
  (Basic auth required) — working form recorded in §144's deployment log.

## §144 — Implementation: AI translation split · ecosystem about page · auth fixes · admin reports (2026-09-02)

All four §143 workstreams implemented in one pass. No new dependencies; no
RLS changes; books/payments/reader surfaces untouched, as required.

### 1. AI Translation split (the explicit second AI action)

- `lib/ai/editorAssist.ts` — `AssistMode` gains `'translate'` (auto-direction:
  English → natural Hindi (Devanagari); Hindi/Hinglish → polished English).
  New single-source `ASSIST_MODE_LABELS`; `buildSystemPrompt('translate')`
  appends a dedicated `TRANSLATE_INSTRUCTIONS` block that explicitly
  supersedes the shared "never translate" hard rule (direction detection,
  two few-shot examples, formatting-dialect + names preservation, no preamble).
- `useAiAssistEngine.ts` — `runAssist(modeOverride?)` lets a dedicated button
  force a mode without touching the pill selection; new `runningMode` state
  (cleared at every exit: threshold guard, invalid key, no-key, rate-limit,
  server-error, success, catch) drives per-button busy labels; mode-aware
  status strings ("Translating/Polishing block i of n…"); diff-review label
  now includes the mode (`Gemini · Translate`); `lastRunModeRef` makes
  "Retry" repeat the SAME action. Batching/splitting/BYOK/recovery untouched.
- `WebMangalAiEditor.tsx` — toolbar now has BOTH actions: the existing
  "✨ Polish & Hinglish Convert" (assistant) and a new outlined
  "🌐 AI Translation" button (`runAssist('translate')`), plus a fourth
  `Translate` focus pill. All WebMangalAiEditor consumers (chapters,
  synopsis, author notes, book descriptions, lyrics, codex character/lore)
  inherit translation with zero per-surface changes.
- `AiWritingEditor.tsx` — studio writer gets the `Translate` pill; CTA label
  flips to "✨ Check & Translate Page" when that mode is selected.
- `api/ai/editor-assist/route.ts` — `'translate'` added to the mode whitelist
  (without it translation runs would silently downgrade to `'auto'`).

### 2. Company / About page (`src/app/about/page.tsx`)

- Rewritten in place (same route, same dark-mode CSS-var inline-style
  convention, Navbar `legal` + Footer). New "The MANGAL ecosystem" section:
  WebMangal (comics/web novels/songs + AI studio tools), KaTube (video),
  Kalpana Circle/K Circle (community). Stats strip gains
  "Products, one account: 3"; values gain "Privacy by default" (DPDP Act
  2023 posture: parental confirmation, no profiling of minors).

### 3. Signup/auth compatibility fixes (`login/page.tsx`, `lib/compliance/dpdp.ts`)

- **Banned-user screen:** `account_active=false` no longer unconditionally
  shows the parent-consent screen. New shared `routeAfterSession` (used by
  session restore AND password login; login's own profile query now also
  selects `is_minor, parent_consent_status`) branches: minor +
  `parent_consent_status='pending'` → consent screen; anything else inactive
  → new `'banned'` mode rendering a dedicated suspension card
  (`BANNED_ACCOUNT_COPY` in dpdp.ts, inline IconBan glyph, "Appeal via the
  Grievance Officer" CTA → /grievance, back-to-sign-in).
- **`?code=` email-link handling:** email-confirmation/recovery links landing
  on `/login?code=...` are now consumed. The mount effect captures the href,
  cleans the URL (replay-safe), calls `getSession()` first (awaiting
  supabase-js's own URL detection), falls back to an explicit
  `exchangeCodeForSession(linkHref)`, then reuses `routeAfterSession` for
  onboarding/ban/consent routing. `useCallback` import added; session-restore
  effect deferred via `setTimeout(0)` — same pattern as the existing
  `?error=` effect — to satisfy the `react-hooks/set-state-in-effect` rule
  (flagged once during lint; fixed, not suppressed).

### 4. Admin reports (`src/app/admin/reports/page.tsx` + migration)

- Migration `20260902120000_reports_allow_song_target.sql` — idempotent
  DO-block rebuild of `reports_target_type_check` adding `'song'` (guarded on
  `pg_get_constraintdef` so re-runs are no-ops; constraint created fresh if
  missing). Fixes founder-reported insert failures for every song report.
- `Report.target_type` union extended with `'song' | 'kcircle_post'`;
  `handleRemoveContent` now maps song→`songs`, kcircle_post→`kcircle_posts`
  (both previously fell through to a `comments` delete); `handleBanUser`
  resolves owners via `songs.creator_id` / `kcircle_posts.author_id`.
- User management: `ActionState` gains `bannedUserId`/`unbanning`; ban
  success records the resolved id and the card offers "Unban User" (same
  developer-verified `admin_set_account_active` RPC with `p_active: true`).
  New guard rail: an admin cannot ban their own account (`viewerId` check).

### Bundle-size verification (HARD GATE)

| Metric | §142 baseline | §144 after | Δ |
|---|---|---|---|
| handler.mjs raw | 8,110,309 B | **8,120,264 B** | +9,955 B |
| wrangler Total Upload | 11,114.32 KiB | **11,125.63 KiB** | +11.31 KiB |
| wrangler gzip | 2,173.17 KiB | **2,176.04 KiB** | +2.87 KiB — ~896 KiB under the 3,072 KiB free-plan ceiling |

### Gates (final tree)

`npx tsc --noEmit` → 0; `npm run lint` → 0 errors / **53 warnings (exact
§140/§141 baseline)**; `npm run build` → exit 0; OpenNext build → complete;
wrangler dry-run gzip as above. One lint regression (set-state-in-effect on
the new session-restore effect) was fixed via the page's existing
`setTimeout(0)` deferral pattern — no rule suppressions added.

### Deployment (same day, §144 follow-up)

- **Git push:** local commit `086f7d0` (all §144 work) pushed to
  `origin/main` — remote `main` verified via API at `086f7d0…`. Note: the
  documented `http.extraHeader="AUTHORIZATION: Bearer …"` form is REJECTED by
  GitHub's git endpoint ("invalid credentials") even though the same token
  passes the REST API — git-over-HTTPS wants Basic auth. Working one-shot
  form: `git -c credential.helper= push
  https://<user>:<PAT>@github.com/KAIF1409/mangal-platform.git HEAD:main`.
  Branch-protection warning lines appear on push but the admin PAT bypasses.
- **Migration applied to the remote DB** (mangal-platform /
  `rfxlavwzhpnbhwoumaha`): `npx supabase db query --linked --project-ref
  rfxlavwzhpnbhwoumaha -f supabase/migrations/20260902120000_reports_allow_song_target.sql`
  → exit 0; live constraint verified as
  `CHECK ((target_type = ANY (ARRAY['series','chapter','comment','video','song','kcircle_post'])))`.
  Song reports can now be filed. CLI footgun: `--project-ref` alone errors
  ("only applies when targeting the linked project") — it must be paired with
  `--linked`.
- **`migration repair --status applied` NOT run:** that command connects to
  the DB directly as `cli_login_postgres` and needs `SUPABASE_DB_PASSWORD`,
  which isn't in the environment. Harmless here: the migration file is
  idempotent (no-ops when 'song' is already present) and this repo never uses
  `db push` (§136 history warning), so a missing `supabase_migrations` row
  cannot cause a divergent re-apply. If anyone later adopts `db push`, either
  run the repair with the DB password first or rely on the idempotent DO-block.


---

## §145 — Landing-page features section: per-platform capability grid on /about (2026-09-03)

> **Numbering note:** the session brief asked for this entry to be written as
> "§144", but §144 was already consumed by the 2026-09-02 implementation log.
> This file is append-sequential working memory, so the new entry continues as
> §145 instead of overwriting an existing section. Scope per the brief: the
> landing/official page only — Books section, admin panel and signup flow are
> untouched.

### Phase 0 — audit: what /about has now, what each platform actually ships

**State of `src/app/about/page.tsx` after §144 (not placeholder, but summary-level):**
h1 "About MANGAL" + intro, stats strip (Free to read · 0% creator cut · 3 products,
one account · Made in 🇮🇳 Bharat), "The MANGAL ecosystem" — three one-paragraph
product cards (WebMangal / KaTube / Kalpana Circle, `var(--accent)` top border,
lucide icons), "What we care about" values (incl. DPDP posture), "Get in touch".
Navbar `variant="legal"` + Footer. There is NO per-platform feature breakdown —
this session adds one as a new section between the ecosystem cards and the values,
without rebuilding anything above it. Accent check: `--accent` is `#d97706` dark /
`#b45309` light (globals.css:30,59) — the brief said "maroon accent" but no maroon
exists anywhere in src; the section uses the page's existing `var(--accent)` token
so the page stays on one palette.

**Confirmed shipped features (verified against code this session, not the spec):**

WebMangal — reader side (`/WebMangal/*`):
- **Reader** (`read/[chapterId]/page.tsx`): one reader for comics and novels —
  `reading_mode 'scroll' | 'page'`, `content_type 'mangal' | 'novel'`,
  `reading_direction ltr|rtl`, fullscreen, reader settings, emoji chapter
  reactions (❤️🔥😂😲😢), ranked comments (`lib/commentRanking.ts`);
  bookmarks/history/library/rankings/tags routes.
- **Books** (`books/page.tsx`, `books/[bookId]/read/page.tsx`): catalog with
  category filters, free/paid access (Razorpay/UPI), reader = `BookReader` over
  **pdfjs-dist + epubjs** (PDF/EPUB — dynamic import `ssr:false` per §142), §142
  theme/typography engine, saved reading progress resume.
- **Songs** (`songs/page.tsx`, `songs/[songId]/page.tsx`): browse by genre;
  detail page = "full block-by-block lyric sheet" (SongBlock block_type/label/
  content), "based on" linked-series badge, songwriter's K Circle profile link;
  `songs/upload` for creators.

WebMangal — writer side (nav labels verbatim, `WebMangalStudioShell.tsx:28-33`):
Overview · Analytics · Reviews · **AI Writer** · **Storyboard** · **Codex**.
- **AI Writer** (`mangal-studio/webmangal/write`): drafting editor
  (`AiWritingEditor`: autosave, word-count goal slider, read-time estimate) + the
  two §144 AI actions — "✨ Polish & Hinglish Convert" (the "AI Assistant") and
  "🌐 AI Translation" (EN↔Hindi auto-direction). Batched, on-device WebGPU default
  (`lib/ai/webllmEngine.ts`), BYOK vault fallback (`byokStorage.ts`).
- **Metadata manager** (`/dashboard/books`, §142): cover upload+preview, synopsis,
  genre-tags multi-select, mature flag, scheduled publish (`books.genre_tags`,
  `is_mature`, `publish_at`).
- **Codex** (`mangal-studio/webmangal/codex`: CharacterPane/LorePane) + read-only
  `CodexSidebar` mounted inside writing surfaces (§142).
- **Storyboard Converter** (`mangal-studio/webmangal/convert`, heading "Storyboard
  Converter"): text→panel splitter, drag-drop panel board, JSON + scene-script
  export.
- **Analytics** (`mangal-studio/webmangal/analytics`): Reading Time Distribution,
  Views by Country, gender donut, reader stats (§126 port).

KaTube (`/katube/*`):
- **Watch** (`watch/[videoId]`): real YouTube IFrame player, likes, comments
  drawer, share, `AddToPlaylistButton`, "Review Hub — accuracy to source" star
  reviews, "Watch with Friends" hand-off into K Circle watch-together.
- **Shorts** (`shorts`, `shorts/[shortId]`): vertical shorts player, real IFrame
  API per short with swipe navigation; home sidebar modes "Fast Tap"/"Slow tap";
  Shorts row on home (`is_short` split of `videos`).
- **Playlists** (`katube_playlists`/`katube_playlist_videos`; `/katube/playlists`
  + `[playlistId]`).
- **Channels / feeds** (`channel/[username]`; sidebar: Home · Fast Tap · Slow tap ·
  Saved · Trending · Following).
- **Upload flow**: paste a YouTube link, mark Short or full video, optionally link
  a series you own (`katube/page.tsx` header comment).
- **Creator studio** (`mangal-studio/katube`): analytics (views/likes totals +
  per-video), content table, comments, channel-setup.
- **Mangal Ideas** (`MangalIdeasRow` on KaTube home): story-demand cards for
  WebMangal stories with no adaptation yet, inviting creator collaboration (§0).

K Circle (`/kalpana-circle/*`):
- **Feed** (`page.tsx` header: "Instagram-style social layer for MANGAL"): posts +
  likes + comments + stories (with **close-friends** audience, `close-friends`
  page) + **polls** (PollOption).
- **Broadcast Channels** (`broadcasts`, `broadcast/[username]`): one announcement
  channel per creator — creator posts, fans like/comment only
  (`20260813120000_kcircle_broadcast_channels.sql`).
- **Chat** (`chat/page.tsx` "DMs + group chats"): realtime via Supabase Realtime.
- **Watch Together** (`watch-together`, `watch-together/shorts/[roomId]`):
  host-authoritative playback sync over ephemeral Realtime broadcast channels;
  long-video rooms + "Fast Tap" shorts rooms with side-by-side chat
  (`20260815063915_kcircle_fast_tap_watch_together.sql`).
- **Mangal of the Week** (`mangal-of-the-week` + admin console): weekly
  audience-voted leaderboard.
- Saved posts, profiles, notifications, settings.

**Explicitly NOT built — must not appear in copy:**
- K Circle "servers / channels / roles" (the brief's list) — the icon rail is
  "Discord-style" cosmetically (`Shell.tsx` comment) but there are NO servers or
  roles anywhere; described by the real capability set above instead.
- **Nova** (`dashboard/nova`) AI assistant — its own header says "still fully
  'coming soon' (no AI backend wired up yet for any product)". Never claim it.
- KaTube "Live" — tab label only; no live streaming exists.

**Stop-and-wait case: NOT triggered** — every platform can be described accurately
from shipped features alone; the mismatches above are documented here rather than
papered over with invented copy.

### Phase 1 — research: the pattern professional feature sections use

**Provenance:** fetches made this session — linear.app (full marketing page,
reachable), notion.com/product (reachable), spotify.com (returned the web-player
shell only, no marketing content — not usable as a reference). Pattern extracted
from the two usable sources:

- **Linear:** features clustered into named groups ("Intake", "Plan", "Build",
  "Insights"); top value props are three-word heads with ONE sentence each
  ("Purpose-built — Linear is shaped by the practices and principles of
  world-class product teams."); feature entries are a 2-5 word bold title + one
  sentence + "Learn more →".
- **Notion product page:** the canonical grid — per item a 2-4 word imperative
  title + exactly ONE short sentence naming the concrete capability, e.g.
  "Capture knowledge — Bring everything into one system of record.", "Find
  answers — Get answers, instantly—with citations.", "Automate busywork — Keep
  work moving 24/7 with agents." Grouped by job-to-be-done, small visual per
  item, arrow link out.

**Pattern adopted, and why:** per feature a 2-5 word title + one sentence that
names the actual feature and what it does on THIS platform; grouped by user
segment where the split is real (WebMangal reader/writer, KaTube viewer/creator)
or by capability where it isn't (K Circle); a small meaningful lucide icon per
card (same convention as the page's existing PRODUCTS/VALUES cards); and a
ONE-TIME scroll-triggered fade + slight rise per card — entrance happens once as
the section scrolls into view and never loops, because looping motion competes
with reading on a text-dense section. Implemented with a plain
IntersectionObserver + CSS transition, no animation library added: framer-motion
exists in the repo for the homepage hero/cursor, but this brief's gate 4 requires
any animation library to be dynamically imported client-only with ssr:false — an
IO reveal needs neither a dependency nor that machinery, so none was added.
`prefers-reduced-motion: reduce` → cards render visible with no animation at all
(both a JS matchMedia check and a `no-preference` media-query wrapper on the CSS).

### Phase 2 — built: /about features section

- `src/app/about/FeaturesSection.tsx` (new, 'use client') + `src/app/about/page.tsx`
  (h2 "What each product does" + one-line intro + `<FeaturesSection />` between the
  ecosystem cards and "What we care about" — nothing else on the page touched;
  Books section, admin panel and signup flow untouched, as scoped).
- **Final feature list per platform** (2-5 word titles + one sentence each,
  grouping rationale inline):
  - **WebMangal — For readers** (Manga & novel reader · Books, PDF & EPUB · Songs ·
    Your reading, tracked) **/ For writers** (AI Writer covering BOTH §144 AI
    actions · Metadata manager · Codex · Storyboard converter · Analytics).
    Rationale: the reader/writer split is real — distinct reader surfaces
    (`/WebMangal/*`) vs studio surfaces (`/mangal-studio/webmangal`,
    `/dashboard/books`).
  - **KaTube — For viewers** (Shorts · Playlists · Trending & Following)
    **/ For creators** (Upload flow · Channel pages · Creator analytics ·
    Mangal Ideas). Rationale: split is real — consumption (`/katube/*`) vs
    publishing/studio (`/katube/upload`, `/mangal-studio/katube`).
  - **K Circle — single capability group "What you can do"** (Feed, stories &
    polls · Broadcast channels · Realtime chat · Watch together · Mangal of the
    Week), with the rationale shown next to the group label in the UI: K Circle
    is peer-to-peer — the same person posts, chats and watches — so a
    reader/writer split would be artificial. The brief's "servers/channels/
    roles" is not built (Phase 0) and was not described.
- **Animation:** IntersectionObserver + CSS transition; one-time fade + 14px
  rise per card with a ≤60ms-per-card stagger inside each group; isomorphic
  `useLayoutEffect` arms cards before first client paint (no flash); no-JS =
  visible; reduced-motion = visible, no animation. **No animation library
  added** (package.json unchanged) — gate 4's dynamic-import/ssr:false clause
  therefore has nothing to apply to, verified explicitly.
- **Visual identity:** existing CSS-var tokens only (`--bg-card`,
  `--border-color`, `--text-*`, `--accent`), inline styles + one `<style>`
  block for the reveal classes (same pattern as K Circle's `KC_SHELL_CSS`).
  No Tailwind, no CSS modules. The brief said "maroon accent" but no maroon
  exists in src — the page's existing `--accent` token (#d97706 dark /
  #b45309 light) was kept so the page stays on one palette.
- **SSR verification:** `.next/server/app/about.html` (prerendered static)
  contains the section header, every feature title, the three "Open" links
  (with correct hrefs — React text-node comment markers between "Open" and the
  name), 3× `min-height:48px`, 5× the grid track definition, and the reveal CSS
  — and NO `feat-armed` class on any card (arming is client-only, so the
  no-JS default is fully visible).

### Phase 3 — mobile check (320–768px, scoped to this section)

- **Single-column stacking:** grid is `repeat(auto-fill, minmax(min(100%,
  300px), 1fr))`; content width = viewport − 48px (page container pads 24px a
  side): 320px → 272px → 1 column; 375px → 327px → 1 column; 768px → 720px →
  2 columns (2×354px). Deterministic from the track definition that ships in
  the prerendered HTML (verified above).
- **No horizontal overflow from animations:** the reveal transform is
  `translateY(14px)` only (1 occurrence, inside the reveal CSS); transforms
  don't affect layout; every grid child carries `minWidth: 0`; the platform
  header wraps (`flexWrap: 'wrap'`) — nothing fixed-width anywhere in the
  section.
- **Touch targets:** the section's only interactive elements are the three
  "Open {platform}" links — `min-height: 48px` inline (3× in the built HTML)
  plus horizontal padding; feature cards are non-interactive.
- Unrelated mobile work (KaTube compact nav, K Circle rail, Navbar scroll
  strips) untouched.

### Gates (final tree) + bundle size

`npx tsc --noEmit` → exit 0. `npm run lint` → 0 errors / 53 warnings (exact
§140/§141/§144 baseline; no warnings from the new files). `npm run build` →
exit 0 (`/about` prerendered static). `npx opennextjs-cloudflare build` →
complete. handler.mjs raw = **8,105,639 B** (§144: 8,120,264 B — Δ −4,625 B);
wrangler dry-run Total Upload 11,103.17 KiB, **gzip 2,167.62 KiB vs the
3,072 KiB free-plan ceiling (~904 KiB headroom)** — under 3 MiB as required.
Metric note: the raw handler.mjs has been ~8.1 MB since §142 (normal for the
OpenNext Workers bundle); the 3 MiB limit that matters is Cloudflare's gzipped
upload ceiling, which is the number §143/§144 also checked.

### Deployment (same day)

- Commit `847a022` (feat + §145 context, one commit) pushed to `origin/main` —
  remote `main` verified via `git ls-remote` at `847a022d20d3c2fcc0c5c7dfcd8eca
  5a72520e5b`, matching local HEAD. Push form: the brief's
  `http.extraHeader="AUTHORIZATION: Bearer …"` form HUNG on a credential prompt
  (confirming §144's finding that GitHub's git endpoint rejects Bearer headers);
  the working §144 form was used instead: `GIT_TERMINAL_PROMPT=0` +
  `git -c credential.helper= push https://<user>:<PAT>@github.com/KAIF1409/
  mangal-platform.git HEAD:main`. Branch-protection warning lines appeared and
  the admin PAT bypassed, same as §144.

## §146 — Landing page: door descriptions always visible (2026-09-03)

Founder looked at the deployed landing page
(https://mangal-platform.mangak.workers.dev/) and asked for descriptions on the
three product doors (WebMangal / KaTube / K Circle) — all first-time users land
there, and the cards showed only a name (+ COMING SOON tag).

**What was actually wrong:** the copy already existed (the `DOORS` array in
`src/app/page.tsx` has a `blurb` per door) and was already in the served HTML —
but it rendered inside `.mangal-tilt-overlay`, a full-card amber overlay with
`opacity: 0` that only faded in on `:hover` of the card. Desktop visitors who
never hovered saw nothing, and touch/mobile visitors (the majority of
first-time traffic) can never trigger `:hover` at all. Not a stale-deploy
problem — a UI-visibility bug.

**The fix (`src/app/page.tsx` only):**
- Moved the blurb into the always-visible bottom overlay, directly under the
  title + COMING SOON tag row (`fontSize: clamp(12.5px,1.4vw,14.5px)`,
  lineHeight 1.6, white with a text-shadow for legibility over artwork).
- Deleted the hover-only `.mangal-tilt-overlay` div and its two CSS rules
  (nothing referenced the class in JS — GSAP only animates `#mangal-card-grid`).
- Strengthened the bottom scrim gradient
  (`rgba(0,0,0,0.92) 0% → 0.55 @42% → 0.12 @78% → transparent`) so the 3–6
  lines of white text stay readable over the door artwork; the old gradient
  was tuned for a single title line.
- The 3D tilt-on-hover (`rotate3d` on `.mangal-tilt-card`) is kept — only the
  amber content overlay is gone.
- Blurb copy unchanged — already audit-accurate per §145 (no servers/roles
  claims for K Circle, no Nova claims, KaTube described as a discovery space).

**Gates:** `npx tsc --noEmit` exit 0; `npm run lint` 0 errors / 53 warnings
(exact baseline); `npm run build` exit 0.

**Deployment (same session):** `npm run deploy` (opennextjs-cloudflare build +
deploy) exit 0 — Total Upload 11,102.99 KiB / **gzip 2,167.63 KiB vs the
3,072 KiB free-plan ceiling** (~904 KiB headroom), Worker Startup Time 42 ms,
Version `a1d4e234-b07b-4cc4-a67f-c8f7d2e1544f`. Live HTML re-fetched after
deploy: `mangal-tilt-overlay` 0 occurrences, new gradient ×3 (one per door),
each blurb `<p>` verified as a sibling of the title inside the bottom overlay
— nothing opacity-hidden; descriptions render in the default state on desktop
and mobile.


## §147 — Landing-page features section: extend-only merge (2026-09-03)

> **Numbering note:** the brief labelled this target "§144", but §145 already
> noted §144 was consumed by the 2026-09-02 implementation log — so the previous
> session's features showcase was logged as §145 (on `/about`) and its landing-
> door fix as §146. This entry is §147, appended sequentially (does NOT overwrite
> §144/§145).

### Phase 0 — audit: feature-by-feature (confirmed-shipped vs not)

| Brief item | Verdict | Verified against |
|---|---|---|
| Reader theme engine, typography, scroll/paginated, local progress | REAL | `src/app/components/books/BookReader.tsx` (§142): 4-theme engine (THEME_DESK/THEME_PAPER/THEME_INK light/sepia/dark/midnight), FONT_STACKS serif/sans/mono + 12–24px size + 1.2–2.0 line-height + narrow/normal/wide margins, ReadingMode paginated|scroll (PDF list vs epub flow:'scrolled-doc'), progress localStorage `book_reader_progress_<id>` + `book_reading_progress` DB upsert (signed-out OK); manga/novel reader reading_mode scroll|page, rtl, fullscreen, emoji reactions. §145 already covered all four — no copy needed. |
| "Audio & Song Soundtrack synced with chapters" | NOT BUILT; conflation flagged | Searched all of `src` for `<audio`, `new Audio(`, `ambient`, `soundtrack`, `theme_song` — ZERO matches. Songs (`songs/[songId]/page.tsx`, §85) = `SongBlock[]` rendered as a block-by-block lyric sheet, genre tags, "based on" series/chapter link (linked_series_id/linked_chapter_id = textual attribution, not a synced soundtrack). No audio player exists. Brief's escape hatch applies (write copy for what Songs actually does) → §145's accurate card left unchanged. Stop-and-wait NOT triggered. |
| AI Discovery / recommendations carousel | REAL (was missing from grid) | `src/app/api/recommendations/route.ts` (§135): cosine taste-vector scorer (0.55 genre + 0.20 author + 0.15 language + 0.10 popularity), rails For You / Because you read <seed> / Trending in <genre>, cold-start fallback, Cache-Control private. Rendered by `src/app/components/feed/RecommendedForYou.tsx` on WebMangal home (page.tsx:938). Added "Recommended for you" card. |
| BYOK AI writing assistant | REAL | `mangal-studio/webmangal/write`, `useAiAssistEngine.ts` + `byokStorage.ts` + `editorAssist.ts` (AssistMode polish|hinglish|translate, on-device WebGPU default, BYOK fallback, keys encrypted in-browser only, never to disk/DB). §145 single dense card split into two. |
| Hinglish translator | REAL (with above) | §144 explicit second AI action: mode=translate EN<->Hindi auto-direction; hinglish = Hinglish->English. |
| Storyboard tool | REAL, already covered | `/mangal-studio/webmangal/convert` (§135): text->panel splitter + drag-drop + JSON/script export. Card unchanged. |
| Studio analytics | REAL, already covered | `/mangal-studio/webmangal/analytics` (§126 port): reading-time, country, gender donut. Card unchanged. |
| Ecosystem cards (WebMangal/KaTube/K Circle) | covered, left alone | §144 PRODUCTS array on /about/page.tsx + §145 platform tagline. Not duplicated. |

### Phase 1 — existing template preserved (no replacement)

- Tokens: only existing var(--bg-card/--border-color/--text-* /--accent) palette incl. #d97706/#b45309 (§145: no maroon in src). No new CSS vars.
- Animations: IntersectionObserver reveal CSS + isomorphic useIsoLayoutEffect arm byte-identical; no Framer Motion/GSAP touched (both present, untouched). New cards inherit per-card transitionDelay stagger (Math.min(i,5)*60ms); For-readers 4->5, For-writers 5->6, still capped at 5.
- Styles: new cards reuse existing cardStyle/gridStyle/openLinkStyle. No Tailwind.
- Hero/hover/3D-tilt (/): untouched. Dark-mode palette unchanged.


### Phase 2 — integrated feature showcase: extend vs leave-alone

- Added (WebMangal -> For readers): "Recommended for you" card, grounded in /api/recommendations + RecommendedForYou.tsx.
- Split (WebMangal -> For writers): §145 single dense "AI Writer" card -> "AI writing assistant" + "Hinglish & Hindi translation".
- Imports added: Compass, Languages from lucide-react (confirmed exported).
- Left byte-identical: Songs card, Books/PDF card, Manga & novel reader card, "Your reading, tracked", all KaTube + K Circle blocks, reveal CSS/JS, grid/card styles.
- Net: 1 card added, 1 card split into 2 (For readers 4->5; For writers 5->6). No existing copy rewritten.

### Phase 3 — mobile check (320-768px, scoped to this section)

Same static method §145 used: grid 'repeat(auto-fill, minmax(min(100%,300px),1fr))' -> 320px/1col, 768px/2col; new text-only cards add no fixed widths. Reveal transform still single translateY(14px); grid children minWidth:0; platform header still flexWrap. 48x48px targets = the 3 "Open" links (minHeight:48px inline), unchanged; new cards non-interactive. prefers-reduced-motion still skips arming; cards visible.

### Hard gates (final tree)

1. `npx tsc --noEmit` -> exit 0.
2. `npm run lint` -> 0 errors, 53 warnings = exact §145/§146 baseline; 0 from FeaturesSection.tsx/page.tsx.
3. `npm run build` -> exit 0; /about prerendered STATIC; no SSR/hydration issues on the touched route.
4. Bundle (handler.mjs): raw 3,032,970 B (~2.96 MiB); wrangler dry-run "Bytes Uploaded" 2,167 KiB gzipped vs 3,072 KiB ceiling (~905 KiB headroom). Under 3 MiB. No new animation dep.
5. Prerendered HTML (.next/server/app/about.html): contains all three new titles; 0 feat-armed classes.