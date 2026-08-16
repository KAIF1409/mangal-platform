# Contributing to MANGAL

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

## Before committing

```bash
npx tsc --noEmit   # type check
npm run lint        # eslint
```

Both must be clean. CI (`.github/workflows/ci.yml`) runs the same two checks
on every push/PR to `main`.

## Database changes

All schema/RPC changes go through a Supabase migration file in
`supabase/migrations/`, named `YYYYMMDDHHMMSS_description.sql`. Migrations
should be safe to re-apply (use `create or replace`, `if not exists`, etc.)
since the live DB and this repo's migration history have drifted before —
always check the live schema via the Supabase MCP tools before writing a
migration that alters an existing table.

## Project structure

See [`docs/REPO_STRUCTURE.md`](docs/REPO_STRUCTURE.md) for how the codebase
is organized and the target structure it's being migrated toward.

## Commit style

Short, specific, present-tense subject line. Reference the `CONTEXT.md`
section number when a commit is part of a tracked multi-step piece of work
(e.g. `K Circle: apply Discord-rail shell to chat page (§72)`).
