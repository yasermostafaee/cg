import type {
  ClockElement,
  CompositionElement,
  Element as SceneElement,
  Fill,
  Filter,
  Layer,
  Scene,
  SequenceElement,
  Shadow,
  TextElement,
  TickerElement,
  ImageElement,
  ShapeElement,
  Transform,
} from '@cg/shared-schema';
import type { BuildSceneResult, FieldScope, LifecycleSource } from './types.js';
import { clockInitialText } from './clock-driver.js';
import { makeSequenceItemNode } from './sequence-driver.js';
import { populateTickerStaticRow } from './ticker-driver.js';

/**
 * Build a DOM tree from a Scene. Returns the container element (caller
 * appends it to the document root) and a map of element id → HTMLElement
 * so the bindings layer can mutate properties without re-walking the tree.
 *
 * M3.2-α: Text + Image + Shape supported. Container / Lottie /
 * VideoPlaceholder are recognized and skipped with a warning.
 */
/**
 * Threaded build context. `depth`/`visited` bound nested-composition recursion
 * (cycle + runaway guard); each `scope` collects its own animated elements (D-026)
 * so a nested instance runs its own lifecycle; `scene` carries the composition
 * registry so `composition` elements resolve.
 */
interface BuildCtx {
  doc: Document;
  scene: Scene;
  /** The current scope — elements land in `scope.elementMap`/`scope.animated`. */
  scope: FieldScope;
  depth: number;
  visited: ReadonlySet<string>;
}

function newScope(container: HTMLElement, source: LifecycleSource): FieldScope {
  return {
    elementMap: new Map<string, HTMLElement>(),
    textOriginals: new Map<string, string>(),
    container,
    children: [],
    animated: [],
    tickers: [],
    clocks: [],
    sequences: [],
    source,
  };
}

const MAX_COMPOSITION_DEPTH = 8;

export function buildScene(scene: Scene, doc: Document = document): BuildSceneResult {
  const container = doc.createElement('div');
  container.className = 'cg-stage';
  container.style.width = `${scene.resolution.width}px`;
  container.style.height = `${scene.resolution.height}px`;
  if (scene.background !== 'transparent') {
    container.style.background = scene.background;
  }

  const rootScope = newScope(container, scene);
  const ctx: BuildCtx = {
    doc,
    scene,
    scope: rootScope,
    depth: 0,
    visited: new Set<string>(),
  };

  for (const layer of scene.layers) {
    container.appendChild(buildLayer(layer, ctx));
  }

  return {
    container,
    elementMap: rootScope.elementMap,
    textOriginals: rootScope.textOriginals,
    scopeTree: rootScope,
  };
}

function buildLayer(layer: Layer, ctx: BuildCtx): HTMLElement {
  const node = ctx.doc.createElement('div');
  node.className = 'cg-layer';
  node.dataset['cgLayerId'] = layer.id;
  if (!layer.visible) node.style.display = 'none';

  // Sort by zIndex so DOM order matches z-stack semantics.
  const sorted = [...layer.children].sort((a, b) => a.zIndex - b.zIndex);
  for (const element of sorted) {
    const elementNode = buildElement(element, ctx);
    if (elementNode === null) continue;
    node.appendChild(elementNode);
    // Every scope owns its elements, keyed by id, so field bindings apply within
    // the right instance (the same child instanced twice has two scopes).
    ctx.scope.elementMap.set(element.id, elementNode);
    // D-026 — animated elements belong to THIS scope's lifecycle/controller, so a
    // nested child runs its own in→hold→out independently of the parent.
    if (element.animation !== undefined && Object.keys(element.animation.tracks).length > 0) {
      ctx.scope.animated.push({
        id: element.id,
        node: elementNode,
        source: element,
        animation: element.animation,
      });
    }
  }
  return node;
}

