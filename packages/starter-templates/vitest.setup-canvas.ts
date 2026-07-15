/**
 * D-125 — `starter-render.test.ts` renders starters through `@cg/template-runtime`,
 * which now pulls in `lottie_light`. `lottie_light` touches `canvas.getContext('2d')`
 * at MODULE INIT (a transparent-canvas helper), which happy-dom returns null for —
 * crashing the import. We render Lottie with the SVG renderer, so a minimal no-op 2D
 * context is enough. Test-environment-only; real browsers / CasparCG's CEF have a real
 * 2D context. No-op under the `node` environment (no HTMLCanvasElement).
 */
function makeStub2dContext(): unknown {
  const noop = (): undefined => undefined;
  const target: Record<string, unknown> = {
    measureText: () => ({ width: 0 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  };
  return new Proxy(target, {
    get(t, prop: string): unknown {
      return prop in t ? t[prop] : noop;
    },
    set(t, prop: string, value: unknown): boolean {
      t[prop] = value;
      return true;
    },
  });
}

const proto = globalThis.HTMLCanvasElement?.prototype;
if (proto !== undefined) {
  proto.getContext = function getContext(type: string): unknown {
    return type === '2d' ? makeStub2dContext() : null;
  } as typeof proto.getContext;
}
