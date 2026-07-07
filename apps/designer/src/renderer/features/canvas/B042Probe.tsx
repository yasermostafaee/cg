import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { Button } from '../../ui/Button.js';
import { pixelGridVisible } from './geometry.js';

/**
 * B-042 follow-up — TEMPORARY on-machine alignment probe (the owner still sees the
 * misalignment on the real laptop while the emulated E2E is green, so we measure ON
 * the affected machine instead of trusting emulation).
 *
 * Strictly opt-in: renders ONLY with `?b042probe=1` in the URL or
 * `localStorage.b042probe = '1'`. It reports, live (2 Hz): devicePixelRatio +
 * visualViewport.scale + a browser-zoom heuristic (loud warning + "press Ctrl+0");
 * the grid canvas layer's rect, fractional device origin, and backing↔CSS scale;
 * the stage / preview-iframe / selection-gizmo layers' rects and fractional device
 * origins; and per-axis edge blocks — X: the judged element's RIGHT edge vs the
 * nearest vertical stroke (read back from the canvas BITMAP), Y: its TOP edge vs
 * the nearest horizontal stroke — plus min→max delta sweeps across every visible
 * stroke on BOTH axes. The judged element is the selection, or (deselected) the
 * first rendered element in the preview DOM. The gizmo is measured BOTH ways:
 * from the polygon's `points` geometry (authoritative) and from its
 * `getBoundingClientRect` (stroke- and snap-polluted — reported to expose the
 * difference), per side. "Copy readout" puts the whole thing on the clipboard as
 * text and `console.table`s the key metrics.
 *
 * Removed (or kept behind the flag) once B-042 is confirmed fixed on the owner's
 * machine — see the change's tasks.md follow-up section.
 */

/** The build tag the owner checks against — parent commit + fix revision. */
export const B042_BUILD = '8ed5a52+contain-snap+probe3';

// Boot log: fires on app boot (this module is statically imported by CanvasArea),
// so a stale/pre-fix build is detectable from the console alone.
console.log('B-042 build', B042_BUILD);

/** Windows display-scale factors Chrome reports at 100% browser zoom. */
const STANDARD_DPRS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 3.5, 4];

function computeProbeEnabled(): boolean {
  try {
    return (
      new URLSearchParams(window.location.search).get('b042probe') === '1' ||
      window.localStorage.getItem('b042probe') === '1'
    );
  } catch {
    return false;
  }
}
let enabledCache: boolean | null = null;
/** Opt-in check (evaluated once per page load — toggling requires a reload). */
export function b042ProbeEnabled(): boolean {
  enabledCache ??= computeProbeEnabled();
  return enabledCache;
}

interface LayerReading {
  cssLeft: number;
  cssTop: number;
  devLeft: number;
  devTop: number;
  /** fractional part of the device-px origin, [0, 1) — 0 means ON the raster */
  fracLeft: number;
  fracTop: number;
}

/** One axis's edge-vs-stroke comparison (X: right edge / vertical strokes; Y: top
 *  edge / horizontal strokes). All positions in SCREEN DEVICE px. */
interface AxisEdgeReading {
  /** scene coordinate of the judged edge (fractional if the shape was dragged) */
  sceneCoord: number;
  /** the integer scene column/row nearest the edge */
  lattice: number;
  /** the content lattice line's device position (iframe mapping of the integer) */
  contentLatticeDev: number;
  /** the element's ACTUAL rendered edge (honest about fractional coords) */
  contentEdgeDev: number;
  /** nearest painted grid stroke CENTER, read back from the bitmap, or null */
  strokeDev: number | null;
  /** strokeCenter − contentEdge — |·| ≤ ½ means the stroke pixel contains/hugs the edge */
  dStrokeVsEdge: number | null;
  /** strokeCenter − contentLattice — same, for the integer lattice line */
  dStrokeVsLattice: number | null;
}

interface StrokeSweep {
  count: number;
  firstDelta: number;
  lastDelta: number;
  minDelta: number;
  maxDelta: number;
}

/** The gizmo frame, measured from the polygon's `points` GEOMETRY (authoritative)
 *  and from getBoundingClientRect (stroke/snap-polluted) — screen device px. */
interface GizmoReading {
  pointsLeft: number;
  pointsRight: number;
  pointsTop: number;
  pointsBottom: number;
  bboxLeft: number;
  bboxRight: number;
  bboxTop: number;
  bboxBottom: number;
  /** per-side points-geometry − content-edge deltas (the Directive-2 acceptance) */
  dLeft: number | null;
  dRight: number | null;
  dTop: number | null;
  dBottom: number | null;
  /** per-side bbox − points differences (exposes the rect-measurement artifact) */
  bboxBiasRight: number;
  bboxBiasBottom: number;
}

