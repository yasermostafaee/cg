// The broadcast runtime payload injected into both the live preview iframe
// and every exported .vcg. `cgJs` is the bundled @cg/template-runtime (built
// by scripts/bundle-runtime.mjs into src/generated/, imported here as raw
// text); `cgCss` is the minimal broadcast baseline (same bytes the Electron
// ExportService + preview shipped).
//
// We import the runtime only as bundled text — never as a module — so its
// `declare global { Window.cg: TemplateRuntime }` augmentation (meant for the
// broadcast frame) doesn't collide with the Designer's own `window.cg`
// bridge typing.
import cgRuntimeSource from '../generated/cg-runtime.js?raw';
// Classic IIFE build of the same runtime (exposes `window.CG`), for the
// file://-safe single-file CasparCG export (D-019). ESM can't load over
// file:// in CEF, so the export inlines this instead of `cgJs`.
import cgRuntimeIifeSource from '../generated/cg-runtime.iife.js?raw';

export const cgJs: string = cgRuntimeSource;

/** IIFE runtime bundle (`var CG = …`) for the single-file export. */
export const cgJsIife: string = cgRuntimeIifeSource;

export const cgCss = `*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;background:transparent;overflow:hidden;color:#FFF;font-family:Inter,Vazirmatn,"Noto Sans Arabic",system-ui,sans-serif}
.cg-pending{opacity:0}`;
