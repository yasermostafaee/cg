import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `STATION-SETUP-02` §4 — **ZERO PERSISTED KEYS CHANGE — the browser half, as a census.**
 *
 * Every row Station setup pulled in was already bridge-side, so the move is UI-only. That
 * is a claim, and this is its proof for the browser: every persisted key and store name the
 * Runtime's source spells — `cg.runtime.*` in the real renderer's `localStorage` and
 * `sessionStorage`, `cg-runtime:*` in the offline mock's, the IndexedDB database, the OPFS
 * workspace — is DERIVED from the tree and compared to the inventory recorded at
 * `576a72eb`, the head this change was built on. Identical before and after.
 *
 * ── WHY A CENSUS AND NOT A REVIEW ─────────────────────────────────────────────
 *
 * The risk is realised once already: `bridge-source-mappings.json` (`B-231`) was orphaned by
 * a rename and sat with zero readers for a month. An orphan is created SILENTLY and found by
 * accident, so the inventory has to be something that FAILS when a key appears, moves or
 * disappears — not something someone remembers to look at.
 *
 * ⚠ The two namespaces (`cg.runtime.*` real, `cg-runtime:*` mock) never meet and are not to
 * be "unified": the mock's keys stand in for files the bridge keeps on disk, the real ones
 * are per-console preferences. This census lists them apart on purpose.
 */

const srcDir = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.isFile() && /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

/** Every persisted-name literal the source spells, by store. */
function inventory(): {
  realLocalStorage: string[];
  realSessionStorage: string[];
  mockLocalStorage: string[];
  indexedDb: string[];
  opfs: string[];
} {
  const found = {
    realLocalStorage: new Set<string>(),
    realSessionStorage: new Set<string>(),
    mockLocalStorage: new Set<string>(),
    indexedDb: new Set<string>(),
    opfs: new Set<string>(),
  };
  for (const file of walk(srcDir)) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/'(cg-runtime:[A-Za-z0-9_.:-]+)'/g)) {
      found.mockLocalStorage.add(m[1] ?? '');
    }
    for (const m of source.matchAll(/'(cg\.runtime\.[A-Za-z0-9_.:-]+)'/g)) {
      const key = m[1] ?? '';
      // `testMode` is the one `cg.runtime.*` key kept in SESSION storage, by its own note.
      (source.includes('sessionStorage') ? found.realSessionStorage : found.realLocalStorage).add(
        key,
      );
    }
    for (const m of source.matchAll(/'(CG_RUNTIME_[A-Z_]+)'/g)) {
      found.realSessionStorage.add(m[1] ?? '');
    }
    for (const m of source.matchAll(/'(cg-runtime-[a-z-]+)'/g)) {
      found.indexedDb.add(m[1] ?? '');
    }
    for (const m of source.matchAll(/openOpfsWorkspace\('([^']+)'\)/g)) {
      found.opfs.add(m[1] ?? '');
    }
  }
  const sorted = (s: Set<string>): string[] => [...s].sort();
  return {
    realLocalStorage: sorted(found.realLocalStorage),
    realSessionStorage: sorted(found.realSessionStorage),
    mockLocalStorage: sorted(found.mockLocalStorage),
    indexedDb: sorted(found.indexedDb),
    opfs: sorted(found.opfs),
  };
}

/**
 * THE INVENTORY AT `576a72eb`, before Station setup — and after it. A change to any line
 * here is a persisted-key change and needs its own migration story, not a settings move.
 */
const BEFORE_AND_AFTER = {
  realLocalStorage: ['cg.runtime.operatorName', 'cg.runtime.shell-layout.v1'],
  realSessionStorage: ['CG_RUNTIME_SESSION', 'cg.runtime.testMode'],
  mockLocalStorage: [
    'cg-runtime:channel-settings',
    'cg-runtime:delimiters',
    'cg-runtime:source-assignments',
    'cg-runtime:source-catalog',
  ],
  indexedDb: ['cg-runtime-from-file'],
  opfs: ['runtime'],
};

describe('§4 — the browser’s persisted keys, before and after Station setup', () => {
  it('the inventory derived from the tree is IDENTICAL to the one recorded at 576a72eb', () => {
    expect(inventory()).toEqual(BEFORE_AND_AFTER);
  });

  it('the instrument is live: every store has at least one key, so an empty match cannot pass', () => {
    const now = inventory();
    for (const [store, keys] of Object.entries(now)) {
      expect(keys.length, `${store} matched nothing — the regex has gone blind`).toBeGreaterThan(0);
    }
  });

  it('the settings home itself spells NO persisted key — it is UI over bridge state', () => {
    const dir = join(srcDir, 'renderer', 'features', 'stationSetup');
    const source = readdirSync(dir)
      .map((name) => readFileSync(join(dir, name), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|openOpfsWorkspace/);
  });
});
