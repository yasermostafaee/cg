# Phase 3 — Domain Modeling

TypeScript/Zod **contracts** — the shape of the domain. No runtime, no parsers, no implementations. Everything below is meant to be reviewable, criticizable, and refactorable.

---

## 1. Primitives

```ts
type Id = string; // ULID; opaque
type HexColor = `#${string}`; // #RRGGBB or #RRGGBBAA
type FrameRate = 25 | 29.97 | 50 | 59.94 | 60;
type DurationFrames = number; // frame-locked, NOT milliseconds
type ISODate = string;

type Vec2 = { x: number; y: number };
type Size = { w: number; h: number };

type Transform = {
  position: Vec2; // top-left in scene coords (px)
  size: Size; // intrinsic
  scale: Vec2; // independent x/y
  rotation: number; // degrees, around anchor
  anchor: Vec2; // 0..1 in local space (0.5,0.5 = center)
  skew?: Vec2;
};

type Shadow = { offsetX: number; offsetY: number; blur: number; color: HexColor };
type Fill =
  | { kind: 'solid'; color: HexColor }
  | { kind: 'linear'; stops: { at: number; color: HexColor }[]; angle: number }
  | {
      kind: 'radial';
      stops: { at: number; color: HexColor }[];
      center: Vec2;
      radius: number;
    };
type Stroke = { width: number; color: HexColor; dash?: number[] };
```

**Why frames not ms:** outputs are frame-locked (50i = 20ms/frame, 60p = 16.67ms/frame). Mid-broadcast a 12-frame slide is exact; a 250ms slide drifts.

---

## 2. Scene Graph

```ts
type TemplateType =
  | 'logo-bug'
  | 'lower-third'
  | 'ticker'
  | 'breaking-news'
  | 'fullscreen'
  | 'custom';

type Scene = {
  schemaVersion: 1;
  id: Id;
  name: string;
  templateType: TemplateType;
  resolution: { width: number; height: number }; // 1920×1080, 3840×2160, custom
  frameRate: FrameRate;
  safeAreas: { title: number; action: number }; // % insets
  background: 'transparent' | HexColor;
  layers: Layer[];
  fields: DynamicField[]; // declarations
  bindings: FieldBinding[]; // field → element wiring
  fonts: FontReference[]; // declared dependencies
  metadata: {
    author?: string;
    createdAt: ISODate;
    updatedAt: ISODate;
    description?: string;
    tags?: string[];
  };
};

type Layer = {
  id: Id;
  name: string;
  visible: boolean;
  locked: boolean;
  children: Element[];
  blendMode: 'normal'; // reserve enum; v1 = normal only
};
```

**Layer vs CasparCG layer:** `Layer` here is a _logical_ editor grouping. The Runtime's `LayerManager` allocates CasparCG `channel-layer` slots dynamically and independently.

---

## 3. Elements

```ts
type ElementBase = {
  id: Id;
  name: string;
  transform: Transform;
  opacity: number; // 0..1
  visible: boolean;
  locked: boolean;
  zIndex: number; // local within parent
  animation?: {
    entry?: EntryPreset;
    loop?: LoopPreset;
    exit?: ExitPreset;
  };
  // direct bindings are also possible; see FieldBinding for the canonical wiring
};

type TextElement = ElementBase & {
  type: 'text';
  text: string; // may contain "Hello {{name}}"
  font: {
    family: string; // resolved against FontService
    weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
    style: 'normal' | 'italic';
    size: number; // px
    lineHeight: number; // ratio of size
    letterSpacing: number; // em
  };
  color: HexColor;
  align: 'start' | 'end' | 'center' | 'justify';
  direction: 'auto' | 'ltr' | 'rtl'; // 'auto' uses Unicode bidi
  textShadow?: Shadow;
  maxLines?: number;
  fitMode: 'fixed' | 'shrink-to-fit' | 'autosize';
  overflow: 'clip' | 'ellipsis' | 'shrink';
};

type ImageElement = ElementBase & {
  type: 'image';
  assetId: Id; // → manifest.assetIndex
  fit: 'contain' | 'cover' | 'fill' | 'none';
  preserveAspect: boolean;
  tint?: HexColor;
};

type ShapeElement = ElementBase & {
  type: 'shape';
  shape: 'rect' | 'rounded-rect' | 'ellipse' | 'polygon' | 'path';
  fill?: Fill;
  stroke?: Stroke;
  cornerRadius?: number | [number, number, number, number];
  pathData?: string; // SVG `d` (when shape === 'path')
  polygon?: Vec2[]; // when shape === 'polygon'
};

