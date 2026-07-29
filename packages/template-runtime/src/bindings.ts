import type {
  DynamicField,
  FieldBinding,
  FieldValues,
  NestedFieldValues,
  Scene,
} from '@cg/shared-schema';
import type { FieldScope } from './types.js';
import { coerceRepeaterItems, repeaterDriverFor } from './repeater-driver.js';
import { coerceSequenceItems, sequenceDriverFor } from './sequence-driver.js';
import { textRenderNode } from './text-render-node.js';
import { coerceTickerItems, tickerDriverFor } from './ticker-driver.js';
import { lottiePlayerFor } from './lottie-registry.js';
import { applyTransform, stringifyValue } from './transforms.js';

/**
 * Apply a snapshot of field values to the live DOM by walking the scene's
 * declared bindings. Idempotent and stateless — call it once at scene
 * build, again on every `runtime.update()`.
 */
export function applyFieldValues(
  scene: Scene,
  values: FieldValues,
  elementMap: ReadonlyMap<string, HTMLElement>,
  textOriginals: ReadonlyMap<string, string>,
  container: HTMLElement,
): void {
  // Build a quick field-defaults lookup so missing values fall back cleanly,
  // plus per-field `maxLength` caps for text fields.
  const defaults = new Map<string, unknown>();
  const maxLengths = new Map<string, number>();
  for (const field of scene.fields) {
    defaults.set(field.id, 'default' in field ? field.default : undefined);
    if (field.type === 'text' && field.maxLength !== undefined) {
      maxLengths.set(field.id, field.maxLength);
    }
  }

  for (const binding of scene.bindings) {
    const raw = binding.fieldId in values ? values[binding.fieldId] : defaults.get(binding.fieldId);
    if (raw === undefined) continue;
    applyOne(binding, raw, elementMap, textOriginals, container, maxLengths.get(binding.fieldId));
  }
}

/** A doc that owns fields + bindings: the root scene or a composition. */
export interface FieldDocLite {
  fields?: readonly DynamicField[] | undefined;
  bindings?: readonly FieldBinding[] | undefined;
}

/**
 * D-025 — apply a NESTED field-value object across the scope tree. The root doc's
 * own bindings apply to the root scope; each nested instance's namespace
 * (`values[instanceName]`) is applied to that instance's child scope, recursively.
 * This routes the same child instanced twice (e.g. `home`/`away`) to the correct
 * DOM copy. A scene with no nested instances behaves exactly like the flat
 * {@link applyFieldValues}.
 */
export function applyScopedFieldValues(
  scene: Scene,
  rootDoc: FieldDocLite,
  values: NestedFieldValues,
  scope: FieldScope,
): void {
  applyDocScope(scene, rootDoc, values, scope);
}

function applyDocScope(
  scene: Scene,
  doc: FieldDocLite,
  values: NestedFieldValues,
  scope: FieldScope,
): void {
  const defaults = new Map<string, unknown>();
  const maxLengths = new Map<string, number>();
  for (const field of doc.fields ?? []) {
    defaults.set(field.id, 'default' in field ? field.default : undefined);
    if (field.type === 'text' && field.maxLength !== undefined) {
      maxLengths.set(field.id, field.maxLength);
    }
  }
  for (const binding of doc.bindings ?? []) {
    const raw = binding.fieldId in values ? values[binding.fieldId] : defaults.get(binding.fieldId);
    if (raw === undefined) continue;
    applyOne(
      binding,
      raw,
      scope.elementMap,
      scope.textOriginals,
      scope.container,
      maxLengths.get(binding.fieldId),
    );
  }
  for (const child of scope.children) {
    const childDoc = scene.compositions?.find((c) => c.id === child.compositionId);
    if (childDoc === undefined) continue;
    const sub = values[child.name];
    const subVals: NestedFieldValues = isNamespace(sub) ? sub : {};
    applyDocScope(scene, childDoc, subVals, child.scope);
  }
}

