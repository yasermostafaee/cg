import type {
  ClockElement,
  CountdownStep,
  CountdownSteps,
  Element,
  TextElement,
  ZoneColor,
} from './elements.js';
import type { Composition, Layer, Scene } from './scene.js';
import { migrateScenePaths } from './path-migration.js';
import { colorPropertiesOf, type ElementChange } from './element-changes.js';

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
  // `DELTA-RUN-NEXT-VERSION-01-A` — a countdown's colour zones become steps that change elements.
  migrateCountdownZones,
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
  const rest = withoutKeys(legacy, ['autoSqueeze']) as TextElement;
  return {
    ...rest,
    fitMode: askedForFit && el.fitMode === 'fixed' ? 'shrink-to-fit' : el.fitMode,
    overflow: shrinkOverflow ? 'clip' : el.overflow,
  } as TextElement;
}

/** The old compiler's colour check: 6 or 8 hex digits, nothing else reached a declaration. */
const ZONE_HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/** A zone key the old compiler could not escape into a selector — it DROPPED such keys. */
// eslint-disable-next-line no-control-regex
const UNESCAPABLE_KEY = /[\u0000-\u001f\u007f]/;

/** Every element of one document's layers, containers flattened, in authored order. */
function docElements(layers: readonly Layer[]): Element[] {
  const out: Element[] = [];
  const push = (el: Element): void => {
    out.push(el);
    if (el.type === 'container') for (const child of el.children) push(child);
  };
  for (const layer of layers) for (const el of layer.children) push(el);
  return out;
}

/** The compositions an element instances: a composition instance, a repeater, a sequence's items. */
function instancedCompositionIds(el: Element): string[] {
  if (el.type === 'composition' || el.type === 'repeater') return [el.compositionId];
  if (el.type === 'sequence') {
    return el.items.flatMap((item) =>
      'compositionId' in item && typeof item.compositionId === 'string' ? [item.compositionId] : [],
    );
  }
  return [];
}