function buildElement(element: SceneElement, ctx: BuildCtx): HTMLElement | null {
  switch (element.type) {
    case 'text':
      return buildText(element, ctx.doc, ctx.scope.textOriginals);
    case 'ticker':
      return buildTicker(element, ctx);
    case 'clock':
      return buildClock(element, ctx);
    case 'sequence':
      return buildSequence(element, ctx);
    case 'image':
      return buildImage(element, ctx.doc);
    case 'shape':
      return buildShape(element, ctx.doc);
    case 'composition':
      return buildComposition(element, ctx);
    case 'container':
    case 'lottie':
    case 'video-placeholder':
      // M3.2-α: not yet supported. Render a placeholder div so layout
      // doesn't shift and the element id can still be bound. Animation
      // (M3.2-β), Lottie (M3.3), and video routing (post-v1) will
      // replace these.
      return buildPlaceholder(element, ctx.doc);
  }
}

/**
 * Render a composition instance: a clipped box (sized to the element) whose
 * inner stage is the referenced composition's content, scaled to fill the box.
 * Recursion is bounded by depth + a visited-set so a cyclic graph can't loop
 * forever (cycles are also blocked at author time). A missing/over-deep
 * reference renders as the empty box.
 */
function buildComposition(element: CompositionElement, ctx: BuildCtx): HTMLElement {
  const el = ctx.doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  el.dataset['cgCompositionId'] = element.compositionId;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  el.style.overflow = 'hidden';

  const comp = ctx.scene.compositions?.find((c) => c.id === element.compositionId);
  if (
    comp === undefined ||
    ctx.depth >= MAX_COMPOSITION_DEPTH ||
    ctx.visited.has(element.compositionId)
  ) {
    return el;
  }

  const inner = ctx.doc.createElement('div');
  inner.className = 'cg-comp-inner';
  inner.style.position = 'absolute';
  inner.style.left = '0';
  inner.style.top = '0';
  inner.style.width = `${comp.resolution.width}px`;
  inner.style.height = `${comp.resolution.height}px`;
  inner.style.transformOrigin = '0 0';
  const sx = comp.resolution.width === 0 ? 1 : element.transform.size.w / comp.resolution.width;
  const sy = comp.resolution.height === 0 ? 1 : element.transform.size.h / comp.resolution.height;
  inner.style.transform = `scale(${String(sx)}, ${String(sy)})`;
  if (comp.background !== 'transparent') inner.style.background = comp.background;

  // A fresh field scope for THIS instance — so the same child instanced twice
  // gets two independent element maps, addressed by the instance's namespace.
  const childScope = newScope(inner, comp);
  ctx.scope.children.push({
    name: element.name,
    compositionId: element.compositionId,
    scope: childScope,
  });
  const childCtx: BuildCtx = {
    ...ctx,
    scope: childScope,
    depth: ctx.depth + 1,
    visited: new Set([...ctx.visited, element.compositionId]),
  };
  for (const layer of comp.layers) {
    inner.appendChild(buildLayer(layer, childCtx));
  }
  el.appendChild(inner);
  return el;
}

function applyBaseStyles(
  el: HTMLElement,
  transform: Transform,
  opacity: number,
  visible: boolean,
  filter?: Filter,
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
  if (filter !== undefined) {
    const composed = composeFilter(filter);
    if (composed.length > 0) el.style.filter = composed;
  }
}

/**
 * Compose a Filter object into a single CSS `filter` declaration. Each
 * field is optional; the runtime emits only the ones the operator set.
 * D-010.
 */
function composeFilter(f: Filter): string {
  const parts: string[] = [];
  if (f.blur !== undefined && f.blur > 0) parts.push(`blur(${f.blur}px)`);
  if (f.brightness !== undefined && f.brightness !== 100)
    parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== undefined && f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.grayscale !== undefined && f.grayscale > 0) parts.push(`grayscale(${f.grayscale}%)`);
  if (f.hueRotate !== undefined && f.hueRotate !== 0) parts.push(`hue-rotate(${f.hueRotate}deg)`);
  if (f.invert !== undefined && f.invert > 0) parts.push(`invert(${f.invert}%)`);
  if (f.opacity !== undefined && f.opacity !== 100) parts.push(`opacity(${f.opacity}%)`);
  if (f.saturate !== undefined && f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.sepia !== undefined && f.sepia > 0) parts.push(`sepia(${f.sepia}%)`);
  return parts.join(' ');
}

