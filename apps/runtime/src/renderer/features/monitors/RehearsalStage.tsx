import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FieldValues } from '@cg/shared-schema';
// The raster type comes from `@cg/shared-ipc` (`ChannelRaster`), not from
// `@cg/template-runtime`'s structurally-identical `Raster`: the runtime app already
// depends on shared-ipc, and adding a dependency on the template runtime here would
// pull the whole renderer into the SPA bundle to obtain one `{width, height}` type.
// The rendered page carries its own copy of that runtime, inlined.
import type { ChannelRaster } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';

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
  },
  frame: {
    border: 0,
    display: 'block',
    transformOrigin: 'center center',
    background: '#000',
    flexShrink: 0,
  },
  caveats: {
    flexShrink: 0,
    padding: '0.3rem 0.5rem',
    fontSize: '0.65rem',
    lineHeight: 1.4,
    color: colors.textMuted,
    borderTop: `1px solid ${colors.border}`,
    background: colors.panelMuted,
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

/**
 * The CasparCG globals `installCasparGlobals` puts on the rendered page's window.
 * Same-origin (`srcdoc`), so the rehearsal drives the SAME entry points `CG PLAY`
 * and `CG UPDATE` reach on air — the motion being judged is the real animation,
 * not an approximation of it.
 */
interface TemplateWindow {
  play?: (data?: string) => void;
  update?: (data?: string) => void;
  stop?: () => void;
}

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

  // The FIT scale — preview only. Measured rather than assumed, so the rehearsal
  // stays whole at any panel width, including mid divider-drag.
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
  }, [raster.width, raster.height]);

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
        THE LIFECYCLE, driven locally. "See it before air" is only half of
        rehearse; the other half is assessing MOTION, which needs the intro, the
        hold and the outro to actually run.
      */}
      <div style={styles.lifecycle}>
        <Button
          variant="secondary"
          disabled={!ready}
          onClick={() => templateWindow()?.play?.(JSON.stringify(fields))}
        >
          PLAY INTRO
        </Button>
        <Button variant="secondary" disabled={!ready} onClick={() => templateWindow()?.stop?.()}>
          PLAY OUTRO
        </Button>
      </div>
      <div ref={fitRef} style={styles.fitBox}>
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
      </div>
      <p style={styles.caveats}>
        Rehearsal — rendered in this browser at {raster.width}×{raster.height}, not on air. Faithful
        but <strong>not pixel-identical</strong> to the on-air render, and a Live Source region
        shows as a labelled placeholder, not video. Use it to check values, layout and motion — it
        is not an air check.
      </p>
    </>
  );
}
