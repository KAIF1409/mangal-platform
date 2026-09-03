// @vitest-environment node
// Brand-asset integrity: every logo the WebMangal QA suites assert on must
// actually exist in /public with plausible bytes (guards against a typo'd
// path silently 404ing in production).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const publicDir = fileURLToPath(new URL('../../../public/', import.meta.url));

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('public/ brand assets used by WebMangal', () => {
  const pngs = ['webmangal-logo.png', 'icon.png', 'katube-logo.png', 'kcircle-logo.png', 'webmangal-door.png', 'kcircle-door.png'];

  it.each(pngs)('%s exists, is a real PNG, and is non-trivial', (file) => {
    const p = publicDir + file;
    expect(existsSync(p), `${file} missing from public/`).toBe(true);
    const stat = statSync(p);
    expect(stat.size, `${file} suspiciously small`).toBeGreaterThan(1_000);
    const head = readFileSync(p).subarray(0, 8);
    expect(head.equals(PNG_MAGIC), `${file} is not a valid PNG`).toBe(true);
  });

  it('og-image.jpg exists with real bytes (social share card)', () => {
    const p = publicDir + 'og-image.jpg';
    expect(existsSync(p)).toBe(true);
    expect(statSync(p).size).toBeGreaterThan(10_000);
    expect(readFileSync(p).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff])); // JPEG SOI
  });

  it('favicon.ico exists (tab icon)', () => {
    const p = publicDir + 'favicon.ico';
    expect(existsSync(p)).toBe(true);
    expect(statSync(p).size).toBeGreaterThan(500);
  });
});
