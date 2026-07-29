import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * R-028 part B — the operator can no longer reach DYNAMIC layer allocation.
 *
 * Why this is a test and not a comment. The owner hit `ERROR / no layer` after
 * reserving 60–69: `stack.load` allocates from the policy ranges, an unknown
 * template type falls back to `custom` (60–69 by default), and part A fenced
 * reserved layers out of allocation — so the only pool that path can reach was
 * empty by construction. (`dynamic-load-exhausted.integration.test.ts` pins
 * that bridge behaviour.)
 *
 * Deleting the Library panel removed the last caller, but "the panel is gone"
 * is not a property — it is a fact that a future row could quietly undo by
 * calling `stack.load` for convenience. This asserts the property directly:
 * NOTHING in the renderer dispatches `stack.load`. Every operator load goes
 * through `fixedLayers.load`, which binds the exact coordinate the row names
 * and never consults a policy range.
 *
 * Section 6 (part C) retires the dynamic path in the bridge; until then this
 * keeps the UI from walking back into it.
 */

const rendererDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'renderer',
);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('the renderer cannot reach dynamic layer allocation (R-028)', () => {
  it('no renderer file dispatches stack.load', () => {
    const offenders = sourceFiles(rendererDir).filter((file) =>
      /\bstack\s*\.\s*load\s*\(/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(
      offenders.map((f) => path.relative(rendererDir, f)),
      'every operator load must be the exact-slot fixedLayers.load — stack.load allocates ' +
        'dynamically and lands in the policy ranges, which is how `no layer` happened',
    ).toEqual([]);
  });

  it('the exact-slot load IS the path the rows use', () => {
    const chain = fs.readFileSync(
      path.join(rendererDir, 'features', 'fixedLayers', 'fixedSlotLoad.ts'),
      'utf8',
    );
    expect(chain).toContain('fixedLayers.load');
  });
});
