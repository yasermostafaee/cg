import type { Element as SceneElement, Layer, Scene, ZoneColor } from '@cg/shared-schema';

/**
 * D-141 — compile a scene's colour ZONES into one stylesheet.
 *
 * The mechanism is compiled CSS CUSTOM PROPERTIES, not plain rules. The natural
 * plain-rule form — `[data-cg-zone='danger'] [data-cg-zone-el='7'] { color: … }` —
 * cannot express nearest-wins on this engine: an element inside a nested zoned
 * composition matches BOTH its own root's rule and its host's, the two selectors
 * have IDENTICAL specificity (0,2,0), and the winner is therefore source order,
 * which has no relationship to DOM nesting. The features that fix that —
 * `@scope` (Chrome 118) and `:is()`/`:where()` specificity control (Chrome 88) —
 * are both far past the CasparCG CEF floor of Chromium 71 (and the exported page
 * targets 63 at the low end).
 *
 * Custom properties are Chrome 49 and they INHERIT, so a nearer declaration beats
 * a farther one BY CONSTRUCTION. Nearest-wins is spelled in the cascade instead of
 * in a selector. Three rule groups come out of this:
 *
 * 1. **RESET** — every scope root that owns a zoned countdown clears every slot in
 *    the scene. Without it a host's published value would inherit straight through
 *    a nested zoned root that happens not to publish that slot, and the nested
 *    countdown would silently fail to govern its own subtree. It also gives a
 *    zoned root with NO active zone (above the highest threshold, no `base`) the
 *    correct inert result rather than the host's colours. Emitted FIRST, so the
 *    equal-specificity publication rules below win on source order.
 * 2. **PUBLICATION** — a root currently in zone K declares K's palette.
 * 3. **CONSUMPTION** — each opted-in element reads its slot, falling back to its
 *    AUTHORED value, plus the transition that makes a boundary a morph not a cut.
 *
 * Compiled from the scene BY THE RUNTIME, so preview/export parity is structural:
 * the single-file export embeds the scene and boots this same code over it, and
 * neither exporter is taught about zones at all.
 */

/** The four colourable slots an element can override per zone. */
export type ZoneSlot = 'textColor' | 'backgroundColor' | 'fill' | 'stroke';

/** Custom-property suffix per slot — short, and never author-controlled. */
const SLOT_SUFFIX: Record<ZoneSlot, string> = {
  textColor: 'text',
  backgroundColor: 'bg',
  fill: 'fill',
  stroke: 'stroke',
};

/** One slot an element's KIND actually owns, and how it is written. */
export interface ZoneColorTarget {
  slot: ZoneSlot;
  /** The CSS property written — the SAME property the `color` binding writes. */
  property: string;
  /** Appended to the element's selector when the property lives on a child node. */
  selectorSuffix: string;
  /** The element's AUTHORED value for that property: the `var()` fallback. */
  fallback: string;
}

