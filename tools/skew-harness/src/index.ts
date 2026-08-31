export {
  changeSeries,
  distribution,
  firstChangeIndex,
  meanAbsDiff,
  splitFrames,
  NOISE_MULTIPLIER,
  THRESHOLD_FLOOR,
  type ChangePoint,
  type Distribution,
} from './analyse.js';
export {
  connectAmcp,
  framePeriodMs,
  readChannelMode,
  type AmcpClient,
  type ChannelMode,
} from './amcp.js';
export {
  describeRecording,
  ensureSourceClips,
  extractProbe,
  ffmpegBinaries,
  probeFrameBytes,
  SOURCE_CLIPS,
} from './ffmpeg.js';
export {
  BANNER_COLUMN_FIXTURE,
  BANNER_RECTS,
  COLUMN_RECTS,
  GHAB_BOXES_RECTS,
  GHAB_FIXTURE,
  GHAB_FULL_RECTS,
  GHAB_PROBE_A,
  GHAB_PROBE_B,
  GHAB_SEATED_FIXTURE,
  GHAB_SEATED_FULL_RECTS,
  LOOK_BANNER,
  LOOK_COLUMN,
  LOOK_GHAB_BOXES,
  LOOK_GHAB_FULL,
  PLATE_A,
  PLATE_B,
  PROBE_EDGE_CLEARANCE,
  probePlacementIssues,
  SKEW_FIXTURES,
  SKEW_PROBE_A,
  SKEW_PROBE_B,
  SKEW_SCENE,
  type Rect,
  type SkewFixture,
} from './geometry.js';
export { buildSkewScene, SKEW_PLATES } from './scene.js';
export { buildTemplateHtml, bundleTemplateRuntime } from './template.js';
export {
  measureSkew,
  DEFAULT_OPTIONS,
  type RunResult,
  type SkewOptions,
  type SkewReport,
} from './run.js';
export {
  MOVING_VERBS,
  openWireTap,
  sentCommands,
  windowContainsPlay,
  type TappedLine,
  type WireTap,
} from './wire-tap.js';
