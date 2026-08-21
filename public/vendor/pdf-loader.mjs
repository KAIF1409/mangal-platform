// Browser-only loader for the vendored pdf.js build.
//
// This file exists so the app's JS bundles never contain pdf.js: BookReader
// injects THIS script as a <script type="module" src="/vendor/pdf-loader.mjs">,
// which the browser fetches straight from static assets (Cloudflare's asset
// CDN) — no bundler ever sees it, so it can't end up in the OpenNext server
// function (which is what blew past Cloudflare's 3 MiB Worker size limit,
// see the deploy failure in the books-module session).
//
// The module script's `load` event only fires after this whole module graph
// (pdf.min.mjs included) has been evaluated, so by the time onload runs,
// window.pdfjsLib is guaranteed to be set.

import * as pdfjsLib from './pdf.min.mjs';

// Worker stays a sibling static asset — same reasoning, never bundled.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

window.pdfjsLib = pdfjsLib;