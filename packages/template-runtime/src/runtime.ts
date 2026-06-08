import {
  activeRangeOf,
  playoutOf,
  type Element,
  type FieldValues,
  type FrameRange,
  type Scene,
} from '@cg/shared-schema';
import {
  applyAnimationAtFrame,
  collectAnimatedElements,
  type AnimatedElement,
} from './animation-applier.js';
import { applyFieldValues } from './bindings.js';
import { ensureBaselineCss } from './css.js';
import { EventBus } from './event-bus.js';
import { LifecycleStateMachine } from './lifecycle.js';
import { PlayoutController } from './playout-controller.js';
import { buildScene } from './scene-builder.js';
import type {
  PlayOptions,
  RuntimeBootOptions,
  StopOptions,
  TemplateRuntime,
  UpdateOptions,
} from './types.js';

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

  applyFieldValues(scene, {}, built.elementMap, built.textOriginals, built.container);

  const animated: AnimatedElement[] = [
    ...collectAnimatedElements(
      scene.layers.map((l) => l.children),
      built.elementMap,
    ),
    // Elements inside nested composition instances — already paired with their
    // concrete nodes during the build, so their own animation plays along the
    // parent timeline.
    ...built.nestedAnimated,
  ];

  // Per-element lifespan gates — only elements with an explicit
  // `lifespan` are tracked here; the rest stay visible for every
  // frame (the default behaviour the Designer ships with). We
  // remember the prior display value so the toggle restores the
  // element's own visibility instead of forcing `display: block`.
  const lifespanGates = collectLifespanGates(scene, built.elementMap);

  const machine = new LifecycleStateMachine();
  const bus = new EventBus();
  let currentValues: FieldValues = {};

  const ready: Promise<void> = options.skipFontLoad ? Promise.resolve() : waitForFonts(doc);
  void ready.then(() => bus.emit('ready'));

  const applyFrame = (frame: number): void => {
    for (const entry of animated) applyAnimationAtFrame(entry, frame);
  };

  // D-020 — the controller owns the playhead. Without a `lifecycle` it loops the
  // active region exactly as the old FrameDriver did (backward-compatible); with
  // one it runs IN → hold → OUT and the auto-out / loop-cycle timing. The
  // exit callbacks settle the lifecycle state + visibility once per exit.
  const controller = new PlayoutController({
    frameRate: scene.frameRate,
    active: activeRangeOf(scene),
    lifecycle: scene.lifecycle,
    playout: playoutOf(scene),
    hasAnimation: animated.length > 0,
    applyFrame,
    onExitStart: () => {
      if (machine.state === 'on-air' || machine.state === 'playing') {
        machine.transition('exiting');
        bus.emit('stop.start');
      }
    },
    onSettle: () => {
      if (machine.state === 'exiting') machine.transition('stopped');
      doc.body.classList.add('cg-pending');
      bus.emit('stop.end');
    },
    durationHook: options.durationHook,
    clock: options.clock,
  });

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
      currentValues = { ...currentValues, ...data };
      applyFieldValues(
        scene,
        currentValues,
        built.elementMap,
        built.textOriginals,
        built.container,
      );
      machine.transition('playing');
      bus.emit('play.start');
      doc.body.classList.remove('cg-pending');
      machine.transition('on-air');
      // Lifecycle scenes: play the IN once and hold (no full-range loop, no
      // auto-outro). Absent lifecycle: loop the active region as before.
      controller.play();
      bus.emit('play.end');
    },

    async update(data, opts: UpdateOptions = {}): Promise<void> {
      if (machine.state === 'removed') {
        throw new Error('Runtime removed; update() unavailable');
      }
      const mode = opts.mode ?? 'merge';
      if (mode === 'replace') {
        currentValues = { ...(data as FieldValues) };
      } else {
        currentValues = { ...currentValues, ...(data as FieldValues) };
      }
      applyFieldValues(
        scene,
        currentValues,
        built.elementMap,
        built.textOriginals,
        built.container,
      );
      bus.emit('update');
    },

    async stop(_opts?: StopOptions): Promise<void> {
      if (machine.state === 'removed') return;
      if (machine.state !== 'on-air' && machine.state !== 'playing') return;
      // Lifecycle scenes: play the OUT (outro-start → active-out) then settle
      // hidden. Absent lifecycle: settle instantly (today's behaviour). The
      // controller drives onExitStart/onSettle (stop.start / stop.end + hide).
      controller.stop();
    },

    pause(): void {
      if (machine.state === 'removed') return;
      controller.pause();
    },

    resume(): void {
      if (machine.state === 'removed') return;
      controller.resume();
    },

    remove(): void {
      if (machine.state === 'removed') return;
      controller.destroy();
      machine.forceTransition('removed');
      bus.clear();
      built.container.remove();
      doc.body.classList.remove('cg-pending');
      doc.body.classList.add('cg-removed');
    },

    tick(frame: number): void {
      for (const entry of animated) applyAnimationAtFrame(entry, frame);
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
