// OpenNext config for the Cloudflare adapter.
// Without this file at the repo root, `opennextjs-cloudflare build` has
// nothing to build against and the Cloudflare Git integration falls back
// to a default placeholder Worker — which is why the deployed URL was
// showing "Hello World" instead of the actual Next.js app.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
