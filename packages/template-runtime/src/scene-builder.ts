import type {
  BoxStyle,
  ClockElement,
  CompositionElement,
  Element as SceneElement,
  Fill,
  Filter,
  Layer,
  ListItem,
  RepeaterElement,
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
import { TEXT_NODE_DATASET } from './text-render-node.js';
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
    repeaters: [],
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
    case 'repeater':
      return buildRepeater(element, ctx);
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

/** A gradient fill (linear / radial) — the non-solid `Fill` members. */
type GradientFill = Extract<Fill, { kind: 'linear' | 'radial' }>;

/**
 * B-016 / B-017 — a text colour that paints through `background-clip: text`
 * (linear OR radial); the solid case is rendered the old way (plain `color`).
 */
function isGradientFill(fill: Fill | undefined): fill is GradientFill {
  return fill !== undefined && fill.kind !== 'solid';
}

/**
 * B-017 — the glyph shadow as a `drop-shadow(...)` filter. Unlike `text-shadow`
 * (which paints OVER a `background-clip: text` gradient), a filter shadows the
 * composited glyph result, so the shadow sits BEHIND the gradient.
 */
function dropShadowFilter(s: Shadow): string {
  return `drop-shadow(${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.color})`;
}

/**
 * B-016 — paint a gradient glyph fill on a CONTENT-SIZED node so the gradient maps
 * to the TEXT extent, not the (possibly wider) box: `background-clip: text` clips the
 * gradient to the glyphs, so the node must be sized to the text or a wider box shifts
 * which gradient stop falls on each glyph. The text inner node and the clock span /
 * sequence items are all content-sized.
 */
function applyGradientGlyph(node: HTMLElement, fill: GradientFill): void {
  node.style.background = fillToCss(fill);
  node.style.setProperty('-webkit-background-clip', 'text');
  node.style.setProperty('background-clip', 'text');
  node.style.color = 'transparent';
}

/** Vertical-align enum → flex `justify-content` (the text host is a flex column). */
function vAlignToFlex(v: 'top' | 'middle' | 'bottom' | undefined): string {
  return v === 'middle' ? 'center' : v === 'bottom' ? 'flex-end' : 'flex-start';
}
/** Text-align enum → flex `align-items` (`justify` stretches so it can justify). */
function hAlignToFlex(a: 'start' | 'end' | 'center' | 'justify'): string {
  return a === 'center'
    ? 'center'
    : a === 'end'
      ? 'flex-end'
      : a === 'justify'
        ? 'stretch'
        : 'flex-start';
}

/**
 * B-017 — the HOST-level glyph styling for the time-driven kinds (clock / sequence).
 * They carry no box background, so the gradient itself goes on their content-sized text
 * node(s) (see {@link applyGradientGlyph}); here we set what stays on the host: a SOLID
 * colour + `text-shadow` exactly as before, or — for a GRADIENT — the glyph shadow as
 * `filter: drop-shadow(...)` COMPOSED onto the host filter (which already carries
 * `element.filter`), so it shadows the composited gradient text from the host (the
 * single node the animation applier writes) and sits behind the glyphs.
 */
function applyTimeDrivenHostStyle(
  el: HTMLElement,
  element: { colorFill?: Fill | undefined; textShadow?: Shadow | undefined },
): void {
  if (isGradientFill(element.colorFill)) {
    if (element.textShadow) {
      const drop = dropShadowFilter(element.textShadow);
      el.style.filter = el.style.filter ? `${el.style.filter} ${drop}` : drop;
    }
    return;
  }
  if (element.colorFill !== undefined) el.style.color = element.colorFill.color;
  if (element.textShadow) {
    const s = element.textShadow;
    el.style.textShadow = `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.color}`;
  }
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
  // D-057 — box drop shadow on the text BOX (rendered as box-shadow, like the shape),
  // independent of the glyph shadow (text-shadow / drop-shadow, painted below by
  // `renderTextGlyphs`).
  if (element.shadow) {
    el.style.boxShadow = composeBoxShadow(element.shadow);
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
  // linear/radial both render. Overrides the solid backgroundColor above. The box
  // background stays on the OUTER node (B-016: a gradient text fill no longer
  // overwrites/clips it — it moves to a dedicated inner node, see renderTextGlyphs).
  if (element.backgroundFill !== undefined) {
    el.style.background = fillToCss(element.backgroundFill);
  }
  // D-042 — stroke border + uniform-or-per-corner radius (shared box style).
  applyBoxStyle(el, element);
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
  renderTextGlyphs(el, element, doc);
  textOriginals.set(element.id, element.text);
  return el;
}

/**
 * Render a text element's glyphs (text content + colour + glyph shadow).
 *
 * - SOLID colour (or none): exactly as before — `color` + `text-shadow` on the
 *   host, text content directly on the host.
 * - GRADIENT colour (linear/radial): a dedicated layout-transparent inner node
 *   (`data-cg-text`) carries the gradient (`background-clip: text` + transparent
 *   colour) and the glyph shadow as `filter: drop-shadow(...)`. This keeps the box
 *   background on the host (B-016) and lets the shadow sit BEHIND the gradient
 *   (B-017). The inner node sets no box metrics (it inherits font / align /
 *   direction / white-space) so layout — auto-size, wrap, align, RTL — is unchanged.
 */
function renderTextGlyphs(el: HTMLElement, element: TextElement, doc: Document): void {
  if (isGradientFill(element.colorFill)) {
    const inner = doc.createElement('div');
    inner.dataset[TEXT_NODE_DATASET] = '1';
    applyGradientGlyph(inner, element.colorFill);
    if (element.textShadow) inner.style.filter = dropShadowFilter(element.textShadow);
    // B-016 — content-size the inner node so the gradient maps to the text, not the
    // box. The host is a flex column that positions it (horizontal via `align-items`
    // from `align`, vertical via `justify-content` from `verticalAlign`); the inner
    // shrinks to its content (auto width + non-stretch align), capped at the box width
    // so long text still wraps. `justify` stretches it (text-justify needs full width).
    inner.style.maxWidth = '100%';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.justifyContent = vAlignToFlex(element.verticalAlign);
    el.style.alignItems = hAlignToFlex(element.align);
    inner.textContent = element.text;
    el.appendChild(inner);
    return;
  }
  // Solid (or no) colour fill — the host renders the glyphs, as before.
  if (element.colorFill !== undefined) el.style.color = element.colorFill.color;
  if (element.textShadow) {
    const s = element.textShadow;
    el.style.textShadow = `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.color}`;
  }
  el.textContent = element.text;
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
  // D-056 — the ticker carries no box styling: no background / stroke / border-radius /
  // padding (box styling belongs on a separate shape layer). The crawl viewport is
  // full-bleed; items start at the band edge.
  const viewport = doc.createElement('div');
  viewport.className = 'cg-ticker-viewport';
  viewport.style.position = 'absolute';
  viewport.style.top = '0';
  viewport.style.right = '0';
  viewport.style.bottom = '0';
  viewport.style.left = '0';
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
  // D-056 — the clock carries no box styling (no background / stroke / border-radius /
  // padding); box styling belongs on a separate shape layer. Host-level glyph styling:
  // a SOLID colour + text-shadow, or — for a gradient — the glyph drop-shadow composed
  // onto the host filter (B-017). The gradient itself goes on the content-sized span.
  applyTimeDrivenHostStyle(el, element);
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent =
    element.align === 'start' ? 'flex-start' : element.align === 'end' ? 'flex-end' : 'center';

  // The time span: kept LTR and bidi-isolated inside RTL layouts, with
  // tabular numerals so the width is stable as digits tick. It is content-sized (an
  // inline-level flex item), so a gradient painted here (B-016) maps to the time text,
  // not the box width.
  const span = doc.createElement('span');
  span.dataset['cgClockTime'] = '1';
  span.style.direction = 'ltr';
  span.style.unicodeBidi = 'isolate';
  span.style.fontVariantNumeric = 'tabular-nums';
  span.style.whiteSpace = 'pre';
  if (isGradientFill(element.colorFill)) applyGradientGlyph(span, element.colorFill);
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
  // D-056 — the sequence carries no box styling (no background / stroke / border-radius /
  // padding); box styling belongs on a separate shape layer. Host-level glyph styling:
  // a SOLID colour + text-shadow, or — for a gradient — the glyph drop-shadow composed
  // onto the host filter (B-017). The gradient itself goes on the content-sized item
  // nodes (B-016), so it maps to each item's text rather than the box width.
  applyTimeDrivenHostStyle(el, element);
  const glyphGradientCss = isGradientFill(element.colorFill)
    ? fillToCss(element.colorFill)
    : undefined;
  // READING direction on the host so `justify-items: start/end` resolves
  // against the element's own direction (grid alignment is direction-
  // sensitive): a Persian `align: 'start'` places items at the reading start
  // (the right edge). Transition motion is unaffected — translate offsets
  // are physical. Items re-state direction + bidi isolation themselves.
  el.style.direction = element.direction;
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
    const node = makeSequenceItemNode(doc, element.direction, glyphGradientCss);
    node.textContent = first.text;
    el.appendChild(node);
  }
  ctx.scope.sequences.push({ element, host: el, glyphGradientCss });
  return el;
}

/**
 * D-030 — render a repeater element: the clipped outer box, registered on
 * `scope.repeaters` with the build-context guards (depth/visited) so the
 * runtime's {@link RepeaterDriver} can re-stamp rows at every fresh play
 * through the SAME machinery. Build-time stamps the AUTHORED items so the
 * editor canvas shows rows statically (values applied by the caller — the
 * builder itself has no bindings dependency). CRITICAL: row scopes are NOT
 * pushed into `scope.children` — that list feeds the D-025 namespace
 * aggregation (preview form groups / GDD namespaces); rows live only in the
 * wiring tree.
 */
function buildRepeater(element: RepeaterElement, ctx: BuildCtx): HTMLElement {
  const el = ctx.doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  el.style.overflow = 'hidden';
  ctx.scope.repeaters.push({
    element,
    host: el,
    depth: ctx.depth,
    visited: ctx.visited,
  });
  // Static authored stamp (count only — the runtime driver re-stamps with
  // values; golden/builder tests see the raw row structure).
  buildRepeaterRows(
    ctx.scene,
    element,
    el,
    clampRowCount(element, element.items.length),
    { depth: ctx.depth, visited: ctx.visited },
    ctx.doc,
  );
  return el;
}

/** The effective stamped row count: the list length clamped by `maxItems`. */
export function clampRowCount(element: Pick<RepeaterElement, 'maxItems'>, count: number): number {
  return element.maxItems !== undefined ? Math.min(count, element.maxItems) : count;
}

/** One stamped repeater row: the flow-positioned cell + its fresh scope. */
export interface RepeaterRowBuild {
  cell: HTMLElement;
  scope: FieldScope;
}

/**
 * D-030 — stamp `count` rows of `element`'s child composition into `host`,
 * mirroring {@link buildComposition}'s inner stage per row: a cell positioned
 * in the flow (`'column'` ⇒ cells fill the box width and stack top-to-bottom;
 * `'row'` ⇒ cells fill the box height and lay along the row axis ordered by
 * `flow`), the child's aspect preserved, with the zero-resolution guard.
 * Each row gets a FRESH scope built from the child's layers with depth+1 and
 * visited+childId (the cycle/runaway guard renders an empty box if forced).
 * Returns the rows in order; the caller applies values / wires drivers.
 */
export function buildRepeaterRows(
  scene: Scene,
  element: RepeaterElement,
  host: HTMLElement,
  count: number,
  guard: { depth: number; visited: ReadonlySet<string> },
  doc: Document,
): RepeaterRowBuild[] {
  const comp = scene.compositions?.find((c) => c.id === element.compositionId);
  if (
    comp === undefined ||
    guard.depth >= MAX_COMPOSITION_DEPTH ||
    guard.visited.has(element.compositionId)
  ) {
    return []; // missing/over-deep/cyclic reference ⇒ the empty clipped box
  }
  const boxW = element.transform.size.w;
  const boxH = element.transform.size.h;
  // Cross-axis fit, aspect preserved; a zero-resolution child scales 1 (the
  // buildComposition guard) so nothing divides by zero.
  const scale =
    element.direction === 'column'
      ? comp.resolution.width === 0
        ? 1
        : boxW / comp.resolution.width
      : comp.resolution.height === 0
        ? 1
        : boxH / comp.resolution.height;
  const cellW = comp.resolution.width * scale;
  const cellH = comp.resolution.height * scale;

  const rows: RepeaterRowBuild[] = [];
  for (let i = 0; i < count; i += 1) {
    const cell = doc.createElement('div');
    cell.dataset['cgRepeaterRow'] = String(i);
    cell.style.position = 'absolute';
    cell.style.overflow = 'hidden';
    cell.style.width = `${cellW}px`;
    cell.style.height = `${cellH}px`;
    if (element.direction === 'column') {
      cell.style.left = '0';
      cell.style.top = `${i * (cellH + element.gap)}px`;
    } else {
      const offset = i * (cellW + element.gap);
      cell.style.top = '0';
      // `flow` orders the ROW axis: 'rtl' lays row 1 at the right edge.
      cell.style.left = element.flow === 'rtl' ? `${boxW - cellW - offset}px` : `${offset}px`;
    }

    const inner = doc.createElement('div');
    inner.className = 'cg-comp-inner';
    inner.style.position = 'absolute';
    inner.style.left = '0';
    inner.style.top = '0';
    inner.style.width = `${comp.resolution.width}px`;
    inner.style.height = `${comp.resolution.height}px`;
    inner.style.transformOrigin = '0 0';
    inner.style.transform = `scale(${String(scale)}, ${String(scale)})`;
    if (comp.background !== 'transparent') inner.style.background = comp.background;

    // A fresh ROW scope — real per-scope semantics (lifecycle, drivers,
    // content holds) by construction, but NEVER in `scope.children`.
    const rowScope = newScope(inner, comp);
    const rowCtx: BuildCtx = {
      doc,
      scene,
      scope: rowScope,
      depth: guard.depth + 1,
      visited: new Set([...guard.visited, element.compositionId]),
    };
    for (const layer of comp.layers) {
      inner.appendChild(buildLayer(layer, rowCtx));
    }
    cell.appendChild(inner);
    host.appendChild(cell);
    rows.push({ cell, scope: rowScope });
  }
  return rows;
}

/** Strip the reconcile `id` off a list item — the rest are child field values. */
export function repeaterItemValues(item: ListItem): Record<string, unknown> {
  const { id: _id, ...values } = item as Record<string, unknown>;
  return values;
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

/**
 * D-042 — apply the shared box style to a background-capable element's node: the
 * border from `stroke` (a non-empty dash → `dashed`) and a uniform-or-per-corner
 * `border-radius`. Reused by every kind that mixes in `BoxStyleSchema` (shape,
 * text, ticker, clock, sequence). Background itself stays per-kind.
 */
function applyBoxStyle(el: HTMLElement, box: BoxStyle): void {
  if (box.stroke) {
    const style = box.stroke.dash !== undefined && box.stroke.dash.length > 0 ? 'dashed' : 'solid';
    el.style.border = `${box.stroke.width}px ${style} ${box.stroke.color}`;
  }
  if (box.cornerRadius !== undefined) {
    el.style.borderRadius =
      typeof box.cornerRadius === 'number'
        ? `${box.cornerRadius}px`
        : `${box.cornerRadius[0]}px ${box.cornerRadius[1]}px ${box.cornerRadius[2]}px ${box.cornerRadius[3]}px`;
  }
}

function buildShape(element: ShapeElement, doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  if (element.fill !== undefined) {
    el.style.background = fillToCss(element.fill);
  }
  // D-042 — shared box style (border from stroke, uniform-or-per-corner radius);
  // ellipse keeps a 50% radius regardless of any authored cornerRadius.
  applyBoxStyle(el, element);
  if (element.shape === 'ellipse') {
    el.style.borderRadius = '50%';
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
