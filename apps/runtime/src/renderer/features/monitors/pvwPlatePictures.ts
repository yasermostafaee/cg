import {
  DEFAULT_LIVE_FIT_MODE,
  fitPictureToBox,
  intersectNormalizedRects,
  livePlateMaskRegions,
  liveRevealRects,
  liveRevealSceneRect,
  type FitRect,
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

const pendingInputPicture = new WeakMap<HTMLElement, string>();

/** Keep a previous source in the same plate until a replacement snapshot can be dissolved in. */
export function paintPvwSourceDissolve(
  doc: Document,
  plates: readonly PlatePlacement[],
  frames: ReadonlyMap<string, PvwSourceFrame>,
  durationMs: number,
  active: { current: (() => void) | undefined },
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
    return [{ part, node, sourceId: plate.sourceId }];
  });
  const pending = new Set(
    outgoing.filter(({ sourceId }) => !frames.has(sourceId)).map(({ part }) => part),
  );
  for (const { part, sourceId } of outgoing) {
    if (!pending.has(part)) {
      pendingInputPicture.delete(part);
    } else if (pendingInputPicture.get(part) !== sourceId) {
      pendingInputPicture.set(part, sourceId);
      // A source can be outside the monitor's snapshot budget or have no preview service.
      setTimeout(() => {
        if (pendingInputPicture.get(part) !== sourceId) return;
        pendingInputPicture.delete(part);
        part.remove();
      }, 2_500);
    }
  }
  const incoming = outgoing.filter(
    ({ sourceId }) => frames.get(sourceId)?.jpegBase64 !== undefined,
  );
  if (incoming.length > 0) active.current?.();
  const clones = incoming.map(({ part, node }) => {
    const copy = part.cloneNode(true) as HTMLElement;
    delete copy.dataset['cgPvwPicturePart'];
    copy.dataset['cgPvwSourceDissolve'] = '';
    return { copy, node };
  });
  paintPvwPlatePictures(doc, plates, frames, pending);
  if (clones.length === 0) return;
  const animations = clones.map(({ copy, node }) => {
    node.append(copy);
    return { copy, animation: copy.animate?.([{ opacity: 1 }, { opacity: 0 }], durationMs) };
  });
  const cleanup = () => {
    for (const { copy, animation } of animations) {
      animation?.cancel();
      copy.remove();
    }
    if (active.current === cleanup) active.current = undefined;
  };
  active.current = cleanup;
  void Promise.all(animations.map(({ animation }) => animation?.finished)).then(cleanup, cleanup);
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
    retained.delete(key);
    placeWithin(part, visible, plate);
    const image = part.querySelector('img');
    if (image === null) return;
    placeWithin(image, fit.jpeg, visible);
    const url = `data:image/jpeg;base64,${fit.jpegBase64}`;
    if (image.getAttribute('src') !== url) image.src = url;
  }

  for (const plate of plates) {
    const candidates = nodes.filter(
      (node) => node.dataset['cgLiveSource'] === plate.plateId && sameBox(node, plate),
    );
    const node = candidates.length === 1 ? candidates[0] : undefined;
    if (node === undefined) continue;
    const own = fitted.get(plate.plateId);
    if (own !== undefined) {
      const windows =
        plate.mask === undefined
          ? [plate]
          : livePlateMaskRegions(plate.mask).map((rect) => liveRevealSceneRect(plate, rect));
      for (const [index, window] of windows.entries()) {
        addPicture(plate, node, JSON.stringify([plate.plateId, 'own', index]), own, window, 'own');
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
