// ../../packages/template-runtime/src/keyframe-eval.ts
function interpolateAtFrame(track, frame) {
  const kfs = track.keyframes;
  const first = kfs[0];
  const last = kfs[kfs.length - 1];
  if (first === void 0 || last === void 0) {
    throw new Error("Track.keyframes is empty");
  }
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
  let prev = first;
  let next = last;
  for (let i = 1; i < kfs.length; i++) {
    const k = kfs[i];
    const before = kfs[i - 1];
    if (k === void 0 || before === void 0) continue;
    if (k.frame > frame) {
      prev = before;
      next = k;
      break;
    }
  }
  if (prev.easing === "step") return prev.value;
  const span = next.frame - prev.frame;
  const t = span === 0 ? 1 : (frame - prev.frame) / span;
  const eased = applyEasing(prev.easing, t);
  return lerpValue(prev.value, next.value, eased);
}
function applyEasing(easing, t) {
  switch (easing) {
    case "linear":
      return t;
    case "step":
      return t < 1 ? 0 : 1;
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  }
}
function lerpValue(a, b, t) {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * t;
  if (typeof a === "string" && typeof b === "string") return lerpHexColor(a, b, t);
  return a;
}
function lerpHexColor(a, b, t) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  const hasAlpha = ca.a !== void 0 || cb.a !== void 0;
  if (!hasAlpha) return `#${hex2(r)}${hex2(g)}${hex2(bl)}`;
  const alpha = Math.round((ca.a ?? 255) + ((cb.a ?? 255) - (ca.a ?? 255)) * t);
  return `#${hex2(r)}${hex2(g)}${hex2(bl)}${hex2(alpha)}`;
}
function parseHex(hex) {
  const s = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if (s.length === 8) {
    return { r, g, b, a: parseInt(s.slice(6, 8), 16) };
  }
  return { r, g, b };
}
function hex2(n) {
  const v = Math.max(0, Math.min(255, n));
  return v.toString(16).padStart(2, "0").toUpperCase();
}
var COLOR_PROPS = /* @__PURE__ */ new Set(["fill.color", "text.color"]);
function isColorProperty(p) {
  return COLOR_PROPS.has(p);
}

