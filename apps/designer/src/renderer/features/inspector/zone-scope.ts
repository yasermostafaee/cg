import type { ClockZones, Element, Layer, Scene, ZoneOverride } from '@cg/shared-schema';

/**
 * `D-141` (`add-azan-countdown` design §6, §7) — what the Designer's zone controls read: the four
 * canonical keys, the 60 / 30 / 10 preset, which zone keys reach the composition being edited, and
 * which override keys reach none of them.
 *
 * Pure reads over the scene — no store, no React — so every rule here is unit-testable. The RUNTIME
 * is unchanged by all of it: an unmatched key stays inert on air (design §5.5); these reads only
 * make the Designer say so while it is cheap to fix (§7.3).
 */

/**
 * §6 (owner-closed) — the picker's four keys, in severity order. They are ALSO the preset's keys,
 * so the preset and the picker agree by construction rather than by two lists kept in sync.
 */
export const ZONE_KEYS = ['normal', 'caution', 'warning', 'critical'] as const;
export type CanonicalZoneKey = (typeof ZONE_KEYS)[number];

export function isCanonicalZoneKey(key: string): key is CanonicalZoneKey {
  return (ZONE_KEYS as readonly string[]).includes(key);
}

/** §2.2 / §7.1 — the 4-zone Azan preset: base green, then 60 min amber, 30 min orange, 10 min red. */
export const AZAN_PRESET: ClockZones = {
  base: { key: 'normal', color: '#00c853' },
  steps: [
    { atOrBelowMs: 60 * 60_000, key: 'caution', color: '#ffd600' },
    { atOrBelowMs: 30 * 60_000, key: 'warning', color: '#ff9100' },
    { atOrBelowMs: 10 * 60_000, key: 'critical', color: '#d50000' },
  ],
};

/**
 * §7.1 — the overrides the preset gives the clock itself: its text takes each zone's colour. Any
 * override the clock already has for another key is kept; one for a preset key is replaced.
 */
export function presetClockOverrides(
  existing: readonly ZoneOverride[] | undefined,
): ZoneOverride[] {
  const keep = (existing ?? []).filter((o) => !isCanonicalZoneKey(o.zone));
  return [...keep, ...ZONE_KEYS.map((zone) => ({ zone, textColor: 'zone' as const }))];
}

/** Every element of one doc's layers, containers flattened, in authored order. */
function docElements(layers: readonly Layer[]): Element[] {
  const out: Element[] = [];
  const push = (el: Element): void => {
    out.push(el);
    if (el.type === 'container') for (const child of el.children) push(child);
  };
  for (const layer of layers) for (const el of layer.children) push(el);
  return out;
}

/** The keys of a zoned countdown, base first, in authored order. */
export function zoneKeysOf(zones: ClockZones): string[] {
  return [...(zones.base === undefined ? [] : [zones.base.key]), ...zones.steps.map((s) => s.key)];
}

