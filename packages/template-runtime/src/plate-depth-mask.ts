import { type Affine, type FrameTransitionPhase } from '@cg/shared-schema';

type PlateStack = NonNullable<FrameTransitionPhase['plateStack']>;
const svgNamespace = 'http://www.w3.org/2000/svg';
let maskSequence = 0;

/** The foreground HTML pass is above every native picture. Punch higher opaque
 * apertures out of each lower plate's artwork, including its nested graphics. */
export function createPlateDepthMask(
  container: HTMLElement,
  stack: PlateStack,
  targetOf: (key: string) => HTMLElement | undefined,
  sceneToLocal: (key: string) => Affine | null,
) {
  const doc = container.ownerDocument;
  const maskProperty =
    doc.defaultView?.CSS?.supports('mask-image', 'url(#mask)') === false
      ? '-webkit-mask-image'
      : 'mask-image';
  const svg = doc.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  const defs = doc.createElementNS(svgNamespace, 'defs');
  svg.appendChild(defs);
  const layers = stack.flatMap(({ frameKey }, index) => {
    const target = targetOf(frameKey);
    const covers = stack.slice(index + 1).flatMap(({ cover }) => (cover ? [cover] : []));
    if (target === undefined || covers.length === 0) return [];
    const mask = doc.createElementNS(svgNamespace, 'mask');
    mask.id = 'cg-plate-depth-' + String(++maskSequence);
    mask.setAttribute('maskContentUnits', 'objectBoundingBox');
    const base = doc.createElementNS(svgNamespace, 'rect');
    base.setAttribute('width', '1');
    base.setAttribute('height', '1');
    base.setAttribute('fill', 'white');
    mask.appendChild(base);
    const apertures = doc.createElementNS(svgNamespace, 'g');
    mask.appendChild(apertures);
    defs.appendChild(mask);
    const rects = covers.map((cover) => {
      const rect = doc.createElementNS(svgNamespace, 'rect');
      rect.setAttribute('fill', 'black');
      apertures.appendChild(rect);
      return { rect, cover };
    });
    const previous = target.style.getPropertyValue(maskProperty);
    target.style.setProperty(maskProperty, 'url(#' + mask.id + ')');
    return [{ frameKey, target, previous, apertures, rects, width: 0, height: 0 }];
  });
  if (layers.length) container.appendChild(svg);
  return {
    paint(progress: number) {
      for (const layer of layers) {
        const { frameKey, target, apertures, rects } = layer;
        // Read once the authored root is visible. Its CSS box is stable while its
        // transform moves; the SVG mask uses fractions of that untransformed box.
        if (!layer.width || !layer.height) {
          layer.width = target.offsetWidth;
          layer.height = target.offsetHeight;
        }
        const m = sceneToLocal(frameKey);
        const { width, height } = layer;
        apertures.style.display = m === null || !width || !height ? 'none' : '';
        if (m === null || !width || !height) continue;
        const matrix = [
          m.a / width,
          m.b / height,
          m.c / width,
          m.d / height,
          m.e / width,
          m.f / height,
        ];
        apertures.setAttribute('transform', `matrix(${matrix.join(' ')})`);
        for (const { rect, cover } of rects) {
          for (const key of ['x', 'y', 'width', 'height'] as const)
            rect.setAttribute(
              key,
              String(cover.from[key] + (cover.to[key] - cover.from[key]) * progress),
            );
          rect.setAttribute(
            'fill-opacity',
            String(cover.fromOpacity + (cover.toOpacity - cover.fromOpacity) * progress),
          );
        }
      }
    },
    clear() {
      for (const { target, previous } of layers) {
        if (previous) target.style.setProperty(maskProperty, previous);
        else target.style.removeProperty(maskProperty);
      }
      svg.remove();
    },
  };
}
