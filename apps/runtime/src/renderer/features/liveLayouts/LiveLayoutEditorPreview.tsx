import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Maximize2 } from 'lucide-react';
import {
  DEFAULT_LIVE_CROP_FOCUS,
  DEFAULT_LIVE_FIT_MODE,
  controlLiveLayoutBorderHidden,
  controlLiveLayoutFrameAttachments,
  controlLiveLayoutPlateBorder,
  controlLiveLayoutPlateCropFocus,
  controlLiveLayoutPlateFit,
  controlLiveLayoutPresetFrameIds,
  controlLiveLayoutTitleHidden,
  fitPictureToBox,
  frameTransitionPhases,
  inputSlideVector,
  intersectNormalizedRects,
  largestLivePlateMaskRegion,
  livePlateMaskRegions,
  liveRevealSceneRect,
  presetDepartureRect,
  type ControlLiveLayout,
  type ControlLiveLayoutFrame,
  type ControlLiveLayoutPreset,
  type ControlLiveLayoutTitleStyle,
  type FrameTransition,
  type LiveCropFocus,
  type LiveSourceRect,
  type Resolution,
} from '@cg/shared-schema';
import { writeFieldDigits } from '@cg/text-shaping';
import { smpteBarsGradient } from '@cg/template-runtime/scene-builder';
import type { BroadcastGuideProfile } from '@cg/ui';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { liveLayoutArtwork } from '../../theme.js';
import { fullJpegRect } from '../monitors/pvwPlatePictures.js';
import type { PvwSourceFrame } from '../monitors/usePvwSourceFrames.js';
import { FittedSafeAreaGuides } from '../monitors/SafeAreaGuides.js';
import { InputAudioMeter } from '../sources/InputAudioMeter.js';
import { focusSlideOcclusion } from './focusSlideClip.js';
import { SourceLabel, labelledSource } from '../sources/SourceLabel.js';
import {
  controlLiveLayoutFrameTexts,
  controlLiveLayoutTitleGeometry,
} from './controlLiveLayoutCompiler.js';
import {
  frameAttachmentPlateRect,
  type ControlLiveLayoutFrameAttachmentSource,
} from './controlLiveLayoutFrameAttachments.js';
import { LiveLayoutFrameAttachmentArt } from './LiveLayoutFrameAttachmentArt.js';

type Rects = Readonly<Record<string, LiveSourceRect>>;

interface ShotFit {
  contain: number;
  crop: LiveCropFocus;
}

interface CropEditor {
  frameId: string;
  focus: LiveCropFocus;
  onChange: (focus: LiveCropFocus) => void;
}

const DEFAULT_SHOT_FIT: ShotFit = { contain: 1, crop: DEFAULT_LIVE_CROP_FOCUS };

interface View {
  presetId: string;
  focused: string | undefined;
  soloFrameId: string | undefined;
  rects: Rects;
  fits: ReadonlyMap<string, ShotFit>;
}

const easings = {
  linear: 'linear',
  easeinquad: 'cubic-bezier(.55,.085,.68,.53)',
  easeoutquad: 'cubic-bezier(.25,.46,.45,.94)',
  easeinoutquad: 'cubic-bezier(.455,.03,.515,.955)',
};

function cssRect(rect: LiveSourceRect, raster: Resolution) {
  return {
    left: `${String((rect.x / raster.width) * 100)}%`,
    top: `${String((rect.y / raster.height) * 100)}%`,
    width: `${String((rect.width / raster.width) * 100)}%`,
    height: `${String((rect.height / raster.height) * 100)}%`,
  };
}

function blendRect(from: LiveSourceRect, to: LiveSourceRect, amount: number): LiveSourceRect {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    width: from.width + (to.width - from.width) * amount,
    height: from.height + (to.height - from.height) * amount,
  };
}

function fitWeight(input: ControlLiveLayoutFrame): number {
  return (input.fitMode ?? DEFAULT_LIVE_FIT_MODE) === 'contain' ? 1 : 0;
}

function fitProperties(fit: ShotFit) {
  return {
    '--cg-shot-contain': String(fit.contain),
    '--cg-shot-crop-x': String(fit.crop.x),
    '--cg-shot-crop-y': String(fit.crop.y),
    '--cg-shot-crop-zoom': String(fit.crop.zoom ?? 1),
  };
}

