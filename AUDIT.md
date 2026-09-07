# WebMangal pre-launch audit

Date: 2026-09-07. Baseline: `d819d54`. Status: **initial audit/fix pass complete; NO-GO for public launch**.

This is a bounded evidence-based pass, not completion of every master-prompt
flow. Shared security, book/media boundaries, creator scheduling/rollback,
test gates and anonymous browser journeys were prioritized. Live policy repair,
full authenticated journeys and real-device/cross-browser coverage remain open.

## Method and boundaries

Inspect source and local migrations, reproduce defects with Vitest/Playwright,
fix with regression coverage, then rerun production and Workers gates. No
production mutations, deployment, payment, email blast, or schema repair.
Local migration history is explicitly drifted (`CONTEXT.md`); `db push` is
prohibited. Historical QA reports are not evidence of current correctness.

## Running findings

| ID | Severity | Evidence / reproduction | Root cause | Status |
|---|---|---|---|---|
| SEC-01 | Blocker | GET `/api/media/books/files/<known-key>` anonymously, including a warm cache | Public R2 handler has no private-prefix check, bypassing book purchase route | Fixed locally, tested; not deployed |
| QA-01 | Major | Run `npm test`; free-book body assertion fails; signed-in book cases absent from results | R2 mock lacks `body`/`size`; signed-in `describe` accidentally nested inside a test | Fixed; 14 book-boundary cases now execute |
| QA-02 | Minor | AI splitter test expects one oversized block | Test pins a historical defect after word slicing was implemented | Fixed; bounded-output assertions replace defect expectation |
| API-01 | Major | Authenticated POST `/api/delete-media` with `null` or `{"paths":"x"}` | Type assertion mistaken for runtime validation; property access / `.filter` throws | Fixed; validates whole list, deduplicates, caps 1000 keys |
| PERF-01 | Major | Paid-book preview calls `arrayBuffer()` on entire R2 file before slicing 1 MiB | Full document buffered for every unauthenticated preview; avoidable Worker memory/latency | Fixed; bounded R2 range, full-access streaming retained |
| SEC-02 | Blocker gate | Compare live RLS with migrations | Foundational schema incomplete locally; documented migration drift means local SQL cannot certify live authorization | Introspection complete; DB-01–04 open |
| AUTH-01 | Major | Reset email returns to `/login`; inspect recovery handler | Sending an email alone is not a completed reset flow | Confirmed missing completion flow; open |
| NOTIFY-01 | Major | Inspect `/api/notify-followers` claim then send sequence | Fails open if lock column absent; claims before delivery; unbounded parallel fan-out | Open; delivery/outbox design needed |
| CACHE-01 | Major | Delete media after it has been cached in multiple Cloudflare PoPs | One-year immutable cache; purge helper explicitly only clears current PoP | Open; global takedown invalidation required |

## Baseline checks

- `npm run build`: production compilation and static generation completed; 99 static pages generated. Compile 55 s, TypeScript 39.6 s. No build warning in captured output.
- `npm test`: **231 passed, 2 failed**, 33 files, 65.04 s. Failures QA-01/QA-02 above.
- `npm run lint` / standalone `tsc`: logs contain no diagnostics; shell completion needs explicit exit-code verification.
- Chromium installed. Lighthouse, WebKit, Firefox not found in initial tool inventory.
- Next 16.3 route-handler/deployment/CDN guides read before code changes.

## Orientation

