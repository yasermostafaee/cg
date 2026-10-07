import type { FixedLayerBank } from '@cg/shared-ipc';
import type { AuthCapabilities, AuthSessionState } from '../../src/shared/runtime-bridge.js';

/**
 * 🔴 `C-038` — **THE `auth` MEMBER FOR A HAND-BUILT `window.cg` STUB.**
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Most dom specs install a PARTIAL bridge — an object literal cast with `as unknown as`,
 * carrying only the members the surface under test reads. That is deliberate and it works
 * until a surface starts reading a member nobody's stub had, at which point every one of them
 * fails with the same unhelpful `Cannot read properties of undefined (reading 'state')`.
 *
 * `C-038` did exactly that: `useSelectedChannel` now asks who is signed in, because the
 * channel list is scoped to the principal. Twenty-five stubs went red at once, none of them
 * about auth.
 *
 * ⚠ **The remedy is to complete the stubs, NOT to make `useAuthSession` tolerate a missing
 * `window.cg.auth`.** A hook that shrugged at an absent bridge member would turn a real wiring
 * failure — a console whose bridge never exposed auth — into a surface that silently renders
 * as though auth were off. That is the `B-153` shape: a surface asserting a state the system
 * has not stated.
 *
 * ⭐ **The default is `off`, which is what these specs mean.** They were written against a
 * bridge that does not authenticate, and their assertions are the byte-identical baseline;
 * anything else would quietly change what they measure. A spec that wants a principal passes
 * one.
 */
export function authStub(state: AuthSessionState = { kind: 'off' }): {
  capabilities: () => AuthCapabilities;
  onCapabilitiesChanged: (handler: (next: AuthCapabilities | null) => void) => () => void;
  state: () => AuthSessionState;
  onStateChanged: (handler: (next: AuthSessionState) => void) => () => void;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
} {
  return {
    /*
      `DESKTOP-APPS-01` — what the bridge advertised. The QUIET answer, like everything here: a
      bridge that is not an installed station in first-run, in the mode the state implies.
    */
    capabilities: () => ({
      mode: state.kind === 'off' ? 'off' : 'playout',
      signInUrl: null,
      refreshUrl: null,
      contractVersion: null,
      setupPhase: null,
    }),
    onCapabilitiesChanged: () => () => undefined,
    state: () => state,
    // Constant state — nothing to emit, so the unsubscribe is a noop.
    onStateChanged: () => () => undefined,
    signIn: () =>
      Promise.reject(new Error('this stub does not authenticate — pass a state to authStub()')),
    signOut: () => Promise.resolve(),
  };
}

/** A signed-in `operator` principal permitted on `channels`. */
export function signedInStub(
  name: string,
  channels: readonly number[],
  roles: readonly string[] = ['operator', 'viewer'],
): AuthSessionState {
  return {
    kind: 'signed-in',
    principal: {
      name,
      sub: `sub-${name}`,
      roles: [...roles],
      // The raw claim is NOT what the strip reads; `permittedChannels` is the bridge's answer.
      channels: channels.map((channel) => ({ host: '127.0.0.1', channel })),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      nameTruncated: false,
    },
    permittedChannels: channels,
  };
}

/**
 * 🔴 `C-038` — **FILL THE BRIDGE MEMBERS THE CHANNEL LIST NEEDS, without overwriting any the
 * stub already provides.**
 *
 * `useCanOperate` asks which channel the console is scoped to, so every surface carrying an
 * operator control now reads `fixedLayers.config`, `channelSettings.get` and `auth.state`.
 * Most hand-built stubs supply one or two of those and not the third.
 *
 * ⚠ **It fills only what is ABSENT.** A spec that provides its own `fixedLayers` keeps it —
 * silently replacing a member a test deliberately set would make the test measure this file
 * instead of its subject, which is worse than the failure it is fixing.
 *
 * ⭐ The defaults are the QUIET ones: auth off, no bank, no declared channel settings. That
 * is the pre-`C-038` console, so a spec filled by this helper measures exactly what it
 * measured before.
 */
/**
 * `RELEASE-0112-01` (`R-085`) — CG Bridge's own session, the QUIET answer: `off`, and a bridge too old
 * to know `bridgeSession.engines` (it rejects, so the console shows the primary alone). A stub that
 * fills this measures exactly what it measured before the engines existed.
 */