function sourcePictureAspect(source: PvwSourceFrame | undefined): number | null {
  const aspect =
    source?.geometry?.sourceAspect ??
    (source?.width !== undefined && source.height !== undefined
      ? source.width / source.height
      : null);
  return aspect !== null && Number.isFinite(aspect) && aspect > 0 ? aspect : null;
}

function CropDragSurface({
  editor,
  sourceAspect,
  label,
}: {
  editor: CropEditor;
  sourceAspect: number;
  label: string;
}): JSX.Element {
  const drag = useRef<{
    x: number;
    y: number;
    travelX: number;
    travelY: number;
    focus: LiveCropFocus;
  }>();
  const adjust = (focus: LiveCropFocus, x: number, y: number): void =>
    editor.onChange({ ...focus, x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
  return (
    <button
      type="button"
      className="cg-live-layout-crop-drag"
      aria-label={'Adjust crop for ' + label}
      title="Drag the picture or use the arrow keys to adjust the crop"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        const { width, height } = event.currentTarget.getBoundingClientRect();
        const { picture } = fitPictureToBox(
          { x: 0, y: 0, width, height },
          sourceAspect,
          'cover',
          editor.focus,
        );
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          travelX: picture.width - width,
          travelY: picture.height - height,
          focus: editor.focus,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const origin = drag.current;
        if (origin === undefined || !event.isPrimary) return;
        const shiftX = origin.travelX > 0.1 ? (event.clientX - origin.x) / origin.travelX : 0;
        const shiftY = origin.travelY > 0.1 ? (event.clientY - origin.y) / origin.travelY : 0;
        adjust(origin.focus, origin.focus.x - shiftX, origin.focus.y - shiftY);
      }}
      onLostPointerCapture={() => {
        drag.current = undefined;
      }}
      onKeyDown={(event) => {
        const dx = Number(event.key === 'ArrowLeft') - Number(event.key === 'ArrowRight');
        const dy = Number(event.key === 'ArrowUp') - Number(event.key === 'ArrowDown');
        if (dx === 0 && dy === 0) return;
        event.preventDefault();
        const step = event.shiftKey ? 0.1 : 0.01;
        adjust(editor.focus, editor.focus.x + dx * step, editor.focus.y + dy * step);
      }}
    />
  );
}

function ShotFallback({
  fallback,
  mask,
  file,
}: {
  fallback: NonNullable<ControlLiveLayoutFrame['fallback']>;
  mask: ControlLiveLayoutFrame['liveMask'];
  file: Blob | undefined;
}): JSX.Element {
  const clipId = 'layout-fallback-' + useId().replace(/:/g, '');
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (file === undefined) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div
      className="cg-live-layout-shot-fallback"
      data-layout-plate-fallback={fallback.kind}
      aria-hidden="true"
      style={{
        ...(fallback.kind === 'color' && { backgroundColor: fallback.color }),
        ...(fallback.kind === 'bars' && { backgroundImage: smpteBarsGradient() }),
        ...(mask !== undefined && { clipPath: `url(#${clipId})` }),
      }}
    >
      {mask !== undefined && (
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            {livePlateMaskRegions(mask).map(({ x, y, width, height }) => (
              <rect
                key={`${x}:${y}:${width}:${height}`}
                x={x}
                y={y}
                width={width}
                height={height}
              />
            ))}
          </clipPath>
        </svg>
      )}
      {fallback.kind === 'image' && url !== undefined && <img src={url} alt="" />}
    </div>
  );
}

