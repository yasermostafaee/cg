/**
 * Lottie import validator (Phase 8 §11 / M8.2).
 *
 * Lottie JSON is a sprawling schema — most of it is fine in a CEF
 * renderer, but a few categories of feature either degrade gracefully
 * to nothing useful (3D layers in SVG), break the security model
 * (expressions), or simply don't fit our use case (audio layers,
 * cameras, lights). We validate against an explicit allowlist at
 * *import time* so the Designer can show "rejected features: …" before
 * the operator ever drags the .vcg into the Runtime.
 *
 * Returns either `{ ok: true, animation }` (the cleaned JSON, ready to
 * pass to `createLottiePlayer`) or `{ ok: false, rejected: […] }` with
 * a list of human-readable reasons. We never *strip* offending features
 * silently — that risks shipping an animation that looks subtly broken
 * on air. The operator must explicitly re-export from After Effects
 * with the offending feature removed.
 */

/** Lottie layer type discriminator values from the Bodymovin spec. */
const LAYER_TYPE_NAMES: Record<number, string> = {
  0: 'precomp',
  1: 'solid',
  2: 'image',
  3: 'null',
  4: 'shape',
  5: 'text',
  6: 'audio',
  13: 'camera',
  15: 'light',
};

/** Features we render to SVG with confidence. */
const ALLOWED_LAYER_TYPES = new Set<number>([0, 1, 2, 3, 4, 5]);

export type RejectionCode =
  | 'unsupported-layer-type'
  | 'three-d-layer'
  | 'expression'
  | 'effect'
  | 'audio-asset'
  | 'malformed-json';

export interface RejectedFeature {
  code: RejectionCode;
  /** Human-readable reason, suitable for an "Issues" toast. */
  message: string;
  /** Layer name (`nm`) when the rejection is layer-scoped. */
  layerName?: string;
}

export type ImportResult =
  | { ok: true; animation: LottieAnimation }
  | { ok: false; rejected: readonly RejectedFeature[] };

/**
 * One bodymovin timeline marker. `tm` = start frame, `cm` = comment/name,
 * `dr` = duration frames. D-125 reads these to derive the element's phase
 * mapping (see {@link markersToSegments}).
 */
export interface LottieMarker {
  tm: number;
  cm: string;
  dr: number;
}

/**
 * Shape of the cleaned Lottie JSON exposed to consumers. We don't
 * type the full Bodymovin schema — `createLottiePlayer` accepts
 * `unknown` and lottie-web is the source of truth. This type just
 * captures the fields the Designer reads at preview time.
 */
export interface LottieAnimation {
  v: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  nm: string;
  /** D-125 — the top-level bodymovin `markers` array (empty when absent). */
  markers: readonly LottieMarker[];
  /** Full JSON for round-tripping to the runtime. */
  raw: unknown;
}

/**
 * Validate a parsed Lottie JSON object. Caller is responsible for the
 * JSON.parse — this function operates on the in-memory tree so it can
 * be exercised in tests without filesystem IO.
 */
