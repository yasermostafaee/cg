import { TEMPLATE_SOURCE_MAX_BYTES } from '@cg/shared-ipc';
import {
  CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  CONTROL_LIVE_LAYOUT_TITLE_FONTS,
  CONTROL_LIVE_LAYOUT_TITLE_SIZE_DEFAULT_PERCENT,
  ControlLiveLayoutSchema,
  CUT_LOOK_TRANSITION,
  DEFAULT_LIVE_FIT_MODE,
  controlLiveLayoutFocusLookId,
  controlLiveLayoutFocusTarget,
  controlLiveLayoutFontFamily,
  controlLiveLayoutRects,
  controlLiveLayoutTitleHidden,
  liveRevealSceneRect,
  requiredRuntimeVersionForScene,
  type AssetEntry,
  type Composition,
  type CompositionElement,
  type CompositionFieldGroup,
  type ControlLiveLayout,
  type ControlLiveLayoutBackground,
  type ControlLiveLayoutFont,
  type ControlLiveLayoutFrame,
  type ControlLiveLayoutFrameAttachment,
  type ControlLiveLayoutPreset,
  type ControlLiveLayoutTitleStyle,
  type DynamicField,
  type Element,
  type ElementBase,
  type FieldBinding,
  type FrameRate,
  type Layer,
  type LiveSourceRect,
  type Look,
  type Resolution,
  type Scene,
  type TextElement,
} from '@cg/shared-schema';
import { buildVcgIndexHtml, cgCss, cgJs } from '@cg/single-file-export';
import { pack, sha256Hex, unpack, verify } from '@cg/vcg-format';
import { uuid } from '../../lib/uuid.js';
import { liveLayoutArtwork } from '../../theme.js';
import {
  frameAttachmentArchivePath,
  frameAttachmentPlateRect,
  unpackControlLiveLayoutFrameAttachment,
  type ControlLiveLayoutFrameAttachmentSource,
} from './controlLiveLayoutFrameAttachments.js';

const BACKGROUND_ASSET = 'control-live-layout-background';
const FRAME_RANGE = { in: 0, out: 1 };
const BACKGROUND_FORMATS = {
  png: { kind: 'image', mime: 'image/png', extension: 'png' },
  jpg: { kind: 'image', mime: 'image/jpeg', extension: 'jpg' },
  jpeg: { kind: 'image', mime: 'image/jpeg', extension: 'jpg' },
  webp: { kind: 'image', mime: 'image/webp', extension: 'webp' },
  gif: { kind: 'image', mime: 'image/gif', extension: 'gif' },
  webm: { kind: 'video', mime: 'video/webm', extension: 'webm' },
  mp4: { kind: 'video', mime: 'video/mp4', extension: 'mp4' },
} as const;
type BackgroundFormat = (typeof BACKGROUND_FORMATS)[keyof typeof BACKGROUND_FORMATS];
const backgroundFormats = Object.values(BACKGROUND_FORMATS);
const FONT_FORMATS = {
  ttf: { mime: 'font/ttf', signatures: ['\u0000\u0001\u0000\u0000', 'true'] },
  otf: { mime: 'font/otf', signatures: ['OTTO', '\u0000\u0001\u0000\u0000'] },
  woff: { mime: 'font/woff', signatures: ['wOFF'] },
  woff2: { mime: 'font/woff2', signatures: ['wOF2'] },
} as const;

export const CONTROL_LIVE_LAYOUT_BACKGROUND_ACCEPT = Object.keys(BACKGROUND_FORMATS)
  .map((extension) => '.' + extension)
  .join(',');

export const CONTROL_LIVE_LAYOUT_FONT_ACCEPT = Object.keys(FONT_FORMATS)
  .map((extension) => '.' + extension)
  .join(',');