- App Router: `src/app`; WebMangal readers/catalog/search/history/library/bookmarks/rankings/tags, books/PDF/EPUB, songs, creator portfolios, upload.
- Shared account: `src/app/login`, `src/app/auth/callback`, settings, become-creator, parent-consent routes; auth verified per API handler via Supabase JWT, no tracked middleware/proxy found initially.
- Creator tools: `src/app/mangal-studio/webmangal` (write, analytics, reviews, codex, storyboard), `src/app/dashboard` (books, earnings, workspace); admin reports and payment verification.
- Shared services: `src/app/api` (media, book-file gate, payment order/verify/webhook/direct UPI, notifications, AI, compliance export/delete, recommendations), `src/app/lib`, `src/app/components`.
- Other products share permissions/data: KaTube and Kalpana Circle routes, APIs, tables, media bucket.
- Database: `supabase/migrations`, generated `src/app/lib/database.types.ts`, `supabase/functions/purge-cold-storage`. Local Books migrations enable RLS, owner writes, own purchase/progress reads, no client purchase writes. This is static evidence, not live verification.
- Deployment: Workers/OpenNext (not Pages); `nodejs_compat`, R2 `MEDIA_BUCKET`, Workers AI, assets binding. No configured persistent incremental-cache binding; do not introduce ISR without adapter/storage verification.

## Evidence files

- `docs/AUDIT_DATABASE.md`: all retrieved tables/policies, public columns,
  constraints/indexes and definer-function ACL inventory (not a restore dump).
- `docs/AUDIT_ROUTES.md`: full route/component/shared-library file inventory;
  presence is not a claim that every file was reviewed.
- `docs/AUDIT_DIAGNOSTICS.md`: every remaining lint warning with file/line/rule.
- `docs/AUDIT_PERFORMANCE.json`: raw before/after lab measurements.
- `scripts/audit-evidence.mjs`: builds those documents from ignored local logs.

## Live database inspection (read-only, completed)

`supabase db query --linked` succeeded for catalog queries only. Retrieved 87
tables (79 public, 8 storage), 252 policies, column/table grants, 14 public
triggers, 83 public functions, 189 public indexes and constraints. All 87 tables
have RLS enabled. **This does not mean authorization is correct.** No user data
was dumped and no policy/migration was applied.

Confirmed release blockers:

1. **DB-01 — unpublished content exposure:** public chapter SELECT checks only
   parent series publication, not `is_draft`/`scheduled_at`. Pages inherit the
   same gap. Books SELECT checks `status='published'`, not `publish_at`.
   Reproduce with an anonymous PostgREST selection of scheduled/draft chapter
   IDs; UI filtering cannot enforce confidentiality. Fix needs replacement
   policies, anon/owner/other/admin fixtures and migration reconciliation.
2. **DB-02 — creator PII exposure:** `creator_profiles` has public `SELECT true`
   plus table-level SELECT for anon/authenticated. Own-read policy does not
   restrict an additional permissive public policy. Review phone/payout and
   pending-verification columns; move private fields to an owner-only table or
   revoke table SELECT and explicitly grant only public columns. Audit all
   existing `.select('*')` consumers before rollout. Do not fetch real private
   values to demonstrate this.
3. **PAY-01 — payment writes denied:** live `payments` has only own-row SELECT.
   `create-order`, `create-upi-intent`, `mark-upi-paid` and `verify` use user-scoped
   writes; these cannot complete with this RLS. Do NOT add client write policies
   for authoritative payment columns. Implement validated server-only writes,
   server-resolved prices, atomic capture/grant and retry tests first.
4. **PAY-02 — paid but not unlocked:** `grantPayment.ts` ignores Supabase write
   errors, while capture routes mark captured first and skip grants on retry.
   Webhook also ignores grant errors and can overwrite captured with delayed
   authorized/failed events. Disable paid launch until idempotent transactional
   fulfillment and event ordering are tested with gateway sandbox fixtures.
5. **DB-03 — limiter RPC is publicly executable:** live `check_rate_limit` ACL
   includes `=X/postgres` (PUBLIC), despite revoking named anon/authenticated
   grants locally. PUBLIC still grants those roles execution. Count-then-insert
   also races. Revoke PUBLIC, restrict service_role, make reservation atomic.
6. **DB-04 — account restrictions not enforced throughout:** API `requireUser`
   verifies JWT only; content-write policies generally check owner identity,
   not `account_active`. The profile privilege trigger protects UPDATE only;
   INSERT policy permits self-ID without constraining privileged columns.
   Verify auth signup trigger/default guarantees, deny privileged inserts, and
   enforce banned/minor restrictions at DB/API boundaries, not just login UI.