function composeBoxShadow(s: Shadow): string {
  return `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.color}`;
}

/**
 * Render a {@link Fill} to a CSS `background` value. Solid is the colour
 * itself; linear/radial map to CSS gradients. Gradient stops carry a 0..1
 * position (→ percent); the radial `center` is a 0..1 fraction of the box
 * and `radius` is in scene pixels.
 */
function fillToCss(fill: Fill): string {
  if (fill.kind === 'solid') return fill.color;
  const pct = (n: number): string => `${String(Number((n * 100).toFixed(2)))}%`;
  const stops = fill.stops.map((s) => `${s.color} ${pct(s.at)}`).join(', ');
  if (fill.kind === 'linear') {
    return `linear-gradient(${String(fill.angle)}deg, ${stops})`;
  }
  return `radial-gradient(circle ${String(fill.radius)}px at ${pct(fill.center.x)} ${pct(fill.center.y)}, ${stops})`;
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
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  // Append a fallback stack for glyphs the authored family lacks. The bundled,
  // shaping-capable Vazirmatn (+ Noto Sans Arabic) come *before* the system UI
  // fonts, so Persian/Arabic text in a Latin-only family (Verdana, Georgia,
  // Inter, …) falls back to Vazirmatn rather than an unpredictable system face.
  // The authored family still wins for the glyphs it covers.
  el.style.fontFamily = `${element.font.family}, Vazirmatn, "Noto Sans Arabic", "Segoe UI", system-ui, -apple-system, "Noto Sans", sans-serif`;
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
  // D-010 — text-box padding, background, border-radius.
  if (element.padding) {
    el.style.paddingTop = `${element.padding.top}px`;
    el.style.paddingRight = `${element.padding.right}px`;
    el.style.paddingBottom = `${element.padding.bottom}px`;
    el.style.paddingLeft = `${element.padding.left}px`;
    el.style.boxSizing = 'border-box';
  }
  if (element.backgroundColor) {
    el.style.backgroundColor = element.backgroundColor;
  }
  // Gradient (or solid) text-box background — a normal CSS background, so
  // linear/radial both render. Overrides the solid backgroundColor above.
  if (element.backgroundFill !== undefined) {
    el.style.background = fillToCss(element.backgroundFill);
  }
  // Gradient (or solid) text fill. A gradient paints through
  // `background-clip: text`, which consumes the element's `background` (so it
  // supersedes a gradient text-background on the same element); a solid just
  // sets the colour.
  if (element.colorFill !== undefined) {
    if (element.colorFill.kind === 'solid') {
      el.style.color = element.colorFill.color;
    } else {
      el.style.background = fillToCss(element.colorFill);
      el.style.setProperty('-webkit-background-clip', 'text');
      el.style.setProperty('background-clip', 'text');
      el.style.color = 'transparent';
    }
  }
  if (element.cornerRadius !== undefined && element.cornerRadius > 0) {
    el.style.borderRadius = `${element.cornerRadius}px`;
  }
  // D-010-pic-5 — `wrap === false` forces single-line; vertical align
  // is honoured by turning the text node into a flex container.
  if (element.wrap === false) {
    el.style.whiteSpace = 'nowrap';
  }
  if (element.verticalAlign !== undefined) {
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.justifyContent =
      element.verticalAlign === 'middle'
        ? 'center'
        : element.verticalAlign === 'bottom'
          ? 'flex-end'
          : 'flex-start';
  }
  el.textContent = element.text;
  textOriginals.set(element.id, element.text);
  return el;
}

/**
 * D-028 — render a ticker element: a clipped band whose inner `track` the
 * {@link TickerDriver} feeds and translates at playout. The builder itself
 * renders a STATIC authoring layout (a flex row in reading direction — no
 * measurement needed) so the Designer canvas shows the items; the driver
 * removes it when the crawl starts. The band + track are registered on the
 * scope (`scope.tickers`) so the runtime can instantiate the driver and
 * self-wire the scope's `content-driven` duration hook.
 */
