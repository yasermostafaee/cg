import { z } from 'zod';
import { BridgeTextSourcePathSchema, SceneSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';

/**
 * The station-wide folder CG Bridge resolves portable shared-file names below.
 *
 * `textSourceRoot` remains the persisted compatibility key, but the operator-facing contract is
 * deliberately broader: future shared assets may use the same station boundary without renaming
 * the setup surface again. The path is interpreted on the CG Bridge server, never on the console.
 */
export const SharedFilesStateSchema = z.object({ path: z.string().min(1) });
export type SharedFilesState = z.infer<typeof SharedFilesStateSchema>;

export const SharedFilesGetChannel = defineChannel(
  'sharedFiles.get',
  z.void(),
  SharedFilesStateSchema,
);

export const SharedFilesSetChannel = defineChannel(
  'sharedFiles.set',
  z.object({ path: z.string().trim().min(1).max(1024) }),
  z.object({
    ok: z.boolean(),
    path: z.string().min(1).optional(),
    message: z.string().optional(),
  }),
);

const SharedTemplateFolderPath = z.union([z.literal(''), BridgeTextSourcePathSchema]);
const SharedTemplateName = z.string().regex(/^[^/\\]+\.vcg$/i);
export const SHARED_TEMPLATE_THUMBNAIL_MAX_BYTES = 256 * 1024;
export const SHARED_TEMPLATE_IMAGES_MAX_BYTES = 128 * 1024;
export const SHARED_TEMPLATE_MAX_PREVIEW_IMAGES = 4;
const base64MaxLength = (bytes: number): number => 4 * Math.ceil(bytes / 3);
const PngBase64Schema = z.string().min(1).max(base64MaxLength(SHARED_TEMPLATE_THUMBNAIL_MAX_BYTES));
const PreviewImagesSchema = z
  .record(z.string(), z.string().min(1).max(base64MaxLength(SHARED_TEMPLATE_IMAGES_MAX_BYTES)))
  .refine((images) => {
    const values = Object.values(images);
    return (
      values.length <= SHARED_TEMPLATE_MAX_PREVIEW_IMAGES &&
      values.reduce((bytes, value) => bytes + value.length, 0) <=
        base64MaxLength(SHARED_TEMPLATE_IMAGES_MAX_BYTES) +
          4 * (SHARED_TEMPLATE_MAX_PREVIEW_IMAGES - 1)
    );
  });

const SharedTemplateThumbnailSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('image'), mime: z.literal('image/png'), base64: PngBase64Schema }),
  z.object({
    kind: z.literal('scene'),
    scene: SceneSchema,
    images: PreviewImagesSchema.optional(),
  }),
]);
export type SharedTemplateThumbnail = z.infer<typeof SharedTemplateThumbnailSchema>;

export const SharedTemplateFolderChannel = defineChannel(
  'sharedFiles.template-folder',
  z.object({ folder: SharedTemplateFolderPath }),
  z.object({
    root: z.string(),
    folder: z.string(),
    entries: z.array(z.object({ name: z.string(), kind: z.enum(['folder', 'package']) })),
    thumbnails: z.literal(true).optional(),
  }),
);

export const SharedTemplateReadChannel = defineChannel(
  'sharedFiles.template-read',
  z.object({
    folder: SharedTemplateFolderPath,
    name: SharedTemplateName,
    expectedRoot: z.string().min(1).optional(),
  }),
  z.object({ name: SharedTemplateName, base64: z.string(), root: z.string().min(1).optional() }),
);

export const SharedTemplateThumbnailChannel = defineChannel(
  'sharedFiles.template-thumbnail',
  z.object({
    folder: SharedTemplateFolderPath,
    name: SharedTemplateName,
    expectedRoot: z.string().min(1).optional(),
  }),
  z.object({ thumbnail: SharedTemplateThumbnailSchema.nullable() }),
);