interface GridReading extends LayerReading {
  styleLeft: string;
  styleTop: string;
  backingScale: number;
}

interface ProbeReading {
  build: string;
  at: string;
  dpr: number;
  vvScale: number | null;
  zoomSuspect: boolean;
  grid: GridReading | null;
  stage: LayerReading | null;
  iframe: LayerReading | null;
  judged: string;
  edgeX: AxisEdgeReading | null;
  edgeY: AxisEdgeReading | null;
  sweepX: StrokeSweep | null;
  sweepY: StrokeSweep | null;
  gizmo: GizmoReading | null;
  note: string;
}

function layerReading(rect: DOMRect, dpr: number): LayerReading {
  const devLeft = rect.left * dpr;
  const devTop = rect.top * dpr;
  return {
    cssLeft: rect.left,
    cssTop: rect.top,
    devLeft,
    devTop,
    fracLeft: devLeft - Math.floor(devLeft),
    fracTop: devTop - Math.floor(devTop),
  };
}

/** Painted stroke positions in the grid bitmap on one axis: min alpha across a few
 *  spread lines of the OTHER axis, so crossing lines don't count. */
function strokePositions(grid: HTMLCanvasElement, axis: 'x' | 'y'): number[] {
  const ctx = grid.getContext('2d');
  if (ctx === null || grid.width === 0 || grid.height === 0) return [];
  const across = axis === 'x' ? grid.height : grid.width;
  const along = axis === 'x' ? grid.width : grid.height;
  const samples = [0.13, 0.29, 0.47, 0.61, 0.83].map((f) => Math.floor(across * f));
  const minAlpha = new Float64Array(along).fill(255);
  for (const s of samples) {
    const data =
      axis === 'x'
        ? ctx.getImageData(0, s, grid.width, 1).data
        : ctx.getImageData(s, 0, 1, grid.height).data;
    for (let i = 0; i < along; i++) {
      const a = data[i * 4 + 3] ?? 0;
      if (a < (minAlpha[i] ?? 255)) minAlpha[i] = a;
    }
  }
  const out: number[] = [];
  for (let i = 0; i < along; i++) if ((minAlpha[i] ?? 0) > 0) out.push(i);
  return out;
}

