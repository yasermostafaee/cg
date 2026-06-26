import { test, expect } from './fixtures/designer.js';
import type { DesignerApp } from './fixtures/designer.js';

/**
 * B-029 — trimming a clock/ticker/sequence's START edge on the timeline (giving it
 * `lifespan.in > 0`) must NOT drop it from playout/export.
 *
 * Before the fix the per-element lifespan gate was evaluated ONLY by the designer
 * scrubber (`tick`); the playout controller's per-frame `applyFrame` applied animation
 * but not the gate. So the preview modal's open-time scrub to frame 0 (< in) hid the
 * element and Play never restored it — it stayed `display:none` for the whole playout,
 * i.e. dropped. Now the root scope's `applyFrame` evaluates the same gate during
 * playback, so a start-trimmed element appears at/after its in-point and plays.
 *
 * Each case trims the start, then asserts BOTH halves of the invariant:
 *   (1) the element is still present in the EXPORTED single-file HTML (the trim never
 *       prunes it from the scene), and
 *   (2) it BECOMES VISIBLE at/after its in-point when the preview is played.
 */
test.describe('B-029 — a start-trimmed content element is not dropped from play/export', () => {
  async function trimExportAndPlay(
    app: DesignerApp,
    addElement: () => Promise<void>,
  ): Promise<void> {
    await addElement();
    const [id] = await app.timelineRowIds();
    expect(id, 'the added element has a timeline row').toBeTruthy();
    if (id === undefined) return;

    // Drag the start edge right → lifespan.in > 0.
    await app.trimElementStart(id);

    // (1) Present in the exported single-file HTML — the temporal trim does not prune it.
    const { html } = await app.exportHtml();
    expect(html).toContain(id);

    // (2) Visible at/after its in-point on play. The modal scrubs to frame 0 on open
    //     (hiding it, correctly, before its in-point); Play must restore it. The default
    //     'manual' playout plays the intro to the out-frame (>= in) and HOLDS there, so
    //     the element stays on screen for a stable assertion.
    await app.openPreviewModal();
    await app.play();
    // The regression: pre-fix this element stayed display:none for the whole playout.
    await expect(app.previewElement(id)).toBeVisible({ timeout: 8000 });
    await app.stop();
  }

  test('a trimmed TICKER plays instead of being dropped', async ({ app }) => {
    await app.newProject('TrimTicker');
    await trimExportAndPlay(app, () => app.addTicker());
  });

  test('a trimmed CLOCK plays instead of being dropped', async ({ app }) => {
    await app.newProject('TrimClock');
    await trimExportAndPlay(app, () => app.addClock());
  });

  test('a trimmed SEQUENCE plays instead of being dropped', async ({ app }) => {
    await app.newProject('TrimSequence');
    await trimExportAndPlay(app, () => app.addSequence());
  });
});
