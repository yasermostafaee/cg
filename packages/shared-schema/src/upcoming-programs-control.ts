import { z } from 'zod';
import { directCompositionRefs } from './composition-fields.js';
import {
  UpcomingProgramsItemsSchema,
  UpcomingProgramsElementSchema,
  upcomingProgramsPreparedItems,
  type Element,
} from './elements.js';
import type { AssetEntry } from './manifest.js';
import { IdSchema } from './primitives.js';
import type { Scene } from './scene.js';
import { upcomingProgramsCardStyleOf } from './upcoming-programs.js';

export const CG_UPCOMING_PROGRAMS_PAGE_MARKER = '<meta name="cg-upcoming-programs" content="1">';
export const UPCOMING_PROGRAM_MEDIA_PATH_PREFIX = '/upcoming-media/';
export const UPCOMING_PROGRAM_MEDIA_PATH_RE = /^\/upcoming-media\/[0-9a-f]{64}$/;
const UPLOADED_ASSET_PREFIX = 'upcoming-media:';
const SHA256_RE = /^[0-9a-f]{64}$/;

export function upcomingProgramMediaAssetId(sha256: string): string {
  return `${UPLOADED_ASSET_PREFIX}${sha256}`;
}

export function upcomingProgramMediaHash(assetId: string): string | undefined {
  if (!assetId.startsWith(UPLOADED_ASSET_PREFIX)) return undefined;
  const sha256 = assetId.slice(UPLOADED_ASSET_PREFIX.length);
  return SHA256_RE.test(sha256) ? sha256 : undefined;
}

export function upcomingProgramMediaPath(sha256: string): string {
  return `${UPCOMING_PROGRAM_MEDIA_PATH_PREFIX}${sha256}`;
}

/** One row's complete Manual selection. A missing element key uses that element's Prepared list. */
export const UpcomingProgramsOverridesSchema = z.record(IdSchema, UpcomingProgramsItemsSchema);
export type UpcomingProgramsOverrides = z.infer<typeof UpcomingProgramsOverridesSchema>;

export function upcomingProgramsMediaHashes(overrides?: UpcomingProgramsOverrides): string[] {
  const hashes = new Set<string>();
  for (const items of Object.values(overrides ?? {})) {
    for (const { mediaAssetId, posterAssetId } of items) {
      for (const assetId of [mediaAssetId, posterAssetId]) {
        if (assetId === undefined) continue;
        const hash = upcomingProgramMediaHash(assetId);
        if (hash !== undefined) hashes.add(hash);
      }
    }
  }
  return [...hashes];
}

const UpcomingProgramsTemplateElementSchema = z.object({
  id: IdSchema,
  name: z.string(),
  layout: UpcomingProgramsElementSchema.shape.layout.removeDefault(),
  mediaVisible: z.boolean(),
  preparedItems: UpcomingProgramsItemsSchema,
});

export const UpcomingProgramsTemplateMetadataSchema = z.object({
  elements: z.array(UpcomingProgramsTemplateElementSchema),
  assets: z.array(z.object({ id: IdSchema, kind: z.enum(['image', 'video']), name: z.string() })),
});
export type UpcomingProgramsTemplateMetadata = z.infer<
  typeof UpcomingProgramsTemplateMetadataSchema
>;

/** A row can use only the approved assets of its listed template or the Bridge's checked uploads. */
export function upcomingProgramsOverrideIssue(
  metadata: UpcomingProgramsTemplateMetadata,
  overrides: UpcomingProgramsOverrides,
  uploaded: ReadonlyMap<string, 'image' | 'video'>,
): 'upcoming-programs-invalid' | 'upcoming-program-media-unavailable' | undefined {
  const knownElements = new Set(metadata.elements.map((element) => element.id));
  const packaged = new Map(metadata.assets.map((asset) => [asset.id, asset.kind]));
  const matches = (id: string, kind: 'image' | 'video'): boolean => {
    const hash = upcomingProgramMediaHash(id);
    return (hash === undefined ? packaged.get(id) : uploaded.get(hash)) === kind;
  };
  for (const [id, items] of Object.entries(overrides)) {
    if (!knownElements.has(id)) return 'upcoming-programs-invalid';
    for (const { mediaAssetId, mediaKind, posterAssetId, audioAssetId } of items) {
      // A hidden aperture may retain its approved assets when the operator edits only the text.
      if (
        audioAssetId !== undefined ||
        (mediaAssetId === undefined) !== (mediaKind === undefined) ||
        (posterAssetId !== undefined && mediaKind !== 'video')
      ) {
        return 'upcoming-programs-invalid';
      }
      if (
        (mediaAssetId !== undefined &&
          mediaKind !== undefined &&
          !matches(mediaAssetId, mediaKind)) ||
        (posterAssetId !== undefined && !matches(posterAssetId, 'image'))
      ) {
        return 'upcoming-program-media-unavailable';
      }
    }
  }
  return undefined;
}

/** Only reachable authored elements, explicitly Prepared content and packaged asset descriptors. */
export function upcomingProgramsTemplateMetadataOf(
  scene: Pick<Scene, 'layers' | 'compositions'>,
  assetIndex: readonly AssetEntry[] = [],
): UpcomingProgramsTemplateMetadata | undefined {
  if (!Array.isArray(scene.layers)) return undefined;
  const elements: UpcomingProgramsTemplateMetadata['elements'] = [];
  const visited = new Set<string>();
  const elementIds = new Set<string>();
  const comps = new Map((scene.compositions ?? []).map((comp) => [comp.id, comp]));
  const walk = (children: readonly Element[]): void => {
    for (const element of children) {
      if (element.type === 'container') walk(element.children);
      if (element.type !== 'upcomingPrograms' || !element.visible || elementIds.has(element.id)) {
        continue;
      }
      elementIds.add(element.id);
      elements.push({
        id: element.id,
        name: element.name,
        layout: element.layout,
        mediaVisible: upcomingProgramsCardStyleOf(element).media.visible,
        preparedItems: upcomingProgramsPreparedItems(element).map(
          ({ audioAssetId: _rehearsalAudio, ...item }) => item,
        ),
      });
    }
  };
  const visit = (doc: Pick<Scene, 'layers'>): void => {
    for (const layer of doc.layers) walk(layer.children);
    for (const id of directCompositionRefs(doc)) {
      const comp = comps.get(id);
      if (comp === undefined || visited.has(id)) continue;
      visited.add(id);
      visit(comp);
    }
  };
  visit(scene);
  if (elements.length === 0) return undefined;

  const assets: UpcomingProgramsTemplateMetadata['assets'] = [];
  for (const asset of assetIndex) {
    if (asset.kind !== 'image' && asset.kind !== 'video') continue;
    assets.push({ id: asset.id, kind: asset.kind, name: asset.filename ?? asset.path });
  }
  return { elements, assets };
}