// ../../packages/template-runtime/src/animation-applier.ts
var NUMERIC_PROPS = [
  "position.x",
  "position.y",
  "size.w",
  "size.h",
  "scale.x",
  "scale.y",
  "rotation",
  "opacity"
];
function applyAnimationAtFrame(entry, frame) {
  const tracks = entry.animation.tracks;
  const tx = entry.source.transform;
  const animated = readAnimatedValues(tracks, frame, tx);
  if (animated.posDirty) {
    entry.node.style.left = `${animated.posX}px`;
    entry.node.style.top = `${animated.posY}px`;
  }
  if (animated.sizeDirty) {
    entry.node.style.width = `${animated.sizeW}px`;
    entry.node.style.height = `${animated.sizeH}px`;
  }
  if (animated.transformDirty) {
    entry.node.style.transform = composeTransform(
      animated.scaleX,
      animated.scaleY,
      animated.rotation
    );
  }
  if (tracks.opacity !== void 0) {
    const v = interpolateAtFrame(tracks.opacity, frame);
    if (typeof v === "number") entry.node.style.opacity = String(v);
  }
  if (tracks["fill.color"] !== void 0 && entry.source.type === "shape") {
    const v = interpolateAtFrame(tracks["fill.color"], frame);
    if (typeof v === "string") entry.node.style.background = v;
  }
  if (tracks["text.color"] !== void 0 && entry.source.type === "text") {
    const v = interpolateAtFrame(tracks["text.color"], frame);
    if (typeof v === "string") entry.node.style.color = v;
  }
}
function readAnimatedValues(tracks, frame, tx) {
  const state = {
    posX: tx.position.x,
    posY: tx.position.y,
    posDirty: false,
    sizeW: tx.size.w,
    sizeH: tx.size.h,
    sizeDirty: false,
    scaleX: tx.scale.x,
    scaleY: tx.scale.y,
    rotation: tx.rotation,
    transformDirty: false
  };
  for (const prop of NUMERIC_PROPS) {
    const track = tracks[prop];
    if (track === void 0) continue;
    const v = interpolateAtFrame(track, frame);
    if (typeof v !== "number") continue;
    switch (prop) {
      case "position.x":
        state.posX = v;
        state.posDirty = true;
        break;
      case "position.y":
        state.posY = v;
        state.posDirty = true;
        break;
      case "size.w":
        state.sizeW = v;
        state.sizeDirty = true;
        break;
      case "size.h":
        state.sizeH = v;
        state.sizeDirty = true;
        break;
      case "scale.x":
        state.scaleX = v;
        state.transformDirty = true;
        break;
      case "scale.y":
        state.scaleY = v;
        state.transformDirty = true;
        break;
      case "rotation":
        state.rotation = v;
        state.transformDirty = true;
        break;
      case "opacity":
        break;
    }
  }
  return state;
}
function composeTransform(scaleX, scaleY, rotation) {
  const parts = [];
  if (scaleX !== 1 || scaleY !== 1) parts.push(`scale(${scaleX}, ${scaleY})`);
  if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
  return parts.join(" ");
}
function collectAnimatedElements(layers, elementMap) {
  const out = [];
  for (const layer of layers) walk(layer, elementMap, out);
  return out;
}
function walk(children, elementMap, out) {
  for (const el of children) {
    if (el.animation !== void 0 && Object.keys(el.animation.tracks).length > 0) {
      const node = elementMap.get(el.id);
      if (node !== void 0) {
        out.push({ id: el.id, node, source: el, animation: el.animation });
      }
    }
    if (el.type === "container") walk(el.children, elementMap, out);
  }
}

// ../../packages/text-shaping/dist/digits.js
var LATIN_ZERO = 48;
var PERSIAN_ZERO = 1776;
var ARABIC_INDIC_ZERO = 1632;
function persianDigits(s) {
  return s.replace(/[0-9]/g, (d) => String.fromCodePoint(PERSIAN_ZERO + (d.charCodeAt(0) - LATIN_ZERO)));
}
function latinDigits(s) {
  return s.replace(/[۰-۹]/g, (d) => String.fromCodePoint(LATIN_ZERO + (d.charCodeAt(0) - PERSIAN_ZERO))).replace(/[٠-٩]/g, (d) => String.fromCodePoint(LATIN_ZERO + (d.charCodeAt(0) - ARABIC_INDIC_ZERO)));
}

