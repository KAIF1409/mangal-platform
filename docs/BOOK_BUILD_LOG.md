# Book experience — incremental build log

Workspace: `C:\Users\91998\Downloads\INR\indian-manga-platform`.

## 2026-09-07 — Section 1: dashboard and library

### Implemented

- Dedicated `/WebMangal/books/library` route, linked from the Books catalog.
  The manga reader, general series library, and song library are unchanged.
- Current Read spotlight with cover, progress, and Resume Reading link to the
  existing PDF/EPUB resume route. Most recently active unfinished read wins.
- Horizontally scrollable In Progress and Up Next shelves with snap points.
- Up Next supports add, remove, desktop drag/drop, keyboard/touch move buttons,
  a 100-book cap, save announcements, and conflict/error recovery. The displayed
  order changes only after a confirmed save. Unavailable books retain a removable
  queue slot without displaying private metadata.
- Mood Matcher grid with explicit curated vibes and bounded discovery pages.
  No invented recommendations or genre-to-mood mappings. Empty/error/loading
  states are separate. All books remains usable when vibe data is unavailable.
- Auth subscription resets private shelf state when accounts change/sign out.
  Guests can browse discovery but cannot fetch private shelves or save queues.
- CSS module uses existing theme tokens, responsive cover dimensions, native
  progress elements, focus outlines, named controls, and 44px-minimum buttons.

### Schema and infrastructure decisions

- Reuse existing `book_reading_progress` (page/total for PDFs, percentage for
  EPUBs). No duplicate progress table or fake chapter labels.
- Stage `supabase/migrations/20260907120000_book_library.sql`:
  - `book_reading_queues`: private per-user ordered UUID array + revision.
    Bounded arrays keep a reorder atomic without multiple partial row updates.
  - `save_book_reading_queue`: authenticated caller only, fixed empty search
    path, explicit PUBLIC/anon revoke, row lock + revision conflict check,
    unique bounded IDs, release checks for newly added books. No client table
    writes; the caller cannot supply another reader's user ID.
  - `book_vibes`: five constrained vibe values, public SELECT only for released
    books; curation via service role, not arbitrary reader writes.
- Stable shared content identifier remains the existing `books.id` UUID.
  This increment creates no KaTube/kcircle rooms, social graphs, or feeds.
- No existing table or payment/content policy is altered. New discovery and
  private book metadata queries explicitly require published/released content;
  this does **not** repair the existing policies documented in `AUDIT.md`.
- No migration applied, shared database modified, deployment, or dependency added.
  Pre-migration Up Next/Mood Matcher failures are visible and retryable; existing
  progress remains available if only the new queue service is unavailable.
- The recorded audit schema was inspected. Fresh live introspection is not
  available in this session; reconcile the staging schema before applying.

### Assumptions and explicit deferrals

- This increment covers uploaded PDF/EPUB **Books**, not chapter-based native
  novels currently stored as series. Unifying prose content needs a deliberate
  content-model migration rather than mixing readers.
- Optional 3D/shareable shelves deferred: requires profile privacy preferences
  and opt-in sharing. All queues here are private; nothing contributes to a
  public profile, streak, or recommendation feed.
- Vibe assignment is initially curated through trusted DB administration.
  Creator vibe editing belongs with Section 11 metadata work. No production
  tags are fabricated/seeded, so vibe filters may correctly be empty.
- Dashboard progress shows up to the 100 most recently updated progress rows.
  It is not a complete reading-history archive. Completed reads are excluded.
- The existing reader owns resume precision and persistence. Exact sentence
  bookmarks, cross-device conflict resolution for progress, and page-one/last-
  page completion semantics remain Section 5 work. Library queue revisions do
  not claim to solve reader progress conflicts.
- Sections 2–5 still require implementation/review against the supplied prompt;
  existing settings and renderer behavior do not establish full compliance.
- Sections 6–10 are fast-follow work: native chapter comments/highlights,
  spoiler-aware social bridges, personalization/audio, story tools, streaks,
  incognito, and accessibility extras. No community infrastructure is rebuilt.
- Section 11 remains required: current uploads only support PDF/EPUB; DOCX
  parsing, editable chapter extraction, snapshots/rollback, and genuine sync
  telemetry require backend and creator-flow work.

### Validation and staging gate

Verified on 2026-09-07 (post-final-edit, fresh run):

- `npm test --maxWorkers=2` — **289 tests / 39 files passed** (new: queue unit,
  client RPC, component shelf tests; earlier 8 flaky-looking timeouts were
  resource contention from a concurrent build and did not reproduce).
- `npx tsc --noEmit` — clean.
- `npm run lint` — **0 errors**, 58 pre-existing documented warnings, unchanged.
- `npm run build` — exit 0; `/WebMangal/books/library` prerendered as a static
  route.
- `npx playwright test e2e/book-library.spec.ts --project=local-chromium` —
  **2 passed** (guest discovery at 390px and 1280px: sign-in gate, disabled
  queue writes, vibe-error alert, catalog fallback, zero page errors, no
  horizontal overflow). Runs against intercepted discovery data only — no
  content creation and no writes to the shared live database.
- `git diff --check` — clean.

Migration hardening added after review (still unexecuted — see below):
null array elements are now rejected via `unnest` (the previous
`array_position(ids, null)` check could never fire because the function
returns null, not a position, for a null needle), and `service_role` was added
to the RPC execute grant for curation tooling.

- New tests cover progress selection/clamping, schedule privacy filtering,
  immutable reorder, RPC validation/conflicts, guest state, resume, queue
  add/remove/drag/button reorder, save failure, and missing-service behavior.

### Database application (2026-09-07, live linked project)

- Project `rfxlavwzhpnbhwoumaha` (mangal-platform), via
  `npx supabase db query --linked` as `postgres`.
- Pre-flight: neither new table existed; `books.publish_at` present;
  `auth.uid()` present; one non-internal trigger on `auth.users`.
- `20260907120000_book_library.sql` **applied — exit 0**. Additive/idempotent;
  no existing table, policy, or payment surface was touched.
- Post-verify: `save_book_reading_queue` is `security definer` with execute
  granted only to `postgres`, `authenticated`, `service_role` (PUBLIC/anon
  revoked); unauthenticated RPC smoke test raised the auth guard as designed.
- `supabase/tests/book_library.sql` **executed against the live project —
  exit 0** (rollback-only): anonymous denial, owner save + revision advance,
  stale-revision conflict, draft/scheduled add denial, null-element and
  duplicate rejection, direct client-write denial, and other-reader isolation
  all passed. Final row counts confirm full rollback: queues 0, vibes 0,
  test books 0. No fixture rows remain.
- `book_vibes` is intentionally empty until vibes are curated (service role);
  Mood Matcher shows "no books for this vibe yet" until then. This is expected,
  not a defect.
- Remaining before feature release: exercise simultaneous saves from two real
  sessions (conflict UX), authenticated reload/sign-out/account switch, touch
  reordering on real devices, and curate vibe assignments. Account-restriction
  review from the launch audit still applies.
- Launch remains **NO-GO** for the authorization/payment/recovery blockers in
  `AUDIT.md`. This feature increment does not supersede that decision.