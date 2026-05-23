import { z } from 'zod';
import { defineChannel } from '../channel.js';

/**
 * Channels shared by both apps. The starter set is intentionally tiny — each
 * app adds its own area-specific channels (apps/designer, apps/runtime) and
 * passes them through `invoke`/`handle`.
 */

/**
 * Basic app metadata. Already wired in M0 as the smoke-test of the
 * contextBridge boundary in both apps.
 */
export const AppInfoChannel = defineChannel(
  'app.info',
  z.void(),
  z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    platform: z.string().min(1),
  }),
);
export type AppInfoResponse = z.infer<typeof AppInfoChannel.response>;
