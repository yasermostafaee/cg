import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { Maximize2 } from 'lucide-react';
import {
  DEFAULT_LIVE_FIT_MODE,
  controlLiveLayoutPresetFrameIds,
  fitPictureToBox,
  frameTransitionPhases,
  inputSlideVector,
  intersectNormalizedRects,
  largestLivePlateMaskRegion,
  livePlateMaskRegions,
  liveRevealSceneRect,
  type ControlLiveLayout,
  type ControlLiveLayoutFrame,
  type ControlLiveLayoutPreset,
  type ControlLiveLayoutTitleStyle,
  type FrameTransition,
  type LiveSourceRect,
  type Resolution,
} from '@cg/shared-schema';
import { writeFieldDigits } from '@cg/text-shaping';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { liveLayoutArtwork } from '../../theme.js';
import { fullJpegRect } from '../monitors/pvwPlatePictures.js';
import type { PvwSourceFrame } from '../monitors/usePvwSourceFrames.js';
import { SourceLabel } from '../sources/SourceLabel.js';
import {
  controlLiveLayoutFrameTexts,
  controlLiveLayoutTitleGeometry,
} from './controlLiveLayoutCompiler.js';

type Rects = Readonly<Record<string, LiveSourceRect>>;

interface View {
  presetId: string;
  focused: string | undefined;
  rects: Rects;
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

function ShotInput({
  source,
  input,
  frame,
  fallback,
}: {
  source: PvwSourceFrame | undefined;
  input: ControlLiveLayoutFrame;
  frame: LiveSourceRect;
  fallback: string;
}): JSX.Element {
  const { width, height } = frame;
  const box = { x: 0, y: 0, width, height };
  const mask = input.liveMask;
  const windows =
    mask === undefined
      ? [box]
      : livePlateMaskRegions(mask).map((rect) => liveRevealSceneRect(box, rect));
  if (source?.jpegBase64 === undefined) {
    const label = largestLivePlateMaskRegion(mask);
    return (
      <>
        {windows.map((window, index) => (
          <div
            key={index}
            className="cg-live-layout-shot-placeholder"
            style={cssRect(window, box)}
          />
        ))}
        {label !== null && (
          <div
            className="cg-live-layout-shot-label"
            style={cssRect(liveRevealSceneRect(box, label), box)}
          >
            <SourceLabel sourceId={input.sourceId ?? ''} fallback={fallback} />
          </div>
        )}
      </>
    );
  }

  const sourceAspect =
    source.geometry?.sourceAspect ??
    (source.width !== undefined && source.height !== undefined
      ? source.width / source.height
      : null);
  const { picture, visible } = fitPictureToBox(
    box,
    sourceAspect,
    input.fitMode ?? DEFAULT_LIVE_FIT_MODE,
  );
  const jpeg =
    source.geometry === undefined ? picture : fullJpegRect(picture, source.geometry.activeRect);
  const url = `data:image/jpeg;base64,${source.jpegBase64}`;
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
): { keys: Keyframe[]; duration: number } {
  const steps = frameTransitionPhases(effect, Math.round((effect.durationMs * frameRate) / 1_000));
  const count = steps.reduce((total, step) => total + step.frames, 0);
  if (count <= 0) return { keys: [], duration: 0 };
  const keys: Keyframe[] = [
    {
      ...cssRect(from, raster),
      opacity: shownBefore ? 1 : 0,
      zIndex,
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
    keys.push({
      ...cssRect(blendRect(from, to, step.progress), raster),
      opacity,
      zIndex,
      offset: time,
    });
  }
  return { keys, duration: (count * 1_000) / frameRate };
}

export function LiveLayoutEditorPreview({
  layout,
  preset,
  geometry,
  selectedFrameId,
  focused,
  backgroundUrl,
  sourceFrames,
  onFocus,
}: {
  layout: ControlLiveLayout;
  preset: ControlLiveLayoutPreset;
  geometry: Rects;
  selectedFrameId: string;
  focused: string | undefined;
  backgroundUrl: string | undefined;
  sourceFrames: ReadonlyMap<string, PvwSourceFrame>;
  onFocus: (frameId: string) => void;
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
      focusName: alias ? `Focus frame ${number}: ${alias}` : `Focus frame ${number}`,
    };
  });
  const soloFrameId = frameOrder.length === 1 ? frameOrder[0] : undefined;
  const activeSingle = focused ?? soloFrameId;
  const visible: Rects = focused === undefined ? geometry : { [focused]: full };

