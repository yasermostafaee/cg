import {
  colorPropertiesOf,
  transitionMs,
  type ColorChangeProperty,
  type CountdownSteps,
  type ElementChange,
  type Element as SceneElement,
  type Layer,
  type Scene,
} from '@cg/shared-schema';
import type { RenderMode } from './types.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-A` (D-141 v2) — **A COUNTDOWN'S STEPS, COMPILED INTO ONE STYLESHEET.**
 *
 * A step is "when this much or less remains, change these elements". The countdown's driver
 * publishes WHICH step is active as one attribute on its composition's SCOPE ROOT
 * (`data-cg-cd<c>="<step>"`); everything a step changes on screen is then the cascade's job, so one
 * attribute write restyles any number of elements and the per-second repaint discipline is untouched.
 *
 * The mechanism is the one D-141's colour zones proved on the CasparCG CEF floor (Chromium 71):
 * compiled CSS CUSTOM PROPERTIES, which INHERIT, so a nearer declaration beats a farther one by
 * construction. Three rule groups:
 *
 * 1. **RESET** — every scope root that owns a countdown with steps clears every step variable, so a
 *    nested composition with its own countdown is governed by ITS countdown (nearest wins) and a host
 *    step never leaks into it.
 * 2. **PUBLICATION** — a root whose countdown `c` is in step `s` declares that step's values and its
 *    transition time.
 * 3. **CONSUMPTION** — each changed element reads its variables, falling back to its authored value.
 *
 * How each property reaches the screen, chosen so a step COMPOSES with everything else that writes
 * an element rather than fighting it:
 *
 * - **colours** — the element's own colour property, `!important`, exactly as the zones did (the
 *   SAME property the `color` binding writes, so a rectangle recolours identically either way);
 * - **show / hide, opacity, blink** — a layout-transparent WRAPPER the builder puts around only the
 *   elements that need one (`data-cg-step-wrap`). Its `opacity` MULTIPLIES the element's own,
 *   animated one, so an intro or exit fade still runs on top of a step; nothing else writes the
 *   wrapper, so it needs no `!important`. Blink is a `visibility` keyframe on the wrapper;
 * - **a picture** and **a composition instance shown or hidden** are applied by the runtime on the
 *   step change (`step-effects.ts`) — a picture is an attribute, an instance plays its own entrance
 *   and exit (`DELTA-RUN-NEXT-VERSION-01-F`).
 *
 * Compiled from the scene BY THE RUNTIME, so the preview and both exports carry byte-identical rules
 * by construction: neither exporter has a step code path. No author-controlled string reaches a
 * selector or a property name — elements and countdowns are keyed by deterministic indices.
 */

/** The four colour properties and the CSS each one writes on an element's kind. */
export interface ColorChangeTarget {
  property: ColorChangeProperty;
  /** The CSS property written — the SAME property the `color` binding writes. */
  css: string;
  /** Appended to the element's selector when the property lives on a child node. */
  selectorSuffix: string;
  /** The element's AUTHORED value for that property: the `var()` fallback. */
  fallback: string;
}

/** Custom-property suffix per colour property — short, and never author-controlled. */
const COLOR_SUFFIX: Record<ColorChangeProperty, string> = {
  textColor: 'text',
  backgroundColor: 'bg',
  fill: 'fill',
  stroke: 'stroke',
};

/**
 * The colour properties an element's kind owns (`@cg/shared-schema`'s {@link colorPropertiesOf} —
 * one answer for the Designer, the migration and this compiler) with the CSS each one writes.
 *
 * - `ticker` / `clock` / `sequence` write only `color`: D-056 removed their box styling, so a
 *   `background-color` would resurrect a box the renderer deliberately dropped.
 * - A shape's fill is the `background` shorthand the `color` binding's `fill` writes, so a solid
 *   authored fill is replaced wholesale rather than hidden behind it.
 * - A path's paints are PRESENTATION ATTRIBUTES on its `<path>`, which a declaration on the element
 *   loses to, so its rule reaches that node.
 */
