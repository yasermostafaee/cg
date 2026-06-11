import type {
  ClockElement,
  DynamicField,
  ImageElement,
  ListItem,
  RepeaterElement,
  SequenceElement,
  ShapeElement,
  TextElement,
  TickerElement,
  Transform,
} from '@cg/shared-schema';

/**
 * Default element factories — what we drop on the canvas when the
 * operator clicks with the text/shape/image tool. The transform is
 * computed at the call site (click position → top-left corner with
 * an opinionated default size).
 */

function baseTransform(x: number, y: number, w: number, h: number): Transform {
  return {
    position: { x, y },
    size: { w, h },
    rotation: 0,
    scale: { x: 1, y: 1 },
    // Centre anchor: rotation and scale pivot about the element's middle (the
    // intuitive default, matching the starter templates). `position` is still
    // the top-left, so the element doesn't shift at rest — only its pivot.
    anchor: { x: 0.5, y: 0.5 },
  };
}

export function defaultText(id: string, x: number, y: number): TextElement {
  return {
    id,
    name: 'Text',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 480, 80),
    text: 'New text',
    font: {
      family: 'Inter',
      weight: 700,
      style: 'normal',
      size: 48,
      lineHeight: 1.15,
      letterSpacing: 0,
    },
    color: '#000000',
    align: 'start',
    direction: 'auto',
    fitMode: 'fixed',
    overflow: 'clip',
  };
}

/**
 * Ticker / crawler band (D-028). Persian-first defaults: reading direction
 * `rtl` (the crawl moves visually left→right), Vazirmatn, sample Persian
 * items. The crawl duration is content-driven (measured width ÷ speed) —
 * there is deliberately no duration knob anywhere.
 */
export function defaultTicker(id: string, x: number, y: number): TickerElement {
  return {
    id,
    name: 'Ticker',
    type: 'ticker',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 1200, 72),
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    // No backgroundColor — a fresh band is TRANSPARENT by design; the operator
    // opts into a bar colour in the inspector.
    direction: 'rtl',
    speed: 120,
    // INNER repeat loop — a fresh ticker crawls forever by design (no hidden
    // loop default to hunt for); finite passes are an explicit inspector edit.
    repeat: 'infinite',
    cycleBoundary: 'seamless',
    gap: 48,
    separator: ' • ',
    items: [
      { id: 'item-1', text: 'خبر نخست — متن نمونه' },
      { id: 'item-2', text: 'خبر دوم — متن نمونه' },
      { id: 'item-3', text: 'خبر سوم — متن نمونه' },
    ],
  };
}

/**
 * Digital clock (D-027). Persian-first defaults: wall mode, `HH:mm:ss`,
 * Persian digits, Vazirmatn. The clock is time-driven like the ticker — a
 * runtime driver repaints it once per second; scrubbing never moves it.
 */
export function defaultClock(id: string, x: number, y: number): ClockElement {
  return {
    id,
    name: 'Clock',
    type: 'clock',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 320, 84),
    font: {
      family: 'Vazirmatn',
      weight: 600,
      style: 'normal',
      size: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    // No backgroundColor — a fresh clock box is TRANSPARENT by design; the
    // operator opts into a bar colour in the inspector.
    align: 'center',
    mode: 'wall',
    format: 'HH:mm:ss',
    digits: 'persian',
  };
}

/**
 * Sequence / now-next (D-029). Persian-first defaults: `rtl`, Vazirmatn,
 * three sample now/next items, the "Push up" transition (in from the bottom,
 * out through the top, simultaneous), auto-advance every 5s, infinite passes.
 * Time-driven like the ticker/clock — scrubbing never moves it.
 */
export function defaultSequence(id: string, x: number, y: number): SequenceElement {
  return {
    id,
    name: 'Sequence',
    type: 'sequence',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 720, 72),
    font: {
      family: 'Vazirmatn',
      weight: 500,
      style: 'normal',
      size: 36,
      lineHeight: 1.4,
      letterSpacing: 0,
    },
    color: '#FFFFFF',
    // No backgroundColor — a fresh box is TRANSPARENT by design.
    align: 'start',
    direction: 'rtl',
    items: [
      { id: 'item-1', text: 'اکنون: برنامهٔ نخست' },
      { id: 'item-2', text: 'سپس: برنامهٔ دوم' },
      { id: 'item-3', text: 'بعد: برنامهٔ سوم' },
    ],
    defaultDwellMs: 5000,
    advance: 'auto',
    transitionIn: 'bottom',
    transitionOut: 'top',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
    repeat: 'infinite',
  };
}

/**
 * Repeater / data-driven layout (D-030). References the given child
 * composition and seeds 3 rows whose keys are the child's field ids with
 * their default values (a field-less child seeds 3 bare `{id}` rows) — the
 * same rows a Data key later seeds into the bound `list` field.
 */
export function defaultRepeater(
  id: string,
  x: number,
  y: number,
  child: { id: string; fields?: readonly DynamicField[] | undefined },
): RepeaterElement {
  const seedRow = (n: number): ListItem =>
    ({
      id: `row-${String(n)}`,
      ...Object.fromEntries(
        (child.fields ?? []).map((f) => [f.id, 'default' in f ? f.default : '']),
      ),
    }) as ListItem;
  return {
    id,
    name: 'Repeater',
    type: 'repeater',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 480, 360),
    compositionId: child.id,
    direction: 'column',
    flow: 'rtl',
    gap: 8,
    items: [seedRow(1), seedRow(2), seedRow(3)],
  };
}

export function defaultShape(id: string, x: number, y: number): ShapeElement {
  return {
    id,
    name: 'Rectangle',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 320, 120),
    shape: 'rect',
    fill: { kind: 'solid', color: '#BEBEBE' },
  };
}

/**
 * Ellipse/circle shape. Defaults to an equal-sided box (a circle) so the
 * operator starts symmetric and can drag a handle to make any ellipse.
 * Renders via the runtime's `border-radius: 50%` path — same ShapeElement,
 * just `shape: 'ellipse'`.
 */
export function defaultEllipse(id: string, x: number, y: number): ShapeElement {
  return {
    id,
    name: 'Ellipse',
    type: 'shape',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 200, 200),
    shape: 'ellipse',
    fill: { kind: 'solid', color: '#BEBEBE' },
  };
}

/**
 * Image elements need an asset id — the click action creates one only
 * after the operator picks an asset. This factory is for the
 * "after-pick" step.
 */
export function defaultImage(id: string, x: number, y: number, assetId: string): ImageElement {
  return {
    id,
    name: 'Image',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: baseTransform(x, y, 320, 320),
    assetId,
    fit: 'contain',
    preserveAspect: true,
  };
}
