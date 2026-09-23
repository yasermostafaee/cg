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

/** The JWKS path every Playout serves (D3), for a station configured by its ADDRESS. */
const JWKS_PATH = '/.well-known/jwks.json';

/** Everything the bridge needs to verify a token and everything the console needs to get one. */
export interface PlayoutAuthConfig {
  /**
   * 🔴 `DESKTOP-APPS-01-A` A1 — **THE PLAYOUT'S ADDRESS**, the one field an installed station's
   * first-run asks for (`http://host:port`, no trailing slash). When present, EVERY endpoint
   * below — `jwksUrl` included — derives from it, and the issuer is only ever COMPARED. `null`
   * for a station configured the older way, by an explicit issuer whose endpoints derive from it.
   */
  readonly address: string | null;
  /**
   * 🔴 Compared to a token's `iss` **BYTE FOR BYTE**, and never derived from anything
   * (ADR 0010 rule 1).
   *
   * `null` ONLY for an ADDRESS-configured station that has not yet learned it: the first
   * `station-admin` sign-in whose token verifies against the address's JWKS and carries the
   * audience ADOPTS its `iss` (`DESKTOP-APPS-01-A` A2, ADR 0010's amendment). An unset issuer
   * never means "accept any `iss`" — before adoption, only adoption is accepted (A3).
   */
  readonly issuer: string | null;
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
      address: z.string().optional(),
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
  readonly address?: string;
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

/** A value that is present and not blank, or `undefined` — so `??` can do what it reads as. */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
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

  const address = nonEmpty(pick('address'));
  if (address !== undefined) return resolveByAddress(address, pick);

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
      address: null,
      issuer,
      jwksUrl: requireAbsoluteUrl('jwksUrl', jwksRaw.trim()),
      tokenUrl: derived('tokenUrl'),
      refreshUrl: derived('refreshUrl'),
      channelsUrl: derived('channelsUrl'),
      revokedUrl: derived('revokedUrl'),
      /*
        ⚠ An EMPTY value falls back to the default, and `??` alone would not do it: `''` is not
        nullish, so a blank `--playout-audience` or `"audience": ""` in the file resolved to the
        empty string — and every real token was then refused as "not for this station", which
        is true, unhelpful, and points at the wrong end of the link. Same shape as the two
        required keys above, which is why it reads the same way.
      */
      audience: nonEmpty(pick('audience')) ?? DEFAULT_PLAYOUT_AUDIENCE,
    },
  };
}

/**
 * 🔴 `DESKTOP-APPS-01-A` A1 — **A STATION CONFIGURED BY THE PLAYOUT'S ADDRESS.**
 *
 * The client installs the Playout on its own addresses, and a Playout may sign with a fixed,
 * address-free `iss` (proposed `urn:apasai:playout`) from which no URL can be derived. So here
 * the ADDRESS is the one source of every endpoint — the JWKS included — through the contract's
 * fixed paths, and the issuer is only ever compared:
 *
 *   - an issuer given explicitly (flag or file) is compared byte for byte, as always;
 *   - an issuer that is absent is LEARNED from the first `station-admin` sign-in (A2) and
 *     persisted with {@link persistAdoptedIssuer}. It is any non-empty string — a URN is fine —
 *     because nothing is derived from it.
 *
 * An endpoint given explicitly still wins over its derived value, exactly as the issuer branch
 * lets it.
 */
function resolveByAddress(
  addressRaw: string,
  pick: (key: keyof PlayoutAuthConfig) => string | undefined,
): PlayoutSettings {
  const derived = playoutEndpointsFor(addressRaw);
  const endpoint = (key: keyof typeof CONTRACT_PATHS | 'jwksUrl'): string => {
    const given = nonEmpty(pick(key));
    return given !== undefined ? requireAbsoluteUrl(key, given) : derived[key];
  };
  return {
    mode: 'playout',
    playout: {
      address: derived.address,
      issuer: nonEmpty(pick('issuer')) ?? null,
      jwksUrl: endpoint('jwksUrl'),
      tokenUrl: endpoint('tokenUrl'),
      refreshUrl: endpoint('refreshUrl'),
      channelsUrl: endpoint('channelsUrl'),
      revokedUrl: endpoint('revokedUrl'),
      audience: nonEmpty(pick('audience')) ?? DEFAULT_PLAYOUT_AUDIENCE,
    },
  };
}