export function colorChangeTargets(element: SceneElement): ColorChangeTarget[] {
  const owned = colorPropertiesOf(element);
  const out: ColorChangeTarget[] = [];
  /** A SOLID fill's colour — the only kind a flat step colour replaces (gradients are not owned). */
  const solid = (fill: { kind: string; color?: string } | undefined): string | undefined =>
    fill?.kind === 'solid' ? fill.color : undefined;
  const glyphs = (): string => {
    const fill = 'colorFill' in element ? element.colorFill : undefined;
    return solid(fill) ?? ('color' in element ? element.color : 'inherit');
  };
  for (const property of owned) {
    if (property === 'textColor') {
      out.push({ property, css: 'color', selectorSuffix: '', fallback: glyphs() });
    } else if (property === 'backgroundColor') {
      out.push({
        property,
        css: 'background-color',
        selectorSuffix: '',
        fallback:
          element.type === 'text' ? (element.backgroundColor ?? 'transparent') : 'transparent',
      });
    } else if (element.type === 'path') {
      out.push({
        property,
        css: property === 'fill' ? 'fill' : 'stroke',
        selectorSuffix: ' > svg > path',
        fallback:
          property === 'fill'
            ? element.closed
              ? (solid(element.fill) ?? 'none')
              : 'none'
            : (element.stroke?.color ?? 'none'),
      });
    } else if (element.type === 'shape') {
      out.push({
        property,
        css: property === 'fill' ? 'background' : 'border-color',
        selectorSuffix: '',
        fallback:
          property === 'fill'
            ? (solid(element.fill) ?? 'transparent')
            : (element.stroke?.color ?? 'transparent'),
      });
    }
  }
  return out;
}

/** The marker on a scope root that owns a countdown with steps — the RESET rule keys off it. */
export const STEP_ROOT_DATASET = 'cgStepRoot';
/** The marker on a changed element: its per-scene index. */
export const STEP_EL_DATASET = 'cgStepEl';
/** The marker on a changed element's wrapper: the same index. */
export const STEP_WRAP_DATASET = 'cgStepWrap';

/** The attribute countdown `c` publishes its active step on, on its scope root. */
export function stepAttribute(countdownIndex: number): string {
  return `data-cg-cd${String(countdownIndex)}`;
}

/** Which step is active: `before`, a step's index, or none (`null`). */
export type StepToken = 'before' | number;

/** The attribute value a token publishes as. */
export function stepTokenValue(token: StepToken): string {
  return token === 'before' ? 'b' : String(token);
}

/**
 * The REMAINING time as the digits show it, in ms, SIGNED: `ceil` above zero (the display shows the
 * full second it is inside), and the whole seconds PAST zero below it. A step is compared on this, so
 * it is entered on exactly the frame the display reaches its threshold — never up to a second early
 * — and a step "1 min after zero" is entered as the display reaches `−01:00`.
 */
export function displayedRemainingMs(remainingMs: number): number {
  if (remainingMs > 0) return Math.ceil(remainingMs / 1000) * 1000;
  const past = Math.floor(-remainingMs / 1000) * 1000;
  return past === 0 ? 0 : -past;
}

/**
 * The step active at `remainingMs`: the TIGHTEST covering threshold (the last step whose `atMs` is at
 * or above the displayed remaining time — thresholds nest, and over a strictly decreasing list the
 * last match is the tightest), else `before` when the countdown has one, else none.
 */
export function pickStep(steps: CountdownSteps, remainingMs: number): StepToken | null {
  const shown = displayedRemainingMs(remainingMs);
  let picked: number | null = null;
  steps.steps.forEach((step, i) => {
    if (step.atMs >= shown) picked = i;
  });
  if (picked !== null) return picked;
  return steps.before !== undefined ? 'before' : null;
}

/** The changes a token stands for. */
export function changesOf(
  steps: CountdownSteps,
  token: StepToken | null,
): readonly ElementChange[] {
  if (token === null) return [];
  if (token === 'before') return steps.before?.changes ?? [];
  return steps.steps[token]?.changes ?? [];
}

/** Every authored element of one doc's layers, containers flattened, in AUTHORED order. */
function docElements(layers: readonly Layer[]): SceneElement[] {
  const out: SceneElement[] = [];
  const push = (el: SceneElement): void => {
    out.push(el);
    if (el.type === 'container') for (const child of el.children) push(child);
  };
  for (const layer of layers) for (const el of layer.children) push(el);
  return out;
}

/** Every authored element in the scene: the root doc first, then each composition once. */
function sceneElements(scene: Scene): SceneElement[] {
  const out = docElements(scene.layers);
  for (const comp of scene.compositions ?? []) out.push(...docElements(comp.layers));
  return out;
}

const hasSteps = (el: SceneElement): boolean =>
  el.type === 'clock' && el.mode === 'countdown' && el.steps !== undefined;

/** Whether a doc's own layers hold a countdown with steps — its scope root is then a STEP ROOT. */
export function hasStepCountdown(layers: readonly Layer[]): boolean {
  return docElements(layers).some(hasSteps);
}

/** What the scene's steps need of the builder and the runtime, computed once per scene object. */
export interface StepPlan {
  /** Countdown clock id → its index `c` (its `data-cg-cd<c>` attribute). */
  countdowns: ReadonlyMap<string, number>;
  /** Changed element id → its index `n` (`data-cg-step-el` / `data-cg-step-wrap`). */
  elements: ReadonlyMap<string, number>;
  /** Elements that need a WRAPPER — shown / hidden, opacity, or blink, by some step. */
  wrapped: ReadonlySet<string>;
  /**
   * Elements authored HIDDEN that some step SHOWS. They are built as visible elements held
   * transparent until their step, so their own content (a crawl) is already running when it
   * appears. A composition instance is not among them: it is shown by its own entrance (`-F`).
   */
  shown: ReadonlySet<string>;
  /** Element id → the authored element (first occurrence). */
  byId: ReadonlyMap<string, SceneElement>;
}

