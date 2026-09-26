import {
  bankForChannel,
  CONNECTION_CHECK_IDS,
  connectionCheckSubject,
  defaultFixedLayerBank,
  type CatalogueChannel,
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

/**
 * The bank first-run declares: the chosen channel, the default bands (beds 50–59, the operator
 * rows 80–99), and EVERY row shown.
 *
 * ⚠ Every row, because there is no CasparCG link yet: occupancy is unknown, and installing a
 * bank that already hides a row of unknown occupancy is refused (`untick-unknown`) — the rule
 * that stops a live install sliding an on-air layer out of sight. Rows are hidden later, from
 * Station setup, once the link reads them.
 */
export function firstRunBank(channel: number): FixedLayerBank {
  const base = defaultFixedLayerBank();
  const shown = (visibility: Record<string, boolean> | undefined): Record<string, boolean> =>
    Object.fromEntries(Object.keys(visibility ?? {}).map((layer) => [layer, true]));
  return {
    ...base,
    channel,
    visibility: shown(base.visibility),
    low: { ...base.low, visibility: shown(base.low.visibility) },
  };
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

/**
 * May first-run go on to the Playout? The two links a SIGN-IN needs — the Playout's keys and its
 * CORS list — must pass. AMCP and the rest are reported, never gating: they are CasparCG's links,
 * and a station can be set up while an engine firewall is still being opened.
 */
export function checkAllowsConnect(
  lines: readonly Pick<ShownCheckLine, 'id' | 'status'>[],
): boolean {
  const passed = (id: ConnectionCheckLine['id']): boolean =>
    lines.some((l) => l.id === id && l.status === 'pass');
  return passed('api') && passed('cors');
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
  bridge: Pick<RuntimeBridge, 'fixedLayers'>,
  choice: ChannelChoice,
): Promise<string | null> {
  const declared = await bridge.fixedLayers.setConfig(firstRunBank(choice.channel));
  return declared.ok ? null : (declared.message ?? 'The channel was not declared.');
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
  bridge: Pick<RuntimeBridge, 'fixedLayers'>,
  choices: readonly ChannelChoice[],
): Promise<string | null> {
  const [only, ...rest] = choices;
  if (only === undefined) return 'No channel was chosen.';
  if (rest.length === 0) return declareFirstRunChannel(bridge, only);
  const declared = await bridge.fixedLayers.setBanks({
    banks: choices.map((c) => firstRunBank(c.channel)),
  });
  return declared.ok ? null : (declared.message ?? 'The channels were not declared.');
}

/**
 * 🔴 `MULTI-CHANNEL-01` §2 M — **THE STATION'S NEXT CHANNEL SET**, from the banks it declares now
 * and the channels Station setup's Change channel… was left holding.
 *
 * - a channel KEPT keeps its own bank — its names, its shown rows — untouched;
 * - a channel ADDED gets first-run's bank (every row shown: its occupancy is not known yet, and a
 *   bank that hides a row of unknown occupancy is refused, `firstRunBank`'s own reason);
 * - a ONE-FOR-ONE SWAP carries the station's bank to the new channel, which is what Change
 *   channel… did before the set could hold more than one (`DESKTOP-APPS-01-D` e) — the operator
 *   moved the station, and its layer names moved with it.
 */
export function nextChannelSet(
  banks: readonly FixedLayerBank[],
  channels: readonly number[],
): FixedLayerBank[] {
  const [only, ...others] = banks;
  const [target, ...more] = channels;
  if (only !== undefined && others.length === 0 && target !== undefined && more.length === 0) {
    return [{ ...only, channel: target }];
  }
  return channels.map((c) => bankForChannel(banks, c) ?? firstRunBank(c));
}

/**
 * Apply Station setup's channel set. ONE bank goes through `fixedLayers.set-config`, the door a
 * single-channel station has always used; two or more through `fixedLayers.set-banks`. The
 * bridge keeps its refusal either way — nothing of ours may be on air on a channel leaving the
 * set — and its sentence comes back as it is.
 */
export async function declareChannelSet(
  bridge: Pick<RuntimeBridge, 'fixedLayers'>,
  banks: readonly FixedLayerBank[],
  choices: readonly ChannelChoice[],
): Promise<string | null> {
  const next = nextChannelSet(
    banks,
    choices.map((c) => c.channel),
  );
  const [only, ...rest] = next;
  if (only === undefined) return 'No channel was chosen.';
  const applied =
    rest.length === 0
      ? await bridge.fixedLayers.setConfig(only)
      : await bridge.fixedLayers.setBanks({ banks: next });
  return applied.ok ? null : (applied.message ?? 'The channels were not changed.');
}

/**
 * Apply the choice: the CasparCG host first, then the channel. Resolves `null` on success, or the
 * bridge's own sentence for the step that was refused.
 */
export async function commitFirstRun(
  bridge: Pick<RuntimeBridge, 'connections' | 'fixedLayers'>,
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
