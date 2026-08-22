import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local-only build outputs (never committed — CI checkouts don't have
    // them): .open-next alone holds an 8.4MB bundled handler.mjs that
    // OOMs Node's default heap when swept.
    ".open-next/**",
    ".wrangler/**",
    ".vercel/**",
    // Vendored third-party MINIFIED libraries (epub.js, GSAP ScrollTrigger,
    // pdf.js + its 1.2MB worker) and every other static asset live under
    // public/ — served verbatim, never bundled or transformed, so ESLint
    // must never look in here: minified single-line bundles trip rules like
    // no-require-imports / no-this-assignment (the "10 errors and 11
    // warnings" CI failure), and parsing ~2MB of minified JS even OOMs
    // Node's default heap locally (exit 134). Bugs in upstream libs get
    // fixed upstream, not linted here.
    "public/**",
  ]),
]);

export default eslintConfig;
