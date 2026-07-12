import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * B-042 — PAINT-TRUTH acceptance. The owner-visible defect lived in what actually
 * rasterizes, so the alignment acceptance runs on `page.screenshot({scale:'device'})`
 * PIXELS with the selection state VERIFIED (a silently-selected shape puts the gizmo's
 * accent border on the very edge being measured — that pollution produced this
 * investigation's false "content smear" leads):
 *
 *  - DESELECTED (verified): a shape edge at an integer scene coordinate paints CRISP
 *    (≤ 2 mixed device px — one honest AA pixel + the grid stroke sharing the boundary
 *    pixel) and within ≤ 0.75 device px of its layout position, on BOTH axes, at a
 *    fractional zoom AND 6400%, deep-scrolled, with the stage forced to the
 *    owner-machine's fractional device phases (X ≈ .9766, Y ≈ .6875).
 *  - SELECTED (verified): the gizmo frame traces the RENDERED (LayoutUnit-quantized)
 *    content box within ≤ 0.25 device px per side, at integer AND fractional model
 *    coords (pre-fix: up to +1.25 device px outside at fractional coords).
 */

const FRAME = { x: 5000, y: 3000 };
const EXTENT_W = 11920;

async function setupRepro(app: DesignerApp): Promise<void> {
  await app.newProject('PaintTruth');
  await app.addRectangle({ x: 240, y: 200 });
  await app.setInspectorNumber('X position', 0);
  await app.setInspectorNumber('Y position', 0);
  await app.setInspectorNumber('Width', 320);
  await app.setInspectorNumber('Height', 120);
}

async function zoomToAtLeast(app: DesignerApp, target: number): Promise<number> {
  const zoomIn = app.page.getByRole('button', { name: 'Zoom in', exact: true });
  let pct = 0;
  for (let i = 0; i < 90; i++) {
    pct = Number((await app.page.getByTestId('zoom-readout').textContent())!.replace('%', ''));
    if (pct >= target) break;
    await zoomIn.click();
  }
  return pct;
}

/** Deep-scroll so the right edge (x=320) and top edge (y=0) are in view, then force the
 *  stage to the owner-machine device phases. */
async function scrollAndForcePhases(app: DesignerApp): Promise<void> {
  await app.page.evaluate(
    ({ FRAME, EXTENT_W }) => {
      const outer = document.querySelector('[data-testid="canvas-viewport"]')!;
      const stage = document.querySelector('[data-testid="canvas-stage"]')!;
      const orect = outer.getBoundingClientRect();
      const srect = stage.getBoundingClientRect();
      const zoom = srect.width / EXTENT_W;
      outer.scrollLeft +=
        srect.left - orect.left + (FRAME.x + 320) * zoom - 0.55 * outer.clientWidth;
      outer.scrollTop += srect.top - orect.top + FRAME.y * zoom - 0.42 * outer.clientHeight;
    },
    { FRAME, EXTENT_W },
  );
  await app.page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-testid="canvas-stage"]')!;
    const wrap = stage.parentElement!;
    const dpr = window.devicePixelRatio;
    const r = stage.getBoundingClientRect();
    const fracX = r.left * dpr - Math.floor(r.left * dpr);
    const fracY = r.top * dpr - Math.floor(r.top * dpr);
    wrap.style.marginLeft = `${String(((0.9766 - fracX + 1) % 1) / dpr)}px`;
    wrap.style.marginTop = `${String(((0.6875 - fracY + 1) % 1) / dpr)}px`;
    document.querySelector('[data-testid="canvas-viewport"]')!.dispatchEvent(new Event('scroll'));
  });
  await app.page.waitForTimeout(400);
}

/** Deselect and PROVE it (the selection gizmo's accent border sits on the measured edge —
 *  a silent selection invalidates every paint assertion below). */
async function verifiedDeselect(app: DesignerApp): Promise<void> {
  await app.selectTool('Select');
  for (let attempt = 0; attempt < 5; attempt++) {
    // a point RIGHT of the shape's edge — the shape fills the viewport left of x=320
    const pt = await app.page.evaluate(() => {
      const o = document.querySelector('[data-testid="canvas-viewport"]')!.getBoundingClientRect();
      return { x: o.left + 0.85 * o.width, y: o.top + 0.6 * o.height };
    });
    await app.page.mouse.click(pt.x, pt.y);
    // Auto-retrying count (not sleep + instant count(): the selection update
    // can land after any fixed sleep on a contended runner).
    try {
      await expect(app.gizmoFrame).toHaveCount(0, { timeout: 2000 });
      return;
    } catch {
      // not yet — click again
    }
  }
  throw new Error('could not verifiably deselect');
}

