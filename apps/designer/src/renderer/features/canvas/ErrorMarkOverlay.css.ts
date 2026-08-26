import { style } from '@vanilla-extract/css';
import { colors } from '../../theme.js';

/**
 * `D-157` — the error marks drawn over the canvas.
 *
 * ⚠ **Every rule here is non-interactive by construction.** A mark that ate a click would make
 * the very box it is complaining about harder to fix — the opposite of the point — so the layer
 * and every mark are `pointer-events: none`. The badge is the one exception: it opts back IN, so
 * its `title` can be read on hover without opening anything.
 *
 * 🔴 **The colour is `colors.danger` and nothing else on the canvas uses it.** `theme.ts` reserves
 * red for real errors ("CAUTION … used to borrow `danger`, which cried wolf"), and the canvas's
 * other chromatic signals are the sky selection outline, the snap guides and the marker colours —
 * so the mark cannot be mistaken for selection or hover.
 */

export const layer = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  /*
    Above the preview iframe's content, below the gizmo. Matching the cell overlay's rule and for
    the same reason: the gizmo is what the author acts THROUGH, and an error outline must never
    sit on top of a resize handle — the author's next move is to drag this box apart.
  */
  zIndex: 1,
});

export const mark = style({
  position: 'absolute',
  pointerEvents: 'none',
  boxSizing: 'border-box',
  /*
    A DASHED outline, not a solid one. The selection outline is solid sky; making the error solid
    red would leave dash-vs-solid as the only shape difference on a selected offender, which is
    exactly the confusion the brief asks to avoid. Dashed reads as "flagged" rather than "chosen"
    at any zoom.
  */
  border: `2px dashed ${colors.danger}`,
  // A faint wash so the box reads as marked even where its own content is busy — well below the
  // threshold at which it would obscure the picture the author is trying to judge.
  background: 'rgba(248, 113, 113, 0.12)',
});

export const badge = style({
  position: 'absolute',
  top: 0,
  left: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 18,
  height: 18,
  color: '#1a1a1a',
  background: colors.danger,
  borderRadius: '0 0 4px 0',
  // 🔴 The ONE interactive thing here: the badge takes pointer events so its `title` shows on
  // hover. It is 18px in the corner of the box, so it cannot swallow a drag of the box itself.
  pointerEvents: 'auto',
  cursor: 'help',
});
