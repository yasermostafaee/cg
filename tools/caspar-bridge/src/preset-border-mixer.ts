import type {
  FrameTransitionPhase,
  LiveSourceRect,
  PresetTransitionFrame,
} from '@cg/shared-schema';
import type { NormalizedRect } from './live-layers.js';

export const PRESET_BORDER_EDGES = 4;

export function nativePresetBorderColor(color: string | undefined): string | undefined {
  return color !== undefined && /^#[0-9a-f]{6}(ff)?$/i.test(color) ? color.slice(0, 7) : undefined;
}

/** A square-corner border composed of nonoverlapping native colour strips.
 *
 * The authored width is relative to the height of the plate. All four
 * rectangles are affine in the plate rect, so a single tween keeps their
 * inner and outer edges together even when the plate changes aspect.
 */
export function presetBorderRects(
  box: NormalizedRect,
  widthRatio: number,
  outputAspect: number,
): readonly NormalizedRect[] | undefined {
  const { x, y, width, height } = box;
  const vertical = height * widthRatio;
  const horizontal = vertical / outputAspect;
  if (!(width > horizontal * 2 && height > vertical * 2)) return undefined;
  return [
    { x, y, width, height: vertical },
    { x, y: y + height - vertical, width, height: vertical },
    { x, y: y + vertical, width: horizontal, height: height - vertical * 2 },
    {
      x: x + width - horizontal,
      y: y + vertical,
      width: horizontal,
      height: height - vertical * 2,
    },
  ];
}

export type NativePresetBorderPhase = 'departure' | 'move' | 'arrival';
type MotionFrame = FrameTransitionPhase['frames'][number];

/** Captured geometry and border visibility for one authored look. */
export interface NativePresetBorderLook {
  readonly id: string;
  readonly rects: Readonly<Record<string, LiveSourceRect>>;
  readonly focused?: boolean;
  readonly fallbacks?: readonly string[] | undefined;
  readonly transitionFrames?:
    | Readonly<Record<string, Pick<PresetTransitionFrame, 'frameKey'>>>
    | undefined;
  readonly borderVisible: (plateId: string) => boolean;
}

export interface NativePresetBorderArtwork {
  readonly plateIds: readonly string[];
  /** A real seated picture, excluding plates handled entirely by HTML fallback. */
  readonly nativePlateIds: ReadonlySet<string>;
  readonly slideFrames?: readonly MotionFrame[] | undefined;
  readonly immediatelyHidden?: ReadonlySet<string> | undefined;
}

export interface NativePresetBorderPlan {
  readonly phase: NativePresetBorderPhase;
  readonly plateId: string;
  readonly lookId: string;
  readonly frameKey: string;
  readonly color?: string;
  readonly strokeInitiallyHidden?: true;
  readonly from: LiveSourceRect;
  readonly to: LiveSourceRect;
  readonly initialOpacity: 0 | 1;
  readonly cut: boolean;
}

/**
 * Plan strokes before claiming any mixer seats. Rectangles are in authored scene
 * pixels; the transport projects them to the actual output raster. An unverified
 * slide is absent from `slideFrames` and keeps the picture's fade-only geometry.
 */