These are deferred **release blockers**, not accepted risks. A safe repair is a
separate staged database/payment rollout; blanket policy edits in a drifted
shared production DB would put all three products at risk.

## Additional confirmed source findings

| ID | Severity | File/route and reproduction | Root cause / disposition |
|---|---|---|---|
| AUTH-01 | Major | Request reset email, return to `/login` | No PASSWORD_RECOVERY handler or update-password form; code follows normal sign-in redirect. Open launch blocker; exercise PKCE and implicit recovery with test email account. |
| AUTH-02 | Major | `/login?error=%25` | Error already decoded by URLSearchParams is decoded again and can throw URIError. Open pending login component regression coverage. |
| SEARCH-01 | Major | `src/app/WebMangal/View.tsx`, fail Supabase request | Errors discarded into empty arrays; real network/RLS failure appears as no results. Open. |
| SEARCH-02 | Major | Catalog beyond API row cap / >200 books or songs | Full series fetch + local filtering; fixed 200-row book/song limit without server pagination means missing search results. Open (1–3 days). |
| AGE-01 | Blocker if mature launch | Direct reader/API access to mature entries | Metadata badge/client filter is not authorization; age boundary must be enforced consistently. Open. |
| UPLOAD-01 | Major | Reject `insertPage` promise after image upload | Missing exception rollback; fixed with regression test. Cleanup remains best-effort and can leave orphans if session expires. |
| SCHEDULE-01 | Major | Edit 10:30Z schedule in IST and save without changes | UTC string sliced into local input shifts release by 5h30. Fixed local date formatting + instant round-trip test. |
| AI-01 | Major | Paste >24k characters with no whitespace | Word-slicing fallback still emits a single oversized token. Fixed Unicode-safe capped slices; replaced repeated growing-string word counts with a counter. |
| CACHE-02 | Major | Read own FREE draft through book-file endpoint | Private draft carried public cache header. Fixed `private, no-store` for non-published files. |
| CF-01 | Major | `next start` requests public media | `caches` referenced unguarded; reproduced in baseline E2E logs. Fixed optional cache and cache-failure fallback; R2 itself still requires Workers binding. |
| CF-02 | Major | Record chapter view on Cloudflare, inspect country aggregate | Only Vercel geo header read. Fixed CF-IPCountry preference, unknown-code filtering, legacy fallback; four new tests. |
| QA-03 | Major | `npm run lint` | Two test helpers call mocked hook under non-hook name. Explicit mock aliases fix lint errors; 58 existing warnings retained in diagnostic inventory. |
| QA-04 | Major | CI accepted changes with failing Vitest | CI ran only types/lint. Added `npm test` gate. |
| A11Y-01 | Major | Manga scroll images / keyboard reading | Manga pages have empty alt and no textual equivalent; image dimensions not reserved. Open manual accessibility/content-authoring work. |
| COPY-01 | Minor | Public landing / README BYOK claims | 'Zero paywalls' conflicts with paid Books; README says keys never reach backend while editor-assist explicitly proxies header key. Correct product/privacy copy before launch. |
| DEV-01 | Minor | GET `/dev/payment-preview` | Unlinked design preview remains publicly routable. Not a secret/payment bypass; remove or gate before launch. |

`NOTIFY-01` clarification: missing `notified_at` also makes the initial SELECT
fail (404), before the fail-open claim branch. Current code cannot reliably
deliver/retry at scale. Delivery metadata is caller supplied rather than fetched
from the chapter; draft/schedule checks are also absent in that API.

## Performance measurements

