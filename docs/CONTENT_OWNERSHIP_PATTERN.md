# Content ownership pattern

Every authored content type on the platform — series (manga), books, songs,
KaTube videos, and whatever gets added next (novels, playlists, anything with
one owning account) — follows the exact same rule:

> **Authorship is ownership, not a role.** Only the account in the content's
> owner column may add, edit, or delete units of that specific item. A
> `developer`/admin role grants *tools* (the studio, `/admin`, "start a new
> upload") — it never grants authorship of someone else's already-existing
> content. There is no role escape hatch, anywhere, for any content type.

This came from a real incident (2026-09-24): a developer account was shown
"+ Add Chapter" and per-chapter Edit/Delete on a series it did not create,
because the app-side check used the account's *role* instead of the series'
`creator_id`. The database was never wrong — the RLS write policies were
already owner-only — the UI just offered a button the database then refused.
Fix that in two matching layers, both below, whenever a new content type is
added, so it starts out correct instead of needing the same fix later.

## 1. Database (RLS) — copy-paste template

```sql
-- Replace <table>, <owner_column> (e.g. creator_id / author_id), and decide
-- whether unpublished rows should be visible to the owner in the SELECT
-- policy (see the `status = 'published' or auth.uid() = <owner_column>`
-- shape used by books/songs).

create policy "<table>_owner_insert" on <table> for insert to authenticated
  with check (auth.uid() = <owner_column>);

create policy "<table>_owner_update" on <table> for update to authenticated
  using (auth.uid() = <owner_column>);

create policy "<table>_owner_delete" on <table> for delete to authenticated
  using (auth.uid() = <owner_column>);
```

No `role = 'developer'` clause goes in any of these three. That is the whole
rule — see `series`/`chapters`/`pages`, `books`, `songs`, and `videos` for
the live examples this template is drawn from.

If the content has child rows (series → chapters → pages), each child table
gets its own owner-only policies too, checked through a join back to the
parent's owner column — e.g. `pages`' policy joins through `chapters` to
`series.creator_id`. A developer moderation *delete* (not insert/update) can
still exist as a **separate, explicitly-named** policy — e.g. `"Admin can
delete chapters"` — if there's an actual admin surface that uses it (Admin
Reports → Remove). Don't fold that into the owner policies above.

## 2. App / UI — use the shared helpers, don't hand-roll a check

`src/app/lib/auth/roles.ts` exports the generic, content-type-agnostic
versions:

```ts
import { ownsContent, canManageContent, contentWriteBlockReason } from '@/app/lib/auth/roles';

const isOwner = ownsContent(viewer?.id, item.creator_id); // or author_id, etc.

// Gate the button:
{canManageContent(role, isOwner) && <button>Edit</button>}

// Explain a blocked write (upload/save flow):
const reason = contentWriteBlockReason(role, isOwner, isAuthenticated, 'song');
```

Never write `role === 'developer' || isOwner` (or any role-based bypass) by
hand for an authoring gate — that is exactly the shape of the 2026-09-24
regression. If a content type wants type-specific naming (as `series` does
with `ownsSeries` / `canManageSeries` / `seriesWriteBlockReason`), add a thin
wrapper around the generic three, the same way those already do — not a
parallel implementation.

The two safest ways to get this right in a list/dashboard view:

- **Scope the query itself** to the viewer's own rows
  (`.eq('creator_id', userId)` / `.eq('author_id', userId)`), as
  `dashboard/books` and `mangal-studio/katube/content` do — then every row
  that renders is already the viewer's own, so no per-row ownership branch is
  even needed.
- **Compare per item** on a public detail page that mixes owner and
  non-owner viewers (song/series/book detail pages), using `ownsContent()`
  as shown above.

## 3. Checklist for a new content type

- [ ] Owner column (`creator_id`/`author_id`) is `not null references
      auth.users(id)`.
- [ ] RLS: owner-only INSERT/UPDATE/DELETE, no role clause (§1).
- [ ] Any child tables get owner-only policies too, joined back to the
      parent (§1).
- [ ] UI authoring controls gated with `canManageContent()` /
      `ownsContent()`, or the list query itself is scoped to the viewer (§2).
- [ ] A blocked write explains itself via `contentWriteBlockReason()`,
      instead of surfacing the raw Postgres RLS error text.
- [ ] Add a `roles.test.ts`-style test asserting the UI gate and the write-
      block reason never disagree (see `it('agrees with the authoring gate…')`
      in that file) — the whole point is that they can't drift apart.
