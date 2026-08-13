import { lottieClipMidpoint, type LottieClipMeta } from '@cg/lottie-bridge';
import type { LottiePhases, VideoPhases } from '@cg/shared-schema';
import { posterTimeMs } from '../features/assets/video-convert-args.js';

/**
 * media-phases-follow-composition / add-time-duration-guard — the CLAIM-LEAST phase slots
 * written when an element ENTERS the follow mode without any authored phases: the stored
 * `introEnd`/`outroStart` are IGNORED under `source: 'composition'` and exist only as the
 * Detach landing, so they carry the two values that claim the least — the shared
 * poster/midpoint (the project's definition of "the representative settled look") and the
 * clip end (a degenerate outro: "no outro claimed").
 *
 * EXTRACTED here because the seed now has TWO writers — the Inspector's "Follow composition"
 * attach buttons (session S) and the add-time duration guard's "Add as backdrop" commit — and
 * a second copy of one seed rule is how the two drift (the session-P extraction rule; asserted
 * by tests that spy the SHARED midpoint call rather than comparing equal numbers).
 */

/** The follow-attach slots for a video with no authored phases (ms). */
export function videoFollowAttachPhases(durationMs: number): VideoPhases {
  return {
    introEnd: posterTimeMs(durationMs),
    outroStart: durationMs,
    source: 'composition',
  };
}

/** The follow-attach slots for a Lottie with no authored phases (animation frames). */
export function lottieFollowAttachPhases(meta: LottieClipMeta): LottiePhases {
  return {
    introEnd: lottieClipMidpoint(meta),
    outroStart: meta.op,
    source: 'composition',
  };
}
