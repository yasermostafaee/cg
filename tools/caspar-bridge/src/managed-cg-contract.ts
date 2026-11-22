import { z } from 'zod';

// The Playout .22 Swagger publishes request models, but leaves the v2 response
// models unspecified. The response fields below also follow the captured Engine
// exchanges and the v2 contract supplied with Playout externalcg.16.
const text = z.string().min(1);
const integer = z.number().int().safe();
const revision = integer.nonnegative();
const nativeChannel = integer.min(1).max(128);
const layer = integer.min(0).max(255);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const timestamp = z.string().datetime({ offset: true });
const id = z.string().regex(/^[a-z0-9_.-]{1,128}$/i);
const finite = z.number().finite();

export type ManagedJson =
  | string
  | number
  | boolean
  | null
  | ManagedJson[]
  | { [key: string]: ManagedJson };
const jsonValue: z.ZodType<ManagedJson> = z.lazy(() =>
  z.union([z.string(), finite, z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]),
);

const httpUrl = z
  .string()
  .url()
  .refine((value) => {
    // z.string().url() has already validated the URL when this check runs.
    const url = URL.parse(value);
    return (
      url !== null &&
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === ''
    );
  }, 'Expected an HTTP or HTTPS URL without credentials');

const engineOrigin = httpUrl.refine((value) => {
  const url = URL.parse(value);
  return url !== null && url.pathname === '/' && url.search === '' && url.hash === '';
}, 'Expected an Engine API origin');

const layerKind = z.enum(['html', 'live', 'media']);

export const managedMemberSchema = z.object({
  engineId: id,
  apiOrigin: engineOrigin,
  channelCode: id,
  nativeChannel,
  programmeLayer: layer,
  priority: integer,
  protectedLayers: z.array(layer),
});

const allowedLayerRange = z
  .object({ first: layer, last: layer, kind: layerKind })
  .refine(({ first, last }) => first <= last, 'Invalid allowed layer range');

// The owner supplies the entire fence. Preserve any additional members exactly
// so the caller can send it unchanged, including after a journal recovery.
export const managedFenceSchema = z
  .object({
    groupId: id,
    membershipRevision: revision,
    membershipHash: sha256,
    term: revision,
    transferId: z.string().uuid(),
    ownerEngineId: id,
    localEpoch: revision,
    coreGeneration: text,
    leaseId: z.string().uuid(),
  })
  .passthrough()
  .catchall(jsonValue);

const replica = z.object({
  engineId: id,
  channelCode: id,
  nativeChannel,
  coreGeneration: text.nullable(),
  // A negative revision explicitly means the member's native effect is unknown.
  preparedRevision: integer,
  appliedRevision: integer,
  renderConfirmation: text,
  error: z.string().nullable(),
});

export const managedOwnerSchema = z.object({
  groupId: id,
  membershipRevision: revision,
  membershipHash: sha256,
  status: z.enum(['active', 'unconfirmed']),
  owner: managedMemberSchema.nullable(),
  fence: managedFenceSchema.nullable(),
  leaseExpiresAt: timestamp.nullable(),
  canSendCommands: z.boolean(),
  revision,
  members: z.array(managedMemberSchema).min(1),
  allowedLayers: z.array(allowedLayerRange),
  replicas: z.array(replica),
  reason: z.string().nullable(),
});

export const managedTargetSchema = z
  .object({ engineId: id, channelCode: id, nativeChannel, layer })
  .strict();

export const managedResultSchema = z.object({
  commandId: z.string().uuid(),
  requestHash: sha256,
  status: z.enum(['prepared', 'unresolved', 'applied', 'rolledBack']),
  admitted: z.boolean(),
  nativeStatus: text,
  renderStatus: text,
  revision,
  target: managedTargetSchema,
  fence: managedFenceSchema,
  replicas: z.array(replica),
  error: z.string().nullable(),
  updatedAt: timestamp,
  atomicLayout: z.boolean().optional(),
  retainedState: z
    .object({ revision, requestHash: z.union([sha256, z.literal('')]) })
    .passthrough()
    .refine(({ revision, requestHash }) => revision === 0 || requestHash !== '', {
      message: 'A retained nonzero revision requires a request hash',
    })
    .nullish(),
});

const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });

const assetPath = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (path) =>
      !/[\\:"%*<>?|]/.test(path) &&
      !hasControlCharacter(path) &&
      path
        .split('/')
        .every(
          (segment) =>
            segment !== '' &&
            !segment.endsWith('.') &&
            !segment.endsWith(' ') &&
            !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(segment),
        ),
    'Expected a relative bundle asset path',
  );