type LottieElement = ElementBase & {
  type: 'lottie';
  assetId: Id; // JSON in assets/lottie/*.json
  speed: number; // 1.0 default
  loopMode: 'none' | 'loop' | 'bounce';
  segment?: [DurationFrames, DurationFrames]; // in/out markers
  fieldOverrides?: Record<string, unknown>; // text-layer text, colorOverrides, etc.
};

type ContainerElement = ElementBase & {
  type: 'container';
  children: Element[];
  clip: boolean;
};

type VideoPlaceholderElement = ElementBase & {
  type: 'video-placeholder';
  // Runtime only — CasparCG MIXER/PLAY replaces this region at playout
  posterAssetId?: Id;
  expectedAspect: number;
  routeKey: string; // operator-bound at runtime (NDI source, etc.)
};

type Element =
  | TextElement
  | ImageElement
  | ShapeElement
  | LottieElement
  | ContainerElement
  | VideoPlaceholderElement;
```

---

## 4. Dynamic Fields & Bindings

```ts
type DynamicFieldBase = {
  id: string; // operator key: "headline"
  label: string;
  group?: string; // grouping in operator UI
  required: boolean;
  description?: string;
};

type DynamicField =
  | (DynamicFieldBase & {
      type: 'text';
      default: string;
      maxLength?: number;
      direction?: 'auto' | 'ltr' | 'rtl';
    })
  | (DynamicFieldBase & { type: 'multiline'; default: string; maxLines?: number })
  | (DynamicFieldBase & {
      type: 'image';
      defaultAssetId?: Id;
      accept: ('png' | 'jpg' | 'webp' | 'svg')[];
    })
  | (DynamicFieldBase & { type: 'color'; default: HexColor })
  | (DynamicFieldBase & { type: 'boolean'; default: boolean })
  | (DynamicFieldBase & {
      type: 'number';
      default: number;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    })
  | (DynamicFieldBase & {
      type: 'select';
      default: string;
      options: { value: string; label: string }[];
    });

type FieldBinding = {
  fieldId: string;
  target:
    | { kind: 'text'; elementId: Id; placeholder?: string } // default: replace full text
    | { kind: 'image'; elementId: Id }
    | { kind: 'color'; elementId: Id; property: 'fill' | 'stroke' | 'text' }
    | { kind: 'visible'; elementId: Id }
    | {
        kind: 'transform';
        elementId: Id;
        property: 'opacity' | 'x' | 'y' | 'scale' | 'rotation';
      }
    | { kind: 'scene-background' }
    | { kind: 'lottie-override'; elementId: Id; layer: string; prop: string };
  transform?:
    | 'identity'
    | 'uppercase'
    | 'lowercase'
    | 'truncate'
    | 'persian-digits'
    | 'latin-digits'
    | 'date-fa'
    | 'date-en';
};

type FieldValues = Record<string, string | number | boolean | { assetId: Id } | HexColor>;
```

**Five invariants:**

1. Field id namespace is per-template (no global registry).
2. Bindings are **one-way**: field → element. The renderer never writes back.
3. Default values live in the field declaration, not the element.
4. The same field can drive multiple targets (e.g., `headline` into both a `<text>` and a Lottie text override).
5. `transform` formatters are pure; they run on every render.

---

## 5. Animation Presets

```ts
type Easing =
  | 'linear'
  | 'power1.in'
  | 'power1.out'
  | 'power1.inOut'
  | 'power2.in'
  | 'power2.out'
  | 'power2.inOut'
  | 'power3.in'
  | 'power3.out'
  | 'power3.inOut'
  | 'back.in'
  | 'back.out'
  | 'back.inOut'
  | 'expo.in'
  | 'expo.out'
  | 'expo.inOut'
  | 'sine.in'
  | 'sine.out'
  | 'sine.inOut';

type EntryPreset =
  | { kind: 'none' }
  | { kind: 'fade'; duration: DurationFrames; delay: DurationFrames; easing: Easing }
  | {
      kind: 'slide';
      duration: DurationFrames;
      delay: DurationFrames;
      easing: Easing;
      direction: 'left' | 'right' | 'up' | 'down';
      distance: number;
    }
  | {
      kind: 'scale';
      duration: DurationFrames;
      delay: DurationFrames;
      easing: Easing;
      from: number;
    }
  | {
      kind: 'blur';
      duration: DurationFrames;
      delay: DurationFrames;
      easing: Easing;
      from: number /* px */;
    };

type ExitPreset =
  | { kind: 'none' }
  | { kind: 'fade-out'; duration: DurationFrames; delay: DurationFrames; easing: Easing }
  | {
      kind: 'slide-out';
      duration: DurationFrames;
      delay: DurationFrames;
      easing: Easing;
      direction: 'left' | 'right' | 'up' | 'down';
      distance: number;
    }
  | {
      kind: 'scale-down';
      duration: DurationFrames;
      delay: DurationFrames;
      easing: Easing;
      to: number;
    }
  | {
      kind: 'blur-out';
      duration: DurationFrames;
      delay: DurationFrames;
      easing: Easing;
      to: number;
    };

