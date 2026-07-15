// The broadcast runtime payload shared by the live preview iframe, every
// exported `.vcg`, and the single-file HTML export. `cgJs` / `cgJsIife` are the
// bundled `@cg/template-runtime` (built by `scripts/bundle-runtime.mjs` into
// `generated/`); `cgCss` is the minimal broadcast baseline (the same bytes the
// Electron ExportService + preview shipped).
//
// We carry the runtime only as bundled TEXT — never as a module — so its
// `declare global { Window.cg: TemplateRuntime }` augmentation (meant for the
// broadcast frame) doesn't collide with an app's own `window.cg` bridge typing.
// D-125 §D5(c) — `cgJsLottie` / `cgJsLottieIife` are the SEPARATE, minified
// `lottie_light` player bundle (they install `globalThis.__cgLottie`). The
// exporters append them BEFORE the base runtime script ONLY when the scene has a
// Lottie element, so a no-Lottie export never carries the ~168 KB player.
export { cgJs, cgJsIife, cgJsLottie, cgJsLottieIife } from './generated/cg-runtime-bundles.js';

export const cgCss = `*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;background:transparent;overflow:hidden;color:#FFF;font-family:Inter,Vazirmatn,"Noto Sans Arabic",system-ui,sans-serif}
.cg-pending{opacity:0}`;
