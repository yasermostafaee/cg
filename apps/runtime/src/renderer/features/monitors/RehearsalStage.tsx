import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
// The raster type comes from `@cg/shared-ipc` (`ChannelRaster`), not from
// `@cg/template-runtime`'s structurally-identical `Raster` — a `{width, height}`
// type belongs to the package this app already speaks to the bridge with.
//
// R-049 note: `@cg/template-runtime` IS now a dependency of this app, for the two
// things that cannot be re-spelled without risking divergence — the SMPTE bar
// table and the page's own placement arithmetic. That does not make it the right
// source for this type, and it did not cost the bundle what the older form of this
// comment feared ("would pull the whole renderer into the SPA bundle"): MEASURED,
// those four pure functions add 3.5 kB to the built SPA (1,271.6 → 1,275.1 kB with
// them stubbed out and back), because nothing else in the package is reachable
// from them and both imports go through subpaths rather than the entry index.
import type { ChannelRaster } from '@cg/shared-ipc';
import { colors, cssVars } from '../../theme.js';
import { LivePlateOverlay, anyRegionTooSmallForCaveat } from './LivePlateOverlay.js';
import { platePlacements, type PlatePlacement } from './livePlateGeometry.js';
import { RehearsalFrame, type RehearsalFrameHandle } from './RehearsalFrame.js';
import { frameZIndex, overlayZIndex, type RehearsalSubject } from './rehearsalFrames.js';

