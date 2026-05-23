// Public surface of @cg/lottie-bridge.
//
// M3.3 ships the runtime path only. The import path (validation +
// feature allowlist) lands in M8 alongside the Designer's asset
// pipeline. When it does, this entry will split into
// `./runtime` and `./import` subpath exports.

export { createLottiePlayer } from './runtime.js';
export type { LottieLoopMode, LottiePlayerOptions, LottiePlayerHandle } from './runtime.js';
