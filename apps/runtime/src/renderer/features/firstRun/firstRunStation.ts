import {
  defaultFixedLayerBank,
  type CatalogueChannel,
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
export function checkAllowsConnect(lines: readonly ConnectionCheckLine[]): boolean {
  const passed = (id: ConnectionCheckLine['id']): boolean =>
    lines.some((l) => l.id === id && l.status === 'pass');
  return passed('api') && passed('cors');
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

/**
 * Apply the choice: the CasparCG host first, then the channel. Resolves `null` on success, or the
 * bridge's own sentence for the step that was refused.
 */
export async function commitFirstRun(
  bridge: Pick<RuntimeBridge, 'connections' | 'fixedLayers'>,
  choice: { readonly channel: number; readonly casparHost: string; readonly serveHost: string },
): Promise<string | null> {
  const current = await bridge.connections.config();
  const applied = await bridge.connections.setConfig(
    firstRunConnection(current, choice.casparHost, choice.serveHost),
  );
  if (!applied.ok) return applied.message ?? 'The CasparCG host was not applied.';
  const declared = await bridge.fixedLayers.setConfig(firstRunBank(choice.channel));
  if (!declared.ok) return declared.message ?? 'The channel was not declared.';
  return null;
}
