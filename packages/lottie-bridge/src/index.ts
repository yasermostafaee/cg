// Public surface of @cg/lottie-bridge.
//
// M3.3 shipped the runtime path; M8.2 adds the import-side validator.
// Both live on the root entry — splitting into subpath exports is
// reserved for the day tree-shaking matters more than discoverability.

export { createLottiePlayer } from './runtime.js';
export type { LottieLoopMode, LottiePlayerOptions, LottiePlayerHandle } from './runtime.js';

export { importLottie } from './import.js';
export type { ImportResult, LottieAnimation, RejectedFeature, RejectionCode } from './import.js';
