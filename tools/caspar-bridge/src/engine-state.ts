import {
  AMCP_TRUST_WINDOW_MS,
  type BridgeSessionState,
  type EngineState,
  type SignInFailure,
} from '@cg/shared-ipc';

/**
 * 🔴 `RELEASE-0112-01` (`R-085`) — **AN ENGINE'S CG BRIDGE SESSION, IN ONE WORD — decided here and
 * nowhere else.** The dialog, the status bar, the check's line and `/health` read this answer; none of
 * them re-derives it (golden rule 6). The inputs are the facts each engine has, all held in memory:
 *
 *   - the session's own state and the last sign-in's failure code;
 *   - the engine's license, as last read with that engine's own token (`null`: not read);
 *   - whether the engine's API answered its last token-free read (`null`: not read yet);
 *   - whether its core's AMCP is up, and whether it is reached over the network at all — loopback
 *     needs no approval (`BH` 44), so a loopback core that is down is never "waiting for approval";
 *   - the guard's verdict (`B-313`): the backup's core held, or the primary's shared.
 *
 * The ORDER is the order of remedies: nothing configured; a core another bridge drives; an engine that
 * does not answer; a license that does not include CG; then the session itself; then AMCP.
 */
export interface EngineStateInputs {
  /** The engine is configured (a Playout; for the backup, a server B). */
  readonly configured: boolean;
  readonly session: BridgeSessionState;
  readonly lastSignInFailure: SignInFailure | null;
  /** The license's `licensed`, as last read with this engine's token; `null` — not read or not served. */
  readonly licensed: boolean | null;
  readonly reachable: boolean | null;
  /** The core's AMCP: up, down, or not known. */
  readonly amcpUp: boolean | null;
  /** The core is reached over the network (not this machine). */
  readonly amcpRemote: boolean;
  /** When the session last became signed in (epoch ms), for the trust window. */
  readonly signedInAtMs: number | null;
  readonly nowMs: number;
  /** `B-313` — the backup's core is driven by another CG Bridge at this address. */
  readonly coreHeldBy?: string | null;
  /** `B-313` — the primary's core is ALSO driven by another CG Bridge at this address. */
  readonly coreSharedWith?: string | null;
  /** The window AMCP is given after a sign-in before the line names the approval. */
  readonly trustWindowMs?: number;
}

export interface EngineVerdict {
  readonly state: EngineState;
  /** The engine's own words (`refused`, `not-licensed`), or where the other CG Bridge is (`core-*`). */
  readonly message?: string;
}

export function engineState(i: EngineStateInputs): EngineVerdict {
  if (!i.configured) return { state: 'off' };
  if (i.coreHeldBy !== undefined && i.coreHeldBy !== null) {
    return { state: 'core-held', message: i.coreHeldBy };
  }
  if (i.reachable === false) return { state: 'unreachable' };
  const s = i.session;
  const refusedUnlicensed = s.state === 'refused' && s.failure === 'cg_not_licensed';
  const signInUnlicensed = s.state !== 'signed-in' && i.lastSignInFailure === 'cg_not_licensed';
  if (refusedUnlicensed || signInUnlicensed || i.licensed === false) {
    return {
      state: 'not-licensed',
      ...(s.state === 'refused' && s.message !== undefined ? { message: s.message } : {}),
    };
  }
  if (s.state === 'off') return { state: 'off' };
  if (s.state === 'needs-admin') return { state: 'needs-admin' };
  if (s.state === 'refused') {
    return { state: 'refused', ...(s.message !== undefined ? { message: s.message } : {}) };
  }
  if (s.state === 'waiting') return { state: 'waiting' };
  // Signed in.
  if (i.coreSharedWith !== undefined && i.coreSharedWith !== null) {
    return { state: 'core-shared', message: i.coreSharedWith };
  }
  const window = i.trustWindowMs ?? AMCP_TRUST_WINDOW_MS;
  if (
    i.amcpRemote &&
    i.amcpUp === false &&
    i.signedInAtMs !== null &&
    i.nowMs - i.signedInAtMs >= window
  ) {
    return { state: 'amcp-pending' };
  }
  return { state: 'signed-in' };
}
