import {
  frameTransitionPhases,
  inputSlideVector,
  type ControlLiveLayout,
  type FitRect,
  type LiveSourceRect,
} from '@cg/shared-schema';
import type { TemplateLook } from '@cg/shared-ipc';
import { presetFrameArtwork } from './rehearsalPresetEffects.js';
import { focusSlideOcclusion } from '../liveLayouts/focusSlideClip.js';

type Effects = ControlLiveLayout['effects'];
interface FrameSide {
  look: TemplateLook;
  frameId: string;
  anchor: LiveSourceRect | undefined;
}

// A source that cannot be sampled must not stall the rest of the browser preview.
const WAIT_FOR_PICTURE_MS = 2_500;
const PROBE_PICTURE_MS = 40;

const easings = {
  linear: 'linear',
  easeinquad: 'cubic-bezier(.55,.085,.68,.53)',
  easeoutquad: 'cubic-bezier(.25,.46,.45,.94)',
  easeinoutquad: 'cubic-bezier(.455,.03,.515,.955)',
};

function artworkNode(doc: Document, side: FrameSide): HTMLElement | undefined {
  // Authoring placement permission is independent of a preset's own animation.
  const key =
    side.look.transitionFrames?.[side.frameId]?.frameKey ??
    side.look.operatorFrames?.[side.frameId]?.frameKey;
  if (key === undefined) return undefined;
  // Active masks can give one logical frame two authored plate leaves. The
  // general placement target may then own only the active leaf. Capture its
  // full frame branch so the attached graphic and captions travel as well.
  const branchKey = key.split('/').slice(0, 2).join('/');
  const wrapper =
    Array.from(doc.querySelectorAll<HTMLElement>('[data-cg-preset-departure-key]')).find(
      (node) => node.dataset['cgPresetDepartureKey'] === branchKey,
    ) ?? presetFrameArtwork(doc.querySelectorAll<HTMLElement>('[data-cg-frame-artwork]'), key);
  // The layout-transparent wrapper can have zero height. The composed frame
  // under it has the rendered picture bounds and includes its linked title.
  return wrapper?.querySelector<HTMLElement>(':scope > [data-cg-element-id]') ?? undefined;
}

interface PicturePlane {
  node: HTMLDivElement;
  bounds: FitRect;
  restore: () => void;
}

/** Move the authored subtree as one visual unit, keeping its media and animation instances. */
function mountPlane(
  viewport: HTMLElement,
  root: HTMLElement,
  role: 'incoming' | 'outgoing',
): PicturePlane | undefined {
  const { x, y, width, height } = root.getBoundingClientRect();
  const localWidth = root.offsetWidth;
  const localHeight = root.offsetHeight;
  if (width <= 0 || height <= 0 || localWidth <= 0 || localHeight <= 0) return undefined;
  const temporaryStyles = {
    position: 'absolute',
    top: '0',
    left: '0',
    width: `${String(localWidth)}px`,
    height: `${String(localHeight)}px`,
    'transform-origin': '0 0',
    transform: `scale(${String(width / localWidth)}, ${String(height / localHeight)})`,
  };
  const restoreStyles = Object.entries(temporaryStyles).map(([property, value]) => {
    const before = root.style.getPropertyValue(property);
    const priority = root.style.getPropertyPriority(property);
    root.style.setProperty(property, value);
    return () => root.style.setProperty(property, before, priority);
  });
  const plane = viewport.ownerDocument.createElement('div');
  plane.dataset['cgPvwFocusPlane'] = role;
  plane.style.cssText = 'position:absolute;pointer-events:none;transform-origin:0 0';
  Object.assign(plane.style, {
    left: `${String(x)}px`,
    top: `${String(y)}px`,
    width: `${String(width)}px`,
    height: `${String(height)}px`,
  });
  const origin = viewport.ownerDocument.createComment('Focus plate');
  root.before(origin);
  viewport.append(plane);
  plane.append(root);
  return {
    node: plane,
    bounds: { x, y, width, height },
    restore: () => {
      for (const reset of restoreStyles) reset();
      origin.replaceWith(root);
    },
  };
}

function motionTransform(
  bounds: FitRect,
  anchor: LiveSourceRect | undefined,
  resolution: ControlLiveLayout['resolution'],
  progressToAnchor: number,
): string {
  // A frame outside the origin preset grows from its centre on first arrival.
  const rect = anchor ?? {
    x: resolution.width * 0.375,
    y: resolution.height * 0.375,
    width: resolution.width * 0.25,
    height: resolution.height * 0.25,
  };
  const sx = rect.width / resolution.width;
  const sy = rect.height / resolution.height;
  return `translate(${String((rect.x / resolution.width) * bounds.width * progressToAnchor)}px, ${String((rect.y / resolution.height) * bounds.height * progressToAnchor)}px) scale(${String(1 + (sx - 1) * progressToAnchor)}, ${String(1 + (sy - 1) * progressToAnchor)})`;
}

