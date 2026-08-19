import {
  arrangementCount,
  type Arrangement,
  type ArrangementTransition,
  type LiveSourceRect,
  type Scene,
} from '@cg/shared-schema';
import { current, set } from '../store-core.js';
import { activeDocOf, withActiveDoc } from '../scene-doc.js';

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
