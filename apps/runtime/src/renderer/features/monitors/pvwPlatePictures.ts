import {
  DEFAULT_LIVE_FIT_MODE,
  fitPictureToBox,
  inputSlideVector,
  intersectNormalizedRects,
  isInputSlideMode,
  livePlateMaskRegions,
  liveRevealRects,
  liveRevealSceneRect,
  type FitRect,
  type InputTransition,
} from '@cg/shared-schema';
import type { PlatePlacement } from './livePlateGeometry.js';
import type { PvwSourceFrame } from './usePvwSourceFrames.js';

/** Position the delivered JPEG so its active rectangle exactly fills the source picture. */
export function fullJpegRect(picture: FitRect, activeRect: FitRect): FitRect {
  const width = picture.width / activeRect.width;
  const height = picture.height / activeRect.height;
  return {
    x: picture.x - activeRect.x * width,
    y: picture.y - activeRect.y * height,
    width,
    height,
  };
}

function pictureFor(plate: PlatePlacement, frames: ReadonlyMap<string, PvwSourceFrame>) {
  const frame = plate.sourceId === null ? undefined : frames.get(plate.sourceId);
  if (frame?.jpegBase64 === undefined || !frame.width || !frame.height) return undefined;
  const fit = fitPictureToBox(
    plate,
    frame.geometry?.sourceAspect ?? frame.width / frame.height,
    plate.cropEdges ? 'cover' : DEFAULT_LIVE_FIT_MODE,
    plate.focus,
  );
  return {
    ...fit,
    jpeg:
      frame.geometry === undefined
        ? fit.picture
        : fullJpegRect(fit.picture, frame.geometry.activeRect),
    sourceId: frame.sourceId,
    jpegBase64: frame.jpegBase64,
    geometryRevision: frame.geometry?.revision ?? '',
  };
}

function percent(value: number, extent: number): string {
  return `${String((value / extent) * 100)}%`;
}

function placeWithin(el: HTMLElement, rect: FitRect, box: FitRect): void {
  el.style.left = percent(rect.x - box.x, box.width);
  el.style.top = percent(rect.y - box.y, box.height);
  el.style.width = percent(rect.width, box.width);
  el.style.height = percent(rect.height, box.height);
}

function pictureWindows(plate: PlatePlacement): readonly FitRect[] {
  return plate.mask === undefined
    ? [plate]
    : livePlateMaskRegions(plate.mask).map((rect) => liveRevealSceneRect(plate, rect));
}

function paintSnapshot(image: HTMLImageElement, picture: Picture, window: FitRect): void {
  placeWithin(image, picture.jpeg, window);
  const url = `data:image/jpeg;base64,${picture.jpegBase64}`;
  if (image.getAttribute('src') !== url) image.src = url;
}

function sameBox(node: HTMLElement, plate: PlatePlacement): boolean {
  const bounds = node.getBoundingClientRect();
  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    Math.abs(bounds.x - plate.x) < 2 &&
    Math.abs(bounds.y - plate.y) < 2 &&
    Math.abs(bounds.width - plate.width) < 2 &&
    Math.abs(bounds.height - plate.height) < 2
  );
}

const pendingInputPicture = new WeakMap<HTMLElement, { sourceId: string }>();
type Picture = NonNullable<ReturnType<typeof pictureFor>>;
const paintedPictures = new WeakMap<
  HTMLElement,
  { picture: Picture; plate: PlatePlacement; windowIndex?: number }
>();

