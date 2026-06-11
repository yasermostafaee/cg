import type { RuntimeClock } from './types.js';
import {
  sampleTransition,
  transitionTotalMs,
  type MotionBox,
  type MotionPose,
  type SequenceEdge,
  type SequenceTiming,
  type SequenceTransitionSpec,
} from './sequence-motion.js';

/**
 * D-029 — the sequence / now-next driver.
 *
 * One driver owns one sequence element's item rotation: ONE item on screen
 * at a time inside the clipped box, advanced by a per-item dwell timer
 * (`advance: 'auto'`) and/or by {@link next} (`CG NEXT` /
 * `runtime.next()`). The move between items is the decomposed transition
 * mapped by `sequence-motion.ts` (IN edge / OUT edge / timing, each motion
 * `transitionMs`, shared ease-in-out, transform-only).
 *
 * Time base: dwell and transition progress are measured in accumulated
 * ACTIVE time — `pause()` freezes the dwell AND an in-flight transition
 * mid-motion; `resume()` continues both with no jump (the ticker/clock
 * convention; same injectable {@link RuntimeClock}).
 *
 * Passes: `repeat: N` counts full passes through the list. Advancing past
 * the last item of pass N — by timer OR by `next()` — completes the run
 * exactly once: the LAST item stays on screen and {@link whenComplete}
 * resolves (the scope's `holdSource: 'content-driven'` hold awaits it,
 * alongside finite tickers and countdown clocks). `reset()` mints a fresh
 * promise per run; `'infinite'` wraps to item 1 forever. An empty list is
 * complete by definition at `start()` (the ticker's zero-content parity).
 *
 * v1 advance semantics: a `next()` before `start()` is IGNORED (no
 * queueing), and a `next()` while a transition is in flight is ignored too
 * (no mid-motion restarts) — both documented out-of-scope seams.
 */

/** A normalized sequence item — the reconcile unit. */
export interface SequenceDriverItem {
  id: string;
  text: string;
  dwellMs?: number | undefined;
}

export interface SequenceDriverOptions {
  /** The clipped box (the element node) the driver renders items into. */
  host: HTMLElement;
  /** READING direction — per-item bidi isolation only; edges stay physical. */
  direction: 'ltr' | 'rtl';
  /** Initial logical items (authored defaults; a bound list field replaces them). */
  items: SequenceDriverItem[];
  /** Per-item display time when the item carries no own `dwellMs`. */
  defaultDwellMs: number;
  /** `auto` = dwell timer + next(); `manual` = only next() advances. */
  advance: 'auto' | 'manual';
  transitionIn: SequenceEdge;
  transitionOut: SequenceEdge;
  transitionTiming: SequenceTiming;
  /** Duration of EACH motion (ms). */
  transitionMs: number;
  /** Full passes before completion ('infinite' = until stop()). */
  repeat: number | 'infinite';
  clock?: RuntimeClock | undefined;
}

interface NormalizedDriverClock {
  raf: (cb: (timestamp: number) => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
}

type Phase = 'idle' | 'dwell' | 'transition';

export class SequenceDriver {
  private readonly o: SequenceDriverOptions;
  private readonly clock: NormalizedDriverClock;

  private logical: SequenceDriverItem[];
  /** What's on screen — a snapshot, so a removed current keeps displaying. */
  private current: SequenceDriverItem | null = null;
  private currentNode: HTMLElement | null = null;
  /** Where advance resumes when the current item was removed from the list. */
  private resumeIdx = 0;
  /** Mid-transition state. */
  private incoming: SequenceDriverItem | null = null;
  private incomingNode: HTMLElement | null = null;
  /** Passes STARTED this run (1-based once the run starts). */
  private passesStarted = 1;

  private phase: Phase = 'idle';
  /** Clock time the current phase began (dwell or transition). */
  private phaseStart = 0;
  /** Paused time accumulated WITHIN the current phase. */
  private phasePausedAccum = 0;

  private running = false;
  private paused = false;
  private destroyed = false;
  private pausedAt = 0;
  private rafHandle: number | null = null;

  private completed = false;
  private resolveComplete: (() => void) | null = null;
  private completion: Promise<void>;