/**
 * R-022 — the rehearsal render: EVERY rehearsing row's graphic, with the
 * operator's CURRENT field values, rendered LOCALLY IN THIS BROWSER and
 * COMPOSITED in the channel's own stacking order. Nothing is sent to CasparCG.
 *
 * ── WHY IT COMPOSITES, AND WHY THAT IS NOT A NICETY ──────────────────────────
 *
 * Rehearse is per-row and nothing stops the operator putting several rows into
 * it — that is how the operator works, and it is correct. This panel used to
 * render exactly ONE of them (the selected row, else the first), which made it a
 * surface that read as complete while being partial: an operator checked PVW,
 * saw a clean frame, and had no way to know a second graphic was also rehearsing
 * and would collide with it. Showing all of them is the fix; a "showing 1 of 3"
 * caption on a single frame would not have been.
 *
 * There is NO CAP. If one is ever needed for cost it must be stated on the
 * surface — "showing N of M" — because a quiet drop reproduces exactly the bug
 * this replaced.
 *
 * ── WHAT IS NOT COMPOSITED: AIR ──────────────────────────────────────────────
 *
 * On-air rows are deliberately absent. Compositing them would be MORE faithful
 * to the channel and is still the wrong move: PGM is the surface for what is on
 * air, and building a second local representation of air is precisely what
 * R-022's design avoided by reusing the bridge's own retained page. PVW shows
 * what is being REHEARSED, and it now says so in words, because with several
 * frames the question "is that thing on air?" becomes askable.
 *
 * ── WHAT IS RENDERED, AND WHY IT IS THE SERVED PAGE ──────────────────────────
 *
 * Not a re-built scene — the RETAINED SELF-CONTAINED HTML, the byte-identical
 * page the bridge serves to CasparCG for this template (`LibraryStore` already
 * keeps it, persisted, because it is re-delivered to the bridge on every
 * reconnect). That page inlines `@cg/template-runtime`, the scene and every
 * asset, so rehearsing it exercises the same renderer the Designer preview uses
 * AND the same boot the on-air producer runs.
 *
 * Rendering the served page rather than re-deriving a scene buys three things
 * that matter more than the code it saves:
 *
 *   1. There is no second render path to drift from air. A rehearsal that
 *      composed the scene itself would be a parallel implementation of the boot,
 *      and the first divergence would be invisible — a preview that lies is
 *      worse than one that abstains.
 *   2. It needs no scene retention, so it works for a template imported in
 *      ANOTHER browser and after a page reload, which a browser-local scene
 *      store would not.
 *   3. Placement comes out right for free. See below.
 *
 * ── THE IFRAMES ARE SIZED TO THE CHANNEL RASTER, AND THAT IS THE PLACEMENT ───
 *
 * Each page places itself at boot via `applyOutputPosition`, whose R-030
 * geometry chain is: the `?cw=&ch=` query, else `window.innerWidth`/
 * `innerHeight`, else the reference frame. Inside an iframe,
 * `window.innerWidth`/`innerHeight` ARE the iframe's box — so sizing every frame
 * to the channel's real raster makes each page compute exactly the placement it
 * will compute on air, with no query to plumb and no placement maths duplicated
 * here. The visual fit into a small panel is a separate CSS `transform: scale()`
 * on the iframe elements, which cannot perturb what the pages inside measure.
 *
 * Two scales, kept apart on purpose:
 *   - the AIR scale lives INSIDE each page (reference frame → raster). Real placement.
 *   - the FIT scale lives on the iframe ELEMENTS (raster → panel). Preview only.
 * Collapsing them would work on screen and destroy the thing being rehearsed:
 * the operator's placement would be expressed in panel pixels.
 *
 * The operator's placement OVERRIDE is delivered per frame — see
 * `RehearsalFrame`, which owns that and the `color-scheme` match that keeps each
 * frame's canvas transparent (without which the top frame hides all the rest).
 *
 * `srcdoc` (not a blob URL) so each frame inherits this document's origin: that
 * is what lets the lifecycle be driven below. It is also sandbox-free BY
 * NECESSITY — the pages must run their own scripts — and safe to be, because the
 * HTML is one this app produced from a signature-verified `.vcg`, never
 * third-party content.
 *
 * ── NOT AN AIR CHECK ─────────────────────────────────────────────────────────
 *
 * Browser rendering versus CasparCG's CEF 71 is faithful but NOT pixel-identical
 * (the B-066 class).
 *
 * ⚠ A LIVE SOURCE REGION: THE PAGE PAINTS NOTHING, THE RUNTIME DRAWS A MARKER.
 * Read both halves — this comment has been wrong in each direction once.
 *
 *   - THE RENDERED PAGE still paints ZERO PIXELS there, and that is unchanged.
 *     Rehearse renders the RETAINED EXPORTED PAGE VERBATIM (`srcDoc={html}` in
 *     `RehearsalFrame`), D-137 requires that page to paint nothing where a Live
 *     Source is, and no second render path exists. DECIDED 2026-08-08, owner —
 *     `openspec/changes/live-source-multibox/` design.md §12.2, NOT reopened by
 *     R-049. (`buildScene`'s `mode` seam is an enum, not a boolean, so a third
 *     `'rehearse'` mode remains addable without reopening it — and stays unused.)
 *   - R-049 THEN DRAWS A LABELLED PLACEHOLDER OVER IT — `LivePlateOverlay`, this
 *     component's own child, composited on top of the frames from the plate rects
 *     the template declares. It is a MARKER, never the feed: an empty region is
 *     indistinguishable from a broken render, and nothing but the Runtime can say
 *     WHICH SOURCE is behind WHICH plate, because the page carries a plate
 *     identifier and nothing else.
 *
 * What fills the region ON AIR is a CasparCG layer the bridge composites BEHIND
 * the template, which no browser preview was ever going to show — hence a marker
 * that is deliberately unmistakable for a picture, rather than a picture.
 *
 * The history is worth keeping, because the first version of this paragraph was
 * confidently wrong: until 2026-08-08 it read "after C-015 a Live Source region
 * renders as a labelled placeholder rather than video", describing a render path
 * that was never built and could not be on this surface. It was corrected to "an
 * empty transparent hole", which was true then and is HALF true now. Neither
 * short form survives contact with the truth: the PAGE paints nothing, the
 * RUNTIME draws a marker over it, and a reader needs both facts to reason about
 * either.
 *
 * Rehearse catches wrong values, broken layouts and bad motion; it is not a
 * confidence monitor (that is C-016). Those caveats are stated IN the panel below
 * and not only in this comment — R-022's own acceptance requires it, and it
 * matters more precisely because rehearse looks authoritative.
 */