export function createControlLiveLayout(
  resolution: Resolution = { width: 1920, height: 1080 },
  frameRate: FrameRate = 25,
): ControlLiveLayout {
  const frames = Array.from(
    { length: 2 },
    (): ControlLiveLayoutFrame => ({
      id: 'frame-' + uuid(),
      title: '',
      operatorPlacement: 'locked',
      operatorMove: false,
    }),
  );
  const presetId = 'preset-' + uuid();
  const gap = Math.round(Math.min(resolution.width, resolution.height) * 0.025);
  return {
    id: uuid(),
    name: 'New live layout',
    resolution,
    frameRate,
    frames,
    titleStyle: {
      xPercent: 0,
      yPercent: 100,
      widthPercent: 100,
      heightPercent: 12,
      padding: 0,
      textOffsetY: 0,
      sizePercent: 4.5,
      borderRadius: 0,
      fontFamily: 'Exo 2',
      fontWeight: 700,
      fontStyle: 'normal',
      align: 'center',
      verticalAlign: 'middle',
      color: liveLayoutArtwork.titleText,
      backgroundColor: liveLayoutArtwork.newTitleBackground,
      wrap: true,
    },
    presets: [
      {
        id: presetId,
        name: 'Two-up',
        frameIds: frames.map(({ id }) => id),
        arrangement: 'side-by-side',
        horizontalGap: gap,
        verticalGap: gap,
        reverse: false,
        hiddenTitles: [],
        hiddenFocusTitles: [],
      },
    ],
    defaultPresetId: presetId,
    background: { kind: 'color', color: liveLayoutArtwork.background },
    effects: structuredClone(CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS),
  };
}

function backgroundTooLarge() {
  return new Error('This background exceeds the saved layout size limit. Choose a smaller file.');
}

/** Validate that the browser can actually read a selected image or video. */
export async function readControlLiveLayoutBackgroundFile(
  file: File,
): Promise<ControlLiveLayoutBackground> {
  if (file.size > TEMPLATE_SOURCE_MAX_BYTES) throw backgroundTooLarge();
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const format =
    backgroundFormats.find(({ mime }) => mime === file.type) ??
    Object.entries(BACKGROUND_FORMATS).find(([suffix]) => suffix === extension)?.[1];
  if (format === undefined)
    throw new Error('Choose a PNG, JPEG, WebP, GIF, WebM or MP4 background.');
  if (file.size === 0) throw new Error('The background file is empty.');
  const url = URL.createObjectURL(file);
  try {
    const name = file.name;
    if (format.kind === 'video') {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      const durationMs = await new Promise<number>((resolve, reject) => {
        const fail = () => reject(new Error('This video background could not be read.'));
        const timer = setTimeout(fail, 10_000);
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          const duration = Math.round(video.duration * 1_000);
          if (
            !video.videoWidth ||
            !video.videoHeight ||
            !Number.isFinite(duration) ||
            duration <= 0
          )
            fail();
          else resolve(duration);
        };
        video.onerror = () => {
          clearTimeout(timer);
          fail();
        };
        video.src = url;
      }).finally(() => {
        video.onloadedmetadata = null;
        video.onerror = null;
        video.removeAttribute('src');
        video.load();
      });
      return { kind: 'video', name, mime: format.mime, durationMs };
    }
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error('This image background could not be read.');
    });
    return { kind: 'image', name, mime: format.mime };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Read only fonts that the browser can render. The same bytes travel in the VCG. */
export async function readControlLiveLayoutFontFile(file: File): Promise<ControlLiveLayoutFont> {
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const format = Object.entries(FONT_FORMATS).find(([suffix]) => suffix === extension)?.[1];
  if (format === undefined) throw new Error('Choose a TTF, OTF, WOFF or WOFF2 font.');
  if (file.size > TEMPLATE_SOURCE_MAX_BYTES) throw layoutTooLarge();
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (!fontSignatureMatches(bytes, format.signatures))
    throw new Error('This font file does not match its format.');
  const id = sha256Hex(bytes);
  try {
    const fontFace = new FontFace(controlLiveLayoutFontFamily(id), buffer);
    await fontFace.load();
  } catch {
    throw new Error('This font could not be loaded.');
  }
  return { id, name: file.name, mime: format.mime };
}

function fontSignatureMatches(bytes: Uint8Array, signatures: readonly string[]) {
  return signatures.includes(String.fromCharCode(...bytes.subarray(0, 4)));
}

function layoutTooLarge() {
  return new Error('This layout exceeds the saved file size limit. Choose smaller media or fonts.');
}