/** Keep the source pixels proportional while the template moves their containing plate. */
export function followPvwPresetPictures(
  doc: Document,
  before: readonly PlatePlacement[],
  after: readonly PlatePlacement[],
  frames: ReadonlyMap<string, PvwSourceFrame>,
  retained: ReadonlySet<string>,
): (() => void) | undefined {
  const previous = new Map(before.map((plate) => [plate.plateId, plate]));
  const next = new Map(after.map((plate) => [plate.plateId, plate]));
  const reveals = new Set(
    [...before, ...after].flatMap(({ reveal }) => (reveal ? [reveal.targetSourceId] : [])),
  );
  const axes = ['x', 'y', 'width', 'height'] as const;
  const moving = Array.from(
    doc.querySelectorAll<HTMLElement>('[data-cg-pvw-picture-kind="own"]'),
  ).flatMap((part) => {
    const node = part.parentElement;
    const artwork = node?.closest<HTMLElement>('[data-cg-frame-artwork]');
    const image = part.querySelector('img');
    const id = node?.dataset['cgLiveSource'];
    const windowIndex = paintedPictures.get(part)?.windowIndex;
    if (
      node === null ||
      artwork == null ||
      image === null ||
      id === undefined ||
      windowIndex === undefined ||
      !retained.has(id) ||
      reveals.has(id)
    )
      return [];
    const from = previous.get(id);
    const to = next.get(id);
    if (
      from === undefined ||
      to === undefined ||
      from.reveal !== undefined ||
      to.reveal !== undefined ||
      from.sourceId !== to.sourceId ||
      part.dataset['sourceId'] !== from.sourceId ||
      !sameBox(node, from)
    )
      return [];
    const first = pictureFor(from, frames);
    const last = pictureFor(to, frames);
    if (first === undefined || last === undefined) return [];
    const fromWindows = pictureWindows(from);
    const toWindows = pictureWindows(to);
    const fromWindow = fromWindows[windowIndex];
    const toWindow = toWindows[windowIndex];
    if (
      fromWindows.length !== toWindows.length ||
      fromWindow === undefined ||
      toWindow === undefined
    )
      return [];
    const fromClip = intersectNormalizedRects(first.visible, fromWindow);
    const toClip = intersectNormalizedRects(last.visible, toWindow);
    if (fromClip === null || toClip === null) return [];
    const axis = axes.reduce((most, key) =>
      Math.abs(to[key] - from[key]) > Math.abs(to[most] - from[most]) ? key : most,
    );
    const distance = to[axis] - from[axis];
    if (Math.abs(distance) < 1) return [];
    return [
      {
        node,
        artwork,
        part,
        image,
        first,
        last,
        fromClip,
        toClip,
        axis,
        from,
        distance,
        partStyle: part.style.cssText,
        imageStyle: image.style.cssText,
      },
    ];
  });
  if (moving.length === 0) return undefined;

  // The picture measures the transform just written by the page. A separate rAF
  // registered before the page would otherwise use the previous animation sample.
  const paint = () => {
    const samples = moving.map((item) => ({ ...item, box: item.node.getBoundingClientRect() }));
    for (const {
      part,
      image,
      first,
      last,
      fromClip,
      toClip,
      axis,
      from,
      distance,
      box,
    } of samples) {
      if (box.width <= 0 || box.height <= 0) continue;
      const progress = Math.max(0, Math.min(1, (box[axis] - from[axis]) / distance));
      const interpolate = (start: FitRect, end: FitRect): FitRect => ({
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
        width: start.width + (end.width - start.width) * progress,
        height: start.height + (end.height - start.height) * progress,
      });
      const visible = interpolate(fromClip, toClip);
      if (visible === null) continue;
      placeWithin(part, visible, box);
      placeWithin(image, interpolate(first.jpeg, last.jpeg), visible);
    }
  };
  const observer = new MutationObserver(paint);
  for (const artwork of new Set(moving.map((item) => item.artwork))) {
    observer.observe(artwork, { attributes: true, attributeFilter: ['style'] });
  }
  return () => {
    observer.disconnect();
    for (const { part, image, partStyle, imageStyle } of moving) {
      part.style.cssText = partStyle;
      image.style.cssText = imageStyle;
    }
  };
}

export interface PvwInputEffect {
  cancel(): void;
  refresh?(plates: readonly PlatePlacement[], frames: ReadonlyMap<string, PvwSourceFrame>): void;
}

