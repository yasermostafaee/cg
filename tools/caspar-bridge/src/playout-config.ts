import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { AuthMode } from '@cg/shared-ipc';

/**
 * 🔴 `C-037` — **WHICH PLAYOUT THIS BRIDGE TRUSTS, and whether it authenticates at all.**
 *
 * ── WHY THIS IS ITS OWN FILE AND NOT PART OF `ConnectionConfig` ─────────────
 *
 * The obvious home was `ConnectionConfigSchema`, which already carries `templateServeHost`
 * and persists under `R-010`'s precedence. It is the wrong one, and the reason is load
 * bearing: **that schema IS the `connections.set-config` REQUEST body.** Putting `issuer`,
 * `jwksUrl` or `audience` there would make the bridge's own authentication configuration
 * rewritable over the control socket — by any socket that can reach the port, which is
 * precisely what `C-037` exists to gate. A gate whose configuration is behind the gate is
 * not a gate.
 *
 * ⚠ And the connection file's doctrine is the opposite of what a key group like this wants.
 * `loadPersistedConnection` WARNS AND IGNORES an invalid file and falls through to the
 * default — correct for a server address (a station with a typo still boots and can be fixed
 * from the console) and wrong here, because the fall-through would be _"no auth configured at
 * all"_. A bridge told to authenticate that quietly does not is the firewall rule that was
 * written and never enforced. So this file follows the RESERVED-LAYERS doctrine instead:
 * present-but-unusable is a HARD startup failure naming the file and the reason.
 *
 * What it keeps from `R-010` is the precedence — **CLI flags > file > default** — which is
 * the part `C-037`'s note actually cites.
 */

/** A playout config file that is present but unusable — a hard startup failure. */
export class PlayoutConfigError extends Error {
  override readonly name = 'PlayoutConfigError';
  constructor(message: string) {
    super(message);
  }
}

/**
 * The contract's fixed paths (`PLAYOUT-INTEGRATION-CONTRACT-v1` §4, D1/D2/D3/D4 and v1.1's
 * D9). Only `issuer` and `jwksUrl` are ever REQUIRED; the other four are derived from the
 * issuer when not given, because the contract fixes the path and re-typing four URLs is four
 * chances to typo one that is only exercised months later.
 *
 * ⚠ `jwksUrl` is required even though its path is equally fixed, because `C-037` says so in
 * as many words — and because it is the one URL whose being wrong means every token is
 * refused rather than one feature being quiet.
 */
const CONTRACT_PATHS = {
  tokenUrl: '/api/cg/auth/token',
  refreshUrl: '/api/cg/auth/refresh',
  channelsUrl: '/api/cg/channels',
  revokedUrl: '/api/cg/revoked',
} as const;

/** The default `aud` the bridge requires a token to carry (Playout Q5: accepted). */
export const DEFAULT_PLAYOUT_AUDIENCE = 'cg-control';

/** The integration contract version this bridge implements — v1 plus D9. */
export const PLAYOUT_CONTRACT_VERSION = '1.1';

/** Everything the bridge needs to verify a token and everything the console needs to get one. */
export interface PlayoutAuthConfig {
  /**
   * 🔴 Compared to a token's `iss` **BYTE FOR BYTE**, and never derived from anything
   * (ADR 0010 rule 1). The Playout's configured base URL, copied verbatim.
   */
  readonly issuer: string;
  /** D3 — the JWK Set. Fetched by the BRIDGE, server-side; never proxied for a browser. */
  readonly jwksUrl: string;
  /** D1 — where the BROWSER posts credentials. Advertised in `bridge.capabilities`. */
  readonly tokenUrl: string;
  /** D2 — where the BROWSER refreshes. Advertised in `bridge.capabilities`. */
  readonly refreshUrl: string;
  /** D4 — the channel catalogue. Carried now, read by `C-039`. */
  readonly channelsUrl: string;
  /** D9 — the revocation list. Polled by the BRIDGE at most once per 60 s. */
  readonly revokedUrl: string;
  /** A token's `aud` must EQUAL or CONTAIN this. */
  readonly audience: string;
}

/** The resolved answer: the mode, and the config iff the mode needs one. */
export interface PlayoutSettings {
  readonly mode: AuthMode;
  /** `null` exactly when `mode === 'off'` — the type cannot express a configured OFF bridge. */
  readonly playout: PlayoutAuthConfig | null;
}

/** Auth off, no Playout. What every bridge has today and what a bridge told nothing gets. */
export const AUTH_OFF: PlayoutSettings = { mode: 'off', playout: null };

/**
 * The on-disk shape. Spelled so the keys read as `playout.issuer`, `playout.jwksUrl` … —
 * exactly the names `C-037` records.
 */
export const PlayoutFileSchema = z.object({
  auth: z.enum(['off', 'playout']).optional(),
  playout: z
    .object({
      issuer: z.string().optional(),
      jwksUrl: z.string().optional(),
      tokenUrl: z.string().optional(),
      refreshUrl: z.string().optional(),
      channelsUrl: z.string().optional(),
      revokedUrl: z.string().optional(),
      audience: z.string().optional(),
    })
    .optional(),
});
export type PlayoutFile = z.infer<typeof PlayoutFileSchema>;

/** The CLI half — every field a flag can set, all optional, all session overrides. */
export interface PlayoutFlags {
  readonly auth?: AuthMode;
  readonly issuer?: string;
  readonly jwksUrl?: string;
  readonly tokenUrl?: string;
  readonly refreshUrl?: string;
  readonly channelsUrl?: string;
  readonly revokedUrl?: string;
  readonly audience?: string;
}