/** Every endpoint the contract fixes, for one Playout address. */
export interface PlayoutEndpoints {
  readonly address: string;
  readonly jwksUrl: string;
  readonly tokenUrl: string;
  readonly refreshUrl: string;
  readonly channelsUrl: string;
  readonly revokedUrl: string;
}

/**
 * `DESKTOP-APPS-01-A` A1 — **THE ONE DERIVATION of the contract's endpoints from a Playout
 * address**: the address normalised (no trailing slash), then its fixed paths. The resolver above
 * uses it for the configured address; the connection check uses it for a CANDIDATE address, so a
 * check and the bridge it vouches for can never disagree about where the Playout is.
 *
 * Throws {@link PlayoutConfigError} for anything that is not an absolute http(s) URL.
 */
export function playoutEndpointsFor(addressRaw: string): PlayoutEndpoints {
  const address = requireAbsoluteUrl('address', addressRaw.trim()).replace(/\/+$/, '');
  return {
    address,
    jwksUrl: `${address}${JWKS_PATH}`,
    tokenUrl: `${address}${CONTRACT_PATHS.tokenUrl}`,
    refreshUrl: `${address}${CONTRACT_PATHS.refreshUrl}`,
    channelsUrl: `${address}${CONTRACT_PATHS.channelsUrl}`,
    revokedUrl: `${address}${CONTRACT_PATHS.revokedUrl}`,
  };
}

/**
 * 🔴 `DESKTOP-APPS-01-A` A2 — **PERSIST AN ADOPTED ISSUER as `playout.issuer`**, keeping every
 * other key the file holds.
 *
 * Written only by the bridge, only on the adoption a verified `station-admin` token earned — never
 * from anything a socket SENDS. After it, the value is an ordinary configured issuer: compared
 * byte for byte (ADR 0010 rule 1), and never re-adopted. It is cleared only when the Playout
 * ADDRESS is changed, which rewrites this file from outside the bridge (ADR 0011).
 *
 * Atomic (temp file + rename), so a crash mid-write leaves the old file, never a half one — a
 * present-but-unusable playout file is a HARD boot failure.
 */
export function persistAdoptedIssuer(configPath: string, issuer: string): void {
  const current = loadPlayoutFile(configPath) ?? {};
  writePlayoutFile(configPath, {
    ...current,
    auth: current.auth ?? 'playout',
    playout: { ...current.playout, issuer },
  });
}

/**
 * 🔴 `DESKTOP-APPS-01-A` — **THE PLAYOUT ADDRESS, as the desktop app writes it** (ADR 0011).
 *
 * The ONE writer of the Playout target, and it is not reachable over the control socket: the CLI
 * runs it as a one-shot (`--set-playout-address`, then exits), and the desktop app runs that CLI
 * from its own IPC command before restarting the bridge. So auth configuration stays out of the
 * socket's reach exactly as this file's header requires.
 *
 * It replaces the WHOLE `playout` group: a new Playout keeps nothing of the old one. That is what
 * clears an adopted issuer (A2) — the next `station-admin` sign-in adopts again — and with it any
 * endpoint override that named the old machine. Returns the normalised address it wrote.
 */
export function writePlayoutAddress(configPath: string, addressRaw: string): string {
  const { address } = playoutEndpointsFor(addressRaw);
  writePlayoutFile(configPath, { auth: 'playout', playout: { address } });
  return address;
}

/** Atomic (temp file + rename): a crash mid-write leaves the old file, never a half one. */
function writePlayoutFile(configPath: string, value: PlayoutFile): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tmp = `${configPath}.${String(process.pid)}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, configPath);
}
