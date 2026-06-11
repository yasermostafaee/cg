import {
  activeRangeOf,
  playoutOf,
  type Element,
  type FrameRange,
  type NestedFieldValues,
  type Playout,
  type Scene,
} from '@cg/shared-schema';
import { applyAnimationAtFrame, type AnimatedElement } from './animation-applier.js';
import { applyScopedFieldValues } from './bindings.js';

/**
 * Deep-merge a nested field-value patch into the current values. Plain objects
 * (namespaces) merge recursively; scalars / image `{assetId}` / arrays replace.
 * So a partial `update({ home: { score: 2 } })` keeps `home.teamName`.
 */
function mergeNestedValues(base: NestedFieldValues, patch: NestedFieldValues): NestedFieldValues {
  const out: NestedFieldValues = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const prev = out[k];
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      !('assetId' in v) &&
      prev !== null &&
      typeof prev === 'object' &&
      !Array.isArray(prev) &&
      !('assetId' in prev)
    ) {
      out[k] = mergeNestedValues(prev, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
import { ensureBaselineCss } from './css.js';
import { EventBus } from './event-bus.js';
import { LifecycleStateMachine } from './lifecycle.js';
import { PlayoutController } from './playout-controller.js';
import { buildScene } from './scene-builder.js';
import { ClockDriver } from './clock-driver.js';
import { SequenceDriver, registerSequenceDriver } from './sequence-driver.js';
import { TickerDriver, registerTickerDriver } from './ticker-driver.js';
import type {
  FieldScope,
  PlayOptions,
  PlayoutOverride,
  RuntimeBootOptions,
  StopOptions,
  TemplateRuntime,
  UpdateOptions,
} from './types.js';

/** D-026 — a node in the controller tree paralleling the field-scope tree. */
interface ScopeNode {
  controller: PlayoutController;
  children: ScopeNode[];
}

/**
 * D-030 — one WIRED subtree: the controller tree + every driver of one scope
 * tree, with symmetric teardown. The static scene is one subtree; a repeater
 * stamps one more per row at each fresh play and destroys them on re-stamp.
 * Wiring-tree membership is what the play/pause/resume/next/settle cascades
 * iterate — distinct from the D-025 NAMESPACE tree (`scope.children`), which
 * feeds field aggregation/GDD and which stamped rows never join.
 */
interface WiredSubtree {
  node: ScopeNode;
  tickers: TickerDriver[];
  clocks: ClockDriver[];
  sequences: SequenceDriver[];
  /** Stop + destroy every driver and controller of this subtree, deregister. */
  destroy(): void;
}

/** Flatten every scope's animated elements (parent first) into one list. */
function collectScopeAnimated(scope: FieldScope, out: AnimatedElement[]): void {
  for (const entry of scope.animated) out.push(entry);
  for (const child of scope.children) collectScopeAnimated(child.scope, out);
}

/**
 * Build the runtime. Caller is responsible for `await`ing
 * `runtime.ready` before the first `runtime.play()`. The CasparCG
 * adapter (installed by `installCasparGlobals`) does this internally.
 */
export function createRuntime(scene: Scene, options: RuntimeBootOptions = {}): TemplateRuntime {
  const doc = options.root?.ownerDocument ?? document;
  const root = options.root ?? doc.body;

  ensureBaselineCss(doc);
  doc.body.classList.add('cg-pending');

  const built = buildScene(scene, doc);
  root.appendChild(built.container);

  // D-020/D-026 — per-scope, non-persistent overrides (preview session / future
  // rundown) override the stored playout — and the scope's tickers' own
  // repeat/boundary — for THIS run only, keyed by the scope's instance-name path
  // (`''` = root). `playoutOverride` is the legacy root-only alias for
  // `scopeOverrides['']`.
  const overrides: Record<string, PlayoutOverride> = { ...(options.scopeOverrides ?? {}) };
  if (options.playoutOverride !== undefined && overrides[''] === undefined) {
    overrides[''] = options.playoutOverride;
  }

  const machine = new LifecycleStateMachine();
  const bus = new EventBus();
  // Nested so namespaced child-instance values (e.g. { home: { teamName } }) route
  // by namespace; a flat scene just uses top-level keys.
  let currentValues: NestedFieldValues = {};

  const ready: Promise<void> = options.skipFontLoad ? Promise.resolve() : waitForFonts(doc);
  void ready.then(() => bus.emit('ready'));

  // D-020/D-028 — each controller owns its scope's playhead. The default is
  // play-once-and-hold: it plays `[activeRange.in → outPoint]` once (an absent
  // `outPoint` is the last active frame) and holds, then the `mode` orchestration
  // (auto-out / loop-cycle) runs, with `holdSource` deciding what ends each hold
  // (timed `holdMs` vs. the scope's content sources completing). The stored
  // `playout` carries the defaults; `overrides` layers the session knobs per scope.
  const effectivePlayoutFor = (
    source: { playout?: Playout | undefined },
    path: string,
  ): Playout => {
    const b = playoutOf(source);
    const o = overrides[path];
    return {
      mode: o?.mode ?? b.mode,
      holdSource: o?.holdSource ?? b.holdSource,
      holdMs: o?.holdMs ?? b.holdMs,
      repeat: o?.repeat ?? b.repeat,
    };
  };

  // D-026 — the root scope alone drives the global lifecycle machine + events: its
  // exit settles the whole template's state/visibility once per exit.
  const rootOnExitStart = (): void => {
    if (machine.state === 'on-air' || machine.state === 'playing') {
      machine.transition('exiting');
      bus.emit('stop.start');
    }
  };
  const rootOnSettle = (): void => {
    if (machine.state === 'exiting') machine.transition('stopped');
    doc.body.classList.add('cg-pending');
    bus.emit('stop.end');
  };

  const noop = (): void => undefined;
  // Assigned once the wiring exists (the closure below fires long after). The
  // ROOT settling on its own (auto-out / finite loop-cycle / finite
  // content-driven) takes the whole template off air: cascade stop() to every
  // nested scope (settled children no-op per D-026) and freeze every driver —
  // otherwise an infinite nested lifecycle keeps timers/rAF rolling under the
  // hidden stage, with stop() unreachable (machine already 'stopped').
  let onRootSettled: () => void = noop;

  // Every wired subtree, in wiring order (the static tree first; repeater rows
  // join per stamp). The runtime-level cascades iterate this set.
  const subtrees = new Set<WiredSubtree>();

  /**
   * D-030 — wire ONE scope subtree: instantiate its drivers (tickers with
   * per-scope overrides, clocks, sequences) and build its controller tree,
   * returning a handle with symmetric teardown. Extracted from the original
   * inline wiring so a repeater can stamp/tear down row subtrees with exactly
   * the same machinery the static tree uses; behavior-preserving for the
   * static tree (`isRootSubtree` gates the root-only hooks: the external
   * `contentHold` override and the global machine/event wiring).
   */
  const wireScopeSubtree = (
    subtreeScope: FieldScope,
    subtreePath: string,
    isRootSubtree: boolean,
  ): WiredSubtree => {
    const tickers: TickerDriver[] = [];
    const clocks: ClockDriver[] = [];
    const sequences: SequenceDriver[] = [];
    const controllers: PlayoutController[] = [];

    const wireScope = (scope: FieldScope, path: string, isSubtreeRoot: boolean): ScopeNode => {
      const scopeOverride = overrides[path];
      // D-028 — one treadmill driver per ticker element, per scope (the same
      // child composition instanced twice gets two independent drivers).
      // Instantiated BEFORE the initial field application so a `list` field
      // default can already reconcile into its driver. The node→driver
      // registries are how the bindings applier routes `*-items` values.
      const scopeTickers = scope.tickers.map((t) => {
        // The crawl lives in the padding-inset viewport div (CSS padding is
        // inert for the abspos track), so the travel width shrinks with it.
        const pad = t.element.padding;
        const horizontalPad = pad === undefined ? 0 : pad.left + pad.right;
        const driver = new TickerDriver({
          band: t.band,
          track: t.track,
          viewportWidth: Math.max(0, t.element.transform.size.w - horizontalPad),
          direction: t.element.direction,
          speed: t.element.speed,
          gap: t.element.gap,
          separator: t.element.separator,
          items: t.element.items,
          // D-028 inner loop — the element's authored repeat/boundary, session-
          // overridable per scope (the same layering as holdMs/repeat).
          repeat: scopeOverride?.tickerRepeat ?? t.element.repeat,
          cycleBoundary: scopeOverride?.tickerBoundary ?? t.element.cycleBoundary,
          clock: options.clock,
          measure: options.tickerMeasure,
        });
        registerTickerDriver(t.band, driver);
        tickers.push(driver);
        return driver;
      });
      // D-027 — clock drivers (no overrides and no bindings: no fields in v1).
      const scopeClocks = scope.clocks.map((c) => {
        const driver = new ClockDriver({
          node: c.node,
          mode: c.element.mode,
          format: c.element.format,
          digits: c.element.digits,
          target: c.element.target,
          clock: options.clock,
        });
        clocks.push(driver);
        return driver;
      });
      // D-029 — sequence drivers; the host→driver registry routes
      // `sequence-items` bindings, and `runtime.next()` dispatches per scope.
      const scopeSequences = scope.sequences.map((s) => {
        const driver = new SequenceDriver({
          host: s.host,
          direction: s.element.direction,
          items: s.element.items,
          defaultDwellMs: s.element.defaultDwellMs,
          advance: s.element.advance,
          transitionIn: s.element.transitionIn,
          transitionOut: s.element.transitionOut,
          transitionTiming: s.element.transitionTiming,
          transitionMs: s.element.transitionMs,
          repeat: s.element.repeat,
          clock: options.clock,
        });
        registerSequenceDriver(s.host, driver);
        sequences.push(driver);
        return driver;
      });

      // D-028/D-027/D-029 — self-wire the scope's content completion from its
      // CONTENT SOURCES: every ticker, every countdown clock, and every
      // sequence in the scope. ALL tickers and sequences join the wait — an
      // infinite one's whenComplete() never resolves, which IS how it holds
      // the scope until stop(); only the clock filter is by kind (wall/countup
      // are excluded because they're not content sources at all). No content
      // sources ⇒ null ⇒ a zero-length hold. An EXPLICIT boot-option
      // `contentHold` still wins for the ROOT scope (external override / test
      // seam). Each hold entry resets + starts the scope's drivers, so every
      // open/close cycle replays the crawl / re-runs the count / restarts
      // from item 1.
      const scopeCountdowns = scopeClocks.filter((c) => c.mode === 'countdown');
      const contentWait =
        scopeTickers.length > 0 || scopeCountdowns.length > 0 || scopeSequences.length > 0
          ? (): Promise<void> =>
              Promise.all([
                ...scopeTickers.map((t) => t.whenComplete()),
                ...scopeCountdowns.map((c) => c.whenComplete()),
                ...scopeSequences.map((s) => s.whenComplete()),
              ]).then(() => undefined)
          : undefined;
      const isGlobalRoot = isSubtreeRoot && isRootSubtree;
      const externalWait =
        isGlobalRoot && options.contentHold !== undefined ? options.contentHold : undefined;
      const waitForContent = externalWait ?? contentWait;
      const stopScopeContent = (): void => {
        for (const t of scopeTickers) t.stop();
        for (const c of scopeClocks) c.stop();
        for (const s of scopeSequences) s.stop();
      };
      const controller = new PlayoutController({
        frameRate: scene.frameRate,
        active: activeRangeOf(scope.source),
        lifecycle: scope.source.lifecycle,
        playout: effectivePlayoutFor(scope.source, path),
        hasAnimation: scope.animated.length > 0,
        applyFrame: (frame: number): void => {
          for (const entry of scope.animated) applyAnimationAtFrame(entry, frame);
        },
        onExitStart: isGlobalRoot ? rootOnExitStart : noop,
        onSettle: isGlobalRoot
          ? (): void => {
              onRootSettled();
            }
          : stopScopeContent,
        waitForContent:
          waitForContent === undefined ? undefined : (): Promise<void> => waitForContent(),
        onHoldStart:
          scopeTickers.length > 0 || scopeClocks.length > 0 || scopeSequences.length > 0
            ? (): void => {
                // Fresh crawl / fresh count / fresh run from item 1 per
                // composition cycle (reset BEFORE the wait is requested, so
                // the controller awaits this run's completion).
                for (const t of scopeTickers) {
                  t.reset();
                  t.start();
                }
                for (const c of scopeClocks) {
                  c.reset();
                  c.start();
                }
                for (const s of scopeSequences) {
                  s.reset();
                  s.start();
                }
              }
            : undefined,
        clock: options.clock,
      });
      controllers.push(controller);
      // Build each child's path by appending its instance name to the parent's
      // dotted path (root = ''): '' → 'home' → 'home.inner'. This is the key
      // `effectivePlayoutFor`/`scopeOverrides` use to target one scope's timing.
      const children = scope.children.map((c) =>
        wireScope(c.scope, path === '' ? c.name : `${path}.${c.name}`, false),
      );
      return { controller, children };
    };

    const node = wireScope(subtreeScope, subtreePath, true);
    const sub: WiredSubtree = {
      node,
      tickers,
      clocks,
      sequences,
      destroy(): void {
        // Symmetric teardown, controllers first (stop timers/rAF before the
        // drivers release their DOM), then drivers — matching remove()'s
        // original order.
        for (const c of controllers) c.destroy();
        for (const t of tickers) t.destroy();
        for (const c of clocks) c.destroy();
        for (const s of sequences) s.destroy();
        subtrees.delete(sub);
      },
    };
    subtrees.add(sub);
    return sub;
  };

  // The static scene is the first (and for non-repeater scenes, only) subtree.
  const rootSub = wireScopeSubtree(built.scopeTree, '', true);
  const rootNode = rootSub.node;

  applyScopedFieldValues(scene, scene, {}, built.scopeTree);

  // D-026 — every scope (the root scene + each nested instance) owns its animated
  // elements on `scope.animated`. `allAnimated` is the flat union across the whole
  // tree, used by tick() (the designer scrubber) to paint one shared frame; each
  // scope's own controller animates only its own list along its own timeline.
  const allAnimated: AnimatedElement[] = [];
  collectScopeAnimated(built.scopeTree, allAnimated);

  // Per-element lifespan gates — only elements with an explicit
  // `lifespan` are tracked here; the rest stay visible for every
  // frame (the default behaviour the Designer ships with). We
  // remember the prior display value so the toggle restores the
  // element's own visibility instead of forcing `display: block`.
  const lifespanGates = collectLifespanGates(scene, built.elementMap);

  // Apply an operation to every controller in the tree (parent first), so
  // play/stop/pause/remove cascade to every nested instance.
  const cascade = (node: ScopeNode, op: (c: PlayoutController) => void): void => {
    op(node.controller);
    for (const child of node.children) cascade(child, op);
  };

  onRootSettled = (): void => {
    cascade(rootNode, (c) => c.stop()); // root itself is settled — a no-op
    for (const sub of subtrees) {
      for (const t of sub.tickers) t.stop();
      for (const c of sub.clocks) c.stop();
      for (const s of sub.sequences) s.stop();
    }
    rootOnSettle();
  };

  // D-029 — the per-scope next() dispatch, parent-first in wiring order (the
  // static tree first, then any stamped subtrees in stamp order). Today the
  // consumers are each scope's sequence drivers; this dispatch is DELIBERATELY
  // the seam the D-031 authored steps model will join (steps register as
  // another per-scope consumer here, defining their precedence vs. in-scope
  // sequences in that change). A template with no consumers is a safe no-op —
  // the optional `TemplateRuntime.next?` contract that the CasparCG `CG NEXT`
  // global (caspar-globals) already calls.
  const dispatchNext = (): void => {
    for (const sub of subtrees) {
      for (const s of sub.sequences) s.next();
    }
  };

  const runtime: TemplateRuntime = {
    ready,

    async play(data, _opts?: PlayOptions): Promise<void> {
      if (machine.state === 'removed') {
        throw new Error('Runtime removed; play() unavailable');
      }
      await ready;
      // Merge (don't replace) so a `CG PLAY` with no data preserves whatever a
      // prior `CG ADD`/`UPDATE` already set — the CasparCG flow updates first,
      // then plays with no args. play(data) still applies its data. Order no
      // longer matters (D-018/D-019 acceptance).
      currentValues = mergeNestedValues(currentValues, data as NestedFieldValues);
      applyScopedFieldValues(scene, scene, currentValues, built.scopeTree);
      machine.transition('playing');
      bus.emit('play.start');
      doc.body.classList.remove('cg-pending');
      machine.transition('on-air');
      // D-028 — a fresh run restarts every crawl from its entering edge (the
      // controllers' first hold then starts the treadmills).
      for (const sub of subtrees) for (const t of sub.tickers) t.reset();
      // D-027 — clocks reset to their initial value; ABSOLUTE clocks (wall,
      // datetime countdown) start now so they tick during the intro, while
      // relative counts display their initial value until their hold-entry
      // run begins (the hold entry resets + starts every scope clock).
      for (const sub of subtrees) {
        for (const c of sub.clocks) {
          c.reset();
          if (c.isAbsolute) c.start();
        }
      }
      // D-029 — sequences reset to item 1, displayed statically through the
      // intro; advancing begins at hold entry (which resets + starts them).
      for (const sub of subtrees) for (const s of sub.sequences) s.reset();
      // Play the IN once and hold (no full-range loop, no auto-outro by default);
      // the mode orchestration (auto-out / loop-cycle / content-driven) then runs.
      // Absent lifecycle: the whole timeline is the entrance and the hold is its
      // last frame. D-026 — cascades to every nested instance's own controller.
      cascade(rootNode, (c) => c.play());
      bus.emit('play.end');
    },

    async update(data, opts: UpdateOptions = {}): Promise<void> {
      if (machine.state === 'removed') {
        throw new Error('Runtime removed; update() unavailable');
      }
      const mode = opts.mode ?? 'merge';
      if (mode === 'replace') {
        currentValues = { ...(data as NestedFieldValues) };
      } else {
        currentValues = mergeNestedValues(currentValues, data as NestedFieldValues);
      }
      applyScopedFieldValues(scene, scene, currentValues, built.scopeTree);
      bus.emit('update');
    },

    async stop(_opts?: StopOptions): Promise<void> {
      if (machine.state === 'removed') return;
      if (machine.state !== 'on-air' && machine.state !== 'playing') return;
      // Lifecycle scenes: play the OUT (outro-start → active-out) then settle
      // hidden. Absent lifecycle: settle instantly (today's behaviour). The
      // controller drives onExitStart/onSettle (stop.start / stop.end + hide);
      // D-026 — each nested instance plays its OWN outro in cascade.
      cascade(rootNode, (c) => c.stop());
    },

    pause(): void {
      if (machine.state === 'removed') return;
      cascade(rootNode, (c) => c.pause());
      // D-028/D-027/D-029 — freeze the crawls, clocks, and sequences (dwell
      // AND in-flight transitions) in lockstep with the frozen hold timers.
      for (const sub of subtrees) for (const t of sub.tickers) t.pause();
      for (const sub of subtrees) for (const c of sub.clocks) c.pause();
      for (const sub of subtrees) for (const s of sub.sequences) s.pause();
    },

    resume(): void {
      if (machine.state === 'removed') return;
      cascade(rootNode, (c) => c.resume());
      for (const sub of subtrees) for (const t of sub.tickers) t.resume();
      for (const sub of subtrees) for (const c of sub.clocks) c.resume();
      for (const sub of subtrees) for (const s of sub.sequences) s.resume();
    },

    async next(): Promise<void> {
      if (machine.state === 'removed') return;
      // D-029 — implemented for real: dispatch to every wired scope's
      // sequence drivers, resolving immediately (a pre-run or mid-transition
      // next() is each driver's own no-op). See dispatchNext for the D-031
      // steps-model seam.
      dispatchNext();
    },

    remove(): void {
      if (machine.state === 'removed') return;
      // Symmetric subtree teardown (controllers, then drivers — see
      // WiredSubtree.destroy). Copy first: destroy() deregisters itself.
      for (const sub of [...subtrees]) sub.destroy();
      machine.forceTransition('removed');
      bus.clear();
      built.container.remove();
      doc.body.classList.remove('cg-pending');
      doc.body.classList.add('cg-removed');
    },

    tick(frame: number): void {
      for (const entry of allAnimated) applyAnimationAtFrame(entry, frame);
      for (const gate of lifespanGates) {
        const inside = frame >= gate.lifespan.in && frame <= gate.lifespan.out;
        gate.node.style.display = inside ? gate.naturalDisplay : 'none';
      }
    },

    on(event, listener) {
      return bus.on(event, listener);
    },
  };

  return runtime;
}

interface LifespanGate {
  node: HTMLElement;
  lifespan: FrameRange;
  /** display value the scene-builder set, restored when entering range. */
  naturalDisplay: string;
}

function collectLifespanGates(scene: Scene, elementMap: Map<string, HTMLElement>): LifespanGate[] {
  const out: LifespanGate[] = [];
  function walk(children: readonly Element[]): void {
    for (const el of children) {
      if (el.lifespan !== undefined) {
        const node = elementMap.get(el.id);
        if (node !== undefined) {
          out.push({ node, lifespan: el.lifespan, naturalDisplay: node.style.display });
        }
      }
      if (el.type === 'container') walk(el.children);
    }
  }
  for (const layer of scene.layers) walk(layer.children);
  return out;
}

function waitForFonts(doc: Document): Promise<void> {
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  if (!fonts?.ready) return Promise.resolve();
  return fonts.ready.then(() => undefined);
}
