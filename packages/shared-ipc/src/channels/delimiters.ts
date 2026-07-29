import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';

/**
 * R-034 — the split delimiters offered under a from-file list field.
 *
 * THE BRIDGE OWNS THIS LIST, for the reason `TemplateInfo.hasNext` records for
 * itself: a list kept per browser would show the operator who added a delimiter
 * something nobody else can see, and would be lost the moment they cleared site
 * data. The operators of one station share one gallery and one set of source
 * files; they must share one list.
 *
 * It is PERSISTED TO DISK by the bridge, not held in memory like the `settings`
 * channel's values — a list that vanished on a bridge restart would be exactly
 * the defect this replaced (an operator re-entering their own configuration
 * after every restart).
 *
 * The delimiter's `value` is stored AS TYPED, escapes unresolved: `\n` is the
 * two characters backslash-n, and the renderer resolves it at split time. That
 * keeps the wire representation printable and diffable, and keeps one parser —
 * a real newline travelling in JSON would be indistinguishable from a delimiter
 * someone typed as a literal line break.
 */
export const DelimiterOptionSchema = z.object({
  /** Stable id, so relabelling is not a delete-and-add. */
  id: z.string().min(1),
  /** What the picker shows — "new line", never `\n`. */
  label: z.string().min(1),
  /** The delimiter as typed; `\n` / `\t` are resolved by the consumer. */
  value: z.string().min(1),
});
export type DelimiterOption = z.infer<typeof DelimiterOptionSchema>;

/**
 * The whole list, replaced at once.
 *
 * Deliberately NOT add/remove verbs. Two browsers editing the list concurrently
 * would interleave deltas into an order neither operator chose; a whole-list set
 * makes the last writer's intent explicit and complete, and matches how the
 * renderer already holds it. The list is small and edited rarely — there is
 * nothing to gain from deltas and a merge problem to lose.
 */
export const DelimitersListChannel = defineChannel(
  'delimiters.list',
  z.void(),
  z.array(DelimiterOptionSchema),
);

/**
 * Replace the list. The bridge REFUSES an empty one: the picker is the only way
 * a delimiter enters the product, so an empty list is a dead end that leaves a
 * split field with nothing to split on. Refusing here rather than only in the UI
 * means a second browser, a stale client, or a hand-written call cannot create
 * the state the UI is careful not to.
 */
export const DelimitersSetChannel = defineChannel(
  'delimiters.set',
  z.object({ delimiters: z.array(DelimiterOptionSchema) }),
  z.object({
    ok: z.boolean(),
    reason: z.enum(['empty-list', 'duplicate-value']).optional(),
    message: z.string().optional(),
  }),
);

/**
 * Pushed with the FULL list whenever it changes, so every connected browser
 * converges without polling — the `templates.changed` precedent, and what makes
 * a missed frame harmless.
 */
export const DelimitersChangedChannel = definePublishChannel(
  'delimiters.changed',
  z.array(DelimiterOptionSchema),
);