function elementBase(id: string, name: string, rect: LiveSourceRect, zIndex = 0): ElementBase {
  return {
    id,
    name,
    visible: true,
    locked: false,
    opacity: 1,
    zIndex,
    transform: {
      position: { x: rect.x, y: rect.y },
      size: { w: rect.width, h: rect.height },
      scale: { x: 1, y: 1 },
      anchor: { x: 0, y: 0 },
      rotation: 0,
    },
  };
}

function layer(id: string, name: string, children: Element[]): Layer {
  return { id, name, children, blendMode: 'normal', visible: true, locked: false };
}

function backgroundElements(layout: ControlLiveLayout, fullFrame: LiveSourceRect): Element[] {
  const background = layout.background;
  const base: Element = {
    ...elementBase('background-color', 'Background', fullFrame),
    type: 'shape',
    shape: 'rect',
    fill: {
      kind: 'solid',
      color: background.kind === 'color' ? background.color : liveLayoutArtwork.mediaBackdrop,
    },
    liveForeground: false,
  };
  if (background.kind === 'color') return [base];
  const media = {
    ...elementBase('background-media', 'Background media', fullFrame, 1),
    assetId: BACKGROUND_ASSET,
    liveForeground: false,
  };
  return [
    base,
    background.kind === 'image'
      ? { ...media, type: 'image', source: 'project', fit: 'contain', preserveAspect: true }
      : {
          ...media,
          type: 'video',
          durationMs: background.durationMs,
          // The background keeps decoding across look changes because it belongs to the root.
          phases: { introEnd: 0, idle: { start: 0, end: background.durationMs } },
        },
  ];
}

/** Frame-local title geometry shared by the layout editor and the compiled artwork. */
export function controlLiveLayoutTitleGeometry(
  frame: Resolution,
  style?: ControlLiveLayoutTitleStyle,
) {
  const sizePercent = style?.sizePercent ?? CONTROL_LIVE_LAYOUT_TITLE_SIZE_DEFAULT_PERCENT;
  const fontScale = sizePercent / 100;
  const inset = frame.height * 0.035;
  const widthPercent = style?.widthPercent ?? 66;
  const width = frame.width * (widthPercent / 100);
  // Keep the existing default caption band and grow it if the chosen line needs more room.
  const lineHeight = 1.18;
  const paddingScale = 0.012;
  const padding = style?.padding ?? Math.max(1, frame.height * paddingScale);
  const naturalHeight =
    style?.padding === undefined
      ? frame.height * Math.max(0.085, fontScale * lineHeight + 2 * paddingScale)
      : Math.max(frame.height * 0.085, frame.height * fontScale * lineHeight + 2 * padding);
  const height =
    style?.heightPercent === undefined
      ? Math.min(frame.height, naturalHeight)
      : frame.height * (style.heightPercent / 100);
  const travelX = frame.width - width;
  const travelY = frame.height - height;
  const x =
    style?.xPercent === undefined ? Math.min(inset, travelX) : travelX * (style.xPercent / 100);
  const y =
    style?.yPercent === undefined ? Math.max(0, travelY - inset) : travelY * (style.yPercent / 100);
  return {
    x,
    y,
    width,
    height,
    xPercent: style?.xPercent ?? (travelX === 0 ? 0 : (100 * x) / travelX),
    yPercent: style?.yPercent ?? (travelY === 0 ? 0 : (100 * y) / travelY),
    widthPercent,
    heightPercent: style?.heightPercent ?? (100 * height) / frame.height,
    sizePercent,
    fontFamily: style?.fontFamily ?? CONTROL_LIVE_LAYOUT_TITLE_FONTS[0],
    fontWeight: style?.fontWeight ?? 600,
    fontStyle: style?.fontStyle ?? 'normal',
    digits: style?.digits ?? 'as-typed',
    fontSize: Math.max(1, frame.height * fontScale),
    lineHeight,
    padding,
    textOffsetY: style?.textOffsetY ?? 0,
    align: style?.align ?? 'start',
    verticalAlign: style?.verticalAlign ?? 'middle',
    color: style?.color ?? liveLayoutArtwork.titleText,
    backgroundColor: style?.backgroundColor ?? liveLayoutArtwork.titleBackground,
    stroke: style?.stroke ?? null,
    textShadow: style?.textShadow ?? null,
    boxShadow: style?.boxShadow ?? null,
    borderRadius: style?.borderRadius ?? 0,
    wrap: style?.wrap ?? false,
  };
}

