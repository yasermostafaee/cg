import type { PgmEngine } from '@cg/shared-ipc';
import { playoutOriginForLoopback } from '../../../platform/bridgeUrl.js';

/** Translate the configured Playout member's local hostname for remote operators. */
export function programmeServerDisplayName(
  { engine, name }: { readonly engine: PgmEngine; readonly name: string },
  playoutSignInUrl: string | null | undefined,
): string {
  if (engine !== 'A' || playoutSignInUrl === undefined) return name;

  // Discovery uses a bare host for an unnamed member, or adds "(host)" to distinguish duplicates.
  const suffix = /^(.*) \(([^()]+)\)$/u.exec(name);
  const host = suffix?.[2] ?? name;
  const origin = playoutOriginForLoopback(host, playoutSignInUrl);
  if (origin === null) return name;

  const hostname = new URL(origin).hostname;
  return suffix === null ? hostname : `${suffix[1]} (${hostname})`;
}
