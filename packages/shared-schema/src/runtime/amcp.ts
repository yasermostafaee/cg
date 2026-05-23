import { z } from 'zod';

/** AMCP response codes mapped to typed acks (see Phase 5 §3.3). */
export const AmcpAckSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('amcp.ok'),
    seq: z.number().int().nonnegative(),
    code: z.union([z.literal(200), z.literal(201), z.literal(202)]),
    raw: z.string(),
    ms: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('amcp.err'),
    seq: z.number().int().nonnegative(),
    code: z.number().int(),
    raw: z.string(),
    ms: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('amcp.timeout'),
    seq: z.number().int().nonnegative(),
  }),
]);
export type AmcpAck = z.infer<typeof AmcpAckSchema>;