Playwright Chromium against local **production Next build**, one run per device
per stage, cold HTTP cache per navigation, five-second post-load observation.
Mobile: 375x812, touch, 4x CPU, 150 ms latency, 200 kB/s down / 93.75 kB/s up via
CDP. Desktop: 1440x900, unthrottled. Browser context reused within each run; auth
and live data may settle asynchronously. Not deployed TTFB, Lighthouse scores,
or field CWV. `CLS*` is raw non-input shift sum in the observation window;
`longTaskMs` in JSON is a lab blocking proxy, **not INP/FID or Lighthouse TBT**.

| Page/device | LCP before → after (ms) | CLS* before → after | TTFB before → after (ms) |
|---|---:|---:|---:|
| `/` desktop | 1644 → 1660 | .00155 → .00155 | 22.4 → 26.0 |
| `/WebMangal` desktop | 380 → 296 | .05081 → .07757 | 24.1 → 23.1 |
| `/` throttled mobile | 9056 → 5336 | .01170 → .01177 | 11.2 → 6.5 |
| `/WebMangal` throttled mobile | 2556 → 2944 | .24064 → .24064 | 4.9 → 5.7 |
| Chapter reader | **Not measured**: no seeded chapter fixture | — | — |
| Creator dashboard | **Not measured**: redirects anonymous visitor to login | — | — |

Auth-gate navigation metrics are retained in JSON but are NOT dashboard scores.
No interactive input was measured, so INP/FID is unavailable. Lighthouse is not
installed. These changes did not target homepage rendering; differences above
are not attributed gains. **Homepage mobile LCP and browse CLS remain major
performance findings.** Browse inserts discovery/tags sections after data arrives;
reserve their layout before painting results. Hero reveal waits for client
animation; prioritize visible server-rendered hero and measure repeated runs.

Verified targeted efficiency change: a 2 MiB book fixture previously buffered
2 MiB to return 1 MiB; now requests/buffers 1 MiB (50% fewer storage bytes for
that fixture). A larger file similarly requests at most 1 MiB. This is a
request-size assertion with a realistic range mock, not a production latency or
heap benchmark. Full-access streams never call `arrayBuffer()` (regression test).

Client JS encoded bytes measured: homepage 293,336; browse desktop 320,683,
mobile 258,702 in both runs. No bundle reduction claimed. Large optional WebLLM,
PDF and editor code already use client-only/lazy or vendored paths; images remain
globally unoptimized (compatible with Workers but not a responsive compression
pipeline). Below-fold manga images already lazy-load; missing dimensions and
original-size R2 images remain reader performance risks. No new ISR added;
Cloudflare cache persistence/invalidation needs explicit design.

## Compatibility and validation results

| Check | Result |
|---|---|
| `npm test` | **271 passed**, 36 files; baseline 231 pass / 2 fail (233 registered) |
| `npx tsc --noEmit --incremental false` | Exit 0 |
| ESLint | Exit 0; **0 errors, 58 warnings**, every warning in diagnostic inventory |
| `npm run build` | Exit 0, production compilation/static generation complete |
| `npm run test:e2e -- --workers=2` | **57 passed**, 3 catalog-dependent skips + 2 opt-in performance skips |
| Opt-in performance suite | **2 passed before, 2 passed after** |
| `npm run test:live -- --workers=2` | **7 passed**, read-only checks against existing deployment, NOT deployment of fixes |
| `npx opennextjs-cloudflare build` | Exit 0, full adapter build successful |
| `npx wrangler deploy --dry-run --outdir .wrangler-dry` | Exit 0, **2161.04 KiB gzip**, below documented 3072 KiB budget by 910.96 KiB |
| `git diff --check` | Clean |

Adapter warning: Windows not fully supported; recommends WSL. The initial
`--skipNextBuild` attempt failed on absent standalone `pages-manifest.json` because
plain `next build` did not create adapter-required standalone output; the **full
adapter build resolved it**. No framework files or node_modules patched.
Baseline browser server log contained `caches is not defined` and one
`The destination stream closed early`; final browser logs no longer show the
cache exception. Do not treat a passed smoke suite as zero browser/network
errors: existing helpers capture page exceptions, not all console messages or
all delayed failed requests. Vitest intentionally logs mocked failures for rate
limiting/recommendations/rollback; these are not production observations.

