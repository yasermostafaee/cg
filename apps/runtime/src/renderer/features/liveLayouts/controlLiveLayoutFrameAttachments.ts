import { TEMPLATE_SOURCE_MAX_BYTES } from '@cg/shared-ipc';
import {
  flattenElements,
  liveRevealSceneRect,
  sameLiveMaskRect,
  type AssetEntry,
  type Composition,
  type ControlLiveLayout,
  type ControlLiveLayoutFrameAttachment,
  type Element,
  type Layer,
  type LiveSourceRect,
  type Scene,
  type VideoPlaceholderElement,
} from '@cg/shared-schema';
import { projectCompositionForExport, sha256Hex, unpack, verify } from '@cg/vcg-format';

const extensions: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
};

export interface ControlLiveLayoutFrameAttachmentSource {
  id: string;
  name: string;
  bytes: Uint8Array;
  scene: Scene;
  assets: { entry: AssetEntry; bytes: Uint8Array }[];
  plate?: { element: VideoPlaceholderElement; rect: LiveSourceRect };
}

function sameFrameGraphic(
  left: ControlLiveLayoutFrameAttachment,
  right: ControlLiveLayoutFrameAttachment,
): boolean {
  return (
    left.frameId === right.frameId &&
    left.sourceId === right.sourceId &&
    sameLiveMaskRect(left.rect, right.rect)
  );
}

/** Promote legacy graphics when their frame is edited and at most one masked input remains. */
export function promoteFrameAttachments(
  layout: ControlLiveLayout,
  frameId: string,
  sources: ReadonlyMap<string, ControlLiveLayoutFrameAttachmentSource>,
  selectedId?: string,
): ControlLiveLayout {
  const legacy = layout.presets.flatMap(({ frameAttachments }) =>
    (frameAttachments ?? []).filter((attachment) => attachment.frameId === frameId),
  );
  if (legacy.length === 0 || legacy.some(({ sourceId }) => !sources.has(sourceId))) return layout;
  const shared = [...(layout.frameAttachments ?? [])];
  for (const attachment of legacy) {
    const duplicate = shared.findIndex((candidate) => sameFrameGraphic(candidate, attachment));
    if (duplicate < 0) shared.push(attachment);
    else if (attachment.id === selectedId) shared[duplicate] = attachment;
  }
  const masked = shared.filter(
    (attachment) =>
      attachment.frameId === frameId && sources.get(attachment.sourceId)?.plate !== undefined,
  );
  if (masked.length > 1) return layout;
  return {
    ...layout,
    frameAttachments: shared,
    presets: layout.presets.map((preset) => {
      const frameAttachments = preset.frameAttachments?.filter(
        (attachment) => attachment.frameId !== frameId,
      );
      if (frameAttachments?.length === preset.frameAttachments?.length) return preset;
      const { frameAttachments: _legacy, ...other } = preset;
      return {
        ...other,
        ...(frameAttachments !== undefined && frameAttachments.length > 0 && { frameAttachments }),
      };
    }),
  };
}

export function frameAttachmentArchivePath(id: string): string {
  return `assets/live-layout-sources/${id}.vcg`;
}

export function frameAttachmentPlateRect(
  frame: LiveSourceRect,
  attachment: ControlLiveLayoutFrameAttachment,
  source: ControlLiveLayoutFrameAttachmentSource,
): LiveSourceRect {
  const {
    plate,
    scene: { resolution },
  } = source;
  const box = liveRevealSceneRect(frame, attachment.rect);
  if (plate === undefined) return box;
  const { x, y, width, height } = plate.rect;
  return liveRevealSceneRect(box, {
    x: x / resolution.width,
    y: y / resolution.height,
    width: width / resolution.width,
    height: height / resolution.height,
  });
}

export async function readControlLiveLayoutFrameAttachment(
  file: Blob,
): Promise<ControlLiveLayoutFrameAttachmentSource> {
  if (file.size > TEMPLATE_SOURCE_MAX_BYTES) throw new Error('The plate graphic is too large.');
  return unpackControlLiveLayoutFrameAttachment(new Uint8Array(await file.arrayBuffer()));
}