/** Parse the gizmo polygon's `points` attribute → overlay-space corner extremes. */
function polygonExtremes(
  points: string,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  const nums = points
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (nums.length < 8) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    xs.push(nums[i] ?? 0);
    ys.push(nums[i + 1] ?? 0);
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

interface ProbeInputs {
  outer: HTMLDivElement | null;
  stage: HTMLDivElement | null;
  iframe: HTMLIFrameElement | null;
  grid: HTMLCanvasElement | null;
  zoom: number;
  frameOffsetX: number;
  frameOffsetY: number;
  selection: ReadonlySet<string>;
}

function readProbe(inp: ProbeInputs): ProbeReading {
  const dpr = window.devicePixelRatio;
  const vvScale = window.visualViewport ? window.visualViewport.scale : null;
  const zoomSuspect =
    !STANDARD_DPRS.some((s) => Math.abs(dpr - s) < 0.001) || (vvScale !== null && vvScale !== 1);
  const base: ProbeReading = {
    build: B042_BUILD,
    at: new Date().toISOString().slice(11, 19),
    dpr,
    vvScale,
    zoomSuspect,
    grid: null,
    stage: null,
    iframe: null,
    judged: '—',
    edgeX: null,
    edgeY: null,
    sweepX: null,
    sweepY: null,
    gizmo: null,
    note: '',
  };
  const { outer, stage, iframe, grid, zoom, frameOffsetX, frameOffsetY, selection } = inp;
  if (outer === null || stage === null || iframe === null) {
    base.note = 'waiting for canvas layout…';
    return base;
  }
  const srect = stage.getBoundingClientRect();
  const irect = iframe.getBoundingClientRect();
  base.stage = layerReading(srect, dpr);
  base.iframe = layerReading(irect, dpr);
  // B-042 take 4 — the iframe is a WINDOW into the stage: its live `--cg-frame-x/-y` vars carry
  // the window-compensated inset. All iframe-based content mappings must use these, not the
  // model frame offset (which stays valid only for STAGE/spacer-based mappings).
  const rootStyle = iframe.contentDocument?.documentElement.style;
  const fxRaw = rootStyle ? Number.parseFloat(rootStyle.getPropertyValue('--cg-frame-x')) : NaN;
  const fyRaw = rootStyle ? Number.parseFloat(rootStyle.getPropertyValue('--cg-frame-y')) : NaN;
  const effX = Number.isFinite(fxRaw) ? fxRaw : frameOffsetX;
  const effY = Number.isFinite(fyRaw) ? fyRaw : frameOffsetY;

  // ── the judged element: the selection, or the first rendered element ────────
  const idoc = iframe.contentDocument;
  const selectedId = selection.size > 0 ? [...selection][0] : undefined;
  let el: Element | null = null;
  if (idoc !== null) {
    el =
      selectedId !== undefined
        ? idoc.querySelector(`[data-cg-element-id="${selectedId}"]`)
        : idoc.querySelector('[data-cg-element-id]');
  }
  const local = el === null ? null : el.getBoundingClientRect(); // iframe-local CSS (pre-scale)
  base.judged =
    el === null
      ? 'none (no rendered element)'
      : `${selectedId !== undefined ? 'selection' : 'first element (deselected)'} ${(el.getAttribute('data-cg-element-id') ?? '').slice(0, 8)}`;

  // ── gizmo, from points geometry AND bbox ─────────────────────────────────────
  const polygon = document.querySelector('[data-testid="gizmo-frame"]');
  if (polygon !== null && local !== null) {
    const svg = polygon.closest('svg');
    const srectSvg = svg === null ? null : svg.getBoundingClientRect();
    const ext = polygonExtremes(polygon.getAttribute('points') ?? '');
    const bbox = polygon.getBoundingClientRect();
    if (srectSvg !== null && ext !== null) {
      const pointsLeft = (srectSvg.left + ext.minX) * dpr;
      const pointsRight = (srectSvg.left + ext.maxX) * dpr;
      const pointsTop = (srectSvg.top + ext.minY) * dpr;
      const pointsBottom = (srectSvg.top + ext.maxY) * dpr;
      const contentLeft = (irect.left + local.left * zoom) * dpr;
      const contentRight = (irect.left + local.right * zoom) * dpr;
      const contentTop = (irect.top + local.top * zoom) * dpr;
      const contentBottom = (irect.top + local.bottom * zoom) * dpr;
      base.gizmo = {
        pointsLeft,
        pointsRight,
        pointsTop,
        pointsBottom,
        bboxLeft: bbox.left * dpr,
        bboxRight: bbox.right * dpr,
        bboxTop: bbox.top * dpr,
        bboxBottom: bbox.bottom * dpr,
        dLeft: pointsLeft - contentLeft,
        dRight: pointsRight - contentRight,
        dTop: pointsTop - contentTop,
        dBottom: pointsBottom - contentBottom,
        bboxBiasRight: bbox.right * dpr - pointsRight,
        bboxBiasBottom: bbox.bottom * dpr - pointsBottom,
      };
    }
  }

  if (!pixelGridVisible(zoom)) {
    base.note = `pixel grid hidden — zoom ${String(Math.round(zoom * 100))}% is below the 800% threshold`;
    return base;
  }
  if (grid === null) {
    base.note = 'grid canvas not mounted';
    return base;
  }
  const grect = grid.getBoundingClientRect();
  const backingScale = grid.width === 0 ? Number.NaN : (grect.width * dpr) / grid.width;
  base.grid = {
    ...layerReading(grect, dpr),
    styleLeft: grid.style.left,
    styleTop: grid.style.top,
    backingScale,
  };

  // ── per-axis edge blocks + sweeps ────────────────────────────────────────────
  const axes: ('x' | 'y')[] = ['x', 'y'];
  for (const axis of axes) {
    const isX = axis === 'x';
    const contentOrigin = isX ? irect.left : irect.top; // iframe origin, CSS
    const frameOff = isX ? effX : effY;
    const gridOrigin = (isX ? grect.left : grect.top) * dpr;
    const strokes = strokePositions(grid, axis);
    const strokeDevOf = (i: number): number => gridOrigin + (i + 0.5) * backingScale;
    // the judged edge: X → element right; Y → element top
    let edge: AxisEdgeReading | null = null;
    if (local !== null) {
      const localEdge = isX ? local.right : local.top;
      const sceneCoord = localEdge - frameOff;
      const lattice = Math.round(sceneCoord);
      const contentLatticeDev = (contentOrigin + (frameOff + lattice) * zoom) * dpr;
      const contentEdgeDev = (contentOrigin + localEdge * zoom) * dpr;
      let strokeDev: number | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const i of strokes) {
        const d = Math.abs(strokeDevOf(i) - contentEdgeDev);
        if (d < best) {
          best = d;
          strokeDev = strokeDevOf(i);
        }
      }
      if (strokeDev !== null && best > (zoom * dpr) / 2) strokeDev = null;
      edge = {
        sceneCoord,
        lattice,
        contentLatticeDev,
        contentEdgeDev,
        strokeDev,
        dStrokeVsEdge: strokeDev === null ? null : strokeDev - contentEdgeDev,
        dStrokeVsLattice: strokeDev === null ? null : strokeDev - contentLatticeDev,
      };
    }
    // sweep: every stroke vs the nearest CONTENT lattice line on this axis
    let sweep: StrokeSweep | null = null;
    if (strokes.length > 0) {
      const deltas = strokes.map((i) => {
        const dev = strokeDevOf(i);
        const scene = Math.round((dev / dpr - contentOrigin) / zoom - frameOff);
        const content = (contentOrigin + (frameOff + scene) * zoom) * dpr;
        return dev - content;
      });
      sweep = {
        count: deltas.length,
        firstDelta: deltas[0] ?? Number.NaN,
        lastDelta: deltas[deltas.length - 1] ?? Number.NaN,
        minDelta: Math.min(...deltas),
        maxDelta: Math.max(...deltas),
      };
    }
    if (isX) {
      base.edgeX = edge;
      base.sweepX = sweep;
    } else {
      base.edgeY = edge;
      base.sweepY = sweep;
    }
  }
  return base;
}

