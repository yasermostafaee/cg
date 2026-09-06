import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `STATION-SETUP-02` §4 — **ZERO PERSISTED KEYS CHANGE — the bridge half, as a census.**
 *
 * Every file the bridge persists is spelled ONCE in `src/` or `bin/`: the `FILE_NAME`
 * constants of the two stores that write into `templatesDir`, the `~/.cg-runtime/bridge-*`
 * defaults the CLI resolves, and the ledger's station-standard path. This derives them all
 * from the tree and compares them to the inventory recorded at `576a72eb` — the head the
 * Station setup change was built on — so the claim "the move is UI-only" is checked rather
 * than inherited, and a rename that orphans a file (`B-231`'s shape) fails here instead of
 * sitting unread for a month.
 *
 * The template registry's records are the one persisted name that is not a literal: they
 * are `<slug>-<12 hex>.json`, named by `#fileFor` and admitted by `isRegistryRecordName`
 * (`B-116`). That rule is pinned in `template-registry-siblings.test.ts`.
 */

const root = join(process.cwd());

function filesUnder(dir: string, exts: readonly string[]): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true })
    .filter((e) => e.isFile() && exts.some((ext) => e.name.endsWith(ext)))
    .map((e) => join(root, dir, e.name));
}

function inventory(): { inTemplatesDir: string[]; inCgRuntime: string[] } {
  const inTemplatesDir = new Set<string>();
  const inCgRuntime = new Set<string>();
  for (const file of [...filesUnder('src', ['.ts']), ...filesUnder('bin', ['.mjs'])]) {
    const source = readFileSync(file, 'utf8');
    // The two stores that persist BESIDE the templates name their file as a bare constant.
    for (const m of source.matchAll(/const FILE_NAME = '([A-Za-z0-9_.-]+\.json)'/g)) {
      inTemplatesDir.add(m[1] ?? '');
    }
    // Everything else resolves under `~/.cg-runtime/` with a `bridge-` prefix.
    for (const m of source.matchAll(/'\.cg-runtime',\s*'(bridge-[A-Za-z0-9_.-]+)'/g)) {
      inCgRuntime.add(m[1] ?? '');
    }
  }
  return {
    inTemplatesDir: [...inTemplatesDir].sort(),
    inCgRuntime: [...inCgRuntime].sort(),
  };
}

/** THE INVENTORY AT `576a72eb`, before Station setup — and after it. */
const BEFORE_AND_AFTER = {
  // `B-116`: both still live beside the templates. Not moved — that is a data migration —
  // and no longer mistaken for templates, because the registry reads only its own records.
  inTemplatesDir: ['channel-settings.json', 'delimiters.json'],
  inCgRuntime: [
    'bridge-audit.ndjson',
    'bridge-connection.json',
    'bridge-fixed-layers.json',
    'bridge-live-layers.json',
    'bridge-reserved-layers.json',
    'bridge-source-assignments.json',
    'bridge-source-catalog.json',
    'bridge-templates',
  ],
};

describe('§4 — the bridge’s persisted files, before and after Station setup', () => {
  it('the inventory derived from src/ and bin/ is IDENTICAL to the one recorded at 576a72eb', () => {
    expect(inventory()).toEqual(BEFORE_AND_AFTER);
  });

  it('the instrument is live: both halves matched something', () => {
    const now = inventory();
    expect(now.inTemplatesDir.length).toBeGreaterThan(0);
    expect(now.inCgRuntime.length).toBeGreaterThan(0);
  });
});