/** The compiled stylesheet plus anything that had to be dropped to produce it. */
export interface ZoneCssResult {
  /** The stylesheet text; empty when the scene has no zone styling to compile. */
  css: string;
  /** Build warnings — a dropped key or an invalid colour, never a thrown error. */
  warnings: string[];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/** Zone changes morph rather than cut — the 300–500 ms band the spec asks for. */
const ZONE_TRANSITION_MS = 400;

/**
 * D-141 helper 4 (design §1, §2.4) — the element kind → CSS property map. Shared
 * with D-139's colour effect so a rectangle recolours identically whichever
 * feature drove it; a slot a kind does not own is simply absent here, which makes
 * it INERT rather than an error (the stance `filter` already takes).
 *
 * Two deliberate narrowings against the design's summary table, both following
 * D-056 and the renderer as it actually is:
 *
 * - `ticker` / `clock` / `sequence` own ONLY `textColor`. D-056 removed their box
 *   styling and the scene-builder writes no background for them, so publishing a
 *   `background-color` would RESURRECT a box the renderer deliberately dropped.
 *   (design §2.3 states this for the clock in as many words: "the clock's own slot
 *   is `textColor`; a band is a separate shape layer with its own override".)
 * - A slot whose AUTHORED value is a GRADIENT is omitted. A flat zone colour
 *   cannot reach glyphs painted through `background-clip: text`, and using a flat
 *   fallback would destroy the authored gradient whenever no zone is active.
 */
export function zoneColorTargets(element: SceneElement): ZoneColorTarget[] {
  const out: ZoneColorTarget[] = [];
  const solidText = (): void => {
    const fill = 'colorFill' in element ? element.colorFill : undefined;
    if (fill !== undefined && fill.kind !== 'solid') return; // gradient glyphs — inert
    out.push({
      slot: 'textColor',
      property: 'color',
      selectorSuffix: '',
      fallback: fill?.color ?? ('color' in element ? element.color : 'inherit'),
    });
  };
  switch (element.type) {
    case 'text': {
      solidText();
      // The one box-styled text kind: the builder writes `backgroundColor` inline.
      if (element.backgroundFill === undefined) {
        out.push({
          slot: 'backgroundColor',
          property: 'background-color',
          selectorSuffix: '',
          fallback: element.backgroundColor ?? 'transparent',
        });
      }
      return out;
    }
    case 'ticker':
    case 'clock':
    case 'sequence':
      solidText();
      return out;
    case 'shape': {
      // `background` (the shorthand the `color` binding's `fill` property writes),
      // so a solid authored fill is replaced wholesale rather than hidden behind it.
      if (element.fill === undefined || element.fill.kind === 'solid') {
        out.push({
          slot: 'fill',
          property: 'background',
          selectorSuffix: '',
          fallback: element.fill?.color ?? 'transparent',
        });
      }
      out.push({
        slot: 'stroke',
        property: 'border-color',
        selectorSuffix: '',
        fallback: element.stroke?.color ?? 'transparent',
      });
      return out;
    }
    case 'path': {
      // The SVG paints, written on the `<path>` itself: the builder sets them as
      // PRESENTATION ATTRIBUTES, which a declaration on the element loses to, so
      // the rule has to reach the node that carries them.
      if (element.fill === undefined || element.fill.kind === 'solid') {
        out.push({
          slot: 'fill',
          property: 'fill',
          selectorSuffix: ' > svg > path',
          fallback: element.closed ? (element.fill?.color ?? 'none') : 'none',
        });
      }
      out.push({
        slot: 'stroke',
        property: 'stroke',
        selectorSuffix: ' > svg > path',
        fallback: element.stroke?.color ?? 'none',
      });
      return out;
    }
    default:
      // image / video / video-placeholder / lottie / composition / repeater /
      // container — a box tint only, authored as nothing, so inert until a zone
      // publishes it.
      out.push({
        slot: 'backgroundColor',
        property: 'background-color',
        selectorSuffix: '',
        fallback: 'transparent',
      });
      return out;
  }
}

/** Every authored element of one doc, containers flattened, in AUTHORED order. */
function collectDocElements(layers: readonly Layer[]): SceneElement[] {
  const out: SceneElement[] = [];
  const push = (el: SceneElement): void => {
    out.push(el);
    if (el.type === 'container') for (const child of el.children) push(child);
  };
  for (const layer of layers) for (const el of layer.children) push(el);
  return out;
}

/**
 * Every authored element in the scene: the root doc first, then each composition
 * in authored order. A composition is walked ONCE however many times it is
 * instanced — an authored element has ONE index, and its several DOM copies each
 * read the nearest publishing ancestor, which is exactly what makes nearest-wins
 * work per instance.
 *
 * Authored array order (not the builder's zIndex sort) so that restacking a layer
 * cannot renumber every slot in the stylesheet.
 */
function collectSceneElements(scene: Scene): SceneElement[] {
  const out = collectDocElements(scene.layers);
  for (const comp of scene.compositions ?? []) out.push(...collectDocElements(comp.layers));
  return out;
}

/** Whether a doc's own layers contain a countdown carrying zones. */
export function hasZonedCountdown(layers: readonly Layer[]): boolean {
  return collectDocElements(layers).some(
    (el) => el.type === 'clock' && el.mode === 'countdown' && el.zones !== undefined,
  );
}

/** The slots an element both OWNS and actually overrides somewhere. */
function usedTargets(element: SceneElement): ZoneColorTarget[] {
  const overrides = element.zoneOverrides;
  if (overrides === undefined || overrides.length === 0) return [];
  return zoneColorTargets(element).filter((t) => overrides.some((o) => o[t.slot] !== undefined));
}

/**
 * The deterministic per-scene INDEX of every opted-in element, keyed by element id.
 *
 * Slots are keyed by this index and NEVER by the element id: `IdSchema` is an
 * arbitrary non-empty string with no guarantee of being a CSS identifier or of
 * surviving quoting inside an attribute selector, so no author-controlled string
 * ever reaches a selector or a property NAME.
 */
const indexCache = new WeakMap<Scene, ReadonlyMap<string, number>>();

export function assignZoneIndices(scene: Scene): ReadonlyMap<string, number> {
  // Cached per scene OBJECT: the scene-builder asks once per built layer, and a
  // repeater stamps a fresh subtree per row — all of which must agree on the
  // numbering the stylesheet was compiled with.
  const cached = indexCache.get(scene);
  if (cached !== undefined) return cached;
  const map = new Map<string, number>();
  for (const el of collectSceneElements(scene)) {
    if (map.has(el.id)) continue;
    if (usedTargets(el).length === 0) continue;
    map.set(el.id, map.size);
  }
  indexCache.set(scene, map);
  return map;
}

/**
 * Escape a zone key for use inside a CSS string (an attribute-selector value).
 * Returns `null` for a key that cannot be safely escaped — a control character or
 * a line terminator — so the caller can DROP it with a warning rather than emit a
 * malformed stylesheet. (The driver writes keys through `setAttribute`, which
 * never parses, so a dropped key is inert, not broken.)
 */
function escapeCssString(value: string): string | null {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return null;
    if (ch === '\\' || ch === "'") out += `\\${ch}`;
    else out += ch;
  }
  return out;
}

