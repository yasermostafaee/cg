import {
  activeRangeOf,
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
import { FrameDriver } from './frame-driver.js';
import { LifecycleStateMachine } from './lifecycle.js';
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

  const animated: AnimatedElement[] = collectAnimatedElements(
    scene.layers.map((l) => l.children),
    built.elementMap,
  );

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

  let driver: FrameDriver | null = null;
  const startDriver = (): void => {
    if (animated.length === 0) return;
    driver = new FrameDriver({
      frameRate: scene.frameRate,
      // The active region (resized scene bar) is the play / export window;
      // it falls back to the full frameRange when unset.
      range: activeRangeOf(scene),
      onFrame: (frame) => {
        for (const entry of animated) applyAnimationAtFrame(entry, frame);
      },
    });
    driver.start();
  };
  const stopDriver = (): void => {
    if (driver !== null) {
      driver.stop();
      driver = null;
    }
  };

  const runtime: TemplateRuntime = {
    ready,

    async play(data, _opts?: PlayOptions): Promise<void> {
      if (machine.state === 'removed') {
        throw new Error('Runtime removed; play() unavailable');
      }
      await ready;
      currentValues = { ...data };
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
      startDriver();
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
      stopDriver();
      machine.transition('exiting');
      bus.emit('stop.start');
      doc.body.classList.add('cg-pending');
      machine.transition('stopped');
      bus.emit('stop.end');
    },

    remove(): void {
      if (machine.state === 'removed') return;
      stopDriver();
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