const f = (v: number | null | undefined, digits = 4): string =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(digits);

function formatReading(r: ProbeReading): string {
  const lines: string[] = [];
  lines.push(`B-042 probe — build ${r.build} @ ${r.at}`);
  lines.push(`devicePixelRatio: ${String(r.dpr)}   visualViewport.scale: ${f(r.vvScale, 3)}`);
  if (r.zoomSuspect)
    lines.push('!! BROWSER ZOOM SUSPECTED (dpr is not a standard Windows scale) — press Ctrl+0 !!');
  const layer = (name: string, l: LayerReading | null): void => {
    if (l === null) {
      lines.push(`${name}: —`);
      return;
    }
    lines.push(
      `${name}: css(${f(l.cssLeft)}, ${f(l.cssTop)})  dev(${f(l.devLeft)}, ${f(l.devTop)})  frac(${f(l.fracLeft)}, ${f(l.fracTop)})`,
    );
  };
  if (r.grid !== null) {
    layer('grid  ', r.grid);
    lines.push(
      `grid  : nudge style(${r.grid.styleLeft || '0px'}, ${r.grid.styleTop || '0px'})  backingScale ${f(r.grid.backingScale, 8)}`,
    );
  } else {
    lines.push('grid  : —');
  }
  layer('stage ', r.stage);
  layer('iframe', r.iframe);
  lines.push(`judged: ${r.judged}`);
  const axisBlock = (name: string, e: AxisEdgeReading | null, s: StrokeSweep | null): void => {
    if (e !== null) {
      lines.push(
        `${name}: scene=${f(e.sceneCoord)}  lattice=${String(e.lattice)}  latticeDev ${f(e.contentLatticeDev)}  edgeDev ${f(e.contentEdgeDev)}  stroke ${f(e.strokeDev)}`,
      );
      lines.push(
        `${name}: stroke−edge = ${f(e.dStrokeVsEdge)} dev px   stroke−lattice = ${f(e.dStrokeVsLattice)} dev px`,
      );
    } else {
      lines.push(`${name}: —`);
    }
    if (s !== null) {
      lines.push(
        `${name}: sweep ${String(s.count)} strokes  first ${f(s.firstDelta)}  last ${f(s.lastDelta)}  min ${f(s.minDelta)}  max ${f(s.maxDelta)}  (stroke−contentLattice, dev px)`,
      );
    }
  };
  axisBlock('edgeX ', r.edgeX, r.sweepX);
  axisBlock('edgeY ', r.edgeY, r.sweepY);
  if (r.gizmo !== null) {
    const g = r.gizmo;
    lines.push(
      `gizmo : points L ${f(g.pointsLeft)} R ${f(g.pointsRight)} T ${f(g.pointsTop)} B ${f(g.pointsBottom)}`,
    );
    lines.push(
      `gizmo : Δcontent L ${f(g.dLeft)} R ${f(g.dRight)} T ${f(g.dTop)} B ${f(g.dBottom)} dev px (points-based)`,
    );
    lines.push(
      `gizmo : bbox R ${f(g.bboxRight)} B ${f(g.bboxBottom)}  bbox−points R ${f(g.bboxBiasRight)} B ${f(g.bboxBiasBottom)} (rect artifact)`,
    );
  } else {
    lines.push('gizmo : — (nothing selected)');
  }
  if (r.note !== '') lines.push(`note  : ${r.note}`);
  return lines.join('\n');
}

