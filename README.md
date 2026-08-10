# MANGAL — Dual-Mode Indian Webnovel & Comic Publishing Platform

**Live:** [mangal-platform.vercel.app](https://mangal-platform.vercel.app)

MANGAL is a full-stack publishing platform built for Indian creators to upload and monetize manga-style comics and web novels under one unified account — readers can switch between Comic and Novel mode with zero friction. Built solo, end-to-end, from database schema to deployed production app.

## Why this exists

India has 500M+ smartphone users and a fast-growing base of indie comic/manga artists and novelists, but most existing platforms force creators to choose between a comics platform or a novel platform. MANGAL lets one creator account host both content types under a single series model, with **0% platform cut** for creators at this stage.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, React
- **Backend / DB:** Supabase (PostgreSQL, Row-Level Security, Auth, Storage)
- **Email:** Resend (transactional + notification emails)
- **Hosting / CI-CD:** Vercel
- **AI-assisted development:** Used Claude as a pair-programmer throughout — for architecture decisions, debugging, and feature implementation

## Key Features

- **Dual content-type engine** — a single `series` schema supports both manga (page/scroll image-based chapters) and novels (rich-text chapters), with a content-type-aware reader, uploader, and dashboard across the whole app
- **Custom novel writer** — built-from-scratch lightweight text formatting engine (headings, bold, italic, scene breaks) with live word count, estimated read time, and local-storage draft autosave — no external rich-text library
- **DPDP Act 2023 compliance** — itemized consent logging, DOB-based minor detection, automated parental-consent email verification flow for under-18 accounts, and a Download-My-Data / Delete-My-Account flow
- **IT Rules 2021 compliance** — Grievance Officer page with legally mandated 24-hour acknowledgement / 15-day resolution SLAs, two-tier data retention (immediate front-end erasure + 180-day encrypted cold storage for legal/CERT-In requests)
- **Admin moderation dashboard** — developer-role-gated, RLS-enforced two-click content removal and instant account bans
- **Reader experience** — bookmarks, reading history with progress tracking, follow + new-chapter email notifications, WhatsApp share, RTL reading mode for manga, Hindi/English UI toggle
- **Search & discovery** — genre/language/content-type filters, URL-synced query params, trending/staff-picks sections

## Architecture Notes

- Single unified `series` + `chapters` schema for both content types, differentiated by a `content_type` column rather than separate tables — keeps search, bookmarks, library, and history working identically across comics and novels with no duplicated logic
- All sensitive operations (account deletion, data export, parent-consent confirmation, follower notifications) run through server-only API routes using the Supabase service role, never exposed client-side
- RLS policies enforce access control at the database layer, not just in application code

## Status

In active development. Core publishing, reading, and compliance flows are live in production. Monetization (UPI creator tips, premium chapter unlocks) is planned for after the platform reaches consistent reader traffic.

The platform is also expanding into a small ecosystem — **Kalpanaverse** (AI-generated anime videos from MANGAL creators) and **Kalpana Circle** (community discussion) are in early UI-demo stages. See [`CONTEXT.md`](./CONTEXT.md) for the full current build status, architecture reasoning, and next steps on that expansion.

## Author

**Mohammed Kaif** — B.Tech CSE, PES University (2026)
[LinkedIn](https://www.linkedin.com/in/mohammed-kaif-714a79242)
MAIL:(mailto:kaifmohammed.work@gmail.com)