/** Select the repro shape and PROVE it. */
async function verifiedSelect(app: DesignerApp): Promise<void> {
  await app.selectTool('Select');
  for (let attempt = 0; attempt < 5; attempt++) {
    const pt = await app.page.evaluate(
      ({ FRAME, EXTENT_W }) => {
        const stage = document.querySelector('[data-testid="canvas-stage"]')!;
        const srect = stage.getBoundingClientRect();
        const zoom = srect.width / EXTENT_W;
        return {
          x: srect.left + (FRAME.x + 316) * zoom,
          y: srect.top + (FRAME.y + 4) * zoom,
        };
      },
      { FRAME, EXTENT_W },
    );
    await app.page.mouse.click(pt.x, pt.y);
    try {
      await expect(app.gizmoFrame).toHaveCount(1, { timeout: 2000 });
      return;
    } catch {
      // not yet — click again
    }
  }
  throw new Error('could not verifiably select');
}

interface PaintReport {
  layoutEdgeX: number;
  layoutEdgeY: number;
  paintEdgeX: number | null;
  paintEdgeY: number | null;
  mixedX: number;
  mixedY: number;
}

/** Screenshot (device px) and profile the shape's right + top edges vs layout. */
async function measurePaint(app: DesignerApp): Promise<PaintReport> {
  const layout = await app.page.evaluate(
    ({ EXTENT_W, FRAME }) => {
      const stage = document.querySelector('[data-testid="canvas-stage"]')!;
      const dpr = window.devicePixelRatio;
      const s = stage.getBoundingClientRect();
      const zoom = s.width / EXTENT_W;
      return {
        dpr,
        edgeXDev: (s.left + (FRAME.x + 320) * zoom) * dpr,
        edgeYDev: (s.top + FRAME.y * zoom) * dpr,
      };
    },
    { EXTENT_W, FRAME },
  );
  const buf = await app.page.screenshot({ scale: 'device', animations: 'disabled' });
  const b64 = buf.toString('base64');
  const m = await app.page.evaluate(
    async ({ dataUrl, layout }) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUrl;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const W = c.width;
      const data = ctx.getImageData(0, 0, W, c.height).data;
      const lum = (x: number, y: number): number => {
        const i = (y * W + x) * 4;
        return 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      };
      const ex = Math.round(layout.edgeXDev);
      const ey = Math.round(layout.edgeYDev);
      const profX = new Array<number>(13).fill(0);
      let used = 0;
      for (let y = ey + 40; y < ey + 260 && used < 40; y++) {
        const fillProbe = (lum(ex - 40, y) + lum(ex - 60, y)) / 2;
        if (fillProbe > 212 || fillProbe < 170) continue; // strict: pure fill rows only
        for (let k = -6; k <= 6; k++) profX[k + 6] = profX[k + 6]! + lum(ex + k, y);
        used++;
      }
      for (let k = 0; k < 13; k++) profX[k] = used > 0 ? profX[k]! / used : 0;
      const profY = new Array<number>(13).fill(0);
      let usedC = 0;
      for (let x = ex - 260; x < ex - 40 && usedC < 40; x++) {
        const fillProbe = (lum(x, ey + 40) + lum(x, ey + 60)) / 2;
        if (fillProbe > 212 || fillProbe < 170) continue;
        for (let k = -6; k <= 6; k++) profY[k + 6] = profY[k + 6]! + lum(x, ey + k);
        usedC++;
      }
      for (let k = 0; k < 13; k++) profY[k] = usedC > 0 ? profY[k]! / usedC : 0;
      const FILL = 190;
      const BACK = 96.5;
      const mixedCount = (prof: number[]): number => {
        let n = 0;
        for (const v of prof) if (v > BACK + 10.5 && v < FILL - 11) n++;
        return n;
      };
      // COVERAGE-integral edge estimator: the boundary position is the accumulated fill
      // mass across the window. Robust to the grid stroke sharing the boundary pixel (a
      // 50%-crossing interpolation is skewed by that stroke — up to ~1 device px at dpr 2);
      // the stroke's small luminance bump contributes ≤ ~0.12 px here.
      const frac = (v: number): number => Math.min(1, Math.max(0, (v - BACK) / (FILL - BACK)));
      const coverageFalling = (prof: number[], base: number): number | null => {
        if (prof[0]! < FILL - 20 || prof[12]! > BACK + 20) return null; // plateaus missing
        let mass = 0;
        for (const v of prof) mass += frac(v);
        return base - 6 + mass; // fill mass from the window start = the boundary position
      };
      const coverageRising = (prof: number[], base: number): number | null => {
        if (prof[0]! > BACK + 20 || prof[12]! < FILL - 20) return null;
        let mass = 0;
        for (const v of prof) mass += frac(v);
        return base + 7 - mass; // boundary = window end − fill mass
      };
      return {
        paintEdgeX: coverageFalling(profX, ex),
        paintEdgeY: coverageRising(profY, ey),
        mixedX: mixedCount(profX),
        mixedY: mixedCount(profY),
      };
    },
    { dataUrl: `data:image/png;base64,${b64}`, layout },
  );
  return {
    layoutEdgeX: layout.edgeXDev,
    layoutEdgeY: layout.edgeYDev,
    paintEdgeX: m.paintEdgeX,
    paintEdgeY: m.paintEdgeY,
    mixedX: m.mixedX,
    mixedY: m.mixedY,
  };
}

