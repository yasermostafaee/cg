// Public surface of @cg/single-file-export — the scene → self-contained-HTML
// export (D-019), the shared image-resolution seam, and the runtime bundle.
// Browser-tier; consumed by the Designer (export feature) and the Runtime
// (B-038 template delivery).

export { ExporterSingleFile } from './exporter-single-file.js';
export type { SingleFileExportOptions, SingleFileResult } from './exporter-single-file.js';

export {
  collectImageElements,
  compositeImageSource,
  imageMimeOf,
  resolveImageAsset,
} from './image-export.js';
export type { ImageAssetSource, ImageAssetLibrary, ImageRef } from './image-export.js';

export { collectLottieElements, resolveLottieAsset, parseLottieJson } from './lottie-export.js';
export type { LottieRef, LottieAssetSource } from './lottie-export.js';

// D-128 Phase 5 — the video-asset seam (collector + resolver), mirroring Lottie.
export { collectVideoElements, resolveVideoAsset, videoMimeOf } from './video-export.js';
export type { VideoRef, VideoAssetSource } from './video-export.js';

export { cgJs, cgJsIife, cgJsLottie, cgJsLottieIife, cgCss } from './cg-runtime.js';
