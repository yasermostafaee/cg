import {
  arrangementCount,
  type Arrangement,
  type ArrangementTransition,
  type ArrangementView,
  type Element,
  type LiveSourceRect,
  type Scene,
  type Transform,
} from '@cg/shared-schema';
import { current, set } from '../store-core.js';
import { activeDocOf, activeLayersOf, withActiveDoc } from '../scene-doc.js';

/**
 * `multibox-layout-switch` stage C2 — the ARRANGEMENT authoring slice (`tasks.md` 5.3–5.6).
 *
 * ── 🔴 THE COUNT IS NEVER STORED, AND THIS SLICE IS WHERE IT WOULD CREEP IN ─
 *
 * The count IS `cells.length`. C1 left it out of the schema deliberately — a stored count
 * and a cell list can disagree, and the first edit that adds a cell without updating the
 * number is a template whose declared count and actual geometry differ with nothing on air
 * to say which was meant. **No action here takes a count, and no state here caches one.**
 * Every count the UI shows is computed at the point of display via `arrangementCount`.
 *
 * ── WHY THE ACTIVE ARRANGEMENT IS EDITOR STATE AND NOT SCENE STATE ──────────
 *
 * Which arrangement you are LOOKING AT is a property of the editing session, exactly like
 * the selection or the playhead. At playout the active arrangement is derived from which
 * source toggles are lit (D1) and no authored field takes part in that, so storing it in
 * the scene would put a value in the `.vcg` that the runtime must then be careful to
 * ignore — a field that looks like it means something.
 */

/** The arrangements of the composition being edited. Empty when it has none. */
export function activeArrangements(scene: Scene): readonly Arrangement[] {
  return activeDocOf(scene).arrangements ?? [];
}

/**
 * The arrangement the canvas is currently showing, or `null`.
 *
 * ⚠ Resolved rather than read: the stored id can be stale (its arrangement deleted, or the
 * author switched composition), and a stale id must read as "none active" instead of
 * leaving the canvas claiming an arrangement that no longer exists.
 */
export function activeArrangement(scene: Scene | null): Arrangement | null {
  if (scene === null) return null;
  const id = current.activeArrangementId;
  if (id === null) return null;
  return activeArrangements(scene).find((a) => a.id === id) ?? null;
}

function writeArrangements(next: readonly Arrangement[]): Scene | null {
  if (current.scene === null) return null;
  return withActiveDoc(current.scene, { arrangements: [...next] });
}

/** A stable-enough id for a new arrangement; ids only have to be unique in one list. */
function freshId(existing: readonly Arrangement[]): string {
  let n = existing.length + 1;
  while (existing.some((a) => a.id === `arr-${String(n)}`)) n++;
  return `arr-${String(n)}`;
}

