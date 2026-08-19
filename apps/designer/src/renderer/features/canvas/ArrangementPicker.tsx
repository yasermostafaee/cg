import { arrangementCount, type Arrangement, type ArrangementView } from '@cg/shared-schema';
import { Select } from '../../ui/Select.js';
import * as s from './CanvasToolbar.css.js';

/**
 * ⭐ **`multibox-layout-switch` C2 (`tasks.md` 5.3) — the ACTIVE-ARRANGEMENT selector.**
 *
 * ── WHY IT IS HERE AND NOT IN THE ARRANGEMENTS SECTION ──────────────────────
 *
 * The right panel switches to ELEMENT properties the moment the author selects an element,
 * and selecting an element is exactly what you do while adjusting an arrangement. A
 * selector there would disappear at the moment it is being used. The canvas header is
 * always visible, so the control that says WHAT YOU ARE LOOKING AT lives with the thing you
 * are looking at.
 *
 * ── 🔴 NO COUNT FIELD ───────────────────────────────────────────────────────
 *
 * Each option's `N-box` label is computed from `cells.length` at render. Nothing here
 * stores or caches a count.
 */
export function ArrangementPicker({
  arrangements,
  activeId,
  onPick,
}: {
  arrangements: readonly Arrangement[];
  activeId: string | null;
  onPick: (id: string | null) => void;
}): JSX.Element | null {
  // A composition with no arrangements gets no control at all — an empty picker would be
  // a permanent affordance for a feature this template does not use.
  if (arrangements.length === 0) return null;
  return (
    <Select
      className={s.arrangementPicker}
      value={activeId ?? ''}
      aria-label="Active arrangement"
      title="Which arrangement the canvas shows"
      onChange={(e) => onPick(e.target.value === '' ? null : e.target.value)}
    >
      {/* "As authored" is a real state, not a null placeholder: it is the composition with
          no arrangement applied, which is what every template that predates the feature
          looks like and what the author sees before adding one. */}
      <option value="">As authored</option>
      {arrangements.map((a) => (
        <option key={a.id} value={a.id}>
          {arrangementCount(a)}-box · {a.name}
          {a.isDefault ? ' ★' : ''}
        </option>
      ))}
    </Select>
  );
}

/**
 * 🔴 **The ACTIVE arrangement, as the `ArrangementView` the runtime takes.**
 *
 * ── WHY IT MAPS CELLS ONTO BOX INSTANCES HERE ───────────────────────────────
 *
 * The carrier ships CELLS, and which BOX lands in which cell is decided by which sources
 * are lit — an operator fact that does not exist at authoring time. So for the CANVAS the
 * mapping is the authored one: box instances in document order fill cells in order, which
 * is what the author is designing against and what the runtime will produce when every
 * declared source is lit.
 *
 * ⚠ A box instance with no cell in this arrangement is HIDDEN rather than left where it
 * was authored. That is the §12.4 HELD state as the page sees it: the plate stops being on
 * screen (so it stops punching), while its producer stays seated — which is exactly why C1
 * separated PUNCH from DECLARATION. Leaving it visible would show the author a box the
 * arrangement does not contain.
 */
export function arrangementViewOf(
  arrangement: Arrangement | null,
  boxInstanceIds: readonly string[],
): ArrangementView | undefined {
  if (arrangement === null) return undefined;
  const geometry: Record<string, { x: number; y: number; width: number; height: number }> = {};
  const visibility: Record<string, boolean> = { ...(arrangement.visibility ?? {}) };
  boxInstanceIds.forEach((id, i) => {
    const cell = arrangement.cells[i];
    if (cell === undefined) {
      // No cell for this box in this arrangement — off screen, not left behind.
      if (visibility[id] === undefined) visibility[id] = false;
      return;
    }
    geometry[id] = { ...cell };
  });
  return { geometry, visibility };
}