/** Hold the prior picture while the requested source's first usable snapshot arrives. */
export function paintPvwSourceTransition(
  doc: Document,
  plates: readonly PlatePlacement[],
  frames: ReadonlyMap<string, PvwSourceFrame>,
  effect: InputTransition,
  active: { current: PvwInputEffect | undefined },
): void {
  const changing = new Map(
    plates.filter(({ sourceId }) => sourceId !== null).map((plate) => [plate.plateId, plate]),
  );
  const outgoing = Array.from(
    doc.querySelectorAll<HTMLElement>('[data-cg-pvw-picture-part][data-cg-pvw-picture-kind="own"]'),
  ).flatMap((part) => {
    const node = part.parentElement;
    const id = node?.dataset['cgLiveSource'];
    const plate = id === undefined ? undefined : changing.get(id);
    if (
      node === null ||
      plate === undefined ||
      plate.sourceId === null ||
      part.dataset['sourceId'] === plate.sourceId ||
      !sameBox(node, plate)
    )
      return [];
    return [{ part, node, plate, sourceId: plate.sourceId }];
  });
  const ready = (plate: PlatePlacement): boolean => pictureFor(plate, frames) !== undefined;
  const pending = new Set(outgoing.filter(({ plate }) => !ready(plate)).map(({ part }) => part));
  for (const { part, sourceId } of outgoing) {
    if (!pending.has(part)) {
      pendingInputPicture.delete(part);
    } else if (pendingInputPicture.get(part)?.sourceId !== sourceId) {
      const request = { sourceId };
      pendingInputPicture.set(part, request);
      // A source can be outside the monitor's snapshot budget or have no preview service.
      setTimeout(() => {
        if (pendingInputPicture.get(part) !== request) return;
        pendingInputPicture.delete(part);
        part.remove();
      }, 2_500);
    }
  }
  const incoming = outgoing.filter(({ part }) => !pending.has(part));
  if (incoming.length > 0) active.current?.cancel();
  const clones =
    effect.mode !== 'fade'
      ? []
      : incoming.map(({ part, node }) => {
          const copy = part.cloneNode(true) as HTMLElement;
          delete copy.dataset['cgPvwPicturePart'];
          copy.dataset['cgPvwSourceDissolve'] = '';
          return { copy, node };
        });
  const change = incoming.length === 1 ? incoming[0] : undefined;
  if (change !== undefined && outgoing.length === 1 && isInputSlideMode(effect.mode)) {
    const before = paintedPictures.get(change.part);
    if (
      before !== undefined &&
      sameBox(change.node, before.plate) &&
      JSON.stringify(before.plate.mask) === JSON.stringify(change.plate.mask)
    ) {
      const next = startPvwSlide(
        doc,
        change.node,
        change.plate,
        plates,
        before.picture,
        frames,
        effect,
        active,
      );
      if (next !== undefined) active.current = next;
    }
  }
  paintPvwPlatePictures(doc, plates, frames, pending);
  active.current?.refresh?.(plates, frames);
  if (clones.length === 0) return;
  const animations = clones.map(({ copy, node }) => {
    node.append(copy);
    return { copy, animation: copy.animate?.([{ opacity: 1 }, { opacity: 0 }], effect.durationMs) };
  });
  const cleanup = () => {
    for (const { copy, animation } of animations) {
      animation?.cancel();
      copy.remove();
    }
    if (active.current?.cancel === cleanup) active.current = undefined;
  };
  active.current = { cancel: cleanup };
  void Promise.all(animations.map(({ animation }) => animation?.finished)).then(cleanup, cleanup);
}

/** Independent picture fits move inside one unmoving plate or mask rectangle. */
function startPvwSlide(
  doc: Document,
  node: HTMLElement,
  plate: PlatePlacement,
  plates: readonly PlatePlacement[],
  before: Picture,
  frames: ReadonlyMap<string, PvwSourceFrame>,
  effect: InputTransition,
  active: { current: PvwInputEffect | undefined },
): PvwInputEffect | undefined {
  const after = pictureFor(plate, frames);
  if (
    after === undefined ||
    typeof node.animate !== 'function' ||
    plate.reveal !== undefined ||
    plates.some(({ reveal }) => reveal?.targetSourceId === plate.plateId)
  )
    return undefined;
  const view = doc.defaultView;
  const windows = pictureWindows(plate);
  const window = windows.length === 1 ? windows[0] : undefined;
  if (view === null || window === undefined) return undefined;
  const viewportRect = intersectNormalizedRects(window, {
    x: 0,
    y: 0,
    width: view.innerWidth,
    height: view.innerHeight,
  });
  if (viewportRect === null) return undefined;
  const viewport = doc.createElement('div');
  viewport.dataset['cgPvwInputMotion'] = effect.mode;
  viewport.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none';
  viewport.setAttribute('aria-hidden', 'true');
  placeWithin(viewport, viewportRect, plate);

  const plane = (role: 'outgoing' | 'incoming', picture: Picture) => {
    const layer = doc.createElement('div');
    layer.dataset['cgPvwInputMotionPlane'] = role;
    layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
    const part = doc.createElement('div');
    part.style.cssText = 'position:absolute;overflow:hidden';
    const image = doc.createElement('img');
    image.alt = '';
    image.draggable = false;
    image.style.cssText = 'position:absolute;display:block;max-width:none;max-height:none';
    part.append(image);
    layer.append(part);
    viewport.append(layer);
    const paint = (value: Picture): void => {
      placeWithin(part, value.visible, viewportRect);
      paintSnapshot(image, value, value.visible);
    };
    paint(picture);
    return { layer, paint };
  };
  const outgoing = plane('outgoing', before);
  const incoming = plane('incoming', after);
  // If a JPEG refresh replaced the underlying part, the overlay continues to own the picture.
  const hidden = new Map<HTMLElement, string>();
  const animations: Animation[] = [];
  const cancel = () => {
    if (viewport.parentElement === null) return;
    for (const animation of animations) animation.cancel();
    for (const [part, value] of hidden) part.style.visibility = value;
    viewport.remove();
    if (active.current?.cancel === cancel) active.current = undefined;
  };
  const refresh: NonNullable<PvwInputEffect['refresh']> = (nextPlates, nextFrames) => {
    const current = nextPlates.find(({ plateId }) => plateId === plate.plateId);
    if (
      current?.sourceId !== after.sourceId ||
      JSON.stringify(current.mask) !== JSON.stringify(plate.mask) ||
      !sameBox(node, plate)
    ) {
      cancel();
      return;
    }
    for (const part of node.querySelectorAll<HTMLElement>(
      ':scope > [data-cg-pvw-picture-kind="own"]',
    )) {
      if (!hidden.has(part)) hidden.set(part, part.style.visibility);
      part.style.visibility = 'hidden';
    }
    const latest = pictureFor(current, nextFrames);
    if (latest !== undefined) incoming.paint(latest);
  };
  const direction = inputSlideVector(effect.direction);
  const offset = (multiplier: number): string =>
    `translate(${String(direction.x * multiplier * 100)}%, ${String(direction.y * multiplier * 100)}%)`;
  node.append(viewport);
  const tween = (layer: HTMLElement, from: number, to: number) =>
    layer.animate([{ transform: offset(from) }, { transform: offset(to) }], {
      duration: effect.durationMs,
      fill: 'both',
      easing: 'linear',
    });
  animations.push(tween(incoming.layer, 1, 0));
  if (effect.mode === 'push') animations.push(tween(outgoing.layer, 0, -1));
  void Promise.all(animations.map(({ finished }) => finished)).then(cancel, cancel);
  return { cancel, refresh };
}

