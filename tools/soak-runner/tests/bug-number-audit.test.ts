// B-075 — CI guard against duplicate B-numbers.
//
// `B-` numbers are GLOBAL across the three bug files and are never reused, but the rule
// was enforced only by someone remembering to run the audit by hand. Concurrent branches
// each read "the next free number" from a different snapshot of `main` and pick the SAME
// one; five such collisions happened in a single session. Every one so far was caught and
// renumbered before merge — which is the ONLY reason `main` is clean — but nothing made
// that guaranteed.
//
// So: detect, not prevent (the trade-off recorded in docs/prd/b-number-registry.md). An
// in-flight collision is cheap to fix; a MERGED one is not, because renumbering a closed
// bug ripples into archived change dirs, PR/commit text and code comments. This test runs
// in the normal `turbo run test` gate, so a duplicate can no longer reach `main`.
//
// The single accepted exception is B-056 (dual-owned by a designer bug #272 and a runtime
// bug #287, both merged + archived — owner call: disambiguate by file, do NOT rewrite
// history). It is allowlisted explicitly so the accepted case cannot fail CI, and the
// allowlist itself is asserted to still be real.
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const BUG_FILES = ['bugs.md', 'bugs-designer.md', 'bugs-runtime.md'] as const;

/**
 * Numbers that legitimately name more than one bug on merged `main`.
 *
 * Adding to this list is a deliberate OWNER decision, not a way to silence a fresh
 * collision: a new duplicate must be renumbered before merge (merged `main` numbers
 * always win).
 */
const ACCEPTED_DUPLICATES = new Set(['B-056']);

/**
 * The number that OPENS a bug heading — `## [x] B-067 — …`.
 *
 * Deliberately anchored: matching anywhere in the line would produce false hits from
 * trailing prose (the B-056 heading itself cites "RENUMBERED from B-054", and several
 * entries cross-reference other bugs).
 */
const HEADING = /^## \[.\] (B-\d+)/gm;

interface Claim {
  readonly id: string;
  readonly file: string;
  readonly heading: string;
}

function claims(): Claim[] {
  const out: Claim[] = [];
  for (const file of BUG_FILES) {
    const text = readFileSync(path.join(REPO_ROOT, 'docs', 'prd', file), 'utf8');
    for (const m of text.matchAll(HEADING)) {
      const line = m[0];
      const id = m[1];
      if (id === undefined) continue;
      out.push({ id, file, heading: line.slice(0, 90) });
    }
  }
  return out;
}

describe('B-number audit (B-075)', () => {
  it('no B-number is claimed by more than one bug', () => {
    const byId = new Map<string, Claim[]>();
    for (const claim of claims()) {
      byId.set(claim.id, [...(byId.get(claim.id) ?? []), claim]);
    }

    const collisions = [...byId.entries()]
      .filter(([id, cs]) => cs.length > 1 && !ACCEPTED_DUPLICATES.has(id))
      .map(([id, cs]) => `${id} claimed by ${cs.length}: ${cs.map((c) => c.file).join(' + ')}`);

    // Renumber the IN-FLIGHT bug — merged `main` numbers always win. See
    // docs/prd/b-number-registry.md for the number space and the accepted exception.
    expect(collisions).toEqual([]);
  });

  it('every accepted duplicate is still a real duplicate (the allowlist cannot go stale)', () => {
    const counts = new Map<string, number>();
    for (const claim of claims()) counts.set(claim.id, (counts.get(claim.id) ?? 0) + 1);

    for (const id of ACCEPTED_DUPLICATES) {
      // If this fails, the duplicate was resolved — drop it from the allowlist rather than
      // leaving a blanket exemption that would hide a FUTURE collision on the same number.
      expect(counts.get(id) ?? 0).toBeGreaterThan(1);
    }
  });

  it('the audit actually sees the bug files (it cannot pass vacuously)', () => {
    const found = claims();
    expect(found.length).toBeGreaterThan(60);
    for (const file of BUG_FILES) {
      expect(found.some((c) => c.file === file)).toBe(true);
    }
  });
});
