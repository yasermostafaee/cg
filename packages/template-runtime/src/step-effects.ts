import type { CountdownSteps, ElementChange, ImageChangeValue } from '@cg/shared-schema';
import type { StepChangeReason } from './clock-driver.js';
import { changesOf, type StepPlan, type StepToken } from './step-css.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-A` / `-F` — **WHAT A STEP DOES THAT CSS CANNOT.** The step stylesheet
 * (`step-css.ts`) carries colours, opacity, show / hide and blink; two changes are actions instead:
 *
 * - **a picture** — an `image` element's `<img>` shows another asset while the step is active, and its
 *   authored one again when the step that set it is left;
 * - **a composition instance shown or hidden** — it plays its OWN entrance or exit through the nested
 *   lifecycle it already has (`-F`), never a fade: a rich change is a composition with its own
 *   animation, and a step only cues it.
 *
 * Both reach only what THIS countdown governs: nodes whose nearest step root is the countdown's own
 * scope root, so a nested composition with a countdown of its own is never touched from outside —
 * the same nearest-wins the stylesheet resolves by inheritance.
 */

/** One composition instance a step cues. */
export interface StepInstance {
  /** Play its own entrance; it then holds by its own settings. A no-op if already in. */
  show(): void;
  /** Play its own exit; it is then gone. A no-op if already out or leaving. */
  hide(): void;
  /**
   * At TAKE, before the graphic's entrance: set it in or out WITHOUT playing anything, so the
   * graphic's own entrance cascade plays it (in) or skips it (out).
   */
  prime(isIn: boolean): void;
}

export interface StepEffectsOptions {
  steps: CountdownSteps;
  /** The countdown's scope root — the node its step attribute is published on. */
  root: HTMLElement;
  plan: StepPlan;
  /** Asset id → URL, the same map the page wires every `<img>` from. */
  assetUrls?: Readonly<Record<string, string>>;
  /** The composition instances with this element id that this countdown governs. */
  instances: (elementId: string) => readonly StepInstance[];
}

export interface StepEffects {
  /** The driver's `onStep`: the step entered, the one left, and why. */
  apply: (entered: StepToken | null, left: StepToken | null, reason: StepChangeReason) => void;
  /** At Take: set every instance this countdown cues in or out for `step`, playing nothing. */
  prime: (step: StepToken | null) => void;
}

function findChange<P extends ElementChange['property']>(
  changes: readonly ElementChange[],
  elementId: string,
  property: P,
): Extract<ElementChange, { property: P }> | undefined {
  return changes.find(
    (c): c is Extract<ElementChange, { property: P }> =>
      c.elementId === elementId && c.property === property,
  );
}

export function createStepEffects(o: StepEffectsOptions): StepEffects {
  const sets: (readonly ElementChange[])[] = [
    ...(o.steps.before !== undefined ? [o.steps.before.changes] : []),
    ...o.steps.steps.map((s) => s.changes),
  ];
  const all = sets.flat();
  const imageIds = [
    ...new Set(all.filter((c) => c.property === 'image').map((c) => c.elementId)),
  ].filter((id) => o.plan.byId.get(id)?.type === 'image');
  const instanceIds = [
    ...new Set(all.filter((c) => c.property === 'visible').map((c) => c.elementId)),
  ].filter((id) => o.plan.byId.get(id)?.type === 'composition');

  /** The `<img>` nodes of element `id` this countdown governs. */
  const imagesOf = (id: string): HTMLImageElement[] => {
    const n = o.plan.elements.get(id);
    if (n === undefined) return [];
    const out: HTMLImageElement[] = [];
    o.root.querySelectorAll<HTMLElement>(`[data-cg-step-el='${String(n)}']`).forEach((node) => {
      // The countdown's own root is a step root (the builder marks it), so the nearest step root
      // above a governed node is exactly that one; a nested countdown's root in between means the
      // node is governed by THAT countdown, never this one.
      if (node.closest(`[data-cg-step-root]`) !== o.root) return;
      const img = node instanceof HTMLImageElement ? node : node.querySelector('img');
      if (img !== null) out.push(img);
    });
    return out;
  };

  const urlOf = (
    value: ImageChangeValue | undefined,
    img: HTMLImageElement,
  ): string | undefined => {
    const id = value?.assetId ?? img.dataset['cgAssetId'];
    return id === undefined ? undefined : o.assetUrls?.[id];
  };

  /** Whether an instance is IN under a token: the token's own change, else its authored start. */
  const instanceInUnder = (id: string, token: StepToken | null): boolean | undefined =>
    findChange(changesOf(o.steps, token), id, 'visible')?.value;

  const authoredIn = (id: string): boolean => {
    const el = o.plan.byId.get(id);
    return el?.type === 'composition' && el.startsHidden !== true;
  };

  return {
    apply(entered, left, reason) {
      const now = changesOf(o.steps, entered);
      for (const id of imageIds) {
        const value = findChange(now, id, 'image')?.value;
        for (const img of imagesOf(id)) {
          const url = urlOf(value, img);
          if (url !== undefined && img.getAttribute('src') !== url) img.src = url;
        }
      }
      // A RESET is not a cue: the next run re-primes every instance before its entrance.
      if (reason === 'reset') return;
      for (const id of instanceIds) {
        const wasIn = instanceInUnder(id, left) ?? authoredIn(id);
        const isIn = instanceInUnder(id, entered) ?? authoredIn(id);
        if (wasIn === isIn) continue;
        for (const instance of o.instances(id)) {
          if (isIn) instance.show();
          else instance.hide();
        }
      }
    },
    prime(step) {
      for (const id of instanceIds) {
        const isIn = instanceInUnder(id, step) ?? authoredIn(id);
        for (const instance of o.instances(id)) instance.prime(isIn);
      }
    },
  };
}