  // The editor has no programme target. Its retained DOM shots can reuse the
  // frame clock and focus effects without calling a play or preset command.
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { presetId: preset.id, focused, rects: visible };
    if (
      stage.current === null ||
      before === undefined ||
      (before.focused === focused && before.presetId === preset.id)
    )
      return;

    active.current.forEach((animation) => animation.cancel());
    active.current = [];
    // This is a rehearsal of the chosen broadcast effect, including on systems
    // where the operator has reduced the console's own interface animations.
    if (before.presetId !== preset.id) return;

    const shots = [...stage.current.querySelectorAll<HTMLElement>('[data-layout-preview-shot]')];
    const { focus, switch: change } = layout.effects;
    const previousSingle = before.focused ?? soloFrameId;
    const switching =
      focused !== undefined && previousSingle !== undefined && focused !== previousSingle;

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
        const box = { ...opacity, zIndex: incoming ? '3' : '2' };
        const keys =
          change.mode === 'fade'
            ? [{ ...box, opacity: incoming ? 0 : 1 }, box]
            : incoming
              ? [
                  { ...box, transform: translation(1) },
                  { ...box, transform: 'none' },
                ]
              : [
                  { ...box, transform: 'none' },
                  { ...box, transform: change.mode === 'push' ? translation(-1) : 'none' },
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
      const from = before.rects[id] ?? geometry[id] ?? collapsed;
      const to = visible[id] ?? geometry[id] ?? collapsed;
      const zIndex = focused === id || previousSingle === id ? '3' : '1';
      const { keys, duration } = motionKeys(
        from,
        to,
        raster,
        effect,
        layout.frameRate,
        shownBefore,
        shownAfter,
        zIndex,
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
        style={
          {
            '--cg-live-layout-aspect': raster.width / raster.height,
            aspectRatio: `${String(raster.width)} / ${String(raster.height)}`,
            backgroundColor:
              layout.background.kind === 'color'
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
          const titleHidden = (
            focused === undefined ? preset.hiddenTitles : preset.hiddenFocusTitles
          ).includes(id);
          return (
            <div
              key={id}
              className="cg-live-layout-shot"
              data-layout-preview-shot={id}
              data-frame-number={number}
              data-preset-position={position || undefined}
              data-editing={activeShot && selectedFrameId === id ? '' : undefined}
              aria-hidden={!activeShot}
              style={{
                ...cssRect(rect, raster),
                opacity: activeShot ? 1 : 0,
                pointerEvents: activeShot ? 'auto' : 'none',
                zIndex: focused === id ? '3' : '1',
              }}
            >
              <ShotInput source={preview} input={input} frame={rect} fallback={`Frame ${number}`} />
              {!titleHidden &&
                controlLiveLayoutFrameTexts(input, layout.titleStyle).map(({ id, text, style }) => (
                  <ShotTitle key={id} title={text} style={style} raster={raster} />
                ))}
              {activeSingle === undefined && activeShot && (
                <div className="cg-live-layout-focus-action">
                  <Button
                    variant="secondary"
                    aria-label={focusName}
                    title={focusName}
                    data-layout-focus={id}
                    onClick={() => onFocus(id)}
                  >
                    <Icon icon={Maximize2} size={13} /> <IsolatedName>{focusLabel}</IsolatedName>
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {activeSingle !== undefined && layout.frames.length > 1 && (
        <div className="cg-live-layout-switch" role="group" aria-label="Switch focused frame">
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
