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
  // `scopeOverrides['']`. Hoisted above driver instantiation so ticker overrides
  // can apply at construction.
  const overrides: Record<string, PlayoutOverride> = { ...(options.scopeOverrides ?? {}) };
  if (options.playoutOverride !== undefined && overrides[''] === undefined) {
    overrides[''] = options.playoutOverride;
  }

  // D-028 — one treadmill driver per ticker element, per scope (the same child
  // composition instanced twice gets two independent drivers). Instantiated
  // BEFORE the initial field application below so a `list` field default can
  // already reconcile into its driver. The band→driver registry is how the
  // bindings applier routes `ticker-items` values.
  const allTickers: TickerDriver[] = [];
  const tickersByScope = new Map<FieldScope, TickerDriver[]>();
  const instantiateTickers = (scope: FieldScope, path: string): void => {
    const scopeOverride = overrides[path];
    const drivers = scope.tickers.map((t) => {
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
      allTickers.push(driver);
      return driver;
    });
    if (drivers.length > 0) tickersByScope.set(scope, drivers);
    for (const child of scope.children) {
      instantiateTickers(child.scope, path === '' ? child.name : `${path}.${child.name}`);
    }
  };
  instantiateTickers(built.scopeTree, '');

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
  // (timed `holdMs` vs. the scope's tickers completing). Looping is no longer a
  // silent default and there is no separate continuous-loop mode — a looping
  // logo is `loop-cycle` with `repeat: 'infinite'`. The stored `playout` carries
  // the defaults; `overrides` (hoisted above) layers the session knobs per scope.
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

  // D-026 — build a PARALLEL controller tree over the field-scope tree: one
  // controller per scope, all on the single project fps (`scene.frameRate`). The
  // root drives the machine/events; each scope uses its own stored
  // `playout`/`lifecycle`/`activeRange` merged with its per-scope override, so
  // play/stop/pause cascade while every child runs its own in→hold→out
  // independently and can be timed independently in the preview.
  const noop = (): void => undefined;
  // Assigned once the controller tree exists (the closure below fires long
  // after). The ROOT settling on its own (auto-out / finite loop-cycle /
  // finite content-driven) takes the whole template off air: cascade stop()
  // to every nested scope (settled children no-op per D-026) and freeze every
  // crawl — otherwise an infinite nested lifecycle keeps timers/rAF rolling
  // under the hidden stage, with stop() unreachable (machine already
  // 'stopped').
  let onRootSettled: () => void = noop;
  const buildScopeController = (scope: FieldScope, isRoot: boolean, path: string): ScopeNode => {
    const own = scope.animated;
    // D-028 — self-wire the scope's content completion from its tickers: a
    // `holdSource: 'content-driven'` hold lasts until EVERY scope ticker's run
    // resolves (an infinite ticker never resolves ⇒ hold until stop(); no
    // tickers ⇒ null ⇒ a zero-length hold). An EXPLICIT boot-option
    // `contentHold` still wins for the root scope (external override / test
    // seam). Each hold entry resets + starts the scope's tickers, so every
    // open/close cycle replays the crawl from its entering edge.
    const scopeTickers = tickersByScope.get(scope) ?? [];
    const tickerWait =
      scopeTickers.length > 0
        ? (): Promise<void> =>
            Promise.all(scopeTickers.map((t) => t.whenComplete())).then(() => undefined)
        : undefined;
    const externalWait = isRoot && options.contentHold !== undefined ? options.contentHold : undefined;
    const waitForContent = externalWait ?? tickerWait;
    const stopScopeTickers = (): void => {
      for (const t of scopeTickers) t.stop();
    };
    const controller = new PlayoutController({
      frameRate: scene.frameRate,
      active: activeRangeOf(scope.source),
      lifecycle: scope.source.lifecycle,
      playout: effectivePlayoutFor(scope.source, path),
      hasAnimation: own.length > 0,
      applyFrame: (frame: number): void => {
        for (const entry of own) applyAnimationAtFrame(entry, frame);
      },
      onExitStart: isRoot ? rootOnExitStart : noop,
      onSettle: isRoot
        ? (): void => {
            onRootSettled();
          }
        : stopScopeTickers,
      waitForContent: waitForContent === undefined ? undefined : (): Promise<void> => waitForContent(),
      onHoldStart:
        scopeTickers.length > 0
          ? (): void => {
              // Fresh crawl per composition cycle (reset BEFORE the wait is
              // requested, so the controller awaits this run's completion).
              for (const t of scopeTickers) {
                t.reset();
                t.start();
              }
            }
          : undefined,
      clock: options.clock,
    });
    // Build each child's path by appending its instance name to the parent's
    // dotted path (root = ''): '' → 'home' → 'home.inner'. This is the key
    // `effectivePlayoutFor`/`scopeOverrides` use to target one scope's timing.
    const children = scope.children.map((c) =>
      buildScopeController(c.scope, false, path === '' ? c.name : `${path}.${c.name}`),
    );
    return { controller, children };
  };
  const rootNode = buildScopeController(built.scopeTree, true, '');

  // Apply an operation to every controller in the tree (parent first), so
  // play/stop/pause/resume/remove cascade to every nested instance.
  const cascade = (node: ScopeNode, op: (c: PlayoutController) => void): void => {
    op(node.controller);
    for (const child of node.children) cascade(child, op);
  };

  onRootSettled = (): void => {
    cascade(rootNode, (c) => c.stop()); // root itself is settled — a no-op
    for (const t of allTickers) t.stop();
    rootOnSettle();
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
      for (const t of allTickers) t.reset();
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
      // D-028 — freeze the crawls in lockstep with the frozen hold timers.
      for (const t of allTickers) t.pause();
    },

    resume(): void {
      if (machine.state === 'removed') return;
      cascade(rootNode, (c) => c.resume());
      for (const t of allTickers) t.resume();
    },

    remove(): void {
      if (machine.state === 'removed') return;
      cascade(rootNode, (c) => c.destroy());
      for (const t of allTickers) t.destroy();
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
