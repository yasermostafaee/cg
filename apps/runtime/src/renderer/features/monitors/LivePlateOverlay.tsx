import type { CSSProperties } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { ChannelRaster } from '@cg/shared-ipc';
import { largestLivePlateMaskRegion } from '@cg/shared-schema';
import { colors, cssVars } from '../../theme.js';
import { Icon } from '../../ui/Icon.js';
import { SourceLabel } from '../sources/SourceLabel.js';
import { frameBox } from './rehearsalFrames.js';
import type { PlatePlacement } from './livePlateGeometry.js';
import type { PvwSourceFrame } from './usePvwSourceFrames.js';

/**
 * R-049/B-424 — mark each live plate while leaving its authored fallback visible.
 * The neutral outline indicates an assigned source. Amber marks a missing assignment.
 * The chip identifies the plate, effective fit and source.
 *
 * RehearsalStage mounts this overlay while the composite plays (R-106).
 * Labels counter-scale against the frame fit to remain readable.
 */
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
    background: cssVars['--r-plate-chip-bg'],
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
    color: cssVars['--r-plate-ink'],
    opacity: 0.72,
  },
  plate: {
    fontFamily: 'monospace',
    fontSize: '13px',
    fontWeight: 700,
    color: cssVars['--r-plate-ink'],
  },
  source: { fontSize: '12px', color: cssVars['--r-plate-ink'] },
  fit: { fontSize: '11px', fontWeight: 700, color: cssVars['--r-plate-fit'] },
  unassigned: { fontSize: '12px', fontWeight: 700, color: colors.pending },
  audio: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
  },
} as const satisfies Record<string, CSSProperties>;

/**
 * `add-multibox-audio` — **HOW A BOX SAYS WHETHER IT HAS SOUND.**
 *
 * ── 🔴 A PILL, NEVER A METER, AND ON THIS SURFACE THAT MATTERS MOST ─────────
 *
 * This whole overlay exists because a placeholder that READS AS A PICTURE is worse than the
 * blank region it replaces — it converts *"I can't see it"* into *"I saw it and it was fine"*.
 * An audio BAR here would be the identical mistake on the identical surface, one sense over:
 * it would convert *"I can't hear it"* into *"I watched the level and it was fine"*, while the
 * console in fact knows only what was ASKED FOR. CasparCG's programme channel reports ONE peak
 * pair for the whole channel, so a per-box level does not exist to be drawn (`add-multibox-audio`
 * design.md §6). Word plus dot; nothing that could be mistaken for a measurement.
 *
 * ── COLOUR FOLLOWS THIS FILE'S EXISTING RULE, NOT A NEW ONE ────────────────
 *
 * Nothing here is coloured unless it needs ATTENTION. `held` is a normal, chosen disposition
 * and wears a WORD — the same rule `liveLayerRows` states for the LIVE PLATES tab, so the two
 * surfaces cannot come to disagree about whether a held plate is a problem. GREEN is not used
 * at all: it is the sacred ON AIR mark of the layer table.
 */
const AUDIO_GLYPH = {
  audible: { text: 'AUDIO ON', color: colors.ready, icon: Volume2 },
  silent: { text: 'SILENT', color: cssVars['--r-plate-ink-dim'], icon: VolumeX },
  // "This box is not audible because the LOOK hides it" — a fact about the layout, not a
  // fault, so it says which and stays uncoloured.
  held: {
    text: 'NOT IN THIS LOOK',
    color: cssVars['--r-plate-ink-dim'],
    icon: VolumeX,
  },
} as const;

interface Props {
  /** Every rehearsing row's plates, already placed in RASTER pixels. */
  placements: readonly PlatePlacement[];
  sourceFrames?: ReadonlyMap<string, PvwSourceFrame>;
  /** The channel's real raster — the overlay box is sized to it, like the frames. */
  raster: ChannelRaster;
  /** The stage's FIT scale. The ONE it gives the frames; never re-measured here. */
  fit: number;
  /** Above every frame in the composite — see `overlayZIndex`. */
  zIndex: number;
}

/** The visible caveat, and the width it needs. Measured in Chromium: 156.8 px at 9 px / 700 / .14em. */
export const REGION_CAVEAT = 'LIVE SOURCE · PLACEHOLDER';

