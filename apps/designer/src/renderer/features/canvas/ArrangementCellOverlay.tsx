import type { Arrangement, Element, Scene } from '@cg/shared-schema';
import { boxInstanceIds } from '../../state/slices/arrangements.js';
import { activeLayersOf } from '../../state/scene-doc.js';
import * as s from './ArrangementCellOverlay.css.js';

/**
 * ⭐ **`D-153` face 1 — DRAW THE CELLS.**
 *
 * ── WHY THIS IS NOT COSMETIC ────────────────────────────────────────────────
 *
 * The argument that won A′ over the computed-grid candidate (`design.md` §12.9) was that
 * **cell placement is a DESIGN decision, not a computed grid.** A surface whose only input
 * is typing four numbers per cell into a side panel **is** a computed grid, entered by hand
 * — the author cannot see the layout they are authoring, so they cannot design it. Drawing
 * the cells is what makes the adopted model actually the adopted model.
 *
 * ── WHAT EACH RECTANGLE SAYS, AND WHY IT SAYS THE BOX'S NAME ────────────────
 *
 * `D-153` face 2: `arrangementViewOf` fills cell `i` with box instance `i` in document
 * order, and nothing on screen said so. Each cell is therefore labelled with the box it
 * HOLDS — or, when the arrangement has more cells than the composition has boxes, with
 * **"no box yet"**, which is the state the owner was in when he asked what to do next.
 *
 * ⚠ **This is a READOUT of the existing order, never a new binding.** Per-cell assignment
 * is deliberately not provided (§12.9.1 Q2): a cell is not a separately addressable
 * identity beside the plate, and an author who wants a different order authors a different
 * order. Nothing here is draggable onto anything.
 *
 * ── COORDINATES ─────────────────────────────────────────────────────────────
 *
 * Rendered INSIDE the scene-origin frame box (`frameRef` in `CanvasOverlay`), which is
 * already positioned at `frameOffset × scale` and sized `resolution × scale`. So a scene
 * rect is just `× scale` here — the same one mapping the gizmo and the click→scene
 * conversion use, rather than a second one that could drift from them.
 */
export function ArrangementCellOverlay({
  scene,
  arrangement,
  scale,
}: {
  scene: Scene;
  arrangement: Arrangement | null;
  scale: number;
}): JSX.Element | null {
  if (arrangement === null || arrangement.cells.length === 0) return null;

  const ids = boxInstanceIds(scene);
  // Same accessor as `boxInstanceIds` — one document, so a cell's label and the id it was
  // matched from can never come from different layer sets.
  const byId = new Map<string, Element>();
  for (const layer of activeLayersOf(scene)) for (const el of layer.children) byId.set(el.id, el);

  return (
    <div className={s.layer} aria-hidden data-testid="arrangement-cells">
      {arrangement.cells.map((cell, i) => {
        const boxId = ids[i];
        const box = boxId === undefined ? undefined : byId.get(boxId);
        return (
          <div
            key={i}
            className={box === undefined ? s.cellEmpty : s.cell}
            data-testid={`arrangement-cell-${String(i + 1)}`}
            style={{
              left: cell.x * scale,
              top: cell.y * scale,
              width: cell.width * scale,
              height: cell.height * scale,
            }}
          >
            <span className={s.label}>
              <span className={s.index}>cell {i + 1}</span>
              {/* The binding, stated. "no box yet" is the honest reading of a cell the
                  composition has no instance for — not an error, just work not done. */}
              <span className={box === undefined ? s.holderEmpty : s.holder}>
                {box === undefined ? 'no box yet' : box.name}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
