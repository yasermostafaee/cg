import { quote, type LayerSlot } from '@cg/caspar-client';

/**
 * AMCP command-line builders for the operator intents the StackService
 * issues. Caller is `StackService`; outputs go to the RedundancyAdapter.
 *
 * **All user-supplied strings flow through `quote()` from @cg/caspar-client.**
 * Persian and other UTF-8 content survives the wire intact (verified in M1.D).
 *
 * Update mechanism note (ADR 0006): `CG INVOKE update` is sent here
 * because it returns 202 and is the closest documented match, but
 * Spike D showed the JSON payload doesn't reach `window.update` in
 * CasparCG 2.3.2. The Reconciler still tracks the intent as 'updating'
 * → 'playing' once the ack arrives. A future ADR pins down the correct
 * sequence (likely CG ADD with field-replacement) — for now, this is
 * the best-known wire form.
 */

export interface BuiltCommand {
  /** AMCP line ready for `adapter.send()` (post-quote). */
  line: string;
  /** Hint to the queue: 'urgent' for air-safety, 'normal' otherwise. */
  priority: 'urgent' | 'normal' | 'low';
  /** Suggested per-command timeout in ms (Phase 5 §5.4). */
  timeoutMs: number;
  /** Retry budget. */
  retries: number;
}

/** `PLAY <ch>-<layer> "<url>" HTML` — bring up the template at the slot. */
export function buildPlay(slot: LayerSlot, templateUrl: string): BuiltCommand {
  const target = `${String(slot.channel)}-${String(slot.layer)}`;
  return {
    line: `PLAY ${target} ${quote(templateUrl)} HTML`,
    priority: 'normal',
    timeoutMs: 5000,
    retries: 1,
  };
}

/**
 * `CG <ch>-<layer> INVOKE 1 "update" "<json>"` — push a field update.
 *
 * Known-broken per ADR 0006 (the JSON arg doesn't reach the page in
 * 2.3.2). Returns a valid ack though, so the Reconciler can still see
 * the intent acked. Replace with the correct sequence when found.
 */
export function buildUpdate(slot: LayerSlot, fieldsJson: string): BuiltCommand {
  const target = `${String(slot.channel)}-${String(slot.layer)}`;
  return {
    line: `CG ${target} INVOKE 1 ${quote('update')} ${quote(fieldsJson)}`,
    priority: 'normal',
    timeoutMs: 2000,
    retries: 1,
  };
}

/** `CG <ch>-<layer> STOP 1` — trigger the exit animation. */
export function buildStop(slot: LayerSlot): BuiltCommand {
  const target = `${String(slot.channel)}-${String(slot.layer)}`;
  return {
    line: `CG ${target} STOP 1`,
    priority: 'urgent',
    timeoutMs: 2000,
    retries: 3,
  };
}

/** `CLEAR <ch>-<layer>` — air-safety; force the layer empty. */
export function buildClear(slot: LayerSlot): BuiltCommand {
  const target = `${String(slot.channel)}-${String(slot.layer)}`;
  return {
    line: `CLEAR ${target}`,
    priority: 'urgent',
    timeoutMs: 2000,
    retries: 3,
  };
}
