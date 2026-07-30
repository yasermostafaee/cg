import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties, Ref } from 'react';
import type { FieldValues, Position } from '@cg/shared-schema';
import { positionQuery } from '@cg/shared-schema';
import type { ChannelRaster } from '@cg/shared-ipc';

/**
 * R-022 — ONE rehearsing row's frame: the retained self-contained page, in a
 * same-origin iframe sized to the channel raster.
 *
 * Extracted from `RehearsalStage` when PVW became a COMPOSITE. The stage owns
 * the fit box, the checker and the transport; this owns one page's boot, its
 * value pushes, its placement and its environment. One instance per rehearsing
 * row, all absolutely positioned in the same box.
 */

const styles = {
  frame: {
    position: 'absolute' as const,
    left: '50%',
    top: '50%',
    border: 0,
    display: 'block',
    // The FIT scale is composed with the centring translate, in that order, so
    // the frame scales about its own centre inside the shared box. Sizing the
    // frames identically (they are all the channel raster) is what makes one
    // checker behind the whole stack correct.
    transformOrigin: 'center center',
    // TRANSPARENT, not black — an opaque frame would hide both the checker and
    // every frame below it in the composite, which is the entire point of
    // compositing. The page inside paints its own background where it has one.
    background: 'transparent',
  },
} as const satisfies Record<string, CSSProperties>;

/**
 * The CasparCG globals `installCasparGlobals` puts on the rendered page's
 * window, plus the `CG` bundle namespace the exported boot itself calls.
 * Same-origin (`srcdoc`), so the rehearsal drives the SAME entry points
 * `CG PLAY` and `CG UPDATE` reach on air — the motion being judged is the real
 * animation, not an approximation of it.
 */
interface TemplateWindow {
  play?: (data?: string) => void;
  update?: (data?: string) => void;
  /** `CG NEXT`'s entry point — a multi-step template's advance. */
  next?: () => void;
  stop?: () => void;
  /**
   * The page's own `@cg/template-runtime`, inlined by the exporter under the
   * IIFE global `CG`. Declared STRUCTURALLY and as narrowly as this file uses
   * it, rather than by importing the package: the runtime SPA deliberately does
   * not depend on `@cg/template-runtime` (that dependency would pull the whole
   * renderer into this bundle for one function type), and the page carries its
   * own copy regardless — the copy that runs on air is the one we want called.
   */
  CG?: {
    applyOutputPosition?: (
      scene: { resolution: { width: number; height: number } },
      options: { search?: string },
    ) => void;
  };
}

/** The transport a parent can drive on this frame. */
export interface RehearsalFrameHandle {
  play: () => void;
  next: () => void;
  stop: () => void;
  /** False until the page has booted; the transport is disabled until then. */
  ready: boolean;
}

interface Props {
  /** The retained self-contained HTML — byte-identical to what the bridge serves. */
  html: string;
  /** The channel's real raster (R-030). The iframe is sized to it. */
  raster: ChannelRaster;
  /** Preview-only fit scale, applied to the iframe ELEMENT. */
  fit: number;
  /** Stacking order within the composite — higher CasparCG layer draws on top. */
  zIndex: number;
  /** The operator's current (possibly unapplied) field values for the item. */
  fields: FieldValues;
  /** The operator's applied placement override (R-011), when the item has one. */
  position: Position | undefined;
  /** Row label, for the accessible name. */
  rowName: string;
  handleRef?: Ref<RehearsalFrameHandle>;
  /** Told whenever this frame's readiness flips, so the stage can gate its transport. */
  onReadyChange?: (itemId: string, ready: boolean) => void;
  itemId: string;
}

/**
 * ── THE ENVIRONMENT'S TRANSPARENT BASE ───────────────────────────────────────
 *
 * CasparCG's CEF is configured with a TRANSPARENT base background; an ordinary
 * Chrome document is not — its base canvas is WHITE. The same page is therefore
 * transparent on air and white-based in this iframe, which made the checker
 * flash and then vanish behind a white 16:9 area, and left the operator unable
 * to read a graphic against it. The export is fine; CasparCG shows no white
 * page. This is a browser difference, not a page defect.
 *
 * So the base is reproduced ON THE FRAME'S DOCUMENT, never by forking or
 * parameterising the served page: PVW's whole fidelity claim rests on rendering
 * the byte-identical page the bridge gives CasparCG, and a preview-specific
 * variant of it would quietly become a second implementation to drift from air.
 * A transparent base is an attribute of the ENVIRONMENT — which is exactly what
 * an iframe is here — so that is where it is applied.
 *
 * Injected as the FIRST stylesheet in the document rather than as an inline
 * style on `html`/`body`, and that ordering is the honest part: it is a BASE,
 * so any background the page itself declares must still win. An inline style
 * would have overridden a real page background and hidden a genuine authoring
 * mistake — the opposite of what a rehearsal is for.
 */
const TRANSPARENT_BASE_ID = 'cg-rehearsal-transparent-base';

function applyTransparentBase(doc: Document): void {
  if (doc.getElementById(TRANSPARENT_BASE_ID) !== null) return;
  const style = doc.createElement('style');
  style.id = TRANSPARENT_BASE_ID;
  style.textContent = 'html,body{background:transparent}';
  const head = doc.head;
  // FIRST child: lowest cascade order among equal-specificity rules, so the
  // page overrides it and not the other way round.
  head.insertBefore(style, head.firstChild);
}

