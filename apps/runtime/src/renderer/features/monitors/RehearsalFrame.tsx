import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties, Ref } from 'react';
import type { FieldValues, Position } from '@cg/shared-schema';
import { positionQuery } from '@cg/shared-schema';
import type { ChannelRaster } from '@cg/shared-ipc';
import { applyOperatorPosition, type PageRuntimeWindow } from './frameEnvironment.js';
import { frameBox } from './rehearsalFrames.js';

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
    border: 0,
    display: 'block',
    // R-049 — the box and the FIT transform are NOT written here any more. They
    // come from the shared `frameBox`, because the live-plate overlay must land
    // on exactly these pixels and a second copy of the expression is how an
    // overlay drifts off the page beneath it. What stays here is what belongs to
    // an iframe and to nothing else.
    // TRANSPARENT, not black — an opaque frame would hide both the checker and
    // every frame below it in the composite, which is the entire point of
    // compositing. The page inside paints its own background where it has one.
    background: 'transparent',
    /**
     * ── THE OPAQUE CANVAS, AND WHY ONE WORD FIXES TWO SYMPTOMS ──────────────
     *
     * CSS Color Adjust: when the used `color-scheme` of an embedded document
     * differs from its embedder's, the UA renders the embedded document's
     * canvas OPAQUE. The console's root declares `color-scheme: dark`
     * (`@cg/ui`'s `theme.css`); the served template page declares none, so it
     * resolves `normal` → light. Every frame was a mismatch, and every frame
     * therefore carried a white canvas.
     *
     * That single fact produced both reported defects:
     *
     *   1. the flat white 16:9 area, which hid the transparency checker the
     *      operator judges alpha against;
     *   2. the composite looking broken while being CORRECT — the frames were
     *      all present and stacked in layer order, but the topmost one's opaque
     *      canvas occluded every frame beneath it, so only the highest graphic
     *      was ever visible.
     *
     * THE CANVAS IS NOT AN ELEMENT, which is why this took so long to see and
     * why the tests for it sample pixels: with the bug fully present, `html`,
     * `body` and `.cg-stage` all measure `rgba(0, 0, 0, 0)` while the box
     * renders white. No computed style reports a canvas.
     *
     * `light` MATCHES THE FRAME TO THE PAGE, never the page to the frame. It is
     * a property of the embedding ENVIRONMENT, set on an element this panel
     * owns, because the opacity is imposed by the embedder relationship and not
     * by the document — the alternative (writing `colorScheme` onto the served
     * document's root) reaches into the page and edges toward a preview-only
     * variant of it, which is exactly what PVW's fidelity claim forbids. Only
     * one of the two directions is implemented, deliberately: two mechanisms
     * for one effect is how the next person inherits a page that is transparent
     * for a reason nobody can name.
     *
     * It is also the more faithful choice on its own terms. `light` is what a
     * browser gives a document that declares no scheme — what this page gets
     * standalone, and what CEF's transparent composite corresponds to. The
     * `dark` it inherited was the OPERATOR CONSOLE's theme leaking into the
     * graphic's rendering environment, which a broadcast preview must not do.
     *
     * ON THE STYLE OBJECT, not a post-load pass. Rows enter and leave rehearse
     * at will and the composite builds one frame per rehearsing row, so a fix
     * that swept the frames existing at some moment would be the same bug with
     * a longer fuse. This is spread into every `<iframe>` this component
     * renders, so it cannot miss one.
     */
    colorScheme: 'light',
  },
} as const satisfies Record<string, CSSProperties>;

/**
 * The CasparCG globals `installCasparGlobals` puts on the rendered page's
 * window. Same-origin (`srcdoc`), so the rehearsal drives the SAME entry points
 * `CG PLAY` and `CG UPDATE` reach on air — the motion being judged is the real
 * animation, not an approximation of it.
 */
interface TemplateWindow extends PageRuntimeWindow {
  play?: (data?: string) => void;
  update?: (data?: string) => void;
  /** `CG NEXT`'s entry point — a multi-step template's advance. */
  next?: () => void;
  stop?: () => void;
}

/** The transport a parent can drive on this frame. */
export interface RehearsalFrameHandle {
  play: () => void;
  next: () => void;
  stop: () => void;
}

interface Props {
  itemId: string;
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
}

