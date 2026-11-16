import { z } from 'zod';
import { defineChannel } from '../channel.js';

const channel = z.number().int().positive();
const sourceId = z.string().min(1).max(256);
const geometry = z.object({
  activeRect: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    })
    .refine((rect) => rect.x + rect.width <= 1 + 1e-9 && rect.y + rect.height <= 1 + 1e-9),
  sourceAspect: z.number().positive().finite(),
  /** Stable for frames of the same source, producer and decoded geometry. */
  revision: z.string().regex(/^[a-f0-9]{64}$/),
});
const frame = z
  .object({
    sourceId,
    signal: z.enum(['present', 'absent', 'unknown']),
    jpegBase64: z.string().max(174764).optional(),
    width: z.number().int().min(1).max(640).optional(),
    height: z.number().int().min(1).max(640).optional(),
    geometry: geometry.optional(),
  })
  .refine(
    (value) =>
      value.geometry === undefined ||
      (value.jpegBase64 !== undefined && value.width !== undefined && value.height !== undefined),
  );

const frames = z.object({ frames: z.array(frame).max(8) });

export type SourcePreviewFrame = z.infer<typeof frame>;

export const SourcePreviewPvwChannel = defineChannel(
  'sourcePreviews.pvw',
  z.object({ channel, viewId: z.string().uuid(), sourceIds: z.array(sourceId).max(4) }),
  frames,
);

export const SourcePreviewThumbnailsChannel = defineChannel(
  'sourcePreviews.thumbnails',
  z.object({ channel, sourceIds: z.array(sourceId).min(1).max(8) }),
  frames,
);

export const MAX_SOURCE_AUDIO_BATCH = 32;
export const MAX_SOURCE_AUDIO_CHANNELS = 32;

const sourceAudioReading = z.discriminatedUnion('state', [
  z.object({ sourceId, state: z.enum(['unknown', 'has-audio', 'no-audio']) }),
  z.object({
    sourceId,
    state: z.literal('measured'),
    dbFs: z.array(z.number().finite()).min(1).max(MAX_SOURCE_AUDIO_CHANNELS),
    validForMs: z.number().positive().max(300),
  }),
]);
export type SourceAudioReading = z.infer<typeof sourceAudioReading>;

/** Authenticated source meter data and catalogue facts; an absent reading is unknown. */
export const SourceAudioLevelsChannel = defineChannel(
  'sourcePreviews.audioLevels',
  z.object({
    channel,
    sourceIds: z.array(sourceId).min(1).max(MAX_SOURCE_AUDIO_BATCH),
    maxChannels: z.number().int().min(1).max(MAX_SOURCE_AUDIO_CHANNELS).optional(),
  }),
  z.object({ readings: z.array(sourceAudioReading).max(MAX_SOURCE_AUDIO_BATCH) }),
);
