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
  Radiant-grey theme, distinct from both MangaNovels and KaTube's palettes.
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
