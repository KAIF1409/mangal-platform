# Repo Structure

## Current state (as of Aug 2026)

Everything lives directly under `app/`, Next.js App Router style:

```
app/
  <route folders>        # WebMangal, katube, kalpana-circle, admin, api, ...
  components/            # 18 shared components, flat, no sub-folders
  lib/                    # 16 files, flat: auth, payments, roles, i18n, email... all mixed together
supabase/
  migrations/
  functions/
docs/
public/
```

This works, and nothing here is broken — but it doesn't match how larger
Next.js codebases are organized, for two concrete reasons:

1. **`lib/` mixes unrelated concerns** — `razorpay.ts` (payments),
   `roles.ts`/`kcirclePermissions.ts` (authz), `email.ts`, `dpdp.ts`
   (compliance), `nsfwCheck.ts`/`imageQuality.ts` (media) all sit as
   siblings with no grouping. Anyone new to the repo has to open every
   file to find what they need.
2. **No separation between routing and source** — `app/` should ideally
   contain *only* route files (`page.tsx`, `layout.tsx`, `route.ts`).
   Shared code living inside it works but blurs the line as the app grows.

## Target structure

```
src/
  app/                    # routes only — page.tsx, layout.tsx, route.ts
  components/
    ui/                   # generic, product-agnostic (buttons, modals, badges)
    webmangal/
    katube/
    kalpana-circle/
    shared/               # Navbar, Footer, ProfileMenu — used across all 3 products
  lib/
    auth/                 # authRedirect, roles, kcirclePermissions
    payments/             # razorpay
    media/                # nsfwCheck, imageQuality, youtubeVerify
    compliance/           # dpdp
    supabase.ts
    format.ts, i18n.ts, backNav.ts, tagSuggest.ts, novelEditor.ts, email.ts
  types/                  # shared TS types, currently scattered/inlined per-file
supabase/                 # unchanged — migrations, functions
docs/                     # unchanged
public/                   # unchanged
```

Rationale, sourced from current (2026) Next.js App Router structure guidance:
route code stays in `app/`, everything else moves to sibling top-level
folders under `src/`, and shared code is grouped by domain/feature rather
than kept flat once a folder passes ~10-15 files — which `lib/` and
`components/` both already have.

## Migration plan — phased, not a single commit

`app/lib` and `app/components` are imported from ~100+ route files across
WebMangal, KaTube, and Kalpana Circle. Moving them in one shot with no way
to run a full `next build` in this environment (Google Fonts fetch fails
in the sandbox — noted in `CONTEXT.md`) is how you silently break the live
Cloudflare Workers deploy. Doing it in verifiable phases instead:

- **Phase A (done in this pass):** additive only, nothing moved —
  `.env.example`, CI workflow (`tsc --noEmit` + `eslint` on every push/PR
  to `main`), `CONTRIBUTING.md`, this doc.
- **Phase B:** introduce `src/`, move `app/` → `src/app/` as a pure
  directory move (Next.js supports this natively, zero import changes
  needed since relative imports inside `app/` don't change relative to
  each other). Verify with `tsc --noEmit` + `eslint`.
- **Phase C:** split `lib/` into the sub-folders above, one domain at a
  time (e.g. `auth/` first), updating only the imports that reference
  those specific files, verifying after each domain before moving to the
  next.
- **Phase D:** same treatment for `components/` — group by product first
  (`webmangal/`, `katube/`, `kalpana-circle/`), pull out genuinely shared
  ones (`Navbar`, `Footer`, `ProfileMenu`, `ThemeToggle`) into `shared/`.

Each phase is its own commit(s), each verified with `tsc --noEmit` and
`eslint` before moving to the next phase, so a bad phase is easy to spot
and revert without dragging the others down with it.
