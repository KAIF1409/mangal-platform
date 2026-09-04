# WebMangal QA Report — Full Test Cycle

**Date:** 3 September 2026
**Scope:** WebMangal (product under `/WebMangal` in `src/app`)
**Target:** Local production build (`next build` + `next start`) + deployed Workers URL (read-only smoke)
**Run commands:** `npm run test` (unit+components+api), `npm test:e2e` (local suites), `npm run test:live` (deployed URL)

---

## 1. Executive Summary

| Layer | Result | Tests |
|---|---|---|
| Unit / logic / algorithm | ✅ PASS | 184 (25 files) |
| Component / integration | ✅ PASS | included above |
| API route call tests | ✅ PASS | included above |
| E2E / routes / redirects / logos / journeys / headers | ✅ PASS | 57 passed, 3 skipped* |
| Live smoke (deployed URL, read-only) | ✅ PASS | 7 passed |
| System / regression gate | ✅ PASS | `build` + full local suite green |

\* 3 skips are data-dependent journey legs (no published series/books/songs in the DB yet) — they assert navigation & rendering, not seed data.

**Total: 248 automated checks passing (184 vitest + 57 local e2e + 7 live e2e), 0 failures.**

---

## 2. Test Layers & Coverage

### 2.1 Unit & Logic-Algorithm Testing — `src/__tests__/unit/` (14 files)
- **`format.ts`** — number/₹ formatting, en-IN grouping.
- **`commentRanking.ts`** — Webnovel comment score algorithm, page sizing math.
- **`booksMetadata.ts`** — §142 fallback, scheduled publish, mature-content gating.
- **`backNav.ts`** (+ SSR variant) — back-navigation history logic in both environments.
- **`rateLimit.ts`** — fail-open contract (see Defect DEFECT-01).
- **`swrCache.ts`** — cache key/miss/stale logic.
- **`tagSuggest.ts`** — tag suggestion algorithm, dedupe, vocabulary matching.
- **`dpdp.ts`** — DPDP 2023 age/consent logic (minor detection).
- **`upi.ts`** — UPI payment intents (no real transactions).
- **`textDiff.ts`** — AI editor diff algorithm.
- **`editorAssist.ts`** — AI editor assistance logic.
- **`featureFlags.ts`** — feature flag resolution.
- **`logoAssets.test.ts`** — every brand asset file exists with correct mime (logo integrity).

### 2.2 Component / Integration Testing — `src/__tests__/components/` (8 files, jsdom + Testing Library)
`MangalLogo` (official mark renders `/icon.png`, `alt="MANGAL"`, gradient ring), `Footer` (brand block, platform name, links, external logoHref hardening), `SeriesCard` (rank badges, content-type chips, creator routing), `SongCard` ("Based on" badge, block counts, K Circle routing), `ReportButton` (auth-first gate, reason select, submit + error paths), `RecommendedForYou` (API shapes → rails, cold-start fallback, failure resilience), `ConsentBanner` (DPDP accept/decline/re-prompt + `hasConsent()` gate), `ProductVisitTracker` (cross-product visit recorder). Supabase and `fetch` are mocked at the module boundary — **zero DB access**.

### 2.3 API Call Testing — `src/__tests__/api/` (3 files, node env)
- **`recommendations.test.ts`** — §135 engine: anonymous cold-start rails, personalized exclusion of read/followed series, `Cache-Control: private, max-age=300`, 500 paths.
- **`log-view.test.ts`** — view-counter rpc invocation, edge-geo passthrough, 400/500 handling, malformed-body rejection.
- **`booksFile.test.ts`** — THE paid-content access boundary: free (full + cacheable), paid-anonymous (truncated 1 MB preview, `X-Book-Preview: 1`, `no-store`), author/developer/purchaser full access, non-purchaser stays preview, non-UUID 404, `books/files/` prefix enforcement (defense in depth), epub/pdf content types.

