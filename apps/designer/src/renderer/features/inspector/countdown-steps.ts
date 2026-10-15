import {
  changePropertiesOf,
  CountdownStepsSchema,
  playoutOf,
  type ClockElement,
  type CountdownSteps,
  type Element,
  type ElementChange,
  type ElementChangeProperty,
  type Layer,
  type Scene,
} from '@cg/shared-schema';

/**
 * `DELTA-RUN-NEXT-VERSION-01-A` / `-B` — what the Designer's STEPS editors read: which elements a
 * countdown's steps can change, which countdowns can change an element, the preset, and how a
 * threshold is spelled. Pure reads over the scene — no store, no React — so each rule is
 * unit-testable.
 *
 * REACH is the runtime's (`@cg/template-runtime`'s step stylesheet): a countdown reaches the elements
 * of its own composition and of compositions instanced inside it, but NOT inside a nested composition
 * that has a countdown with steps of its own — that one governs its own subtree (nearest wins). So
 * the picker never offers an element a step could not reach.
 */

/** `null` is the root scene; anything else a composition id. */
export type DocId = string | null;

function docElements(layers: readonly Layer[]): Element[] {
  const out: Element[] = [];
  const push = (el: Element): void => {
    out.push(el);
    if (el.type === 'container') for (const child of el.children) push(child);
  };
  for (const layer of layers) for (const el of layer.children) push(el);
  return out;
}

function layersOf(scene: Scene, doc: DocId): readonly Layer[] {
  if (doc === null) return scene.layers;
  return scene.compositions?.find((c) => c.id === doc)?.layers ?? [];
}

function docsOf(scene: Scene): DocId[] {
  return [null, ...(scene.compositions ?? []).map((c) => c.id)];
}

const isStepCountdown = (el: Element): el is ClockElement =>
  el.type === 'clock' && el.mode === 'countdown' && el.steps !== undefined;

/** Whether a doc holds a countdown with steps — then it governs its own subtree. */
function governsItself(scene: Scene, doc: DocId): boolean {
  return docElements(layersOf(scene, doc)).some(isStepCountdown);
}

/** The doc whose layers hold `elementId`, or `undefined`. */
export function docOf(scene: Scene, elementId: string): DocId | undefined {
  for (const doc of docsOf(scene)) {
    if (docElements(layersOf(scene, doc)).some((el) => el.id === elementId)) return doc;
  }
  return undefined;
}

/** One element a countdown's steps can change, with the instances it sits inside (names). */
export interface GovernedElement {
  element: Element;
  /** The composition instances between the countdown's composition and the element. */
  path: readonly string[];
}

/**
 * The elements a countdown in `doc` reaches, in authored order: its own composition's, then those
 * inside each composition instance (depth-first), stopping at a composition with a countdown of its
 * own. Each element once. Only elements that own at least one changeable property.
 */
export function governedElements(scene: Scene, doc: DocId): GovernedElement[] {
  const out: GovernedElement[] = [];
  const seen = new Set<string>();
  const visit = (d: DocId, path: readonly string[], trail: ReadonlySet<DocId>): void => {
    for (const el of docElements(layersOf(scene, d))) {
      if (!seen.has(el.id) && changePropertiesOf(el).length > 0) {
        seen.add(el.id);
        out.push({ element: el, path });
      }
      if (el.type !== 'composition') continue;
      const child = el.compositionId;
      if (trail.has(child) || governsItself(scene, child) || path.length >= 8) continue;
      visit(child, [...path, el.name], new Set([...trail, child]));
    }
  };
  visit(doc, [], new Set([doc]));
  return out;
}

/** A countdown with steps, and the composition it lives in. */
export interface CountdownRef {
  clock: ClockElement;
  doc: DocId;
}

/** Every countdown with steps that can change `elementId` (its own, then enclosing compositions'). */
export function countdownsGoverning(scene: Scene, elementId: string): CountdownRef[] {
  const out: CountdownRef[] = [];
  for (const doc of docsOf(scene)) {
    const clocks = docElements(layersOf(scene, doc)).filter(isStepCountdown);
    if (clocks.length === 0) continue;
    if (!governedElements(scene, doc).some((g) => g.element.id === elementId)) continue;
    for (const clock of clocks) out.push({ clock, doc });
  }
  return out;
}