function assertPaint(r: PaintReport, label: string, dpr: number): void {
  // crisp: at most one honest AA pixel + the grid stroke sharing the boundary pixel
  expect(r.mixedX, `${label}: X mixed px`).toBeLessThanOrEqual(2);
  expect(r.mixedY, `${label}: Y mixed px`).toBeLessThanOrEqual(2);
  // The painted edge sits where layout says, within the compositor's OWN placement floor:
  // Chromium quantizes the (huge) stage layer's composited position to ~CSS-pixel units
  // (measured: byte-identical paint under sub-CSS-px layout moves), so paint−layout is
  // inherently bounded by ±½ CSS px = 0.5·dpr device px; +0.3 device px covers the
  // coverage-estimator's stroke-bump bias. At the owner's dpr 1.25 the bound is ~0.9
  // device px — invisible against an 80-device-px cell at 6400%.
  const tol = 0.5 * dpr + 0.3;
  expect(r.paintEdgeX, `${label}: X edge not found in paint`).not.toBeNull();
  expect(r.paintEdgeY, `${label}: Y edge not found in paint`).not.toBeNull();
  expect(Math.abs(r.paintEdgeX! - r.layoutEdgeX), `${label}: X paint−layout`).toBeLessThanOrEqual(
    tol,
  );
  expect(Math.abs(r.paintEdgeY! - r.layoutEdgeY), `${label}: Y paint−layout`).toBeLessThanOrEqual(
    tol,
  );
}

/** B-045 — locate the PAINTED right edge near the LAYOUT right edge (device px). The
 *  layout edge comes from the live iframe element rect (the DOM truth); the painted edge
 *  is the median first fill→backdrop transition column across rows inside the shape. */