interface FrameText {
  id: string;
  fieldId: string;
  label: string;
  text: string;
  style: ControlLiveLayoutTitleStyle;
}

type CaptionLayout = Pick<ControlLiveLayout, 'resolution' | 'titleStyle' | 'additionalTextStyles'>;

/** Default extra-text placement leaves room for the other blocks in the frame. */
export function controlLiveLayoutAdditionalTextStyle(
  layout: CaptionLayout,
  frameStyle: ControlLiveLayoutTitleStyle | undefined,
  index: number,
): ControlLiveLayoutTitleStyle {
  const base = { ...layout.titleStyle, ...frameStyle };
  const { yPercent, heightPercent } = controlLiveLayoutTitleGeometry(layout.resolution, base);
  return {
    ...base,
    yPercent: Math.max(0, yPercent - (index + 1) * (heightPercent + 2)),
    ...layout.additionalTextStyles?.[index],
  };
}

/** Effective caption blocks in paint order, shared by the editor and the compiled artwork. */
export function controlLiveLayoutFrameTexts(
  frame: ControlLiveLayoutFrame,
  layout: CaptionLayout,
): FrameText[] {
  const style = { ...layout.titleStyle, ...frame.titleStyle };
  return [
    { id: frame.id + '-title', fieldId: 'title', label: 'Title', text: frame.title, style },
    ...(frame.additionalTexts ?? []).map((entry, index) => ({
      id: `layout-text:${frame.id}:${entry.id}`,
      fieldId: 'text-' + entry.id,
      label: 'Text ' + String(index + 2),
      text: entry.text,
      style: {
        ...controlLiveLayoutAdditionalTextStyle(layout, frame.titleStyle, index),
        ...entry.style,
      },
    })),
  ].filter(({ text }) => text.trim() !== '');
}

function frameTitle(block: FrameText, resolution: Resolution, zIndex: number): TextElement {
  const title = controlLiveLayoutTitleGeometry(resolution, block.style);
  return {
    ...elementBase(block.id, block.label, title, zIndex),
    type: 'text',
    text: block.text,
    font: {
      family: title.fontFamily,
      weight: title.fontWeight,
      style: title.fontStyle,
      size: title.fontSize,
      lineHeight: title.lineHeight,
      letterSpacing: 0,
    },
    color: title.color,
    backgroundColor: title.backgroundColor,
    padding: title.padding,
    align: title.align,
    direction: 'auto',
    ...(title.digits !== 'as-typed' && { digits: title.digits }),
    ...(!title.wrap && { maxLines: 1 }),
    wrap: title.wrap,
    verticalAlign: title.verticalAlign,
    ...(title.textOffsetY !== 0 && { textOffsetY: title.textOffsetY }),
    ...(title.stroke !== null && { stroke: title.stroke }),
    ...(title.textShadow !== null && { textShadow: title.textShadow }),
    ...(title.boxShadow !== null && { shadow: title.boxShadow }),
    ...(title.borderRadius !== 0 && { cornerRadius: title.borderRadius }),
    fitMode: 'shrink-to-fit',
    overflow: title.wrap ? 'clip' : 'ellipsis',
    liveForeground: true,
  };
}

interface ResolvedAttachment {
  attachment: ControlLiveLayoutFrameAttachment;
  source: ControlLiveLayoutFrameAttachmentSource;
}

function maskedAttachmentPlateId(attachmentId: string): string {
  return 'attachment-plate-' + attachmentId;
}

