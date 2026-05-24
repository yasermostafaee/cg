import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Auto-update channels (Phase 8 §12 / M9.2).
 *
 * The Runtime gates electron-updater installs so an on-air template is
 * never interrupted by a mid-broadcast quitAndInstall. The renderer's
 * settings UI surfaces the pending update; the actual updater client
 * (M11) calls `update.request` and listens for `update.state-changed`.
 */

const PendingUpdateSchema = z.object({
  version: z.string().min(1),
  notes: z.string().optional(),
  requestedAt: z.string().datetime(),
});

export type PendingUpdate = z.infer<typeof PendingUpdateSchema>;

export const UpdateRequestChannel = defineChannel(
  'update.request',
  z.object({
    version: z.string().min(1),
    notes: z.string().optional(),
  }),
  z.object({
    accepted: z.literal(true),
    deferred: z.boolean(),
    pending: PendingUpdateSchema,
  }),
);

export const UpdateStateChannel = defineChannel(
  'update.state',
  z.void(),
  PendingUpdateSchema.nullable(),
);

export const UpdateCancelChannel = defineChannel(
  'update.cancel',
  z.void(),
  z.object({ ok: z.boolean() }),
);

/** Main → Renderer push: fires whenever the gate's pending state changes. */
export const UpdateStateChangedChannel = definePublishChannel(
  'update.state-changed',
  PendingUpdateSchema.nullable(),
);
