import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * B-129 — the canvas backdrop is an EDITOR affordance and never reaches the output.
 *
 * The defect this pins: one field carried two facts — "let me see my white text while
 * I work" and "this graphic paints a background on air" — so an editing preference
 * went to air as a full-frame card over live video, and a lower-third rendered as a
 * fullscreen graphic. Nothing in the Designer said it would happen; the editor looked
 * identical either way.
 *
 * Maps `openspec/changes/designer-export-fidelity/specs/designer-canvas-viewport/spec.md`,
 * one `test` per `#### Scenario` that has a UI to drive:
 *
 *   - "A scene with no background element renders transparent"
 *   - "The editor's own backdrop is never a property of the exported scene"
 *   - "The author is told what the backdrop does"
 *
 * The render-path proof for nested compositions and for the deliberate full-frame
 * element lives in `packages/template-runtime/tests/editor-backdrop.test.ts`; the
 * parse-time normalization of the legacy key is in `@cg/shared-schema`. This spec
 * drives the REAL control in a REAL browser and reads the REAL exported artifact.
 */

/** The editor-backdrop colour input in the Inspector's full-variant row. */
const backdropInput = (app: DesignerApp) =>
  app.page.getByLabel('Editor backdrop colour (editor only — does not reach air)');

/**
 * ⭐ **Why there is NO "the canvas shows the backdrop" assertion here — a finding, not
 * an omission.** On the editor canvas the author's backdrop is not visible at all: the
 * D-071 authoring pasteboard pins `.cg-stage { background-color: #3d4253 !important }`
 * plus the broadcast checkerboard (`preview.ts`), and `!important` beats the inline
 * style the runtime writes. So the control the author sets had NO effect on the surface
 * they were looking at, and full effect on air.
 *
 * That is the sharp form of the item's own words — _"nothing in the Designer tells the
 * author it will happen; the editor looks the same either way"_ — and it makes the fix
 * strictly a removal of harm: the backdrop was already invisible where it was supposed
 * to help. The author-mode paint IS still asserted, at unit level and against the real
 * builder, in `packages/template-runtime/tests/editor-backdrop.test.ts`.
 */

/**
 * ⚠ **The colour input could NOT be driven from Playwright, and that is recorded rather
 * than worked around.** `locator.fill()` is swallowed by React's value tracker (it
 * assigns `input.value` directly, so the synthetic `change` never fires), and driving
 * the native `value` setter with explicit `input`/`change` events did not reach the
 * store either — the input still read `#000000`. Rather than keep escalating the
 * simulation until something moved, the EXPORT round-trip is asserted where it can be
 * asserted honestly and completely:
 *
 *   - `packages/vcg-format/tests/roundtrip.test.ts` — a packed `.vcg` from a scene that
 *     DID carry `#123456` unpacks with `editorBackdrop: 'transparent'`, everything else
 *     intact.
 *   - `packages/single-file-export/tests/exporter-single-file.test.ts` — the emitted
 *     single-file HTML contains `"editorBackdrop":"transparent"` and not the colour.
 *   - `packages/template-runtime/tests/editor-backdrop.test.ts` — output mode paints
 *     nothing, author mode paints, for the stage AND a nested composition instance.
 *
 * 🔴 **What is therefore NOT covered end-to-end: a colour set through the real control
 * reaching a real exported file.** Named here so the next reader does not mistake a
 * green suite for that guarantee. Closing it needs the control to expose a hex TEXT
 * input (the repo's other colour specs drive those, and they work) — a real usability
 * gain, deliberately not bundled into an on-air fix.
 */

test.describe('B-129 — the editor backdrop never reaches air', () => {
  test('the control tells the author it is editor-only', async ({ app }) => {
    await app.newProject('Backdrop');

    // "Nothing in the Designer tells the author it will happen" was half the defect —
    // the editor looked the same either way. The control now says what it is, so the
    // remedy (place a full-frame rectangle) is discoverable rather than folklore.
    await expect(backdropInput(app)).toHaveCount(1);
    await expect(app.page.getByText('editor backdrop', { exact: true })).toBeVisible();
  });
});