/** The zone key → colour palette, gathered from every zoned countdown in the scene. */
function collectPalette(scene: Scene, warnings: string[]): Map<string, string> {
  const palette = new Map<string, string>();
  for (const el of collectSceneElements(scene)) {
    if (el.type !== 'clock' || el.mode !== 'countdown' || el.zones === undefined) continue;
    const zones = el.zones;
    const entries = zones.base === undefined ? zones.steps : [zones.base, ...zones.steps];
    for (const entry of entries) {
      const existing = palette.get(entry.key);
      if (existing === undefined) {
        palette.set(entry.key, entry.color);
      } else if (existing !== entry.color) {
        // One key, one compiled palette entry. Two countdowns spelling the same key
        // with different colours cannot both be honoured by a stylesheet keyed on
        // the key alone, so the first authored definition wins and the clash is
        // reported rather than silently resolved.
        warnings.push(
          `zone key '${entry.key}' is defined with two colours (${existing} and ${entry.color}); using ${existing}`,
        );
      }
    }
  }
  return palette;
}

/** Resolve one override slot value to a validated colour, or `null` to skip it. */
function resolveSlotColor(
  value: ZoneColor,
  zoneKey: string,
  palette: ReadonlyMap<string, string>,
  warnings: string[],
): string | null {
  // `'zone'` takes the zone's own colour. A key NO countdown defines publishes
  // nothing at all — the override is INERT and the element renders authored, which
  // is the runtime half of the free-form-key contract (the Designer warns instead).
  const resolved = value === 'zone' ? palette.get(zoneKey) : value;
  if (resolved === undefined) return null;
  if (!HEX_COLOR.test(resolved)) {
    warnings.push(`dropped a non-hex colour '${resolved}' for zone '${zoneKey}'`);
    return null;
  }
  return resolved;
}

