import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties, Ref } from 'react';
import type { FieldValues, Position } from '@cg/shared-schema';
import { positionQuery } from '@cg/shared-schema';
import type { ChannelRaster } from '@cg/shared-ipc';
import { applyOperatorPosition, type PageRuntimeWindow } from './frameEnvironment.js';

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
    // The FIT scale is composed with the centring translate so the frame scales
    // about its own centre inside the shared box. Every frame is the same size
    // (the channel raster), which is what makes ONE checker behind the whole
    // stack correct.
    transformOrigin: 'center center',
    // TRANSPARENT, not black — an opaque frame would hide both the checker and
    // every frame below it in the composite, which is the entire point of
    // compositing. The page inside paints its own background where it has one.
    background: 'transparent',
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
    <iframe
      ref={frameRef}
      title={`${rowName} rehearsal preview`}
      data-rehearsal-frame={itemId}
      srcDoc={html}
      onLoad={() => {
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