const styles = {
  lifecycle: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.3rem 0.5rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  fitBox: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: cssVars['--r-video-ground'],
    overflow: 'hidden',
    position: 'relative' as const,
  },
  /**
   * 🔴 `CONSOLE-MATCH-03` §1 — WHAT THIS PICTURE IS, said ON the picture.
   *
   * The reference stamps `ILLUSTRATIVE COMPOSITE · LOCAL` in the stage's bottom-left, and
   * `PROMPT.md` §0 lists it among the few prototype strings that are TRUE FOR US and stay —
   * because `R-022` is explicit that this render never reaches CasparCG. It is the same
   * argument `MonitorPanel`'s header makes about a black box: a broadcast surface showing a
   * frame that is not the frame on air must say so ON the frame, not in a panel title above
   * it and not in a caveats drawer the operator has to open.
   *
   * ABOVE every layer and the plate overlay (`zIndex` past `frameZIndex`'s range), because a
   * full-frame graphic would otherwise cover the one label that says this is not air. It is
   * `aria-hidden`: the same fact is already in the panel's own accessible name and in the
   * caveats, and a screen reader meeting it three times is noise.
   */
  /**
   * 🔴 THE SAFE-AREA GUIDES LAND ON THE CANVAS, and the owner had to say so once.
   *
   * The first cut used `inset: 0` on the FIT BOX, which is the panel's whole picture area —
   * raster plus the black letterbox left over from fitting 16:9 into a panel of another
   * aspect. So the guides were drawn around the surround and title-safe was reported wider
   * than the frame: a ruler measuring the wrong thing, which is worse than no ruler.
   *
   * They are now positioned exactly like the CHECKER — centred and sized by the caller to
   * `raster × fit` — for the same reason its own comment gives about the surround: what
   * belongs to the frame is drawn on the frame and nowhere else. Both now derive from one
   * pair of numbers, so they cannot drift apart at a new panel width.
   */
  guides: {
    position: 'absolute' as const,
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 55,
    pointerEvents: 'none' as const,
    display: 'grid',
    placeItems: 'center',
  },
  /** ACTION-safe: 93 % of the raster, the wider of the two broadcast boxes. */
  guideAction: {
    position: 'absolute' as const,
    inlineSize: '93%',
    blockSize: '93%',
    border: `1px dashed ${colors.textMuted}`,
    opacity: 0.55,
  },
  /** TITLE-safe: 90 %, the one a lower third's text must sit inside. */
  guideTitle: {
    position: 'absolute' as const,
    inlineSize: '90%',
    blockSize: '90%',
    border: `1px dashed ${colors.textMuted}`,
    opacity: 0.8,
  },
  illustrationNote: {
    position: 'absolute' as const,
    insetInlineStart: cssVars['--r-stage-note-inset'],
    insetBlockEnd: cssVars['--r-stage-note-inset'],
    zIndex: 60,
    pointerEvents: 'none' as const,
    fontSize: cssVars['--r-stage-note-text'],
    letterSpacing: cssVars['--r-stage-note-track'],
    color: colors.textMuted,
    background: cssVars['--r-stage-note-bg'],
    padding: cssVars['--r-stage-note-pad'],
    borderRadius: cssVars['--r-radius-sm'],
    whiteSpace: 'nowrap' as const,
  },
  /**
   * The CHECKER, behind the WHOLE STACK — the SAME one the Designer's authoring
   * surface and broadcast preview use (`#5b6075` on `#3d4253`, 24px), so a
   * graphic looks the same in the two places an operator judges it.
   *
   * It is not decoration. These are KEYED graphics: they go to air over video,
   * and the part of the frame that matters most is the part that is TRANSPARENT.
   * Against the flat black this used to paint, transparent and black-filled are
   * indistinguishable — an operator could not see that a lower-third's backing
   * plate had gone opaque and would blank the shot behind it. The checker is what
   * makes alpha visible.
   *
   * ONE checker, at the BOTTOM of the composite (z-index 0, every frame at 1+),
   * not one per frame: a checker between two frames would read as an opaque
   * layer and hide exactly the alpha it exists to reveal — and it would also lie
   * about how the channel composites, where nothing sits between two layers.
   */
  checker: {
    position: 'absolute' as const,
    // Centred and sized to the SCALED FRAME by the caller — not `inset: 0`.
    //
    // Covering the whole fit box put the checker in the SURROUND, where there is
    // no graphic, and left the frame itself reading flat white. The checker is a
    // transparency backdrop: it belongs behind the RASTER and nowhere else, so
    // that what shows through is the pages' own alpha. The surround stays black,
    // because black is the honest colour for "outside the frame" — it is the
    // letterbox left over from fitting a 16:9 raster into a panel of a different
    // aspect, and it cannot be removed without distorting the frame, which would
    // break the one thing PVW is for.
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 0,
    background: cssVars['--r-checker-a'],
    backgroundImage:
      `linear-gradient(45deg, ${cssVars['--r-checker-b']} 25%, transparent 25%),` +
      `linear-gradient(-45deg, ${cssVars['--r-checker-b']} 25%, transparent 25%),` +
      `linear-gradient(45deg, transparent 75%, ${cssVars['--r-checker-b']} 75%),` +
      `linear-gradient(-45deg, transparent 75%, ${cssVars['--r-checker-b']} 75%)`,
    backgroundSize: '48px 48px',
    backgroundPosition: '0 0, 0 24px, 24px -24px, -24px 0',
  },
  /*
   * ⚠ `caveats`, `lifecycleSpacer` and `caption` USED TO BE HERE.
   *
   * The caveats paragraph and its info toggle are GONE at the owner's word (2026-09-12: the
   * info icon and the on-canvas description are not wanted). The spacer and the caption went
   * with the lifecycle bar itself, which `CONSOLE-LOOK-06` §2 replaced with `PreviewPanel`'s
   * persistent controls row — the caption is rendered there now, from the same two numbers.
   *
   * 🔴 WHAT THE PANEL STILL SAYS ABOUT ITSELF, because the removal must not take the honesty
   * with it: the `ILLUSTRATIVE COMPOSITE · LOCAL` stamp on the canvas (above every frame, so
   * no graphic can cover it), the panel's own accessible name, and the empty state's
   * "Nothing is sent to CasparCG". See the report — `R-022`'s acceptance asked for the
   * caveats to be stated IN the panel, and that clause is now only partly met.
   */
  missing: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.3rem',
    background: cssVars['--r-video-ground'],
    color: colors.offline,
    fontSize: '0.7rem',
    textAlign: 'center' as const,
    padding: '0.75rem',
  },
} as const satisfies Record<string, CSSProperties>;