export function RehearsalFrame({
  itemId,
  html,
  raster,
  fit,
  zIndex,
  fields,
  position,
  rowName,
  handleRef,
  onReadyChange,
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
    }),
    [templateWindow, fields],
  );

  // Re-arm on a template change: a fresh document has not booted yet.
  useEffect(() => {
    setReady(false);
  }, [html]);

  // THE CLEANUP IS NOT TIDINESS. Without it an unmounting frame leaves its id in
  // the stage's ready set, so a row that leaves rehearse and comes back is
  // counted as booted the instant it remounts — and the transport is armed
  // against a document that has not run yet. `window.play` is not defined on a
  // blank page, so the optional call would no-op and the operator would see PLAY
  // run the composite with one graphic sitting still. Silent, and exactly the
  // "some rows and not others" shape.
  useEffect(() => {
    onReadyChange?.(itemId, ready);
    return () => {
      onReadyChange?.(itemId, false);
    };
  }, [onReadyChange, itemId, ready]);

  // Push the operator's CURRENT values whenever they change, so an edit is
  // visible immediately — that responsiveness is most of what rehearse is for.
  // It goes through `window.update` with a JSON string, which is byte-for-byte
  // the payload shape `CG UPDATE` delivers on air.
  useEffect(() => {
    if (!ready) return;
    templateWindow()?.update?.(JSON.stringify(fields));
  }, [ready, fields, templateWindow]);

  // THE POSITION EDIT REACHING THE PREVIEW. `ready` and the placement are BOTH
  // dependencies, and that pairing is what makes an Apply visible: `ready`
  // covers the first placement after a boot, the placement covers every later
  // Apply on an already-booted page. Neither alone is enough — with only
  // `ready`, an Apply changed nothing until something happened to remount the
  // frame, which is why typing into an unrelated Inspector field looked like it
  // "fixed" the preview.
  //
  // KEYED ON THE PLACEMENT'S VALUE, NOT THE OBJECT'S IDENTITY. `position` is a
  // fresh object out of every bridge stack push, so depending on it directly
  // re-placed every frame in the composite on every unrelated push — including
  // frames whose row nobody had touched. `applyOutputPosition` is idempotent so
  // nothing moved, but "only the edited row's frame is written to" would have
  // been true of the intent and false of the code, and the next person to make
  // that function non-idempotent would have found out the hard way.
  //
  // ONLY THE FRAME WHOSE PLACEMENT CHANGED RE-RUNS. This effect is per frame, so
  // applying a position to the selected row leaves every other frame's document
  // untouched — the composite does not re-place graphics nobody edited.
  const placementKey = position === undefined ? null : positionQuery(position);
  useEffect(() => {
    if (!ready) return;
    const frame = frameRef.current;
    if (frame === null) return;
    applyOperatorPosition(
      frame.contentWindow as TemplateWindow | null,
      frame.contentDocument,
      // Re-derived from the key rather than closed over, so the value the effect
      // applies is the one its dependency describes — they cannot drift.
      placementKey === null ? undefined : position,
    );
    // `position` is deliberately absent from the deps: `placementKey` is its
    // value, and adding the object back would restore the identity churn above.
  }, [ready, placementKey]);

  return (
    /*
      NAMED BY `aria-label`, NOT BY `title`, and the difference is the whole
      reason for the disable below: `title` on an iframe doubles as a NATIVE
      TOOLTIP, and these frames cover most of the panel — so hovering anywhere
      over the rehearsal popped up "Layer 1 rehearsal preview" on top of the
      graphic being judged. `aria-label` gives the frame the same accessible
      name with nothing on hover.

      `jsx-a11y/iframe-has-title` matches on the `title` prop specifically. What
      it is asking for is an accessible name, which this has; the rule simply
      does not know the other spelling.
    */
    // eslint-disable-next-line jsx-a11y/iframe-has-title
    <iframe
      ref={frameRef}
      aria-label={`${rowName} rehearsal preview`}
      data-rehearsal-frame={itemId}
      srcDoc={html}
      onLoad={() => {
        setReady(true);
      }}
      style={{
        // Sized to the CHANNEL RASTER and fitted by the shared transform — the
        // size is what makes the page inside place itself exactly as it will on
        // air (R-030 geometry step 2 reads `window.innerWidth`/`innerHeight`,
        // which inside a frame is this box), and the fit is preview-only. A CSS
        // transform on the ELEMENT cannot change what the document inside
        // measures, which is why the two scales stay apart.
        ...frameBox(raster, fit),
        ...styles.frame,
        zIndex,
      }}
    />
  );
}