export function bridgeSessionStub(): {
  state: () => Promise<{ state: 'off' }>;
  onChanged: () => () => void;
  signIn: () => Promise<{ ok: false; failure: 'unexpected' }>;
  engines: () => Promise<never>;
  onEnginesChanged: () => () => void;
  signInBackup: () => Promise<{ ok: false; failure: 'unexpected' }>;
} {
  return {
    state: () => Promise.resolve({ state: 'off' }),
    onChanged: () => () => undefined,
    signIn: () => Promise.resolve({ ok: false, failure: 'unexpected' }),
    engines: () => Promise.reject(new Error('unknown channel: bridgeSession.engines')),
    onEnginesChanged: () => () => undefined,
    signInBackup: () => Promise.resolve({ ok: false, failure: 'unexpected' }),
  };
}

/**
 * `RELEASE-0113-01` (`R-089`) — where each channel's lines go on the backup engine, the QUIET answer: no
 * server B, so no surface says anything about it. A stub that fills this measures exactly what it
 * measured before the mapping existed.
 */
export function backupChannelsStub(): {
  state: () => Promise<{ backup: null }>;
  onChanged: () => () => void;
  setEntries: () => Promise<{ ok: false; error: string }>;
} {
  return {
    state: () => Promise.resolve({ backup: null }),
    onChanged: () => () => undefined,
    setEntries: () => Promise.resolve({ ok: false, error: 'this stub has no backup engine' }),
  };
}

export function fillBridgeStub<T extends object>(stub: T): T {
  const cg = stub as Record<string, unknown>;
  cg['auth'] ??= authStub();
  cg['fixedLayers'] ??= {
    config: () => Promise.resolve(null),
    onConfigChanged: () => () => undefined,
    state: () => Promise.resolve([]),
    onStateChanged: () => () => undefined,
  };
  fillBankList(cg['fixedLayers'] as Record<string, unknown>);
  cg['channelSettings'] ??= {
    get: () => Promise.resolve({ settings: [], observed: [] }),
    onChanged: () => () => undefined,
  };
  /*
    `R-062` gap 2 — the discovery answer. EMPTY is the quiet default for the same reason as the
    rest: an answer that declares nothing is read by `channelIds` as "fall back to the bank and
    settings", so a filled stub measures exactly what it measured before the call existed.
  */
  cg['stationChannels'] ??= {
    list: () => Promise.resolve({ channels: [] }),
    onChanged: () => () => undefined,
  };
  cg['setup'] ??= setupStub();
  /*
    `FIELD-FIXES-01` K — the header's every-channel silence reads the live-layers ledger now. EMPTY
    is the quiet default: a stub that seats nothing measures exactly what it measured before.
  */
  cg['liveLayers'] ??= {
    state: () => Promise.resolve([]),
    onStateChanged: () => () => undefined,
    onPlateReleased: () => () => undefined,
  };
  /*
    `MEDIA-PLATES-01` — Look inputs reads each seated clip's transport state. NO CLIPS is the quiet
    default, filled even into a `liveLayers` a spec states itself (the `fillBankList` rule: a spec's
    own members are kept, and only the absent ones are completed).
  */
  const liveLayers = cg['liveLayers'] as Record<string, unknown>;
  liveLayers['mediaState'] ??= (): Promise<unknown[]> => Promise.resolve([]);
  liveLayers['onMediaStateChanged'] ??= (): (() => void) => () => undefined;
  /*
    …and it reads them through `useBridgeSnapshot`, which asks the LINK whether a pull may be made.
    LIVE is the quiet answer for a stub that states no link: every request a spec answers is one a
    live bridge would be asked.
  */
  cg['link'] ??= {
    status: () => 'live',
    onStatusChanged: () => () => undefined,
  };
  /*
    `MULTI-CHANNEL-01` §2 F — `useCanOperate` now asks whether a covered-set lock covers the
    selected channel, so every surface with an operator control reads the lock. RELEASED is the
    quiet answer: a filled stub measures exactly what it measured before the question existed.
  */
  cg['lock'] ??= {
    state: () => Promise.resolve({ engaged: false }),
    onStateChanged: () => () => undefined,
  };
  // `DESKTOP-APPS-01-D` j — no strays: the quiet answer, so a filled stub measures what it did.
  cg['strays'] ??= {
    list: () => Promise.resolve([]),
    onChanged: () => () => undefined,
    takeOffAir: () => Promise.resolve({ ok: false }),
  };
  // `PLAYOUT-FEATURES-01` D — no license read: the quiet answer (nothing is marked for it).
  // `PLAYOUT-FEATURES-01` E — no meters: the meter sits at the floor.
  cg['meters'] ??= { onReading: () => () => undefined };
  cg['license'] ??= {
    state: () => Promise.resolve({ license: null }),
    onChanged: () => () => undefined,
  };
  /*
    `RELEASE-0112-01` (`R-085`) — each engine's session. The quiet default is a bridge too old to know
    the channel: `engines` REJECTS, and the console shows the primary alone — so a filled stub measures
    exactly what it measured before. Filled into a `bridgeSession` a spec states itself (only the absent
    members).
  */
  cg['bridgeSession'] ??= bridgeSessionStub();
  const bridgeSession = cg['bridgeSession'] as Record<string, unknown>;
  const quiet = bridgeSessionStub();
  bridgeSession['engines'] ??= quiet.engines;
  bridgeSession['onEnginesChanged'] ??= quiet.onEnginesChanged;
  bridgeSession['signInBackup'] ??= quiet.signInBackup;
  // `RELEASE-0113-01` (`R-089`) — no server B: the quiet answer, so a filled stub measures what it did.
  cg['backupChannels'] ??= backupChannelsStub();
  /*
    `CENTRAL-BRIDGE-01` — the restore-notice dismiss buttons dismiss on the BRIDGE too. Filled into
    a `stack` a spec states itself (only the absent member), answering as a bridge with nothing left
    to dismiss does.
  */
  const stack = cg['stack'] as Record<string, unknown> | undefined;
  if (stack !== undefined) {
    stack['dismissRestoreReport'] ??= (): Promise<{ ok: boolean }> =>
      Promise.resolve({ ok: false });
  }
  return stub;
}

