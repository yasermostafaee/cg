import type { ConnectionConfig } from '@cg/shared-ipc';

/**
 * R-010 — loopback detection shared by the settings panel (LAN-exposure
 * warning) and the offline mock (simulated `exposed` flag). Mirrors the
 * bridge's `isLoopbackHost` (`tools/caspar-bridge/src/template-http-server.ts`)
 * — kept as a tiny local copy because the renderer must not import Node-tier
 * packages (golden rule 1).
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
}

/**
 * B-162 — every CasparCG host a config declares, primary AND backup.
 *
 * Mirrors the bridge's `configuredCasparHosts` for the same reason the predicate
 * above is mirrored (golden rule 1 — no Node-tier import from the renderer). It
 * exists because the panel and the mock BOTH used to ask only about
 * `servers.A.host`, and the backup having no dimension in a decision that
 * concerns it is precisely what cost a remote backup its graphics.
 */
export function configuredHosts(config: ConnectionConfig): readonly string[] {
  return [
    config.servers.A.host,
    ...(config.servers.B !== undefined ? [config.servers.B.host] : []),
  ];
}