type LoopPreset =
  | { kind: 'none' }
  | {
      kind: 'ticker';
      speed: number /* px/s @ frameRate */;
      direction: 'ltr' | 'rtl';
      pauseOnHover?: boolean;
    }
  | { kind: 'pulse'; duration: DurationFrames; minOpacity: number; maxOpacity: number }
  | { kind: 'breathing'; duration: DurationFrames; scaleMin: number; scaleMax: number };
```

Ticker speed is declared `px/s` but the _executor_ converts to `px/frame` at the project's frame rate. This is the only place a user thinks in seconds.

---

## 6. `.vcg` Manifest

```ts
type Manifest = {
  schemaVersion: 1;
  format: 'vcg';
  formatVersion: '1.0';

  id: Id;
  name: string;
  templateType: TemplateType;
  resolution: { width: number; height: number };
  frameRate: FrameRate;

  fields: Array<{
    // index — full defs live in template.json
    id: string;
    type: DynamicField['type'];
    required: boolean;
  }>;

  fontDeps: FontReference[];
  assetIndex: AssetEntry[];

  integrity: {
    files: Array<{ path: string; sha256: string; bytes: number }>;
    root: string; // sha256 of canonical concatenation
  };

  signing?: {
    algorithm: 'ed25519';
    publicKeyId: string;
    signature: string; // base64; covers integrity.root
  };

  authoring: {
    designerVersion: string;
    createdAt: ISODate;
    exportedAt: ISODate;
    author?: string;
  };

  compatibility: {
    minRuntimeVersion: string;
    minCasparCGVersion: string; // e.g. "2.3.0"
    cefMin?: string; // optional CEF floor
  };
};

type AssetEntry = {
  id: Id;
  path: string; // relative inside zip; e.g. "assets/img/logo.png"
  kind: 'image' | 'lottie' | 'font' | 'video' | 'audio';
  bytes: number;
  sha256: string;
  mime: string;
};