function ShotInput({
  source,
  input,
  frame,
  fallback,
  hasFallback,
  pictureBox,
  cropFocus,
}: {
  source: PvwSourceFrame | undefined;
  input: ControlLiveLayoutFrame;
  frame: LiveSourceRect;
  fallback: string;
  hasFallback: boolean;
  pictureBox?: LiveSourceRect | undefined;
  cropFocus?: LiveCropFocus | undefined;
}): JSX.Element {
  const { width, height } = frame;
  const box = { x: 0, y: 0, width, height };
  const seat = pictureBox ?? box;
  const mask = input.liveMask;
  const windows =
    mask === undefined
      ? [seat]
      : livePlateMaskRegions(mask).map((rect) => liveRevealSceneRect(seat, rect));
  if (source?.jpegBase64 === undefined) {
    const label = largestLivePlateMaskRegion(mask);
    return (
      <>
        {!hasFallback &&
          windows.map((window, index) => (
            <div
              key={index}
              className="cg-live-layout-shot-placeholder"
              style={cssRect(window, box)}
            />
          ))}
        {label !== null && (
          <div
            className="cg-live-layout-shot-label"
            style={cssRect(liveRevealSceneRect(seat, label), box)}
          >
            <SourceLabel sourceId={input.sourceId ?? ''} fallback={fallback} />
          </div>
        )}
      </>
    );
  }

  const sourceAspect = sourcePictureAspect(source);
  const url = `data:image/jpeg;base64,${source.jpegBase64}`;
  if (mask === undefined && pictureBox === undefined && sourceAspect !== null) {
    const active = source.geometry?.activeRect ?? { x: 0, y: 0, width: 1, height: 1 };
    return (
      <div
        className="cg-live-layout-shot-picture"
        data-fit-to-shot=""
        style={
          {
            '--cg-shot-source-aspect': sourceAspect,
            '--cg-shot-jpeg-width-factor': 1 / active.width,
            '--cg-shot-jpeg-height-factor': 1 / active.height,
            '--cg-shot-jpeg-x-factor': active.x / active.width,
            '--cg-shot-jpeg-y-factor': active.y / active.height,
          } as CSSProperties
        }
      >
        <img src={url} alt="" />
      </div>
    );
  }
  const { picture, visible } = fitPictureToBox(
    seat,
    sourceAspect,
    input.fitMode ?? DEFAULT_LIVE_FIT_MODE,
    cropFocus,
  );
  const jpeg =
    source.geometry === undefined ? picture : fullJpegRect(picture, source.geometry.activeRect);
  return (
    <>
      {windows.map((window, index) => {
        const clip = intersectNormalizedRects(visible, window);
        if (clip === null) return null;
        return (
          <div key={index} className="cg-live-layout-shot-picture" style={cssRect(clip, box)}>
            <img
              src={url}
              alt=""
              style={cssRect({ ...jpeg, x: jpeg.x - clip.x, y: jpeg.y - clip.y }, clip)}
            />
          </div>
        );
      })}
    </>
  );
}

function ShotBorder({
  input,
  raster,
}: {
  input: ControlLiveLayoutFrame;
  raster: Resolution;
}): JSX.Element | null {
  const border = controlLiveLayoutPlateBorder(input, raster);
  if (border === undefined) return null;
  const scaled = (pixels: number) => `${String((pixels / raster.height) * 100)}cqh`;
  return (
    <div className="cg-live-layout-shot-decoration" aria-hidden="true">
      <div
        className="cg-live-layout-shot-border"
        style={{
          border: `${scaled(border.width)} solid ${border.color}`,
        }}
      />
    </div>
  );
}

function ShotTitle({
  title,
  style,
  raster,
}: {
  title: string;
  style: ControlLiveLayoutTitleStyle | undefined;
  raster: Resolution;
}): JSX.Element {
  const geometry = controlLiveLayoutTitleGeometry(raster, style);
  // Frames preserve the raster aspect, so a scene-pixel length can scale with their height.
  const scaled = (pixels: number) => `${String((pixels / raster.height) * 100)}cqh`;
  const { boxShadow, stroke, textShadow } = geometry;
  const shadowLengths = (shadow: NonNullable<ControlLiveLayoutTitleStyle['textShadow']>) =>
    [shadow.offsetX, shadow.offsetY, shadow.blur].map(scaled).join(' ');
  return (
    <span
      className="cg-live-layout-shot-title"
      style={{
        ...cssRect(geometry, raster),
        fontFamily: `"${geometry.fontFamily}", Vazirmatn, "Noto Sans Arabic", sans-serif`,
        fontSize: scaled(geometry.fontSize),
        fontWeight: geometry.fontWeight,
        fontStyle: geometry.fontStyle,
        lineHeight: geometry.lineHeight,
        padding: scaled(geometry.padding),
        backgroundColor: geometry.backgroundColor,
        color: geometry.color,
        textAlign: geometry.align,
        justifyContent: { top: 'start', middle: 'center', bottom: 'end' }[geometry.verticalAlign],
        whiteSpace: geometry.wrap ? 'normal' : 'nowrap',
        borderRadius: scaled(geometry.borderRadius),
        ...(stroke !== null && {
          border: `${scaled(stroke.width)} ${stroke.dash?.length ? 'dashed' : 'solid'} ${stroke.color}`,
        }),
        ...(boxShadow !== null && {
          boxShadow: `${boxShadow.inset ? 'inset ' : ''}${shadowLengths(boxShadow)} ${scaled(boxShadow.spread ?? 0)} ${boxShadow.color}`,
        }),
      }}
    >
      <span
        style={{
          top: scaled(geometry.textOffsetY),
          textOverflow: geometry.wrap ? 'clip' : 'ellipsis',
          ...(textShadow !== null && {
            textShadow: `${shadowLengths(textShadow)} ${textShadow.color}`,
          }),
        }}
      >
        <IsolatedName>{writeFieldDigits(title, geometry.digits)}</IsolatedName>
      </span>
    </span>
  );
}