export function importLottie(parsed: unknown): ImportResult {
  if (parsed === null || typeof parsed !== 'object') {
    return {
      ok: false,
      rejected: [{ code: 'malformed-json', message: 'Lottie JSON is not an object.' }],
    };
  }
  const obj = parsed as Record<string, unknown>;
  const required = ['v', 'fr', 'ip', 'op', 'w', 'h', 'layers'] as const;
  for (const key of required) {
    if (!(key in obj)) {
      return {
        ok: false,
        rejected: [
          {
            code: 'malformed-json',
            message: `Missing required top-level field "${key}".`,
          },
        ],
      };
    }
  }

  const rejected: RejectedFeature[] = [];

  if (obj['ddd'] === 1) {
    rejected.push({
      code: 'three-d-layer',
      message: 'Composition has 3D enabled (top-level ddd=1). SVG renderer cannot reproduce 3D.',
    });
  }

  const layers = obj['layers'];
  if (!Array.isArray(layers)) {
    return {
      ok: false,
      rejected: [{ code: 'malformed-json', message: 'Top-level "layers" must be an array.' }],
    };
  }
  walkLayers(layers, rejected);

  // Nested comps live in `assets[*].layers` when the asset id matches a
  // layer's `refId`. We walk those too so a rejected feature inside a
  // pre-comp isn't a silent ship.
  const assets = obj['assets'];
  if (Array.isArray(assets)) {
    for (const asset of assets) {
      if (
        typeof asset === 'object' &&
        asset !== null &&
        'layers' in asset &&
        Array.isArray((asset as { layers: unknown }).layers)
      ) {
        walkLayers((asset as { layers: unknown[] }).layers, rejected);
      }
      if (
        typeof asset === 'object' &&
        asset !== null &&
        (asset as { ty?: unknown }).ty === 'audio'
      ) {
        rejected.push({
          code: 'audio-asset',
          message:
            'Asset declared with ty="audio" — audio is not supported in broadcast templates.',
        });
      }
    }
  }

  if (rejected.length > 0) {
    return { ok: false, rejected };
  }

  return {
    ok: true,
    animation: {
      v: String(obj['v']),
      fr: Number(obj['fr']),
      ip: Number(obj['ip']),
      op: Number(obj['op']),
      w: Number(obj['w']),
      h: Number(obj['h']),
      nm: typeof obj['nm'] === 'string' ? obj['nm'] : '',
      markers: readMarkers(obj['markers']),
      raw: parsed,
    },
  };
}

/** Extract the well-formed `{ tm, cm, dr }` markers, skipping malformed entries. */
function readMarkers(raw: unknown): LottieMarker[] {
  if (!Array.isArray(raw)) return [];
  const out: LottieMarker[] = [];
  for (const m of raw) {
    if (typeof m !== 'object' || m === null) continue;
    const r = m as Record<string, unknown>;
    if (typeof r['tm'] !== 'number' || typeof r['cm'] !== 'string') continue;
    out.push({ tm: r['tm'], cm: r['cm'], dr: typeof r['dr'] === 'number' ? r['dr'] : 0 });
  }
  return out;
}

function walkLayers(layers: readonly unknown[], rejected: RejectedFeature[]): void {
  for (const layer of layers) {
    if (typeof layer !== 'object' || layer === null) continue;
    const l = layer as Record<string, unknown>;
    const ty = typeof l['ty'] === 'number' ? l['ty'] : -1;
    const nameRaw = l['nm'];
    const layerName = typeof nameRaw === 'string' ? nameRaw : '(unnamed)';

    if (!ALLOWED_LAYER_TYPES.has(ty)) {
      rejected.push({
        code: 'unsupported-layer-type',
        message: `Layer type ${String(ty)} (${LAYER_TYPE_NAMES[ty] ?? 'unknown'}) is not supported.`,
        layerName,
      });
      continue;
    }
    if (l['ddd'] === 1) {
      rejected.push({
        code: 'three-d-layer',
        message: 'Layer has ddd=1 (3D).',
        layerName,
      });
    }
    // Effects: any non-empty `ef` array rejects.
    if (Array.isArray(l['ef']) && (l['ef'] as unknown[]).length > 0) {
      rejected.push({
        code: 'effect',
        message: 'Layer has effects (ef[]) — strip in After Effects before re-exporting.',
        layerName,
      });
    }
    // Expressions: walk the layer recursively looking for any `x` field
    // on a property object. A property has `k` (keyframes or value) and
    // optionally `x` (expression string).
    if (containsExpression(layer)) {
      rejected.push({
        code: 'expression',
        message: 'Layer contains an expression — expressions are not supported.',
        layerName,
      });
    }
  }
}

/**
 * Lottie expressions are stored as `x: "string"` on property objects.
 * We can't reliably distinguish "property object" from "any object that
 * happens to have an x field" without modeling the full schema, so we
 * adopt a heuristic: a property is detected by the presence of *both*
 * `k` and `x` (or `k` and `xe`/`ix` siblings indicating it's a Property).
 *
 * False positives here are tolerable — we'd reject a legal layer that
 * happens to have those exact fields, which the operator can investigate.
 * False negatives are the dangerous direction; this heuristic catches
 * every well-formed expression bodymovin exports.
 */