type FontReference = {
  family: string;
  weights: number[];
  styles: ('normal' | 'italic')[];
  source: 'bundled' | 'system';
  bundledPath?: string; // when source === 'bundled'
  licenseRef?: string; // SPDX or path to LICENSE inside zip
};
```

**Zip layout:**

```
template-name.vcg                  (zip, no compression on already-compressed assets)
├── manifest.json
├── template.json                  (Scene)
├── index.html                     (broadcast HTML, ships @cg/template-runtime inline)
├── assets/
│   ├── img/*.{png,jpg,webp,svg}
│   ├── lottie/*.json
│   └── video/*.{mp4,mov}          (CasparCG-decodable codecs only)
├── fonts/
│   └── *.{woff2,ttf,otf}
└── thumbnails/
    ├── 320.png
    └── 1080.png
```

---

## 7. State-Machine Event Types

```ts
// ── Operator intents (in) ──────────────────────────────────────────────
type Intent =
  | { kind: 'load'; itemId: Id; templateId: Id; fields: FieldValues }
  | { kind: 'take'; itemId: Id; mode?: 'direct' | 'pvw-pgm' }
  | {
      kind: 'update';
      itemId: Id;
      fields: Partial<FieldValues>;
      mergeMode: 'merge' | 'replace';
    }
  | { kind: 'out'; itemId: Id; immediate?: boolean }
  | { kind: 'remove'; itemId: Id }
  | { kind: 'failover'; reason: 'manual' | 'auto' }
  | { kind: 'reconnect' };

// ── AMCP responses (in) ────────────────────────────────────────────────
type AmcpAck =
  | { kind: 'amcp.ok'; seq: number; code: 200 | 201 | 202; raw: string; ms: number }
  | { kind: 'amcp.err'; seq: number; code: number; raw: string; ms: number }
  | { kind: 'amcp.timeout'; seq: number };

// ── OSC events (in) — pushed by CasparCG ───────────────────────────────
type OscEvent =
  | {
      kind: 'osc.layer.foreground';
      channel: number;
      layer: number;
      producer?: string;
      file?: string;
    }
  | { kind: 'osc.layer.background'; channel: number; layer: number; producer?: string }
  | { kind: 'osc.layer.empty'; channel: number; layer: number }
  | { kind: 'osc.cg.invoked'; channel: number; layer: number; method: string }
  | { kind: 'osc.cg.stopped'; channel: number; layer: number }
  | { kind: 'osc.frame'; channel: number; frame: number }
  | { kind: 'osc.health'; server: 'primary' | 'backup'; healthy: boolean; uptimeSec: number };

// ── Effects (out) — requests the machine emits ────────────────────────
type Effect =
  | {
      kind: 'amcp.send';
      target: 'primary' | 'backup' | 'both';
      line: string;
      seq: number;
      expectAck: boolean;
    }
  | { kind: 'audit.append'; entry: AuditEntry }
  | { kind: 'journal.append'; record: JournalRecord }
  | { kind: 'ui.notify'; severity: 'info' | 'warn' | 'error'; message: string }
  | { kind: 'tally.emit'; event: TallyEvent } // adapter; v1 no-op
  | { kind: 'reconciler.requestResync' };

// ── Reconciled per-item state ─────────────────────────────────────────
type StackItemState = {
  itemId: Id;
  templateId: Id;
  fields: FieldValues;
  status:
    | 'idle'
    | 'loaded'
    | 'playing'
    | 'on-air'
    | 'updating'
    | 'exiting'
    | 'error'
    | 'disconnected';
  pending: boolean; // optimistic ahead of OSC truth
  lastIntentSeq?: number;
  lastOscAt?: ISODate;
  slot?: LayerSlot;
  errorCode?: string;
};

type LayerSlot = { channel: number; layer: number; server: 'primary' | 'backup' | 'both' };

// ── Audit ─────────────────────────────────────────────────────────────
type AuditEntry = {
  ts: ISODate;
  actor: string; // OS user in v1
  action:
    | 'load'
    | 'take'
    | 'update'
    | 'out'
    | 'remove'
    | 'failover'
    | 'reconnect'
    | 'import'
    | 'export';
  itemId?: Id;
  templateId?: Id;
  templateHash?: string;
  dataHash?: string; // sha256 of field values
  server?: 'primary' | 'backup' | 'both';
  slot?: LayerSlot;
  ackMs?: number;
  oscConfirmMs?: number;
  outcome: 'ok' | 'failed' | 'timeout';
  errorCode?: string;
};

type JournalRecord =
  | { kind: 'intent'; seq: number; ts: ISODate; intent: Intent }
  | { kind: 'effect'; seq: number; ts: ISODate; effect: Effect }
  | { kind: 'osc'; seq: number; ts: ISODate; event: OscEvent }
  | { kind: 'snapshot'; seq: number; ts: ISODate; state: Record<Id, StackItemState> };
```

The journal is the **resync source** on Runtime restart. The reconciler replays from the last snapshot + tail.

---

## 8. Migration Story

```ts
// pseudo-organization — declarative migration steps registered per from→to pair
type Migration<From, To> = { from: number; to: number; up(raw: From): To };

// Loader pipeline:
// 1. unzip → in-memory tree
// 2. verify integrity (sha256 per file vs manifest.integrity.files)
// 3. verify signature if signing required for this deployment
// 4. read manifest.schemaVersion
// 5. apply Migrations[v → v+1] until current
// 6. Zod-validate Scene + Manifest
// 7. resolve font deps (bundled inside zip preferred; system fallback warned)
// 8. return { scene, manifest, assets }
```

A `.vcg` from designer v1.0 must load in designer v2.0 without operator intervention. Forward-compat (v2 template in v1 app) → reject with clear message.

---

## 9. Cross-Cutting Invariants

1. **Element ids never reused** across saves, even after delete. Soft-undo relies on this.
2. **Animation durations are frame-locked** at the scene's declared rate. Re-rendering at a different rate converts in the runtime, not in the saved data.
3. **Bindings are one-way** (field → element). Operator UI is the only writer of field values.
4. **`templateId` ≠ `vcgFile`**: a template can be re-exported many times; only `templateId` + `templateHash` together identify a specific bytes-on-disk artifact.
5. **No element rendering outside the template HTML iframe.** Konva-class libraries draw _gizmos_ only.
6. **No fields without bindings** validate (Zod refinement) — declared but unused fields produce a warning, not an error, on export.
7. **No bindings to undeclared fields** is a hard error.
8. **Scene background** is either fully transparent (broadcast safe over SDI key) or solid color. No images as scene-level background; use a full-bleed `ImageElement`.

---

## 10. What's still open

- **Lottie field-override surface** (§3 `fieldOverrides`) is `Record<string, unknown>` — needs a typed sub-grammar (text replacement, color replacement, slider — Lottie's standard "expression-controlled" overrides).
- **Asset variants** (image @1x/@2x for 1080/2160) — defer to v2; v1 ships single asset and scales.
- **Multi-language field bundles** (one `headline` field with `fa`/`en` variants) — not modeled; deferred until i18n at the operator layer is scoped.
- **PVW→PGM data model**: an item in PVW state needs a separate `pvwSlot` distinct from `slot`. Add when implementing PVW workflow in Phase 6.