function buildTicker(element: TickerElement, ctx: BuildCtx): HTMLElement {
  const doc = ctx.doc;
  const el = doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  el.style.overflow = 'hidden';
  // Same shaping-capable fallback stack as text elements (Vazirmatn first) —
  // items inherit these from the band.
  el.style.fontFamily = `${element.font.family}, Vazirmatn, "Noto Sans Arabic", "Segoe UI", system-ui, -apple-system, "Noto Sans", sans-serif`;
  el.style.fontWeight = String(element.font.weight);
  el.style.fontStyle = element.font.style;
  el.style.fontSize = `${element.font.size}px`;
  el.style.lineHeight = String(element.font.lineHeight);
  el.style.letterSpacing = `${element.font.letterSpacing}em`;
  el.style.color = element.color;
  if (element.textShadow) {
    const ts = element.textShadow;
    el.style.textShadow = `${ts.offsetX}px ${ts.offsetY}px ${ts.blur}px ${ts.color}`;
  }
  // READING direction (explicit 'rtl' | 'ltr' — no 'auto' for a crawl).
  el.style.direction = element.direction;
  if (element.backgroundColor) el.style.backgroundColor = element.backgroundColor;
  if (element.backgroundFill !== undefined) el.style.background = fillToCss(element.backgroundFill);
  if (element.cornerRadius !== undefined && element.cornerRadius > 0) {
    el.style.borderRadius = `${element.cornerRadius}px`;
  }

  // The padded inner viewport. CSS padding on the band would be inert here —
  // the track/static row are absolutely positioned, and abspos children
  // resolve against the PADDING box, so padding insets nothing for them.
  // Instead the viewport div is inset by the padding values and is the clip
  // + sizing context the crawl actually lives in (the runtime subtracts the
  // horizontal padding from the driver's viewportWidth to match).
  const pad = element.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const viewport = doc.createElement('div');
  viewport.className = 'cg-ticker-viewport';
  viewport.style.position = 'absolute';
  viewport.style.top = `${pad.top}px`;
  viewport.style.right = `${pad.right}px`;
  viewport.style.bottom = `${pad.bottom}px`;
  viewport.style.left = `${pad.left}px`;
  viewport.style.overflow = 'hidden';

  // The crawl surface. Items are absolutely positioned from measured offsets
  // (no inline flow → item order is fixed by construction, immune to bidi
  // reordering across item boundaries); only this track's transform changes
  // per frame.
  const track = doc.createElement('div');
  track.className = 'cg-ticker-track';
  track.style.position = 'absolute';
  track.style.left = '0';
  track.style.top = '0';
  track.style.height = '100%';
  track.style.willChange = 'transform';

  // Static authoring layout: lets the canvas show the items without any
  // measurement (flex lays them out; `direction` puts the list head at the
  // reading start edge). Removed at the first real `play()` (driver reset) so
  // every on-air intro shows the same band the crawl then enters; re-rendered
  // by the driver when a list-field default replaces the items pre-play.
  const staticRow = doc.createElement('div');
  staticRow.dataset['cgTickerStatic'] = '1';
  staticRow.style.position = 'absolute';
  staticRow.style.top = '0';
  staticRow.style.right = '0';
  staticRow.style.bottom = '0';
  staticRow.style.left = '0';
  staticRow.style.display = 'flex';
  staticRow.style.alignItems = 'center';
  staticRow.style.direction = element.direction;
  populateTickerStaticRow(staticRow, element.items, {
    direction: element.direction,
    gap: element.gap,
    separator: element.separator,
  });

  viewport.appendChild(track);
  viewport.appendChild(staticRow);
  el.appendChild(viewport);
  ctx.scope.tickers.push({ element, band: el, track });
  return el;
}

/**
 * D-027 — render a clock element: a box styled like the ticker band's subset
 * (background/fill/radius/padding) holding one LTR-isolated, tabular-numeral
 * time span the {@link ClockDriver} repaints at playout. The builder paints a
 * STATIC initial value (wall = now at build, countdown = the full target
 * remaining, countup = zero) so the authoring canvas is truthful without a
 * driver; the span is registered on the scope (`scope.clocks`) so the runtime
 * can instantiate the driver and self-wire countdowns into the scope's
 * `content-driven` hold.
 */
