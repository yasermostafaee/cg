import { z } from 'zod';
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
