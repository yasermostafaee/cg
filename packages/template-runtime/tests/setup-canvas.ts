/**
 * D-125 — happy-dom has no Canvas 2D implementation, but `lottie_light` (pulled in
 * by `runtime.ts` via `@cg/lottie-bridge`) touches `canvas.getContext('2d')` at
 * MODULE INIT (a transparent-canvas helper), so merely importing `createRuntime`
 * throws `Cannot set properties of null (setting 'fillStyle')` under happy-dom. We
 * render with the SVG renderer, so a minimal no-op 2D context is enough to let the
 * player module load + mount in tests. Real browsers / CasparCG's CEF provide a real
 * 2D context, so this shim is test-environment-only.
 */
function makeStub2dContext(): unknown {
  const noop = (): undefined => undefined;
  const target: Record<string, unknown> = {
    measureText: () => ({ width: 0 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  };
  // A Proxy so any property reads back as a callable no-op (methods) and any set
  // (fillStyle, strokeStyle, …) is stored — covers whatever lottie-web touches.
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