function frameComposition(
  frame: ControlLiveLayoutFrame,
  layout: CaptionLayout,
  fullFrame: LiveSourceRect,
  attachments: readonly ResolvedAttachment[],
): Composition {
  const { resolution } = layout;
  const resize = frame.operatorPlacement ?? 'free';
  const operatorMove = frame.operatorMove ?? (resize === 'locked' ? true : undefined);
  const children: Element[] = [
    {
      ...elementBase(frame.id + '-plate', 'Live input', fullFrame),
      type: 'video-placeholder',
      routeKey: frame.id,
      fitMode: frame.fitMode ?? DEFAULT_LIVE_FIT_MODE,
      ...(resize !== 'locked' && { operatorPlacement: resize }),
      ...(operatorMove !== undefined && { operatorMove }),
      ...(frame.liveMask !== undefined && { liveMask: frame.liveMask }),
      ...(frame.allowOperatorMaskEdit === true && { allowOperatorMaskEdit: true }),
      showFallback: false,
    },
  ];
  attachments.forEach(({ attachment, source }, index) => {
    const plate = source.plate?.element;
    if (plate !== undefined) {
      children.push({
        ...elementBase(
          maskedAttachmentPlateId(attachment.id),
          'Masked live input',
          frameAttachmentPlateRect(fullFrame, attachment, source),
        ),
        type: 'video-placeholder',
        routeKey: frame.id,
        fitMode: plate.fitMode ?? frame.fitMode ?? DEFAULT_LIVE_FIT_MODE,
        ...(plate.liveMask !== undefined && { liveMask: plate.liveMask }),
        ...(resize !== 'locked' && { operatorPlacement: resize }),
        ...(operatorMove !== undefined && { operatorMove }),
        ...(frame.allowOperatorMaskEdit === true && { allowOperatorMaskEdit: true }),
        showFallback: false,
      });
    }
    children.push({
      ...elementBase(
        'attachment-art-' + attachment.id,
        attachment.name,
        liveRevealSceneRect(fullFrame, attachment.rect),
        index + 1,
      ),
      type: 'composition',
      compositionId: source.scene.id,
      liveForeground: true,
    });
  });
  const base: Composition = {
    id: 'layout-frame-' + frame.id,
    name: 'Live frame',
    resolution,
    frameRange: FRAME_RANGE,
    editorBackdrop: 'transparent',
    layers: [layer(frame.id + '-layer', 'Frame', children)],
  };
  const captions = controlLiveLayoutFrameTexts(frame, layout).map((block, index) => ({
    block,
    element: frameTitle(block, resolution, attachments.length + index + 1),
  }));
  if (captions.length === 0) return base;
  children.push(...captions.map(({ element }) => element));
  return {
    ...base,
    fields: captions.map(
      ({ block, element }): DynamicField => ({
        id: block.fieldId,
        type: 'text',
        label: block.label,
        default: block.text,
        required: false,
        direction: 'auto',
        ...(element.digits !== undefined && { digits: element.digits }),
      }),
    ),
    bindings: captions.map(
      ({ block, element }): FieldBinding => ({
        fieldId: block.fieldId,
        target: { kind: 'text', elementId: element.id },
      }),
    ),
  };
}

