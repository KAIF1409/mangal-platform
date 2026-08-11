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
| **KaTube** | `/katube` (redirected from `/kalpanaverse`) | A YouTube-style discovery platform for **AI-generated anime videos made by MANGAL creators**, adapted from their own MANGAL series. Includes a Shorts row. Brand: white + blue (distinct from Kalpana Circle's purple). | 🟡 Grid, Shorts, watch page, and upload flow all live on real Supabase data (Steps 1–4); ranking and engagement actions still pending |
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
  gating — matches the existing MangaNovels upload page's convention of
  "logged in is enough." Reachable via the blue "⬆ Upload" nav button on
  `/katube`.
- **Shorts row — real data:** the Shorts row now fetches `videos` where
  `is_short = true` (real YouTube thumbnails via `RealShortCard`, click-through
  to the watch page) and only falls back to the original 6 `DEMO_SHORTS`
  gradient/emoji placeholders when there are zero real Shorts yet — with a
  small "demo placeholders, upload one to replace these" note shown in that
  case. Once any creator uploads a Short, demo cards disappear automatically.
- **Still placeholder / not built:** category pills are static/non-functional.
  No subscribe, no like, no comment, no ranking. Don't imply otherwise to the
  user without checking this file's status table first.
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
- `app/page.tsx` (public landing): three-door section under the hero (MangaNovels /
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

**Status: Step 1 DONE (11 Aug 2026)** — left sidebar (Home / Fast tap / Slow
tap / Saved) + hamburger toggle added to `/katube`. UI-only, as scoped:
clicking a sidebar item just highlights it, does not yet filter/change
content. Sized up to match YouTube's own sidebar proportions per founder
feedback (240px width, 22px icons, 15px text, more padding — was too
cramped at first pass). Next: rename+split the Shorts row / video grid into
the actual "Fast tap" (9:16) / "Slow tap" (16:9) sections, then the
YouTube-style pill-chip filter row (Popular/New ranking/Category/Genre/Tools).

Founder shared a hand-drawn wireframe (11 Aug 2026) for a KaTube layout overhaul.
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
