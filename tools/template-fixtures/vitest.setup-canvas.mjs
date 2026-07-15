/**
 * D-125 — the fixture build/render tests exercise `@cg/template-runtime`, which now
 * pulls in `lottie_light`. `lottie_light` touches `canvas.getContext('2d')` at MODULE
 * INIT (a transparent-canvas helper), which happy-dom returns null for — crashing the
 * import. We render Lottie with the SVG renderer, so a minimal no-op 2D context is
 * enough. Test-environment-only; real browsers / CasparCG's CEF have a real 2D context.
 */
function makeStub2dContext() {
  const noop = () => undefined;
  const target = {
    measureText: () => ({ width: 0 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  };
  return new Proxy(target, {
    get(t, prop) {
      return prop in t ? t[prop] : noop;
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  });
}

const proto = globalThis.HTMLCanvasElement?.prototype;
if (proto !== undefined) {
  proto.getContext = function getContext(type) {
    return type === '2d' ? makeStub2dContext() : null;
  };
}