/**
 * Compile the scene's zone styling. Pure: the same scene always yields the same
 * text, which is what makes preview and single-file export byte-identical.
 * Returns an EMPTY stylesheet when no element opted in.
 */
export function compileZoneCss(scene: Scene): ZoneCssResult {
  const warnings: string[] = [];
  const indices = assignZoneIndices(scene);
  if (indices.size === 0) return { css: '', warnings };

  const palette = collectPalette(scene, warnings);
  const dropped = new Set<string>();

  /** Every `--cgz-N-slot` name in the scene — the reset rule's whole job. */
  const allVars: string[] = [];
  const consumption: string[] = [];
  /** zone key → its published declarations, in first-authored key order. */
  const byKey = new Map<string, string[]>();

  const seen = new Set<string>();
  for (const el of collectSceneElements(scene)) {
    const index = indices.get(el.id);
    if (index === undefined || seen.has(el.id)) continue;
    seen.add(el.id);

    for (const target of usedTargets(el)) {
      const name = `--cgz-${String(index)}-${SLOT_SUFFIX[target.slot]}`;
      allVars.push(name);
      consumption.push(
        `[data-cg-zone-el='${String(index)}']${target.selectorSuffix}{${target.property}:var(${name},${target.fallback}) !important}`,
      );
      for (const override of el.zoneOverrides ?? []) {
        const value = override[target.slot];
        if (value === undefined) continue;
        const escaped = escapeCssString(override.zone);
        if (escaped === null) {
          if (!dropped.has(override.zone)) {
            dropped.add(override.zone);
            warnings.push(
              'dropped a zone key containing a control character — it cannot be escaped into a selector',
            );
          }
          continue;
        }
        const color = resolveSlotColor(value, override.zone, palette, warnings);
        if (color === null) continue;
        let decls = byKey.get(escaped);
        if (decls === undefined) {
          decls = [];
          byKey.set(escaped, decls);
        }
        decls.push(`${name}:${color}`);
      }
    }
  }

  if (consumption.length === 0) return { css: '', warnings };

  const lines: string[] = [];
  lines.push('/* D-141 zone styling — compiled from the scene by @cg/template-runtime. */');
  // 1. RESET. Equal specificity with the publication rules below, so it MUST come
  //    first: a root in zone K reads reset-then-publish and keeps K's values.
  lines.push(`[data-cg-zone-root]{${allVars.map((v) => `${v}:initial`).join(';')}}`);
  // 2. PUBLICATION, one rule per zone key.
  for (const [key, decls] of byKey) lines.push(`[data-cg-zone='${key}']{${decls.join(';')}}`);
  // 3. CONSUMPTION + the morph.
  for (const rule of consumption) lines.push(rule);
  const props = ['color', 'background', 'border-color', 'fill', 'stroke'];
  lines.push(
    `[data-cg-zone-el]{transition:${props.map((p) => `${p} ${String(ZONE_TRANSITION_MS)}ms ease`).join(',')}}`,
  );

  return { css: `${lines.join('\n')}\n`, warnings };
}

/**
 * Inject the compiled zone stylesheet as `<style id="cg-zones">`, beside the
 * baseline block and by the same idempotent mechanism. Re-injecting the same scene
 * is a no-op; a scene with nothing to compile injects nothing at all.
 */
export function ensureZoneCss(scene: Scene, doc: Document = document): ZoneCssResult {
  const result = compileZoneCss(scene);
  const existing = doc.getElementById('cg-zones');
  if (result.css === '') {
    existing?.remove();
    return result;
  }
  if (existing !== null) {
    if (existing.textContent !== result.css) existing.textContent = result.css;
    return result;
  }
  const style = doc.createElement('style');
  style.id = 'cg-zones';
  style.textContent = result.css;
  doc.head.appendChild(style);
  return result;
}
