import type { FieldValues, Scene } from '@cg/shared-schema';
import { applyFieldValues } from './bindings.js';
import { ensureBaselineCss } from './css.js';
import { EventBus } from './event-bus.js';
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

  // Apply field defaults synchronously so the initial paint shows the
  // declared defaults rather than the raw `{{placeholder}}` text.
  applyFieldValues(scene, {}, built.elementMap, built.textOriginals, built.container);

  const machine = new LifecycleStateMachine();
  const bus = new EventBus();
  let currentValues: FieldValues = {};

  const ready: Promise<void> = options.skipFontLoad ? Promise.resolve() : waitForFonts(doc);

  void ready.then(() => bus.emit('ready'));

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
      // pending|stopped|on-air → playing → on-air (instant in M3.2-α)
      if (machine.state === 'on-air') {
        machine.transition('playing');
      } else {
        machine.transition('playing');
      }
      bus.emit('play.start');
      doc.body.classList.remove('cg-pending');
      machine.transition('on-air');
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
      machine.transition('exiting');
      bus.emit('stop.start');
      doc.body.classList.add('cg-pending');
      machine.transition('stopped');
      bus.emit('stop.end');
    },

    remove(): void {
      if (machine.state === 'removed') return;
      machine.forceTransition('removed');
      bus.clear();
      built.container.remove();
      doc.body.classList.remove('cg-pending');
      doc.body.classList.add('cg-removed');
    },

    on(event, listener) {
      return bus.on(event, listener);
    },
  };

  return runtime;
}

/**
 * Wait for the document's font set to load. Tolerates environments that
 * don't implement the FontFaceSet API (happy-dom and older Electron CEF
 * versions both fall into this bucket).
 */
function waitForFonts(doc: Document): Promise<void> {
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  if (!fonts?.ready) return Promise.resolve();
  return fonts.ready.then(() => undefined);
}