/** Ties the caveats disclosure to its toggle for assistive tech. */

interface Props {
  /**
   * The rehearsing rows to composite, ALREADY in stacking order (lowest
   * CasparCG layer first). Ordering is `stackedByLayer`'s job, not this
   * component's — see `rehearsalFrames.ts` for why the order can only come from
   * the real layer number.
   */
  subjects: readonly RehearsalSubject[];
  /**
   * The retained self-contained HTML per item id, or null/absent when this
   * browser holds no copy. A null renders that row's honest empty state — never
   * a blank box that could be mistaken for a rendered graphic.
   */
  htmlByItem: ReadonlyMap<string, string | null>;
  /** The channel's real raster (R-030). Every iframe is sized to it. */
  raster: ChannelRaster;
  /**
   * 🔴 `CONSOLE-LOOK-06` §2 — the SAFE-AREA GUIDES, drawn over every frame.
   *
   * The reference's `.pvw-guides`, and it is the one control in its `.zoom` group we adopt
   * (the zoom select itself is excluded by the owner). It is a JUDGEMENT aid: title-safe and
   * action-safe are the two boxes an operator checks a lower third against, and checking them
   * by eye against a 626 px preview is exactly the guess this removes.
   */
  showGuides?: boolean;
  /**
   * Publishes the local transport upward so a persistent controls row can drive it, and
   * `null` on unmount so that row can disable itself rather than hold a stale handle.
   */
  onTransport?:
    | ((
        t: { drive: (v: 'play' | 'next' | 'stop') => void; ready: boolean; count: number } | null,
      ) => void)
    | undefined;
}