function frameMotion(
  plane: PicturePlane,
  side: FrameSide,
  resolution: ControlLiveLayout['resolution'],
  effects: Effects,
  period: number,
  incoming: boolean,
): Animation | undefined {
  const { node, bounds } = plane;
  const steps = frameTransitionPhases(
    { ...effects.focus, durationMs: effects.switch.durationMs },
    Math.max(1, Math.round(effects.switch.durationMs / period)),
  );
  const total = steps.reduce((sum, step) => sum + step.frames, 0);
  if (total === 0) return undefined;
  let elapsed = 0;
  const keyframes: Keyframe[] = [
    {
      opacity: incoming ? 0 : 1,
      transform: motionTransform(bounds, side.anchor, resolution, incoming ? 1 : 0),
      offset: 0,
    },
  ];
  for (const step of steps) {
    const previous = keyframes.at(-1);
    if (previous !== undefined) previous.easing = easings[step.easing];
    elapsed += step.frames;
    const time = elapsed / total;
    keyframes.push({
      opacity: step.opacity * (incoming ? time : 1 - time),
      transform: motionTransform(
        bounds,
        side.anchor,
        resolution,
        incoming ? 1 - step.progress : step.progress,
      ),
      offset: time,
    });
  }
  return node.animate(keyframes, { duration: total * period, fill: 'both' });
}

function directionalMotion(
  outgoing: PicturePlane,
  incoming: PicturePlane,
  effect: Effects['switch'],
  duration: number,
): Animation[] {
  if (effect.mode === 'fade') {
    return [incoming.node.animate([{ opacity: 0 }, { opacity: 1 }], { duration, fill: 'both' })];
  }
  const direction = inputSlideVector(effect.direction);
  const shift = (side: number): string =>
    `translate(${String(direction.x * side * 100)}%, ${String(direction.y * side * 100)}%)`;
  const animations = [
    incoming.node.animate([{ transform: shift(1) }, { transform: shift(0) }], {
      duration,
      fill: 'both',
    }),
  ];
  if (effect.mode === 'push') {
    animations.push(
      outgoing.node.animate([{ transform: shift(0) }, { transform: shift(-1) }], {
        duration,
        fill: 'both',
      }),
    );
  } else {
    animations.push(
      outgoing.node.animate(
        [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: focusSlideOcclusion(effect.direction) }],
        { duration, fill: 'both' },
      ),
    );
  }
  return animations;
}

/**
 * Animate the two authored full-frame looks in the retained iframe. The old
 * look stays visible while the next snapshot is fetched. The callback commits
 * the page locally once, then the captured picture/title planes own the
 * operator-selected effect independently of the console's UI motion setting.
 */
export function previewFocusSwitch({
  doc,
  before,
  after,
  layout,
  period,
  pictureReady,
  commit,
  settled,
}: {
  doc: Document;
  before: FrameSide;
  after: FrameSide;
  layout: ControlLiveLayout;
  period: number;
  pictureReady: () => boolean;
  commit: () => void;
  settled: (commitTarget: boolean) => void;
}): (commitTarget?: boolean) => void {
  const deadline = performance.now() + WAIT_FOR_PICTURE_MS;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let viewport: HTMLDivElement | undefined;
  const planes: PicturePlane[] = [];
  let animations: Animation[] = [];

  const finish = (commitTarget = false): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    for (const animation of animations) animation.cancel();
    for (const plane of planes) plane.restore();
    viewport?.remove();
    settled(commitTarget);
  };

  function start(): void {
    if (done) return;
    if (!pictureReady() && performance.now() < deadline) {
      timer = setTimeout(start, PROBE_PICTURE_MS);
      return;
    }
    const { effects } = layout;
    if (
      effects.switch.mode === 'cut' ||
      (effects.switch.mode === 'motion' && effects.focus.motion === 'cut' && !effects.focus.fade)
    ) {
      commit();
      finish(true);
      return;
    }
    viewport = doc.createElement('div');
    viewport.dataset['cgPvwFocusSwitch'] = effects.switch.mode;
    viewport.style.cssText =
      'position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:2147483647';
    viewport.setAttribute('aria-hidden', 'true');
    doc.body.append(viewport);
    const outgoingNode = artworkNode(doc, before);
    const outgoing =
      outgoingNode === undefined ? undefined : mountPlane(viewport, outgoingNode, 'outgoing');
    if (outgoing !== undefined) planes.push(outgoing);
    commit();
    const incomingNode = artworkNode(doc, after);
    const incoming =
      incomingNode === undefined ? undefined : mountPlane(viewport, incomingNode, 'incoming');
    if (incoming !== undefined) planes.push(incoming);
    if (
      outgoing === undefined ||
      incoming === undefined ||
      typeof incoming.node.animate !== 'function'
    ) {
      finish(true);
      return;
    }
    const duration = Math.max(1, Math.round(effects.switch.durationMs / period)) * period;
    animations =
      effects.switch.mode === 'motion'
        ? [
            frameMotion(outgoing, before, layout.resolution, effects, period, false),
            frameMotion(incoming, after, layout.resolution, effects, period, true),
          ].filter((entry): entry is Animation => entry !== undefined)
        : directionalMotion(outgoing, incoming, effects.switch, duration);
    void Promise.all(animations.map((animation) => animation.finished)).then(
      () => finish(true),
      () => finish(false),
    );
  }

  // The caller installs the cancellation scope before the first page update.
  timer = setTimeout(start, 0);
  return finish;
}
