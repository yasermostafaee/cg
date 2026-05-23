import { z } from 'zod';
import { FrameRateSchema, IdSchema, ISODateSchema, ResolutionSchema } from './primitives.js';
import { TemplateTypeSchema, FontReferenceSchema } from './scene.js';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i, 'Expected sha256 hex');

const AssetEntrySchema = z.object({
  id: IdSchema,
  path: z.string().min(1),
  kind: z.enum(['image', 'lottie', 'font', 'video', 'audio']),
  bytes: z.number().int().nonnegative(),
  sha256: Sha256Schema,
  mime: z.string().min(1),
});
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

const IntegrityFileSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  bytes: z.number().int().nonnegative(),
});

const SigningSchema = z.object({
  algorithm: z.literal('ed25519'),
  publicKeyId: z.string().min(1),
  signature: z.string().min(1),
});

const AuthoringSchema = z.object({
  designerVersion: z.string().min(1),
  createdAt: ISODateSchema,
  exportedAt: ISODateSchema,
  author: z.string().optional(),
});

const CompatibilitySchema = z.object({
  minRuntimeVersion: z.string().min(1),
  minCasparCGVersion: z.string().min(1),
  cefMin: z.string().optional(),
});

const FieldIndexEntrySchema = z.object({
  id: z.string().min(1),
  type: z.enum(['text', 'multiline', 'image', 'color', 'boolean', 'number', 'select']),
  required: z.boolean(),
});

/**
 * `.vcg` Manifest. Index-of-record for the zip's contents. Lighter than
 * `template.json` (which carries the full scene); the runtime reads
 * manifest first to decide whether to open the rest.
 */
export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  format: z.literal('vcg'),
  formatVersion: z.literal('1.0'),

  id: IdSchema,
  name: z.string(),
  templateType: TemplateTypeSchema,
  resolution: ResolutionSchema,
  frameRate: FrameRateSchema,

  fields: z.array(FieldIndexEntrySchema),
  fontDeps: z.array(FontReferenceSchema),
  assetIndex: z.array(AssetEntrySchema),

  integrity: z.object({
    files: z.array(IntegrityFileSchema),
    root: Sha256Schema,
  }),

  signing: SigningSchema.optional(),
  authoring: AuthoringSchema,
  compatibility: CompatibilitySchema,
});
export type Manifest = z.infer<typeof ManifestSchema>;

export { AssetEntrySchema };