/**
 * ── THE OPERATOR'S PLACEMENT OVERRIDE (R-011), AND WHY IT NEEDS DOING AT ALL ─
 *
 * On air the override rides the SERVED URL's query and the page reads it at
 * boot: `CG.applyOutputPosition(scene, { search: location.search })`. The
 * rehearsal frame is a `srcdoc` document, whose URL is `about:srcdoc` and whose
 * `location.search` is therefore ALWAYS empty — so the boot resolved the
 * override to null and placed the graphic at its AUTHORED position, every time,
 * no matter what the operator applied. That is the whole of the bug: the
 * override never reached the frame.
 *
 * It cannot be fixed by giving the frame a URL. A `srcdoc` document has none to
 * give, a blob URL cannot carry a query at all (the blob store lookup is by
 * exact serialisation), and the bridge's real served URL is cross-origin — which
 * would cost the lifecycle driving, the value pushes and the transparent base
 * above, i.e. the feature.
 *
 * So the override is handed to the page's OWN `applyOutputPosition` — the exact
 * function the on-air boot calls, from the page's own inlined runtime — with the
 * exact query string the bridge appends, built by the one shared
 * `positionQuery`. No placement maths is computed here and there is no second
 * implementation: this file decides only WHICH string to pass, never where the
 * graphic lands.
 *
 * `scene.resolution` is read back from the page's own `.cg-stage`, whose inline
 * width/height `buildScene` wrote from the scene itself — a fact the page
 * states about itself, not one reconstructed from the panel's own data (the
 * renderer genuinely does not hold the scene: a template imported in a previous
 * session has none). Layout, so the fit transform cannot perturb it.
 *
 * NOT CALLED WHEN THERE IS NO OVERRIDE, deliberately. `resolveOutputPosition`
 * falls back to `scene.defaultPosition`, which is inside the page and not
 * available here — calling with an empty search would resolve to CENTERED and
 * MOVE a correctly-placed graphic. With no override the boot's own placement is
 * already right, so the honest action is none.
 */
function applyOperatorPosition(frame: HTMLIFrameElement, position: Position | undefined): void {
  if (position === undefined) return;
  const win = frame.contentWindow as TemplateWindow | null;
  const doc = frame.contentDocument;
  if (win?.CG?.applyOutputPosition === undefined || doc === null) return;
  const stage = doc.querySelector<HTMLElement>('.cg-stage');
  if (stage === null) return;
  const width = Number.parseFloat(stage.style.width);
  const height = Number.parseFloat(stage.style.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  // No `cw`/`ch`: the frame IS the channel raster, so the page's own R-030
  // chain falls through to `window.innerWidth`/`innerHeight` and reads the box
  // we sized. One geometry source, and it is the real one.
  win.CG.applyOutputPosition(
    { resolution: { width, height } },
    { search: `?${positionQuery(position)}` },
  );
}

export function RehearsalFrame({
  html,
  raster,
  fit,
  zIndex,
  fields,
  position,
  rowName,
  handleRef,
  onReadyChange,
  itemId,
}: Props): JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);

  const templateWindow = useCallback((): TemplateWindow | null => {
    return (frameRef.current?.contentWindow as TemplateWindow | null | undefined) ?? null;
  }, []);

  useImperativeHandle(
    handleRef,
    () => ({
      play: () => templateWindow()?.play?.(JSON.stringify(fields)),
      next: () => templateWindow()?.next?.(),
      stop: () => templateWindow()?.stop?.(),
      ready,
    }),
    [templateWindow, fields, ready],
  );

  // Re-arm on a template change: a fresh document has not booted yet.
  useEffect(() => {
    setReady(false);
  }, [html]);

  useEffect(() => {
    onReadyChange?.(itemId, ready);
  }, [onReadyChange, itemId, ready]);

  // Push the operator's CURRENT values whenever they change, so an edit is
  // visible immediately — that responsiveness is most of what rehearse is for.
  // It goes through `window.update` with a JSON string, which is byte-for-byte
  // the payload shape `CG UPDATE` delivers on air.
  useEffect(() => {
    if (!ready) return;
    templateWindow()?.update?.(JSON.stringify(fields));
  }, [ready, fields, templateWindow]);

  // THE POSITION EDIT REACHING THE PREVIEW. `ready` and `position` are BOTH
  // dependencies, and that pairing is the fix for the second half of the bug:
  // `ready` covers the first placement after a boot, `position` covers every
  // later Apply on an already-booted page. Neither alone is enough — with only
  // `ready` an Apply changed nothing until something remounted the frame, which
  // is why typing into an unrelated Inspector field appeared to "fix" it.
  //
  // Only the frame whose subject changed re-runs: this effect lives per frame,
  // so applying a position to the selected row leaves every other frame's
  // document untouched.
  useEffect(() => {
    if (!ready) return;
    const frame = frameRef.current;
    if (frame === null) return;
    applyOperatorPosition(frame, position);
  }, [ready, position]);

  return (
    <iframe
      ref={frameRef}
      title={`${rowName} rehearsal preview`}
      srcDoc={html}
      onLoad={() => {
        const frame = frameRef.current;
        if (frame?.contentDocument != null) applyTransparentBase(frame.contentDocument);
        setReady(true);
      }}
      style={{
        ...styles.frame,
        zIndex,
        // Sized to the CHANNEL RASTER — this is what makes the page inside place
        // itself exactly as it will on air (R-030 geometry step 2 reads
        // `window.innerWidth`/`innerHeight`, which inside a frame is this box).
        width: `${String(raster.width)}px`,
        height: `${String(raster.height)}px`,
        // Preview-only fit, composed with the centring translate. A CSS
        // transform on the ELEMENT cannot change what the document inside
        // measures, which is why the two scales stay apart.
        transform: `translate(-50%, -50%) scale(${String(fit)})`,
      }}
    />
  );
}
