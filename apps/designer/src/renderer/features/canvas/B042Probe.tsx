import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { Button } from '../../ui/Button.js';
import { gridCanvasAlignment, pixelGridVisible } from './geometry.js';

/**
 * B-042 follow-up — TEMPORARY on-machine alignment probe (the owner still sees the
 * misalignment on the real laptop while the emulated E2E is green, so we measure ON
 * the affected machine instead of trusting emulation).
 *
 * Strictly opt-in: renders ONLY with `?b042probe=1` in the URL or
 * `localStorage.b042probe = '1'`. It reports, live (2 Hz): devicePixelRatio +
 * visualViewport.scale + a browser-zoom heuristic (loud warning + "press Ctrl+0");
 * the grid canvas layer's rect, fractional device origin, applied sub-CSS-px nudge,
 * raster phase, and backing↔CSS scale (must be exactly 1); the stage /
 * preview-iframe / selection-gizmo layers' rects and fractional device origins; and,
 * for the selection's right edge (or the column at the viewport centre), the ideal /
 * grid-stroke (read back from the canvas BITMAP) / content / gizmo device positions
 * with deltas — plus a min→max delta sweep across every visible stroke (left↔right
 * drift shows up as a spread). "Copy readout" puts the whole thing on the clipboard
 * as text and `console.table`s the key metrics.
 *
 * Removed (or kept behind the flag) once B-042 is confirmed fixed on the owner's
 * machine — see the change's tasks.md follow-up section.
 */

/** The build tag the owner checks against — parent commit + probe revision. */
export const B042_BUILD = 'd0fd37d+probe1';

// Part A.2 — boot log: fires on app boot (this module is statically imported by
// CanvasArea), so a stale/pre-fix build is detectable from the console alone.
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

interface EdgeReading {
  source: string;
  /** scene coord of the judged edge (fractional if the shape was dragged there) */
  sceneRight: number;
  /** the integer scene column being compared against the grid */
  column: number;
  /** ruler/ideal mapping of the column: (outer + rulerOrigin + column·zoom)·dpr */
  idealDev: number;
  /** iframe-rect mapping of the same integer column */
  contentColumnDev: number;
  /** the element's ACTUAL rendered edge (honest about fractional coords), or null */
  contentEdgeDev: number | null;
  /** nearest painted grid stroke CENTER, read back from the bitmap, or null */
  strokeDev: number | null;
  gizmoRightDev: number | null;
  /** stroke − (column + ½) — the grid↔content alignment defect, device px */
  dStrokeVsColumn: number | null;
  dGizmoVsContent: number | null;
}

interface StrokeSweep {
  count: number;
  firstDelta: number;
  lastDelta: number;
  minDelta: number;
  maxDelta: number;
}

interface GridReading extends LayerReading {
  styleLeft: string;
  styleTop: string;
  expectedNudge: number;
  rasterPhase: number;
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
  gizmo: LayerReading | null;
  edge: EdgeReading | null;
  sweep: StrokeSweep | null;
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

/** Painted vertical-stroke columns in the grid bitmap (min alpha across spread rows,
 *  so horizontal lines don't count) — same technique as the B-042 E2E. */
function strokeColumns(grid: HTMLCanvasElement): number[] {
  const ctx = grid.getContext('2d');
  if (ctx === null || grid.width === 0 || grid.height === 0) return [];
  const rows = [0.13, 0.29, 0.47, 0.61, 0.83].map((f) => Math.floor(grid.height * f));
  const minAlpha = new Float64Array(grid.width).fill(255);
  for (const y of rows) {
    const data = ctx.getImageData(0, y, grid.width, 1).data;
    for (let x = 0; x < grid.width; x++) {
      const a = data[x * 4 + 3] ?? 0;
      if (a < (minAlpha[x] ?? 255)) minAlpha[x] = a;
    }
  }
  const cols: number[] = [];
  for (let x = 0; x < grid.width; x++) if ((minAlpha[x] ?? 0) > 0) cols.push(x);
  return cols;
}

interface ProbeInputs {
  outer: HTMLDivElement | null;
  stage: HTMLDivElement | null;
  iframe: HTMLIFrameElement | null;
  grid: HTMLCanvasElement | null;
  zoom: number;
  frameOffsetX: number;
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
    gizmo: null,
    edge: null,
    sweep: null,
    note: '',
  };
  const { outer, stage, iframe, grid, zoom, frameOffsetX, selection } = inp;
  if (outer === null || stage === null || iframe === null) {
    base.note = 'waiting for canvas layout…';
    return base;
  }
  const orect = outer.getBoundingClientRect();
  const srect = stage.getBoundingClientRect();
  const irect = iframe.getBoundingClientRect();
  base.stage = layerReading(srect, dpr);
  base.iframe = layerReading(irect, dpr);
  const gizmoEl = document.querySelector('[data-testid="gizmo-frame"]');
  const gizmoRect = gizmoEl === null ? null : gizmoEl.getBoundingClientRect();
  base.gizmo = gizmoRect === null ? null : layerReading(gizmoRect, dpr);