/**
 * 🔴 `CONSOLE-LOOK-06` DELTA D6 — THE DEGRADATION, AND WHY IT IS A PREDICATE AND NOT AN
 * `overflow` SETTING.
 *
 * The label is a fixed 156.8 px on screen: it is anchored at the region's centre and then
 * UN-SCALED by `1/fit`, deliberately, so it reads at console size wherever the panel is
 * dragged to. A region is whatever the template says it is — measured on the two-box seed at
 * 1600 × 900, its two plates are **97.2 px** and **72.9 px** wide, so the words were being cut
 * to `VE SOURCE · PLACEH` by the region's own `overflow: hidden`.
 *
 * ⚠ A CLIPPED CAVEAT IS WORSE THAN NO CAVEAT ON THE REGION: the fragment still looks like a
 * label, so it reads as "something is written here" rather than as "this is not video". The
 * owner's ruling names the fallback and it is the only one allowed — the words move to the
 * STAMP's line, which is permanent and still on canvas. **It never degrades to a `title`.**
 *
 * ONE predicate, exported, called by BOTH the overlay (which drops the label) and the stage
 * (which lengthens the stamp). Two copies of this threshold is how the label disappears from
 * a region while the stamp goes on saying nothing about it.
 */
export const REGION_CAVEAT_MIN_PX = 170;

/** Does this region, as it will actually paint, have room for the caveat? */
export function regionFitsCaveat(renderedWidthPx: number): boolean {
  return renderedWidthPx >= REGION_CAVEAT_MIN_PX;
}

/** True when ANY region must fall back to the stamp — the stage's half of the same decision. */
export function anyRegionTooSmallForCaveat(
  placements: readonly Pick<PlatePlacement, 'width' | 'mask'>[],
  fit: number,
): boolean {
  return placements.some(
    ({ width, mask }) =>
      !regionFitsCaveat(width * (largestLivePlateMaskRegion(mask)?.width ?? 0) * fit),
  );
}

/**
 * 🔴 `R-022` CAVEAT 2, IN FULL — "a Live Source region is a placeholder, not video".
 *
 * `CONSOLE-LOOK-06` DELTA D6: the owner's ruling is that each caveat is stated PERMANENTLY at
 * the thing it describes, never on a hover. The VISIBLE half is the region's own
 * `LIVE SOURCE · PLACEHOLDER` chip, which has been on canvas all along; this is the other
 * half the ruling asks for — the long form, in the accessible name, so the two are BOTH
 * rather than either. A sighted operator reads three words on the box; a screen reader gets
 * the sentence, including the one thing the box cannot show, which is that nothing here is
 * a picture of the source.
 *
 * ⚠ Chrome, not operator data, so it stays LTR and does NOT go in a `<bdi>` (golden rule 11):
 * an isolate around this would imply it is a NAME. The source's own name inside it is the
 * part that is data — and it is already isolated by the chip that renders it.
 */
function regionCaveat(
  plateId: string,
  sourceName: string | null,
  audio: PlatePlacement['audio'],
  cropEdges: PlatePlacement['cropEdges'],
  preview?: PvwSourceFrame,
): string {
  const source =
    sourceName === null ? 'No source is assigned to it.' : `Its source is ${sourceName}.`;
  const sound =
    audio === undefined
      ? 'Its audio state is not available.'
      : audio === 'audible'
        ? 'Its audio is on.'
        : audio === 'held'
          ? 'Its audio is muted because this plate is not in the active look.'
          : 'Its audio is muted.';
  const fit = cropEdges === true ? ' Crop edges.' : '';
  if (preview?.jpegBase64 !== undefined) {
    return `Live source ${plateId} — silent preview snapshots.${fit} ${source} ${sound}`;
  }
  if (preview?.signal === 'absent')
    return `Live source ${plateId} — no signal.${fit} ${source} ${sound}`;
  return `Live source ${plateId} — preview placeholder.${fit} Check the server output for live video. ${source} ${sound}`;
}