/**
 * The Preview's rehearsal choices: every step of every countdown with steps, Before first, as
 * `{ value: '<clockId>|<token>', label }` — the countdown's name leads when there is more than one.
 */
export function stepRehearsalChoices(scene: Scene): { value: string; label: string }[] {
  const clocks = docsOf(scene).flatMap((doc) =>
    docElements(layersOf(scene, doc)).filter(isStepCountdown),
  );
  const many = clocks.length > 1;
  const out: { value: string; label: string }[] = [];
  for (const clock of clocks) {
    const steps = clock.steps ?? { steps: [] };
    const lead = many ? `${clock.name} · ` : '';
    if (steps.before !== undefined) {
      out.push({ value: `${clock.id}|before`, label: `${lead}${steps.before.name}` });
    }
    steps.steps.forEach((s, i) => {
      out.push({
        value: `${clock.id}|${String(i)}`,
        label: `${lead}${s.name} · ${thresholdLabel(s.atMs)}`,
      });
    });
  }
  return out;
}

/** A rehearsal choice's countdown and step (`''` → none). */
export function parseRehearsalChoice(
  value: string,
): { clockId: string; step: 'before' | number } | null {
  const bar = value.lastIndexOf('|');
  if (value === '' || bar === -1) return null;
  const token = value.slice(bar + 1);
  return {
    clockId: value.slice(0, bar),
    step: token === 'before' ? 'before' : Number(token),
  };
}

/** The preset's label — generic words; an event's own name belongs to the author (delta A §1). */
export const STEPS_PRESET_LABEL = '3 steps · 60 / 30 / 10 min';

/**
 * The preset: three steps at 60 / 30 / 10 minutes, each with ONE change — the countdown's own text
 * colour (yellow, orange, red). The author adds the rest.
 */
export function presetSteps(clockId: string): CountdownSteps {
  const step = (minutes: number, value: string): CountdownSteps['steps'][number] => ({
    name: `${String(minutes)} min`,
    atMs: minutes * 60_000,
    changes: [{ elementId: clockId, property: 'textColor', value }],
  });
  return { steps: [step(60, '#ffd600'), step(30, '#ff9100'), step(10, '#d50000')] };
}

export type ThresholdUnit = 'min' | 's';
export type ThresholdSide = 'before' | 'after';

/** A threshold as the editor spells it: a number, a unit, before or after zero. */
export function thresholdParts(atMs: number): {
  value: number;
  unit: ThresholdUnit;
  side: ThresholdSide;
} {
  const abs = Math.abs(atMs);
  const unit: ThresholdUnit = abs % 60_000 === 0 && abs !== 0 ? 'min' : 's';
  return {
    value: unit === 'min' ? abs / 60_000 : Math.round(abs / 1000),
    unit,
    side: atMs < 0 ? 'after' : 'before',
  };
}

/** The `atMs` an editor's number, unit and side name. */
export function atMsOf(value: number, unit: ThresholdUnit, side: ThresholdSide): number {
  const ms = Math.round(Math.max(0, value) * (unit === 'min' ? 60_000 : 1000));
  return side === 'after' ? -ms : ms;
}

/** `≤ 30 min`, `At zero`, `1 min after zero` — a step's threshold in words. */
export function thresholdLabel(atMs: number): string {
  if (atMs === 0) return 'At zero';
  const { value, unit, side } = thresholdParts(atMs);
  return side === 'after' ? `${String(value)} ${unit} after zero` : `≤ ${String(value)} ${unit}`;
}

