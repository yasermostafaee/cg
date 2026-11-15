import { TEMPLATE_SOURCE_MAX_BYTES } from '@cg/shared-ipc';
import {
  CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  ControlLiveLayoutSchema,
  CUT_LOOK_TRANSITION,
  controlLiveLayoutFocusLookId,
  controlLiveLayoutFocusTarget,
  controlLiveLayoutRects,
  requiredRuntimeVersionForScene,
  type AssetEntry,
  type Composition,
  type CompositionElement,
  type CompositionFieldGroup,
  type ControlLiveLayout,
  type ControlLiveLayoutBackground,
  type ControlLiveLayoutFrame,
  type Element,
  type ElementBase,
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

export const CONTROL_LIVE_LAYOUT_BACKGROUND_ACCEPT = Object.keys(BACKGROUND_FORMATS)
  .map((extension) => '.' + extension)
  .join(',');

export function createControlLiveLayout(
  resolution: Resolution = { width: 1920, height: 1080 },
  frameRate: FrameRate = 25,
): ControlLiveLayout {
  const frames = Array.from({ length: 2 }, () => ({ id: 'frame-' + uuid(), title: '' }));
  const presetId = 'preset-' + uuid();
  const gap = Math.round(Math.min(resolution.width, resolution.height) * 0.025);
  return {
    id: uuid(),
    name: 'New live layout',
    resolution,
    frameRate,
    frames,
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

function frameTitle(frame: ControlLiveLayoutFrame, fullFrame: LiveSourceRect): TextElement {
  const inset = fullFrame.height * 0.035;
  const height = fullFrame.height * 0.085;
  return {
    ...elementBase(
      frame.id + '-title',
      'Title',
      { x: inset, y: fullFrame.height - height - inset, width: fullFrame.width * 0.66, height },
      1,
    ),
    type: 'text',
    text: frame.title,
    font: {
      family: 'Vazirmatn',
      weight: 600,
      style: 'normal',
      size: Math.max(1, fullFrame.height * 0.042),
      lineHeight: 1.18,
      letterSpacing: 0,
    },
    color: liveLayoutArtwork.titleText,
    backgroundColor: liveLayoutArtwork.titleBackground,
    padding: Math.max(1, fullFrame.height * 0.012),
    align: 'start',
    direction: 'auto',
    maxLines: 1,
    wrap: false,
    verticalAlign: 'middle',
    fitMode: 'shrink-to-fit',
    overflow: 'ellipsis',
    liveForeground: true,
  };
}

function frameComposition(
  frame: ControlLiveLayoutFrame,
  resolution: Scene['resolution'],
  fullFrame: LiveSourceRect,
): Composition {
  const children: Element[] = [
    {
      ...elementBase(frame.id + '-plate', 'Live input', fullFrame),
      type: 'video-placeholder',
      routeKey: frame.id,
      fitMode: 'contain',
      operatorPlacement: 'free',
      showFallback: false,
    },
  ];
  const base: Composition = {
    id: 'layout-frame-' + frame.id,
    name: 'Live frame',
    resolution,
    frameRange: FRAME_RANGE,
    editorBackdrop: 'transparent',
    layers: [layer(frame.id + '-layer', 'Frame', children)],
  };
  if (frame.title.trim() === '') return base;
  const title = frameTitle(frame, fullFrame);
  children.push(title);
  return {
    ...base,
    fields: [
      {
        id: 'title',
        type: 'text',
        label: 'Title',
        default: frame.title,
        required: false,
        direction: 'auto',
      },
    ],
    bindings: [{ fieldId: 'title', target: { kind: 'text', elementId: title.id } }],
  };
}

/** Compile a regular multi-look scene. Each look instances the same per-frame composition. */
export function buildControlLiveLayoutScene(authored: ControlLiveLayout): Scene {
  const layout = ControlLiveLayoutSchema.parse(authored);
  const { resolution, frames } = layout;
  const fullFrame = { x: 0, y: 0, ...resolution };
  const compositions = frames.map((frame) => frameComposition(frame, resolution, fullFrame));
  const rootInstances: CompositionElement[] = [];
  const looks: Look[] = [];

  const addLook = (
    id: string,
    name: string,
    rects: Readonly<Record<string, LiveSourceRect>>,
    hiddenTitleIds: readonly string[],
    allowsAutoLayout: boolean,
  ) => {
    const instanceId = 'layout-look-' + id;
    const children = frames.flatMap((frame, index): CompositionElement[] => {
      const rect = rects[frame.id];
      if (rect === undefined) return [];
      const hidden = frame.title.trim() !== '' && hiddenTitleIds.includes(frame.id);
      return [
        {
          ...elementBase('instance-' + frame.id, frame.id, rect, index),
          type: 'composition',
          compositionId: 'layout-frame-' + frame.id,
          ...(hidden && { hiddenTextIds: [frame.id + '-title'] }),
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
      allowOperatorAutoLayout: allowsAutoLayout,
    });
  };

  for (const preset of layout.presets) {
    addLook(
      preset.id,
      preset.name,
      controlLiveLayoutRects(layout, preset),
      preset.hiddenTitles,
      true,
    );
  }
  for (const preset of layout.presets) {
    frames.forEach((frame, index) => {
      addLook(
        controlLiveLayoutFocusLookId(preset.id, frame.id),
        'Focus · Frame ' + (index + 1),
        { [frame.id]: fullFrame },
        preset.hiddenFocusTitles,
        false,
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
    fonts: [],
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
): Promise<Uint8Array> {
  const scene = buildControlLiveLayoutScene(layout);
  const background = layout.background;
  const assetIndex: AssetEntry[] = [];
  const assets = new Map<string, Uint8Array>();
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
        minRuntimeVersion: requiredRuntimeVersionForScene(scene, true),
        minCasparCGVersion: '2.3.0',
      },
      fontDeps: scene.fonts,
      assetIndex,
    },
    indexHtml: buildVcgIndexHtml(scene, assetIndex, [], false),
    cgJs,
    cgCss,
    assets,
  });
  if (packageBytes.byteLength > TEMPLATE_SOURCE_MAX_BYTES) throw backgroundTooLarge();
  return packageBytes;
}

export async function readControlLiveLayout(
  bytes: Uint8Array,
): Promise<{ layout: ControlLiveLayout; asset?: Blob }> {
  if (!(await verify(bytes)).ok) throw new Error('The saved live layout could not be verified.');
  const { scene, manifest, files } = await unpack(bytes);
  const layout = scene.controlLiveLayout;
  if (layout === undefined)
    throw new Error('This template does not contain an editable live layout.');
  if (layout.background.kind === 'color') return { layout };
  const entry = manifest.assetIndex.find(({ id }) => id === BACKGROUND_ASSET);
  const data = entry === undefined ? undefined : files.get(entry.path);
  if (entry === undefined || data === undefined || entry.mime !== layout.background.mime)
    throw new Error('The saved background file is unavailable.');
  return { layout, asset: new Blob([new Uint8Array(data)], { type: entry.mime }) };
}