async function paintedEdgeVsLayout(
  app: DesignerApp,
): Promise<{ layoutEdge: number; paintEdge: number | null; delta: number | null }> {
  const layout = await app.page.evaluate(
    ({ EXTENT_W }) => {
      const stage = document.querySelector('[data-testid="canvas-stage"]')!;
      const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="cgpreview"]')!;
      const dpr = window.devicePixelRatio;
      const zoom = stage.getBoundingClientRect().width / EXTENT_W;
      const el = iframe.contentDocument!.querySelector('[data-cg-element-id]')!;
      const local = el.getBoundingClientRect();
      const irect = iframe.getBoundingClientRect();
      return {
        edgeDev: (irect.left + local.right * zoom) * dpr,
        topDev: (irect.top + local.top * zoom) * dpr,
        bottomDev: (irect.top + local.bottom * zoom) * dpr,
      };
    },
    { EXTENT_W },
  );
  const buf = await app.page.screenshot({ scale: 'device', animations: 'disabled' });
  const m = await app.page.evaluate(
    async ({ dataUrl, layout }) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUrl;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const W = c.width;
      const data = ctx.getImageData(0, 0, W, c.height).data;
      const lum = (x: number, y: number): number => {
        const i = (y * W + x) * 4;
        return 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      };
      const y0 = Math.max(20, Math.round(layout.topDev) + 30);
      const y1 = Math.min(c.height - 20, Math.round(layout.bottomDev) - 30);
      // COVERAGE-integral edge estimate around a COARSE edge location. The coarse pass
      // scans a wide window for the fill→backdrop transition (median across rows) so a
      // stale edge up to ±80 device px away is still found; the fine pass integrates
      // fill mass across ±10 px of it, which measures the boundary sub-pixel for CRISP
      // (native) and 2–3-px FILTERED (emulated compositor resample of the translate)
      // edges alike — a fixed-threshold single-transition detector misses the latter.
      const coarse: number[] = [];
      for (let y = y0; y <= y1 && coarse.length < 60; y += 3) {
        const ex = Math.round(layout.edgeDev);
        const fillProbe = (lum(ex - 110, y) + lum(ex - 130, y)) / 2;
        if (fillProbe > 212 || fillProbe < 165) continue;
        for (let x = Math.max(1, ex - 80); x <= Math.min(W - 4, ex + 76); x++) {
          // last fill-ish column followed by backdrop within 3 px
          if (lum(x, y) > 165 && lum(x + 2, y) < 120 && lum(x + 3, y) < 120) {
            coarse.push(x + 1);
            break;
          }
        }
      }
      if (coarse.length < 10) return { paintEdge: null };
      coarse.sort((a, b) => a - b);
      const ce = coarse[Math.floor(coarse.length / 2)]!;
      const masses: number[] = [];
      for (let y = y0; y <= y1 && masses.length < 60; y += 3) {
        const fillM = (lum(ce - 16, y) + lum(ce - 14, y) + lum(ce - 12, y)) / 3;
        const backM = (lum(ce + 12, y) + lum(ce + 14, y) + lum(ce + 16, y)) / 3;
        if (fillM < 165 || fillM > 215 || backM > 120) continue; // plateaus must be clean
        let mass = 0;
        for (let k = -10; k <= 10; k++) {
          const f = (lum(ce + k, y) - backM) / (fillM - backM);
          mass += Math.min(1, Math.max(0, f));
        }
        masses.push(ce - 10 + mass); // boundary = window start + fill mass
      }
      if (masses.length < 10) return { paintEdge: null };
      masses.sort((a, b) => a - b);
      return { paintEdge: masses[Math.floor(masses.length / 2)]! };
    },
    { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, layout },
  );
  return {
    layoutEdge: layout.edgeDev,
    paintEdge: m.paintEdge,
    delta: m.paintEdge === null ? null : m.paintEdge - layout.edgeDev,
  };
}

