import type { LottiePhases, VideoPhases } from '@cg/shared-schema';

/**
 * media-phases-follow-composition / add-time-duration-guard — the phases written when an
 * element ENTERS follow mode without any authored phases.
 *
 * ⭐ SESSION Y — the source ALONE, no seeded numbers. The pre-Y seeds
 * (`introEnd: midpoint, outroStart: clipEnd`) were a STORED LIE: fields that described no
 * behaviour (the old rule ignored them) and, under the corrected rule — where an authored
 * value GOVERNS the window — they would have masqueraded as intent. Absent fields mean
 * "derive everything from the composition and the clip's ending", which is exactly what
 * attaching follow asks for; Detach bakes the CURRENTLY-DERIVED window into manual values
 * (truthful by construction), so nothing needs a landing slot here. Existing scenes that
 * carry the old seeds derive identically through the seed-signature shims
 * (`videoFollowClipFacts` / `lottieFollowClipFacts`).
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
