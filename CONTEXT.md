# MANGAL Ecosystem — Project Context

> **Read this file first, every session.** This is the working memory for the MANGAL
> ecosystem — what it is, what's built, what's next, and the conventions to follow.
> Keep it updated at the end of every session that changes scope or ships a feature.

---

## 1. What this project is

MANGAL started as a single platform (manga/webcomic/novel reading — see `README.md`
for the original product description) and is now expanding into a three-part
ecosystem, all under one Next.js app, one Supabase project, one Vercel deployment:

| Part | Route | What it is | Status |
|---|---|---|---|
| **MangaNovels** | `/`, `/search`, `/read/...` | The original MANGAL platform — read manga, comics, and novels. Fully live. | ✅ Live, in active use |
| **Kalpanaverse** | `/kalpanaverse` | A YouTube-style discovery platform for **AI-generated anime videos made by MANGAL creators**, adapted from their own MANGAL series. Includes a Shorts row. Brand: white + blue (distinct from Kalpana Circle's purple). | 🟡 UI demo only — placeholder data, no backend |
| **Kalpana Circle** | `/kalpana-circle` | A standalone community space for anime discussion — theories, fan art, reactions, requests for what to adapt next. Deliberately separate from the video platform, not a tab inside it. Brand: purple/violet. | 🟡 UI demo only — placeholder posts, composer disabled |

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

**Narrative thread across the three:** *"MANGAL writes the story. Kalpanaverse
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

### 1b. Kalpanaverse brand colors — white + blue

Per founder request, Kalpanaverse uses a **white + blue** palette instead of the
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
- Cross-link colors: on Kalpanaverse, the "Kalpana Circle" nav link stays purple
  (`#7c3aed`) to represent that destination's own brand; on Kalpana Circle, the
  "Kalpanaverse" nav link is now blue (`#2563eb`) for the same reason

## 2. Why Kalpanaverse(now KaTube) exists (the actual idea, so it doesn't get re-explained from scratch)

- **Not a pirated-anime site.** Every Kalpanaverse video is meant to be an *original*
  AI-generated adaptation (Runway/Kling/Pika/Hailuo-style tools) made by a MANGAL
  creator of their own series. This avoids copyright risk entirely.
- **Zero-cost architecture, on purpose.** Kalpanaverse will never host video files
  itself. Creators upload their AI-anime clips to YouTube (their own channel, or a
  shared MANGAL channel early on); Kalpanaverse only stores metadata (title, YouTube
  video ID, creator, which MANGAL series it's based on, views/likes) in Supabase and
  embeds the YouTube player. This keeps hosting/bandwidth cost at ₹0 regardless of
  scale.
- **Revenue flows to creators via YouTube, not to Kalpanaverse directly** — that's a
  conscious trade-off. Kalpanaverse's value is the discovery layer and the funnel back
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

### `/kalpanaverse` (`app/kalpanaverse/page.tsx`)
- Video grid with 6 placeholder cards (gradient tiles standing in for thumbnails,
  title, creator, "based on: [series]" tag, view count, duration)
- Horizontally-scrolling **Shorts** row above the grid — vertical 9:16 cards styled
  like YouTube Shorts, with a SHORTS badge
- Category pills (All, Action, Mythology, Horror, Slice of Life, Fantasy, Trailers)
- Brand: white + blue (`#2563eb`/`#0ea5e9` family) — see §1b
- **Nothing here is functional yet** — no subscribe, no like, no comment, no real
  video playback. This is explicitly noted in an on-page placeholder disclaimer.
  Don't imply otherwise to the user without checking this file's status table first.

### `/kalpana-circle` (`app/kalpana-circle/page.tsx`)
- Placeholder discussion feed (4 sample posts: theory, fan art, request, reaction)
- Channel pills (All, Theories, Fan Art, Requests, Reactions, Introductions)
- Post composer is visibly present but **disabled** ("Post — coming soon") — do not
  make this functional without an explicit request, since there's no posts/comments
  table yet
- Cross-linked with Kalpanaverse via nav buttons in both directions
- Brand: unchanged purple/violet (`#7c3aed`/`#c4b5fd` family)

### Landing page / nav
- `app/page.tsx` (public landing): three-door section under the hero (MangaNovels /
  Kalpanaverse / Kalpana Circle), plus nav links for both
- `app/home/page.tsx` (authenticated landing): same nav links added
- Theme: the whole site defaults to **light/white** (`data-theme="light"` set by a
  blocking script in `app/layout.tsx` unless the user has explicitly chosen dark via
  `ThemeToggle`, persisted in `localStorage['mangal_theme']`). Kalpanaverse and
  Kalpana Circle both use the shared `ThemeToggle` component and CSS vars
  (`var(--bg-primary)`, `var(--nav-bg)`, etc.) — never hardcode dark colors on these
  pages, or they'll ignore the site's light-default theme.

## 4. Not built yet (the real next steps, roughly in order)

1. Real Supabase `videos` table (title, youtube_id, creator_id, series_id, views,
   likes, created_at) + wire the video-platform grid to real data
2. Creator upload flow — paste a YouTube link, tag the MANGAL series it's based on
3. Ranking (sort by views/likes/recency) — same SQL pattern as existing
   follows/reading_progress features
4. Real Supabase `posts` / `comments` tables for the community platform, wire up
   the composer
5. Subscribe/like/comment interactions across the video platform once the above
   exist
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
  (e.g. dashboard/analytics work happens independently of Kalpanaverse work).

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

---
*Last updated: applied the Kalpanaverse / Kalpana Circle rename — routes moved to
`/kalpanaverse` and `/kalpana-circle` (git mv, history preserved), all UI copy and
nav links updated, Kalpanaverse's brand switched to white + blue (see §1b) while
Kalpana Circle keeps its original purple. Update this file again whenever scope
changes further.*
