import type { Element, TextElement } from './elements.js';
import type { Composition, Layer, Scene } from './scene.js';
import { migrateScenePaths } from './path-migration.js';

/**
 * 🔴 **THE REGISTERED SCENE MIGRATIONS — every load runs these, in order.**
 *
 * A migration here is a pure, IDENTITY-PRESERVING `Scene → Scene`: a scene with nothing to migrate
 * comes back as the SAME object, so a clean project does not load dirty (the Designer compares by
 * identity) and a package renders pixel-identically without rewriting it. They run at the two
 * points every scene passes — the Designer's scene load and the runtime's `createRuntime` — so a
 * `.vcg` exported before a migration existed is migrated on air as well as in the editor.
 *
 * Add a migration by appending it; never reorder. Each one documents the intent it preserves.
 */
export const SCENE_MIGRATIONS: readonly ((scene: Scene) => Scene)[] = [
  // B-059 / B-062 — `path` geometry to the size == visual-bbox convention.
  migrateScenePaths,
  // `TEXT-FIT-01` (`B-147`) — three spellings of "make the text fit" become one.
  migrateTextFit,
];

/** Run every registered migration over `scene`. Identity-preserving (see above). */
export function migrateScene(scene: Scene): Scene {
  return SCENE_MIGRATIONS.reduce((s, migrate) => migrate(s), scene);
}

/**
 * 🔴 `TEXT-FIT-01` (`B-147`) — **ONE SPELLING OF "MAKE THE TEXT FIT": `fitMode: 'shrink-to-fit'`.**
 *
 * Three spellings existed and the runtime read none: `fitMode: 'shrink-to-fit'`, `autoSqueeze: true`
 * and `overflow: 'shrink'`. `fitMode` is the one kept, because it is the field that already says how
 * text and box relate (`fixed` — the box is the box; `autosize` — the box grows to the text;
 * `shrink-to-fit` — the text shrinks to the box), it is required (every element states it), and it
 * is what the runtime reads. `overflow` keeps its own job — what happens when the text still does not
 * fit at its smallest — so its values are `clip` and `ellipsis`.
 *
 * Intent, preserved:
 *
 * - `autoSqueeze: true` on a FIXED box → `fitMode: 'shrink-to-fit'`. It asked for fit.
 * - `overflow: 'shrink'` on a FIXED box → `fitMode: 'shrink-to-fit'`, `overflow: 'clip'`. It asked for
 *   fit; past the minimum, clipping is what a box that shrank everything it could does.
 * - On an AUTOSIZE box both are moot — the box already grows to the text, nothing overflows — so the
 *   box stays `autosize` and only the legacy fields are dropped (`overflow: 'shrink'` → `clip`).
 * - `autoSqueeze: false` (or absent) asked for nothing: the key is dropped and the look is unchanged.
 * - 🔴 A text that asked for none of these is returned AS IT IS — the same object. No template that did
 *   not ask for fit changes how it looks.
 */
export function migrateTextFit(scene: Scene): Scene {
  return mapSceneElements(scene, (el) => (el.type === 'text' ? migrateTextElement(el) : el));
}

function migrateTextElement(el: TextElement): TextElement {
  const legacy = el as TextElement & { autoSqueeze?: boolean; overflow: string };
  const squeeze = legacy.autoSqueeze;
  const shrinkOverflow = legacy.overflow === 'shrink';
  if (squeeze === undefined && !shrinkOverflow) return el;
  const askedForFit = squeeze === true || shrinkOverflow;
  const rest = Object.fromEntries(
    Object.entries(legacy).filter(([key]) => key !== 'autoSqueeze'),
  ) as TextElement;
  return {
    ...rest,
    fitMode: askedForFit && el.fitMode === 'fixed' ? 'shrink-to-fit' : el.fitMode,
    overflow: shrinkOverflow ? 'clip' : el.overflow,
  } as TextElement;
}

/** Map every element of the scene (root, compositions, containers), preserving identity. */
function mapSceneElements(scene: Scene, fn: (el: Element) => Element): Scene {
  if (!Array.isArray(scene.layers)) return scene; // tolerate partial fixtures
  const layers = mapLayers(scene.layers, fn);
  let compositions = scene.compositions;
  if (compositions !== undefined) {
    let changed = false;
    const next: Composition[] = compositions.map((c) => {
      const l = mapLayers(c.layers, fn);
      if (l === c.layers) return c;
      changed = true;
      return { ...c, layers: [...l] };
    });
    if (changed) compositions = next;
  }
  if (layers === scene.layers && compositions === scene.compositions) return scene;
  return {
    ...scene,
    layers: [...layers],
    ...(compositions !== undefined ? { compositions } : {}),
  };
}

function mapLayers(layers: readonly Layer[], fn: (el: Element) => Element): readonly Layer[] {
  if (!Array.isArray(layers)) return layers;
  let changed = false;
  const next = layers.map((layer) => {
    const children = mapChildren(layer.children, fn);
    if (children === layer.children) return layer;
    changed = true;
    return { ...layer, children: [...children] };
  });
  return changed ? next : layers;
}

function mapChildren(
  children: readonly Element[],
  fn: (el: Element) => Element,
): readonly Element[] {
  if (!Array.isArray(children)) return children;
  let changed = false;
  const next = children.map((el) => {
    let m = fn(el);
    if (m.type === 'container') {
      const inner = mapChildren(m.children, fn);
      if (inner !== m.children) m = { ...m, children: [...inner] };
    }
    if (m !== el) changed = true;
    return m;
  });
  return changed ? next : children;
}
