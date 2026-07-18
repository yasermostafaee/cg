/**
 * Centralized design tokens for the Designer renderer.
 *
 * The shared page-chrome palette lives in `@cg/ui`; the Designer layers
 * its own slightly darker, bluer chrome on top so the authoring shell
 * reads closer to a film/timeline editor (B-001) without bleeding into
 * the Runtime, which keeps the default `@cg/ui` chrome. The air-state
 * rose stays out of the Designer — it's sacred to the Runtime.
 */
import { chrome } from '@cg/ui';

const _sharedFallback = {
  text: chrome.text,
  textMuted: chrome.textMuted,
} as const;

export const colors = {
  background: '#1c1f31',
  panel: '#272b40',
  panelMuted: '#24273d',
  border: '#2e3247',
  text: _sharedFallback.text,
  textMuted: _sharedFallback.textMuted,
  // D-094 follow-up (B-025) — the teal accent is reverted to the prior sky-blue (owner
  // pick); D-094's no-border base + secondary/danger/selected affordances are unchanged.
  accent: '#38BDF8',
  accentMuted: '#0EA5E9',
  /** Label/glyph colour that sits ON an accent fill (the primary button). The light
   *  sky-blue accent takes a near-black on-accent (8.9:1, legible) — kept from D-094. */
  onAccent: '#06121F',
  /** Solid hover/active fill for menu rows (matches the Loopic reference). */
  menuHover: '#2e3346',
  /** Warning/locked accent — a soft red that reads on the dark chrome. */
  danger: '#F87171',
  /**
   * CAUTION — a legitimate state the operator should NOTICE, but which is not an error:
   * an infinite ("loops forever") hold driver, a content-driven graphic that won't
   * auto-close. These used to borrow `danger`, which cried wolf: red is reserved for
   * real errors (e.g. a Lottie intro that overruns the out-point). Amber-400, the same
   * weight as `danger` (red-400) and `accent` (sky-400), so it sits in the same family.
   */
  caution: '#FBBF24',
  /** Faint caution fill for a caution chip / banner surface (mirrors the danger tint). */
  cautionSurface: 'rgba(251, 191, 36, 0.12)',
  /**
   * TIMELINE MARKER COLOURS — the single source for each marker AND for the Inspector
   * button that creates it, so the two can never drift apart. `markerOut` is the D-020
   * out-point marker ("Add out point"); `markerIn` is the D-104 content-start marker
   * ("Pin content start"), which the instructional copy already calls "the cyan marker".
   */
  markerOut: '#ffae57',
  markerIn: '#57b6ff',
  /** Faint marker-tinted fills for those two Inspector actions. */
  markerOutSurface: 'rgba(255, 174, 87, 0.14)',
  markerInSurface: 'rgba(87, 182, 255, 0.14)',
  /** Border colour used for unselected keyframe diamonds (D-009). */
  keyframeBorder: '#676f8f',
} as const;

/**
 * INTERACTIVE STATE WASHES — the one place hover/press feedback is defined.
 *
 * A control's hover must be DERIVED from its own resting colour (one step lighter /
 * darker in the same hue), never a flat neutral. Replacing `background` on hover is what
 * made the accent "+ New project" button turn grey: it is a `bare` button whose accent
 * came from its own class, and `bare`'s hover hard-set a neutral `menuHover` on top.
 *
 * These are LAYERS, not colours: applied as a `background-image` over whatever
 * `background-color` the variant already has (see {@link wash}). That composes with any
 * surface — transparent, neutral, accent, or a marker tint — so one rule gives every
 * variant an in-hue state without any variant hardcoding its own hover.
 */
/**
 * A control's surface class. The SAME numeric overlay does not give the same PERCEIVED
 * step on both: +8% white is a large relative jump on the near-black neutral chrome and
 * almost invisible on the saturated, already-light accent — which is why `primary`'s
 * hover was barely felt while the modal Cancel's was obvious.
 *
 * So the step is parameterised by surface class, and the direction flips:
 *   - `onDark`  — neutral chrome, faint tints: LIGHTEN.
 *   - `onLight` — the accent fill: DARKEN. A white wash there both under-reads AND
 *     desaturates the blue toward pastel; darkening keeps the hue and saturation
 *     unmistakably the same button while giving an equally deliberate step.
 */
export type SurfaceTone = 'onDark' | 'onLight';

/**
 * THE ONE PLACE the hover/press relationship is declared, calibrated so both tones feel
 * equally confident. The reference for "clearly felt" is the modal Cancel button
 * (`secondary`, an `onDark` surface) — `onLight` is tuned to match its perceived step,
 * not its numeric one.
 */
const STEP: Record<SurfaceTone, { hover: string; press: string }> = {
  onDark: { hover: 'rgba(255, 255, 255, 0.09)', press: 'rgba(0, 0, 0, 0.18)' },
  onLight: { hover: 'rgba(0, 0, 0, 0.13)', press: 'rgba(0, 0, 0, 0.24)' },
};

/**
 * Turn a state overlay into a `background-image` LAYER (never a replacement colour), so
 * it composes with whatever `background-color` the control already has and can only
 * shift its lightness — never its hue.
 */
export const wash = (overlay: string): string => `linear-gradient(${overlay}, ${overlay})`;

/** The hover layer for a surface class. The only supported way to express a hover. */
export const hoverWash = (tone: SurfaceTone = 'onDark'): string => wash(STEP[tone].hover);

/** The press layer for a surface class. */
export const pressWash = (tone: SurfaceTone = 'onDark'): string => wash(STEP[tone].press);
