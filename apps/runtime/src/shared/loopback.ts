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
