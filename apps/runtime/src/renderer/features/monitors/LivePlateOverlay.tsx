import type { CSSProperties } from 'react';
// The SUBPATH, never the package's entry index — see `livePlateGeometry.ts` for
// the full reason. Short form: the index reaches `adapters/caspar-globals.ts`,
// whose `declare global` claims `window.cg` for the SERVED PAGE's runtime, and
// this app's `window.cg` is the bridge. The two must not share a compilation.
import { smpteBarsGradient } from '@cg/template-runtime/scene-builder';
import type { ChannelRaster } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { frameBox } from './rehearsalFrames.js';
import type { PlatePlacement } from './livePlateGeometry.js';

/**
 * R-049 — the labelled placeholder PVW draws over each Live Source plate.
 *
 * ── 🔴 THIS DOES NOT REOPEN `live-source-multibox` design.md §12.2 ──────────
 *
 * §12.2 stands exactly as decided: rehearse renders the RETAINED EXPORTED PAGE
 * VERBATIM, and D-137 requires that page to paint ZERO PIXELS where a Live Source
 * is, because on air a CasparCG layer composites the real feed BEHIND the
 * template. Nothing here changes what is rendered. This is an overlay the RUNTIME
 * composites on top of the frame; the page beneath is untouched, no `.vcg` or
 * exporter changes, and `buildScene`'s `mode: 'author' | 'output'` seam stays
 * UNUSED and available for a real `'rehearse'` mode if one is ever wanted. A later
 * reader must not read these placeholders as a reversal of §12.2 — they are a
 * thing drawn BESIDE it.
 *
 * ── WHAT IT IS FOR: TWO QUESTIONS, ONE OF WHICH ONLY THIS SURFACE CAN ANSWER ─
 *
 *   1. "Is there a live region here, or did the page fail to render?" An empty
 *      region is indistinguishable from a broken render. The owner met exactly
 *      this in live testing: in PVW you could not tell a live plate existed.
 *   2. "WHICH SOURCE is behind WHICH plate?" The exported page cannot answer this
 *      at all — it carries a plate identifier and nothing else, by design
 *      (design.md §2z: the author names plates for the LAYOUT, the installation
 *      names sources for what they ARE). The Runtime holds the join.
 *
 * ── 🔴 UNMISTAKABLY NOT A PREVIEW — A REQUIREMENT, NOT A STYLING CHOICE ─────
 *
 * A browser cannot display SDI or NDI. A placeholder that READS AS A PICTURE is
 * worse than the blank region it replaces: it converts "I can't see it" into "I
 * saw it and it was fine", which is the one failure this surface must not
 * manufacture. So the look is deliberately anti-photographic and it is layered, so
 * that no single element carries the whole burden:
 *
 *   - procedural colour bars — no camera feed looks like a test pattern;
 *   - HAZARD STRIPING over them — and nothing that arrives on an SDI input has
 *     diagonal stripes across it;
 *   - the word PLACEHOLDER, and a line saying the live picture is not shown here.
 *
 * The bars are `smpteBarsGradient()` IMPORTED from `@cg/template-runtime`, the
 * very function the Designer's authoring surface paints — the same call, so a
 * change to the table reaches both surfaces or neither, never a second table.
 * It carries the B-066 lesson in its own comment (explicit PAIRED gradient stops,
 * because double-position stops shipped in Chromium 72 and CasparCG's CEF is
 * baseline 71), and a hand-written copy would very likely lose it.
 *
 * ── THE TWO STATES DIFFER BY COLOUR, NOT BY TEXT ────────────────────────────
 *
 * They demand different operator ACTIONS — an unassigned plate REFUSES the take
 * (C-015's empty-mapping acceptance), and PVW is the operator's last chance to see
 * that before air — so they must be told apart across the room, before a word is
 * read:
 *
 *   - ASSIGNED   — full-saturation bars, neutral frame, plate name + source name.
 *   - UNASSIGNED — DESATURATED bars, AMBER frame, "no source assigned".
 *
 * Amber is this palette's ATTENTION role, the same one the Inspector's LIVE PLATES
 * section already gives a plate that "needs a source" — so the two surfaces agree.
 * Not red: nothing is broken, the work is simply not done yet.
 *
 * `filter: grayscale(1)` desaturates the ONE bar table rather than introducing a
 * second, muted one. The CEF-71 baseline does not apply here and must not be
 * mis-cited: this renders in the OPERATOR CONSOLE's browser, not in CasparCG.
 *
 * ── 🔴 VISIBLE BEFORE PLAY, AND UNCHANGED THROUGH IT. A DECISION, NOT A SIDE
 *      EFFECT — AND IT DOES NOT REOPEN D-087 ───────────────────────────────
 *
 * The template's own elements stay blank until Play: that is D-087's
 * blank-until-play contract, which the rehearse frame inherits by rendering the
 * exported page verbatim (`body.cg-pending` hides the stage; `play()` clears it,
 * settle re-adds it). These markers appear as soon as PVW opens, which LOOKS like
 * an inconsistency beside it. It is not. It is required, for three reasons, and
 * it is recorded here because otherwise the next reader "fixes" it:
 *
 *   1. **Before Play is exactly when it is needed.** An unassigned plate REFUSES
 *      the take (C-015's empty-mapping acceptance), and PVW is the operator's
 *      LAST CHANCE to see that before air. A marker that appeared only after Play
 *      would be absent at precisely the moment it was filed to serve.
 *   2. **D-087 is untouched, for the same reason §12.2 is.** `cg-pending` is a
 *      class on the PAGE's own `body`, and this overlay is not page content — it
 *      is a Runtime layer composited OVER the frame. The page still paints
 *      nothing before Play. Nothing here reaches into the document, so the
 *      blank-until-play contract cannot be weakened by it.
 *   3. **It persists UNCHANGED during play, and that is where the "never
 *      mistakable for a picture" requirement bites hardest.** The hole is still a
 *      hole while the graphic runs; the live feed still is not there. Removing or
 *      fading the marker at play would restore the original defect at the one
 *      moment the frame most resembles air.
 *
 * So this component takes NO lifecycle input at all — not readiness, not playing,
 * not the transport. Verified end to end in
 * `tests/e2e/pvw-live-plate-placeholder.spec.ts`: before Play the page is blank
 * and the marker is up; during Play the page paints and the marker is byte-for-
 * byte the same box, state and words; after Stop the page blanks and the marker
 * remains. If that is ever changed, change it there first.
 *
 * ── GEOMETRY: ONE FIT SCALE, AND THE LABEL COUNTER-SCALES OUT OF IT ─────────
 *
 * The overlay box is the SAME `frameBox` the iframes use — same raster size, same
 * `translate(-50%,-50%) scale(fit)` — so plate rects land on the page beneath by
 * construction rather than by a second calculation that happens to agree.
 *
 * The LABEL then multiplies by `1/fit`. Without it the text would scale down with
 * everything else and be illegible in a small panel, which would delete the answer
 * to question 2 while leaving the box that promises it. Note what this is NOT: it
 * is not a second scale factor: it is the stage's own `fit`, inverted, so the two
 * cannot drift. Line weights and the stripe period take the same inversion, for
 * the same reason — a 2px border at fit 0.2 is 0.4px, which is no border at all.
 */

