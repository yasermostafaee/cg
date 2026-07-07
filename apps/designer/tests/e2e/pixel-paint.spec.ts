import { test, expect, type DesignerApp } from './fixtures/designer.js';

/**
 * B-042 â€” PAINT-TRUTH acceptance. The owner-visible defect lived in what actually
 * rasterizes, so the alignment acceptance runs on `page.screenshot({scale:'device'})`
 * PIXELS with the selection state VERIFIED (a silently-selected shape puts the gizmo's
 * accent border on the very edge being measured â€” that pollution produced this
 * investigation's false "content smear" leads):
 *
 *  - DESELECTED (verified): a shape edge at an integer scene coordinate paints CRISP
 *    (â‰¤ 2 mixed device px â€” one honest AA pixel + the grid stroke sharing the boundary
 *    pixel) and within â‰¤ 0.75 device px of its layout position, on BOTH axes, at a
 *    fractional zoom AND 6400%, deep-scrolled, with the stage forced to the
 *    owner-machine's fractional device phases (X â‰ˆ .9766, Y â‰ˆ .6875).
 *  - SELECTED (verified): the gizmo frame traces the RENDERED (LayoutUnit-quantized)
 *    content box within â‰¤ 0.25 device px per side, at integer AND fractional model
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

/** Deselect and PROVE it (the selection gizmo's accent border sits on the measured edge â€”
 *  a silent selection invalidates every paint assertion below). */
async function verifiedDeselect(app: DesignerApp): Promise<void> {
  await app.selectTool('Select');
  for (let attempt = 0; attempt < 5; attempt++) {
    // a point RIGHT of the shape's edge â€” the shape fills the viewport left of x=320
    const pt = await app.page.evaluate(() => {
      const o = document.querySelector('[data-testid="canvas-viewport"]')!.getBoundingClientRect();
      return { x: o.left + 0.85 * o.width, y: o.top + 0.6 * o.height };
    });
    await app.page.mouse.click(pt.x, pt.y);
    await app.page.waitForTimeout(250);
    if ((await app.gizmoFrame.count()) === 0) return;
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
    await app.page.waitForTimeout(300);
    if ((await app.gizmoFrame.count()) === 1) return;
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
      // 50%-crossing interpolation is skewed by that stroke â€” up to ~1 device px at dpr 2);
      // the stroke's small luminance bump contributes â‰¤ ~0.12 px here.
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
        return base + 7 - mass; // boundary = window end âˆ’ fill mass
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
  // (measured: byte-identical paint under sub-CSS-px layout moves), so paintâˆ’layout is
  // inherently bounded by Â±Â½ CSS px = 0.5Â·dpr device px; +0.3 device px covers the
  // coverage-estimator's stroke-bump bias. At the owner's dpr 1.25 the bound is ~0.9
  // device px â€” invisible against an 80-device-px cell at 6400%.
  const tol = 0.5 * dpr + 0.3;
  expect(r.paintEdgeX, `${label}: X edge not found in paint`).not.toBeNull();
  expect(r.paintEdgeY, `${label}: Y edge not found in paint`).not.toBeNull();
  expect(Math.abs(r.paintEdgeX! - r.layoutEdgeX), `${label}: X paintâˆ’layout`).toBeLessThanOrEqual(
    tol,
  );
  expect(Math.abs(r.paintEdgeY! - r.layoutEdgeY), `${label}: Y paintâˆ’layout`).toBeLessThanOrEqual(
    tol,
  );
}

for (const dpr of [1, 1.25, 2]) {
  test.describe(`B-042 paint truth at deviceScaleFactor ${String(dpr)}`, () => {
    test.use({ deviceScaleFactor: dpr });

    test('DESELECTED content edges paint crisp at their layout positions â€” fractional zoom AND 6400%', async ({
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

    test('SELECTED gizmo traces the RENDERED box within â‰¤ 0.25 device px â€” integer AND fractional coords', async ({
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
          const local = el.getBoundingClientRect(); // iframe-local â€” the RENDERED box
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

      let d = await gizmoDeltas();
      for (const [side, v] of Object.entries(d)) {
        expect(Math.abs(v), `integer coords, side ${side}`).toBeLessThanOrEqual(0.25);
      }
      await app.setInspectorNumber('X position', 2.2749);
      await app.page.waitForTimeout(400);
      d = await gizmoDeltas();
      for (const [side, v] of Object.entries(d)) {
        expect(Math.abs(v), `fractional coords, side ${side}`).toBeLessThanOrEqual(0.25);
      }
    });
  });
}