/**
 * 🔴 `MULTI-CHANNEL-01` — **THE STATION'S BANKS, FOR A STUB THAT STATES ONE BANK.**
 *
 * The console reads every declared bank (`fixedLayers.banks`) where it read the one
 * (`fixedLayers.config`). A spec written against the single-bank read states its bank through
 * `config` / `onConfigChanged`, and that statement is what it means: a station with THAT bank. So
 * the plural members are DERIVED from the spec's own singular ones — `banks()` answers `[bank]`
 * (or `[]` for `null`), `onBanksChanged` relays `onConfigChanged` the same way — and a filled
 * stub measures exactly what it measured before, on the station it already described.
 *
 * ⚠ **It fills only what is ABSENT**, like everything here: a spec that states its banks keeps
 * them. And it completes the stub rather than making the hook tolerate a missing member — this
 * file's own rule, for this file's own reason.
 */
export function fillBankList(fixedLayers: Record<string, unknown>): void {
  const config = fixedLayers['config'] as (() => Promise<FixedLayerBank | null>) | undefined;
  const onConfigChanged = fixedLayers['onConfigChanged'] as
    | ((handler: (bank: FixedLayerBank | null) => void) => () => void)
    | undefined;
  fixedLayers['banks'] ??= (): Promise<FixedLayerBank[]> =>
    config === undefined
      ? Promise.resolve([])
      : config().then((bank) => (bank === null ? [] : [bank]));
  fixedLayers['onBanksChanged'] ??= (handler: (banks: FixedLayerBank[]) => void): (() => void) =>
    onConfigChanged === undefined
      ? () => undefined
      : onConfigChanged((bank) => handler(bank === null ? [] : [bank]));
  fixedLayers['setBanks'] ??= (): Promise<{ ok: boolean }> => Promise.resolve({ ok: true });
}

/**
 * `DESKTOP-APPS-01` — the `setup` member, QUIET: nothing to check, no route, the Playout's list
 * absent, and no desktop door (a spec is not CG Control, so the Playout address cannot be set).
 */
export function setupStub(): {
  check: () => Promise<{ lines: []; localAddress: null; bridge: null }>;
  bridgeAddressFor: () => string | null;
  routeAddress: () => Promise<{ address: null }>;
  catalogue: () => Promise<{ rows: null }>;
  channelOccupancy: () => Promise<{ state: 'unknown'; layers: [] }>;
  canSetPlayoutAddress: () => boolean;
  setPlayoutAddress: () => Promise<string>;
  bridgeOverride: () => string | null;
  forgetStation: () => boolean;
} {
  return {
    // `B-317` — a check's answer says where it ran; this stub has no CG Bridge, so nowhere.
    check: () => Promise.resolve({ lines: [], localAddress: null, bridge: null }),
    bridgeAddressFor: () => null,
    routeAddress: () => Promise.resolve({ address: null }),
    catalogue: () => Promise.resolve({ rows: null }),
    channelOccupancy: () => Promise.resolve({ state: 'unknown', layers: [] }),
    canSetPlayoutAddress: () => false,
    setPlayoutAddress: () => Promise.reject(new Error('this stub is not CG Control')),
    // `CENTRAL-BRIDGE-01` — no station record here: nothing kept, nothing to forget.
    bridgeOverride: () => null,
    forgetStation: () => false,
  };
}
