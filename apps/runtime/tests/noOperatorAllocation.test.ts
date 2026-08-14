import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * R-028 (6.1) — **NO OPERATOR GRAPHIC REACHES AIR THROUGH `LayerManager.allocate()`.**
 *
 * ⚠ **THIS ASSERTS THE ABSENCE OF AN OPERATOR-GRAPHIC CALLER, NOT THE ABSENCE OF
 * EVERY CALLER, AND THE DIFFERENCE IS THE WHOLE POINT OF THE TEST.**
 *
 * The tempting version — "nothing calls `allocate()`" — would pass today, read as
 * a stronger guarantee, and be WRONG: a declared, non-operator allocation is
 * permitted and must stay permitted. C-015's Live Source layers are exactly that
 * (allocated by the bridge, on a declared range, recorded in a bridge-owned
 * ledger, never an operator's graphic), and phase 6's `playSource` will seat them.
 * Written as the broad absence, this file would be a silently correct-looking
 * fixture that forbids the third ownership class, and nothing in review would flag
 * it — which is precisely what R-028 task 6.1 was rewritten to prevent. The
 * permitted half is asserted in `packages/caspar-client/tests/layer-manager.test.ts`
 * ("allocation still serves a DECLARED, non-operator caller"), deliberately in the
 * same breath as this one.
 *
 * So what is asserted here is the OPERATOR path specifically, at its narrowest true
 * point: the console has no control that reaches the allocating load. Under R-028
 * every operator graphic goes onto a DECLARED ROW through `fixedLayers.load` →
 * `bindFixed` (the exact-slot path), and `stack.load` — the one bridge verb that
 * allocates — is unreachable from the renderer.
 *
 * A SOURCE SCAN rather than a behavioural test, because the claim is about what
 * EXISTS rather than about what a given click does: a behavioural test can only
 * ever say "this button did not allocate", and the property is that no button can.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.join(here, '..', 'src', 'renderer');

/** Every `.ts`/`.tsx` file under the renderer tree. */
function rendererSources(dir: string = rendererRoot, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) rendererSources(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('R-028 (6.1) — the operator console cannot allocate a layer', () => {
  it('no renderer module reaches `stack.load`, the one bridge verb that allocates', () => {
    // `stack.load` is KEPT on the bridge and on the platform seam on purpose —
    // rundowns, presets and any future non-row loader may need it (design §k). What
    // must not exist is a path from the operator's surface to it.
    const offenders = rendererSources()
      .filter((file) => /\bstack\s*\.\s*load\s*\(/.test(fs.readFileSync(file, 'utf-8')))
      .map((file) => path.relative(rendererRoot, file));
    expect(
      offenders,
      'a renderer module calls the allocating load; operator graphics go onto DECLARED ROWS ' +
        'via fixedLayers.load → bindFixed',
    ).toEqual([]);
  });

  it('…and the row load path it replaced is present, so this is a REDIRECTION, not a deletion', () => {
    // The guard on the guard. Without this, deleting the row's load entirely would
    // make the assertion above pass while leaving the operator no way to load at
    // all — an absence-assertion satisfied by removing the feature.
    const usesExactSlotLoad = rendererSources().some((file) =>
      /fixedLayers\s*\.\s*load\s*\(|loadTemplateOntoFixedSlot|importAndLoadOntoFixedSlot/.test(
        fs.readFileSync(file, 'utf-8'),
      ),
    );
    expect(usesExactSlotLoad, 'the renderer must still have an exact-slot load').toBe(true);
  });
});