function motionKeys(
  from: LiveSourceRect,
  to: LiveSourceRect,
  raster: Resolution,
  effect: FrameTransition,
  frameRate: number,
  shownBefore: boolean,
  shownAfter: boolean,
  zIndex: string,
  fit: { from: ShotFit; to: ShotFit },
): { keys: Keyframe[]; duration: number } {
  const steps = frameTransitionPhases(effect, Math.round((effect.durationMs * frameRate) / 1_000));
  const count = steps.reduce((total, step) => total + step.frames, 0);
  if (count <= 0) return { keys: [], duration: 0 };
  const keys: Keyframe[] = [
    {
      ...cssRect(from, raster),
      opacity: shownBefore ? 1 : 0,
      zIndex,
      ...fitProperties(fit.from),
      offset: 0,
    },
  ];
  let elapsed = 0;
  for (const step of steps) {
    const last = keys.at(-1);
    if (last !== undefined) last.easing = easings[step.easing];
    elapsed += step.frames;
    const time = elapsed / count;
    let opacity = step.opacity;
    if (!shownBefore) opacity *= time;
    if (!shownAfter) opacity *= 1 - time;
    const blend = (from: number, to: number): number => from + (to - from) * step.progress;
    keys.push({
      ...cssRect(blendRect(from, to, step.progress), raster),
      ...fitProperties({
        contain: blend(fit.from.contain, fit.to.contain),
        crop: {
          x: blend(fit.from.crop.x, fit.to.crop.x),
          y: blend(fit.from.crop.y, fit.to.crop.y),
          zoom: blend(fit.from.crop.zoom ?? 1, fit.to.crop.zoom ?? 1),
        },
      }),
      opacity,
      zIndex,
      offset: time,
    });
  }
  return { keys, duration: (count * 1_000) / frameRate };
}

