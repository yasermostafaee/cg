import { ledgerChannels, type LiveLayerState } from '@cg/shared-ipc';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';

/**
 * What PANIC actually did, as the BRIDGE reports it.
 *
 * ⚠ The shape is the bridge's, carried through unchanged. `silenced` (reached the wire) and
 * `recorded` (intent written, including HELD plates that were already silent) are different
 * numbers on purpose — see the channel's own note.
 */
export interface PanicReport {
  ok: boolean;
  silenced: number;
  recorded: number;
  rows: readonly { itemId: string; plates: number }[];
  failed: readonly { itemId: string; plateId: string; reason: string }[];
}

/**
 * 🔴 `MULTI-CHANNEL-01` §2 C — **WHICH PANIC WAS PRESSED**, so its sentence says where it reached.
 *
 * - `station` — the ONE PANIC of a station that declares one channel. It is the every-channel
 *   verb (`silenceAllLivePlates`, A16), and its sentences are exactly what they always were.
 * - `channel` — the PANIC on a channel's view, once two or more are declared: that channel only.
 * - `every` — the separate every-channel control beside the channel strip.
 */
export type PanicScope =
  | { kind: 'station' }
  | { kind: 'channel'; channel: number }
  | { kind: 'every' };

/** The clause that names the scope, appended to the sentence; empty for the one-channel PANIC. */
function scopeClause(scope: PanicScope): string {
  switch (scope.kind) {
    case 'station':
      return '';
    case 'channel':
      return ` · CH ${String(scope.channel)}`;
    case 'every':
      return ' · every channel';
  }
}

/** Where the bridge found nothing to silence, in the scope's own words. */
function nothingWhere(scope: PanicScope): string {
  switch (scope.kind) {
    case 'station':
      return 'the bridge holds no live plates';
    case 'channel':
      return `channel ${String(scope.channel)} holds no live plates`;
    case 'every':
      return 'no channel holds a live plate';
  }
}

/**
 * Read a PANIC's answer out loud — ONE reader for every PANIC control, so the toolbar's and the
 * every-channel control's sentences cannot drift into two grammars.
 *
 * The wording says what ACTUALLY went, and it distinguishes the two numbers the bridge
 * distinguishes: `silenced` reached the wire, while a HELD plate was already silent and only had
 * its intent recorded — so that when its look comes back it stays silent instead of returning at
 * whatever it was before.
 *
 * ⚠ A no-op is NEVER a success. `B-122`: an operator told the escape hatch worked while the thing
 * is still on air is worse off than one told nothing happened.
 *
 * The refusal is reported HERE and returned as `cancelled`: a plain `accepted: false` routes to
 * `AsyncButton`'s `onError`, whose generic toast would overwrite this specific one.
 */
export function readPanicReport(
  res: PanicReport,
  scope: PanicScope,
): { accepted: boolean; cancelled?: boolean } {
  const where = scopeClause(scope);
  if (res.failed.length > 0) {
    const names = res.failed.map((f) => f.plateId).join(', ');
    reportCommandError(
      `Silenced ${String(res.silenced)} plate(s)${where}, but ${names} did not take — those ` +
        `may still be audible.`,
    );
    return { accepted: false, cancelled: true };
  }
  if (!res.ok || res.recorded === 0) {
    reportCommandError(
      `Nothing was sent — ${nothingWhere(scope)}, so there was nothing to silence.`,
    );
    return { accepted: false, cancelled: true };
  }
  const held = res.recorded - res.silenced;
  reportCommandSuccess(
    `Silenced · ${String(res.silenced)} plate(s) on ${String(res.rows.length)} row(s)` +
      where +
      (held > 0
        ? ` · ${String(held)} already silent in the current look, now armed silent too`
        : ''),
  );
  return { accepted: true };
}

/**
 * `FIELD-FIXES-01` K — a silence control's title while there is nothing to silence: the SAME words
 * the bridge's answer would come back with, so the disabled control and a press say one thing.
 */
export function nothingToSilence(scope: PanicScope): string {
  return `Nothing to silence — ${nothingWhere(scope)}.`;
}

/**
 * 🔴 `FIELD-FIXES-01` K — **DOES A SILENCE OF `scope` HAVE ANYTHING TO ACT ON**, as this console
 * knows it: the ledger's channels (`ledgerChannels`, the bridge's own predicate) hold the scope's
 * channel — or any channel, for the every-channel and one-channel scopes. Both silence controls ask
 * it; a `false` shows the control disabled and neutral.
 *
 * ⚠ TRUE while the ledger has not arrived: an emergency control is never withheld on a value that
 * may be wrong (`B-122`). The verb itself stays unscoped and the bridge answers it either way.
 */
export function silenceHasTarget(
  ledger: readonly Pick<LiveLayerState, 'channel'>[],
  ready: boolean,
  scope: PanicScope,
): boolean {
  if (!ready) return true;
  const channels = ledgerChannels(ledger);
  return scope.kind === 'channel' ? channels.includes(scope.channel) : channels.length > 0;
}