const isZonedCountdown = (el: Element): el is ClockElement =>
  el.type === 'clock' && el.mode === 'countdown' && el.zones !== undefined;

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-A` — **A COUNTDOWN'S COLOUR ZONES BECOME STEPS THAT CHANGE ELEMENTS,
 * WITH THE SAME ON-AIR RESULT.**
 *
 * D-141 v1 stored the same intent from two ends: the countdown named ZONES (a threshold, a key and a
 * colour), and each element named per-zone colour OVERRIDES keyed by those zone names. Steps store it
 * from ONE end — the countdown's step lists the element, the property and the value — so this
 * migration rewrites each zoned countdown's zones into steps and every override into the step change
 * it was standing for, then drops both legacy keys. It reproduces what the zone stylesheet did:
 *
 * - the base zone becomes the **Before** step; each zone step becomes a step at the same threshold,
 *   named by its zone key; every step keeps the 400 ms morph the zones had (`fade`, 400 ms);
 * - an override reached the elements of the countdown's OWN composition and of compositions instanced
 *   inside it — but NOT inside a nested composition with a zoned countdown of its own, which governed
 *   its own subtree (nearest wins). The migration walks exactly that reach;
 * - a `'zone'` colour is resolved through the SAME scene-wide palette the stylesheet compiled (the
 *   first authored definition of a key wins), and an explicit colour is copied;
 * - what the stylesheet DROPPED is dropped here too: a key no countdown defines, a key with a control
 *   character, a colour that is not 6 or 8 hex digits, a slot the element's kind does not own;
 * - a zoned clock that is not a countdown (the schema refused it; the runtime ignored it) just loses
 *   its zones.
 *
 * ⚠ Two places the old stylesheet's behaviour is not reproduced, both stated rather than hidden:
 * a loop restart now returns an element to its authored colours by a CUT where zones morphed over
 * 400 ms (between runs, never on a boundary); and two zoned countdowns in ONE composition each get
 * the changes for their own keys, where the zones fought over one attribute.
 *
 * Identity-preserving: a scene with no zones and no overrides is returned as the same object.
 */
export function migrateCountdownZones(scene: Scene): Scene {
  if (!Array.isArray(scene.layers)) return scene;
  const docs: { id: string | null; layers: readonly Layer[] }[] = [
    { id: null, layers: scene.layers },
    ...(scene.compositions ?? []).map((c) => ({ id: c.id, layers: c.layers })),
  ];
  const elementsOf = new Map<string | null, Element[]>();
  for (const d of docs) elementsOf.set(d.id, docElements(d.layers));
  const all = docs.flatMap((d) => elementsOf.get(d.id) ?? []);
  const hasLegacy = all.some(
    (el) => (el.type === 'clock' && el.zones !== undefined) || 'zoneOverrides' in el,
  );
  if (!hasLegacy) return scene;

  // The scene-wide palette, exactly as the stylesheet compiled it: first authored definition wins.
  const palette = new Map<string, string>();
  for (const el of all) {
    if (!isZonedCountdown(el)) continue;
    const zones = el.zones;
    if (zones === undefined) continue;
    for (const entry of zones.base === undefined ? zones.steps : [zones.base, ...zones.steps]) {
      if (!palette.has(entry.key)) palette.set(entry.key, entry.color);
    }
  }

  const zonedDocs = new Set(
    docs.filter((d) => (elementsOf.get(d.id) ?? []).some(isZonedCountdown)).map((d) => d.id),
  );

  /** The elements a zoned countdown in doc `docId` reached: its doc, and unzoned docs below it. */
  const reachOf = (docId: string | null): Element[] => {
    const out: Element[] = [];
    const seenEls = new Set<string>();
    const visit = (id: string | null, depth: number, path: ReadonlySet<string | null>): void => {
      for (const el of elementsOf.get(id) ?? []) {
        if (!seenEls.has(el.id)) {
          seenEls.add(el.id);
          out.push(el);
        }
        if (depth >= 8) continue;
        for (const child of instancedCompositionIds(el)) {
          if (path.has(child) || zonedDocs.has(child) || !elementsOf.has(child)) continue;
          visit(child, depth + 1, new Set([...path, child]));
        }
      }
    };
    visit(docId, 0, new Set([docId]));
    return out;
  };

  const resolve = (value: ZoneColor, key: string): string | null => {
    const color = value === 'zone' ? palette.get(key) : value;
    return color !== undefined && ZONE_HEX.test(color) ? color : null;
  };

  /** The step changes one zone key stood for, over the countdown's reach. */
  const changesFor = (key: string, reach: readonly Element[]): ElementChange[] => {
    if (UNESCAPABLE_KEY.test(key)) return [];
    const out: ElementChange[] = [];
    for (const el of reach) {
      const override = el.zoneOverrides?.find((o) => o.zone === key);
      if (override === undefined) continue;
      for (const property of colorPropertiesOf(el)) {
        const value = override[property];
        if (value === undefined) continue;
        const color = resolve(value, key);
        if (color !== null) out.push({ elementId: el.id, property, value: color });
      }
    }
    return out;
  };

  const MORPH = { kind: 'fade', ms: 400 } as const;
  const stepsByClock = new Map<string, CountdownSteps>();
  for (const d of docs) {
    const reach = zonedDocs.has(d.id) ? reachOf(d.id) : [];
    for (const el of elementsOf.get(d.id) ?? []) {
      if (!isZonedCountdown(el) || el.zones === undefined) continue;
      const zones = el.zones;
      const steps: CountdownStep[] = zones.steps.map((step) => ({
        name: step.key,
        atMs: step.atOrBelowMs,
        changes: changesFor(step.key, reach),
        transition: MORPH,
      }));
      stepsByClock.set(el.id, {
        ...(zones.base !== undefined
          ? {
              before: {
                name: zones.base.key,
                changes: changesFor(zones.base.key, reach),
                transition: MORPH,
              },
            }
          : {}),
        steps,
      });
    }
  }

  const rewrite = (el: Element): Element => {
    const hasZones = el.type === 'clock' && el.zones !== undefined;
    if (!hasZones && !('zoneOverrides' in el)) return el;
    const rest = withoutKeys(el, ['zoneOverrides', 'zones']) as Element;
    const steps = stepsByClock.get(el.id);
    if (el.type === 'clock' && steps !== undefined && el.steps === undefined) {
      return { ...rest, steps } as Element;
    }
    return rest;
  };
  return mapSceneElements(scene, rewrite);
}

/**
 * A shallow copy of `obj` without `keys`. ⚠ Not `Object.fromEntries`: these migrations run INSIDE
 * the on-air page (`createRuntime` → `migrateScene`), and `Object.fromEntries` is Chromium 73 —
 * past the CasparCG CEF floor of 71 (`single-file-export`'s `cef-compat.test.ts` refuses it).
 */
function withoutKeys(obj: object, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) out[key] = (obj as Record<string, unknown>)[key];
  }
  return out;
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
