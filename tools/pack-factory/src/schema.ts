import * as path from 'node:path';
import { z } from 'zod';

const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase letters, digits and single hyphens');
const HexSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i, 'expected #RRGGBB or #RRGGBBAA');
const DeclaredPathSchema = z.string().trim().min(1);

const BrandColorSchema = z.discriminatedUnion('source', [
  z.object({ value: HexSchema, source: z.literal('brand') }).strict(),
  z
    .object({
      value: HexSchema,
      source: z.literal('derived'),
      derivedFrom: SlugSchema,
      note: z.string().trim().min(1),
    })
    .strict(),
]);

const BrandFontSchema = z
  .object({
    path: DeclaredPathSchema,
    family: z.string().trim().min(1),
    weight: z.number().int().min(1).max(1000),
    style: z.enum(['normal', 'italic']).default('normal'),
    licenseConfirmed: z.literal(true, {
      errorMap: () => ({ message: 'font embedding rights must be explicitly confirmed' }),
    }),
    licenseNote: z.string().trim().min(1),
  })
  .strict();

const BrandAssetSchema = z
  .object({
    kind: z.enum(['image', 'lottie', 'video', 'audio']),
    sourcePath: DeclaredPathSchema,
    renderPath: DeclaredPathSchema.optional(),
    note: z.string().trim().min(1).optional(),
  })
  .strict();

export const BrandKitSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: SlugSchema,
    name: z.string().trim().min(1),
    author: z.string().trim().min(1).optional(),
    motion: z.enum(['calm', 'news', 'energetic']),
    targets: z
      .array(
        z
          .object({
            key: SlugSchema,
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1),
    colors: z.record(SlugSchema, BrandColorSchema),
    fonts: z.record(SlugSchema, BrandFontSchema),
    assets: z.record(SlugSchema, BrandAssetSchema),
    brandbookNotes: z.array(z.string().trim().min(1)).default([]),
    references: z.array(DeclaredPathSchema).default([]),
  })
  .strict()
  .superRefine((kit, context) => {
    if (Object.keys(kit.colors).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['colors'],
        message: 'at least one semantic colour is required',
      });
    }
    if (Object.keys(kit.fonts).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fonts'],
        message: 'at least one licensed font face is required',
      });
    }
    const targetKeys = new Set<string>();
    for (const [index, target] of kit.targets.entries()) {
      if (targetKeys.has(target.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['targets', index, 'key'],
          message: `duplicate target key: ${target.key}`,
        });
      }
      targetKeys.add(target.key);
    }

    for (const [key, color] of Object.entries(kit.colors)) {
      if (color.source !== 'derived') continue;
      if (color.derivedFrom === key || kit.colors[color.derivedFrom] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['colors', key, 'derivedFrom'],
          message: 'must name another declared colour role',
        });
      }
    }

    const logo = kit.assets['logo'];
    if (logo === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assets', 'logo'],
        message: 'a logo role with vector source is required',
      });
      return;
    }
    if (logo.kind !== 'image') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assets', 'logo', 'kind'],
        message: 'logo must be an image asset',
      });
    }
    const sourceExtension = path.extname(logo.sourcePath).toLowerCase();
    if (!['.svg', '.ai', '.eps'].includes(sourceExtension)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assets', 'logo', 'sourcePath'],
        message: 'production logo source must be SVG, AI or EPS',
      });
    }
    const renderExtension = path.extname(logo.renderPath ?? logo.sourcePath).toLowerCase();
    if (!['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(renderExtension)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assets', 'logo', 'renderPath'],
        message: 'AI/EPS logo sources also need an SVG or raster browser render file',
      });
    }
  });

const TemplateRecipeSchema = z
  .object({
    key: SlugSchema,
    sourceProject: DeclaredPathSchema,
    compositionId: z.string().trim().min(1).optional(),
    target: SlugSchema,
    displayName: z.string().trim().min(1),
    outputName: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) =>
          value.toLowerCase().endsWith('.vcg') &&
          path.basename(value) === value &&
          !value.includes('/') &&
          !value.includes('\\'),
        'must be one filename ending in .vcg',
      )
      .optional(),
    colors: z.record(HexSchema, SlugSchema).default({}),
    assets: z.record(z.string().min(1), SlugSchema).default({}),
    fonts: z.record(z.string().min(1), SlugSchema).default({}),
    preview: z
      .object({
        data: z.record(z.unknown()).default({}),
        introMs: z.number().int().min(0).max(10_000).default(100),
        holdMs: z.number().int().min(0).max(30_000).default(900),
        outMs: z.number().int().min(0).max(10_000).default(120),
      })
      .strict()
      .default({ data: {}, introMs: 100, holdMs: 900, outMs: 120 }),
  })
  .strict();

export const PackRecipeSchema = z
  .object({
    schemaVersion: z.literal(1),
    family: z.string().trim().min(1),
    templates: z.array(TemplateRecipeSchema).min(1),
  })
  .strict()
  .superRefine((recipe, context) => {
    const keys = new Set<string>();
    const outputs = new Set<string>();
    for (const [index, template] of recipe.templates.entries()) {
      const output = (template.outputName ?? `${template.key}.vcg`).toLowerCase();
      if (keys.has(template.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['templates', index, 'key'],
          message: `duplicate template key: ${template.key}`,
        });
      }
      if (outputs.has(output)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['templates', index, 'outputName'],
          message: `duplicate output filename: ${output}`,
        });
      }
      keys.add(template.key);
      outputs.add(output);
    }
  });

export type BrandKit = z.infer<typeof BrandKitSchema>;
export type PackRecipe = z.infer<typeof PackRecipeSchema>;
export type TemplateRecipe = z.infer<typeof TemplateRecipeSchema>;
export type BrandAsset = z.infer<typeof BrandAssetSchema>;
export type BrandFont = z.infer<typeof BrandFontSchema>;