/** Compile a regular multi-look scene. Each look instances the same per-frame composition. */
export function buildControlLiveLayoutScene(
  authored: ControlLiveLayout,
  attachmentSources?: ReadonlyMap<string, ControlLiveLayoutFrameAttachmentSource>,
): Scene {
  const layout = ControlLiveLayoutSchema.parse(authored);
  const { resolution, frames } = layout;
  const fullFrame = { x: 0, y: 0, ...resolution };
  const allAttachments = layout.presets.flatMap((preset) => preset.frameAttachments ?? []);
  if (new Set(allAttachments.map(({ id }) => id)).size !== allAttachments.length)
    throw new Error('Frame graphic IDs must be unique within the layout.');
  const byFrame = new Map<string, ResolvedAttachment[]>();
  const sources = new Map<string, ControlLiveLayoutFrameAttachmentSource>();
  for (const attachment of allAttachments) {
    const source = attachmentSources?.get(attachment.sourceId);
    if (source === undefined || source.id !== attachment.sourceId)
      throw new Error(`Frame graphic “${attachment.name}” is unavailable.`);
    sources.set(source.id, source);
    const definitions = byFrame.get(attachment.frameId) ?? [];
    definitions.push({ attachment, source });
    byFrame.set(attachment.frameId, definitions);
  }
  const frameCompositions = new Map(
    frames.map((frame) => [
      frame.id,
      frameComposition(frame, layout, fullFrame, byFrame.get(frame.id) ?? []),
    ]),
  );
  const compositions = [...frameCompositions.values()];
  for (const { scene } of sources.values()) {
    const { id, name, resolution, layers } = scene;
    compositions.push(
      { id, name, resolution, layers, frameRange: FRAME_RANGE, editorBackdrop: 'transparent' },
      ...(scene.compositions ?? []),
    );
  }
  const rootInstances: CompositionElement[] = [];
  const looks: Look[] = [];

  const addLook = (
    id: string,
    name: string,
    rects: Readonly<Record<string, LiveSourceRect>>,
    preset: ControlLiveLayoutPreset,
    focused: boolean,
  ) => {
    const instanceId = 'layout-look-' + id;
    const children = frames.flatMap((frame, index): CompositionElement[] => {
      const rect = rects[frame.id];
      if (rect === undefined) return [];
      const attachments = byFrame.get(frame.id) ?? [];
      const included = new Set(preset.frameAttachments?.map(({ id }) => id));
      const hiddenChildIds: string[] = [];
      let hasMaskedInput = false;
      for (const { attachment, source } of attachments) {
        if (!included.has(attachment.id)) {
          hiddenChildIds.push('attachment-art-' + attachment.id);
          if (source.plate !== undefined)
            hiddenChildIds.push(maskedAttachmentPlateId(attachment.id));
        } else if (source.plate !== undefined) {
          if (hasMaskedInput)
            throw new Error('Use one masked input template per frame and preset.');
          hasMaskedInput = true;
          hiddenChildIds.push(frame.id + '-plate');
        }
      }
      const hiddenTextIds = controlLiveLayoutTitleHidden(preset, frame.id, focused)
        ? frameCompositions
            .get(frame.id)
            ?.layers[0]?.children.flatMap((element) =>
              element.type === 'text' ? [element.id] : [],
            )
        : undefined;
      return [
        {
          ...elementBase('instance-' + frame.id, frame.id, rect, index),
          type: 'composition',
          compositionId: 'layout-frame-' + frame.id,
          ...(hiddenChildIds.length > 0 && { hiddenChildIds }),
          ...(hiddenTextIds !== undefined && hiddenTextIds.length > 0 && { hiddenTextIds }),
        },
      ];
    });
    compositions.push({
      id: instanceId + '-contents',
      name,
      resolution,
      frameRange: FRAME_RANGE,
      editorBackdrop: 'transparent',
      layers: [layer(instanceId + '-layer', 'Frames', children)],
    });
    rootInstances.push({
      ...elementBase(instanceId, id, fullFrame, 2),
      type: 'composition',
      compositionId: instanceId + '-contents',
    });
    looks.push({
      id,
      name,
      instanceId,
      entered: CUT_LOOK_TRANSITION,
      allowOperatorAutoLayout: !focused,
    });
  };

  for (const preset of layout.presets) {
    addLook(preset.id, preset.name, controlLiveLayoutRects(layout, preset), preset, false);
  }
  for (const preset of layout.presets) {
    frames.forEach((frame, index) => {
      addLook(
        controlLiveLayoutFocusLookId(preset.id, frame.id),
        'Focus · Frame ' + (index + 1),
        { [frame.id]: fullFrame },
        preset,
        true,
      );
    });
  }

  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: layout.id,
    name: layout.name,
    templateType: 'fullscreen',
    resolution,
    frameRate: layout.frameRate,
    safeAreas: { title: 5, action: 3 },
    frameRange: FRAME_RANGE,
    ...(layout.background.kind === 'video'
      ? {
          lifecycle: { outPoint: 0, contentStart: 0 },
          playout: { mode: 'static', holdBehavior: 'loop' },
        }
      : { playout: { mode: 'static' } }),
    editorBackdrop: 'transparent',
    layers: [
      layer('layout-background', 'Background', backgroundElements(layout, fullFrame)),
      layer('layout-presets', 'Presets', rootInstances),
    ],
    fields: [],
    bindings: [],
    fonts: [
      ...(layout.fonts ?? []).map(({ id, name }) => ({
        family: controlLiveLayoutFontFamily(id),
        source: 'bundled' as const,
        bundledPath: name,
        weights: [400],
        styles: ['normal' as const],
      })),
      ...[...sources.values()].flatMap(({ scene }) => scene.fonts),
    ],
    compositions,
    lookGroups: [{ id: 'live-layout', looks, defaultLookId: layout.defaultPresetId }],
    metadata: { createdAt: now, updatedAt: now },
    controlLiveLayout: layout,
  };
}

