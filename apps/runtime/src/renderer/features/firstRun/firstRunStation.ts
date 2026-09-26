import {
  bankForChannel,
  CONNECTION_CHECK_IDS,
  connectionCheckSubject,
  defaultFixedLayerBank,
  fixedBankEnd,
  fixedBankSlots,
  isLowBankLayer,
  lowBankEnd,
  type CatalogueChannel,
  type ChannelOccupancy,
  type ConnectionCheckId,
  type ConnectionCheckLine,
  type ConnectionConfig,
  type FixedLayerBank,
} from '@cg/shared-ipc';
import type { RuntimeBridge } from '../../../shared/runtime-bridge.js';

/**
 * `DESKTOP-APPS-01` §2E — **WHAT FIRST-RUN WRITES, as plain functions.**
 *
 * First-run writes through the EXISTING station-admin doors and nothing else: the CasparCG host
 * and the serve host through `connections.set-config`, then the channel through
 * `fixedLayers.set-config` — the declaration door, which the station fence reads.
 * `MULTI-CHANNEL-01` §2 E — two or more channels are declared through `fixedLayers.set-banks`,
 * the same door's plural, in ONE write.
 */

/** The standard AMCP / OSC ports — the ones the Playout's allow list and our firewall rules name. */
export const AMCP_PORT = 5250;
export const OSC_PORT = 6250;

/** `FIELD-FIXES-01` I — how many rows of each band a NEW bank shows: the highest of each band. */
export const NEW_BANK_SHOWN_PER_BAND = 5;

/**
 * 🔴 `FIELD-FIXES-01` I — **THE BANK A NEW CHANNEL GETS** (first-run, and a channel Station setup's
 * Change channel… adds): the default bands (beds 50–59, the operator rows 80–99) with FIVE rows of
 * each shown — templates 99–95 and beds 59–55, "highest layer first" — and the rest hidden. The
 * owner's installed station came up showing 30 of 30, beds out of sight below twenty empty rows.
 *
 * ⚠ **SAFETY IS UNCHANGED: a row is never hidden unless it is known to be empty.** A layer the
 * channel's occupancy read (`setup.channel-occupancy`, taken after the connection is written and
 * before the channel is declared) reports as carrying anything stays shown; and with NO reading, or
 * an `unknown` one — no link yet, no fresh OSC — EVERY row is shown, because unknown is never
 * treated as empty (`untick-unknown`). The bridge judges the install against its own reading too,
 * and if it still refuses a hidden row the declare falls back to every row shown (see
 * {@link declareWithFallback}). An existing station's saved rows are never touched: this is only
 * ever a NEW bank.
 */
export function newChannelBank(
  channel: number,
  occupancy: ChannelOccupancy | null,
): FixedLayerBank {
  const base = defaultFixedLayerBank();
  const known = occupancy !== null && occupancy.state !== 'unknown';
  const occupied = new Set(known ? occupancy.layers.map((l) => l.layer) : []);
  // Each band's rows through the ONE enumeration, and each band's top through its own end.
  const visibility: Record<string, boolean> = {};
  const low: Record<string, boolean> = {};
  for (const { layer } of fixedBankSlots(base)) {
    const bed = isLowBankLayer(base, layer);
    const top = bed ? lowBankEnd(base) : fixedBankEnd(base);
    (bed ? low : visibility)[String(layer)] =
      !known || layer > top - NEW_BANK_SHOWN_PER_BAND || occupied.has(layer);
  }
  return { ...base, channel, visibility, low: { ...base.low, visibility: low } };
}

/**
 * The bank first-run declares when nothing can be read about the channel: EVERY row shown (the
 * unknown case of {@link newChannelBank}, and its fallback).
 */
export function firstRunBank(channel: number): FixedLayerBank {
  return newChannelBank(channel, null);
}

/** What the channel's occupancy read says, or `unknown` when the read itself fails. */
async function readOccupancy(
  bridge: Pick<RuntimeBridge, 'setup'>,
  channel: number,
): Promise<ChannelOccupancy> {
  return bridge.setup
    .channelOccupancy({ casparChannel: channel })
    .catch(() => ({ state: 'unknown' as const, layers: [] }));
}

/**
 * 🔴 `FIELD-FIXES-01` I — write the banks; and if the bridge refuses a HIDDEN row (its own reading
 * says occupied or unknown — `untick-occupied` / `untick-unknown`), write them again with every row
 * of the new channels shown. The default never costs a station its channel: it degrades to today's
 * bank rather than to a refusal.
 */