export const arrangementsSlice = {
  setActiveArrangement(id: string | null): void {
    set({ activeArrangementId: id });
  },

  /**
   * Add an arrangement with `cellCount` cells laid out as a starting grid.
   *
   * ⚠ The grid is a STARTING POINT the author then moves, not a computed layout — that
   * distinction is the one that killed the fixed-computed-family candidate (§12.9): cell
   * placement is a DESIGN decision. Seeding an editable value is not the same as deriving
   * one, and the author can drag every cell afterwards.
   */
  addArrangement(cellCount: number): void {
    if (current.scene === null) return;
    const existing = activeArrangements(current.scene);
    const { width, height } = activeDocOf(current.scene).resolution;
    const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, cellCount))));
    const rows = Math.max(1, Math.ceil(cellCount / columns));
    const cells: LiveSourceRect[] = [];
    for (let i = 0; i < cellCount; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      cells.push({
        x: (width / columns) * col,
        y: (height / rows) * row,
        width: width / columns,
        height: height / rows,
      });
    }
    // Exactly one default per COUNT is a schema invariant (`ArrangementsSchema`), so a new
    // arrangement is the default only when its count has none yet. Both failure directions
    // are silent on air, which is why this is decided here and not left to the author.
    const countHasDefault = existing.some((a) => arrangementCount(a) === cellCount && a.isDefault);
    const arrangement: Arrangement = {
      id: freshId(existing),
      name: `${String(cellCount)}-box`,
      cells,
      isDefault: !countHasDefault,
      transition: { mode: 'cut' },
    };
    const scene = writeArrangements([...existing, arrangement]);
    if (scene !== null) set({ scene, activeArrangementId: arrangement.id });
  },

  removeArrangement(id: string): void {
    if (current.scene === null) return;
    const existing = activeArrangements(current.scene);
    const removed = existing.find((a) => a.id === id);
    if (removed === undefined) return;
    let next = existing.filter((a) => a.id !== id);
    // Removing a count's default would leave that count with none — which the schema
    // refuses, and which at playout means deriving that count activates nothing. Promote
    // the first survivor of the same count rather than letting the list become unsavable.
    if (removed.isDefault) {
      const count = arrangementCount(removed);
      const heir = next.find((a) => arrangementCount(a) === count);
      if (heir !== undefined) {
        next = next.map((a) => (a.id === heir.id ? { ...a, isDefault: true } : a));
      }
    }
    const scene = writeArrangements(next);
    if (scene !== null) {
      set({
        scene,
        ...(current.activeArrangementId === id ? { activeArrangementId: null } : {}),
      });
    }
  },

  renameArrangement(id: string, name: string): void {
    if (current.scene === null || name.trim() === '') return;
    const scene = writeArrangements(
      activeArrangements(current.scene).map((a) => (a.id === id ? { ...a, name } : a)),
    );
    if (scene !== null) set({ scene });
  },

  /**
   * Make `id` the default for ITS OWN count, clearing the flag on that count alone.
   *
   * ⚠ Scoped to the count on purpose: the invariant is one default PER COUNT, so clearing
   * every other arrangement's flag would strip the defaults off every other count and make
   * the whole list unsavable in one click.
   */
  setArrangementDefault(id: string): void {
    if (current.scene === null) return;
    const existing = activeArrangements(current.scene);
    const target = existing.find((a) => a.id === id);
    if (target === undefined) return;
    const count = arrangementCount(target);
    const scene = writeArrangements(
      existing.map((a) => (arrangementCount(a) === count ? { ...a, isDefault: a.id === id } : a)),
    );
    if (scene !== null) set({ scene });
  },

  /** Move or resize one cell. The cell list's LENGTH is the count, so this never changes it. */
  setArrangementCell(id: string, index: number, rect: LiveSourceRect): void {
    if (current.scene === null) return;
    const scene = writeArrangements(
      activeArrangements(current.scene).map((a) =>
        a.id === id ? { ...a, cells: a.cells.map((c, i) => (i === index ? { ...rect } : c)) } : a,
      ),
    );
    if (scene !== null) set({ scene });
  },

  /** D2 — the transition this arrangement is ENTERED with. */
  setArrangementTransition(id: string, transition: ArrangementTransition): void {
    if (current.scene === null) return;
    const scene = writeArrangements(
      activeArrangements(current.scene).map((a) => (a.id === id ? { ...a, transition } : a)),
    );
    if (scene !== null) set({ scene });
  },

  /**
   * Input 2 of `resolveVisibility` — this arrangement's opinion about one element.
   *
   * 🔴 `null` CLEARS the opinion, and that is a third state rather than a synonym for
   * `false`: an arrangement with no opinion lets the authored `visible` stand, while
   * `false` overrides it. Collapsing them would make "I have not decided" indistinguishable
   * from "I have decided to hide this", and the author could never get back.
   */
  setArrangementElementVisibility(id: string, elementId: string, visible: boolean | null): void {
    if (current.scene === null) return;
    const scene = writeArrangements(
      activeArrangements(current.scene).map((a) => {
        if (a.id !== id) return a;
        const visibility = { ...(a.visibility ?? {}) };
        if (visible === null) delete visibility[elementId];
        else visibility[elementId] = visible;
        return Object.keys(visibility).length === 0
          ? {
              id: a.id,
              name: a.name,
              cells: a.cells,
              isDefault: a.isDefault,
              transition: a.transition,
            }
          : { ...a, visibility };
      }),
    );
    if (scene !== null) set({ scene });
  },
};

// ──────────── THE ONE cells → box-instances MAPPING, shared by canvas and preflight ────────────