function buildClock(element: ClockElement, ctx: BuildCtx): HTMLElement {
  const doc = ctx.doc;
  const el = doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  // Same shaping-capable fallback stack as text/ticker (Vazirmatn first).
  el.style.fontFamily = `${element.font.family}, Vazirmatn, "Noto Sans Arabic", "Segoe UI", system-ui, -apple-system, "Noto Sans", sans-serif`;
  el.style.fontWeight = String(element.font.weight);
  el.style.fontStyle = element.font.style;
  el.style.fontSize = `${element.font.size}px`;
  el.style.lineHeight = String(element.font.lineHeight);
  el.style.letterSpacing = `${element.font.letterSpacing}em`;
  el.style.color = element.color;
  if (element.textShadow) {
    const ts = element.textShadow;
    el.style.textShadow = `${ts.offsetX}px ${ts.offsetY}px ${ts.blur}px ${ts.color}`;
  }
  if (element.backgroundColor) el.style.backgroundColor = element.backgroundColor;
  if (element.backgroundFill !== undefined) el.style.background = fillToCss(element.backgroundFill);
  if (element.cornerRadius !== undefined && element.cornerRadius > 0) {
    el.style.borderRadius = `${element.cornerRadius}px`;
  }
  // Unlike the ticker band, the time span is in normal flow (a flex child),
  // so plain CSS padding works — no inset viewport needed.
  if (element.padding) {
    el.style.paddingTop = `${element.padding.top}px`;
    el.style.paddingRight = `${element.padding.right}px`;
    el.style.paddingBottom = `${element.padding.bottom}px`;
    el.style.paddingLeft = `${element.padding.left}px`;
    el.style.boxSizing = 'border-box';
  }
  // Gradient (or solid) text fill — the text element's convention: a gradient
  // paints through background-clip:text (supersedes a band background on the
  // same element); a solid behaves like `color`.
  if (element.colorFill !== undefined) {
    if (element.colorFill.kind === 'solid') {
      el.style.color = element.colorFill.color;
    } else {
      el.style.background = fillToCss(element.colorFill);
      el.style.setProperty('-webkit-background-clip', 'text');
      el.style.setProperty('background-clip', 'text');
      el.style.color = 'transparent';
    }
  }
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent =
    element.align === 'start' ? 'flex-start' : element.align === 'end' ? 'flex-end' : 'center';

  // The time span: kept LTR and bidi-isolated inside RTL layouts, with
  // tabular numerals so the width is stable as digits tick.
  const span = doc.createElement('span');
  span.dataset['cgClockTime'] = '1';
  span.style.direction = 'ltr';
  span.style.unicodeBidi = 'isolate';
  span.style.fontVariantNumeric = 'tabular-nums';
  span.style.whiteSpace = 'pre';
  span.textContent = clockInitialText(
    { mode: element.mode, format: element.format, digits: element.digits, target: element.target },
    Date.now(),
  );
  el.appendChild(span);
  ctx.scope.clocks.push({ element, node: span });
  return el;
}

/**
 * D-029 — render a sequence element: a clipped single-cell GRID box (two
 * items can stack in the one cell during a transition; `justify-items` maps
 * the `align` enum directly) styled like the ticker band's subset. The
 * builder renders item 1 statically via the driver's shared item-node
 * factory (so the authoring canvas and the live run can't drift); the
 * {@link SequenceDriver} owns the rotation at playout. Registered on
 * `scope.sequences` so the runtime can instantiate the driver, self-wire a
 * FINITE sequence into the scope's `content-driven` hold, and route
 * `runtime.next()`.
 */