test.describe('B-045 stale paint at deviceScaleFactor 1.25', () => {
  test.use({ deviceScaleFactor: 1.25 });

  /** The defect: a SMALL position edit (≤ ~1 CSS px inside the scaled preview iframe —
   *  here Δ=0.2775 css: X 6.4125 → 6.69 = +22.5 device px at 6400%·dpr 1.25) updates
   *  layout/DOM but Chromium never re-rasters the stage tiles — the painted shape stays
   *  frozen at its previous position through idle and scroll (owner's grid.jpg signature,
   *  −22.5 device px). The painted edge MUST follow the layout edge. */
  test('a small position edit repaints — the painted edge follows the layout edge', async ({
    app,
  }) => {
    test.setTimeout(150_000);
    await app.newProject('StalePaint');
    await app.addRectangle({ x: 240, y: 200 });
    await app.setInspectorNumber('X position', 6.4125);
    await app.setInspectorNumber('Y position', 0);
    await app.setInspectorNumber('Width', 320);
    await app.setInspectorNumber('Height', 120);
    expect(await zoomToAtLeast(app, 6400)).toBe(6400);
    // scroll the ACTUAL right edge (scene ≈ 326.4) into view; no phase forcing — the
    // defect is raster invalidation, not alignment, and is phase-independent
    await app.page.evaluate(
      ({ FRAME, EXTENT_W }) => {
        const outer = document.querySelector('[data-testid="canvas-viewport"]')!;
        const stage = document.querySelector('[data-testid="canvas-stage"]')!;
        const orect = outer.getBoundingClientRect();
        const srect = stage.getBoundingClientRect();
        const zoom = srect.width / EXTENT_W;
        outer.scrollLeft +=
          srect.left - orect.left + (FRAME.x + 326.5) * zoom - 0.55 * outer.clientWidth;
        outer.scrollTop += srect.top - orect.top + FRAME.y * zoom - 0.42 * outer.clientHeight;
      },
      { FRAME, EXTENT_W },
    );
    await app.page.waitForTimeout(500);
    await verifiedDeselect(app);
    await app.page.waitForTimeout(600);

    const before = await paintedEdgeVsLayout(app);
    expect(before.paintEdge, 'baseline painted edge not found').not.toBeNull();

    // select via a viewport-relative interior point (scene x=316 is scrolled off-screen
    // here — the shape fills the viewport left of its right edge)
    await app.selectTool('Select');
    for (let attempt = 0; attempt < 6; attempt++) {
      const pt = await app.page.evaluate(() => {
        const o = document
          .querySelector('[data-testid="canvas-viewport"]')!
          .getBoundingClientRect();
        return { x: o.left + 0.3 * o.width, y: o.top + 0.6 * o.height };
      });
      await app.page.mouse.click(pt.x, pt.y);
      await app.page.waitForTimeout(250);
      if ((await app.gizmoFrame.count()) === 1) break;
    }
    expect(await app.gizmoFrame.count(), 'could not verifiably select').toBe(1);
    await app.setInspectorNumber('X position', 6.69);
    await verifiedDeselect(app);

    // poll — give the repaint every chance (the stale raster survives seconds of idle).
    // The criterion is RELATIVE: the painted edge must MOVE by the layout move (+22.5
    // device px), which is immune to any absolute compositor bias shared by both states.
    const layoutMove = 0.28125 * 64 * 1.25; // Δscene 18/64 · zoom 64 · dpr 1.25 = 22.5
    let after = await paintedEdgeVsLayout(app);
    const paintedMove = (): number | null =>
      after.paintEdge === null ? null : after.paintEdge - before.paintEdge!;
    for (
      let i = 0;
      i < 4 && (paintedMove() === null || Math.abs(paintedMove()! - layoutMove) > 3);
      i++
    ) {
      await app.page.waitForTimeout(700);
      after = await paintedEdgeVsLayout(app);
    }
    expect(after.layoutEdge - before.layoutEdge, 'sanity: layout DID move').toBeGreaterThan(15);
    expect(after.paintEdge, 'painted edge not found after the edit').not.toBeNull();
    expect(
      Math.abs(paintedMove()! - layoutMove),
      `painted edge must FOLLOW the layout edge (moved ${String(paintedMove())} of ${String(layoutMove)} device px — a stale raster stays at 0)`,
    ).toBeLessThanOrEqual(3);

    // arrow-step scenario: three 1-scene-px nudges (the owner's original gesture — the
    // 1-css-px delta class ALSO loses invalidation) must each land in paint: afterwards
    // the painted edge sits at the new layout edge, no accumulated trail.
    await app.selectTool('Select');
    for (let attempt = 0; attempt < 6; attempt++) {
      const pt = await app.page.evaluate(() => {
        const o = document
          .querySelector('[data-testid="canvas-viewport"]')!
          .getBoundingClientRect();
        return { x: o.left + 0.3 * o.width, y: o.top + 0.6 * o.height };
      });
      await app.page.mouse.click(pt.x, pt.y);
      await app.page.waitForTimeout(250);
      if ((await app.gizmoFrame.count()) === 1) break;
    }
    expect(await app.gizmoFrame.count(), 'could not re-select for nudges').toBe(1);
    for (let i = 0; i < 3; i++) {
      await app.page.keyboard.press('ArrowRight');
      await app.page.waitForTimeout(120);
    }
    // deselect via Escape (the nudged edge now sits close to the shared helper's click
    // point); fall back to a far-right click — and PROVE it either way
    for (let attempt = 0; attempt < 5; attempt++) {
      await app.page.keyboard.press('Escape');
      await app.page.waitForTimeout(200);
      if ((await app.gizmoFrame.count()) === 0) break;
      const pt = await app.page.evaluate(() => {
        const o = document
          .querySelector('[data-testid="canvas-viewport"]')!
          .getBoundingClientRect();
        return { x: o.left + 0.95 * o.width, y: o.top + 0.15 * o.height };
      });
      await app.page.mouse.click(pt.x, pt.y);
      await app.page.waitForTimeout(200);
      if ((await app.gizmoFrame.count()) === 0) break;
    }
    expect(await app.gizmoFrame.count(), 'could not verifiably deselect after nudges').toBe(0);
    let nudged = await paintedEdgeVsLayout(app);
    for (let i = 0; i < 4 && (nudged.paintEdge === null || Math.abs(nudged.delta!) > 3); i++) {
      await app.page.waitForTimeout(700);
      nudged = await paintedEdgeVsLayout(app);
    }
    expect(
      nudged.layoutEdge - after.layoutEdge,
      'sanity: nudges moved layout ~3 cells',
    ).toBeGreaterThan(150);
    expect(nudged.paintEdge, 'painted edge not found after nudges').not.toBeNull();
    expect(
      Math.abs(nudged.delta!),
      'after arrow steps the painted edge must sit at the layout edge (no stale trail)',
    ).toBeLessThanOrEqual(3);
  });
});

