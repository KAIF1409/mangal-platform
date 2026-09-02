# Vendored browser libraries

These files are **static assets served as-is** — they are deliberately NOT
imported by any app code, so no bundler (Turbopack/OpenNext) ever includes
them in a JS bundle. BookReader loads them at runtime by injecting script
tags. This is what keeps the Cloudflare Worker bundle under the free plan's
3 MiB limit — bundling these libraries into the OpenNext server function was
exactly what caused deploy failure `[code: 10027]` (Worker exceeded size
limit) when the Books module first shipped.

| File | Source | Version |
|---|---|---|
| `pdf.min.mjs` | `node_modules/pdfjs-dist/build/pdf.min.mjs` | pdfjs-dist 6.2.108 |
| `pdf-loader.mjs` | hand-written (this folder) — imports `./pdf.min.mjs`, points the worker at `/pdf.worker.min.mjs`, exposes `window.pdfjsLib` | — |
| `epub.min.js` | `node_modules/epubjs/dist/epub.min.js` (UMD build, dependencies bundled) → exposes `window.ePub` | epubjs 0.3.93 |
| `gsap.min.js` | `node_modules/gsap/dist/gsap.min.js` (UMD) → exposes `window.gsap` | gsap 3.x |
| `ScrollTrigger.min.js` | `node_modules/gsap/dist/ScrollTrigger.min.js` (UMD; must load AFTER gsap.min.js) | gsap 3.x |
| `jspdf.umd.min.js` | `node_modules/jspdf/dist/jspdf.umd.min.js` (UMD) → exposes `window.jspdf.jsPDF` | jspdf 4.2.1 |
| `/pdf.worker.min.mjs` (repo root `public/`) | `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` | pdfjs-dist 6.2.108 |

gsap is still a package.json dependency (its types are used by the landing
page's loader), but it must never be imported as a module anywhere — same
rule as the reader engines.

jspdf joined this folder in §141 for the same reason: it is loaded at
runtime by `lib/bookPdf.ts`'s `loadJspdf()` ("Write here" → PDF pipeline).
Its npm package also stays a dependency FOR TYPES ONLY (`import type` —
erased at compile time, never traced into any bundle). Even a dynamic
`import('jspdf')` from a 'use client' page got traced into the OpenNext
server bundle / NFT trace and blew the Worker size budget again.

## Refreshing after an upgrade

1. Bump the version in `package.json` (`npm install pdfjs-dist@x.y.z epubjs@a.b.c`)
2. Re-copy the files listed above from `node_modules/...` into this folder
3. Delete the packages again (`npm uninstall pdfjs-dist epubjs`) so they can
   never be accidentally imported into a bundle

The runtime loaders live in `src/app/components/books/BookReader.tsx`
(`loadPdfjs()` / `loadEpub()`).