import { followsComposition, pathVisualBBox } from '@cg/shared-schema';
import type {
  AnchorPoint,
  BoxStyle,
  ClockElement,
  CompositionElement,
  Element as SceneElement,
  Fill,
  Filter,
  Layer,
  ListItem,
  LottieElement,
  PathElement,
  RepeaterElement,
  Scene,
  SequenceElement,
  Shadow,
  Stroke,
  TextElement,
  TickerElement,
  ImageElement,
  ShapeElement,
  Transform,
  VideoElement,
  VideoPlaceholderElement,
} from '@cg/shared-schema';
import type { BuildSceneResult, FieldScope, LifecycleSource, RenderMode } from './types.js';
import { clockInitialText } from './clock-driver.js';
import { makeSequenceItemNode } from './sequence-driver.js';
import { TEXT_NODE_DATASET } from './text-render-node.js';
import { populateTickerStaticRow } from './ticker-driver.js';
import { assignZoneIndices, hasZonedCountdown } from './zone-css.js';

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
  /**
   * Width (px) of the ENCLOSING stage — the scene resolution at the root, the
   * composition resolution inside a nested instance. Used to pin an auto-sized
   * RTL text box by its RIGHT edge via CSS `right` (D-060 §E).
   */
  resolutionWidth: number;
  /**
   * D-137 §9 — `'author'` (canvas / Preview modal) or `'output'` (both exporters).
   * Read by exactly one builder, {@link buildLiveSource}. Carried on the ctx rather
   * than passed down, so a nested composition instance inherits it by construction
   * — a Live Source three instances deep cannot end up in the other mode.
   */
  mode: RenderMode;
  /**
   * B-134 — is this the editing CANVAS? Only the canvas paints the editor backdrop.
   * Carried on the ctx for the same reason `mode` is: a nested instance inherits it by
   * construction, so a composition three levels down cannot paint a backdrop the
   * surface above it suppressed.
   */
  paintEditorBackdrop: boolean;
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
    lotties: [],
    videos: [],
    lifespanGates: [],
    source,
  };
}

const MAX_COMPOSITION_DEPTH = 8;