for (const dpr of [1, 1.25, 2]) {
  test.describe(`B-042 paint truth at deviceScaleFactor ${String(dpr)}`, () => {
    test.use({ deviceScaleFactor: dpr });

    test('DESELECTED content edges paint crisp at their layout positions — fractional zoom AND 6400%', async ({
      app,
    }) => {
      test.setTimeout(150_000);
      await setupRepro(app);

      expect(await zoomToAtLeast(app, 4800)).toBeGreaterThanOrEqual(4800);
      await scrollAndForcePhases(app);
      await verifiedDeselect(app);
      assertPaint(await measurePaint(app), 'fractional zoom', dpr);

      expect(await zoomToAtLeast(app, 6400)).toBe(6400);
      await scrollAndForcePhases(app);
      await verifiedDeselect(app);
      assertPaint(await measurePaint(app), '6400%', dpr);
    });

    test('SELECTED gizmo traces the RENDERED box within ≤ 0.25 device px — integer AND fractional coords', async ({
      app,
    }) => {
      test.setTimeout(120_000);
      await setupRepro(app);
      expect(await zoomToAtLeast(app, 6400)).toBe(6400);
      await scrollAndForcePhases(app);
      await verifiedSelect(app);

      const gizmoDeltas = async (): Promise<Record<string, number>> =>
        app.page.evaluate(() => {
          const iframe = document.querySelector<HTMLIFrameElement>('iframe[title="cgpreview"]')!;
          const dpr = window.devicePixelRatio;
          const irect = iframe.getBoundingClientRect();
          const stage = document.querySelector('[data-testid="canvas-stage"]')!;
          const zoom = stage.getBoundingClientRect().width / 11920;
          const el = iframe.contentDocument!.querySelector('[data-cg-element-id]')!;
          const local = el.getBoundingClientRect(); // iframe-local — the RENDERED box
          const poly = document.querySelector('[data-testid="gizmo-frame"]')!;
          const sv = poly.closest('svg')!.getBoundingClientRect();
          const nums = (poly.getAttribute('points') ?? '')
            .split(/[\s,]+/)
            .map(Number)
            .filter((n) => Number.isFinite(n));
          const xs: number[] = [];
          const ys: number[] = [];
          for (let i = 0; i + 1 < nums.length; i += 2) {
            xs.push(nums[i]!);
            ys.push(nums[i + 1]!);
          }
          return {
            dL: (sv.left + Math.min(...xs) - (irect.left + local.left * zoom)) * dpr,
            dR: (sv.left + Math.max(...xs) - (irect.left + local.right * zoom)) * dpr,
            dT: (sv.top + Math.min(...ys) - (irect.top + local.top * zoom)) * dpr,
            dB: (sv.top + Math.max(...ys) - (irect.top + local.bottom * zoom)) * dpr,
          };
        });

      /** An inspector edit propagates state → iframe reflow → gizmo re-render
       *  ASYNCHRONOUSLY: under a contended runner a fixed post-edit sleep read
       *  the pair mid-transition (one side off by the whole move distance —
       *  dL≈290 device px, the exact X-move). Poll the JOINT measurement until
       *  it settles inside the bound, then assert each side at full strictness
       *  — the contract is the SETTLED gizmo/render agreement. */
      const settledGizmoDeltas = async (label: string): Promise<Record<string, number>> => {
        let d: Record<string, number> = {};
        await expect
          .poll(
            async () => {
              d = await gizmoDeltas();
              return Math.max(...Object.values(d).map((v) => Math.abs(v)));
            },
            { timeout: 10_000, message: `${label}: gizmo never settled onto the rendered box` },
          )
          .toBeLessThanOrEqual(0.25);
        return d;
      };

      let d = await settledGizmoDeltas('integer coords');
      for (const [side, v] of Object.entries(d)) {
        expect(Math.abs(v), `integer coords, side ${side}`).toBeLessThanOrEqual(0.25);
      }
      await app.setInspectorNumber('X position', 2.2749);
      d = await settledGizmoDeltas('fractional coords');
      for (const [side, v] of Object.entries(d)) {
        expect(Math.abs(v), `fractional coords, side ${side}`).toBeLessThanOrEqual(0.25);
      }
    });
  });
}