/**
 * The BOX INSTANCES of a composition, in DOCUMENT order — the order `flattenElements`
 * emits and the order an arrangement's cells are filled in.
 *
 * Root-level `composition` elements only: an arrangement positions the boxes the
 * composition itself contains (A′), and a composition nested INSIDE a box is part of that
 * box's design and travels with it.
 */
export function boxInstanceIds(scene: Scene): string[] {
  // 🔴 `activeLayersOf`, NOT `scene.layers`. Callers pass two different things: the canvas
  // and the preflight pass the PROJECTED edit scene (whose `layers` are already the active
  // composition's), while the timeline passes the RAW store scene (whose `layers` are the
  // root's). Reading `.layers` directly was right for the first two and silently wrong for
  // the third — every box read as "has a cell", so a hidden box showed an open eye. This
  // accessor resolves the active document for both shapes, so one function is correct
  // everywhere instead of correct-by-luck at two call sites out of three.
  return activeLayersOf(scene)
    .flatMap((l) => l.children)
    .filter((e) => e.type === 'composition')
    .map((e) => e.id);
}

/**
 * 🔴 **The ACTIVE arrangement as an {@link ArrangementView} — ONE mapping, two consumers.**
 *
 * The canvas uses it to drive `runtime.setArrangementView()`; the preflight uses it to ask
 * where the plates ARE in each arrangement. They must agree exactly, or the author is shown
 * an overlap the canvas does not display, or shown a clean canvas that fails export. That
 * is the two-spellings shape `CLAUDE.md` golden rule 6 names, and it lives here rather than
 * in either consumer so neither owns it.
 *
 * ── WHY THE MAPPING IS POSITIONAL ───────────────────────────────────────────
 *
 * The carrier ships CELLS, and which box lands in which cell is decided at play time by
 * which sources are lit — an operator fact that does not exist while authoring. So for
 * AUTHORING the mapping is the one the author is designing against: box instances in
 * document order fill cells in order, which is what the runtime produces when every declared
 * source is lit.
 *
 * ⚠ A box with NO cell in this arrangement is HIDDEN rather than left where it was
 * authored. That is §12.4's HELD state as the page sees it — the plate stops being on screen
 * (so it stops punching) while its producer stays seated — and it is why C1 separated PUNCH
 * from DECLARATION. Leaving it visible would show the author a box the arrangement does not
 * contain, and would make the canvas the union of arrangements rather than one of them.
 */
export function arrangementViewOf(
  arrangement: Arrangement | null,
  instanceIds: readonly string[],
): ArrangementView | undefined {
  if (arrangement === null) return undefined;
  const geometry: Record<string, LiveSourceRect> = {};
  const visibility: Record<string, boolean> = { ...(arrangement.visibility ?? {}) };
  instanceIds.forEach((id, i) => {
    const cell = arrangement.cells[i];
    if (cell === undefined) {
      if (visibility[id] === undefined) visibility[id] = false;
      return;
    }
    geometry[id] = { ...cell };
  });
  return { geometry, visibility };
}

// ─────────────── D-154 — ONE geometry for a box: the cell, read and written ───────────────

/** Where an element's geometry actually lives while an arrangement is active. */
export interface ActiveCell {
  readonly arrangementId: string;
  readonly index: number;
  readonly rect: LiveSourceRect;
}

/**
 * 🔴 **The CELL that positions `elementId` in the ACTIVE arrangement, or `null`.**
 *
 * ── WHY THIS EXISTS: A BOX HAD TWO GEOMETRY EDITORS ─────────────────────────
 *
 * `arrangementViewOf` sets `geometry[id] = {...cell}` and `applyArrangementToNodes` writes it
 * onto the node, so **the cell fully overrides the authored transform** for any box that has
 * one. The Transform panel and the canvas gizmo went on reading and writing
 * `element.transform` — a value that is (a) ONE number set shared by every arrangement, and
 * (b) **inert at air**.
 *
 * Inert is the part nobody could have guessed, and the algebra is pinned by
 * `arrangement-geometry.test.ts` so the next reader does not re-derive it or "fix" the
 * cancellation as a bug:
 *
 * ```
 * plate.scene   = instance.pos + plate.local × preScale,  preScale = instance.size / comp.resolution
 * boxRelative.x = (plate.scene.x − instance.x) / instance.width = plate.local.x / comp.width
 * boxRelative.w =  plate.scene.width / instance.width          = plate.local.w / comp.width
 * ```
 *
 * **The instance's authored X/Y/W/H cancels out of the exported hole entirely.** It survives
 * only as the "As authored" preview — the composition with no arrangement applied.
 *
 * So: `null` here means "this element's geometry is its own transform, as always"; a cell
 * means "the arrangement owns this element's rect", and EVERY reader and writer must go
 * through that answer. One value, several surfaces.
 */