/**
 * Use opaque, stable field namespace keys so renaming the title or preset preserves saved data.
 * Inspector uses these display labels for the same field groups.
 */
export function labelControlLiveLayoutFieldGroups(
  layout: ControlLiveLayout,
  groups: readonly CompositionFieldGroup[],
): CompositionFieldGroup[] {
  const names = new Map(layout.presets.map(({ id, name }) => [id, name]));
  const frameNames = new Map(
    layout.frames.map(({ id, title }, index) => [id, title.trim() || 'Frame ' + (index + 1)]),
  );
  return groups.map((group) => {
    const focus = controlLiveLayoutFocusTarget(layout, group.name);
    return {
      ...group,
      label: focus === undefined ? (names.get(group.name) ?? group.label) : 'Focus',
      aggregate: {
        ...group.aggregate,
        groups: group.aggregate.groups.map((child) => ({
          ...child,
          label: frameNames.get(child.name) ?? child.label,
        })),
      },
    };
  });
}

function mediaFormat(mime: BackgroundFormat['mime']): BackgroundFormat {
  const format = backgroundFormats.find((candidate) => candidate.mime === mime);
  if (format === undefined) throw new Error('The background format is unavailable.');
  return format;
}

export async function compileControlLiveLayout(
  layout: ControlLiveLayout,
  asset?: Blob,
  fontFiles?: ReadonlyMap<string, Blob>,
  attachmentSources?: ReadonlyMap<string, ControlLiveLayoutFrameAttachmentSource>,
): Promise<Uint8Array> {
  const scene = buildControlLiveLayoutScene(layout, attachmentSources);
  const background = layout.background;
  const fontAssets = layout.fonts ?? [];
  const fontBytes = fontAssets.reduce((sum, { id }) => sum + (fontFiles?.get(id)?.size ?? 0), 0);
  if (
    (background.kind === 'color' ? 0 : (asset?.size ?? 0)) + fontBytes >
    TEMPLATE_SOURCE_MAX_BYTES
  )
    throw layoutTooLarge();
  const assetIndex: AssetEntry[] = [];
  const fontIndex: AssetEntry[] = [];
  const assets = new Map<string, Uint8Array>();
  const fonts = new Map<string, Uint8Array>();
  const usedAttachmentIds = new Set(
    layout.presets.flatMap((preset) =>
      (preset.frameAttachments ?? []).map(({ sourceId }) => sourceId),
    ),
  );
  let attachmentBytes = 0;
  for (const id of usedAttachmentIds) {
    const source = attachmentSources?.get(id);
    if (source === undefined || sha256Hex(source.bytes) !== id)
      throw new Error('A frame graphic does not match the saved template.');
    assets.set(frameAttachmentArchivePath(id), source.bytes);
    attachmentBytes += source.bytes.length;
    for (const { entry, bytes } of source.assets) {
      attachmentBytes += bytes.length;
      if (entry.kind === 'font') {
        fontIndex.push(entry);
        fonts.set(entry.path, bytes);
      } else {
        assetIndex.push(entry);
        assets.set(entry.path, bytes);
      }
    }
  }
  if ((asset?.size ?? 0) + fontBytes + attachmentBytes > TEMPLATE_SOURCE_MAX_BYTES)
    throw layoutTooLarge();
  if (background.kind !== 'color') {
    if (asset === undefined || asset.size === 0) throw new Error('Choose the background file.');
    if (asset.size > TEMPLATE_SOURCE_MAX_BYTES) throw backgroundTooLarge();
    const format = mediaFormat(background.mime);
    const bytes = new Uint8Array(await asset.arrayBuffer());
    const sha256 = sha256Hex(bytes);
    const path = `assets/${format.kind}/${sha256}.${format.extension}`;
    assetIndex.push({
      id: BACKGROUND_ASSET,
      path,
      filename: background.name,
      kind: format.kind,
      mime: format.mime,
      bytes: bytes.length,
      sha256,
    });
    assets.set(path, bytes);
  }
  for (const font of fontAssets) {
    const file = fontFiles?.get(font.id);
    if (file === undefined) throw new Error(`Choose the font file “${font.name}” again.`);
    const format = Object.entries(FONT_FORMATS).find(([, { mime }]) => mime === font.mime);
    if (format === undefined) throw new Error(`The font format of “${font.name}” is unavailable.`);
    const [extension, { signatures }] = format;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!fontSignatureMatches(bytes, signatures) || sha256Hex(bytes) !== font.id)
      throw new Error(`The font file “${font.name}” does not match the saved font.`);
    const path = `fonts/${font.id}.${extension}`;
    fontIndex.push({
      id: font.id,
      path,
      kind: 'font',
      mime: font.mime,
      bytes: bytes.length,
      sha256: font.id,
    });
    fonts.set(path, bytes);
  }

  const packageBytes = await pack({
    scene,
    manifestExtras: {
      id: scene.id,
      name: scene.name,
      authoring: {
        designerVersion: '0.0.0',
        createdAt: scene.metadata.createdAt,
        exportedAt: scene.metadata.updatedAt,
      },
      compatibility: {
        minRuntimeVersion:
          usedAttachmentIds.size > 0 ? '1.2.7' : requiredRuntimeVersionForScene(scene, true),
        minCasparCGVersion: '2.3.0',
      },
      fontDeps: scene.fonts,
      assetIndex: [...assetIndex, ...fontIndex],
    },
    indexHtml: buildVcgIndexHtml(scene, assetIndex, fontIndex, false),
    cgJs,
    cgCss,
    assets,
    fonts,
  });
  if (packageBytes.byteLength > TEMPLATE_SOURCE_MAX_BYTES) throw layoutTooLarge();
  return packageBytes;
}