const planCache = new WeakMap<Scene, StepPlan>();

/** Every countdown with steps, in authored order, with its steps. */
function countdownsOf(scene: Scene): { id: string; steps: CountdownSteps }[] {
  const out: { id: string; steps: CountdownSteps }[] = [];
  const seen = new Set<string>();
  for (const el of sceneElements(scene)) {
    if (el.type !== 'clock' || el.mode !== 'countdown' || el.steps === undefined) continue;
    if (seen.has(el.id)) continue;
    seen.add(el.id);
    out.push({ id: el.id, steps: el.steps });
  }
  return out;
}

/** Every change set of a countdown, with its token. */
function setsOf(steps: CountdownSteps): { token: StepToken; changes: readonly ElementChange[] }[] {
  const out: { token: StepToken; changes: readonly ElementChange[] }[] = [];
  if (steps.before !== undefined) out.push({ token: 'before', changes: steps.before.changes });
  steps.steps.forEach((step, i) => out.push({ token: i, changes: step.changes }));
  return out;
}

export function stepPlanOf(scene: Scene): StepPlan {
  const cached = planCache.get(scene);
  if (cached !== undefined) return cached;
  const byId = new Map<string, SceneElement>();
  for (const el of sceneElements(scene)) if (!byId.has(el.id)) byId.set(el.id, el);
  const countdowns = new Map<string, number>();
  const elements = new Map<string, number>();
  const wrapped = new Set<string>();
  const shown = new Set<string>();
  for (const cd of countdownsOf(scene)) {
    countdowns.set(cd.id, countdowns.size);
    for (const set of setsOf(cd.steps)) {
      for (const change of set.changes) {
        const el = byId.get(change.elementId);
        if (el === undefined) continue; // a change naming no element is inert
        if (!elements.has(el.id)) elements.set(el.id, elements.size);
        const isInstance = el.type === 'composition';
        if (
          change.property === 'opacity' ||
          change.property === 'blink' ||
          (change.property === 'visible' && !isInstance)
        ) {
          wrapped.add(el.id);
        }
        if (change.property === 'visible' && change.value && !el.visible && !isInstance) {
          shown.add(el.id);
        }
      }
    }
  }
  const plan: StepPlan = { countdowns, elements, wrapped, shown, byId };
  planCache.set(scene, plan);
  return plan;
}

