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