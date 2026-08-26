import { TriangleAlert } from 'lucide-react';
import type { ExportIssue } from '@cg/shared-ipc';
import type { Scene } from '@cg/shared-schema';
import { flattenElements } from '@cg/shared-schema';
import { Icon } from '../../ui/Icon.js';
import * as s from './ErrorMarkOverlay.css.js';

/**
 * ⭐ **`D-157` — MARK THE BOX THAT IS BLOCKING THE EXPORT, on the canvas.**
 *
 * ── THE FAILURE THIS EXISTS TO END ──────────────────────────────────────────
 *
 * The owner: _"if two Live Source boxes overlap by even 1 px, or a box leaves the canvas, the
 * Export button goes dead and I cannot tell why."_
 *
 * 🔴 **The reason already existed in the data and died on the way to the eye.** Every preflight
 * issue already carries `elementId`, an overlap already files one issue PER PARTICIPANT, and the
 * messages already name the elements. What was missing was any mark on the thing that is wrong:
 * the only string in the app that named the Issues panel sat in an unreachable `window.alert`,
 * and the tooltip that was supposed to explain the refusal sat on a natively DISABLED button,
 * where the browser suppresses `title` and the app's own tooltip never fires. `B-141`, `B-143`
 * and `B-144` already name this class — _"the system knows something and does not say it"_.
 *
 * ── WHY THIS IS A DESIGNER OVERLAY AND NOT PART OF THE PLATE ────────────────
 *
 * The plate's visible box on the canvas is painted INSIDE the preview iframe by
 * `@cg/template-runtime`. A mark added there would be in a different package, with a different
 * DOM environment, and could not see `liveSourceIssues` — so the rule and its surface could
 * never be asserted in one test, which is precisely how this class of defect is born. As an
 * overlay in the designer's own `canvas-surface` frame box, one test covers both.
 *
 * ── THE THREE PROPERTIES THAT MAKE IT A SIGNAL RATHER THAN A DECORATION ─────
 *
 * 1. **Driven by the live preflight, never by selection.** `useIssues` re-runs on every scene
 *    change, so a box is marked whether or not it is selected and the mark clears the instant
 *    the geometry stops producing the issue. Nothing has to be re-pressed.
 * 2. **BOTH participants of an overlap are marked** — free, because the preflight files `[a, b]`
 *    and `[b, a]` with their own `elementId`s. Marking one of two colliding boxes would be a
 *    worse answer than marking neither: it would name a culprit where there is a pair.
 * 3. 🔴 **Colour is not the only channel.** Each mark carries a badge (the shared `Icon`, never
 *    an ad-hoc glyph) and an accessible description that IS the issue's own message. The colour
 *    is the design system's existing `danger` token, whose own comment reserves red for real
 *    errors — nothing else on the canvas uses it, so it cannot be confused with the sky
 *    selection outline, the snap guides or the marker colours.
 *
 * ⚠ `pointer-events: none` throughout. A mark that ate a click would make the box HARDER to fix,
 * which is the opposite of the point.
 */
export function ErrorMarkOverlay({
  scene,
  issues,
  scale,
}: {
  scene: Scene | null;
  issues: readonly ExportIssue[];
  scale: number;
}): JSX.Element | null {
  if (scene === null) return null;

  /*
    ONE mark per ELEMENT, not one per issue: a box can be both off-frame AND overlapping, and two
    stacked outlines would read as a different, worse problem. The messages are joined so the
    description still names everything wrong with that box.

    Keyed by elementId, so an issue with none (`look-second-group` is a template-level refusal
    with no element to point at) is skipped rather than drawn at the origin.
  */
  const byElement = new Map<string, string[]>();
  for (const issue of issues) {
    if (issue.severity !== 'error') continue;
    if (issue.elementId === undefined) continue;
    const list = byElement.get(issue.elementId);
    if (list === undefined) byElement.set(issue.elementId, [issue.message]);
    else list.push(issue.message);
  }
  if (byElement.size === 0) return null;

  /*
    🔴 THE SAME FLATTENER THE PREFLIGHT USES. `liveSourceIssues` measures the collision on
    flattened scene rects; reading the mark's geometry from the authored transform instead would
    put the outline somewhere the rule did not measure — a box drawn where the element is not,
    which is `D-154`'s defect. One computation, two readers.
  */
  const rects = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const flat of flattenElements(scene, 'document')) {
    if (byElement.has(flat.element.id)) rects.set(flat.element.id, flat.rect);
  }

  return (
    <div className={s.layer} data-testid="canvas-error-marks">
      {[...byElement].map(([elementId, messages]) => {
        const rect = rects.get(elementId);
        // An issue naming an element the walk does not reach (a plate inside a stamped scope is
        // exactly that case) has no box to mark. The Issues panel still carries its message.
        if (rect === undefined) return null;
        const description = messages.join(' ');
        return (
          <div
            key={elementId}
            className={s.mark}
            data-testid={`canvas-error-mark-${elementId}`}
            data-element-id={elementId}
            style={{
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.width * scale,
              height: rect.height * scale,
            }}
          >
            {/*
              The non-chromatic half. `role="img"` + `aria-label` so the reason is announced
              rather than merely painted, and `title` so a sighted author gets it on hover
              without opening anything.
            */}
            <span className={s.badge} role="img" aria-label={description} title={description}>
              <Icon icon={TriangleAlert} size={12} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