/** The next default step name: `Step 1`, `Step 2` … — the first not taken. */
export function nextStepName(steps: CountdownSteps): string {
  const taken = new Set(steps.steps.map((s) => s.name));
  for (let n = steps.steps.length + 1; ; n++) {
    const name = `Step ${String(n)}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * Each row's problem, by the schema's own path: `steps.2` → "…", `before` → "…". The schema is the
 * one judge (strictly decreasing across zero, one change per property per step), so an editor names
 * exactly the row the schema refuses.
 */
export function stepIssues(steps: CountdownSteps): Map<string, string> {
  const out = new Map<string, string>();
  const parsed = CountdownStepsSchema.safeParse(steps);
  if (parsed.success) return out;
  for (const issue of parsed.error.issues) {
    const [head, index] = issue.path;
    const key = head === 'steps' ? `steps.${String(index)}` : String(head);
    if (!out.has(key)) out.set(key, issue.message);
  }
  return out;
}

/** The changes of a step token (`before`, or a step's index). */
export function changesAt(
  steps: CountdownSteps,
  token: 'before' | number,
): readonly ElementChange[] {
  return token === 'before' ? (steps.before?.changes ?? []) : (steps.steps[token]?.changes ?? []);
}

/** `steps` with the changes of `token` replaced. */
export function withChanges(
  steps: CountdownSteps,
  token: 'before' | number,
  changes: ElementChange[],
): CountdownSteps {
  if (token === 'before') {
    return { ...steps, before: { ...(steps.before ?? { name: DEFAULT_STEP_NAME }), changes } };
  }
  return {
    ...steps,
    steps: steps.steps.map((s, i) => (i === token ? { ...s, changes } : s)),
  };
}

/** The value a NEW change starts with, for a property. */
export function defaultChange(elementId: string, property: ElementChangeProperty): ElementChange {
  switch (property) {
    case 'visible':
      return { elementId, property, value: false };
    case 'opacity':
      return { elementId, property, value: 0.5 };
    case 'blink':
      return { elementId, property, value: true };
    case 'image':
      return { elementId, property, value: { assetId: '', source: 'project' } };
    default:
      return { elementId, property, value: '#d50000' };
  }
}

/** The operator's words for a property. */
export const PROPERTY_LABELS: Readonly<Record<ElementChangeProperty, string>> = {
  visible: 'show / hide',
  opacity: 'opacity',
  textColor: 'text colour',
  backgroundColor: 'background',
  fill: 'fill',
  stroke: 'stroke',
  blink: 'blink',
  image: 'picture',
};

/** A change as a short chip: `fill ■ D50000`, `hidden`, `shown`, `opacity 50%`, `blinks`, `picture`. */
export function changeChipText(change: ElementChange): string {
  switch (change.property) {
    case 'visible':
      return change.value ? 'shown' : 'hidden';
    case 'opacity':
      return `opacity ${String(Math.round(change.value * 100))}%`;
    case 'blink':
      return change.value ? 'blinks' : 'stops blinking';
    case 'image':
      return 'picture';
    default:
      return `${PROPERTY_LABELS[change.property]} ${change.value.replace('#', '').toUpperCase()}`;
  }
}

/** A clock anywhere in the scene — the root or any composition — with the doc it lives in. */
export function clockAnywhere(
  scene: Scene,
  clockId: string,
): { clock: ClockElement; doc: DocId } | undefined {
  for (const doc of docsOf(scene)) {
    const el = docElements(layersOf(scene, doc)).find((e) => e.id === clockId);
    if (el?.type === 'clock') return { clock: el, doc };
  }
  return undefined;
}

/** A step's place: `before`, or an index into `steps`. */
export type StepToken = 'before' | number;

/**
 * The owner's word for the look BEFORE the first step (the schema's `before`): the countdown's default
 * colours. A new one is named so; a migrated zone keeps its base zone's name.
 */
export const DEFAULT_STEP_NAME = 'Default';

/**
 * The Steps dialog's rows: the DEFAULT always first — whether or not it changes anything yet, so the
 * author can always choose the default colours — then the list.
 */
export function dialogTokens(steps: CountdownSteps): StepToken[] {
  return ['before', ...steps.steps.map((_, i) => i)];
}

/** Every step in order — Before first, then the list (thresholds, At zero, after zero). */
export function stepTokens(steps: CountdownSteps): StepToken[] {
  return [
    ...(steps.before !== undefined ? (['before'] as const) : []),
    ...steps.steps.map((_, i) => i),
  ];
}

/** A step's name, by token. */
export function stepName(steps: CountdownSteps, token: StepToken): string {
  return token === 'before'
    ? (steps.before?.name ?? DEFAULT_STEP_NAME)
    : (steps.steps[token]?.name ?? '');
}

/** `1 change`, `3 changes`, `no changes`. */
export function changeCountLabel(n: number): string {
  return n === 0 ? 'no changes' : n === 1 ? '1 change' : `${String(n)} changes`;
}

/**
 * Which run of the list a step can be dragged within: the thresholds before zero, or the steps
 * after zero. `null` — Before and At zero are pinned.
 */
export function stepGroup(
  steps: CountdownSteps,
  token: StepToken,
): 'before-zero' | 'after-zero' | null {
  if (token === 'before') return null;
  const at = steps.steps[token]?.atMs;
  if (at === undefined || at === 0) return null;
  return at > 0 ? 'before-zero' : 'after-zero';
}

/**
 * `DELTA-RUN-NEXT-VERSION-01-H` — reorder: the step at `from` moves to `to` WITH its name, changes
 * and transition, and the THRESHOLDS STAY WHERE THEY ARE — the ladder is strictly ordered across
 * zero (the schema's own rule), so a reorder can only re-assign which step sits at which threshold.
 * Only inside one group; anything else answers `steps` unchanged.
 */
export function moveStep(steps: CountdownSteps, from: number, to: number): CountdownSteps {
  const group = stepGroup(steps, from);
  if (group === null || from === to || stepGroup(steps, to) !== group) return steps;
  const list = [...steps.steps];
  const [moved] = list.splice(from, 1);
  if (moved === undefined) return steps;
  list.splice(to, 0, moved);
  return {
    ...steps,
    steps: list.map((step, k) => ({ ...step, atMs: steps.steps[k]?.atMs ?? step.atMs })),
  };
}

/** Round to the whole second a threshold is written in. */
const wholeSecond = (ms: number): number => Math.round(ms / 1000) * 1000;

/**
 * A copy of the step at `index`, placed just after it at a threshold between it and the next one
 * (half-way, to the second; past the last one: half-way to zero before zero, a minute later after
 * zero). `null` when there is no whole second free there — or for At zero, which is one of a kind.
 */
export function duplicateStep(steps: CountdownSteps, index: number): CountdownSteps | null {
  const step = steps.steps[index];
  if (step === undefined || step.atMs === 0) return null;
  const next = steps.steps[index + 1]?.atMs;
  const atMs =
    next !== undefined
      ? wholeSecond((step.atMs + next) / 2)
      : step.atMs > 0
        ? Math.floor(step.atMs / 2 / 1000) * 1000
        : step.atMs - 60_000;
  const below = next ?? (step.atMs > 0 ? 0 : -Infinity);
  if (atMs >= step.atMs || atMs <= below || atMs === 0) return null;
  const list = [...steps.steps];
  list.splice(index + 1, 0, {
    ...step,
    name: `${step.name} copy`,
    atMs,
    changes: step.changes.map((c) => ({ ...c })),
  });
  return { ...steps, steps: list };
}

/** A new step before zero, after the last threshold above zero (half of it; 10 min when none). */
export function addStep(steps: CountdownSteps): { steps: CountdownSteps; index: number } {
  const positive = steps.steps.filter((s) => s.atMs > 0);
  const last = positive[positive.length - 1]?.atMs;
  const atMs = last === undefined ? 600_000 : Math.max(1000, Math.floor(last / 2 / 1000) * 1000);
  const list = [...steps.steps];
  const at = list.findIndex((s) => s.atMs < atMs);
  const step = { name: nextStepName(steps), atMs, changes: [] };
  const index = at === -1 ? list.length : at;
  list.splice(index, 0, step);
  return { steps: { ...steps, steps: list }, index };
}

/** The At-zero step, placed between the last threshold before zero and the first after it. */
export function addAtZero(steps: CountdownSteps): { steps: CountdownSteps; index: number } {
  const list = [...steps.steps];
  const at = list.findIndex((s) => s.atMs < 0);
  const index = at === -1 ? list.length : at;
  list.splice(index, 0, { name: 'At zero', atMs: 0, changes: [] });
  return { steps: { ...steps, steps: list }, index };
}

/** `steps` without the step at `token` (Before removed entirely). */
export function deleteStep(steps: CountdownSteps, token: StepToken): CountdownSteps {
  if (token === 'before') return { steps: steps.steps };
  return { ...steps, steps: steps.steps.filter((_, i) => i !== token) };
}

/**
 * `DELTA-RUN-NEXT-VERSION-01-E` — whether "Close the graphic" can close it: only a content-driven
 * hold that this countdown drives can be ended by it.
 */
export function closeCanEnd(scene: Scene, doc: DocId, clock: ClockElement): boolean {
  const source = doc === null ? scene : (scene.compositions?.find((c) => c.id === doc) ?? scene);
  const playout = playoutOf(source as Scene);
  return (
    playout.holdSource === 'content-driven' &&
    playout.mode !== 'manual' &&
    playout.mode !== 'static' &&
    clock.drivesHold !== false
  );
}
