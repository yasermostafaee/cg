import { z } from 'zod';
import { BridgeTextSourcePathSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';

/** R-102 — read one authored live text file from CG Bridge's confined source root. */
export const TextSourcesReadChannel = defineChannel(
  'textSources.read',
  z.object({ path: BridgeTextSourcePathSchema }),
  z.object({
    name: z.string().min(1),
    // Optional on the wire so a newer console can still read from an older 0.12.3 Bridge.
    sourcePath: z.string().min(1).optional(),
    content: z.string(),
  }),
);