export function activeCellFor(scene: Scene | null, elementId: string): ActiveCell | null {
  if (scene === null) return null;
  const id = current.activeArrangementId;
  if (id === null) return null;
  const arrangement = activeArrangements(scene).find((a) => a.id === id);
  if (arrangement === undefined) return null;
  const index = boxInstanceIds(scene).indexOf(elementId);
  if (index === -1) return null;
  const rect = arrangement.cells[index];
  // A box with NO cell in this arrangement is HIDDEN, not authored-positioned. Returning
  // `null` here would silently hand it back to the authored transform — which is this whole
  // defect, reintroduced for the one case where it is hardest to notice.
  if (rect === undefined) return { arrangementId: id, index, rect: NO_CELL };
  return { arrangementId: id, index, rect };
}

/**
 * The sentinel rect for "this box has no cell in the active arrangement".
 *
 * Zero-sized and at the origin so it can never be mistaken for a real cell, and so a gizmo
 * drawn from it has no area to grab — the box is off screen, and an invisible box must not
 * offer handles that would write a cell index the arrangement does not have.
 */
export const NO_CELL: LiveSourceRect = { x: 0, y: 0, width: 0, height: 0 };

/** Does this cell mean "no cell here"? */
export function isNoCell(rect: LiveSourceRect): boolean {
  return rect.width === 0 && rect.height === 0;
}

/**
 * The four transform properties a CELL owns. Rotation and scale are deliberately absent: a
 * cell is an axis-aligned RECT, and the authored rotation still applies on top of it (the
 * node keeps its CSS transform). Widening this set without widening the cell would start
 * dropping edits on the floor.
 */
const CELL_PROPERTIES: Readonly<Record<string, keyof LiveSourceRect>> = {
  'position.x': 'x',
  'position.y': 'y',
  'size.w': 'width',
  'size.h': 'height',
};

/**
 * 🔴 **The WRITE side — route a geometry commit to the cell when the arrangement owns it.**
 *
 * Returns `true` when it handled the write. Called from `commitAnimatable`, which is the ONE
 * chokepoint every geometry edit passes through — the gizmo drag, the gizmo resize, the group
 * move, and the Transform panel's number fields all end up there. Intercepting once is what
 * makes "the gizmo and the CELLS fields are two views of one value" true by construction
 * rather than by four call sites remembering to agree.
 */
export function commitToActiveCell(elementId: string, property: string, value: unknown): boolean {
  const key = CELL_PROPERTIES[property];
  if (key === undefined || typeof value !== 'number') return false;
  const cell = activeCellFor(current.scene, elementId);
  if (cell === null) return false;
  // A hidden box (no cell) accepts no geometry: there is no cell to write into, and writing
  // the authored transform instead is exactly the silent fall-back this item exists to end.
  if (isNoCell(cell.rect)) return true;
  arrangementsSlice.setArrangementCell(cell.arrangementId, cell.index, {
    ...cell.rect,
    [key]: value,
  });
  return true;
}

/**
 * 🔴 **The READ side — the transform a box actually renders at.**
 *
 * The gizmo, the hit-test and the Transform panel all call this instead of
 * `effectiveTransformAt`, so the selection rectangle is drawn where the element IS. Before
 * this, the gizmo was drawn at the authored rect while the element rendered at the cell —
 * the owner's handles sat in empty space and dragging them moved nothing he could see.
 */
export function arrangedTransform(element: Element, base: Transform): Transform {
  const cell = activeCellFor(current.scene, element.id);
  if (cell === null) return base;
  return {
    ...base,
    position: { x: cell.rect.x, y: cell.rect.y },
    size: { w: cell.rect.width, h: cell.rect.height },
  };
}
