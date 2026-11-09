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

function pictureFor(plate: PlatePlacement, frames: ReadonlyMap<string, PvwSourceFrame>) {
  const frame = plate.sourceId === null ? undefined : frames.get(plate.sourceId);
  if (frame?.jpegBase64 === undefined || !frame.width || !frame.height) return undefined;
  const fit = fitPictureToBox(
    plate,
    frame.width / frame.height,
    plate.cropEdges ? 'cover' : DEFAULT_LIVE_FIT_MODE,
    plate.focus,
  );
  return { ...fit, sourceId: frame.sourceId, jpegBase64: frame.jpegBase64 };
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

/** Mount preview-only pixels in the exact plate node, preserving the page's own paint order. */
export function paintPvwPlatePictures(
  doc: Document,
  plates: readonly PlatePlacement[],
  frames: ReadonlyMap<string, PvwSourceFrame>,
): void {
  const retained = new Map(
    Array.from(doc.querySelectorAll<HTMLDivElement>('[data-cg-pvw-picture-part]')).map((part) => [
      part.dataset['cgPvwPicturePart'],
      part,
    ]),
  );
  if (frames.size === 0) {
    for (const part of retained.values()) part.remove();
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
  ): void {
    const visible = intersectNormalizedRects(fit.visible, window);
    if (visible === null) return;
    const prior = retained.get(key);
    const reusable = prior?.parentElement === node && prior.dataset['sourceId'] === fit.sourceId;
    const part = reusable ? prior : doc.createElement('div');
    if (!reusable) {
      prior?.remove();
      part.dataset['cgPvwPicturePart'] = key;
      part.dataset['sourceId'] = fit.sourceId;
      part.style.cssText = 'position:absolute;overflow:hidden;pointer-events:none';
      part.setAttribute('aria-hidden', 'true');
      const image = doc.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.style.cssText = 'position:absolute;display:block;max-width:none;max-height:none';
      part.append(image);
      node.append(part);
    }
    retained.delete(key);
    placeWithin(part, visible, plate);
    const image = part.querySelector('img');
    if (image === null) return;
    placeWithin(image, fit.picture, visible);
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
        addPicture(plate, node, JSON.stringify([plate.plateId, 'own', index]), own, window);
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
      );
    }
  }
  for (const part of retained.values()) part.remove();
}
