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
function mergeNestedValues(
  base: NestedFieldValues,
  patch: NestedFieldValues,
): NestedFieldValues {
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

  // D-020 — each controller owns its scope's playhead. The default is
  // play-once-and-hold: it plays `[activeRange.in → outPoint]` once (an absent
  // `outPoint` is the last active frame) and holds, then the `mode` orchestration
  // (auto-out / loop-cycle / content-driven) runs. Looping is no longer a silent
  // default and there is no separate continuous-loop mode — a looping logo is
  // `loop-cycle` with `repeat: 'infinite'`. The stored `playout` carries the
  // defaults.
  //
  // D-026 — per-scope, non-persistent overrides (preview session / future rundown)
  // override the stored playout for THIS run only, keyed by the scope's
  // instance-name path (`''` = root). `playoutOverride` is the legacy root-only
  // alias for `scopeOverrides['']`.
  const overrides: Record<string, PlayoutOverride> = { ...(options.scopeOverrides ?? {}) };
  if (options.playoutOverride !== undefined && overrides[''] === undefined) {
    overrides[''] = options.playoutOverride;
  }
  const effectivePlayoutFor = (source: { playout?: Playout | undefined }, path: string): Playout => {
    const b = playoutOf(source);
    const o = overrides[path];
    return {
      mode: o?.mode ?? b.mode,
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
  const buildScopeController = (scope: FieldScope, isRoot: boolean, path: string): ScopeNode => {
    const own = scope.animated;
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
      onSettle: isRoot ? rootOnSettle : noop,
      durationHook: isRoot ? options.durationHook : undefined,
      clock: options.clock,
    });
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
    },

    resume(): void {
      if (machine.state === 'removed') return;
      cascade(rootNode, (c) => c.resume());
    },

    remove(): void {
      if (machine.state === 'removed') return;
      cascade(rootNode, (c) => c.destroy());
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