/** Flat key metrics for `console.table`. */
function tableRow(r: ProbeReading): Record<string, string | number | null> {
  return {
    build: r.build,
    dpr: r.dpr,
    vvScale: r.vvScale,
    zoomSuspect: r.zoomSuspect ? 'YES — Ctrl+0' : 'no',
    stageFracX: r.stage === null ? null : Number(r.stage.fracLeft.toFixed(4)),
    stageFracY: r.stage === null ? null : Number(r.stage.fracTop.toFixed(4)),
    dStrokeVsEdgeX: r.edgeX === null ? null : r.edgeX.dStrokeVsEdge,
    dStrokeVsEdgeY: r.edgeY === null ? null : r.edgeY.dStrokeVsEdge,
    sweepXMin: r.sweepX === null ? null : Number(r.sweepX.minDelta.toFixed(4)),
    sweepXMax: r.sweepX === null ? null : Number(r.sweepX.maxDelta.toFixed(4)),
    sweepYMin: r.sweepY === null ? null : Number(r.sweepY.minDelta.toFixed(4)),
    sweepYMax: r.sweepY === null ? null : Number(r.sweepY.maxDelta.toFixed(4)),
    gizmoDRight: r.gizmo === null ? null : r.gizmo.dRight,
    gizmoDTop: r.gizmo === null ? null : r.gizmo.dTop,
    note: r.note,
  };
}

const OWNER_STEPS =
  '1) Ctrl+0  2) rect X=0 Y=0 W=320 H=120, zoom 6400%, scroll so an edge is visible\n' +
  '3) Esc (deselect) → Copy readout (X + Y blocks now fill from the first element)\n' +
  '4) select the shape → Copy readout  5) drag to a fractional position → Copy readout\n' +
  '6) paste all + Windows display-scale %';

const panelStyle: CSSProperties = {
  position: 'fixed',
  right: 8,
  bottom: 8,
  zIndex: 10_000,
  background: 'rgba(11,14,22,0.95)',
  color: '#d7dae4',
  border: '1px solid #F59E0B',
  borderRadius: 4,
  padding: '6px 8px',
  font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  whiteSpace: 'pre',
  maxWidth: 760,
  overflowX: 'auto',
  direction: 'ltr',
  pointerEvents: 'auto',
};

export function B042Probe(props: {
  outerRef: RefObject<HTMLDivElement>;
  stageRef: RefObject<HTMLDivElement>;
  iframeRef: RefObject<HTMLIFrameElement>;
  gridRef: RefObject<HTMLCanvasElement>;
  zoom: number;
  frameOffset: { x: number; y: number };
  selection: ReadonlySet<string>;
}): JSX.Element {
  const { outerRef, stageRef, iframeRef, gridRef, zoom, selection } = props;
  const frameOffsetX = props.frameOffset.x;
  const frameOffsetY = props.frameOffset.y;
  const [reading, setReading] = useState<ProbeReading | null>(null);
  const [copied, setCopied] = useState<string>('');

  // Live at 2 Hz — rect reads + a few 1-line getImageData calls are cheap.
  useEffect(() => {
    const tick = (): void => {
      setReading(
        readProbe({
          outer: outerRef.current,
          stage: stageRef.current,
          iframe: iframeRef.current,
          grid: gridRef.current,
          zoom,
          frameOffsetX,
          frameOffsetY,
          selection,
        }),
      );
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => {
      window.clearInterval(id);
    };
  }, [outerRef, stageRef, iframeRef, gridRef, zoom, frameOffsetX, frameOffsetY, selection]);

  const text = useMemo(
    () => (reading === null ? 'B-042 probe: starting…' : formatReading(reading)),
    [reading],
  );

  function copyReadout(): void {
    if (reading === null) return;
    console.table(tableRow(reading));
    console.log(formatReading(reading));
    void navigator.clipboard
      .writeText(formatReading(reading))
      .then(() => {
        setCopied('copied ✓');
      })
      .catch(() => {
        setCopied('clipboard blocked — copy from the console instead');
      });
    window.setTimeout(() => {
      setCopied('');
    }, 2500);
  }

  return (
    <div style={panelStyle} data-testid="b042-probe" aria-hidden>
      {text}
      {'\n\n'}
      {OWNER_STEPS}
      {'\n'}
      <Button size="sm" variant="secondary" onClick={copyReadout} aria-label="Copy B-042 readout">
        Copy readout
      </Button>
      {copied !== '' && <span style={{ marginInlineStart: 8, color: '#34D399' }}>{copied}</span>}
    </div>
  );
}