**RUNTIME-01 (major, open):** final local E2E server log contains **seven**
`The destination stream closed early` exceptions. They did not fail the suite;
the triggering cause is not established (navigation cancellation is a hypothesis,
not a diagnosis). Capture request-correlated traces in Workers preview before
claiming a zero-error release. Production build compile time was 16.6 s; full
OpenNext rebuild compile time 23.6 s. These are local warm-build timings, not
application performance improvements.

**BOOK-01 (major, open):** the inherited byte-prefix preview is not a reliable
page-limited preview: a paid document smaller than 1 MiB is sent in full, and
truncated PDFs/EPUBs may be unreadable. Use separately generated preview assets
or an explicit creator-approved preview, never promise a fixed page boundary.

Chromium smoke covers 320px/375px brand/navigation and desktop. Lab checks found
no horizontal overflow on homepage, browse, or login at 375px. **Unverified:**
Safari/iOS WebKit, Firefox, Samsung Internet, Edge, real low-end Android,
pinch/tap gestures, authenticated upload layout, keyboard/focus/contrast audit,
screen-reader experience, offline/reconnect. No manifest/service worker found
in tracked app/public inventory; do not advertise installable/offline reading.

## Feature gap matrix (planning estimates, not delivery promises)

Assumption: launch core free manga/novel publishing; paid Books must remain
disabled until payment/data blockers are resolved. Estimates are focused
engineering days for one engineer, excluding provider approval/legal review.

| Expected capability | Current evidence | Priority / remaining effort |
|---|---|---|
| Continue reading/history synced | Reader/progress/history code and progress unit tests exist | Launch verification: multi-device race/resume, 1–2d |
| Library/bookmarks | Library/follows/bookmarks implemented; manga in-chapter bookmarks also local | Launch verification: cross-account cache/realtime consistency, 1–2d |
| Genre/tag discovery/recommendations | Tags, rankings, weighted recommendation API exist | Fast-follow: scalable search pagination/error UX, 1–3d |
| Distinct manga/novel readers | Scroll/page/RTL, font/theme controls, image retry exist | Launch verification: seeded image/text fixtures + accessibility, 2–3d |
| Chapter comments and ratings | Chapter comments/replies; ratings primarily series-level | Blocker: server empty/spam/account checks, 1–2d; chapter ratings fast-follow, 1–2d |
| Search filters | Genre/Hindi/English/status where available; local filtering | Fast-follow: rating threshold/regional languages/server pagination, 2–4d |
| Followed chapter notifications | Email endpoint + library; shared bell is K Circle notifications | Launch: durable in-app chapter notifications, 2–4d; email/push fast-follow, 2–4d |
| Offline/download | No verified offline cache/installability | Later or fast-follow for slow-network users, 5–10d; access/eviction rules required |
| Mature content controls | Flags/badges/limited client checks | Blocker if mature content allowed: consistent access policy + review, 2–4d |
| Forgiving batch upload | Batch, reorder, best-effort rollback, novel local autosave exist | Launch: expired-session/partial publish recovery tests, 2–3d; cross-device drafts fast-follow, 3–5d |
| Schedule/edit publication | UI exists; timezone round-trip fixed | Blocker: DB draft/schedule authorization DB-01, 1–2d + staging |
| Creator analytics | Real queries/RPCs, geo header fixed; no end-to-end numeric reconciliation | Launch: fixture-based counts/completion correctness, 2–3d; attribution fast-follow |
| Monetization/tipping | UPI UI/admin verification + Razorpay primitives exist, but payment RLS/fulfillment broken | Blocker for paid launch PAY-01/02, 3–5d + gateway testing; free launch may defer |
| Creator portfolio | `/WebMangal/creator/[username]` and series grid exist | Launch: privacy-safe public projection DB-02, 1–2d |
| Creator engagement/moderation | Replies, report button, admin reports exist; own-series comment moderation incomplete | Blocker: operational report/takedown pipeline & spam enforcement, 2–4d; pins/blocks fast-follow |
| Content policy | Terms/privacy/grievance routes exist | Blocker: human policy/legal review, report SLA and global cache takedown, 1–3d engineering |
| Multilingual content | Hindi/English filters, Hindi/Hinglish editor tools, Unicode text | Fast-follow: regional metadata/filter/read typography QA, 2–4d; UI translation later |
| Account recovery | Reset-email sender exists, completion missing | Launch blocker, 1–2d + email/OAuth test accounts |