export function buildScene(
  scene: Scene,
  doc: Document = document,
  mode: RenderMode = 'output',
  paintEditorBackdrop = true,
): BuildSceneResult {
  const container = doc.createElement('div');
  container.className = 'cg-stage';
  container.style.width = `${scene.resolution.width}px`;
  container.style.height = `${scene.resolution.height}px`;
  // B-129 — the backdrop is an EDITOR affordance and MUST NOT reach output. One
  // field used to carry two facts ("let me see my white text" and "this paints on
  // air"), so an editing preference went to air as a full-frame card over live
  // video. `author` paints it; `output` paints nothing, and an authored background
  // is a real full-frame element like anything else that paints.
  // B-134 — and ONLY on the editing canvas. The Preview modal is a preview of AIR, so
  // it must show what air shows: no backdrop. It still boots in `'author'` mode for
  // Live Sources, which is exactly why the two facts cannot share one flag.
  if (mode === 'author' && paintEditorBackdrop && scene.editorBackdrop !== 'transparent') {
    container.style.background = scene.editorBackdrop;
  }
  // D-141 — this scope owns a zoned countdown, so it is a zone ROOT: the driver
  // publishes `data-cg-zone` here at run time, and the compiled reset rule keys off
  // this marker so a nested zoned root cannot inherit its host's zone values.
  if (hasZonedCountdown(scene.layers)) container.dataset['cgZoneRoot'] = '';

  const rootScope = newScope(container, scene);
  const ctx: BuildCtx = {
    doc,
    scene,
    scope: rootScope,
    depth: 0,
    visited: new Set<string>(),
    resolutionWidth: scene.resolution.width,
    mode,
    paintEditorBackdrop,
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

  // D-141 — the per-scene slot numbering the zone stylesheet was compiled with.
  // Keyed by element id, so the same authored element inside a composition
  // instanced twice stamps the SAME index on both DOM copies — each then reads the
  // nearest publishing ancestor, which is what makes nearest-wins work per instance.
  const zoneIndices = assignZoneIndices(ctx.scene);

  // Sort by zIndex so DOM order matches z-stack semantics.
  const sorted = [...layer.children].sort((a, b) => a.zIndex - b.zIndex);
  for (const element of sorted) {
    const elementNode = buildElement(element, ctx);
    if (elementNode === null) continue;
    node.appendChild(elementNode);
    const zoneIndex = zoneIndices.get(element.id);
    if (zoneIndex !== undefined) elementNode.dataset['cgZoneEl'] = String(zoneIndex);
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
    // B-089 — a trimmed element's gate belongs to THIS scope too, for the same reason:
    // its `lifespan` is authored in this composition's frame space, so only this scope's
    // controller (running that timeline) can evaluate it. Collecting here — rather than
    // re-walking `scene.layers` against the root elementMap, as the root-only version did
    // — reaches every nested instance by construction.
    //
    // `naturalDisplay` is captured HERE, from the display `buildElement` just settled, and
    // NOT only by a later tree walk. Stamped scopes (a repeater row, a sequence composition
    // item) are deliberately never in `scope.children`, so a post-build walk of the
    // namespace tree cannot reach them; leaving their gates on a placeholder made the gate
    // restore `''` instead of the built value — which un-hid a `visible:false` element
    // (B-034) and flattened a `flex`/`grid` element to `block` on re-entering its trim.
    // `snapshotLifespanGates` still REFRESHES the scopes it can reach, so a boot-time
    // visibility binding (which writes `style.display`) keeps its established semantics.
    if (element.lifespan !== undefined) {
      ctx.scope.lifespanGates.push({
        node: elementNode,
        lifespan: element.lifespan,
        naturalDisplay: elementNode.style.display,
      });
    }
  }
  return node;
}

/*
 * 🔴 **`single-clock-look-switch` — `punchLiveSourceHoles` IS GONE from the build funnel.**
 *
 * `buildLayer` remains the single funnel every element kind passes through at every
 * composition depth; what it no longer does there is cut a hole. A plate-bearing package is
 * composited BELOW its plates, so no part of the page is ever in front of a picture, and an
 * element that carries no mask property is exactly right rather than a case to reason about.
 *
 * ⚠ `ctx.punchTargets` went with it, and that is the half worth naming: it registered EVERY
 * built element — not only the punched ones — so a later re-punch could reach an element that
 * ACQUIRED a hole. With no punch there is nothing to re-reach, and keeping the registry would
 * be a map nothing reads, built on every element of every scene.
 */

function buildElement(element: SceneElement, ctx: BuildCtx): HTMLElement | null {
  switch (element.type) {
    case 'text':
      return buildText(element, ctx);
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
    case 'path':
      return buildPath(element, ctx.doc);
    case 'composition':
      return buildComposition(element, ctx);
    case 'lottie':
      return buildLottie(element, ctx);
    case 'container':
      // M3.2-α: not yet supported. Render a placeholder div so layout
      // doesn't shift and the element id can still be bound. Animation
      // (M3.2-β) will replace this.
      return buildPlaceholder(element, ctx.doc);
    case 'video-placeholder':
      // D-137 — a Live Source. Bars on the authoring surfaces, ZERO PAINTED
      // PIXELS in both exports. No longer the bare `buildPlaceholder`, which
      // painted nothing everywhere and so was unauthorable.
      return buildLiveSource(element, ctx);
    case 'video':
      // D-128 Phase 3 — render a real <video> at its mid-clip poster frame; Phase
      // 4 registers it on the scope so createRuntime attaches a VideoDriver.
      return buildVideo(element, ctx);
  }
}

/**
 * D-125 — render a Lottie element: a positioned/clipped mount container the
 * runtime mounts a `lottie_light` player into and drives frame-by-frame
 * ({@link LottieDriver}). The builder itself creates ONLY the container + registers
 * it on `scope.lotties`; the player mount (which needs the resolved `animationData`)
 * happens at wiring time in `createRuntime`, mirroring how the ticker band/track is
 * built here but its driver is instantiated in the runtime. The animation clips to
 * the box (`overflow: hidden`) so a rotated/scaled furniture piece stays in bounds.
 */
function buildLottie(element: LottieElement, ctx: BuildCtx): HTMLElement {
  const el = ctx.doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  el.style.overflow = 'hidden';
  ctx.scope.lotties.push({ element, container: el });
  return el;
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
  // B-129 — author-mode only; a nested instance is where a backdrop would otherwise
  // leak. B-134 — and canvas-only: the Preview modal suppresses it at every depth.
  if (ctx.mode === 'author' && ctx.paintEditorBackdrop && comp.editorBackdrop !== 'transparent')
    inner.style.background = comp.editorBackdrop;
  // D-141 — a nested instance whose own composition carries a zoned countdown is a
  // zone root in its own right; one without stays transparent to the host's zone,
  // which is how zone state crosses instance boundaries.
  if (hasZonedCountdown(comp.layers)) inner.dataset['cgZoneRoot'] = '';

  // A fresh field scope for THIS instance — so the same child instanced twice
  // gets two independent element maps, addressed by the instance's namespace.
  const childScope = newScope(inner, comp);
  ctx.scope.children.push({
    name: element.name,
    compositionId: element.compositionId,
    scope: childScope,
    // B-034 — a HIDDEN composition instance (`visible: false`) makes its ENTIRE subtree inert: render
    // already hides it (display:none above), and the parent's hold aggregation must skip it too, so a
    // visible content driver INSIDE a hidden instance can't keep the parent open.
    visible: element.visible,
    // D-112 — carry the instance's per-instance hold overrides so the PARENT's aggregation can
    // re-filter this child's content (the override lives on the instance, not the shared child).
    holdOverrides: element.holdOverrides,
  });
  const childCtx: BuildCtx = {
    ...ctx,
    scope: childScope,
    depth: ctx.depth + 1,
    visited: new Set([...ctx.visited, element.compositionId]),
    resolutionWidth: comp.resolution.width,
    // 1.5c — extend the instance PATH, matching `flattenElements`' key exactly. The
    // bare element id would collide across two instances of the same composition,
    // and a hole computed for one instance's scene position is wrong for the other's.
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
  /**
   * D-060 — when true, skip writing `width`/`height` from `transform.size` so the
   * caller can size the box from content (auto-size text uses CSS intrinsic
   * sizing). Position/opacity/transform/origin are written as usual.
   */
  skipSize = false,
): void {
  el.classList.add('cg-element');
  el.style.left = `${transform.position.x}px`;
  el.style.top = `${transform.position.y}px`;
  if (!skipSize) {
    el.style.width = `${transform.size.w}px`;
    el.style.height = `${transform.size.h}px`;
  }
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

/**
 * The static box-shadow for the shape AND the text box (the sole composer for both).
 * D-043 — the full CSS box-shadow model: an optional `inset` keyword prefix and the
 * `spread` radius (the 4th length; absent ⇒ 0, a CSS no-op vs the old 3-length form).
 * `text-shadow` / `drop-shadow` use their own composers and take neither.
 */
function composeBoxShadow(s: Shadow): string {
  return `${s.inset ? 'inset ' : ''}${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.spread ?? 0}px ${s.color}`;
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
/**
 * D-045 — vertical-align enum → GRID `align-items` (the sequence host is a grid; grid
 * uses start/center/end, NOT the flex `flex-start`/`flex-end` keywords).
 */
function vAlignToGrid(v: 'top' | 'middle' | 'bottom' | undefined): string {
  return v === 'middle' ? 'center' : v === 'bottom' ? 'end' : 'start';
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

function buildText(element: TextElement, ctx: BuildCtx): HTMLElement {
  const doc = ctx.doc;
  const textOriginals = ctx.scope.textOriginals;
  // D-060 — Auto sizing (`fitMode: 'autosize'`) hugs the content in BOTH dimensions
  // via CSS intrinsic sizing; `fixed` keeps the `transform.size` box (today's path).
  const isAuto = element.fitMode === 'autosize';
  const el = doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter, isAuto);
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
  if (isAuto) {
    // D-060 §B — hug the content in both dimensions with CSS intrinsic sizing
    // (synchronous, CEF/file://-safe — no JS measurement). `white-space: pre`
    // honours explicit `\n` (multi-line: width = widest line, height = sum of
    // line heights) and forbids width-constrained wrapping. A minimum box keeps
    // empty/whitespace text selectable + editable rather than collapsing to zero.
    // The vertical-align flex wrapper is intentionally NOT applied (the height
    // hugs content, so there is no vertical slack); horizontal `text-align` above
    // still positions shorter lines within a multi-line box (D-060 §D).
    el.style.width = 'max-content';
    el.style.height = 'max-content';
    el.style.whiteSpace = 'pre';
    el.style.minWidth = `${element.font.size * 0.5}px`;
    el.style.minHeight = `${element.font.size * element.font.lineHeight}px`;
    // D-060 §E — anchor at the reading-start corner. LTR (and `auto`) keep the
    // top-left pin (CSS `left` from `applyBaseStyles`) and grow right/down; RTL
    // pins the top-RIGHT edge via CSS `right` (derived from the enclosing stage
    // width) so growth extends leftward and the right edge stays put.
    if (element.direction === 'rtl') {
      el.style.left = 'auto';
      el.style.right = `${ctx.resolutionWidth - element.transform.position.x}px`;
    }
  } else {
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
  // D-045 — vertical placement of the crawl text within the band (mirrors the driver's
  // live item nodes so authoring and runtime match). Default 'middle' = the prior centring.
  staticRow.style.alignItems = vAlignToFlex(element.verticalAlign ?? 'middle');
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
  // Respect the layer/element hide flag — the flex display must NOT clobber the
  // `display: none` applyBaseStyles set for an invisible clock (else hide is ignored).
  el.style.display = element.visible ? 'flex' : 'none';
  // D-045 — vertical placement via flex `align-items`; horizontal stays `justify-content`.
  // Default 'middle' = the prior centring (non-breaking).
  el.style.alignItems = vAlignToFlex(element.verticalAlign ?? 'middle');
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
    {
      mode: element.mode,
      format: element.format,
      digits: element.digits,
      target: element.target,
      timezone: element.timezone,
    },
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
  // Respect the layer/element hide flag — the grid display must NOT clobber the
  // `display: none` applyBaseStyles set for an invisible sequence (else hide is ignored).
  el.style.display = element.visible ? 'grid' : 'none';
  // D-045 — vertical placement via grid `align-items` (start/center/end); horizontal stays
  // `justify-items` (the `align` enum maps 1:1). Default 'middle' = the prior centring.
  el.style.alignItems = vAlignToGrid(element.verticalAlign ?? 'middle');
  el.style.justifyItems = element.align;

  // Static initial render: item 1 through the shared factory (empty items ⇒ an
  // empty box). The driver re-renders the same markup on reset(). D-083 — a
  // COMPOSITION item-1 shows the comp's HELD content statically (its clock's
  // initial value); live ticking begins when the run starts and the driver
  // re-renders it with wired drivers (the throwaway scope here is NEVER wired).
  const first = element.items[0];
  if (first !== undefined) {
    if (first.kind === 'composition') {
      const built = buildSequenceCompositionItem(
        ctx.scene,
        first.compositionId,
        { width: element.transform.size.w, height: element.transform.size.h },
        { depth: ctx.depth, visited: ctx.visited },
        doc,
      );
      if (built !== null) el.appendChild(built.cell);
    } else {
      const node = makeSequenceItemNode(doc, element.direction, glyphGradientCss);
      node.textContent = first.text;
      el.appendChild(node);
    }
  }
  ctx.scope.sequences.push({
    element,
    host: el,
    glyphGradientCss,
    depth: ctx.depth,
    visited: ctx.visited,
  });
  return el;
}

/** D-083 — one rendered composition sequence item: the grid-cell node + its fresh scope. */
export interface SequenceCompositionItemBuild {
  cell: HTMLElement;
  scope: FieldScope;
}

/**
 * D-083 — build a COMPOSITION sequence item: the referenced composition's content
 * scaled to FILL the sequence box (independent x/y, like {@link buildComposition}'s
 * instance stage), in a grid-cell node stacked in the host's single cell — so it
 * coexists with the outgoing item during a transition, exactly like a text item.
 * A FRESH scope (NEVER in `scope.children`) the caller wires + lifecycles. Returns
 * null for a missing / over-deep / cyclic reference (⇒ the driver renders an empty box).
 */
export function buildSequenceCompositionItem(
  scene: Scene,
  compositionId: string,
  box: { width: number; height: number },
  guard: { depth: number; visited: ReadonlySet<string> },
  doc: Document,
  // D-137 §9 — the render mode, threaded because a stamped item is a real scope and
  // may contain a Live Source. Defaults to `'output'` (paint nothing), the safe
  // direction: a caller that forgets cannot put colour bars on air.
  mode: RenderMode = 'output',
  // B-134 — the canvas-only axis, threaded for the same reason.
  paintEditorBackdrop = true,
): SequenceCompositionItemBuild | null {
  const comp = scene.compositions?.find((c) => c.id === compositionId);
  if (
    comp === undefined ||
    guard.depth >= MAX_COMPOSITION_DEPTH ||
    guard.visited.has(compositionId)
  ) {
    return null;
  }
  const cell = doc.createElement('div');
  cell.dataset['cgSequenceItem'] = '1';
  cell.dataset['cgSequenceCompositionId'] = compositionId;
  cell.style.gridArea = '1 / 1';
  cell.style.overflow = 'hidden';
  cell.style.position = 'relative';
  cell.style.width = `${box.width}px`;
  cell.style.height = `${box.height}px`;

  const inner = doc.createElement('div');
  inner.className = 'cg-comp-inner';
  inner.style.position = 'absolute';
  inner.style.left = '0';
  inner.style.top = '0';
  inner.style.width = `${comp.resolution.width}px`;
  inner.style.height = `${comp.resolution.height}px`;
  inner.style.transformOrigin = '0 0';
  const sx = comp.resolution.width === 0 ? 1 : box.width / comp.resolution.width;
  const sy = comp.resolution.height === 0 ? 1 : box.height / comp.resolution.height;
  inner.style.transform = `scale(${String(sx)}, ${String(sy)})`;
  // B-129 — author-mode only (see `buildScene`); `mode` is the param this builder
  // already takes. B-134 — and canvas-only, same reasoning.
  if (mode === 'author' && paintEditorBackdrop && comp.editorBackdrop !== 'transparent')
    inner.style.background = comp.editorBackdrop;
  // D-141 — a stamped scope is a scope: it publishes its own zone when it owns a
  // zoned countdown (same rule as every other scope container).
  if (hasZonedCountdown(comp.layers)) inner.dataset['cgZoneRoot'] = '';

  // A fresh item scope — real per-scope semantics (drivers, holds) by construction,
  // but NEVER in `scope.children` (the sequence driver owns its lifecycle).
  const itemScope = newScope(inner, comp);
  const itemCtx: BuildCtx = {
    // ⚠ Its OWN empty map, deliberately: `flattenElements` does NOT walk a `sequence` or a
    // `repeater` (their stamps' positions are computed at run time), so nothing inside one
    // ever carries a hole — and every stamp of the same authored element would key to the
    // same mask key, so one shared map would have the last stamp silently stand for all of
    // them. Registering nothing is the honest answer, and 4.6 refuses the case that would
    // have made it matter.
    doc,
    scene,
    scope: itemScope,
    depth: guard.depth + 1,
    visited: new Set([...guard.visited, compositionId]),
    resolutionWidth: comp.resolution.width,
    mode,
    paintEditorBackdrop,
  };
  for (const layer of comp.layers) {
    inner.appendChild(buildLayer(layer, itemCtx));
  }
  cell.appendChild(inner);
  return { cell, scope: itemScope };
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
  // D-137 §9 — as above: a stamped ROW is a real scope and may contain a Live
  // Source, so the mode has to reach it. `'output'` by default, the safe direction.
  mode: RenderMode = 'output',
  // B-134 — the canvas-only axis, threaded for the same reason.
  paintEditorBackdrop = true,
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
    // B-129 — author-mode only (see `buildScene`); `mode` is the param this builder
    // already takes. B-134 — and canvas-only, same reasoning.
    if (mode === 'author' && paintEditorBackdrop && comp.editorBackdrop !== 'transparent')
      inner.style.background = comp.editorBackdrop;
    // D-141 — same rule for a stamped repeater row.
    if (hasZonedCountdown(comp.layers)) inner.dataset['cgZoneRoot'] = '';

    // A fresh ROW scope — real per-scope semantics (lifecycle, drivers,
    // content holds) by construction, but NEVER in `scope.children`.
    const rowScope = newScope(inner, comp);
    const rowCtx: BuildCtx = {
      // Its OWN empty map — see the identical note on the sequence item context above.
      doc,
      scene,
      scope: rowScope,
      depth: guard.depth + 1,
      visited: new Set([...guard.visited, element.compositionId]),
      resolutionWidth: comp.resolution.width,
      mode,
      paintEditorBackdrop,
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

/**
 * D-149 — `fit-width` / `fit-height`: scale so ONE axis matches the box and let
 * the other overflow, clipped.
 *
 * 🔴 **THE CONSTRAINT THAT SHAPES THIS FUNCTION: the extra node is emitted ONLY
 * for the two modes that need it.** `contain` / `cover` / `fill` / `none` return
 * from {@link buildImage}'s legacy path BEFORE this is reached, byte-for-byte as
 * they always did. A wrapper on every image would change the rendered output of
 * templates that do not use these options at all — an ON-AIR change bought for
 * nothing — and `tests/image-fit.test.ts` pins the pre-change DOM for all four
 * old modes against a golden captured before this landed.
 *
 * **Why a wrapper is needed at all, and why the no-wrapper forms were rejected.**
 * CSS `object-fit` cannot express "scale by the WIDTH ratio": `contain` takes the
 * MIN of the two axis ratios and `cover` the MAX, and which of them equals the
 * width ratio depends on the image's intrinsic aspect versus the box's. So:
 *
 * - **Picking `contain` vs `cover` from the asset's intrinsic size** would give
 *   exactly this geometry with NO extra node — `fit-width` IS `contain` when the
 *   image is relatively wider than the box and `cover` when it is narrower. It is
 *   rejected because those dimensions are **not in the scene**: `defaultImage`
 *   uses them to size the element at import and stores nothing
 *   (`element-defaults.ts`), so the renderer would need a new schema field that
 *   goes STALE the moment the asset behind the id is replaced.
 * - **Deciding it in JS at asset-load time** (`naturalWidth` is known there) needs
 *   every host that resolves `data-cg-asset-id` to cooperate — the Designer's
 *   preview walk and the runtime's own are separate code — which is the B-102
 *   class exactly: renders in preview, absent on hardware. CSS decided at BUILD
 *   time reaches canvas, Preview modal and export through the one `buildScene`
 *   call all three already share.
 *
 * The declarations used are `width`/`height: auto`, `overflow: hidden` and a
 * `translate` centring — all baseline CSS 2.1, so nothing here depends on a
 * feature younger than CasparCG's CEF 71 (the B-066 lesson).
 */
function buildImageFitAxis(element: ImageElement, doc: Document): HTMLElement {
  const box = doc.createElement('div');
  box.dataset['cgElementId'] = element.id;
  applyBaseStyles(box, element.transform, element.opacity, element.visible, element.filter);
  // The whole point of the extra node: the overflowing axis is clipped to the
  // authored rect, so the element still occupies exactly the box it was drawn as.
  box.style.overflow = 'hidden';
  if (element.tint) {
    // Same v1 approximation as the legacy path, applied to the box so it covers
    // the image it wraps (see buildImage).
    box.style.filter = `drop-shadow(0 0 0 ${element.tint})`;
  }

  const el = doc.createElement('img');
  el.alt = element.name;
  el.style.position = 'absolute';
  if (element.fit === 'fit-width') {
    // Width pinned to the box, height free — then centred on the overflowing
    // axis, which is what `cover` does for its own overflow and is the only
    // choice that makes fit-width and cover agree where they coincide.
    el.style.left = '0';
    el.style.top = '50%';
    el.style.width = '100%';
    el.style.height = 'auto';
    el.style.transform = 'translateY(-50%)';
  } else {
    el.style.top = '0';
    el.style.left = '50%';
    el.style.height = '100%';
    el.style.width = 'auto';
    el.style.transform = 'translateX(-50%)';
  }
  // Stays on the <img>, never on the box: every host resolves the asset by
  // walking `img[data-cg-asset-id]` (runtime.ts, preview.ts), and moving it
  // would silently break the src resolution this element depends on.
  el.dataset['cgAssetId'] = element.assetId;
  box.appendChild(el);
  return box;
}

function buildImage(element: ImageElement, doc: Document): HTMLElement {
  // D-149 — the ONLY two modes that need an extra node take it; everything below
  // this line is untouched, and is asserted byte-identical by `image-fit.test.ts`.
  if (element.fit === 'fit-width' || element.fit === 'fit-height') {
    return buildImageFitAxis(element, doc);
  }
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
 * D-128 Phase 3 — the video element's canvas render: a REAL `<video>` (VP8+alpha
 * decodes with transparency), sitting at its MID-CLIP poster frame at rest. Like
 * `<img>`, the `src` is left unset here — the host resolves `data-cg-asset-id`
 * to a blob URL (designer: preview.ts `applyAssetUrls`; exports: runtime.ts's
 * `img[data-cg-asset-id]` walk, widened to video in Phase 5) — and the host
 * seeks the paused element to `data-cg-poster-ms` so a transparent frame 0 is
 * never shown (decision (a): `phases.introEnd ?? clip midpoint`). Muted + inert;
 * the playback lifecycle (VideoDriver) is Phase 4.
 */
function buildVideo(element: VideoElement, ctx: BuildCtx): HTMLElement {
  const el = ctx.doc.createElement('video');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  el.style.objectFit = 'contain';
  el.dataset['cgAssetId'] = element.assetId;
  el.dataset['cgPosterMs'] = String(videoPosterMs(element));
  el.muted = true;
  el.setAttribute('playsinline', '');
  el.setAttribute('preload', 'metadata');
  // D-128 Phase 4 — register on the scope so createRuntime attaches a VideoDriver
  // (mirrors buildLottie's ctx.scope.lotties.push). The <video> IS an
  // HTMLVideoElement — the driver commands play/pause/seek on it.
  ctx.scope.videos.push({ element, container: el });
  return el;
}

/**
 * The poster/at-rest frame time (ms) — the IN-point when marked (that authored
 * hold frame is meaningful), else the clip midpoint. Inlined here (the designer
 * has its own `posterTimeMs`) exactly as the D-125 Lottie poster rule is inlined
 * at `runtime.ts` — the runtime package cannot import from the designer app.
 *
 * media-phases-follow-composition — a FOLLOW-source clip's stored `introEnd` is IGNORED
 * data, so the poster falls back to `holdAt` (the authored held look) else the midpoint.
 * This is only the NO-ANCHORS fallback: `createRuntime` REFINES the dataset to the exact
 * derived `H` at driver construction, where the comp anchors exist.
 */
function videoPosterMs(element: VideoElement): number {
  const posterAnchor = followsComposition(element.phases)
    ? element.phases?.holdAt
    : element.phases?.introEnd;
  if (posterAnchor !== undefined && posterAnchor > 0 && posterAnchor < element.durationMs) {
    return posterAnchor;
  }
  return Math.round(element.durationMs / 2);
}

/**
 * The CSS shorthand for a {@link Stroke} — `"<w>px <solid|dashed> <color>"`.
 *
 * ONE spelling, two properties: {@link applyBoxStyle} feeds it to `border` for the
 * box kinds, {@link buildLiveSource} feeds the SAME string to `outline` for a Live
 * Source (see there for why the property differs). The grammar is identical for
 * both, so a dash rule or a unit that changed here could not reach one and miss the
 * other — which is exactly how a plate's frame and a shape's would come to disagree
 * about the same authored value.
 */
function strokeShorthand(stroke: Stroke): string {
  const style = stroke.dash !== undefined && stroke.dash.length > 0 ? 'dashed' : 'solid';
  return `${stroke.width}px ${style} ${stroke.color}`;
}

/**
 * D-042 — apply the shared box style to a background-capable element's node: the
 * border from `stroke` (a non-empty dash → `dashed`) and a uniform-or-per-corner
 * `border-radius`. Reused by every kind that mixes in `BoxStyleSchema` (shape,
 * text, ticker, clock, sequence). Background itself stays per-kind.
 */
function applyBoxStyle(el: HTMLElement, box: BoxStyle): void {
  if (box.stroke) {
    el.style.border = strokeShorthand(box.stroke);
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

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * D-109 — build the SVG `d` attribute for a `path` element from its anchor points.
 * Each segment is a cubic `C` from the start anchor's `out` handle to the next
 * anchor's `in` handle (handles are deltas from the anchor); a segment with NO
 * handle on either end collapses to a straight `L`. A CLOSED path appends the
 * wrap-around segment (last → first) and `Z`. Points are in the element's local
 * box space (px), drawn 1:1 by an un-viewBox'd SVG, so the B-022 gizmo's scale
 * transform on the wrapper scales the outline without re-baking coordinates.
 * Exported for the d-string unit test.
 */
export function pathD(points: readonly AnchorPoint[], closed: boolean): string {
  const first = points[0];
  if (first === undefined) return '';
  const n = (v: number): string => String(Math.round(v * 1000) / 1000);
  const seg = (a: AnchorPoint, b: AnchorPoint): string => {
    if (a.out === undefined && b.in === undefined) return `L ${n(b.x)} ${n(b.y)}`;
    const c1x = a.x + (a.out?.x ?? 0);
    const c1y = a.y + (a.out?.y ?? 0);
    const c2x = b.x + (b.in?.x ?? 0);
    const c2y = b.y + (b.in?.y ?? 0);
    return `C ${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(b.x)} ${n(b.y)}`;
  };
  const segs: string[] = [`M ${n(first.x)} ${n(first.y)}`];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined) segs.push(seg(a, b));
  }
  if (closed) {
    const last = points[points.length - 1];
    if (last !== undefined && last !== first) segs.push(seg(last, first));
    segs.push('Z');
  }
  return segs.join(' ');
}

/**
 * D-109 — the SVG `fill` value for a path. Solid is the colour itself (the editor
 * only authors solid path fills); a stored gradient degrades to its first stop
 * (a plain SVG `fill` can't carry a CSS gradient — full SVG-gradient defs are a
 * future enhancement, see design.md).
 */
function pathFillColor(fill: Fill): string {
  return fill.kind === 'solid' ? fill.color : (fill.stops[0]?.color ?? 'none');
}

/**
 * D-109 — render a `path` element as `<div><svg><path d></svg></div>`: the wrapper
 * carries the element transform/opacity/filter (so transform animates like any
 * shape), the SVG fills it 1:1 (`overflow: visible`), and the `<path>` carries the
 * outline. A CLOSED path fills + strokes; an OPEN path strokes only (`fill: none`).
 */
function buildPath(element: PathElement, doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  // B-059/B-062 — viewBox = the points' VISUAL (curve-aware) bbox + non-uniform
  // fit. Under the size==visualBBox convention this is (0,0,size) — scale 1 — and
  // ANIMATED size.w/h still stretches the drawing (the wrapper resizes over the
  // fixed viewBox, unchanged semantics). Legacy content is migrated at ingestion
  // (`migrateScenePaths` in createRuntime), so this mapping is always conforming.
  const bbox = pathVisualBBox(element.points, element.closed);
  const n = (v: number): string => String(Math.round(v * 1000) / 1000);
  svg.setAttribute(
    'viewBox',
    `${n(bbox.x)} ${n(bbox.y)} ${n(Math.max(bbox.w, 1))} ${n(Math.max(bbox.h, 1))}`,
  );
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.display = 'block';
  svg.style.overflow = 'visible';
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathD(element.points, element.closed));
  path.setAttribute(
    'fill',
    element.closed && element.fill !== undefined ? pathFillColor(element.fill) : 'none',
  );
  applyPathStroke(path, element.stroke);
  svg.appendChild(path);
  el.appendChild(svg);
  return el;
}

/** D-109 — apply a {@link Stroke} to an SVG `<path>` (the SVG analogue of the box border). */
function applyPathStroke(path: Element, stroke: BoxStyle['stroke']): void {
  if (stroke === undefined || stroke.width <= 0) {
    path.setAttribute('stroke', 'none');
    return;
  }
  path.setAttribute('stroke', stroke.color);
  path.setAttribute('stroke-width', String(stroke.width));
  if (stroke.dash !== undefined && stroke.dash.length > 0) {
    path.setAttribute('stroke-dasharray', stroke.dash.join(' '));
  }
}

function buildPlaceholder(element: SceneElement, doc: Document): HTMLElement {
  const el = doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  el.dataset['cgPlaceholderFor'] = element.type;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);
  return el;
}

/**
 * D-137 — the SMPTE-style colour bars, 75 % amplitude, in authored bar order:
 * grey · yellow · cyan · green · magenta · red · blue.
 *
 * PROCEDURAL, never a bundled bitmap — the element's whole point is that it ships
 * nothing to air, so shipping an image asset for its authoring look would be the
 * wrong shape (and would need collecting, packaging and resolving for a thing that
 * paints only in the Designer).
 */
const SMPTE_BARS = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];

/**
 * The bars as one `linear-gradient`, written with EXPLICIT PAIRED STOPS
 * (`c 0%, c 14.2857%, …`) rather than the shorter double-position syntax
 * (`c 0% 14.2857%`).
 *
 * B-066 class, and it is not hypothetical: CasparCG's CEF is baseline Chromium 71,
 * and double-position colour stops shipped in Chromium 72. The short form would
 * render correctly in every browser we develop in and produce a broken gradient on
 * air. The long form is universally supported and costs six extra stops.
 */
function smpteBarsGradient(): string {
  const stops: string[] = [];
  SMPTE_BARS.forEach((color, i) => {
    const from = ((i / SMPTE_BARS.length) * 100).toFixed(4);
    const to = (((i + 1) / SMPTE_BARS.length) * 100).toFixed(4);
    stops.push(`${color} ${from}%`, `${color} ${to}%`);
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * R-049 — the bars are the RUNTIME's too, and this is why they leave the module
 * as a STATEMENT rather than as an `export` keyword on each declaration.
 *
 * PVW draws these same bars as a placeholder over each live plate, so there must
 * be exactly ONE bar table and ONE gradient writer — a hand-written second copy
 * would very likely lose the paired-stop rule above, and lose it only on the
 * build nobody develops against.
 *
 * Two things here are deliberate, and both were MEASURED against the generated
 * `cg-runtime-bundles.ts` rather than assumed:
 *
 *  1. **A statement, not `export const SMPTE_BARS = [...]`.** The prefix pushes
 *     that declaration past `printWidth`, prettier then wraps the array over
 *     seven lines, and esbuild reprints the wrap — **+64 bytes in every exported
 *     `.vcg`, for a reformat**. Left as one line, the emitted bundle is
 *     byte-identical.
 *  2. **NOT re-exported from `src/index.ts`.** That file is esbuild's bundle
 *     ENTRY, so its export list IS the on-air artifact's export table: adding
 *     these two names there costs **+121 bytes** in every `.vcg` for names no
 *     page ever calls. Consumers reach them through the `./scene-builder`
 *     subpath instead (see `package.json`), which the entry never sees.
 *
 * Neither figure paints a pixel. They are recorded because the fact behind them —
 * the entry index IS the on-air export table — is worth knowing before the next
 * symbol is added to it.
 */
export { SMPTE_BARS, smpteBarsGradient };

/**
 * D-137 — render a **Live Source**: the region CasparCG composites a live input
 * behind (C-015).
 *
 * The two modes are not two styles of the same picture — they are opposite
 * contracts, which is why they are branched here on an explicit
 * {@link RenderMode} rather than differentiated by a stylesheet the host injects:
 *
 * - `'output'` (both exporters) — **ZERO PAINTED PIXELS INSIDE THE HOLE.** No
 *   background and no children. The element still emits its box (positioned,
 *   sized, id'd) so layout, bindings and the element map are unchanged, and so the
 *   hole's rect is inspectable in the artifact. Nothing may paint INSIDE the rect,
 *   because a live guest goes BEHIND it: a pixel painted there is a lid over the
 *   guest's face.
 *   ⭐ **AMENDED (owner, 2026-08-10; `live-source-multibox` design.md §9a.1) — an
 *   authored `stroke` DOES paint, in BOTH modes, and that is not an exception to
 *   the rule above.** It is rendered as a CSS `outline`, which is painted outside the
 *   box and takes no layout, so the hole stays empty and the plate's box stays
 *   exactly `transform` — the rect `collectLiveSources` declares and the overlap
 *   preflight compares — under any box model and any scale. See the note in
 *   {@link buildLiveSource} for why `border` was measured and rejected.
 *
 * - `'author'` (canvas + Preview modal) — procedural SMPTE bars with the source id
 *   overlaid, or the poster image when one is set. Never an unmarked black box:
 *   with several holes on one frame, an unlabelled black rectangle tells the author
 *   nothing about WHICH source lands where.
 *
 * The label is `data-cg-live-source-label`, deliberately NOT part of the element's
 * own text content, so nothing can bind to it or mistake it for authored copy.
 */
function buildLiveSource(element: VideoPlaceholderElement, ctx: BuildCtx): HTMLElement {
  const el = ctx.doc.createElement('div');
  el.dataset['cgElementId'] = element.id;
  el.dataset['cgPlaceholderFor'] = element.type;
  // The declaration rides the DOM in BOTH modes: it is data, not paint, so it
  // costs no pixels on air and lets an export be inspected for what it promises.
  el.dataset['cgLiveSource'] = element.routeKey;
  if (element.keySourceId !== undefined) el.dataset['cgLiveSourceKey'] = element.keySourceId;
  applyBaseStyles(el, element.transform, element.opacity, element.visible, element.filter);

  // ⭐ §9a.1 — THE FRAME, applied BEFORE the 'output' return on purpose: the stroke
  // is the one thing a Live Source paints on air.
  //
  // 🔴 **`outline`, NOT `border`, and the difference is the whole requirement.** The
  // hole is a CONTRACT: `collectLiveSources` declares `transform` — position AND size
  // — and CasparCG composites the live picture into exactly that rect, so any frame
  // that moves or resizes the content box desyncs the picture from the frame drawn
  // around it. An outline is painted outside the border edge and occupies NO layout
  // at all, so the plate's box stays `transform` under every box model and every
  // scale. `border` cannot do that, and §9a.1's reasoning that it could does not
  // survive contact with either surface — MEASURED, both of them:
  //
  //   1. §9a.1 argued the CSS default `content-box` paints a border outside the
  //      declared size because this package sets no `box-sizing` reset. True of the
  //      package, false of every page it renders on: the shipped baseline stylesheet
  //      opens with `*{box-sizing:border-box}` (`@cg/single-file-export`'s `cgCss` —
  //      the same bytes in every `.vcg`, the single-file export and the Preview) and
  //      `@cg/ui`'s `theme.css` resets the canvas identically. Left implicit, the
  //      frame would be painted INSIDE the rect, cropping the live picture.
  //   2. Declaring `content-box` fixes the SIZE and breaks the POSITION: `left`/`top`
  //      place the BORDER edge, so the content box — the hole — slides right and down
  //      by the stroke width. Measured in Chromium at 8px stroke: the hole moved from
  //      (5828, 3662) to (5836, 3670) while the declaration still named the old rect.
  //      A negative-margin compensation is not a fix either: under `transform: scale`
  //      with `transform-origin: 0 0` the required offset is `-scale × width`, so the
  //      correction would have to track a value `collectLiveSources` composes
  //      separately — two spellings of one geometry, which is the shape this repo
  //      keeps paying for.
  //
  // The shorthand itself is still ONE implementation, shared with `applyBoxStyle`
  // through {@link strokeShorthand} — the property differs, the stroke grammar does
  // not. `cornerRadius` is deliberately not applied: it is not on this kind's schema,
  // rounding waits on the punch (1.5d), and ⚠ when it lands, note that Chromium
  // follows `border-radius` on an OUTLINE only from ~94 — well above the CEF 71
  // baseline — so rounding the hole and the frame TOGETHER will need its own answer.
  if (element.stroke !== undefined) {
    el.style.outline = strokeShorthand(element.stroke);
  }

  if (ctx.mode === 'output') return el;

  el.style.overflow = 'hidden';
  if (element.posterAssetId !== undefined) {
    // The poster REPLACES the bars (D-137). `src` is left unset exactly as
    // `buildImage` leaves it — the host resolves `data-cg-asset-id`, and the
    // runtime's `applyAssetUrls` walk finds this nested `<img>` too.
    const poster = ctx.doc.createElement('img');
    poster.dataset['cgAssetId'] = element.posterAssetId;
    poster.alt = '';
    poster.style.width = '100%';
    poster.style.height = '100%';
    poster.style.objectFit = 'cover';
    poster.style.display = 'block';
    el.appendChild(poster);
  } else {
    el.style.backgroundImage = smpteBarsGradient();
  }

  const label = ctx.doc.createElement('div');
  label.dataset['cgLiveSourceLabel'] = '';
  /*
    ⭐ `B-183` — an UNASSIGNED plate says so ON THE BARS.

    The label's job has always been to tell the author what this hole is pointed at, and the
    old `live-1` default was justified in `element-defaults.ts` precisely because it was
    "visible on the canvas … which is what tells the author there is something to set". Now
    that a new plate points at NOTHING, that sentence is only honoured by saying nothing is
    set — an empty label would leave the bars looking finished.

    ⚠ The plate paints NOTHING on air (the hole is transparent and the picture is composited
    behind it), so this text is an authoring-preview affordance and never reaches broadcast
    output. The export refuses an unassigned plate before it can.
  */
  label.textContent = element.routeKey ?? 'no source';
  label.style.position = 'absolute';
  label.style.left = '0';
  label.style.right = '0';
  label.style.bottom = '0';
  label.style.padding = '2px 6px';
  label.style.background = 'rgba(0, 0, 0, 0.72)';
  label.style.color = '#ffffff';
  label.style.font = '600 14px/1.4 system-ui, sans-serif';
  // The id is ASCII by schema (`LiveSourceIdSchema`), so it is pinned LTR: a Persian
  // scene must not flip `guest-1` to `1-guest` around the surrounding RTL context.
  label.style.direction = 'ltr';
  label.style.textAlign = 'center';
  label.style.whiteSpace = 'nowrap';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  el.appendChild(label);
  return el;
}
