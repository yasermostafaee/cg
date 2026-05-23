import { z } from 'zod';
import { FieldValuesSchema, IdSchema, StackItemStateSchema } from '@cg/shared-schema';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * Stack channels (Phase 7 §3 / Phase 5 §8). The Reconciler in Main owns
 * the truth; the Renderer subscribes to state changes via
 * `StackStateChangedChannel` and issues intents via the request channels
 * below.
 */

export const StackLoadChannel = defineChannel(
  'stack.load',
  z.object({
    itemId: IdSchema,
    templateId: IdSchema,
    fields: FieldValuesSchema,
  }),
  z.object({ accepted: z.boolean() }),
);

export const StackTakeChannel = defineChannel(
  'stack.take',
  z.object({
    itemId: IdSchema,
    mode: z.enum(['direct', 'pvw-pgm']).optional(),
  }),
  z.object({ accepted: z.boolean(), errorCode: z.string().optional() }),
);

export const StackUpdateChannel = defineChannel(
  'stack.update',
  z.object({
    itemId: IdSchema,
    fields: FieldValuesSchema,
    mergeMode: z.enum(['merge', 'replace']),
  }),
  z.object({ accepted: z.boolean() }),
);

export const StackOutChannel = defineChannel(
  'stack.out',
  z.object({ itemId: IdSchema, immediate: z.boolean().optional() }),
  z.object({ accepted: z.boolean() }),
);

export const StackRemoveChannel = defineChannel(
  'stack.remove',
  z.object({ itemId: IdSchema }),
  z.object({ accepted: z.boolean() }),
);

export const StackSnapshotChannel = defineChannel(
  'stack.snapshot',
  z.void(),
  z.array(StackItemStateSchema),
);

/**
 * Main → Renderer push: emitted after every state mutation. The Renderer
 * keeps its Zustand store in sync via this stream. Sending a full
 * snapshot is simpler than emitting deltas; if profiling shows it's a
 * bottleneck we can swap to per-item deltas.
 */
export const StackStateChangedChannel = definePublishChannel(
  'stack.state-changed',
  z.array(StackItemStateSchema),
);