/**
 * A namespace sub-object (not a scalar field value, not an image `{assetId}`).
 * Exported since D-141: the clock-target re-apply walks the SAME namespace tree
 * and must decide "is this a child's namespace?" exactly the way this walk does —
 * a second local copy is how the two would come to disagree.
 */
export function isNamespace(v: unknown): v is NestedFieldValues {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !('assetId' in v);
}

function applyOne(
  binding: FieldBinding,
  raw: unknown,
  elementMap: ReadonlyMap<string, HTMLElement>,
  textOriginals: ReadonlyMap<string, string>,
  container: HTMLElement,
  maxLength?: number,
): void {
  const target = binding.target;
  switch (target.kind) {
    case 'text': {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      let stringValue = applyTransform(stringifyValue(raw), binding.transform);
      // Cap to the field's maxLength by code point (so a surrogate pair or a
      // ZWNJ counts as one and isn't split); the element's own auto-size /
      // auto-squeeze then handles fit.
      if (maxLength !== undefined && [...stringValue].length > maxLength) {
        stringValue = [...stringValue].slice(0, maxLength).join('');
      }
      const original = textOriginals.get(target.elementId);
      // B-016/B-017 — write the glyph node: the dedicated inner node for gradient
      // text, else the host (solid). Resolved fresh so a solid↔gradient switch follows.
      const glyph = textRenderNode(el);
      if (target.placeholder && original !== undefined) {
        // B-066 — CEF-safe literal replace-all: CasparCG's CEF (baseline
        // Chromium 71) has no String.prototype.replaceAll (Chromium 85+) and
        // the call ABORTED the template at boot on air. split/join replaces
        // every occurrence, keeps regex metacharacters in the placeholder
        // inert, and never expands `$`-patterns in the VALUE (replaceAll
        // would — an operator's literal "$&" must render exactly as typed).
        glyph.textContent = original.split(target.placeholder).join(stringValue);
      } else {
        glyph.textContent = stringValue;
      }
      return;
    }
    case 'image': {
      const el = elementMap.get(target.elementId);
      if (!(el instanceof HTMLImageElement)) return;
      const assetId = stringifyValue(raw);
      el.dataset['cgAssetId'] = assetId;
      // Caller resolves assetId → URL. For M3.2-α we set src directly to
      // the assetId; the export pipeline will rewrite to `assets/img/...`
      // paths once asset resolution is wired.
      el.src = assetId;
      return;
    }
    case 'color': {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      const stringValue = applyTransform(stringifyValue(raw), binding.transform);
      switch (target.property) {
        case 'fill':
          el.style.background = stringValue;
          return;
        case 'stroke':
          el.style.borderColor = stringValue;
          return;
        case 'text':
          // The glyph node (inner gradient node when gradient, else the host).
          textRenderNode(el).style.color = stringValue;
          return;
      }
      return;
    }
    case 'visible': {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      const shouldShow = Boolean(raw);
      el.style.display = shouldShow ? '' : 'none';
      return;
    }
    case 'transform': {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(num)) return;
      switch (target.property) {
        case 'opacity':
          el.style.opacity = String(num);
          return;
        case 'x':
          el.style.left = `${num}px`;
          return;
        case 'y':
          el.style.top = `${num}px`;
          return;
        case 'scale':
        case 'rotation':
          // Composes with the baseline transform — for M3.2-α we set a
          // single CSS transform that overrides the baseline. M3.2-β
          // will multiply against the element's declared transform.
          el.style.transform = target.property === 'scale' ? `scale(${num})` : `rotate(${num}deg)`;
          return;
      }
      return;
    }
    case 'scene-background': {
      container.style.background = stringifyValue(raw);
      return;
    }
    case 'lottie-override': {
      // D-125 Phase 3c — no longer a no-op. Route the value to the MOUNTED player's
      // override seam: `prop: 'text'` replaces a named text layer's document text
      // (lottie-web's own dynamic-text API), `prop: 'fill' | 'stroke'` recolours the
      // named layer's static authored fill/stroke. Applied on play and on every
      // update() like every other binding (this walk IS both paths), live and
      // in place (D-106) — the playhead VALUE never moves, so an override landing
      // mid-intro/hold/outro cannot retarget a leg or strand an exit (a text apply
      // repaints the current frame once, which is what makes a mid-HOLD retitle
      // visible while the driver is frozen). The text transform pipeline + the
      // field's maxLength cap apply exactly like the `text` binding; colours skip
      // both. A missing player (asset unresolved, destroyed) or a missing layer is
      // a graceful no-op — the next update() re-applies.
      const el = elementMap.get(target.elementId);
      if (!el) return;
      const player = lottiePlayerFor(el);
      if (player === undefined) return;
      if (target.prop === 'text') {
        let text = applyTransform(stringifyValue(raw), binding.transform);
        // Same code-point cap as the `text` target — the SAME field must behave the
        // same whether it lands on a native text element or a Lottie text layer.
        if (maxLength !== undefined && [...text].length > maxLength) {
          text = [...text].slice(0, maxLength).join('');
        }
        player.applyOverride(target.layer, 'text', text);
      } else {
        // Colours deliberately SKIP the text-transform pipeline: a digits/date
        // transform on a colour binding would corrupt the SVG paint value
        // ('#ff0000' with persian-digits is not a colour).
        player.applyOverride(target.layer, target.prop, stringifyValue(raw));
      }
      return;
    }
    case 'ticker-items': {
      // D-028 — route a list value to the band's treadmill driver, which
      // reconciles by stable id (visible items keep position; removed items
      // scroll out and are never re-fed; new items enter on the next feed).
      // Bare string arrays get positional ids (degraded fallback).
      const el = elementMap.get(target.elementId);
      if (!el || !Array.isArray(raw)) return;
      tickerDriverFor(el)?.setItems(coerceTickerItems(raw));
      return;
    }
    case 'sequence-items': {
      // D-029 — route a list value to the sequence driver, which reconciles
      // by stable id (the CURRENT item is never yanked mid-display; a text
      // edit corrects in place; a removal takes effect at the next advance;
      // per-item dwellMs comes from the list value). Structured value — no
      // stringify/transform, same as ticker-items.
      const el = elementMap.get(target.elementId);
      if (!el || !Array.isArray(raw)) return;
      sequenceDriverFor(el)?.setItems(coerceSequenceItems(raw));
      return;
    }
    case 'sequence-item-text': {
      // D-083 follow-up — a single sequence TEXT item's value is NOT applied via this
      // DOM walk: the item's span is built by the SequenceDriver (not in `elementMap`).
      // It flows through the driver's `textValueFor` seam (see runtime.ts), keyed to this
      // explicit binding, so the value reaches the live item on play + every update().
      return;
    }
    case 'clock-target': {
      // D-141 — a countdown's target is NOT applied via this DOM walk: there is no
      // node to write, only a driver to re-aim, and a re-target must re-pin the
      // deadline and re-arm completion rather than set a property. It flows through
      // the ClockDriver's own `retarget()` seam (see `reapplyClockTargets` in
      // runtime.ts), keyed to this explicit binding, so the value reaches the live
      // countdown on play() AND on every update(). Same routing as
      // `sequence-item-text` above.
      return;
    }
    case 'repeater-items': {
      // D-030 — route a list value to the repeater driver: positional live
      // VALUES into the stamped rows mid-run (shorter hides surplus rows,
      // regrowth re-shows, longer defers to the next fresh play, which
      // re-stamps the COUNT from this same effective value). Structured —
      // no stringify/transform.
      const el = elementMap.get(target.elementId);
      if (!el || !Array.isArray(raw)) return;
      repeaterDriverFor(el)?.setItems(coerceRepeaterItems(raw));
      return;
    }
  }
}