### 2.4 E2E Route & Brand Testing — `e2e/` (Playwright, production build on :3100)
- **`webmangal-routes.spec.ts`** — every public page 200 + MANGAL `<title>` + no crash + no uncaught JS exceptions; 404 handling; all 4 auth-gated pages redirect anonymous visitors to the branded sign-in screen.
- **`webmangal-redirects.spec.ts`** — all 13 legacy → `/WebMangal` permanent redirects, 308 status, destinations actually render, `?q=` → `?keyword=` remap.
- **`webmangal-logos.spec.ts`** — WebMangal logo (`alt="WebMangal"`) + visible wordmark on every public page; MANGAL mark (`/icon.png`, `alt="MANGAL"`) at the auth gate; "powered by MANGAL" badge; footer logo+name pairing; favicon/og/logo assets resolve; `<title>` MANGAL brand on every page.
- **`webmangal-headers.spec.ts`** — CSP (`default-src 'self'`, `frame-ancestors 'none'`, `'wasm-unsafe-eval'` for WebLLM, `*.hf.co` model CDN, `wss://*.supabase.co` realtime), X-Frame-Options DENY, nosniff, Referrer-Policy, HSTS, Permissions-Policy.
- **`webmangal-journeys.spec.ts`** — reader journey (browse→series→chapter), books journey, songs journey, search query handling, MANGAL Assistant chatbot open/panel + presence on other routes, and mobile compatibility at **375px and 320px** (repo's 320–768px convention) — the mobile nav brand block (logo + wordmark) stays visible while the desktop wordmark is intentionally hidden ≤420px.
- **`live/live-smoke.spec.ts`** — read-only smoke against the deployed Workers URL: landing + `/WebMangal` branded, books/songs 200, `/api/recommendations` shape, brand assets, `/home` redirect, media-404 (no storage exception leaks).

### 2.5 Logic covered by unit suites (algorithm-level assertions)
`commentRanking` (Webnovel decay curve vs KaTube's, page sizes 15/10), `tagSuggest` (phrase vs substring scoring, stopwords, exclusions), `dpdp` (exactly-18 boundary is NOT minor, fail-closed tracking gate), `upi` (VPA/phone validation, reference-code charset without 0/O/1/I, `upi://pay` URI params), `textDiff` (LCS word diff, paragraph pairing), `editorAssist` (300-word/1500-char batch thresholds, ≤4000-word page splitting, translate-mode prompt, preamble stripping), `booksMetadata` (PGRST204 fallback, scheduled-publish gating), `rateLimit` (cf-ip priority, fail-open on error AND throw), `backNav` (sessionStorage product tracking + SSR safety), `format` (K/M boundaries), `featureFlags` (strict `'true'` literal), `swrCache` (tier contracts + conditional fetching), plus the SSR variant suite running with no `window`.
---

## 3. Defects Found, Severity, Resolution

| ID | Severity | Description | Resolution |
|---|---|---|---|
| DEFECT-01 | **Medium** | `lib/rateLimit.ts` violated its own stated contract ("fails OPEN if the rate-limit check itself errors"): only an rpc *error result* was handled — a **thrown** error (e.g. malformed env URL) propagated out of the calling API route, turning a rate-limit failure into a 500. | **Fixed** — wrapped in try/catch; both the error-result and thrown paths now fail open with logging. Covered by `rateLimit.test.ts` (4 contract tests). |
| DEFECT-02 | **Medium** | `/WebMangal/books` rendered the generic MANGAL `<Navbar />` (default `platformName="MANGAL"`, `logoSrc="/icon.png"`) — missing the WebMangal product brand required on every WebMangal page. | **Fixed** — Navbar now `platformName="WebMangal"`, `logoSrc="/webmangal-logo.png"`, `href="/WebMangal"`, subtitle "powered by MANGAL". |
| DEFECT-03 | **Medium** | `/WebMangal/tags` and `/WebMangal/upload` rendered **no product navigation at all** — no logo, no wordmark (logo tests failed with "element not found"). | **Fixed** — added WebMangal-branded `Navbar` to both (+ `Footer` on tags; upload wrapped in a fragment with the navbar above its `<main>`). |
| DEFECT-04 | **Low** | The sign-in screen (the brand gate every auth-gated page funnels into) used a decorative inline-SVG flame (`LogoMark`) instead of the official MANGAL mark — `img[alt="MANGAL"]` was absent. | **Fixed** — the sign-in header now renders `MangalLogo` (`/icon.png`, `alt="MANGAL"`). The decorative `LogoMark` remains on the post-auth onboarding screens. |
| DEFECT-05 | **Info** | `<title>` on auth-gated pages transiently reads `""` mid client-side redirect (`window.location.href = '/login'`), racing one-shot `page.title()` reads. The login layout itself already declares "Sign In". | **Test-hardened** — `toHaveTitle(/MANGAL/)` auto-retry instead of a one-shot read. |
| DEFECT-06 | **Info** | E2E page inventory labeled `/WebMangal/songs/upload` "public" although the page client-side gates anonymous visitors to `/login`. | **Test-corrected** — reclassified into `AUTH_GATED_PAGES`. |

**OBS-01 (environment, non-blocking):** on the local Node `next start` server, a runtime dependency logs `ReferenceError: caches is not defined` from the web-server process. It is non-fatal — no request or test is affected (57/57 local E2E green through it). On the deployed Cloudflare Workers runtime `caches` exists natively. Not a code defect; no action taken.
---

## 4. Coverage Against the Requested Test Types

| Requested | Delivered |
|---|---|
| Unit testing | ✅ 14 unit files, algorithm/math/edge-case level |
| Advanced automation frameworks for integration testing | ✅ Vitest 3 + React Testing Library 16 (jsdom), Playwright 1.x (Chromium) |
| Integration testing | ✅ Component suites with mocked Supabase/fetch at module boundary |
| Logic / algorithm testing | ✅ comment ranking, tag suggestion, DPDP boundaries, UPI, text diff, rate limiting, batching/splitting |
| Test cases / use cases testing | ✅ `docs/QA_UAT_CHECKLIST.md` — feature-by-feature traceability |
| Route testing | ✅ routes spec (8 public + 4 auth-gated + 404) |
| API call testing | ✅ 3 API suites (recommendations, log-view, books/file access matrix) |
| Logos with their appropriate name on all WebMangal pages | ✅ logos spec — `webmangal-logo.png` + `alt="WebMangal"` + visible "WebMangal" wordmark on every public page |
| Mangal logo with Mangal title | ✅ `/icon.png` + `alt="MANGAL"` at the auth gate, footer brand block, "powered by MANGAL" badge, `<title>` MANGAL brand on every page |
| All logic testing | ✅ every pure module in `src/app/lib` under test |
| Live testing | ✅ read-only smoke against the deployed Workers URL |
| End-to-End (entire user journey) | ✅ reader/books/songs journeys + chatbot + mobile viewports |
| System Testing (complete integrated product) | ✅ production `next build` + full E2E against `next start` |
| User Acceptance Testing (business needs) | ✅ UAT checklist mapped to shipped README/CONTEXT features |
| Regression Testing | ✅ `npm run test:regression` (vitest + full local E2E) — re-runnable gate after every change |

---

## 5. Final Results

```
Vitest      : 25 files, 184 tests ............ PASS (0 failed)
Playwright  : local-chromium, 60 tests ....... 57 passed, 3 skipped*, 0 failed
Playwright  : live-smoke, 7 tests ............ PASS (deployed Workers URL)
Build gate  : next build (production) ........ PASS (99 routes)
TypeScript  : tsc --noEmit ................... PASS
```

\* skips are data-dependent journey legs (no published series/books/songs in the catalog yet) — they assert navigation & rendering, not seed data.

**Total: 248 automated checks passing, 0 failures.**

---

## 6. How to Reproduce

```bash
npm install                       # adds test devDeps (vitest, @vitejs/plugin-react, jsdom,
                                  #  @testing-library/*, vite-tsconfig-paths, @playwright/test)
npx playwright install chromium   # browser binary (first run only)

npm run test                      # Vitest: unit + components + api (184)
npm run build                     # system gate
npm run test:e2e                  # Playwright local (builds/serves :3100 automatically)
npm run test:live                 # read-only smoke vs https://mangal-platform.mangak.workers.dev
npm run test:regression           # vitest + full local E2E — run after any change
```

NPM scripts added: `test`, `test:watch`, `test:unit`, `test:components`, `test:api`, `test:e2e`, `test:live`, `test:regression`.

## 7. Safety Notes

- **No production data was touched.** All Vitest suites mock Supabase/R2/auth at the module boundary; E2E suites are read-only for the local build (no writes), and the live suite only performs GETs and page renders against the deployed URL.
- **No new runtime dependencies** — test tooling lives entirely in `devDependencies`.
- Test env vars in `vitest.config.mts` are deterministic placeholders; real secrets are never needed or loaded.