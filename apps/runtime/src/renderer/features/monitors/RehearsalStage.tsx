import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Info } from 'lucide-react';
import type { FieldValues } from '@cg/shared-schema';
// The raster type comes from `@cg/shared-ipc` (`ChannelRaster`), not from
// `@cg/template-runtime`'s structurally-identical `Raster`: the runtime app already
// depends on shared-ipc, and adding a dependency on the template runtime here would
// pull the whole renderer into the SPA bundle to obtain one `{width, height}` type.
// The rendered page carries its own copy of that runtime, inlined.
import type { ChannelRaster } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';

/**
 * R-022 — the rehearsal render: the loaded graphic, with the operator's CURRENT
 * field values, rendered LOCALLY IN THIS BROWSER. Nothing is sent to CasparCG.
 *
 * ── WHAT IS RENDERED, AND WHY IT IS THE SERVED PAGE ──────────────────────────
 *
 * Not a re-built scene — the RETAINED SELF-CONTAINED HTML, the byte-identical page
 * the bridge serves to CasparCG for this template (`LibraryStore` already keeps it,
 * persisted, because it is re-delivered to the bridge on every reconnect). That
 * page inlines `@cg/template-runtime`, the scene and every asset, so rehearsing it
 * exercises the same renderer the Designer preview uses AND the same boot the on-air
 * producer runs.
 *
 * Rendering the served page rather than re-deriving a scene buys three things that
 * matter more than the code it saves:
 *
 *   1. There is no second render path to drift from air. A rehearsal that composed
 *      the scene itself would be a parallel implementation of the boot, and the
 *      first divergence would be invisible — a preview that lies is worse than one
 *      that abstains.
 *   2. It needs no scene retention, so it works for a template imported in ANOTHER
 *      browser and after a page reload, which a browser-local scene store would not.
 *   3. Placement comes out right for free. See below.
 *
 * ── THE IFRAME IS SIZED TO THE CHANNEL RASTER, AND THAT IS THE PLACEMENT ─────
 *
 * The page places itself at boot via `applyOutputPosition`, whose R-030 geometry
 * chain is: the `?cw=&ch=` query, else `window.innerWidth`/`innerHeight`, else the
 * reference frame. Inside an iframe, `window.innerWidth`/`innerHeight` ARE the
 * iframe's box — so sizing the iframe to the channel's real raster makes the page
 * compute exactly the placement it will compute on air, with no query to plumb and
 * no placement maths duplicated here. The visual fit into a small panel is a
 * separate CSS `transform: scale()` on the iframe element, which cannot perturb
 * what the page inside measures.
 *
 * Two scales, kept apart on purpose:
 *   - the AIR scale lives INSIDE the page (reference frame → raster). Real placement.
 *   - the FIT scale lives on the iframe ELEMENT (raster → panel). Preview only.
 * Collapsing them would work on screen and destroy the thing being rehearsed: the
 * operator's placement would be expressed in panel pixels.
 *
 * `srcdoc` (not a blob URL) so the frame inherits this document's origin: that is
 * what lets the lifecycle be driven below. It is also sandbox-free BY NECESSITY —
 * the page must run its own scripts — and safe to be, because the HTML is one this
 * app produced from a signature-verified `.vcg`, never third-party content.
 *
 * ── NOT AN AIR CHECK ─────────────────────────────────────────────────────────
 *
 * Browser rendering versus CasparCG's CEF 71 is faithful but NOT pixel-identical
 * (the B-066 class), and after C-015 a Live Source region renders as a labelled
 * placeholder rather than video. Rehearse catches wrong values, broken layouts and
 * bad motion; it is not a confidence monitor (that is C-016). Those caveats are
 * stated IN the panel below and not only in this comment — R-022's own acceptance
 * requires it, and it matters more precisely because rehearse looks authoritative.
 */

