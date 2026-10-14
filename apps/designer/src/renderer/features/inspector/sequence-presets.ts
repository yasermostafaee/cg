import type { SequenceElement } from '@cg/shared-schema';

/**
 * D-029 — named transition presets over the sequence's DECOMPOSED fields
 * (IN edge / OUT edge / timing). A preset is just VALUES: Push ×4 moves both
 * items together (simultaneous), Slide ×4 plays out-then-in (sequential),
 * Crossfade dissolves (fade/fade simultaneous, `D-163`), Fade out, fade in
 * fades through (fade/fade sequential), Hide-show is the none/none hard swap. The select shows 'custom' when the
 * current combination matches no preset (the EasingEditor Preset pattern) —
 * every IN × OUT × timing combination stays authorable through the three
 * field selects. Pure module so the mapping is unit-testable.
 */

export type SequenceTransitionFields = Pick<
  SequenceElement,
  'transitionIn' | 'transitionOut' | 'transitionTiming'
>;

export const SEQUENCE_TRANSITION_PRESETS: Record<string, SequenceTransitionFields> = {
  // `D-163` — Crossfade: the next item dissolves over the current one (a true mix, never dimmed
  // mid-way) — the smooth page turn. Fade out, fade in: the current item fades away first.
  crossfade: { transitionIn: 'fade', transitionOut: 'fade', transitionTiming: 'simultaneous' },
  'fade-through': { transitionIn: 'fade', transitionOut: 'fade', transitionTiming: 'sequential' },
  // The current item fades out where it is; the next fades in while drifting a short way into
  // place (a nudge, not an entrance). From the right suits RTL text — it moves with the reading.
  'crossfade-drift-right': {
    transitionIn: 'fade-right',
    transitionOut: 'fade',
    transitionTiming: 'simultaneous',
  },
  'crossfade-drift-left': {
    transitionIn: 'fade-left',
    transitionOut: 'fade',
    transitionTiming: 'simultaneous',
  },
  // …and up or down (the owner: the sideways drift was an example; a vertical one is needed too).
  'crossfade-drift-up': {
    transitionIn: 'fade-bottom',
    transitionOut: 'fade',
    transitionTiming: 'simultaneous',
  },
  'crossfade-drift-down': {
    transitionIn: 'fade-top',
    transitionOut: 'fade',
    transitionTiming: 'simultaneous',
  },
  // Push: the incoming item shoves the outgoing one ahead of it.
  'push-up': { transitionIn: 'bottom', transitionOut: 'top', transitionTiming: 'simultaneous' },
  'push-down': { transitionIn: 'top', transitionOut: 'bottom', transitionTiming: 'simultaneous' },
  'push-left': { transitionIn: 'right', transitionOut: 'left', transitionTiming: 'simultaneous' },
  'push-right': { transitionIn: 'left', transitionOut: 'right', transitionTiming: 'simultaneous' },
  // Slide: the outgoing item fully exits before the incoming enters.
  'slide-up': { transitionIn: 'bottom', transitionOut: 'top', transitionTiming: 'sequential' },
  'slide-down': { transitionIn: 'top', transitionOut: 'bottom', transitionTiming: 'sequential' },
  'slide-left': { transitionIn: 'right', transitionOut: 'left', transitionTiming: 'sequential' },
  'slide-right': { transitionIn: 'left', transitionOut: 'right', transitionTiming: 'sequential' },
  // Hide-show: both sides cut instantly (timing is moot with two `none`s).
  'hide-show': { transitionIn: 'none', transitionOut: 'none', transitionTiming: 'simultaneous' },
};

/** Dropdown order; 'custom' is shown when the fields match no preset. */
export const SEQUENCE_PRESET_ORDER: readonly { key: string; label: string }[] = [
  { key: 'crossfade', label: 'Crossfade' },
  { key: 'fade-through', label: 'Fade out, fade in' },
  { key: 'crossfade-drift-right', label: 'Crossfade, drift in from right' },
  { key: 'crossfade-drift-left', label: 'Crossfade, drift in from left' },
  { key: 'crossfade-drift-up', label: 'Crossfade, drift up from below' },
  { key: 'crossfade-drift-down', label: 'Crossfade, drift down from above' },
  { key: 'push-up', label: 'Push up' },
  { key: 'push-down', label: 'Push down' },
  { key: 'push-left', label: 'Push left' },
  { key: 'push-right', label: 'Push right' },
  { key: 'slide-up', label: 'Slide up' },
  { key: 'slide-down', label: 'Slide down' },
  { key: 'slide-left', label: 'Slide left' },
  { key: 'slide-right', label: 'Slide right' },
  { key: 'hide-show', label: 'Hide-show' },
  { key: 'custom', label: 'Custom' },
];

/**
 * The preset key the current fields spell, or `'custom'` when none matches —
 * drives the preset select's displayed value. Hide-show matches on the two
 * `none` edges alone (the timing is moot when nothing moves).
 */
export function sequencePresetKeyFor(fields: SequenceTransitionFields): string {
  if (fields.transitionIn === 'none' && fields.transitionOut === 'none') return 'hide-show';
  for (const [key, preset] of Object.entries(SEQUENCE_TRANSITION_PRESETS)) {
    if (
      preset.transitionIn === fields.transitionIn &&
      preset.transitionOut === fields.transitionOut &&
      preset.transitionTiming === fields.transitionTiming
    ) {
      return key;
    }
  }
  return 'custom';
}