/**
 * 🔴 `R-022`'s TWO HONEST CAVEATS, kept as one string after the paragraph was removed.
 *
 * Its acceptance reads: _"WHEN the preview is shown THEN two honest caveats are stated IN the
 * item: browser-vs-CEF-71 rendering may differ in detail (`B-066` class — 'faithful, not
 * pixel-identical'), and after `C-015` a Live Source region renders as a labeled placeholder,
 * not video."_ The owner removed the on-canvas paragraph and its info icon on 2026-09-12; that
 * is a decision about the SURFACE, and it does not repeal the clause, so the two facts moved
 * to where they cost no picture — the stamp that already names what this render is.
 *
 * ⚠ Reported to the owner as PARTLY MET rather than met: a hover is weaker than a paragraph,
 * and whether that is enough for `R-022` is his call, not this file's.
 */
const REHEARSAL_CAVEATS =
  'Rendered in this browser, not on air — faithful but not pixel-identical to the on-air ' +
  'render. A Live Source region paints nothing in the page; the marked box over it is a ' +
  'placeholder this app draws, naming the plate and its source — it is not the live picture.';

export function RehearsalStage({
  subjects,
  htmlByItem,
  raster,
  showGuides = false,
  onTransport,
}: Props): JSX.Element {
  const fitRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(1);

  const handles = useRef(new Map<string, RehearsalFrameHandle>());
  const [readyIds, setReadyIds] = useState<ReadonlySet<string>>(() => new Set());
  const onReadyChange = useCallback((itemId: string, ready: boolean) => {
    setReadyIds((prev) => {
      if (prev.has(itemId) === ready) return prev;
      const next = new Set(prev);
      if (ready) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  /** The rows that actually have a page to render, in stacking order. */
  const renderable = useMemo(
    () =>
      subjects
        .map((s) => ({ subject: s, html: htmlByItem.get(s.itemId) ?? null }))
        .filter((r): r is { subject: RehearsalSubject; html: string } => r.html !== null),
    [subjects, htmlByItem],
  );

  /**
   * R-049 — every live plate of every RENDERABLE row, in raster pixels.
   *
   * Keyed off `renderable`, not `subjects`: a row whose page this browser does not
   * hold renders no frame at all, and a placeholder floating over nothing would
   * assert a live region on a graphic the operator cannot see. The shortfall is
   * already stated by the caption ("showing N of M") — this must not contradict it.
   *
   * The plate ids come from the AUTHOR and the source names from the INSTALLATION,
   * so two rows carrying the same template legitimately produce the same plate id
   * twice; `elementId` is prefixed with the item id to keep the React keys unique
   * across rows rather than across the template.
   */
  const placements = useMemo<PlatePlacement[]>(
    () =>
      renderable.flatMap(({ subject }) => {
        const live = subject.liveSources;
        if (live === undefined || live.sources.length === 0) return [];
        return platePlacements(
          live,
          raster,
          subject.position,
          subject.plateSources,
          subject.activeLookId,
        ).map((p) => ({ ...p, elementId: `${subject.itemId}:${p.elementId}` }));
      }),
    [renderable, raster],
  );
  /*
    🔴 `CONSOLE-LOOK-06` DELTA D6 — THE STAMP TAKES THE WORDS WHEN A REGION CANNOT HOLD THEM.

    The owner's ruling names exactly one fallback for caveat 2 and this is it: when a
    live-source region is too narrow for its own `LIVE SOURCE · PLACEHOLDER` label, the words
    move to this line — `ILLUSTRATIVE COMPOSITE · LOCAL · LIVE SOURCES NOT RENDERED` — which
    is permanent and still on canvas. It never degrades to a hover.

    ⚠ Derived from `anyRegionTooSmallForCaveat`, the SAME predicate `LivePlateOverlay` uses to
    drop the label, called with the same `placements` and the same `fit`. Two spellings of
    one threshold is how a label vanishes from a region while the stamp goes on saying nothing
    about it — golden rule 6's shape, one level down from a predicate's name.
  */
  const stampText =
    placements.length > 0 && anyRegionTooSmallForCaveat(placements, fit)
      ? 'ILLUSTRATIVE COMPOSITE · LOCAL · LIVE SOURCES NOT RENDERED'
      : 'ILLUSTRATIVE COMPOSITE · LOCAL';

  // The FIT scale — preview only. Measured rather than assumed, so the rehearsal
  // stays whole at any panel width, including mid divider-drag.
  //
  // `renderable.length` IS A DEPENDENCY, and leaving the equivalent out was a
  // real defect rather than a missing optimisation. The fit box is only rendered
  // once at least one page has arrived — the empty branch below returns a
  // different tree entirely — so on the first pass `fitRef.current` is null,
  // this effect bails, and NO ResizeObserver is ever attached. With deps of
  // raster alone nothing re-ran when a page landed, so `fit` stayed at its
  // initial 1 and the rehearsal rendered UNSCALED, filling the panel. It looked
  // self-correcting because any unrelated remount fixed it. The rule the two
  // occurrences of this shape produced: an effect that attaches an observer must
  // not silently no-op when its target is absent — it either takes what gates
  // the target's existence into its DEPS, or it reports that it did not attach.
  useEffect(() => {
    const box = fitRef.current;
    if (box === null) return;
    const measure = (): void => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (w <= 0 || h <= 0) return;
      setFit(Math.min(w / raster.width, h / raster.height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
  }, [raster.width, raster.height, renderable.length]);

  // The transport is live once EVERY rendered frame has booted. Gating on "any"
  // would arm PLAY while a frame was still blank, and a take-off that ran some
  // of the composite is the same partial surface in motion.
  const allReady = renderable.length > 0 && renderable.every((r) => readyIds.has(r.subject.itemId));

  /**
   * THE TRANSPORT DRIVES EVERY REHEARSING FRAME, not the selected one.
   *
   * Deliberate, and it is the same rule as the composite itself: a PLAY that
   * ran one of three frames would be a control whose word says "the rehearsal"
   * while acting on a subset — the exact defect being fixed, one control along.
   * Judging whether two graphics collide also requires running them together.
   * An operator who wants one lifecycle in isolation rehearses one row.
   */
  const driveAll = useCallback((verb: 'play' | 'next' | 'stop'): void => {
    for (const handle of handles.current.values()) handle[verb]();
  }, []);

  /*
    🔴 PUBLISHED UPWARD, so the bar that drives this stage can outlive it.

    `onTransport` is called with the drive function and the readiness whenever either changes,
    and with `null` on unmount — so a controls row rendered above an ABSENT stage knows to sit
    disabled rather than holding a stale handle. The handles themselves never leave: this hands
    out a closure over the ref, not the ref.
  */
  useEffect(() => {
    onTransport?.({ drive: driveAll, ready: allReady, count: renderable.length });
    return () => {
      onTransport?.(null);
    };
  }, [onTransport, driveAll, allReady, renderable.length]);

  if (renderable.length === 0) {
    return (
      <div style={styles.missing} role="img" aria-label="Rehearsal unavailable in this browser">
        <span>REHEARSAL UNAVAILABLE IN THIS BROWSER</span>
        <span>
          This browser has no local copy of the rendered page for{' '}
          {subjects.length === 1 ? 'that template' : 'those templates'}, so there is nothing to
          render here. Re-import{' '}
          {subjects.length === 1 ? 'it in this browser' : 'them in this browser'} to rehearse
          {subjects.length === 1 ? ' it' : ' them'}. The layers themselves are unaffected — they are
          still loaded and still muted.
        </span>
      </div>
    );
  }

  return (
    <>
      {/*
        🔴 THE TRANSPORT AND THE CAVEATS TOGGLE LEFT THIS COMPONENT (`CONSOLE-LOOK-06` §2).

        They are in `PreviewPanel`'s controls row now — the reference's `.monitor-controls`,
        a 31 px strip between the head and the stage — because the reference renders them
        ALWAYS, each disabled by its own condition, and this component only exists once there
        is something to render. Nothing about what they DO changed: the same three words in the
        same order as the row's own verbs, driving the same `CG PLAY` / `CG NEXT` / `CG STOP`
        entry points, through the same `driveAll` over the same frame handles.

        ⚠ It is not two bars. The controls row REPLACED the lifecycle bar that used to sit
        here, so the pane did not grow a strip — the caption and the caveats toggle moved into
        it beside the transport.
      */}
      <div ref={fitRef} style={styles.fitBox}>
        {/*
          Sized to the frame AS DISPLAYED (raster × fit) rather than scaled with
          it: a `transform: scale()` here would shrink the 24px squares too, and a
          transparency checker whose squares change size with the panel stops
          reading as a checker at all.
        */}
        <div
          aria-hidden
          data-rehearsal-checker
          style={{
            ...styles.checker,
            width: `${String(raster.width * fit)}px`,
            height: `${String(raster.height * fit)}px`,
          }}
        />
        {renderable.map(({ subject, html }, index) => (
          <RehearsalFrame
            key={subject.itemId}
            itemId={subject.itemId}
            html={html}
            raster={raster}
            fit={fit}
            // Straight from the ORDER, which came from the real CasparCG layer.
            zIndex={frameZIndex(index)}
            fields={subject.fields}
            position={subject.position}
            rowName={subject.rowName}
            activeLookId={subject.activeLookId}
            onReadyChange={onReadyChange}
            handleRef={(handle) => {
              if (handle === null) handles.current.delete(subject.itemId);
              else handles.current.set(subject.itemId, handle);
            }}
          />
        ))}
        {showGuides && (
          /*
            Sized to the SCALED RASTER by this caller, exactly as the checker above is — see
            `styles.guides`. `aria-hidden` and `pointer-events: none`: it is a ruler laid on the
            picture, not a thing to reach for, and a screen reader has no use for a rectangle.
          */
          <span
            aria-hidden
            data-pvw-guides=""
            style={{
              ...styles.guides,
              width: `${String(raster.width * fit)}px`,
              height: `${String(raster.height * fit)}px`,
            }}
          >
            <span style={styles.guideAction} />
            <span style={styles.guideTitle} />
          </span>
        )}
        {/*
          🔴 THE STAMP CARRIES THE TWO CAVEATS NOW, in its `title`.

          The owner removed the info icon and the on-canvas description (2026-09-12), and
          `R-022`'s acceptance still asks for two honest caveats to be stated IN the item:
          that the browser render is faithful but NOT pixel-identical to CEF's, and that a
          Live Source region is a drawn placeholder rather than video. Those are facts about
          exactly what this stamp already names, so they ride it — a hover and an accessible
          name cost no canvas at all, which is what the owner objected to.

          It therefore stops being `aria-hidden`: a `title` nothing can reach is not a
          statement. `pointerEvents: auto` for the same reason, and it is a 157 × 17 strip in
          a corner, so nothing on the picture becomes harder to reach.
        */}
        <span
          style={{ ...styles.illustrationNote, pointerEvents: 'auto' }}
          data-stage-illustration=""
          title={REHEARSAL_CAVEATS}
          aria-label={`Illustrative composite, local. ${REHEARSAL_CAVEATS}`}
        >
          {stampText}
        </span>
        {/*
          R-049 — the live-plate markers, ABOVE every frame. See `LivePlateOverlay`
          for why they are drawn over rather than behind, and for the standing note
          that none of this reopens design.md §12.2: the pages below still paint
          nothing where a Live Source is.
        */}
        <LivePlateOverlay
          placements={placements}
          raster={raster}
          fit={fit}
          zIndex={overlayZIndex(renderable.length)}
        />
      </div>
    </>
  );
}
