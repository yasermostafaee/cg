import type { AuthSessionState } from '../../src/shared/runtime-bridge.js';

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
  state: () => AuthSessionState;
  onStateChanged: (handler: (next: AuthSessionState) => void) => () => void;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
} {
  return {
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
export function fillBridgeStub<T extends object>(stub: T): T {
  const cg = stub as Record<string, unknown>;
  cg['auth'] ??= authStub();
  cg['fixedLayers'] ??= {
    config: () => Promise.resolve(null),
    onConfigChanged: () => () => undefined,
    state: () => Promise.resolve([]),
    onStateChanged: () => () => undefined,
  };
  cg['channelSettings'] ??= {
    get: () => Promise.resolve({ settings: [], observed: [] }),
    onChanged: () => () => undefined,
  };
  return stub;
}
