import { z } from 'zod';

/**
 * Push events from CasparCG. Address shapes are best-known per Phase 5 §4.1
 * but **subject to revision after Spike B** — the M1 spike may surface
 * differences vs the real 2.3.x emission.
 */
export const OscEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('osc.layer.foreground'),
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
    producer: z.string().optional(),
    file: z.string().optional(),
  }),
  z.object({
    kind: z.literal('osc.layer.background'),
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
    producer: z.string().optional(),
  }),
  z.object({
    kind: z.literal('osc.layer.empty'),
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('osc.cg.invoked'),
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
    method: z.string(),
  }),
  z.object({
    kind: z.literal('osc.cg.stopped'),
    channel: z.number().int().positive(),
    layer: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('osc.frame'),
    channel: z.number().int().positive(),
    frame: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('osc.health'),
    server: z.enum(['primary', 'backup']),
    healthy: z.boolean(),
    uptimeSec: z.number().nonnegative(),
  }),
]);
export type OscEvent = z.infer<typeof OscEventSchema>;
