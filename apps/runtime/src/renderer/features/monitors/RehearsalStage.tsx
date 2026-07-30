import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Info } from 'lucide-react';
// The raster type comes from `@cg/shared-ipc` (`ChannelRaster`), not from
// `@cg/template-runtime`'s structurally-identical `Raster`: the runtime app already
// depends on shared-ipc, and adding a dependency on the template runtime here would
// pull the whole renderer into the SPA bundle to obtain one `{width, height}` type.
// The rendered page carries its own copy of that runtime, inlined.
import type { ChannelRaster } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { RehearsalFrame, type RehearsalFrameHandle } from './RehearsalFrame.js';
import { frameZIndex, rehearsalCaption, type RehearsalSubject } from './rehearsalFrames.js';

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
 * (the B-066 class), and after C-015 a Live Source region renders as a labelled
 * placeholder rather than video. Rehearse catches wrong values, broken layouts
 * and bad motion; it is not a confidence monitor (that is C-016). Those caveats
 * are stated IN the panel below and not only in this comment — R-022's own
 * acceptance requires it, and it matters more precisely because rehearse looks
 * authoritative.
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
    background: '#000',
    overflow: 'hidden',
    position: 'relative' as const,
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
    background: '#3d4253',
    backgroundImage:
      `linear-gradient(45deg, #5b6075 25%, transparent 25%),` +
      `linear-gradient(-45deg, #5b6075 25%, transparent 25%),` +
      `linear-gradient(45deg, transparent 75%, #5b6075 75%),` +
      `linear-gradient(-45deg, transparent 75%, #5b6075 75%)`,
    backgroundSize: '48px 48px',
    backgroundPosition: '0 0, 0 24px, 24px -24px, -24px 0',
  },
  /**
   * The caveats, ON DEMAND. They used to be a permanent strip under the frame.
   *
   * R-022's acceptance requires these caveats to be stated IN the panel, so they
   * are DISCLOSED, not deleted — the operator still reaches them without leaving
   * the surface, and assistive tech reaches them through the toggle's
   * `aria-expanded` pairing. What changed is that they no longer bill the monitor
   * for permanent height: PVW is the smallest surface on this console and a fixed
   * four-line footnote was taking that space from the thing being judged.
   *
   * OVERLAID rather than in flow, for the same reason — an in-flow panel would
   * shrink the frame on open, so reading the note would change the geometry the
   * note is ABOUT.
   */
  caveats: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    padding: '0.45rem 0.6rem',
    fontSize: '0.65rem',
    lineHeight: 1.4,
    color: colors.textMuted,
    borderTop: `1px solid ${colors.border}`,
    background: colors.panelMuted,
    zIndex: 3,
  },
  /** Pushes the info toggle to the trailing end of the lifecycle bar. */
  lifecycleSpacer: { flex: 1 },
  /**
   * What the transport acts on, said on the surface. With several rows
   * rehearsing, a bar reading only PLAY / NEXT / STOP would leave the operator
   * guessing WHICH graphic it drives — the same silently-partial reading the
   * single-frame panel invited.
   */
  caption: {
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  missing: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.3rem',
    background: '#000',
    color: colors.offline,
    fontSize: '0.7rem',
    textAlign: 'center' as const,
    padding: '0.75rem',
  },
} as const satisfies Record<string, CSSProperties>;

/** Ties the caveats disclosure to its toggle for assistive tech. */
const CAVEATS_ID = 'rehearsal-caveats';

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
}

export function RehearsalStage({ subjects, htmlByItem, raster }: Props): JSX.Element {
  const fitRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(1);
  // Collapsed by default: the caveats are a thing to CONSULT, not a thing to read
  // every time. Deliberately not persisted — it costs one click and a remembered
  // "open" would quietly re-introduce the permanent strip this replaced.
  const [showCaveats, setShowCaveats] = useState(false);

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
  const unavailable = subjects.length - renderable.length;

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
        THE TRANSPORT, driven locally. "See it before air" is only half of
        rehearse; the other half is assessing MOTION, which needs the intro, the
        steps and the outro to actually run.

        NAMED PLAY / NEXT / STOP — the same three words, in the same order, as the
        row's own verbs. The buttons used to read PLAY INTRO / PLAY OUTRO, which
        described the ANIMATION rather than the action and left the operator
        translating between two vocabularies for one lifecycle. They drive the
        very entry points `CG PLAY`, `CG NEXT` and `CG STOP` reach on air, so the
        row's words are the accurate ones — and NEXT, which the template's
        lifecycle has always had, had no control here at all.
      */}
      <div style={styles.lifecycle}>
        <Button
          variant="secondary"
          disabled={!allReady}
          aria-label={
            renderable.length === 1 ? 'PLAY' : `PLAY all ${String(renderable.length)} rehearsing`
          }
          onClick={() => {
            driveAll('play');
          }}
        >
          PLAY
        </Button>
        <Button
          variant="secondary"
          disabled={!allReady}
          aria-label={
            renderable.length === 1 ? 'NEXT' : `NEXT on all ${String(renderable.length)} rehearsing`
          }
          onClick={() => {
            driveAll('next');
          }}
        >
          NEXT
        </Button>
        <Button
          variant="secondary"
          disabled={!allReady}
          aria-label={
            renderable.length === 1 ? 'STOP' : `STOP all ${String(renderable.length)} rehearsing`
          }
          onClick={() => {
            driveAll('stop');
          }}
        >
          STOP
        </Button>
        <span style={styles.caption} data-rehearsal-caption>
          {rehearsalCaption(renderable.length, subjects.length)}
        </span>
        <span style={styles.lifecycleSpacer} />
        {/*
          The caveats toggle. Trailing end of the lifecycle bar, away from the
          transport buttons — this is a disclosure, and it must not sit where a
          thumb reaching for STOP can land on it.
        */}
        <Button
          variant="ghost"
          aria-expanded={showCaveats}
          aria-controls={CAVEATS_ID}
          aria-label={
            showCaveats ? 'Hide what rehearsal does not prove' : 'What rehearsal does not prove'
          }
          title="What rehearsal does not prove"
          onClick={() => {
            setShowCaveats((open) => !open);
          }}
        >
          <Icon icon={Info} />
        </Button>
      </div>
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
            onReadyChange={onReadyChange}
            handleRef={(handle) => {
              if (handle === null) handles.current.delete(subject.itemId);
              else handles.current.set(subject.itemId, handle);
            }}
          />
        ))}
        {showCaveats && (
          <p id={CAVEATS_ID} style={styles.caveats}>
            Rehearsal — rendered in this browser at {raster.width}×{raster.height}, not on air.
            Faithful but <strong>not pixel-identical</strong> to the on-air render, and a Live
            Source region shows as a labelled placeholder, not video. Only{' '}
            <strong>rehearsing</strong> rows are shown, composited in channel layer order — nothing
            that is on air is composited here. CasparCG composites each template over a{' '}
            <strong>transparent base</strong>; a browser instead forces an opaque canvas on an
            embedded page whose colour scheme differs from the page embedding it, so this panel
            matches the two — without that, every graphic would sit on flat white and hide the ones
            below it. Use it to check values, layout and motion — it is not an air check.
            {unavailable > 0 && (
              <>
                {' '}
                <strong>
                  {unavailable} rehearsing {unavailable === 1 ? 'row is' : 'rows are'} not shown
                </strong>
                : this browser holds no local copy of{' '}
                {unavailable === 1 ? 'that page' : 'those pages'}.
              </>
            )}
          </p>
        )}
      </div>
    </>
  );
}