/** Default file location, beside every other `~/.cg-runtime/bridge-*.json`. */
export function defaultPlayoutConfigPath(homeDir: string): string {
  return path.join(homeDir, '.cg-runtime', 'bridge-playout.json');
}

/**
 * Load + schema-validate the persisted playout config.
 *
 * Absent is normal (a station that does not authenticate has no file). Present-but-unusable
 * THROWS — see the header for why this one does not warn-and-ignore.
 */
export function loadPlayoutFile(configPath: string): PlayoutFile | null {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new PlayoutConfigError(
      `playout config ${configPath} is present but unreadable: ${(err as Error).message}`,
    );
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    throw new PlayoutConfigError(
      `playout config ${configPath} is present but unusable: not valid JSON (${(err as Error).message})`,
    );
  }
  const result = PlayoutFileSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new PlayoutConfigError(
      `playout config ${configPath} is present but unusable: schema-invalid: ${result.error.message}`,
    );
  }
  return result.data;
}

/** `http(s)://host[:port][/path]`, no trailing slash expected. Anything else is refused. */
function requireAbsoluteUrl(key: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PlayoutConfigError(
      `playout.${key} must be an absolute URL (e.g. http://playout.example.local:8080) — got ${JSON.stringify(value)}. ` +
        `Refusing to start: a bridge told to authenticate must not fall back to not authenticating.`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PlayoutConfigError(
      `playout.${key} must be an http or https URL — got ${JSON.stringify(value)}. ` +
        `Refusing to start: a bridge told to authenticate must not fall back to not authenticating.`,
    );
  }
  return value;
}

/**
 * 🔴 **THE PRECEDENCE, IN ONE PLACE — CLI flags > file > default (`R-010`).**
 *
 * Throws {@link PlayoutConfigError} rather than degrading, in every case where the bridge was
 * told to authenticate and could not be told HOW. The sentence names the KEY, because at
 * 03:00 the difference between "the bridge will not start" and "the bridge will not start,
 * `playout.jwksUrl` is missing" is the whole night.
 *
 * @param onWarn receives non-fatal boot notes (an issuer with a trailing slash). Separate
 *   from the throw path so a caller can route them wherever its other boot lines go.
 */
export function resolvePlayoutSettings(
  flags: PlayoutFlags,
  file: PlayoutFile | null,
  onWarn: (message: string) => void = () => undefined,
): PlayoutSettings {
  const mode: AuthMode = flags.auth ?? file?.auth ?? 'off';
  if (mode === 'off') return AUTH_OFF;

  const pick = (key: keyof PlayoutAuthConfig): string | undefined =>
    flags[key] ?? file?.playout?.[key];

  const issuerRaw = pick('issuer');
  if (issuerRaw === undefined || issuerRaw.trim() === '') {
    throw new PlayoutConfigError(
      `auth is set to 'playout' but playout.issuer is missing. ` +
        `It is the Playout's base URL, copied verbatim from the Playout's own configured value ` +
        `(a token's \`iss\` is compared to it byte for byte, never derived). ` +
        `Set --playout-issuer or "playout": { "issuer": … } in the playout config file. ` +
        `Refusing to start: a bridge told to authenticate must not fall back to not authenticating.`,
    );
  }
  const issuer = requireAbsoluteUrl('issuer', issuerRaw.trim());
  if (issuer.endsWith('/')) {
    /*
      ⚠ A WARNING AND NOT A REFUSAL, deliberately.

      ADR 0010 rule 1 records the Playout's value as "the engine base URL, no trailing slash",
      so a trailing slash here is almost certainly a typo that will refuse every token with
      "not for this station" — a sentence that is true and gives no hint why. But `iss` is
      compared BYTE FOR BYTE and never rewritten, so this code may not quietly strip it and
      must not refuse a value that a differently-configured Playout might legitimately issue.
      Saying so at boot is the only move that is both honest and useful.
    */
    onWarn(
      `[caspar-bridge] ⚠ playout.issuer ends with a slash (${issuer}). A token's \`iss\` is ` +
        `compared to it byte for byte, so unless the Playout issues the trailing slash too, ` +
        `every sign-in will be refused as "not for this station".`,
    );
  }

  const jwksRaw = pick('jwksUrl');
  if (jwksRaw === undefined || jwksRaw.trim() === '') {
    throw new PlayoutConfigError(
      `auth is set to 'playout' but playout.jwksUrl is missing. ` +
        `It is the Playout's JWK Set (D3, typically ${issuer}/.well-known/jwks.json) and the ` +
        `bridge reads it server-side to verify every token. ` +
        `Set --playout-jwks-url or "playout": { "jwksUrl": … } in the playout config file. ` +
        `Refusing to start: a bridge told to authenticate must not fall back to not authenticating.`,
    );
  }

  const derived = (key: keyof typeof CONTRACT_PATHS): string => {
    const given = pick(key);
    if (given !== undefined && given.trim() !== '') {
      return requireAbsoluteUrl(key, given.trim());
    }
    return `${issuer.replace(/\/$/, '')}${CONTRACT_PATHS[key]}`;
  };

  return {
    mode: 'playout',
    playout: {
      issuer,
      jwksUrl: requireAbsoluteUrl('jwksUrl', jwksRaw.trim()),
      tokenUrl: derived('tokenUrl'),
      refreshUrl: derived('refreshUrl'),
      channelsUrl: derived('channelsUrl'),
      revokedUrl: derived('revokedUrl'),
      audience: pick('audience')?.trim() ?? DEFAULT_PLAYOUT_AUDIENCE,
    },
  };
}