export function planNativePresetBorders({
  fromLook,
  toLook,
  retained,
  retainedFade,
  fadingFallbacks,
  departure,
  arrival,
  colorOf,
  attachedArtwork,
}: {
  readonly fromLook: NativePresetBorderLook;
  readonly toLook: NativePresetBorderLook;
  /** The callers supply only frames with at least one verified native picture. */
  readonly retained: readonly { plateId: string; frame: MotionFrame }[];
  readonly retainedFade: boolean;
  /** A seated input whose active and reserve receivers report no picture. */
  readonly fadingFallbacks?: ReadonlySet<string>;
  readonly departure?: NativePresetBorderArtwork | undefined;
  readonly arrival?: NativePresetBorderArtwork | undefined;
  readonly colorOf: (plateId: string) => string | undefined;
  readonly attachedArtwork?: (plateId: string) => boolean;
}): readonly NativePresetBorderPlan[] {
  const plan: NativePresetBorderPlan[] = [];
  const opaqueColor = (plateId: string) => nativePresetBorderColor(colorOf(plateId));
  for (const { plateId, frame } of retained) {
    const fromStroke = fromLook.borderVisible(plateId);
    const toStroke = toLook.borderVisible(plateId);
    if (
      !retainedFade &&
      sameBorderRect(frame.from, frame.to) &&
      fromStroke === toStroke &&
      !attachedArtwork?.(plateId)
    )
      continue;
    const color = fromStroke || toStroke ? opaqueColor(plateId) : undefined;
    const hasStill =
      (!retainedFade || fadingFallbacks?.has(plateId)) &&
      fromLook.fallbacks?.includes(plateId) &&
      toLook.fallbacks?.includes(plateId);
    if (color === undefined && !hasStill && !attachedArtwork?.(plateId)) continue;
    plan.push({
      phase: 'move',
      plateId,
      lookId: frame.lookId ?? fromLook.id,
      frameKey: frame.frameKey,
      ...(color !== undefined && { color }),
      ...(color !== undefined && !fromStroke && { strokeInitiallyHidden: true }),
      from: frame.from,
      to: frame.to,
      initialOpacity: 1,
      cut: false,
    });
  }

  const addArtwork = (
    phase: 'arrival' | 'departure',
    look: NativePresetBorderLook,
    artwork: NativePresetBorderArtwork | undefined,
  ): void => {
    if (artwork === undefined) return;
    const slideByKey = new Map(
      artwork.slideFrames
        ?.filter(({ lookId }) => lookId === undefined || lookId === look.id)
        .map((frame) => [frame.frameKey, frame]),
    );
    for (const plateId of artwork.plateIds) {
      if (!artwork.nativePlateIds.has(plateId)) continue;
      const rect = look.rects[plateId];
      const frameKey = look.transitionFrames?.[plateId]?.frameKey;
      const color = look.borderVisible(plateId) ? opaqueColor(plateId) : undefined;
      if (rect === undefined || frameKey === undefined) continue;
      const cut = phase === 'departure' && artwork.immediatelyHidden?.has(plateId) === true;
      if (
        color === undefined &&
        (cut || !look.fallbacks?.includes(plateId)) &&
        !attachedArtwork?.(plateId)
      )
        continue;
      const slide = cut ? undefined : slideByKey.get(frameKey);
      plan.push({
        phase,
        plateId,
        lookId: look.id,
        frameKey,
        ...(color !== undefined && { color }),
        from: slide?.from ?? rect,
        to: slide?.to ?? rect,
        initialOpacity: phase === 'arrival' ? 0 : 1,
        cut,
      });
    }
  };
  addArtwork('departure', fromLook, departure);
  addArtwork('arrival', toLook, arrival);
  return plan;
}

function sameBorderRect(a: LiveSourceRect, b: LiveSourceRect): boolean {
  return (
    Math.abs(a.x - b.x) < 1e-8 &&
    Math.abs(a.y - b.y) < 1e-8 &&
    Math.abs(a.width - b.width) < 1e-8 &&
    Math.abs(a.height - b.height) < 1e-8
  );
}

/** Resolve the exact endpoint and tick count to stage in the picture's batch. */
export function nativePresetBorderStep(
  border: Omit<NativePresetBorderPlan, 'color'>,
  kind: NativePresetBorderPhase,
  phase: FrameTransitionPhase,
  framePeriodMs: number,
):
  | {
      rect: LiveSourceRect;
      frames: number;
      easing: FrameTransitionPhase['easing'];
      opacity: number;
      strokeOpacity?: number;
    }
  | undefined {
  if (border.phase !== kind) return undefined;
  const frames = Math.round(phase.durationMs / framePeriodMs);
  if (kind !== 'move')
    return {
      rect: border.to,
      frames: border.cut ? 0 : frames,
      easing: phase.easing,
      opacity: kind === 'arrival' ? 1 : 0,
    };
  const motion = phase.frames.find(
    ({ frameKey, lookId }) =>
      frameKey === border.frameKey && (lookId === undefined || lookId === border.lookId),
  );
  const decoration = phase.decorationOpacity?.find(({ plateId }) => plateId === border.plateId);
  if (
    motion === undefined ||
    (!decoration &&
      sameBorderRect(motion.from, motion.to) &&
      motion.fromOpacity === motion.toOpacity)
  )
    return undefined;
  return {
    rect: motion.to,
    frames,
    easing: phase.easing,
    opacity: motion.toOpacity,
    ...(decoration?.border && { strokeOpacity: motion.toOpacity * decoration.border.toOpacity }),
  };
}