export async function unpackControlLiveLayoutFrameAttachment(
  bytes: Uint8Array,
): Promise<ControlLiveLayoutFrameAttachmentSource> {
  if (bytes.length > TEMPLATE_SOURCE_MAX_BYTES || !(await verify(bytes)).ok)
    throw new Error('Choose a complete, verified VCG plate graphic.');
  const { scene: authored, manifest, files } = await unpack(bytes);
  const scene =
    authored.entryCompositionId === undefined
      ? authored
      : projectCompositionForExport(authored, authored.entryCompositionId);
  if (scene === null) throw new Error('The template has no valid entry composition.');
  if ((scene.lookGroups?.length ?? 0) > 0 || (scene.arrangements?.length ?? 0) > 0)
    throw new Error('Export one graphic or one masked plate from Designer.');

  const id = sha256Hex(bytes);
  const namespace = `frame-art-${id}`;
  const compositions: Composition[] = [];
  const compositionIds = new Map<string, string>();
  const byId = new Map(scene.compositions?.map((comp) => [comp.id, comp]));
  const assets = new Map<string, ControlLiveLayoutFrameAttachmentSource['assets'][number]>();
  const resolveAsset = (assetId: string, kind: 'image' | 'font'): string => {
    const assetKey = `${kind}:${assetId}`;
    const known = assets.get(assetKey);
    if (known !== undefined) return known.entry.id;
    const entry = manifest.assetIndex.find((entry) => entry.id === assetId && entry.kind === kind);
    const bytes = entry === undefined ? undefined : files.get(entry.path);
    const extension = entry === undefined ? undefined : extensions[entry.mime];
    if (
      bytes === undefined ||
      entry === undefined ||
      extension === undefined ||
      bytes.length !== entry.bytes ||
      sha256Hex(bytes) !== entry.sha256 ||
      !entry.mime.startsWith(kind + '/')
    )
      throw new Error('The template has a missing or unsupported picture or font.');
    const fileId = `${namespace}-${assets.size}`;
    const path = `${kind === 'font' ? 'fonts' : 'assets/frame-art'}/${fileId}.${extension}`;
    assets.set(assetKey, { entry: { ...entry, id: fileId, path }, bytes });
    return fileId;
  };

  // The outer layout owns playback and live routing. Import only artwork data and its assets.
  const copyLayers = (
    doc: Pick<Composition, 'layers' | 'fields' | 'bindings'>,
    parents: ReadonlySet<string>,
  ): Layer[] => {
    const textDefaults = new Map(
      (doc.fields ?? []).flatMap((field) =>
        field.type === 'text' ? [[field.id, field.default] as const] : [],
      ),
    );
    return doc.layers.map((layer) => ({
      ...layer,
      children: layer.children.flatMap((element): Element[] => {
        if (element.animation !== undefined && Object.keys(element.animation.tracks).length > 0)
          throw new Error(
            'Plate graphics use static artwork. Remove timeline animation and export again.',
          );
        if (element.type === 'video-placeholder') return [];
        if (element.type === 'composition') {
          const child = byId.get(element.compositionId);
          if (child === undefined || parents.has(child.id) || parents.size >= 5)
            throw new Error(
              'The graphic’s composition references are too deeply nested or invalid.',
            );
          let compositionId = compositionIds.get(child.id);
          if (compositionId === undefined) {
            compositionId = `${namespace}-comp-${compositionIds.size}`;
            compositionIds.set(child.id, compositionId);
            const layers = copyLayers(child, new Set([...parents, child.id]));
            compositions.push({
              id: compositionId,
              name: child.name,
              resolution: child.resolution,
              frameRange: { in: 0, out: 1 },
              editorBackdrop: 'transparent',
              layers,
            });
          }
          return [{ ...element, compositionId }];
        }
        if (element.type === 'image')
          return [
            { ...element, source: 'project', assetId: resolveAsset(element.assetId, 'image') },
          ];
        if (element.type === 'text') {
          const binding = doc.bindings?.find(
            ({ target }) => target.kind === 'text' && target.elementId === element.id,
          );
          const text =
            (binding === undefined ? undefined : textDefaults.get(binding.fieldId)) ?? element.text;
          const font = element.font.family.startsWith('asset-')
            ? {
                ...element.font,
                family: `asset-${resolveAsset(element.font.family.slice(6), 'font')}`,
              }
            : element.font;
          return [{ ...element, text, font }];
        }
        if (element.type === 'shape' || element.type === 'path') return [element];
        throw new Error(
          'Plate graphics support images, shapes, paths, text and a single masked live plate.',
        );
      }),
    }));
  };
  const live = flattenElements(scene).filter(({ element }) => element.type === 'video-placeholder');
  const sourcePlate = live[0];
  let plate: ControlLiveLayoutFrameAttachmentSource['plate'];
  if (sourcePlate !== undefined) {
    const { element, rect, toScene, ancestry } = sourcePlate;
    if (
      live.length !== 1 ||
      element.type !== 'video-placeholder' ||
      element.liveMask === undefined ||
      !element.visible ||
      ancestry.some((parent) => !parent.visible) ||
      Math.abs(toScene.b) > 1e-9 ||
      Math.abs(toScene.c) > 1e-9 ||
      toScene.a <= 0 ||
      toScene.d <= 0 ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.x < 0 ||
      rect.y < 0 ||
      rect.x + rect.width > scene.resolution.width + 1e-9 ||
      rect.y + rect.height > scene.resolution.height + 1e-9
    )
      throw new Error('Export one visible, unrotated live plate with an input mask from Designer.');
    plate = { element, rect };
  }
  const layers = copyLayers(scene, new Set());
  const fontEntries = [...assets.values()].filter(({ entry }) => entry.kind === 'font');
  return {
    id,
    name: manifest.name,
    bytes,
    scene: {
      schemaVersion: 1,
      id: namespace,
      name: manifest.name,
      templateType: 'fullscreen',
      resolution: scene.resolution,
      safeAreas: scene.safeAreas,
      frameRate: scene.frameRate,
      frameRange: { in: 0, out: 1 },
      editorBackdrop: 'transparent',
      layers,
      fields: [],
      bindings: [],
      compositions,
      fonts: fontEntries.map(({ entry }) => ({
        family: `asset-${entry.id}`,
        source: 'bundled',
        weights: [400],
        styles: ['normal'],
      })),
      metadata: scene.metadata,
    },
    assets: [...assets.values()],
    ...(plate === undefined ? {} : { plate }),
  };
}