export async function readControlLiveLayout(bytes: Uint8Array): Promise<{
  layout: ControlLiveLayout;
  asset?: Blob;
  fonts: Map<string, Blob>;
  attachments: Map<string, ControlLiveLayoutFrameAttachmentSource>;
}> {
  if (!(await verify(bytes)).ok) throw new Error('The saved live layout could not be verified.');
  const { scene, manifest, files } = await unpack(bytes);
  const layout = scene.controlLiveLayout;
  if (layout === undefined)
    throw new Error('This template does not contain an editable live layout.');
  const fonts = new Map<string, Blob>();
  const attachments = new Map<string, ControlLiveLayoutFrameAttachmentSource>();
  for (const preset of layout.presets) {
    for (const { sourceId, name } of preset.frameAttachments ?? []) {
      if (attachments.has(sourceId)) continue;
      const raw = files.get(frameAttachmentArchivePath(sourceId));
      if (raw === undefined || sha256Hex(raw) !== sourceId)
        throw new Error(`The saved frame graphic “${name}” is unavailable.`);
      attachments.set(sourceId, await unpackControlLiveLayoutFrameAttachment(raw));
    }
  }
  for (const font of layout.fonts ?? []) {
    const entry = manifest.assetIndex.find(({ id, kind }) => id === font.id && kind === 'font');
    const data = entry === undefined ? undefined : files.get(entry.path);
    if (data === undefined || entry?.mime !== font.mime || sha256Hex(data) !== font.id)
      throw new Error(`The saved font file “${font.name}” is unavailable.`);
    fonts.set(font.id, new Blob([new Uint8Array(data)], { type: font.mime }));
  }
  if (layout.background.kind === 'color') return { layout, fonts, attachments };
  const entry = manifest.assetIndex.find(({ id }) => id === BACKGROUND_ASSET);
  const data = entry === undefined ? undefined : files.get(entry.path);
  if (entry === undefined || data === undefined || entry.mime !== layout.background.mime)
    throw new Error('The saved background file is unavailable.');
  return {
    layout,
    asset: new Blob([new Uint8Array(data)], { type: entry.mime }),
    fonts,
    attachments,
  };
}