/** The compiled stylesheet plus anything that had to be dropped to produce it. */
export interface StepCssResult {
  css: string;
  warnings: string[];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/** A step's blink: half a second on, half a second off. */
export const STEP_BLINK_MS = 1000;
const BLINK_KEYFRAMES = 'cg-step-blink';

/**
 * Compile the scene's steps. Pure: the same scene always yields the same text, which is what makes
 * the preview and the single-file export byte-identical. Empty when no step changes anything.
 */
export function compileStepCss(scene: Scene, mode: RenderMode = 'output'): StepCssResult {
  const warnings: string[] = [];
  const plan = stepPlanOf(scene);
  const cds = countdownsOf(scene);
  if (cds.length === 0) return { css: '', warnings };

  /** Every variable name, for the reset rule. */
  const vars = new Set<string>(['--cgs-dur']);
  /** Per element index: the colour targets used, and whether it reads opacity / blink. */
  const used = new Map<number, { colors: Set<ColorChangeProperty>; op: boolean; blink: boolean }>();
  const publication: string[] = [];

  const use = (n: number) => {
    let u = used.get(n);
    if (u === undefined) {
      u = { colors: new Set(), op: false, blink: false };
      used.set(n, u);
    }
    return u;
  };

  for (const cd of cds) {
    const c = plan.countdowns.get(cd.id);
    if (c === undefined) continue;
    for (const set of setsOf(cd.steps)) {
      const transition =
        set.token === 'before'
          ? cd.steps.before?.transition
          : cd.steps.steps[set.token]?.transition;
      const decls: string[] = [`--cgs-dur:${String(transitionMs(transition))}ms`];
      /** Per element in this set: the opacity it ends at (hide wins over an opacity value). */
      const ops = new Map<number, number>();
      for (const change of set.changes) {
        const el = plan.byId.get(change.elementId);
        const n = el === undefined ? undefined : plan.elements.get(el.id);
        if (el === undefined || n === undefined) continue;
        if (mode === 'output' && el.type === 'video-placeholder') continue; // D-137 §9: never paint a hole
        switch (change.property) {
          case 'textColor':
          case 'backgroundColor':
          case 'fill':
          case 'stroke': {
            if (!colorPropertiesOf(el).includes(change.property)) continue; // inert, never an error
            if (!HEX_COLOR.test(change.value)) {
              warnings.push(`dropped a non-hex colour '${change.value}'`);
              continue;
            }
            const name = `--cgs-${String(n)}-${COLOR_SUFFIX[change.property]}`;
            vars.add(name);
            use(n).colors.add(change.property);
            decls.push(`${name}:${change.value}`);
            break;
          }
          case 'opacity':
            if (!ops.has(n) || (ops.get(n) ?? 1) !== 0) ops.set(n, change.value);
            break;
          case 'visible':
            if (el.type === 'composition') break; // its own entrance / exit (`-F`), not a fade
            if (!change.value) ops.set(n, 0);
            else if (!ops.has(n)) ops.set(n, 1);
            break;
          case 'blink': {
            const name = `--cgs-${String(n)}-blink`;
            vars.add(name);
            use(n).blink = true;
            decls.push(
              `${name}:${change.value ? `${BLINK_KEYFRAMES} ${String(STEP_BLINK_MS)}ms step-end infinite` : 'none'}`,
            );
            break;
          }
          case 'image':
            break; // applied by the runtime (step-effects.ts)
        }
      }
      for (const [n, op] of ops) {
        const name = `--cgs-${String(n)}-op`;
        vars.add(name);
        use(n).op = true;
        decls.push(`${name}:${String(op)}`);
      }
      publication.push(`[${stepAttribute(c)}='${stepTokenValue(set.token)}']{${decls.join(';')}}`);
    }
  }

  const consumption: string[] = [];
  for (const [id, n] of plan.elements) {
    const u = used.get(n);
    const el = plan.byId.get(id);
    if (u === undefined || el === undefined) continue;
    const transitions: string[] = [];
    for (const target of colorChangeTargets(el)) {
      if (!u.colors.has(target.property)) continue;
      const name = `--cgs-${String(n)}-${COLOR_SUFFIX[target.property]}`;
      consumption.push(
        `[data-cg-step-el='${String(n)}']${target.selectorSuffix}{${target.css}:var(${name},${target.fallback}) !important}`,
      );
      transitions.push(target.css);
    }
    if (transitions.length > 0) {
      consumption.push(
        `[data-cg-step-el='${String(n)}']{transition:${transitions.map((p) => `${p} var(--cgs-dur,0ms) ease`).join(',')}}`,
      );
    }
    if (u.op || u.blink) {
      const parts: string[] = [];
      if (u.op) {
        const rest = plan.shown.has(id) ? '0' : '1';
        parts.push(`opacity:var(--cgs-${String(n)}-op,${rest})`);
        parts.push('transition:opacity var(--cgs-dur,0ms) ease');
      }
      if (u.blink) parts.push(`animation:var(--cgs-${String(n)}-blink,none)`);
      consumption.push(`[data-cg-step-wrap='${String(n)}']{${parts.join(';')}}`);
    }
  }
  // An element shown by a step but given no opacity rule (unreachable by construction) still rests
  // transparent: the wrapper rule above always carries `op` for a shown element.

  if (consumption.length === 0 && publication.length === 0) return { css: '', warnings };

  const lines: string[] = [];
  lines.push('/* countdown steps — compiled from the scene by @cg/template-runtime. */');
  if ([...used.values()].some((u) => u.blink)) {
    lines.push(`@keyframes ${BLINK_KEYFRAMES}{50%{visibility:hidden}}`);
  }
  // 1. RESET — first, so the equal-specificity publication rules below win on source order.
  lines.push(`[data-cg-step-root]{${[...vars].map((v) => `${v}:initial`).join(';')}}`);
  // 2. PUBLICATION.
  for (const rule of publication) lines.push(rule);
  // 3. CONSUMPTION.
  for (const rule of consumption) lines.push(rule);
  return { css: `${lines.join('\n')}\n`, warnings };
}

/**
 * Inject the compiled stylesheet as `<style id="cg-steps">`, beside the baseline block and by the
 * same idempotent mechanism. A scene with nothing to compile injects nothing at all.
 */
export function ensureStepCss(
  scene: Scene,
  doc: Document = document,
  mode: RenderMode = 'output',
): StepCssResult {
  const result = compileStepCss(scene, mode);
  const existing = doc.getElementById('cg-steps');
  if (result.css === '') {
    existing?.remove();
    return result;
  }
  if (existing !== null) {
    if (existing.textContent !== result.css) existing.textContent = result.css;
    return result;
  }
  const style = doc.createElement('style');
  style.id = 'cg-steps';
  style.textContent = result.css;
  doc.head.appendChild(style);
  return result;
}