// ../../packages/text-shaping/dist/date.js
function gregorianToJalali(gy, gm, gd) {
  const gDaysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy;
  let gy2;
  if (gy <= 1600) {
    jy = 0;
    gy2 = gy - 621;
  } else {
    jy = 979;
    gy2 = gy - 1600;
  }
  const gyAdj = gm > 2 ? gy2 + 1 : gy2;
  let days = 365 * gy2 + Math.floor((gyAdj + 3) / 4) - Math.floor((gyAdj + 99) / 100) + Math.floor((gyAdj + 399) / 400) - 80 + gd + (gDaysInMonth[gm - 1] ?? 0);
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}
function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}
function asDate(d) {
  if (d instanceof Date)
    return d;
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date input: ${String(d)}`);
  }
  return parsed;
}
function dateFa(d) {
  const date = asDate(d);
  const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return persianDigits(`${jy}/${pad2(jm)}/${pad2(jd)}`);
}
function dateEn(d) {
  const date = asDate(d);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// ../../packages/text-shaping/dist/truncate.js
function truncate(s, max, ellipsis = "\u2026") {
  if (max < 0)
    return "";
  if (s.length <= max)
    return s;
  if (max <= ellipsis.length)
    return s.slice(0, max);
  return s.slice(0, max - ellipsis.length) + ellipsis;
}

// ../../packages/template-runtime/src/transforms.ts
function applyTransform(value, transform) {
  if (!transform || transform === "identity") return value;
  switch (transform) {
    case "uppercase":
      return value.toUpperCase();
    case "lowercase":
      return value.toLowerCase();
    case "truncate":
      return truncate(value, 100);
    case "persian-digits":
      return persianDigits(value);
    case "latin-digits":
      return latinDigits(value);
    case "date-fa":
      return dateFa(value);
    case "date-en":
      return dateEn(value);
  }
}
function stringifyValue(value) {
  if (value === null || value === void 0) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && "assetId" in value && typeof value.assetId === "string") {
    return value.assetId;
  }
  return String(value);
}

// ../../packages/template-runtime/src/bindings.ts
function applyFieldValues(scene, values, elementMap, textOriginals, container) {
  const defaults = /* @__PURE__ */ new Map();
  for (const field of scene.fields) {
    defaults.set(field.id, "default" in field ? field.default : void 0);
  }
  for (const binding of scene.bindings) {
    const raw = binding.fieldId in values ? values[binding.fieldId] : defaults.get(binding.fieldId);
    if (raw === void 0) continue;
    applyOne(binding, raw, elementMap, textOriginals, container);
  }
}
function applyOne(binding, raw, elementMap, textOriginals, container) {
  const target = binding.target;
  switch (target.kind) {
    case "text": {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      const stringValue = applyTransform(stringifyValue(raw), binding.transform);
      const original = textOriginals.get(target.elementId);
      if (target.placeholder && original !== void 0) {
        el.textContent = original.replaceAll(target.placeholder, stringValue);
      } else {
        el.textContent = stringValue;
      }
      return;
    }
    case "image": {
      const el = elementMap.get(target.elementId);
      if (!(el instanceof HTMLImageElement)) return;
      const assetId = stringifyValue(raw);
      el.dataset["cgAssetId"] = assetId;
      el.src = assetId;
      return;
    }
    case "color": {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      const stringValue = applyTransform(stringifyValue(raw), binding.transform);
      switch (target.property) {
        case "fill":
          el.style.background = stringValue;
          return;
        case "stroke":
          el.style.borderColor = stringValue;
          return;
        case "text":
          el.style.color = stringValue;
          return;
      }
      return;
    }
    case "visible": {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      const shouldShow = Boolean(raw);
      el.style.display = shouldShow ? "" : "none";
      return;
    }
    case "transform": {
      const el = elementMap.get(target.elementId);
      if (!el) return;
      const num = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(num)) return;
      switch (target.property) {
        case "opacity":
          el.style.opacity = String(num);
          return;
        case "x":
          el.style.left = `${num}px`;
          return;
        case "y":
          el.style.top = `${num}px`;
          return;
        case "scale":
        case "rotation":
          el.style.transform = target.property === "scale" ? `scale(${num})` : `rotate(${num}deg)`;
          return;
      }
      return;
    }
    case "scene-background": {
      container.style.background = stringifyValue(raw);
      return;
    }
    case "lottie-override": {
      return;
    }
  }
}

// ../../packages/template-runtime/src/css.ts
var BASELINE_CSS = `
.cg-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.cg-element {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}
.cg-pending .cg-stage {
  visibility: hidden;
}
.cg-removed .cg-stage {
  display: none;
}
`;
function ensureBaselineCss(doc = document) {
  if (doc.getElementById("cg-baseline")) return;
  const style = doc.createElement("style");
  style.id = "cg-baseline";
  style.textContent = BASELINE_CSS;
  doc.head.appendChild(style);
}

// ../../packages/template-runtime/src/event-bus.ts
var EventBus = class {
  listeners = /* @__PURE__ */ new Map();
  on(event, listener) {
    let set = this.listeners.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }
  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch {
      }
    }
  }
  clear() {
    this.listeners.clear();
  }
};

// ../../packages/template-runtime/src/frame-driver.ts
var FrameDriver = class {
  opts;
  handle = null;
  startedAt = 0;
  running = false;
  constructor(opts) {
    this.opts = {
      ...opts,
      raf: opts.raf ?? ((cb) => requestAnimationFrame(cb)),
      cancel: opts.cancel ?? ((h) => cancelAnimationFrame(h)),
      now: opts.now ?? (() => performance.now())
    };
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.startedAt = this.opts.now();
    this.opts.onFrame(this.opts.range.in);
    this.schedule();
  }
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.handle !== null) {
      this.opts.cancel(this.handle);
      this.handle = null;
    }
  }
  schedule() {
    this.handle = this.opts.raf(() => {
      if (!this.running) return;
      this.tick();
      this.schedule();
    });
  }
  tick() {
    const elapsedMs = this.opts.now() - this.startedAt;
    const totalFrames = elapsedMs / 1e3 * this.opts.frameRate;
    const span = this.opts.range.out - this.opts.range.in;
    const frame = span <= 0 ? this.opts.range.in : this.opts.range.in + Math.floor(totalFrames) % span;
    this.opts.onFrame(frame);
  }
};

// ../../packages/template-runtime/src/lifecycle.ts
var TRANSITIONS = {
  pending: /* @__PURE__ */ new Set(["playing", "removed"]),
  playing: /* @__PURE__ */ new Set(["on-air", "exiting", "removed"]),
  "on-air": /* @__PURE__ */ new Set(["exiting", "removed", "playing"]),
  exiting: /* @__PURE__ */ new Set(["stopped", "removed"]),
  stopped: /* @__PURE__ */ new Set(["playing", "removed"]),
  removed: /* @__PURE__ */ new Set()
};
function canTransition(from, to) {
  return TRANSITIONS[from].has(to);
}
var LifecycleStateMachine = class {
  current = "pending";
  get state() {
    return this.current;
  }
  transition(to) {
    if (!canTransition(this.current, to)) return false;
    this.current = to;
    return true;
  }
  /**
   * Force a transition even when illegal. Reserved for `remove()` which
   * must always succeed regardless of current state.
   */
  forceTransition(to) {
    this.current = to;
  }
};

// ../../packages/template-runtime/src/scene-builder.ts
function buildScene(scene, doc = document) {
  const container = doc.createElement("div");
  container.className = "cg-stage";
  container.style.width = `${scene.resolution.width}px`;
  container.style.height = `${scene.resolution.height}px`;
  if (scene.background !== "transparent") {
    container.style.background = scene.background;
  }
  const elementMap = /* @__PURE__ */ new Map();
  const textOriginals = /* @__PURE__ */ new Map();
  for (const layer of scene.layers) {
    const layerNode = buildLayer(layer, doc, elementMap, textOriginals);
    container.appendChild(layerNode);
  }
  return { container, elementMap, textOriginals };
}
function buildLayer(layer, doc, elementMap, textOriginals) {
  const node = doc.createElement("div");
  node.className = "cg-layer";
  node.dataset["cgLayerId"] = layer.id;
  if (!layer.visible) node.style.display = "none";
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
function buildElement(element, doc, textOriginals) {
  switch (element.type) {
    case "text":
      return buildText(element, doc, textOriginals);
    case "image":
      return buildImage(element, doc);
    case "shape":
      return buildShape(element, doc);
    case "container":
    case "lottie":
    case "video-placeholder":
      return buildPlaceholder(element, doc);
  }
}
function applyBaseStyles(el, transform, opacity, visible) {
  el.classList.add("cg-element");
  el.style.left = `${transform.position.x}px`;
  el.style.top = `${transform.position.y}px`;
  el.style.width = `${transform.size.w}px`;
  el.style.height = `${transform.size.h}px`;
  el.style.opacity = String(opacity);
  el.style.transform = composeTransform2(transform);
  el.style.transformOrigin = `${transform.anchor.x * 100}% ${transform.anchor.y * 100}%`;
  if (!visible) el.style.display = "none";
}
function composeTransform2(t) {
  const parts = [];
  if (t.scale.x !== 1 || t.scale.y !== 1) parts.push(`scale(${t.scale.x}, ${t.scale.y})`);
  if (t.rotation !== 0) parts.push(`rotate(${t.rotation}deg)`);
  if (t.skew && (t.skew.x !== 0 || t.skew.y !== 0)) {
    parts.push(`skew(${t.skew.x}deg, ${t.skew.y}deg)`);
  }
  return parts.join(" ");
}
function buildText(element, doc, textOriginals) {
  const el = doc.createElement("div");
  el.dataset["cgElementId"] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible);
  el.style.fontFamily = element.font.family;
  el.style.fontWeight = String(element.font.weight);
  el.style.fontStyle = element.font.style;
  el.style.fontSize = `${element.font.size}px`;
  el.style.lineHeight = String(element.font.lineHeight);
  el.style.letterSpacing = `${element.font.letterSpacing}em`;
  el.style.color = element.color;
  el.style.textAlign = element.align;
  el.style.direction = element.direction === "auto" ? "" : element.direction;
  if (element.textShadow) {
    const s = element.textShadow;
    el.style.textShadow = `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.color}`;
  }
  el.textContent = element.text;
  textOriginals.set(element.id, element.text);
  return el;
}
function buildImage(element, doc) {
  const el = doc.createElement("img");
  el.dataset["cgElementId"] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible);
  el.alt = element.name;
  el.style.objectFit = element.fit;
  el.dataset["cgAssetId"] = element.assetId;
  if (element.tint) {
    el.style.filter = `drop-shadow(0 0 0 ${element.tint})`;
  }
  return el;
}
function buildShape(element, doc) {
  const el = doc.createElement("div");
  el.dataset["cgElementId"] = element.id;
  applyBaseStyles(el, element.transform, element.opacity, element.visible);
  if (element.fill?.kind === "solid") {
    el.style.background = element.fill.color;
  }
  if (element.stroke) {
    el.style.border = `${element.stroke.width}px solid ${element.stroke.color}`;
  }
  if (element.shape === "ellipse") {
    el.style.borderRadius = "50%";
  } else if (element.shape === "rounded-rect" && element.cornerRadius !== void 0) {
    if (typeof element.cornerRadius === "number") {
      el.style.borderRadius = `${element.cornerRadius}px`;
    } else {
      const [tl, tr, br, bl] = element.cornerRadius;
      el.style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
    }
  }
  return el;
}
function buildPlaceholder(element, doc) {
  const el = doc.createElement("div");
  el.dataset["cgElementId"] = element.id;
  el.dataset["cgPlaceholderFor"] = element.type;
  applyBaseStyles(el, element.transform, element.opacity, element.visible);
  return el;
}

// ../../packages/template-runtime/src/runtime.ts
function createRuntime(scene, options = {}) {
  const doc = options.root?.ownerDocument ?? document;
  const root = options.root ?? doc.body;
  ensureBaselineCss(doc);
  doc.body.classList.add("cg-pending");
  const built = buildScene(scene, doc);
  root.appendChild(built.container);
  applyFieldValues(scene, {}, built.elementMap, built.textOriginals, built.container);
  const animated = collectAnimatedElements(
    scene.layers.map((l) => l.children),
    built.elementMap
  );
  const machine = new LifecycleStateMachine();
  const bus = new EventBus();
  let currentValues = {};
  const ready = options.skipFontLoad ? Promise.resolve() : waitForFonts(doc);
  void ready.then(() => bus.emit("ready"));
  let driver = null;
  const startDriver = () => {
    if (animated.length === 0) return;
    driver = new FrameDriver({
      frameRate: scene.frameRate,
      range: scene.frameRange,
      onFrame: (frame) => {
        for (const entry of animated) applyAnimationAtFrame(entry, frame);
      }
    });
    driver.start();
  };
  const stopDriver = () => {
    if (driver !== null) {
      driver.stop();
      driver = null;
    }
  };
  const runtime = {
    ready,
    async play(data, _opts) {
      if (machine.state === "removed") {
        throw new Error("Runtime removed; play() unavailable");
      }
      await ready;
      currentValues = { ...data };
      applyFieldValues(
        scene,
        currentValues,
        built.elementMap,
        built.textOriginals,
        built.container
      );
      machine.transition("playing");
      bus.emit("play.start");
      doc.body.classList.remove("cg-pending");
      machine.transition("on-air");
      startDriver();
      bus.emit("play.end");
    },
    async update(data, opts = {}) {
      if (machine.state === "removed") {
        throw new Error("Runtime removed; update() unavailable");
      }
      const mode = opts.mode ?? "merge";
      if (mode === "replace") {
        currentValues = { ...data };
      } else {
        currentValues = { ...currentValues, ...data };
      }
      applyFieldValues(
        scene,
        currentValues,
        built.elementMap,
        built.textOriginals,
        built.container
      );
      bus.emit("update");
    },
    async stop(_opts) {
      if (machine.state === "removed") return;
      if (machine.state !== "on-air" && machine.state !== "playing") return;
      stopDriver();
      machine.transition("exiting");
      bus.emit("stop.start");
      doc.body.classList.add("cg-pending");
      machine.transition("stopped");
      bus.emit("stop.end");
    },
    remove() {
      if (machine.state === "removed") return;
      stopDriver();
      machine.forceTransition("removed");
      bus.clear();
      built.container.remove();
      doc.body.classList.remove("cg-pending");
      doc.body.classList.add("cg-removed");
    },
    tick(frame) {
      for (const entry of animated) applyAnimationAtFrame(entry, frame);
    },
    on(event, listener) {
      return bus.on(event, listener);
    }
  };
  return runtime;
}
function waitForFonts(doc) {
  const fonts = doc.fonts;
  if (!fonts?.ready) return Promise.resolve();
  return fonts.ready.then(() => void 0);
}

// ../../packages/template-runtime/src/adapters/caspar-globals.ts
function installCasparGlobals(runtime, win = window) {
  const previousPlay = win.play;
  const previousUpdate = win.update;
  const previousStop = win.stop;
  const previousNext = win.next;
  const previousRemove = win.remove;
  const previousCg = win.cg;
  win.play = (payload) => {
    void runtime.play(parsePayload(payload));
  };
  win.update = (payload) => {
    void runtime.update(parsePayload(payload));
  };
  win.stop = () => {
    void runtime.stop();
  };
  win.next = () => {
    void runtime.next?.();
  };
  win.remove = () => {
    runtime.remove();
  };
  win.cg = runtime;
  return () => {
    if (previousPlay !== void 0) win.play = previousPlay;
    else delete win.play;
    if (previousUpdate !== void 0) win.update = previousUpdate;
    else delete win.update;
    win.stop = previousStop;
    if (previousNext !== void 0) win.next = previousNext;
    else delete win.next;
    if (previousRemove !== void 0) win.remove = previousRemove;
    else delete win.remove;
    if (previousCg !== void 0) win.cg = previousCg;
    else delete win.cg;
  };
}
function parsePayload(s) {
  if (!s) return {};
  const trimmed = s.trim();
  if (trimmed.startsWith("<")) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
  }
  return {};
}
export {
  BASELINE_CSS,
  EventBus,
  FrameDriver,
  LifecycleStateMachine,
  applyAnimationAtFrame,
  applyEasing,
  applyFieldValues,
  applyTransform,
  buildScene,
  canTransition,
  collectAnimatedElements,
  createRuntime,
  ensureBaselineCss,
  installCasparGlobals,
  interpolateAtFrame,
  isColorProperty,
  lerpHexColor,
  stringifyValue
};