## Launch-readiness checklist

- [x] Repository/route/database inventory captured; live metadata inspected read-only.
- [x] Public book-file bypass blocked before cache lookup; private draft cache fixed.
- [x] Book streaming/access tests repaired and expanded; capped preview reads.
- [x] Malformed media-delete requests rejected; dedupe/batch bounds tested.
- [x] DB rejection during chapter upload triggers rollback; schedule instant preserved.
- [x] Oversized AI tokens bounded; Cloudflare geo analytics compatible.
- [x] Unit/API/component, type, lint-error, production build and Worker size gates pass.
- [x] CI now runs tests, not only types/lint.
- [ ] Deploy reviewed fixes; no deployment or push performed in this audit.
- [ ] Resolve live draft/schedule visibility, creator PII, PUBLIC RPC grants, and account restrictions.
- [ ] Repair payment writes + atomic retryable fulfillment, or disable paid functionality.
- [ ] Complete password recovery and regression tests with dedicated accounts.
- [ ] Seed staging readers/creators/content; execute real publish/read/comment/follow/delete flows, session expiry and two-account RLS denial tests.
- [ ] Fix mobile LCP/CLS with repeated Lighthouse/field measurements; reader/dashboard metrics missing.
- [ ] Resolve 58 lint warnings and audit all console/network failures.
- [ ] Cross-browser/real-device, accessibility, content moderation/privacy review.

**Decision: do not launch publicly on the strength of the green build/smoke
checks.** Remaining security/payment/auth blockers are real and documented;
unverified authenticated journeys and compatibility checks are not passed.

## Change manifest

All paths below are relative to
`C:\Users\91998\Downloads\INR\indian-manga-platform`.

- `.github/workflows/ci.yml`, `.gitignore`
- `AUDIT.md`
- `docs/AUDIT_DATABASE.md`, `docs/AUDIT_DIAGNOSTICS.md`, `docs/AUDIT_PERFORMANCE.json`, `docs/AUDIT_ROUTES.md`
- `scripts/audit-evidence.mjs`, `e2e/webmangal-performance.spec.ts`
- `src/app/WebMangal/upload/page.tsx`
- `src/app/api/books/file/[bookId]/route.ts`
- `src/app/api/delete-media/route.ts`, `src/app/api/media/[...path]/route.ts`, `src/app/api/log-view/route.ts`
- `src/app/lib/ai/editorAssist.ts`, `src/app/lib/media/r2.ts`
- `src/app/lib/webmangal/publishPages.ts`, `src/app/lib/webmangal/schedule.ts`
- `src/__tests__/api/booksFile.test.ts`, `src/__tests__/api/deleteMedia.test.ts`, `src/__tests__/api/media.test.ts`, `src/__tests__/api/log-view.test.ts`
- `src/__tests__/components/SeriesCard.test.tsx`, `src/__tests__/components/SongCard.test.tsx`
- `src/__tests__/unit/editorAssist.test.ts`, `src/__tests__/unit/publishPages.test.ts`, `src/__tests__/unit/schedule.test.ts`

No database migration, dependency, lockfile, production configuration, or secret
was changed. Local metadata/check logs remain ignored; evidence documents contain
schema metadata and diagnostics only. Commit subject:
`fix: harden WebMangal media access and record pre-launch audit`.