export function LiveLayoutEditorPreview({
  channel,
  layout,
  preset,
  geometry,
  selectedFrameId,
  focused,
  backgroundUrl,
  fallbackFiles,
  sourceFrames,
  showMeters,
  guideProfile,
  attachmentSources,
  onFocus,
  placementEditor,
  cropEditor,
}: {
  channel: number;
  layout: ControlLiveLayout;
  preset: ControlLiveLayoutPreset;
  geometry: Rects;
  selectedFrameId: string;
  focused: string | undefined;
  backgroundUrl: string | undefined;
  fallbackFiles: ReadonlyMap<string, Blob>;
  sourceFrames: ReadonlyMap<string, PvwSourceFrame>;
  showMeters: boolean;
  guideProfile?: BroadcastGuideProfile | undefined;
  attachmentSources: ReadonlyMap<string, ControlLiveLayoutFrameAttachmentSource>;
  onFocus: (frameId: string) => void;
  placementEditor?: ReactNode;
  cropEditor?: CropEditor | undefined;
}): JSX.Element {
  const stage = useRef<HTMLDivElement>(null);
  const active = useRef<Animation[]>([]);
  const previous = useRef<View>();
  const raster = layout.resolution;
  const full: LiveSourceRect = { x: 0, y: 0, width: raster.width, height: raster.height };
  const frameOrder = controlLiveLayoutPresetFrameIds(preset);
  const editorFrames = layout.frames.map((input, index) => {
    const number = String(index + 1);
    const alias = input.focusAlias?.trim();
    return {
      input,
      number,
      position: frameOrder.indexOf(input.id) + 1,
      focusLabel: alias || number,
      focusName: alias ? `Focus plate ${number}: ${alias}` : `Focus plate ${number}`,
    };
  });
  const soloFrameId = frameOrder.length === 1 ? frameOrder[0] : undefined;
  const activeSingle = focused ?? soloFrameId;
  const visible: Rects = focused === undefined ? geometry : { [focused]: full };

  // The editor has no programme target. Its retained DOM shots can reuse the
  // frame clock and focus effects without calling a play or preset command.
  useLayoutEffect(() => {
    if (stage.current === null) return;
    const shots = [...stage.current.querySelectorAll<HTMLElement>('[data-layout-preview-shot]')];
    const fits = new Map<string, ShotFit>();
    for (const shot of shots) {
      const id = shot.dataset.layoutPreviewShot;
      if (id === undefined) continue;
      fits.set(id, {
        contain: Number(shot.style.getPropertyValue('--cg-shot-contain')),
        crop: {
          x: Number(shot.style.getPropertyValue('--cg-shot-crop-x')),
          y: Number(shot.style.getPropertyValue('--cg-shot-crop-y')),
          zoom: Number(shot.style.getPropertyValue('--cg-shot-crop-zoom')),
        },
      });
    }
    const before = previous.current;
    previous.current = { presetId: preset.id, focused, soloFrameId, rects: visible, fits };
    if (before === undefined || (before.focused === focused && before.presetId === preset.id))
      return;

    active.current.forEach((animation) => animation.cancel());
    active.current = [];
    // This is a rehearsal of the chosen broadcast effect, including on systems
    // where the operator has reduced the console's own interface animations.
    const { focus, switch: change } = layout.effects;
    const previousSingle = before.focused ?? before.soloFrameId;
    const switching =
      before.presetId === preset.id &&
      focused !== undefined &&
      previousSingle !== undefined &&
      focused !== previousSingle;

    if (switching && change.mode !== 'motion') {
      if (change.mode === 'cut') return;
      const direction = inputSlideVector(change.direction);
      const translation = (sign: number): string =>
        `translate(${String(sign * direction.x * 100)}%, ${String(sign * direction.y * 100)}%)`;
      const opacity = { ...cssRect(full, raster), opacity: 1 };
      for (const shot of shots) {
        const id = shot.dataset.layoutPreviewShot;
        if (id !== focused && id !== previousSingle) continue;
        const incoming = id === focused;
        const box = {
          ...opacity,
          zIndex: incoming ? '3' : '2',
          ...fitProperties((incoming ? fits.get(id) : before.fits.get(id)) ?? DEFAULT_SHOT_FIT),
        };
        const keys =
          change.mode === 'fade'
            ? [{ ...box, opacity: incoming ? 0 : 1 }, box]
            : incoming
              ? [
                  { ...box, transform: translation(1) },
                  { ...box, transform: 'none' },
                ]
              : change.mode === 'push'
                ? [
                    { ...box, transform: 'none' },
                    { ...box, transform: translation(-1) },
                  ]
                : [
                    { ...box, clipPath: 'inset(0 0 0 0)' },
                    { ...box, clipPath: focusSlideOcclusion(change.direction) },
                  ];
        if (typeof shot.animate === 'function') {
          active.current.push(shot.animate(keys, { duration: change.durationMs }));
        }
      }
      return;
    }

    const effect = switching ? { ...focus, durationMs: change.durationMs } : focus;
    const collapsed: LiveSourceRect = {
      x: raster.width * 0.375,
      y: raster.height * 0.375,
      width: raster.width * 0.25,
      height: raster.height * 0.25,
    };
    for (const shot of shots) {
      const id = shot.dataset.layoutPreviewShot;
      if (id === undefined || (before.rects[id] === undefined && visible[id] === undefined))
        continue;
      const shownBefore = before.rects[id] !== undefined;
      const shownAfter = visible[id] !== undefined;
      const from =
        !shownBefore && shownAfter && effect.enterDirection !== undefined
          ? presetDepartureRect(visible[id] ?? collapsed, effect.enterDirection, raster)
          : (before.rects[id] ?? geometry[id] ?? collapsed);
      const to =
        !shownAfter && effect.exitDirection !== undefined
          ? presetDepartureRect(from, effect.exitDirection, raster)
          : (visible[id] ?? geometry[id] ?? collapsed);
      const shared = shownBefore && shownAfter;
      const activeFocus =
        focused === id || (before.focused === id && before.presetId === preset.id);
      const zIndex = activeFocus || shared ? '3' : shownAfter ? '2' : '1';
      const previousFit = before.fits.get(id) ?? DEFAULT_SHOT_FIT;
      const nextFit = fits.get(id) ?? DEFAULT_SHOT_FIT;
      const { keys, duration } = motionKeys(
        from,
        to,
        raster,
        effect,
        layout.frameRate,
        shownBefore,
        shownAfter,
        zIndex,
        { from: shownBefore ? previousFit : nextFit, to: shownAfter ? nextFit : previousFit },
      );
      if (keys.length > 0 && typeof shot.animate === 'function') {
        active.current.push(shot.animate(keys, { duration }));
      }
    }
  });

  useLayoutEffect(() => () => active.current.forEach((animation) => animation.cancel()), []);

  return (
    <>
      <div
        ref={stage}
        className="cg-live-layout-stage"
        data-layout-preview=""
        data-focused-frame={focused}
        data-transparent-background={layout.background.kind === 'none' ? '' : undefined}
        style={
          {
            '--cg-live-layout-aspect': raster.width / raster.height,
            aspectRatio: `${String(raster.width)} / ${String(raster.height)}`,
            backgroundColor:
              layout.background.kind === 'none'
                ? undefined
                : layout.background.kind === 'color'
                  ? layout.background.color
                  : liveLayoutArtwork.mediaBackdrop,
          } as CSSProperties
        }
      >
        {backgroundUrl !== undefined && layout.background.kind === 'image' && (
          <img src={backgroundUrl} alt="" />
        )}
        {backgroundUrl !== undefined && layout.background.kind === 'video' && (
          <video src={backgroundUrl} muted loop playsInline autoPlay aria-hidden="true" />
        )}
        {editorFrames.map(({ input, number, position, focusLabel, focusName }) => {
          const { id, sourceId } = input;
          const activeShot = visible[id] !== undefined;
          const rect = visible[id] ?? geometry[id] ?? full;
          const preview = sourceId === undefined ? undefined : sourceFrames.get(sourceId);
          const source = labelledSource(sourceId);
          const titleHidden = controlLiveLayoutTitleHidden(preset, id, focused !== undefined);
          const borderHidden = controlLiveLayoutBorderHidden(preset, id, focused !== undefined);
          const graphics = controlLiveLayoutFrameAttachments(layout, preset, id);
          const graphicWithInput = graphics.find(
            ({ sourceId }) => attachmentSources.get(sourceId)?.plate !== undefined,
          );
          const imported =
            graphicWithInput === undefined
              ? undefined
              : attachmentSources.get(graphicWithInput.sourceId);
          const pictureBox =
            graphicWithInput === undefined || imported === undefined
              ? undefined
              : frameAttachmentPlateRect({ ...rect, x: 0, y: 0 }, graphicWithInput, imported);
          const importedPlate = imported?.plate?.element;
          const authoredInput =
            importedPlate === undefined
              ? input
              : {
                  ...input,
                  liveMask: importedPlate.liveMask,
                  fitMode: importedPlate.fitMode ?? input.fitMode,
                };
          const previewInput =
            focused === undefined
              ? { ...authoredInput, fitMode: controlLiveLayoutPlateFit(preset, authoredInput) }
              : authoredInput;
          const fallback =
            importedPlate === undefined
              ? (input.fallback ??
                (input.showFallback === true ? { kind: 'bars' as const } : undefined))
              : undefined;
          const canCrop =
            previewInput.fitMode === 'cover' &&
            previewInput.liveMask === undefined &&
            pictureBox === undefined &&
            focused === undefined;
          const cropFocus = canCrop ? controlLiveLayoutPlateCropFocus(preset, id) : undefined;
          const sourceAspect = sourcePictureAspect(preview);
          return (
            <div
              key={id}
              className="cg-live-layout-shot"
              data-layout-preview-shot={id}
              data-frame-number={number}
              data-preset-position={position || undefined}
              data-editing={activeShot && selectedFrameId === id ? '' : undefined}
              aria-hidden={!activeShot}
              style={
                {
                  ...cssRect(rect, raster),
                  opacity: activeShot ? 1 : 0,
                  pointerEvents: activeShot ? 'auto' : 'none',
                  zIndex: focused === id ? '3' : '1',
                  ...fitProperties({
                    contain: fitWeight(previewInput),
                    crop: cropFocus ?? DEFAULT_LIVE_CROP_FOCUS,
                  }),
                } as CSSProperties
              }
            >
              <div className="cg-live-layout-shot-source">
                {fallback !== undefined && (
                  <ShotFallback
                    fallback={fallback}
                    mask={input.liveMask}
                    file={fallbackFiles.get(id)}
                  />
                )}
                <ShotInput
                  source={preview}
                  input={previewInput}
                  frame={rect}
                  pictureBox={pictureBox}
                  cropFocus={cropFocus}
                  fallback={`Plate ${number}`}
                  hasFallback={fallback !== undefined}
                />
              </div>
              {showMeters && activeShot && sourceId !== undefined && (
                <InputAudioMeter
                  sourceId={sourceId}
                  channel={channel}
                  name={source?.name ?? `Plate ${number}`}
                  edge
                />
              )}
              {graphics.map((attachment) => {
                const source = attachmentSources.get(attachment.sourceId);
                if (source === undefined) return null;
                return (
                  <div
                    key={attachment.id}
                    className="cg-live-layout-frame-graphic"
                    data-layout-frame-graphic={attachment.id}
                    style={cssRect(attachment.rect, { width: 1, height: 1 })}
                  >
                    <LiveLayoutFrameAttachmentArt source={source} />
                  </div>
                );
              })}
              {!titleHidden && (
                <div className="cg-live-layout-shot-titles">
                  {controlLiveLayoutFrameTexts(input, layout).map(({ id, text, style }) => (
                    <ShotTitle key={id} title={text} style={style} raster={raster} />
                  ))}
                </div>
              )}
              {!borderHidden && <ShotBorder input={input} raster={raster} />}
              {activeShot && canCrop && sourceAspect !== null && cropEditor?.frameId === id && (
                <CropDragSurface
                  editor={cropEditor}
                  sourceAspect={sourceAspect}
                  label={focusLabel}
                />
              )}
              {activeSingle === undefined && activeShot && (
                <Button
                  className="cg-live-layout-focus-action"
                  variant="neutral"
                  aria-label={focusName}
                  title={focusName}
                  data-layout-focus={id}
                  onClick={() => onFocus(id)}
                >
                  <Icon icon={Maximize2} size={13} /> <IsolatedName>{focusLabel}</IsolatedName>
                </Button>
              )}
              {activeShot && selectedFrameId === id && placementEditor}
            </div>
          );
        })}
        {guideProfile !== undefined && (
          <FittedSafeAreaGuides
            width={raster.width}
            height={raster.height}
            stage={stage}
            profile={guideProfile}
          />
        )}
      </div>
      {activeSingle !== undefined && layout.frames.length > 1 && (
        <div className="cg-live-layout-switch" role="group" aria-label="Switch focused plate">
          {[...editorFrames]
            .sort(
              (a, b) => (a.position || layout.frames.length) - (b.position || layout.frames.length),
            )
            .map(({ input: { id }, focusLabel, focusName }) => (
              <Button
                key={id}
                aria-label={focusName}
                title={focusName}
                active={activeSingle === id}
                aria-pressed={activeSingle === id}
                data-layout-focus={id}
                onClick={() => {
                  if (id !== activeSingle) onFocus(id);
                }}
              >
                <IsolatedName>{focusLabel}</IsolatedName>
              </Button>
            ))}
        </div>
      )}
    </>
  );
}