export function LivePlateOverlay({
  placements,
  sourceFrames,
  raster,
  fit,
  zIndex,
}: Props): JSX.Element | null {
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
      aria-label={
        sourceFrames !== undefined && sourceFrames.size > 0
          ? 'Live source preview'
          : 'Live source placeholders'
      }
      style={{ ...frameBox(raster, fit), ...styles.layer, zIndex }}
    >
      {placements.map((p) => {
        const assigned = p.sourceName !== null;
        const preview = p.sourceId === null ? undefined : sourceFrames?.get(p.sourceId);
        const hasPicture = preview?.jpegBase64 !== undefined;
        const audio = p.audio === undefined ? undefined : AUDIO_GLYPH[p.audio];
        const region = largestLivePlateMaskRegion(p.mask);
        const roomForLabel = regionFitsCaveat(p.width * (region?.width ?? 0) * fit);
        const showPlateId = p.mask !== undefined || roomForLabel;
        const labelAnchor: CSSProperties =
          region === null || p.mask === undefined
            ? {}
            : {
                left: String((region.x + region.width / 2) * 100) + '%',
                top: String((region.y + region.height / 2) * 100) + '%',
                maxWidth: String(region.width * fit * 100) + '%',
              };
        return (
          <div
            key={p.elementId}
            data-live-plate={p.plateId}
            data-live-plate-state={assigned ? 'assigned' : 'unassigned'}
            /*
              `role="img"` because that is what this rect IS — a stand-in for a picture — and
              because it makes the region ATOMIC: the caveat is announced as one statement
              rather than as four loose fragments read off the chip in whatever order they
              were laid out.
            */
            role="img"
            aria-label={regionCaveat(p.plateId, p.sourceName, p.audio, p.cropEdges, preview)}
            style={{
              position: 'absolute',
              left: `${String(p.x)}px`,
              top: `${String(p.y)}px`,
              width: `${String(p.width)}px`,
              height: `${String(p.height)}px`,
              border: hasPicture
                ? undefined
                : `${String(2 * inv)}px dashed ${assigned ? cssVars['--r-plate-outline'] : colors.pending}`,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {region === null ? null : hasPicture ? (
              (showPlateId || audio !== undefined) && (
                <div
                  data-live-plate-label=""
                  style={{
                    ...styles.chip,
                    ...(p.mask === undefined
                      ? { left: 'auto', top: 'auto', bottom: 4 * inv, right: 4 * inv }
                      : labelAnchor),
                    padding: '2px 4px',
                    gap: '4px',
                    flexDirection: 'row',
                    alignItems: 'center',
                    transform:
                      (p.mask === undefined ? '' : 'translate(-50%, -50%) ') +
                      `scale(${String(inv)})`,
                    transformOrigin: p.mask === undefined ? 'right bottom' : 'center center',
                  }}
                >
                  {showPlateId && (
                    <span
                      style={{ ...styles.source, overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {p.plateId}
                    </span>
                  )}
                  {roomForLabel && p.cropEdges && <span style={styles.fit}>Crop edges</span>}
                  {audio !== undefined && (
                    <span
                      style={{ ...styles.audio, color: audio.color }}
                      data-live-plate-audio={p.audio}
                    >
                      <Icon icon={audio.icon} size={11} />
                    </span>
                  )}
                </div>
              )
            ) : (
              <div
                data-live-plate-label=""
                style={{
                  ...styles.chip,
                  ...labelAnchor,
                  transform: `translate(-50%, -50%) scale(${String(inv)})`,
                  transformOrigin: 'center center',
                }}
              >
                {/* Dropped, not clipped, when the region cannot hold it — the stamp says it
                  instead (see `regionFitsCaveat`). The ACCESSIBLE name below is unaffected:
                  it carries the full sentence at every size. */}
                {(preview?.signal === 'absent' || roomForLabel) && (
                  <span style={styles.kind} data-live-plate-caveat="">
                    {preview?.signal === 'absent' ? 'No signal' : REGION_CAVEAT}
                  </span>
                )}
                <span style={styles.plate}>{p.plateId}</span>
                {p.cropEdges === true && <span style={styles.fit}>Crop edges</span>}
                {assigned ? (
                  // `PLAYOUT-SOURCES-01` §2.B — the name as every surface names it.
                  <span style={styles.source}>
                    <SourceLabel sourceId={p.sourceId} fallback={p.sourceName ?? undefined} />
                  </span>
                ) : (
                  <span style={styles.unassigned} data-live-plate-unassigned="">
                    no source assigned
                  </span>
                )}
                {/*
                ABSENT means NOT STATED, and nothing is drawn for it — the stack and the ledger
                are separate snapshots from the template registry that produced this placement,
                and a glyph rendered before they land would assert silence on the one property
                an operator cannot check by looking at the frame.
              */}
                {audio !== undefined && (
                  <span
                    style={{ ...styles.audio, color: audio.color }}
                    data-live-plate-audio={p.audio}
                  >
                    <Icon icon={audio.icon} size={11} />
                    {audio.text}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
