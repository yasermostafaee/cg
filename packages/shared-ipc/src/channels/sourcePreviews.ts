import { z } from 'zod';
import { defineChannel } from '../channel.js';

const channel = z.number().int().positive();
const sourceId = z.string().min(1).max(256);
const frame = z.object({
  sourceId,
  signal: z.enum(['present', 'absent', 'unknown']),
  jpegBase64: z.string().max(174764).optional(),
  width: z.number().int().min(1).max(640).optional(),
  height: z.number().int().min(1).max(640).optional(),
});

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
