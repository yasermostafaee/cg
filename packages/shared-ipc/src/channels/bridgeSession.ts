import { z } from 'zod';
import { defineChannel } from '../channel.js';
import { definePublishChannel } from '../publish.js';
import { SIGN_IN_FAILURES } from '../playout-session.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D7, the Playout team's rule 8) — **CG BRIDGE'S OWN PLAYOUT SESSION.**
 *
 * There is no service or machine token on the Playout: CG Bridge signs in like a user (D1), as the
 * station's own account (`cg-admin`), and keeps the rotating refresh token — persisted atomically
 * before it is used, because the token is single-use and a crash between receiving a new one and
 * saving it means signing in again with the password. The password is never stored: a station admin
 * gives it once, from any console, and the bridge drops it after that one request. Its access token
 * is the bearer for the bridge's own Playout reads (D4, D9, D10, D11).
 *
 *   - `off` — this bridge has no Playout (a development bridge).
 *   - `waiting` — a saved session exists, and the Playout has not answered its refresh yet.
 *   - `needs-admin` — no session, or the Playout refused the saved one: every console says
 *     {@link BRIDGE_NEEDS_ADMIN_LINE}, and a station admin can sign the bridge in.
 *   - `signed-in` — the bridge holds a session (`name` is its account's, from the verified token).
 *   - `refused` — `CENTRAL-BRIDGE-01-A` (Playout `2.9.2` §2): the Playout refused the refresh BEFORE
 *     using the token (`cg_not_licensed`, `no_cg_access`, a disabled account). The token is kept and
 *     asked again about every minute; `message` is the Playout's own reason, shown as it is.
 */
export const BRIDGE_SESSION_STATES = [
  'off',
  'waiting',
  'needs-admin',
  'signed-in',
  'refused',
] as const;

export type BridgeSessionStateName = (typeof BRIDGE_SESSION_STATES)[number];

export const BridgeSessionStateSchema = z.object({
  state: z.enum(BRIDGE_SESSION_STATES),
  /** The account the bridge is signed in as — `signed-in` only. */
  name: z.string().min(1).optional(),
  /** `refused` — the Playout's own reason, as it sent it (one line). */
  message: z.string().min(1).max(300).optional(),
  /**
   * `RELEASE-0112-01` — `refused`: the contract's CODE for it (`cg_not_licensed` reads as "CG not
   * licensed on this engine"). Optional and additive: a console that does not know it ignores it.
   */
  failure: z.enum(SIGN_IN_FAILURES).optional(),
});

export type BridgeSessionState = z.infer<typeof BridgeSessionStateSchema>;

/** The one line every console shows while the bridge has no session (rule 8). */
export const BRIDGE_NEEDS_ADMIN_LINE = 'CG Bridge needs a station admin to sign in';

/** The account the bridge signs in as, unless the admin names another. */
export const BRIDGE_SESSION_DEFAULT_ACCOUNT = 'cg-admin';

/** Pull the session's state (a console's initial read). Station-wide: one bridge, one session. */
export const BridgeSessionStateChannel = defineChannel(
  'bridgeSession.state',
  z.void(),
  BridgeSessionStateSchema,
);

/** Pushed whenever the session's state changes. */
export const BridgeSessionStateChangedChannel = definePublishChannel(
  'bridgeSession.state-changed',
  BridgeSessionStateSchema,
);

/**
 * A station admin signs the bridge in: the bridge calls D1 itself with these, keeps the refresh
 * token and drops the password. `station-admin` only; the answer carries the contract's failure
 * CODE (never the Playout's text), which the console words as it words its own sign-in.
 *
 * ⚠ The password crosses this socket once, as an operator's own password crosses the network to
 * the Playout's D1 (the Playout serves consoles over plain HTTP `8080`; D9 of the design). It is
 * never written to the audit, a log or a file.
 */
export const BridgeSessionSignInChannel = defineChannel(
  'bridgeSession.sign-in',
  z.object({
    username: z.string().min(1).max(128),
    password: z.string().min(1).max(512),
  }),
  z.object({
    ok: z.boolean(),
    failure: z.enum(SIGN_IN_FAILURES).optional(),
    /** `CENTRAL-BRIDGE-01-A` — `cg_not_licensed`: the Playout's own message, shown as it is. */
    message: z.string().min(1).max(300).optional(),
  }),
);

// ── `RELEASE-0112-01` (`R-085`) — ONE PLAYOUT SESSION PER ENGINE ──────────────────────────────────
//
// A pair is two ENGINES — each with its own CasparCG core, its own API, its own ES256 key and users —
// listed by one Playout client (`RELEASE-0112-01-B`). CG Bridge keeps a session on EACH, signed in with
// that engine's own account. These channels are ADDITIVE: `bridgeSession.state` and
// `bridgeSession.sign-in` keep their shapes (the primary engine's), so a console that does not know
// these works as before, and one that asks a bridge that does not know them shows the primary alone.

/** The two engines of a pair, by the server each one's core is. */
export const ENGINES = ['primary', 'backup'] as const;
export type Engine = (typeof ENGINES)[number];

/** What an operator surface calls each engine (the UI words, `RELEASE-0112-01-B` B2). */
export const ENGINE_LABEL: Readonly<Record<Engine, string>> = {
  primary: 'Primary engine',
  backup: 'Backup engine',
};

/** The server label each engine's core is declared as (the status bar's `PRIMARY A` / `BACKUP B`). */
export const ENGINE_SERVER: Readonly<Record<Engine, 'A' | 'B'>> = { primary: 'A', backup: 'B' };

/**
 * An engine's CG Bridge session, as every surface says it — decided in ONE place, the bridge's
 * `engineState`, from the session, the last sign-in's code, the license, whether the API answers, the
 * core's AMCP and the guard (`B-313`):
 *
 *   - `off` — no Playout, or no session kept for it (a development bridge);
 *   - `waiting` — a saved session, its refresh not answered yet;
 *   - `signed-in` — `name` is the account;
 *   - `needs-admin` — a station admin signs it in;
 *   - `not-licensed` — the engine answered `403 cg_not_licensed`, or its license reads not licensed;
 *   - `refused` — the engine refused before using the token; `message` is its own reason;
 *   - `amcp-pending` — signed in, and the engine's core has not let this machine's AMCP in (its admin's
 *     «تأیید»), or that core is down;
 *   - `unreachable` — the engine's API does not answer;
 *   - `core-held` — the backup only: another CG Bridge drives its core, so this one sends it nothing;
 *   - `core-shared` — the primary only: another CG Bridge drives its core too; nothing is held.
 */
export const ENGINE_STATES = [
  'off',
  'waiting',
  'signed-in',
  'needs-admin',
  'not-licensed',
  'refused',
  'amcp-pending',
  'unreachable',
  'core-held',
  'core-shared',
] as const;
export type EngineState = (typeof ENGINE_STATES)[number];

export const EngineLineSchema = z.object({
  engine: z.enum(ENGINES),
  /** The engine's API address (`http://host:port`), or `null` when none is known. */
  address: z.string().min(1).nullable(),
  state: z.enum(ENGINE_STATES),
  /** `signed-in` — the account. */
  name: z.string().min(1).optional(),
  /** `refused` / `not-licensed` — the engine's own words; `core-*` — where the other CG Bridge is. */
  message: z.string().min(1).max(300).optional(),
  /** The engine's `GET /api/v1/system/version`, or `null` — not served or not read. */
  version: z.string().min(1).nullable(),
});
export type EngineLine = z.infer<typeof EngineLineSchema>;

export const EngineSessionsSchema = z.object({
  primary: EngineLineSchema,
  /** `null` — no server B is declared. */
  backup: EngineLineSchema.nullable(),
});
export type EngineSessions = z.infer<typeof EngineSessionsSchema>;

/** Pull each engine's session (a console's initial read). */
export const BridgeEnginesChannel = defineChannel(
  'bridgeSession.engines',
  z.void(),
  EngineSessionsSchema,
);

/** Pushed whenever either engine's session changes. */
export const BridgeEnginesChangedChannel = definePublishChannel(
  'bridgeSession.engines-changed',
  EngineSessionsSchema,
);

/**
 * A station admin signs CG Bridge in on the BACKUP engine, with the backup engine's own account and
 * password (`R-085`). The answer's shape is {@link BridgeSessionSignInChannel}'s. Its own channel, so a
 * bridge that does not know it refuses it rather than signing the primary in with the backup's password.
 */
export const BridgeBackupSignInChannel = defineChannel(
  'bridgeSession.backup.sign-in',
  BridgeSessionSignInChannel.request,
  BridgeSessionSignInChannel.response,
);

/**
 * 🔴 `RELEASE-0113-01` Part D — **WHERE EACH ENGINE'S PASSWORD IS READ, IN THE PLAYOUT TEAM'S OWN SENTENCE**
 * (`PLAYOUT-CG-RESPONSE-0112-PAIR-v1.md` §5): their «اتصال به CG Control» page shows the accounts of the engine
 * the Playout client is connected to NOW, so the way to another engine's password starts by connecting the
 * client to it. Rendered inside a `<bdi>` after an English lead ({@link enginePasswordLead}), never joined
 * into one text node with it (golden rule 11).
 */
export const ENGINE_PASSWORD_WHERE =
  'روی همان موتور: کلاینتِ Playout را به آن وصل کنید، سپس تنظیمات ← استودیوی کانفیگ ← (سرورِ همان موتور) ← اتصال به CG Control';

/** The dialog line's English lead, naming the account offered (`cg-bridge` from `2.9.4`, delta C3). */
export function enginePasswordLead(account: string): string {
  return `Each engine's ${account} password:`;
}

/** The account a sign-in is offered, by the engine's version (`RELEASE-0112-01-C` C3). */
export const CG_BRIDGE_ACCOUNT = 'cg-bridge';

/**
 * 🔴 `RELEASE-0112-01-C` C3 (`R-086`) — **WHICH ACCOUNT THE SIGN-IN OFFERS FOR AN ENGINE.** `cg-bridge`
 * when THAT engine's version is `2.9.4` or newer — from `2.9.4` its meters carry every CG-licensed
 * programme channel (their §3) — and `cg-admin` otherwise: `2.9.2` has no such account, and `2.9.3`'s gets
 * no meter data. A version not read is `cg-admin`. Any account the admin types is accepted.
 */
export function suggestedBridgeAccount(version: string | null): string {
  const m = version === null ? null : /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (m === null) return BRIDGE_SESSION_DEFAULT_ACCOUNT;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const atLeast294 = major > 2 || (major === 2 && (minor > 9 || (minor === 9 && patch >= 4)));
  return atLeast294 ? CG_BRIDGE_ACCOUNT : BRIDGE_SESSION_DEFAULT_ACCOUNT;
}

/**
 * 🔴 **AN ENGINE'S STATE IN WORDS — the one spelling** for the dialog and the check's line (the
 * status bar's chip is {@link engineChipText}, its sentence this).
 */
export function engineStateText(line: Pick<EngineLine, 'state' | 'name' | 'message'>): string {
  switch (line.state) {
    case 'off':
      return 'Not set.';
    case 'waiting':
      return 'Waiting for the engine to answer.';
    case 'signed-in':
      return line.name !== undefined ? `Signed in as ${line.name}.` : 'Signed in.';
    case 'needs-admin':
      return 'Needs a station admin to sign in.';
    case 'not-licensed':
      return 'CG not licensed on this engine.';
    case 'refused':
      return `Refused: ${line.message ?? 'the engine refuses to renew its session.'}`;
    case 'amcp-pending':
      // `RELEASE-0113-01` Part D — what to do, where: «تأیید» on THAT engine's page, with the client connected to it.
      return (
        `AMCP waits: press \u2067تأیید\u2069 on this engine's \u2067اتصال به CG Control\u2069, ` +
        'with the Playout client connected to this engine — or its CasparCG is down.'
      );
    case 'unreachable':
      return "The engine's API does not answer.";
    case 'core-held':
      return `Another CG Bridge drives this engine's CasparCG${line.message !== undefined ? ` (${line.message})` : ''}; nothing is sent to it.`;
    case 'core-shared':
      return `Another CG Bridge also drives this engine's CasparCG${line.message !== undefined ? ` (${line.message})` : ''}.`;
  }
}

/** Does this engine's line need a person's attention? (The status bar chips these, and only these.) */
export function engineNeedsAttention(state: EngineState): boolean {
  return state !== 'off' && state !== 'signed-in' && state !== 'waiting';
}

/** The status bar's short chip for an engine, by its server label. */
export function engineChipText(server: 'A' | 'B', state: EngineState): string {
  switch (state) {
    case 'needs-admin':
      return `${server}: SIGN IN CG BRIDGE`;
    case 'not-licensed':
      return `${server}: CG NOT LICENSED`;
    case 'refused':
      return `${server}: CG BRIDGE REFUSED`;
    case 'amcp-pending':
      return `${server}: AMCP NOT APPROVED`;
    case 'unreachable':
      return `${server}: ENGINE UNREACHABLE`;
    case 'core-held':
      return `${server}: HELD — ANOTHER CG BRIDGE`;
    case 'core-shared':
      return `${server}: ANOTHER CG BRIDGE`;
    default:
      return server;
  }
}