/** Mount preview-only pixels in the exact plate node, preserving the page's own paint order. */
export function paintPvwPlatePictures(
  doc: Document,
  plates: readonly PlatePlacement[],
  frames: ReadonlyMap<string, PvwSourceFrame>,
  pending?: ReadonlySet<HTMLElement>,
): void {
  const retained = new Map(
    Array.from(doc.querySelectorAll<HTMLDivElement>('[data-cg-pvw-picture-part]')).map((part) => [
      part.dataset['cgPvwPicturePart'],
      part,
    ]),
  );
  if (frames.size === 0) {
    for (const part of retained.values()) if (pending?.has(part) !== true) part.remove();
    return;
  }
  const nodes = Array.from(doc.querySelectorAll<HTMLElement>('[data-cg-live-source]'));
  const fitted = new Map(plates.map((plate) => [plate.plateId, pictureFor(plate, frames)]));

  function addPicture(
    plate: PlatePlacement,
    node: HTMLElement,
    key: string,
    fit: NonNullable<ReturnType<typeof pictureFor>>,
    window: FitRect,
    kind: 'own' | 'reveal',
    windowIndex?: number,
  ): void {
    const visible = intersectNormalizedRects(fit.visible, window);
    if (visible === null) return;
    const prior = retained.get(key);
    const reusable =
      prior?.parentElement === node &&
      prior.dataset['sourceId'] === fit.sourceId &&
      prior.dataset['geometryRevision'] === fit.geometryRevision;
    const part = reusable ? prior : doc.createElement('div');
    if (!reusable) {
      prior?.remove();
      part.dataset['cgPvwPicturePart'] = key;
      part.dataset['cgPvwPictureKind'] = kind;
      part.dataset['sourceId'] = fit.sourceId;
      part.dataset['geometryRevision'] = fit.geometryRevision;
      part.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none';
      part.setAttribute('aria-hidden', 'true');
      const image = doc.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.style.cssText = 'position:absolute;display:block;max-width:none;max-height:none';
      part.append(image);
      node.append(part);
    }
    pendingInputPicture.delete(part);
    paintedPictures.set(part, {
      picture: fit,
      plate,
      ...(windowIndex === undefined ? {} : { windowIndex }),
    });
    retained.delete(key);
    placeWithin(part, visible, plate);
    const image = part.querySelector('img');
    if (image === null) return;
    paintSnapshot(image, fit, visible);
  }

  for (const plate of plates) {
    const candidates = nodes.filter(
      (node) => node.dataset['cgLiveSource'] === plate.plateId && sameBox(node, plate),
    );
    const node = candidates.length === 1 ? candidates[0] : undefined;
    if (node === undefined) continue;
    const own = fitted.get(plate.plateId);
    if (own !== undefined) {
      const windows = pictureWindows(plate);
      for (const [index, window] of windows.entries()) {
        addPicture(
          plate,
          node,
          JSON.stringify([plate.plateId, 'own', index]),
          own,
          window,
          'own',
          index,
        );
      }
    }
    if (plate.reveal === undefined) continue;
    const lower = fitted.get(plate.reveal.targetSourceId);
    if (lower === undefined) continue;
    for (const [index, rect] of liveRevealRects(plate.reveal).entries()) {
      addPicture(
        plate,
        node,
        JSON.stringify([plate.plateId, 'reveal', index]),
        lower,
        liveRevealSceneRect(plate, rect),
        'reveal',
      );
    }
  }
  for (const part of retained.values()) if (pending?.has(part) !== true) part.remove();
}