/** The hazard striping, over the bars, in BOTH states. */
function hazardStripes(period: number): string {
  const half = period / 2;
  return (
    `repeating-linear-gradient(135deg, rgba(0,0,0,0.34) 0px, rgba(0,0,0,0.34) ${String(half)}px,` +
    ` rgba(0,0,0,0) ${String(half)}px, rgba(0,0,0,0) ${String(period)}px)`
  );
}

const styles = {
  /**
   * `pointerEvents: 'none'` on the whole layer, and it is load-bearing rather
   * than tidy: this box covers the entire rehearsal, and a layer that swallowed
   * clicks would take them from the frames underneath — including the transport
   * an operator reaches for. The overlay is something to LOOK at.
   */
  layer: { pointerEvents: 'none' as const },
  chip: {
    position: 'absolute' as const,
    left: '50%',
    top: '50%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '2px',
    padding: '6px 10px',
    background: 'rgba(0, 0, 0, 0.78)',
    borderRadius: '3px',
    // The ids and names here are installation strings, not authored copy: pin
    // them LTR so a Persian console cannot flip `guest-1` to `1-guest`.
    direction: 'ltr' as const,
    textAlign: 'center' as const,
    whiteSpace: 'nowrap' as const,
    maxWidth: '95%',
    overflow: 'hidden',
  },
  kind: {
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    color: '#ffffff',
    opacity: 0.72,
  },
  plate: { fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#ffffff' },
  source: { fontSize: '12px', color: '#ffffff' },
  unassigned: { fontSize: '12px', fontWeight: 700, color: colors.pending },
} as const satisfies Record<string, CSSProperties>;

interface Props {
  /** Every rehearsing row's plates, already placed in RASTER pixels. */
  placements: readonly PlatePlacement[];
  /** The channel's real raster — the overlay box is sized to it, like the frames. */
  raster: ChannelRaster;
  /** The stage's FIT scale. The ONE it gives the frames; never re-measured here. */
  fit: number;
  /** Above every frame in the composite — see `overlayZIndex`. */
  zIndex: number;
}

export function LivePlateOverlay({ placements, raster, fit, zIndex }: Props): JSX.Element | null {
  if (placements.length === 0) return null;
  // `fit` is positive by construction (the stage only sets it from a positive
  // box against a positive raster), but a guard here is cheaper than a frame of
  // `Infinity`-sized labels if that ever stops being true.
  const inv = fit > 0 ? 1 / fit : 1;
  return (
    <div
      aria-hidden={false}
      data-live-plate-overlay=""
      role="group"
      aria-label="Live source placeholders"
      style={{ ...frameBox(raster, fit), ...styles.layer, zIndex }}
    >
      {placements.map((p) => {
        const assigned = p.sourceName !== null;
        return (
          <div
            key={p.elementId}
            data-live-plate={p.plateId}
            data-live-plate-state={assigned ? 'assigned' : 'unassigned'}
            style={{
              position: 'absolute',
              left: `${String(p.x)}px`,
              top: `${String(p.y)}px`,
              width: `${String(p.width)}px`,
              height: `${String(p.height)}px`,
              // Bars UNDER the stripes: `background-image` paints first-listed on
              // top, so the striping is named first.
              backgroundImage: `${hazardStripes(16 * inv)}, ${smpteBarsGradient()}`,
              // The whole plate desaturates — bars AND stripes — so the two
              // states differ in colour across the entire rect rather than in one
              // corner of it. That is what makes them separable at a glance.
              filter: assigned ? 'none' : 'grayscale(1)',
              border: `${String(2 * inv)}px dashed ${assigned ? 'rgba(255,255,255,0.85)' : colors.pending}`,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                ...styles.chip,
                // Anchored at the plate's centre and then un-scaled, so the chip
                // reads at console size wherever the panel is dragged to.
                transform: `translate(-50%, -50%) scale(${String(inv)})`,
                transformOrigin: 'center center',
              }}
            >
              <span style={styles.kind}>LIVE SOURCE · PLACEHOLDER</span>
              <span style={styles.plate}>{p.plateId}</span>
              {assigned ? (
                <span style={styles.source}>{p.sourceName}</span>
              ) : (
                <span style={styles.unassigned} data-live-plate-unassigned="">
                  no source assigned
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
