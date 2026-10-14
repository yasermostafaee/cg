import { z } from 'zod';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-D` §1 / `-E` — **WHAT A COUNTDOWN DOES AFTER ZERO**, chosen by its
 * author. Designer-owned (ADR 0009 / golden rule 13): it decides when the template's own content
 * ends, which is the contract its author set up. It applies the same whether zero is reached on air
 * or the target was already past at Take.
 *
 * | value          | what shows                                     | ends a content-driven hold    |
 * | -------------- | ---------------------------------------------- | ----------------------------- |
 * | `hold`         | `00:00` stays (the default; absent ⇒ this)      | yes — unchanged               |
 * | `count-past`   | `−00:12` … the time since zero                  | **no** — it is still counting |
 * | `hide-digits`  | the countdown's own text disappears             | yes — unchanged               |
 * | `close`        | the At-zero step, then the graphic's own exit   | yes — that is its purpose     |
 *
 * Its own module so the element schema and the field schema can both name it without importing
 * each other.
 */
export const AFTER_ZERO_MODES = ['hold', 'count-past', 'hide-digits', 'close'] as const;
export const AfterZeroSchema = z.enum(AFTER_ZERO_MODES);
export type AfterZero = z.infer<typeof AfterZeroSchema>;

/** The author's words for each choice, as the Designer offers them. */
export const AFTER_ZERO_LABELS: Readonly<Record<AfterZero, string>> = {
  hold: 'Hold at zero',
  'count-past': 'Count past zero',
  'hide-digits': 'Hide the digits',
  close: 'Close the graphic',
};

/** Absent is `hold` — the behaviour every countdown had before this choice existed. */
export function afterZeroOf(value: AfterZero | undefined): AfterZero {
  return value ?? 'hold';
}

/**
 * Whether a countdown under `afterZero` resolves its completion at zero — what ends a
 * content-driven hold. Only `count-past` does not: the graphic would leave air while still counting.
 */
export function completesAtZero(afterZero: AfterZero | undefined): boolean {
  return afterZeroOf(afterZero) !== 'count-past';
}

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §2 — what CG Control needs to know about a `text` field that drives
 * a countdown's target, so it offers the date and time control and states a passed target in the
 * author's chosen behaviour. DERIVED at import from the template's own `clock-target` binding and
 * the clock it targets — never authored — so it cannot drift from what the page will do.
 */
export const CountdownTargetFieldSchema = z.object({
  /** `datetime` — an ISO instant; `timeofday` — `HH:mm[:ss]`, the next occurrence. */
  target: z.enum(['datetime', 'timeofday']),
  afterZero: AfterZeroSchema,
});
export type CountdownTargetField = z.infer<typeof CountdownTargetFieldSchema>;
