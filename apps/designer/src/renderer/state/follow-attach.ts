import type { LottiePhases, VideoPhases } from '@cg/shared-schema';

/**
 * media-phases-follow-composition / add-time-duration-guard — the phases written when an
 * element ENTERS follow mode without any authored phases.
 *
 * D-176 — the source ALONE, no seeded numbers. Composition-owned Follow ignores every stored
 * media phase and derives intro/middle/outro from composition anchors plus clip duration.
 * Existing scenes may still carry old seeds; the runtime ignores them while source is
 * `composition`, and Detach bakes the current derived boundaries back into manual values.
 *
 * EXTRACTED because the attach has TWO writers — the Inspector's "Follow composition" buttons
 * and the duration guard's "Add as backdrop" commit — and a second copy of one rule is how the
 * two drift (the session-P extraction rule).
 */

/** The follow-attach phases for a video with no authored phases: the source, nothing else. */
export function videoFollowAttachPhases(): VideoPhases {
  return { source: 'composition' };
}

/** The follow-attach phases for a Lottie with no authored phases: the source, nothing else. */
export function lottieFollowAttachPhases(): LottiePhases {
  return { source: 'composition' };
}