  constructor(options: SequenceDriverOptions) {
    this.o = options;
    this.logical = options.items.map((i) => ({ ...i }));
    this.completion = new Promise<void>((res) => {
      this.resolveComplete = res;
    });
    const c = options.clock;
    this.clock = {
      raf: c?.raf ?? ((cb): number => requestAnimationFrame(cb)),
      cancel: c?.cancel ?? ((h): void => cancelAnimationFrame(h)),
      now: c?.now ?? ((): number => performance.now()),
    };
  }

  /** Finite sequences are content sources; infinite ones never resolve. */
  get isFinite(): boolean {
    return this.o.repeat !== 'infinite';
  }

  /**
   * Start a run at item 1. The hold entry resets first (`reset()` then
   * `start()`), so every composition open/close cycle replays from item 1;
   * item 1 displays statically through the intro (the scene-builder's
   * render) until this run begins advancing.
   */
  start(): void {
    if (this.destroyed || this.running) return;
    this.running = true;
    this.paused = false;
    // The run owns the stage: render item 1 (or adopt what reset() drew).
    if (this.currentNode === null) this.renderCurrentStatic();
    if (this.logical.length === 0) {
      // Nothing to advance through — complete by definition (zero-length
      // content, the ticker's empty parity), regardless of `repeat`.
      this.fireComplete();
      this.running = false;
      return;
    }
    this.enterPhase('dwell');
    this.scheduleIfNeeded();
  }

  /**
   * D-029 — resolves when this run's finite `repeat` has fully played out
   * (the run advanced past the last item of pass N — by timer or next()).
   * Never resolves for `'infinite'`. A fresh promise is minted per run
   * (constructor + `reset()`).
   */
  whenComplete(): Promise<void> {
    return this.completion;
  }

  /**
   * Advance one item with the transition. In `'auto'` the new item's dwell
   * restarts. Ignored before `start()` (no queueing), after completion, and
   * while a transition is already in flight (v1 — no mid-motion restarts).
   */
  next(): void {
    if (!this.running || this.paused || this.completed) return;
    if (this.phase !== 'dwell') return;
    this.advance();
  }

  /** Freeze the dwell timer AND any in-flight transition (lockstep pause). */
  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.pausedAt = this.clock.now();
    this.cancelFrame();
  }

  /** Continue dwell/transition from exactly the frozen point — no jump. */
  resume(): void {
    if (!this.running || !this.paused) return;
    this.phasePausedAccum += this.clock.now() - this.pausedAt;
    this.paused = false;
    if (this.phase === 'transition') this.paintTransition();
    this.scheduleIfNeeded();
  }

  /** Stop advancing, freezing the stage as-is (scope settled). */
  stop(): void {
    this.running = false;
    this.paused = false;
    this.cancelFrame();
  }

  /**
   * Full reset for a fresh run: back to item 1, statically rendered (the
   * same markup the scene-builder draws, so the authoring canvas and a
   * between-runs stage can't drift), with a fresh completion per run.
   */
  reset(): void {
    this.stop();
    this.phase = 'idle';
    this.phasePausedAccum = 0;
    this.passesStarted = 1;
    this.resumeIdx = 0;
    this.incoming = null;
    this.incomingNode = null;
    this.current = null; // back to item 1 — renderCurrentStatic re-derives it
    this.completed = false;
    this.completion = new Promise<void>((res) => {
      this.resolveComplete = res;
    });
    this.renderCurrentStatic();
  }

  destroy(): void {
    this.reset();
    this.destroyed = true;
  }

  /**
   * Reconcile to a new logical list by stable id — the `update()` path. The
   * CURRENT item is never yanked mid-display: a text edit corrects it in
   * place; a removal takes effect at the next advance (the driver remembers
   * where to resume). Item order and per-item `dwellMs` come from the new
   * list. Pre-start, the static render re-draws item 1 from the new list.
   */
  setItems(items: SequenceDriverItem[]): void {
    const oldLogical = this.logical;
    this.logical = items.map((i) => ({ ...i }));
    if (this.phase === 'idle') {
      // Pre-start (field default applied before play): item 1 of the NEW
      // list is the truth the canvas should show.
      this.current = null;
      if (!this.destroyed) this.renderCurrentStatic();
      return;
    }
    const fixUp = (shown: SequenceDriverItem | null, node: HTMLElement | null): void => {
      if (shown === null) return;
      const replacement = this.logical.find((i) => i.id === shown.id);
      if (replacement !== undefined) {
        if (replacement.text !== shown.text && node !== null) node.textContent = replacement.text;
        shown.text = replacement.text;
        shown.dwellMs = replacement.dwellMs;
        return;
      }
      // Removed while on screen: keep displaying; remember where the list
      // continues so the NEXT advance lands on its successor position.
      const oldIdx = oldLogical.findIndex((i) => i.id === shown.id);
      this.resumeIdx = Math.min(oldIdx >= 0 ? oldIdx : this.resumeIdx, this.logical.length);
    };
    fixUp(this.current, this.currentNode);
    fixUp(this.incoming, this.incomingNode);
  }