const asset = z
  .object({
    path: assetPath,
    uri: httpUrl,
    sha256,
    contentType: z
      .string()
      .min(1)
      .max(99)
      .refine((value) => !hasControlCharacter(value)),
  })
  .strict();

export const managedTemplateSchema = z
  .object({
    entryPath: assetPath,
    version: id,
    assets: z.array(asset).min(1).max(64),
    resumeWithoutReplay: z.boolean(),
  })
  .strict()
  .superRefine(({ entryPath, assets }, ctx) => {
    if (!assets.some((asset) => asset.path === entryPath && asset.contentType === 'text/html'))
      ctx.addIssue({ code: 'custom', path: ['entryPath'], message: 'Bundle lacks its HTML entry' });
    if (new Set(assets.map(({ path }) => path.toLowerCase())).size !== assets.length)
      ctx.addIssue({ code: 'custom', path: ['assets'], message: 'Duplicate bundle asset path' });
  });

export const managedPreparedTemplateSchema = z.object({
  engineId: id,
  available: z.boolean(),
  bundleHash: sha256,
  version: id,
});

const rect = z
  .object({
    x: finite.min(-4).max(4),
    y: finite.min(-4).max(4),
    width: finite.positive().max(4),
    height: finite.positive().max(4),
  })
  .strict();

const cropRect = rect.refine(
  ({ x, y, width, height }) =>
    x >= 0 && y >= 0 && x + width <= 1.0000001 && y + height <= 1.0000001,
  'Crop or mask must fit the normalized raster',
);

const transform = z.object({ fill: rect, crop: cropRect, mask: cropRect.nullish() }).strict();

const audio = z
  .object({
    muted: z.boolean(),
    gain: finite.min(0).max(4),
    channels: z.array(integer.min(0).max(63)).min(1).max(16),
  })
  .strict();

const sharedLayerFields = {
  layer,
  graphicInstanceId: id,
  data: z.record(jsonValue).optional(),
  page: integer.min(0).max(1_000_000).optional(),
  visibility: z.enum(['shown', 'stopped']).optional(),
  transform: transform.optional(),
  animationOrigin: timestamp.nullish(),
};

export const managedLayoutLayerSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...sharedLayerFields,
      kind: z.literal('html'),
      template: managedTemplateSchema,
      live: z.null().optional(),
      media: z.null().optional(),
    })
    .strict(),
  z
    .object({
      ...sharedLayerFields,
      kind: z.literal('live'),
      template: z.null().optional(),
      live: z.object({ logicalInputId: id, audio }).strict(),
      media: z.null().optional(),
    })
    .strict(),
  z
    .object({
      ...sharedLayerFields,
      kind: z.literal('media'),
      template: z.null().optional(),
      live: z.null().optional(),
      media: z
        .object({
          fingerprint: sha256,
          startFrame: revision.max(100_000_000),
          lengthFrames: integer.min(1).max(100_000_000),
          framesPerSecond: finite.min(1).max(240),
          loop: z.boolean(),
          audio,
        })
        .strict(),
    })
    .strict(),
]);

export const managedLayoutCommandSchema = z
  .object({
    commandId: z.string().uuid(),
    target: managedTargetSchema,
    expectedFence: managedFenceSchema,
    expectedRevision: revision,
    operation: z.literal('layout'),
    layout: z.array(managedLayoutLayerSchema).max(64),
  })
  .strict()
  .superRefine((command, ctx) => {
    const { target, expectedFence, layout } = command;
    if (target.engineId !== expectedFence.ownerEngineId)
      ctx.addIssue({
        code: 'custom',
        path: ['target', 'engineId'],
        message: 'Layout target must match the fenced owner',
      });
    if (new Set(layout.map(({ layer }) => layer)).size !== layout.length)
      ctx.addIssue({ code: 'custom', path: ['layout'], message: 'Duplicate layout layer' });
    if (Buffer.byteLength(JSON.stringify(command)) > 262_144)
      ctx.addIssue({ code: 'custom', message: 'Layout command exceeds the Engine limit' });
  });

export type ManagedOwner = z.infer<typeof managedOwnerSchema>;
export type ManagedResult = z.infer<typeof managedResultSchema>;
export type ManagedLayoutLayer = z.infer<typeof managedLayoutLayerSchema>;
export type ManagedLayoutCommand = z.infer<typeof managedLayoutCommandSchema>;
export type ManagedTemplate = z.infer<typeof managedTemplateSchema>;
export type ManagedFence = z.infer<typeof managedFenceSchema>;
export type ManagedTarget = z.infer<typeof managedTargetSchema>;
export type ManagedMember = z.infer<typeof managedMemberSchema>;