const styles = {
  lifecycle: {
    flexShrink: 0,
    display: 'flex',
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
   * The CHECKER, behind the frame — the SAME one the Designer's authoring
   * surface and broadcast preview use (`#5b6075` on `#3d4253`, 24px), so a
   * graphic looks the same in the two places an operator judges it.
   *
   * It is not decoration. These are KEYED graphics: they go to air over video,
   * and the part of the frame that matters most is the part that is TRANSPARENT.
   * Against the flat black this used to paint, transparent and black-filled are
   * indistinguishable — an operator could not see that a lower-third's backing
   * plate had gone opaque and would blank the shot behind it. The checker is what
   * makes alpha visible, and it must be under the frame rather than on it.
   */
  checker: {
    position: 'absolute' as const,
    // Centred and sized to the SCALED FRAME by the caller — not `inset: 0`.
    //
    // Covering the whole fit box put the checker in the SURROUND, where there is
    // no graphic, and left the frame itself reading flat white. The checker is a
    // transparency backdrop: it belongs behind the RASTER and nowhere else, so
    // that what shows through is the page's own alpha. The surround stays black,
    // because black is the honest colour for "outside the frame".
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    background: '#3d4253',
    backgroundImage:
      `linear-gradient(45deg, #5b6075 25%, transparent 25%),` +
      `linear-gradient(-45deg, #5b6075 25%, transparent 25%),` +
      `linear-gradient(45deg, transparent 75%, #5b6075 75%),` +
      `linear-gradient(-45deg, transparent 75%, #5b6075 75%)`,
    backgroundSize: '48px 48px',
    backgroundPosition: '0 0, 0 24px, 24px -24px, -24px 0',
  },
  frame: {
    border: 0,
    display: 'block',
    transformOrigin: 'center center',
    // TRANSPARENT, not black — an opaque frame would hide the checker behind it
    // and put the alpha back out of reach. The page inside is the retained
    // self-contained one, which paints its own background where it has one.
    background: 'transparent',
    flexShrink: 0,
    position: 'relative' as const,
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
    zIndex: 2,
  },
  /** Pushes the info toggle to the trailing end of the lifecycle bar. */
  lifecycleSpacer: { flex: 1 },
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

/**
 * The CasparCG globals `installCasparGlobals` puts on the rendered page's window.
 * Same-origin (`srcdoc`), so the rehearsal drives the SAME entry points `CG PLAY`
 * and `CG UPDATE` reach on air — the motion being judged is the real animation,
 * not an approximation of it.
 */
interface TemplateWindow {
  play?: (data?: string) => void;
  update?: (data?: string) => void;
  /** `CG NEXT`'s entry point — a multi-step template's advance. */
  next?: () => void;
  stop?: () => void;
}

/** Ties the caveats disclosure to its toggle for assistive tech. */
const CAVEATS_ID = 'rehearsal-caveats';

interface Props {
  /**
   * The retained self-contained HTML for the rehearsing item's template, or null
   * when this browser has no copy. Null renders an honest empty state — never a
   * blank black box that could be mistaken for a rendered graphic.
   */
  html: string | null;
  /** The channel's real raster (R-030). The iframe is sized to it. */
  raster: ChannelRaster;
  /** The operator's current (possibly unapplied) field values for the item. */
  fields: FieldValues;
  /** Row label, for the accessible name. */
  rowName: string;
}

export function RehearsalStage({ html, raster, fields, rowName }: Props): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const fitRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(1);
  const [ready, setReady] = useState(false);
  // Collapsed by default: the caveats are a thing to CONSULT, not a thing to read
  // every time. Deliberately not persisted — it costs one click and a remembered
  // "open" would quietly re-introduce the permanent strip this replaced.
  const [showCaveats, setShowCaveats] = useState(false);

  // The FIT scale — preview only. Measured rather than assumed, so the rehearsal
  // stays whole at any panel width, including mid divider-drag.
  //
  // `html` IS A DEPENDENCY, and leaving it out was a real defect rather than a
  // missing optimisation. The fit box is only rendered once a page has arrived —
  // the `html === null` branch below returns a different tree entirely — so on the
  // first pass `fitRef.current` is null, this effect bails, and NO ResizeObserver
  // is ever attached. With deps of raster alone nothing re-ran when the page
  // landed, so `fit` stayed at its initial 1 and the rehearsal rendered UNSCALED,
  // filling the panel. It looked self-correcting because any unrelated remount
  // fixed it: `PreviewPanel` keys this component on the draft version, so typing a
  // single character into any Inspector field remounted it — by which time `html`
  // was already present and the observer attached. The bug was invisible in the
  // one state an operator reaches by touching something.
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
  }, [raster.width, raster.height, html]);

  const templateWindow = useCallback((): TemplateWindow | null => {
    const frame = frameRef.current;
    return (frame?.contentWindow as TemplateWindow | null | undefined) ?? null;
  }, []);

  // Push the operator's CURRENT values whenever they change, so an edit is visible
  // immediately — that responsiveness is most of what rehearse is for. It goes
  // through `window.update` with a JSON string, which is byte-for-byte the payload
  // shape `CG UPDATE` delivers on air.
  useEffect(() => {
    if (!ready) return;
    templateWindow()?.update?.(JSON.stringify(fields));
  }, [ready, fields, templateWindow]);

  // Re-arm on a template change: a fresh document has not booted yet.
  useEffect(() => {
    setReady(false);
  }, [html]);

  if (html === null) {
    return (
      <div style={styles.missing} role="img" aria-label={`${rowName} — rehearsal unavailable`}>
        <span>REHEARSAL UNAVAILABLE IN THIS BROWSER</span>
        <span>
          This browser has no local copy of that template’s rendered page, so there is nothing to
          render here. Re-import it in this browser to rehearse it. The layer itself is unaffected —
          it is still loaded and still muted.
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
          disabled={!ready}
          onClick={() => templateWindow()?.play?.(JSON.stringify(fields))}
        >
          PLAY
        </Button>
        <Button variant="secondary" disabled={!ready} onClick={() => templateWindow()?.next?.()}>
          NEXT
        </Button>
        <Button variant="secondary" disabled={!ready} onClick={() => templateWindow()?.stop?.()}>
          STOP
        </Button>
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
          onClick={() => setShowCaveats((open) => !open)}
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
          style={{
            ...styles.checker,
            width: `${String(raster.width * fit)}px`,
            height: `${String(raster.height * fit)}px`,
          }}
        />
        <iframe
          ref={frameRef}
          title={`${rowName} rehearsal preview`}
          srcDoc={html}
          onLoad={() => setReady(true)}
          style={{
            ...styles.frame,
            // Sized to the CHANNEL RASTER — this is what makes the page inside
            // place itself exactly as it will on air (R-030 geometry step 2 reads
            // `window.innerWidth`/`innerHeight`, which inside a frame is this box).
            width: `${String(raster.width)}px`,
            height: `${String(raster.height)}px`,
            // Preview-only fit. A CSS transform on the ELEMENT cannot change what
            // the document inside measures, which is why the two scales stay apart.
            transform: `scale(${String(fit)})`,
          }}
        />
        {showCaveats && (
          <p id={CAVEATS_ID} style={styles.caveats}>
            Rehearsal — rendered in this browser at {raster.width}×{raster.height}, not on air.
            Faithful but <strong>not pixel-identical</strong> to the on-air render, and a Live
            Source region shows as a labelled placeholder, not video. Use it to check values, layout
            and motion — it is not an air check.
          </p>
        )}
      </div>
    </>
  );
}