/** The keys every zoned countdown in these layers defines (unique, authored order). */
function countdownKeys(layers: readonly Layer[]): string[] {
  const keys: string[] = [];
  for (const el of docElements(layers)) {
    if (el.type !== 'clock' || el.mode !== 'countdown' || el.zones === undefined) continue;
    for (const key of zoneKeysOf(el.zones)) if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** `null` is the root scene; anything else a composition id. */
type DocId = string | null;

function layersOf(scene: Scene, doc: DocId): readonly Layer[] {
  if (doc === null) return scene.layers;
  return scene.compositions?.find((c) => c.id === doc)?.layers ?? [];
}

/** The compositions a doc INSTANCES directly (composition elements in its own layers). */
function instancedIn(scene: Scene, doc: DocId): string[] {
  return docElements(layersOf(scene, doc)).flatMap((el) =>
    el.type === 'composition' ? [el.compositionId] : [],
  );
}

/** Every doc (root included) from which `target` is reachable through instances. */
function ancestorsOf(scene: Scene, target: string): DocId[] {
  const docs: DocId[] = [null, ...(scene.compositions ?? []).map((c) => c.id)];
  const reaches = (from: DocId, seen: Set<string>): boolean =>
    instancedIn(scene, from).some((id) => {
      if (id === target) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return reaches(id, seen);
    });
  return docs.filter((doc) => doc !== target && reaches(doc, new Set()));
}

/**
 * §7.2 — the zone keys that can reach the composition being edited: those of a zoned countdown in
 * it, and those of every composition (or the root) that instances it, directly or through others.
 * Empty ⇒ no zoned countdown encloses it, and the override section is not shown (an override there
 * could only be inert — a supported state, not a mistake; §7.3).
 */
export function enclosingZoneKeys(scene: Scene, activeCompositionId: string | null): string[] {
  const keys = countdownKeys(layersOf(scene, activeCompositionId));
  if (activeCompositionId !== null) {
    for (const doc of ancestorsOf(scene, activeCompositionId)) {
      for (const key of countdownKeys(layersOf(scene, doc)))
        if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/**
 * §7.2 — each enclosing zone key's own colour (the nearest definition first), for the swatch that
 * shows what an override set to `'zone'` resolves to.
 */
export function enclosingZonePalette(
  scene: Scene,
  activeCompositionId: string | null,
): Map<string, string> {
  const docs: DocId[] = [
    activeCompositionId,
    ...(activeCompositionId === null ? [] : ancestorsOf(scene, activeCompositionId)),
  ];
  const palette = new Map<string, string>();
  for (const doc of docs) {
    for (const el of docElements(layersOf(scene, doc))) {
      if (el.type !== 'clock' || el.mode !== 'countdown' || el.zones === undefined) continue;
      const zones = [...(el.zones.base === undefined ? [] : [el.zones.base]), ...el.zones.steps];
      for (const z of zones) if (!palette.has(z.key)) palette.set(z.key, z.color);
    }
  }
  return palette;
}

/** Every zone key some zoned countdown ANYWHERE in the scene defines. */
export function definedZoneKeys(scene: Scene): Set<string> {
  const docs: DocId[] = [null, ...(scene.compositions ?? []).map((c) => c.id)];
  return new Set(docs.flatMap((doc) => countdownKeys(layersOf(scene, doc))));
}

/**
 * §7.3 — PER KEY: each of an element's override keys that no enclosing countdown defines. `{warning,
 * dangre}` under `{warning, danger}` answers `['dangre']` — the case an empty-intersection check
 * misses. With no enclosing countdown at all it answers nothing: nothing is there to miss.
 */
export function unmatchedZoneKeys(
  element: Pick<Element, 'zoneOverrides'>,
  enclosing: readonly string[],
): string[] {
  if (enclosing.length === 0) return [];
  return (element.zoneOverrides ?? []).map((o) => o.zone).filter((k) => !enclosing.includes(k));
}

/**
 * §7.3 (the zones editor's half) — the override keys used INSIDE the reach of the composition being
 * edited (its own elements and those of every composition it instances, transitively), with how
 * many elements use each. The zones editor names the ones its countdowns do not define, so a RENAME
 * shows the overrides it orphaned at the moment it is made.
 */
export function overrideKeyUses(
  scene: Scene,
  activeCompositionId: string | null,
): Map<string, number> {
  const uses = new Map<string, number>();
  const seen = new Set<string>();
  const visit = (doc: DocId): void => {
    for (const el of docElements(layersOf(scene, doc))) {
      for (const key of new Set((el.zoneOverrides ?? []).map((o) => o.zone))) {
        uses.set(key, (uses.get(key) ?? 0) + 1);
      }
    }
    for (const id of instancedIn(scene, doc)) {
      if (seen.has(id)) continue;
      seen.add(id);
      visit(id);
    }
  };
  visit(activeCompositionId);
  return uses;
}