  if (!pixelGridVisible(zoom)) {
    base.note = `pixel grid hidden — zoom ${String(Math.round(zoom * 100))}% is below the 800% threshold`;
    return base;
  }
  if (grid === null) {
    base.note = 'grid canvas not mounted';
    return base;
  }
  const grect = grid.getBoundingClientRect();
  const align = gridCanvasAlignment(orect.left, dpr);
  const backingScale = grid.width === 0 ? Number.NaN : (grect.width * dpr) / grid.width;
  base.grid = {
    ...layerReading(grect, dpr),
    styleLeft: grid.style.left,
    styleTop: grid.style.top,
    expectedNudge: align.nudgeCss,
    rasterPhase: align.phase,
    backingScale,
  };

  // ── the judged edge ────────────────────────────────────────────────────────
  const rulerOriginX = srect.left - orect.left + frameOffsetX * zoom;
  const idoc = iframe.contentDocument;
  let source = 'viewport-centre column';
  let sceneRight: number | null = null;
  let contentEdgeDev: number | null = null;
  const selectedId = selection.size > 0 ? [...selection][0] : undefined;
  if (selectedId !== undefined && idoc !== null) {
    const el = idoc.querySelector(`[data-cg-element-id="${selectedId}"]`);
    if (el !== null) {
      const local = el.getBoundingClientRect(); // iframe-local CSS px (pre-scale)
      sceneRight = local.right - frameOffsetX;
      contentEdgeDev = (irect.left + local.right * zoom) * dpr;
      source = `selection ${selectedId.slice(0, 8)} right edge`;
    }
  }
  // nothing selected → judge the integer column nearest the viewport centre
  sceneRight ??= (orect.width / 2 - rulerOriginX) / zoom;
  const column = Math.round(sceneRight);
  const idealDev = (orect.left + rulerOriginX + column * zoom) * dpr;
  const contentColumnDev = (irect.left + (frameOffsetX + column) * zoom) * dpr;

