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