  // — internals ————————————————————————————————————————————————————————

  /** Active (unpaused) ms since the current phase began. */
  private phaseElapsedMs(): number {
    const nowMs = this.paused ? this.pausedAt : this.clock.now();
    return nowMs - this.phaseStart - this.phasePausedAccum;
  }

  private enterPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseStart = this.clock.now();
    this.phasePausedAccum = 0;
  }

  /** The dwell for the on-screen item: its own dwellMs, else the element's. */
  private currentDwellMs(): number {
    return this.current?.dwellMs ?? this.o.defaultDwellMs;
  }

  private transitionSpec(): SequenceTransitionSpec {
    return {
      inEdge: this.o.transitionIn,
      outEdge: this.o.transitionOut,
      timing: this.o.transitionTiming,
      transitionMs: this.o.transitionMs,
      box: this.box(),
    };
  }

  /** The clipped box's size — from the styles the scene-builder set. */
  private box(): MotionBox {
    const w = Number.parseFloat(this.o.host.style.width);
    const h = Number.parseFloat(this.o.host.style.height);
    return {
      width: Number.isFinite(w) && w > 0 ? w : this.o.host.offsetWidth,
      height: Number.isFinite(h) && h > 0 ? h : this.o.host.offsetHeight,
    };
  }

  /** Advance one position: wrap at the pass boundary, complete past pass N. */
  private advance(): void {
    const idx =
      this.current === null ? -1 : this.logical.findIndex((i) => i.id === this.current?.id);
    const nextIdx = idx >= 0 ? idx + 1 : this.resumeIdx;
    if (nextIdx >= this.logical.length) {
      // Past the last item of this pass — complete (finite, all passes done)
      // or wrap to item 1 for the next pass.
      if (this.o.repeat !== 'infinite' && this.passesStarted >= this.o.repeat) {
        // The LAST item stays on screen; the run signals its scope and
        // freezes (completion fires exactly once per run).
        this.fireComplete();
        this.running = false;
        this.cancelFrame();
        return;
      }
      if (this.logical.length === 0) return; // nothing to show — keep the stage
      this.passesStarted += 1;
      this.beginTransition(0);
      return;
    }
    this.beginTransition(nextIdx);
  }

  private beginTransition(toIdx: number): void {
    const target = this.logical[toIdx];
    if (target === undefined) return;
    this.incoming = { ...target };
    this.incomingNode = this.makeItemNode();
    this.incomingNode.textContent = target.text;
    this.o.host.appendChild(this.incomingNode);
    this.enterPhase('transition');
    this.paintTransition();
    this.scheduleIfNeeded();
  }

  /** Apply the mapper's two poses for the current transition moment. */
  private paintTransition(): void {
    const spec = this.transitionSpec();
    const frame = sampleTransition(spec, this.phaseElapsedMs());
    if (this.currentNode !== null) this.applyPose(this.currentNode, frame.out);
    if (this.incomingNode !== null) this.applyPose(this.incomingNode, frame.in);
    if (frame.done || transitionTotalMs(spec) <= 0) this.finishTransition();
  }

  private finishTransition(): void {
    this.currentNode?.remove();
    this.currentNode = this.incomingNode;
    this.current = this.incoming;
    this.incomingNode = null;
    this.incoming = null;
    if (this.currentNode !== null) {
      this.currentNode.style.transform = '';
      this.currentNode.style.visibility = '';
    }
    this.enterPhase('dwell');
  }

  private applyPose(node: HTMLElement, pose: MotionPose): void {
    node.style.transform =
      pose.offset.x === 0 && pose.offset.y === 0
        ? ''
        : `translate(${pose.offset.x}px, ${pose.offset.y}px)`;
    node.style.visibility = pose.visible ? '' : 'hidden';
  }

  /** rAF runs only while something is time-driven: a transition, or an auto dwell. */
  private scheduleIfNeeded(): void {
    if (!this.running || this.paused) return;
    if (this.phase === 'transition' || (this.phase === 'dwell' && this.o.advance === 'auto')) {
      this.scheduleFrame();
    }
  }

  private step(): void {
    if (this.phase === 'transition') {
      this.paintTransition();
    } else if (this.phase === 'dwell' && this.o.advance === 'auto') {
      if (this.phaseElapsedMs() >= this.currentDwellMs()) this.advance();
    }
  }

  private scheduleFrame(): void {
    if (this.rafHandle !== null) return;
    this.rafHandle = this.clock.raf(() => {
      this.rafHandle = null;
      if (!this.running || this.paused) return;
      this.step();
      this.scheduleIfNeeded();
    });
  }

  private cancelFrame(): void {
    if (this.rafHandle !== null) {
      this.clock.cancel(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private fireComplete(): void {
    if (this.completed) return;
    this.completed = true;
    this.resolveComplete?.();
  }

  /** Render the resting state: item 1 (or the empty box) — no motion. */
  private renderCurrentStatic(): void {
    while (this.o.host.firstChild !== null) this.o.host.removeChild(this.o.host.firstChild);
    this.incoming = null;
    this.incomingNode = null;
    const first = this.logical[0];
    if (this.current === null) this.current = first === undefined ? null : { ...first };
    if (this.current === null) {
      this.currentNode = null;
      return;
    }
    this.currentNode = this.makeItemNode();
    this.currentNode.textContent = this.current.text;
    this.o.host.appendChild(this.currentNode);
  }

  /**
   * An item node: stacked in the host's single grid cell (so two items can
   * coexist during a transition), bidi-isolated with the element's reading
   * direction so mixed Persian/Latin text shapes correctly (ADR 0003), and
   * single-line (`white-space: pre`) like the ticker's items.
   */
  private makeItemNode(): HTMLElement {
    return makeSequenceItemNode(this.o.host.ownerDocument, this.o.direction);
  }
}

/**
 * The shared item-node factory — used by the scene-builder (static item-1
 * render) and the driver (live items), so the two can't drift.
 */
export function makeSequenceItemNode(doc: Document, direction: 'ltr' | 'rtl'): HTMLElement {
  const node = doc.createElement('span');
  node.dataset['cgSequenceItem'] = '1';
  node.style.gridArea = '1 / 1';
  node.style.whiteSpace = 'pre';
  node.style.direction = direction;
  node.style.unicodeBidi = 'isolate';
  return node;
}

/**
 * Host-node → driver registry, so the bindings applier (which only sees the
 * element map) can route a `sequence-items` field value to the right driver.
 */
const registry = new WeakMap<HTMLElement, SequenceDriver>();

export function registerSequenceDriver(host: HTMLElement, driver: SequenceDriver): void {
  registry.set(host, driver);
}

export function sequenceDriverFor(host: HTMLElement): SequenceDriver | undefined {
  return registry.get(host);
}

/**
 * Normalize a `list` field value (or a bare string array — degraded
 * positional-id fallback) into driver items. Reads the fields the sequence
 * knows (`text`, `dwellMs`); unknown fields stay on the FIELD value.
 */
export function coerceSequenceItems(raw: readonly unknown[]): SequenceDriverItem[] {
  return raw.map((v, i) => {
    if (typeof v === 'string') return { id: `item-${String(i)}`, text: v };
    if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const id = typeof o['id'] === 'string' && o['id'] !== '' ? o['id'] : `item-${String(i)}`;
      const text = typeof o['text'] === 'string' ? o['text'] : '';
      const dwell = o['dwellMs'];
      const dwellMs =
        typeof dwell === 'number' && Number.isInteger(dwell) && dwell > 0 ? dwell : undefined;
      return dwellMs === undefined ? { id, text } : { id, text, dwellMs };
    }
    return { id: `item-${String(i)}`, text: '' };
  });
}