  const cols = strokeColumns(grid);
  const strokeDevOf = (col: number): number => grect.left * dpr + (col + 0.5) * backingScale;
  let strokeDev: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const col of cols) {
    const d = Math.abs(strokeDevOf(col) - idealDev);
    if (d < bestDist) {
      bestDist = d;
      strokeDev = strokeDevOf(col);
    }
  }
  if (strokeDev !== null && bestDist > (zoom * dpr) / 2) strokeDev = null; // none near it
  const gizmoRightDev = gizmoRect === null ? null : gizmoRect.right * dpr;
  base.edge = {
    source,
    sceneRight,
    column,
    idealDev,
    contentColumnDev,
    contentEdgeDev,
    strokeDev,
    gizmoRightDev,
    dStrokeVsColumn: strokeDev === null ? null : strokeDev - (contentColumnDev + 0.5),
    dGizmoVsContent:
      gizmoRightDev === null || contentEdgeDev === null ? null : gizmoRightDev - contentEdgeDev,
  };

  // ── all-stroke sweep (left↔right drift shows as a spread) ──────────────────
  if (cols.length > 0) {
    const deltas = cols.map((col) => {
      const dev = strokeDevOf(col);
      const scene = Math.round((dev / dpr - orect.left - rulerOriginX) / zoom);
      const content = (orect.left + rulerOriginX + scene * zoom) * dpr;
      return dev - (content + 0.5);
    });
    base.sweep = {
      count: deltas.length,
      firstDelta: deltas[0] ?? Number.NaN,
      lastDelta: deltas[deltas.length - 1] ?? Number.NaN,
      minDelta: Math.min(...deltas),
      maxDelta: Math.max(...deltas),
    };
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
      `grid  : nudge style(${r.grid.styleLeft || '0px'}, ${r.grid.styleTop || '0px'}) expected ${f(r.grid.expectedNudge, 6)}px  rasterPhase ${f(r.grid.rasterPhase, 6)}  backingScale ${f(r.grid.backingScale, 8)}`,
    );
  } else {
    lines.push('grid  : —');
  }
  layer('stage ', r.stage);
  layer('iframe', r.iframe);
  layer('gizmo ', r.gizmo);
  if (r.edge !== null) {
    const e = r.edge;
    lines.push(`edge  : ${e.source}  sceneRight=${f(e.sceneRight)}  column=${String(e.column)}`);
    lines.push(
      `edge  : ideal ${f(e.idealDev)}  contentCol ${f(e.contentColumnDev)}  contentEdge ${f(e.contentEdgeDev)}  stroke ${f(e.strokeDev)}  gizmoRight ${f(e.gizmoRightDev)}`,
    );
    lines.push(
      `edge  : stroke−(col+½) = ${f(e.dStrokeVsColumn)} dev px   gizmo−content = ${f(e.dGizmoVsContent)} dev px`,
    );
  }
  if (r.sweep !== null) {
    lines.push(
      `sweep : ${String(r.sweep.count)} strokes  first ${f(r.sweep.firstDelta)}  last ${f(r.sweep.lastDelta)}  min ${f(r.sweep.minDelta)}  max ${f(r.sweep.maxDelta)}  (stroke−(col+½), dev px)`,
    );
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
    gridFracLeft: r.grid === null ? null : Number(r.grid.fracLeft.toFixed(4)),
    gridBackingScale: r.grid === null ? null : Number(r.grid.backingScale.toFixed(8)),
    gridRasterPhase: r.grid === null ? null : Number(r.grid.rasterPhase.toFixed(4)),
    stageFracLeft: r.stage === null ? null : Number(r.stage.fracLeft.toFixed(4)),
    iframeFracLeft: r.iframe === null ? null : Number(r.iframe.fracLeft.toFixed(4)),
    gizmoFracLeft: r.gizmo === null ? null : Number(r.gizmo.fracLeft.toFixed(4)),
    dStrokeVsColumn: r.edge === null ? null : r.edge.dStrokeVsColumn,
    dGizmoVsContent: r.edge === null ? null : r.edge.dGizmoVsContent,
    sweepMin: r.sweep === null ? null : Number(r.sweep.minDelta.toFixed(4)),
    sweepMax: r.sweep === null ? null : Number(r.sweep.maxDelta.toFixed(4)),
    note: r.note,
  };
}

const OWNER_STEPS =
  '1) Ctrl+0 (reset zoom)  2) rect X=0 Y=0 W=320 H=120, zoom 6400%\n' +
  '3) Esc (deselect) → judge edge vs line LEFT + RIGHT of viewport → Copy readout\n' +
  '4) select the shape → Copy readout again  5) paste both + Windows display-scale %';

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
  maxWidth: 720,
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
  const [reading, setReading] = useState<ProbeReading | null>(null);
  const [copied, setCopied] = useState<string>('');

  // Live at 2 Hz — rect reads + a few 1-row getImageData calls are cheap.
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
          selection,
        }),
      );
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => {
      window.clearInterval(id);
    };
  }, [outerRef, stageRef, iframeRef, gridRef, zoom, frameOffsetX, selection]);

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
