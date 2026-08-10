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
| **AnimeTube** | `/animetube` | A YouTube-style discovery platform for **AI-generated anime videos made by MANGAL creators**, adapted from their own MANGAL series. Includes a Shorts row. | 🟡 UI demo only — placeholder data, no backend |
| **Anime Chat** | `/anime-chat` | A standalone community space for anime discussion — theories, fan art, reactions, requests for what to adapt next. Deliberately separate from AnimeTube, not a tab inside it. | 🟡 UI demo only — placeholder posts, composer disabled |

The homepage (`app/page.tsx`) shows all three as equal "doors" right under the hero,
plus nav links on both the public landing page and the authenticated `/home` page.

## 2. Why AnimeTube exists (the actual idea, so it doesn't get re-explained from scratch)

- **Not a pirated-anime site.** Every AnimeTube video is meant to be an *original*
  AI-generated adaptation (Runway/Kling/Pika/Hailuo-style tools) made by a MANGAL
  creator of their own series. This avoids copyright risk entirely.
- **Zero-cost architecture, on purpose.** AnimeTube will never host video files
  itself. Creators upload their AI-anime clips to YouTube (their own channel, or a
  shared MANGAL channel early on); AnimeTube only stores metadata (title, YouTube
  video ID, creator, which MANGAL series it's based on, views/likes) in Supabase and
  embeds the YouTube player. This keeps hosting/bandwidth cost at ₹0 regardless of
  scale.
- **Revenue flows to creators via YouTube, not to AnimeTube directly** — that's a
  conscious trade-off. AnimeTube's value is the discovery layer and the funnel back
  into MANGAL (readers discover videos → watch → follow the linked series →
  become MANGAL readers), not ad revenue capture. Monetization for the platform
  itself comes later, once there's real traffic (sponsorships, on-page placements,
  eventually a self-hosted video layer if it's ever worth the infra cost).
- **Anime Chat is the retention layer** — a reason to come back daily even between
  video uploads.

A full founder's-manual style writeup of this reasoning (including DPIIT/Startup
India registration notes and a co-founder pitch) exists as a PDF shared with the
founder directly — not stored in this repo. Ask if a refresher is needed rather than
re-deriving the business case from scratch.

## 3. Current build status (detailed)

### `/animetube` (`app/animetube/page.tsx`)
- Video grid with 6 placeholder cards (gradient tiles standing in for thumbnails,
  title, creator, "based on: [series]" tag, view count, duration)
- Horizontally-scrolling **Shorts** row above the grid — vertical 9:16 cards styled
  like YouTube Shorts, with a SHORTS badge
- Category pills (All, Action, Mythology, Horror, Slice of Life, Fantasy, Trailers)
- **Nothing here is functional yet** — no subscribe, no like, no comment, no real
  video playback. This is explicitly noted in an on-page placeholder disclaimer.
  Don't imply otherwise to the user without checking this file's status table first.

### `/anime-chat` (`app/anime-chat/page.tsx`)
- Placeholder discussion feed (4 sample posts: theory, fan art, request, reaction)
- Channel pills (All, Theories, Fan Art, Requests, Reactions, Introductions)
- Post composer is visibly present but **disabled** ("Post — coming soon") — do not
  make this functional without an explicit request, since there's no posts/comments
  table yet
- Cross-linked with AnimeTube via nav buttons in both directions

### Landing page / nav
- `app/page.tsx` (public landing): three-door section under the hero (MangaNovels /
  AnimeTube / Anime Chat), plus nav links for AnimeTube and Anime Chat
- `app/home/page.tsx` (authenticated landing): same nav links added
- Theme: the whole site defaults to **light/white** (`data-theme="light"` set by a
  blocking script in `app/layout.tsx` unless the user has explicitly chosen dark via
  `ThemeToggle`, persisted in `localStorage['mangal_theme']`). AnimeTube and Anime
  Chat both use the shared `ThemeToggle` component and CSS vars (`var(--bg-primary)`,
  `var(--nav-bg)`, etc.) — never hardcode dark colors on these pages, or they'll
  ignore the site's light-default theme.

## 4. Not built yet (the real next steps, roughly in order)

1. Real Supabase `videos` table (title, youtube_id, creator_id, series_id, views,
   likes, created_at) + wire the AnimeTube grid to real data
2. Creator upload flow — paste a YouTube link, tag the MANGAL series it's based on
3. Ranking (sort by views/likes/recency) — same SQL pattern as existing
   follows/reading_progress features
4. Real Supabase `posts` / `comments` tables for Anime Chat, wire up the composer
5. Subscribe/like/comment interactions across AnimeTube once the above exist

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
  (e.g. dashboard/analytics work happens independently of AnimeTube work).

## 6. Contact / legal details already in use elsewhere in the app

- Platform contact: `mangal.indiaplatform@gmail.com`
- Address on legal pages: PES University, Bangalore, Karnataka, India
- `profiles.role = 'developer'` gates admin/creator-studio access
- `profiles.account_active = false` is how banning is implemented

---
*Last updated: this file was created alongside the initial AnimeTube + Anime Chat
demo build. Update the status table and "not built yet" list whenever scope changes.*