async function declareWithFallback(
  write: (banks: readonly FixedLayerBank[]) => Promise<{
    ok: boolean;
    reason?: string | undefined;
    message?: string | undefined;
  }>,
  banks: readonly FixedLayerBank[],
  allShown: readonly FixedLayerBank[],
  refusal: string,
): Promise<string | null> {
  const first = await write(banks);
  if (first.ok) return null;
  if (first.reason !== 'untick-unknown' && first.reason !== 'untick-occupied') {
    return first.message ?? refusal;
  }
  const second = await write(allShown);
  return second.ok ? null : (second.message ?? refusal);
}

/**
 * The connection first-run applies: ONE server — the CasparCG host the Playout's own list names —
 * on the standard ports, and the serve host CasparCG fetches templates from. Everything else the
 * station already had is kept.
 */
export function firstRunConnection(
  current: ConnectionConfig,
  casparHost: string,
  serveHost: string,
): ConnectionConfig {
  const { templateServeHost: _previous, ...rest } = current;
  const serve = serveHost.trim();
  return {
    ...rest,
    servers: { A: { host: casparHost.trim(), amcpPort: AMCP_PORT, oscPort: OSC_PORT } },
    ...(serve !== '' ? { templateServeHost: serve } : {}),
  };
}

/** The Playout's channels, grouped by the CasparCG host they play on, in the Playout's order. */
export function groupByHost(
  rows: readonly CatalogueChannel[],
): readonly { host: string; rows: readonly CatalogueChannel[] }[] {
  const groups = new Map<string, CatalogueChannel[]>();
  for (const row of rows) {
    const group = groups.get(row.casparHost);
    if (group === undefined) groups.set(row.casparHost, [row]);
    else group.push(row);
  }
  return [...groups.entries()].map(([host, grouped]) => ({ host, rows: grouped }));
}

/** The two links a SIGN-IN needs — the Playout's keys, and its CORS list for this console. */
const SIGN_IN_LINKS: readonly ConnectionCheckLine['id'][] = ['api', 'cors'];

/**
 * 🔴 **CAN A SIGN-IN WORK?** — the two links a sign-in needs, the Playout's keys and its CORS
 * list, both pass. AMCP and the rest are reported, never gating: they are CasparCG's links, and a
 * station can be set up while an engine firewall is still being opened.
 *
 * ONE predicate for both doors that ask it (golden rule 6): first-run's CONNECT, and — since
 * `DELTA-MULTI-CHANNEL-01-B` B2 — every sign-in form, whose fields and button are enabled only
 * while it holds. (It was `checkAllowsConnect`, named for the first door alone.)
 */
export function signInCanWork(lines: readonly Pick<ShownCheckLine, 'id' | 'status'>[]): boolean {
  return SIGN_IN_LINKS.every((id) => lines.some((l) => l.id === id && l.status === 'pass'));
}

/**
 * `DELTA-MULTI-CHANNEL-01-B` B2 — the ONE line a disabled sign-in shows, in the check's own
 * words: the first of the sign-in's links that has not passed, as the check left it (failed, not
 * checked, or checking). `null` when a sign-in can work — or when nothing has been checked yet.
 */
export function signInBlocker(lines: readonly ShownCheckLine[] | null): ShownCheckLine | null {
  if (lines === null) return null;
  for (const id of SIGN_IN_LINKS) {
    const line = lines.find((l) => l.id === id);
    if (line !== undefined && line.status !== 'pass') return line;
  }
  return null;
}

/**
 * A line of the connection check as the console shows it: the bridge's line, or — while a check
 * runs — `checking`, which is the console's own and never on the wire.
 */
export type ShownCheckLine = Omit<ConnectionCheckLine, 'status'> & {
  readonly status: ConnectionCheckLine['status'] | 'checking';
};

/**
 * 🔴 `CHECK-RERUN-01` A — **A CHECK STARTS CLEAN.** The lines the moment Check is pressed: every
 * link's subject, with no verdict, so nothing from the last run reads as a current result while
 * the new one runs (the owner's dialog, 2026-09-24, kept its ticks and crosses under "Checking…").
 * `address` is the normalised address being checked; the subjects are the bridge's own spelling.
 */
export function checkingLines(address: string): readonly ShownCheckLine[] {
  let host = address;
  let port = '';
  try {
    const url = new URL(address);
    host = url.hostname.replace(/^\[|\]$/g, '');
    port = url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80';
  } catch {
    // Not a URL: the subjects name what was typed.
  }
  return CONNECTION_CHECK_IDS.map((id) => ({
    id,
    status: 'checking',
    text: connectionCheckSubject(id, host, port),
  }));
}

