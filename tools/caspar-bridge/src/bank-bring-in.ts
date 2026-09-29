import {
  fiveRowVisibility,
  fixedBankSlots,
  isLayerVisible,
  isUnappliedAllShownBank,
  type FixedLayerBank,
} from '@cg/shared-ipc';

/**
 * 🔴 `RELEASE-091-01` §7 (`B-291`) — **A BANK NO OPERATOR EVER APPLIED IS BROUGHT TO THE FIVE-ROW
 * RULE, ONCE.**
 *
 * The owner's installed station came up showing every row: its bank was saved every-row-shown
 * before `FIELD-FIXES-01` I (`R-070` kept a saved bank as written), and a first-run that cannot read
 * the channel's occupancy in 3 s still saves one. The owner's decision (2026-09-29, nothing has been
 * delivered, so no compatibility is owed): at start, five template rows and five beds, plus every
 * occupied row.
 *
 * ⚠ **THE SAFETY IS THE VALIDATOR'S, NOT THIS FILE'S.** The change goes through the same door as an
 * operator's Apply (`setFixedLayerBanks`), whose rule hides a row only while it reads EMPTY — so this
 * waits until the channel's occupancy is KNOWN, keeps every occupied row shown, and changes nothing
 * while it is unknown. It never widens what that door allows.
 *
 * ⚠ **ONCE, BY CONSTRUCTION.** The five-row result carries `false` keys, so it can never match
 * `isUnappliedAllShownBank` again; a bank the rule would leave unchanged (five rows or fewer, or all
 * occupied) is skipped, never re-applied round after round.
 */

/** What one round reads and writes — injected, so the tests drive the same code the bridge runs. */
export interface BankBringInDeps {
  /** The station's banks in force. */
  banks(): readonly FixedLayerBank[];
  /** The channel's occupancy as the tap reads it NOW — `unknown` while it cannot say. */
  occupancy(channel: number): Promise<{
    state: 'occupied' | 'empty' | 'unknown';
    layers: readonly { layer: number }[];
  }>;
  /** Apply a change to the station's banks through the validated door. */
  apply(banks: readonly FixedLayerBank[]): { ok: boolean; reason?: string; message?: string };
  /** Persist the banks in force. */
  persist(): void;
  log(line: string): void;
}

/** One round's outcome: brought a bank in, nothing to do, or waiting for a known occupancy. */
export type BankBringInOutcome = 'applied' | 'nothing' | 'waiting';

/** A bank whose five-row form would hide at least one row it shows now. */
function changes(before: FixedLayerBank, after: FixedLayerBank): boolean {
  return fixedBankSlots(before).some(
    ({ layer }) => isLayerVisible(before, layer) && !isLayerVisible(after, layer),
  );
}

/** The rows a bank shows, as the log line names them (highest first). */
function shownRows(bank: FixedLayerBank): string {
  return fixedBankSlots(bank)
    .filter(({ layer }) => isLayerVisible(bank, layer))
    .map(({ layer }) => layer)
    .sort((a, b) => b - a)
    .join(', ');
}

/** One round: bring every due bank in, or report why not. */
export async function bringInUnappliedBanks(deps: BankBringInDeps): Promise<BankBringInOutcome> {
  const before = deps.banks();
  if (!before.some(isUnappliedAllShownBank)) return 'nothing';
  const next: FixedLayerBank[] = [];
  const brought: FixedLayerBank[] = [];
  for (const bank of before) {
    if (!isUnappliedAllShownBank(bank)) {
      next.push(bank);
      continue;
    }
    const read = await deps.occupancy(bank.channel);
    // Unknown is never empty: nothing changes until the channel can be read.
    if (read.state === 'unknown') return 'waiting';
    const five = fiveRowVisibility(bank, new Set(read.layers.map((l) => l.layer)));
    if (changes(bank, five)) {
      next.push(five);
      brought.push(five);
    } else {
      next.push(bank);
    }
  }
  if (brought.length === 0) return 'nothing';
  // Somebody applied a change while the occupancy was read: theirs stands; the next round decides.
  if (JSON.stringify(deps.banks()) !== JSON.stringify(before)) return 'waiting';
  const result = deps.apply(next);
  if (!result.ok) {
    deps.log(
      `[caspar-bridge] rows at start: the five-row bank was refused (${result.reason ?? 'refused'}) — ` +
        `${result.message ?? 'nothing changed'}; trying again when the channel reads again`,
    );
    return 'waiting';
  }
  deps.persist();
  for (const bank of brought) {
    deps.log(
      `[caspar-bridge] rows at start: channel ${String(bank.channel)} was saved with every row shown ` +
        `and no operator had applied it — it now shows ${shownRows(bank)} (five of each band, and every ` +
        `occupied row; RELEASE-091-01 §7)`,
    );
  }
  return 'applied';
}

/**
 * Run a round now and then every `intervalMs`, for the bridge's lifetime — a first-run that falls back
 * to every row shown later in the session is brought in too. A round that finds nothing to do costs
 * one pure check. Rounds never overlap.
 */
export function startBankBringIn(deps: BankBringInDeps, intervalMs = 5000): { dispose(): void } {
  let running = false;
  let disposed = false;
  // A refusal repeats every round until the channel changes; the log says it once.
  let lastLine: string | null = null;
  const quiet: BankBringInDeps = {
    ...deps,
    log: (line) => {
      if (line === lastLine) return;
      lastLine = line;
      deps.log(line);
    },
  };
  const round = (): void => {
    if (running || disposed) return;
    running = true;
    void bringInUnappliedBanks(quiet)
      .catch((err: unknown) => {
        quiet.log(
          `[caspar-bridge] rows at start: ${err instanceof Error ? err.message : String(err)}`,
        );
      })
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(round, intervalMs);
  timer.unref();
  round();
  return {
    dispose() {
      disposed = true;
      clearInterval(timer);
    },
  };
}