function buildSequence(element: SequenceElement, ctx: BuildCtx): HTMLElement {
  const doc = ctx.doc;
  const el = doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  el.style.overflow = 'hidden';
  // Same shaping-capable fallback stack as text/ticker/clock (Vazirmatn first).
  el.style.fontFamily = `${element.font.family}, Vazirmatn, "Noto Sans Arabic", "Segoe UI", system-ui, -apple-system, "Noto Sans", sans-serif`;
  el.style.fontWeight = String(element.font.weight);
  el.style.fontStyle = element.font.style;
  el.style.fontSize = `${element.font.size}px`;
  el.style.lineHeight = String(element.font.lineHeight);
  el.style.letterSpacing = `${element.font.letterSpacing}em`;
  el.style.color = element.color;
  if (element.textShadow) {
    const ts = element.textShadow;
    el.style.textShadow = `${ts.offsetX}px ${ts.offsetY}px ${ts.blur}px ${ts.color}`;
  }
  if (element.backgroundColor) el.style.backgroundColor = element.backgroundColor;
  if (element.backgroundFill !== undefined) el.style.background = fillToCss(element.backgroundFill);
  if (element.cornerRadius !== undefined && element.cornerRadius > 0) {
    el.style.borderRadius = `${element.cornerRadius}px`;
  }
  // Items are grid children (normal flow), so plain CSS padding works.
  if (element.padding) {
    el.style.paddingTop = `${element.padding.top}px`;
    el.style.paddingRight = `${element.padding.right}px`;
    el.style.paddingBottom = `${element.padding.bottom}px`;
    el.style.paddingLeft = `${element.padding.left}px`;
    el.style.boxSizing = 'border-box';
  }
  // Gradient (or solid) text fill — the text/clock convention.
  if (element.colorFill !== undefined) {
    if (element.colorFill.kind === 'solid') {
      el.style.color = element.colorFill.color;
    } else {
      el.style.background = fillToCss(element.colorFill);
      el.style.setProperty('-webkit-background-clip', 'text');
      el.style.setProperty('background-clip', 'text');
      el.style.color = 'transparent';
    }
  }
  // One grid cell: the current and incoming item stack in it during a
  // transition; `align-items` centres vertically, `justify-items` maps the
  // `align` enum 1:1 (grid ships well below the exported single-file's CEF
  // floor — CasparCG 2.2/2.3 = CEF 63/71).
  el.style.display = 'grid';
  el.style.alignItems = 'center';
  el.style.justifyItems = element.align;

  // Static initial render: item 1 through the shared factory (empty items ⇒
  // an empty box). The driver re-renders the same markup on reset().
  const first = element.items[0];
  if (first !== undefined) {
    const node = makeSequenceItemNode(doc, element.direction);
    node.textContent = first.text;
    el.appendChild(node);
  }
  ctx.scope.sequences.push({ element, host: el });
  return el;
}

function buildImage(element: ImageElement, doc: Document): HTMLElement {
  const el = doc.createElement('img');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
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
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  if (element.fill !== undefined) {
    el.style.background = fillToCss(element.fill);
  }
  if (element.stroke) {
    // D-010 — `dash` array maps to a dashed/dotted border. SVG-style
    // dash arrays don't map 1:1 to CSS `border-style`, so a non-empty
    // dash triggers `dashed`; a more granular SVG renderer is a later
    // upgrade.
    const style =
      element.stroke.dash !== undefined && element.stroke.dash.length > 0 ? 'dashed' : 'solid';
    el.style.border = `${element.stroke.width}px ${style} ${element.stroke.color}`;
  }
  if (element.shape === 'ellipse') {
    el.style.borderRadius = '50%';
  } else if (element.cornerRadius !== undefined) {
    // Apply cornerRadius for any rect-ish shape so the static slider
    // affects plain `rect` as well as `rounded-rect`; ellipse keeps 50%.
    if (typeof element.cornerRadius === 'number') {
      el.style.borderRadius = `${element.cornerRadius}px`;
    } else {
      const [tl, tr, br, bl] = element.cornerRadius;
      el.style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
    }
  }
  // D-010 — drop shadow rendered as box-shadow.
  if (element.shadow) {
    el.style.boxShadow = composeBoxShadow(element.shadow);
  }
  return el;
}

function buildPlaceholder(element: SceneElement, doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  el.dataset['cgPlaceholderFor'] = element.type;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  return el;
}
