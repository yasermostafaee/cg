/**
 * D-125 — some designer tests import UI that transitively pulls in `lottie_light`
 * (e.g. `ProjectAssetsPanel` → `@cg/lottie-bridge` → the player, for import-time
 * allowlist validation). `lottie_light` touches `canvas.getContext('2d')` at MODULE
 * INIT (a transparent-canvas helper), which jsdom rejects ("Not implemented") and
 * happy-dom returns null for — either way crashing the import. We render Lottie with
 * the SVG renderer, so a minimal no-op 2D context is enough. This is
 * test-environment-only; real browsers / CasparCG's CEF provide a real 2D context.
 *
 * Guarded on `HTMLCanvasElement` so the default `node` environment (no DOM) is a
 * no-op — only DOM-environment tests (`@vitest-environment jsdom`/`happy-dom`) stub.
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