/**
 * 🔴 `DELTA-MULTI-CHANNEL-01-A` A2 — **AN AUTOMATIC RE-RUN TOUCHES ONLY THE LINES THAT WAITED.**
 * A PRESSED check starts clean (above); the one re-run the console makes by itself — when the thing
 * a waiting line waits for changes — updates those lines in place and leaves every other verdict
 * exactly where it was, so nothing flashes to "checking" that nobody asked to see again.
 */
export function waitingIds(lines: readonly ShownCheckLine[]): ReadonlySet<ConnectionCheckId> {
  return new Set(lines.filter((l) => l.status === 'wait').map((l) => l.id));
}

/** Those lines, as their subjects, checking; every other line untouched. */
export function markChecking(
  lines: readonly ShownCheckLine[],
  ids: ReadonlySet<ConnectionCheckId>,
  address: string,
): readonly ShownCheckLine[] {
  const subjects = checkingLines(address);
  return lines.map((line) =>
    ids.has(line.id) ? (subjects.find((s) => s.id === line.id) ?? line) : line,
  );
}

/** Those lines replaced by the new run's; every other line keeps the verdict it had. */
export function updateOnly(
  lines: readonly ShownCheckLine[],
  ids: ReadonlySet<ConnectionCheckId>,
  fresh: readonly ShownCheckLine[],
): readonly ShownCheckLine[] {
  return lines.map((line) =>
    ids.has(line.id) ? (fresh.find((f) => f.id === line.id) ?? line) : line,
  );
}

/**
 * The configured Playout's ORIGIN, read off the sign-in address the bridge advertises (the bridge
 * derives every endpoint from the one address, so the origins agree). `null` when there is none.
 */
export function playoutOriginOf(signInUrl: string | null | undefined): string | null {
  if (signInUrl === null || signInUrl === undefined) return null;
  try {
    return new URL(signInUrl).origin;
  } catch {
    return null;
  }
}

/**
 * `DESKTOP-APPS-01-C` C3 — the ONE normalisation, shared with the bridge (`@cg/shared-ipc`): no
 * scheme → `http://`, `http://` with no port → `:8080`, an explicit port byte for byte. It used to
 * be this file's own, and refused a bare `192.168.21.111` while passing `http://192.168.21.111`
 * on to be probed at port 80.
 */
export { normalisePlayoutAddress } from '@cg/shared-ipc';

/** What a channel choice carries into the writes. */
export interface ChannelChoice {
  readonly channel: number;
  readonly casparHost: string;
  readonly serveHost: string;
}

/** First-run's first write: the CasparCG host. `null` on success, else the bridge's sentence. */
export async function writeFirstRunConnection(
  bridge: Pick<RuntimeBridge, 'connections'>,
  choice: ChannelChoice,
): Promise<string | null> {
  const current = await bridge.connections.config();
  const applied = await bridge.connections.setConfig(
    firstRunConnection(current, choice.casparHost, choice.serveHost),
  );
  return applied.ok ? null : (applied.message ?? 'The CasparCG host was not applied.');
}

/** First-run's second write: the channel, declared. `null` on success, else the bridge's sentence. */
export async function declareFirstRunChannel(
  bridge: Pick<RuntimeBridge, 'fixedLayers' | 'setup'>,
  choice: ChannelChoice,
): Promise<string | null> {
  const occupancy = await readOccupancy(bridge, choice.channel);
  return declareWithFallback(
    async ([bank]) => (bank === undefined ? { ok: false } : bridge.fixedLayers.setConfig(bank)),
    [newChannelBank(choice.channel, occupancy)],
    [firstRunBank(choice.channel)],
    'The channel was not declared.',
  );
}

/**
 * 🔴 `MULTI-CHANNEL-01` §2 E — **FIRST-RUN'S SECOND WRITE, FOR ONE OR MORE CHANNELS.** One bank per
 * chosen channel, each first-run's own (`firstRunBank`), declared in ONE write so the station never
 * sits half-declared between two.
 *
 * ONE channel goes through `fixedLayers.set-config` exactly as it always did — the same door, the
 * same frame — so a single-channel first-run is byte-identical; two or more go through
 * `fixedLayers.set-banks`, the plural door. Either way the bridge's own sentence comes back on a
 * refusal (a channel the principal holds no grant for is refused there, by name).
 */
