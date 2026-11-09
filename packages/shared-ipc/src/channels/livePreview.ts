import { z } from 'zod';
import { defineChannel } from '../channel.js';
import {
  isPlaylistOutput,
  sourceLoopsOn,
  sourceSeatable,
  sourceShowableOn,
} from '../playout-sources.js';
import type { SourceDefinition } from './sources.js';

const channel = z.number().int().positive();
const previewId = z.string().uuid();
const handle = z.object({ channel, previewId });
const stream = z.enum(['picture', 'audio']);

export const LivePreviewStatusSchema = handle.extend({
  sourceName: z.string().max(256),
  state: z.enum([
    'connecting',
    'ready',
    'stalled',
    'unavailable',
    'conflict',
    'replaced',
    'expired',
    'forbidden',
  ]),
  message: z.string().max(512).optional(),
  dbFs: z.array(z.number().finite()).max(16).nullable(),
  meterValidForMs: z.number().finite().min(0).max(300).optional(),
});
export type LivePreviewStatus = z.infer<typeof LivePreviewStatusSchema>;
export type LivePreviewHandle = z.infer<typeof handle>;
export type LivePreviewStream = z.infer<typeof stream>;

export const LivePreviewStartChannel = defineChannel(
  'livePreview.start',
  handle.extend({ sourceId: z.string().min(1).max(256) }),
  LivePreviewStatusSchema,
);
export const LivePreviewStatusChannel = defineChannel(
  'livePreview.status',
  handle,
  LivePreviewStatusSchema,
);
export const LivePreviewStopChannel = defineChannel(
  'livePreview.stop',
  handle,
  z.object({ ok: z.boolean() }),
);
export const LivePreviewTicketChannel = defineChannel(
  'livePreview.ticket',
  handle.extend({ stream }),
  z.object({
    path: z
      .string()
      .regex(/^\/input-preview\/[\w-]+\/(picture|audio)\?ticket=[\w-]+$/)
      .nullable(),
  }),
);

export const LIVE_PREVIEW_HTTP_PREFIX = '/input-preview/';
export const LIVE_PREVIEW_MAX_JPEG_BYTES = 4 * 1024 * 1024;

export function canCheckLiveInput(source: SourceDefinition, channel: number): boolean {
  return (
    source.origin === 'input' &&
    !isPlaylistOutput(source) &&
    source.departed !== true &&
    sourceSeatable(source) &&
    sourceShowableOn(source, channel) &&
    !sourceLoopsOn(source, channel)
  );
}
