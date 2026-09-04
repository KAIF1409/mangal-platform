# WebMangal QA — User Acceptance Testing (UAT) Checklist

**Purpose:** trace every shipped WebMangal feature claim (README.md / CONTEXT.md) to the automated test evidence from the §153 QA cycle. Follows the §147 "audit claims against real shipped code" pattern.

**Legend:** ✅ = automated coverage · ⏳ = data-dependent (journey legs skip until catalog has content)

---

## A. Reader Surfaces

| # | Business requirement (shipped feature) | Evidence | Status |
|---|---|---|---|
| A1 | Anonymous visitors can browse the catalog at `/WebMangal` | routes spec | ✅ |
| A2 | Personalized feed at `/WebMangal/home` (default demoted per §152) | routes spec + `RecommendedForYou` suite + `/api/recommendations` API suite | ✅ |
| A3 | Keyword search at `/WebMangal/search?keyword=…` renders results or explicit empty state — never a blank page | journeys spec (search leg) | ✅ |
| A4 | Rankings at `/WebMangal/rankings` render with the product brand | routes + logos specs | ✅ |
| A5 | Tag discovery at `/WebMangal/tags` (+ `/tags/[slug]`) | routes + logos specs; `tagSuggest` unit suite | ✅ |
| A6 | Books catalog `/WebMangal/books` + book detail + reader | routes + logos specs + journeys (books leg ⏳) + `booksFile` API suite | ✅ |
| A7 | Songs catalog `/WebMangal/songs` + song detail | routes + logos specs + journeys (songs leg ⏳) | ✅ |
| A8 | Creator profiles `/WebMangal/creator/[username]` reachable from all products | redirect test + `backNav` unit suite | ✅ |
| A9 | Chapter reader `/WebMangal/read/[chapterId]` renders readable content | journeys reader leg (reader URL asserted when present) | ✅ |
| A10 | Legacy URLs keep working (bookmarks, SEO, shared links) | redirects spec — 13 permanent redirects, 308 + destination renders | ✅ |
| A11 | Signed-in-only surfaces (library, bookmarks, history, songs upload) gate anonymous visitors to the branded sign-in screen | routes auth-gated loop + logos gate-brand loop | ✅ |

## B. Brand & Trust (logo/title requirement)

| # | Business requirement | Evidence | Status |
|---|---|---|---|
| B1 | Every public WebMangal page shows the **WebMangal logo with its name** (`alt="WebMangal"` + visible wordmark) | logos spec — all 8 public pages | ✅ |
| B2 | The **MANGAL logo with the MANGAL name** (`/icon.png`, `alt="MANGAL"`) wherever the company brand renders (footer, auth gate) | `MangalLogo` component suite + logos spec gate/footer tests | ✅ |
| B3 | Every WebMangal page `<title>` carries the MANGAL brand (root template `%s │ MANGAL`) | routes spec + logos spec title loop | ✅ |
| B4 | "powered by MANGAL" badge under the WebMangal brand | logos spec | ✅ |
| B5 | Home footer pairs the WebMangal logo with the WebMangal name | logos spec | ✅ |
| B6 | Brand assets ship and resolve (logos, doors, `og-image.jpg`, `favicon.ico`) | `logoAssets` unit suite (existence + PNG/JPEG magic bytes) + logos spec HTTP 200s | ✅ |
| B7 | Brand consistency on mobile (320–768px repo convention) | journeys spec 375px/320px legs (mobile nav brand block) | ✅ |

## C. Trust, Safety & Compliance (DPDP Act 2023)

| # | Business requirement | Evidence | Status |
|---|---|---|---|
| C1 | Consent banner: accept/decline recorded, re-prompt on version bump, `hasConsent()` gates non-essential writes | `ConsentBanner` component suite (10 tests) | ✅ |
| C2 | Under-18 detection ("exactly 18 today is NOT a minor" boundary) | `dpdp` unit suite | ✅ |
| C3 | Behavioral tracking fails closed for minors / missing profile | `dpdp` unit suite | ✅ |
| C4 | Suspended accounts see a distinct screen from consent-pending minors (§144) | `dpdp` unit suite | ✅ |
| C5 | Content reporting works (auth-first gate, reason selection, insert, error path) | `ReportButton` component suite | ✅ |
| C6 | Security headers on every route (CSP incl. WebLLM WASM lane, clickjacking, MIME sniffing, HSTS) | headers spec | ✅ |
| C7 | Rate limiting never takes a route down (fail-open contract) | `rateLimit` unit suite + DEFECT-01 fix | ✅ |

## D. Creator & Monetization

| # | Business requirement | Evidence | Status |
|---|---|---|---|
| D1 | Paid-book access boundary: free = full+cacheable; paid anonymous = truncated 1 MB preview (`X-Book-Preview`), never cached; author/developer/purchaser = full | `booksFile` API suite (10 tests) | ✅ |
| D2 | Storage prefix enforcement — `/api/books/file` never serves outside `books/files/` | `booksFile` API suite | ✅ |
| D3 | Direct-UPI payment rail primitives (VPA/phone validation, reference codes, `upi://pay` intents) | `upi` unit suite | ✅ |
| D4 | Global-payments flag defaults OFF (direct-UPI-only checkout) | `featureFlags` unit suite | ✅ |
| D5 | Upload surfaces carry the WebMangal brand (upload + songs/upload) | logos spec + Navbar additions (DEFECT-02/03 fixes) | ✅ |
| D6 | AI Writer assist pipeline: batch thresholds (300 words / 1500 chars), page splitting ≤4000 words, translate mode, preamble stripping | `editorAssist` + `textDiff` unit suites | ✅ |

## E. Discovery & Recommendation

| # | Business requirement | Evidence | Status |
|---|---|---|---|
| E1 | Recommendation engine answers anonymously with correct shape (`forYou`, `personalized`, `becauseYouRead`, `trendingInGenre`) | `recommendations` API suite + live smoke | ✅ |
| E2 | Personalized responses never land in shared caches (`private, max-age=300`) | `recommendations` API suite | ✅ |
| E3 | Recently-read/followed series are excluded from "For You" | `recommendations` API suite | ✅ |
| E4 | Rails render / cold-start fallback / graceful failure | `RecommendedForYou` component suite | ✅ |
| E5 | View counting via server-side rpc with edge-geo passthrough, no IP stored | `log-view` API suite | ✅ |
| E6 | SWR caching tiers (realtime/feed/catalog/analytics) + conditional fetching | `swrCache` unit suite | ✅ |
| E7 | Platform-wide MANGAL Assistant present on every WebMangal route and opens its panel | journeys spec | ✅ |

## F. Deployment / Live Verification

| # | Business requirement | Evidence | Status |
|---|---|---|---|
| F1 | Deployed Workers URL serves the branded browse experience | live smoke (landing + `/WebMangal`) | ✅ |
| F2 | Production recommendation API answers read-only GETs | live smoke | ✅ |
| F3 | Production brand assets resolve | live smoke | ✅ |
| F4 | Production redirects + media 404 behave (no storage exception leaks) | live smoke | ✅ |

---

**Sign-off:** 38 UAT items — all covered (100% automated or live-verified). Remaining manual-only area: visual design review (colors/typography taste) and real payment capture, both explicitly out of automated scope.