export async function declareFirstRunChannels(
  bridge: Pick<RuntimeBridge, 'fixedLayers' | 'setup'>,
  choices: readonly ChannelChoice[],
): Promise<string | null> {
  const [only, ...rest] = choices;
  if (only === undefined) return 'No channel was chosen.';
  if (rest.length === 0) return declareFirstRunChannel(bridge, only);
  const banks: FixedLayerBank[] = [];
  for (const c of choices)
    banks.push(newChannelBank(c.channel, await readOccupancy(bridge, c.channel)));
  return declareWithFallback(
    (next) => bridge.fixedLayers.setBanks({ banks: [...next] }),
    banks,
    choices.map((c) => firstRunBank(c.channel)),
    'The channels were not declared.',
  );
}

/**
 * 🔴 `MULTI-CHANNEL-01` §2 M — **THE STATION'S NEXT CHANNEL SET**, from the banks it declares now
 * and the channels Station setup's Change channel… was left holding.
 *
 * - a channel KEPT keeps its own bank — its names, its shown rows — untouched;
 * - a channel ADDED gets a NEW bank (`newChannelBank`, `FIELD-FIXES-01` I): five rows of each band
 *   shown when its occupancy read is known, every row shown when it is not;
 * - a ONE-FOR-ONE SWAP carries the station's bank to the new channel, which is what Change
 *   channel… did before the set could hold more than one (`DESKTOP-APPS-01-D` e) — the operator
 *   moved the station, and its layer names moved with it.
 */
export function nextChannelSet(
  banks: readonly FixedLayerBank[],
  channels: readonly number[],
  occupancyOf: (channel: number) => ChannelOccupancy | null = () => null,
): FixedLayerBank[] {
  const [only, ...others] = banks;
  const [target, ...more] = channels;
  if (only !== undefined && others.length === 0 && target !== undefined && more.length === 0) {
    return [{ ...only, channel: target }];
  }
  return channels.map((c) => bankForChannel(banks, c) ?? newChannelBank(c, occupancyOf(c)));
}

/**
 * Apply Station setup's channel set. ONE bank goes through `fixedLayers.set-config`, the door a
 * single-channel station has always used; two or more through `fixedLayers.set-banks`. The
 * bridge keeps its refusal either way — nothing of ours may be on air on a channel leaving the
 * set — and its sentence comes back as it is.
 */
export async function declareChannelSet(
  bridge: Pick<RuntimeBridge, 'fixedLayers' | 'setup'>,
  banks: readonly FixedLayerBank[],
  choices: readonly ChannelChoice[],
): Promise<string | null> {
  const channels = choices.map((c) => c.channel);
  // `FIELD-FIXES-01` I — only a channel JOINING the set is read: one already in it keeps its bank.
  const read = new Map<number, ChannelOccupancy>();
  for (const c of channels) {
    if (bankForChannel(banks, c) === null) read.set(c, await readOccupancy(bridge, c));
  }
  const next = nextChannelSet(banks, channels, (c) => read.get(c) ?? null);
  if (next.length === 0) return 'No channel was chosen.';
  return declareWithFallback(
    ([only, ...rest]) =>
      only === undefined
        ? Promise.resolve({ ok: false })
        : rest.length === 0
          ? bridge.fixedLayers.setConfig(only)
          : bridge.fixedLayers.setBanks({ banks: [only, ...rest] }),
    next,
    nextChannelSet(banks, channels),
    'The channels were not changed.',
  );
}

/**
 * Apply the choice: the CasparCG host first, then the channel. Resolves `null` on success, or the
 * bridge's own sentence for the step that was refused.
 */
export async function commitFirstRun(
  bridge: Pick<RuntimeBridge, 'connections' | 'fixedLayers' | 'setup'>,
  choice: ChannelChoice,
): Promise<string | null> {
  return (
    (await writeFirstRunConnection(bridge, choice)) ??
    (await declareFirstRunChannel(bridge, choice))
  );
}

/**
 * 🔴 `DESKTOP-APPS-01-D` d — the ONE line an admin reads before declaring a channel that is
 * already on air with somebody else's content, after the channel's name. Operator words and the
 * real layer numbers (golden rule 11 keeps the layer visible in a sentence); a warning, never a
 * block — at a client, CG graphics do belong on the programme channel, above the Playout's layers.
 */
export function onAirWarning(channel: number, layers: readonly number[]): string {
  const where =
    layers.length === 1 ? `layer ${String(layers[0])}` : `layers ${layers.map(String).join(', ')}`;
  return ` · CH ${String(channel)} is already on air — another system is playing on ${where}.`;
}
