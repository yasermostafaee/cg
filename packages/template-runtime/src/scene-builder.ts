import type {
  Element as SceneElement,
  Layer,
  Scene,
  TextElement,
  ImageElement,
  ShapeElement,
  Transform,
} from '@cg/shared-schema';
import type { BuildSceneResult } from './types.js';

/**
 * Build a DOM tree from a Scene. Returns the container element (caller
 * appends it to the document root) and a map of element id → HTMLElement
 * so the bindings layer can mutate properties without re-walking the tree.
 *
 * M3.2-α: Text + Image + Shape supported. Container / Lottie /
 * VideoPlaceholder are recognized and skipped with a warning.
 */
export function buildScene(scene: Scene, doc: Document = document): BuildSceneResult {
  const container = doc.createElement('div');
  container.className = 'cg-stage';
  container.style.width = `${scene.resolution.width}px`;
  container.style.height = `${scene.resolution.height}px`;
  if (scene.background !== 'transparent') {
    container.style.background = scene.background;
  }

  const elementMap = new Map<string, HTMLElement>();
  const textOriginals = new Map<string, string>();

  for (const layer of scene.layers) {
    const layerNode = buildLayer(layer, doc, elementMap, textOriginals);
    container.appendChild(layerNode);
  }

  return { container, elementMap, textOriginals };
}

function buildLayer(
  layer: Layer,
  doc: Document,
  elementMap: Map<string, HTMLElement>,
  textOriginals: Map<string, string>,
): HTMLElement {
  const node = doc.createElement('div');
  node.className = 'cg-layer';
  node.dataset['cgLayerId'] = layer.id;
  if (!layer.visible) node.style.display = 'none';

  // Sort by zIndex so DOM order matches z-stack semantics.
  const sorted = [...layer.children].sort((a, b) => a.zIndex - b.zIndex);
  for (const element of sorted) {
    const elementNode = buildElement(element, doc, textOriginals);
    if (elementNode) {
      node.appendChild(elementNode);
      elementMap.set(element.id, elementNode);
    }
  }
  return node;
}

function buildElement(
  element: SceneElement,
  doc: Document,
  textOriginals: Map<string, string>,
): HTMLElement | null {
  switch (element.type) {
    case 'text':
      return buildText(element, doc, textOriginals);
    case 'image':
      return buildImage(element, doc);
    case 'shape':
      return buildShape(element, doc);
    case 'container':
    case 'lottie':
    case 'video-placeholder':
      // M3.2-α: not yet supported. Render a placeholder div so layout
      // doesn't shift and the element id can still be bound. Animation
      // (M3.2-β), Lottie (M3.3), and video routing (post-v1) will
      // replace these.
      return buildPlaceholder(element, doc);
  }
}

function applyBaseStyles(
  el: HTMLElement,
  transform: Transform,
  opacity: number,
  visible: boolean,
): void {
  el.classList.add('cg-element');
  el.style.left = `${transform.position.x}px`;
  el.style.top = `${transform.position.y}px`;
  el.style.width = `${transform.size.w}px`;
  el.style.height = `${transform.size.h}px`;
  el.style.opacity = String(opacity);
  el.style.transform = composeTransform(transform);
  el.style.transformOrigin = `${transform.anchor.x * 100}% ${transform.anchor.y * 100}%`;
  if (!visible) el.style.display = 'none';
}

function composeTransform(t: Transform): string {
  const parts: string[] = [];
  if (t.scale.x !== 1 || t.scale.y !== 1) parts.push(`scale(${t.scale.x}, ${t.scale.y})`);
  if (t.rotation !== 0) parts.push(`rotate(${t.rotation}deg)`);
  if (t.skew && (t.skew.x !== 0 || t.skew.y !== 0)) {
    parts.push(`skew(${t.skew.x}deg, ${t.skew.y}deg)`);
  }
  return parts.join(' ');
}

function buildText(
  element: TextElement,
  doc: Document,
  textOriginals: Map<string, string>,
): HTMLElement {
  const el = doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible);
  el.style.fontFamily = element.font.family;
  el.style.fontWeight = String(element.font.weight);
  el.style.fontStyle = element.font.style;
  el.style.fontSize = `${element.font.size}px`;
  el.style.lineHeight = String(element.font.lineHeight);
  el.style.letterSpacing = `${element.font.letterSpacing}em`;
  el.style.color = element.color;
  el.style.textAlign = element.align;
  el.style.direction = element.direction === 'auto' ? '' : element.direction;
  if (element.textShadow) {
    const s = element.textShadow;
    el.style.textShadow = `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.color}`;
  }
  el.textContent = element.text;
  textOriginals.set(element.id, element.text);
  return el;
}

function buildImage(element: ImageElement, doc: Document): HTMLElement {
  const el = doc.createElement('img');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible);
  el.alt = element.name;
  el.style.objectFit = element.fit;
  el.dataset['cgAssetId'] = element.assetId;
  if (element.tint) {
    // Tinting via mix-blend-mode is a v1 approximation; M9 may add SVG filter
    el.style.filter = `drop-shadow(0 0 0 ${element.tint})`;
  }
  return el;
}

function buildShape(element: ShapeElement, doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible);
  if (element.fill?.kind === 'solid') {
    el.style.background = element.fill.color;
  }
  if (element.stroke) {
    el.style.border = `${element.stroke.width}px solid ${element.stroke.color}`;
  }
  if (element.shape === 'ellipse') {
    el.style.borderRadius = '50%';
  } else if (element.shape === 'rounded-rect' && element.cornerRadius !== undefined) {
    if (typeof element.cornerRadius === 'number') {
      el.style.borderRadius = `${element.cornerRadius}px`;
    } else {
      const [tl, tr, br, bl] = element.cornerRadius;
      el.style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
    }
  }
  return el;
}

function buildPlaceholder(element: SceneElement, doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  el.dataset['cgPlaceholderFor'] = element.type;
  applyBaseStyles(el, element.transform, element.opacity, element.visible);
  return el;
}