function containsExpression(node: unknown): boolean {
  if (node === null || typeof node !== 'object') return false;
  const n = node as Record<string, unknown>;
  if (typeof n['x'] === 'string' && 'k' in n) return true;
  for (const value of Object.values(n)) {
    if (Array.isArray(value)) {
      for (const item of value) if (containsExpression(item)) return true;
    } else if (typeof value === 'object' && value !== null) {
      if (containsExpression(value)) return true;
    }
  }
  return false;
}

/**
 * D-125 — the element's phase mapping in the animation's own frame space: the
 * intro plays `[ip, introEnd]`, the hold sits at `introEnd` (or loops `[idleIn,
 * idleOut]`), and the outro plays `[outroStart, op]`. Always `source: 'markers'`
 * here (this is the marker-derived result); the ELEMENT stores `'manual'` when the
 * operator marks by hand.
 */
export interface LottieSegments {
  source: 'markers';
  introEnd: number;
  outroStart: number;
  idleIn: number;
  idleOut: number;
}

/**
 * Recognised marker-comment aliases → phase boundary. Matched case-insensitively
 * after stripping separators (`-`/`_`/space), so `intro-end`, `introEnd`, and
 * `INTRO END` all resolve the same. `intro`/`in` and `outro`/`out` are the short
 * forms; `hold-*` mirrors `idle-*`.
 */
const MARKER_ALIASES: Record<string, 'introEnd' | 'outroStart' | 'idleIn' | 'idleOut'> = {
  introend: 'introEnd',
  intro: 'introEnd',
  in: 'introEnd',
  outrostart: 'outroStart',
  outro: 'outroStart',
  out: 'outroStart',
  idlestart: 'idleIn',
  holdstart: 'idleIn',
  idleend: 'idleOut',
  holdend: 'idleOut',
};

/**
 * D-125 — derive the phase mapping from a bodymovin `markers` array (§D1.2).
 * Returns the segments when the marker set is VALID — both boundary markers
 * (`intro-end` / `outro-start`) resolve and `ip ≤ introEnd ≤ outroStart ≤ op` — and
 * `null` otherwise (no markers, a missing boundary, unknown names, or out-of-order /
 * out-of-range frames), so the caller falls back to manual marking. An absent idle
 * pair defaults to `[introEnd, outroStart]`; an out-of-range idle pair is ignored
 * (defaulted) rather than rejecting the whole set.
 */
export function markersToSegments(animation: LottieAnimation): LottieSegments | null {
  const { ip, op } = animation;
  let introEnd: number | undefined;
  let outroStart: number | undefined;
  let idleIn: number | undefined;
  let idleOut: number | undefined;
  for (const marker of animation.markers) {
    const key = marker.cm
      .trim()
      .toLowerCase()
      .replace(/[-_\s]/g, '');
    const slot = MARKER_ALIASES[key];
    if (slot === undefined) continue;
    // First occurrence wins (a later duplicate marker doesn't clobber it).
    if (slot === 'introEnd' && introEnd === undefined) introEnd = marker.tm;
    else if (slot === 'outroStart' && outroStart === undefined) outroStart = marker.tm;
    else if (slot === 'idleIn' && idleIn === undefined) idleIn = marker.tm;
    else if (slot === 'idleOut' && idleOut === undefined) idleOut = marker.tm;
  }
  if (introEnd === undefined || outroStart === undefined) return null;
  if (!(ip <= introEnd && introEnd <= outroStart && outroStart <= op)) return null;
  // Default / validate the idle segment: keep it only when it sits inside the hold
  // window, else fall back to the whole hold window.
  const idleValid =
    idleIn !== undefined &&
    idleOut !== undefined &&
    introEnd <= idleIn &&
    idleIn <= idleOut &&
    idleOut <= outroStart;
  return {
    source: 'markers',
    introEnd,
    outroStart,
    idleIn: idleValid ? (idleIn as number) : introEnd,
    idleOut: idleValid ? (idleOut as number) : outroStart,
  };
}
