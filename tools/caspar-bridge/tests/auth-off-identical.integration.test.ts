import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridge, type BridgeHandle } from '../src/index.js';
import type { FakePlayout } from './support/fake-playout.js';
import { deadConnection, openClient, startAuthedBridge } from './support/auth-harness.js';

/**
 * 🔴 `C-037` acceptance — **WHEN auth is OFF THEN behaviour is byte-identical to today — every
 * existing integration test green and unchanged — and `bridge.capabilities` says so.  ·  WHEN
 * the bridge binds a non-loopback host with auth OFF THEN the existing warning prints (owner
 * default; see ADR 0010 rule 11)**
 *
 * ── WHAT THIS FILE IS FOR, and why it is not the census next door ───────────
 *
 * `auth-gate.integration.test.ts` walks the route TABLE and proves `refusedByAuth(route, 'off')`
 * is false for all sixty. That is a claim about a predicate. This file is the claim about the
 * SOCKET: a bridge created the way every other suite in this workspace creates one — no
 * `playout` option at all — still answers, still publishes, and now says something on stderr it
 * did not say before.
 *
 * ── RED BEFORE, GREEN AFTER ─────────────────────────────────────────────────
 *
 * Split, and the split is the honest answer rather than a tidy one:
 *
 * - §1-§3 (the identity claims) were **GREEN before this change** and are green after. That is
 *   the point of them — they are the regression net for "byte-identical", and a net that was
 *   red before would be measuring something else. They are written HERE, as their own file, so
 *   the claim has a name; the wider evidence for it is that every pre-existing integration
 *   suite in `tools/caspar-bridge/tests/` still passes unchanged.
 * - §4 (the LAN-EXPOSED warning) was **RED before this change, for the strongest reason: there
 *   was no such line.** The acceptance bullet says "the existing warning prints", and what was
 *   measured is that the two warnings that existed are about the TEMPLATE HTTP SERVER on a
 *   different port — one of them ending _"Control WebSocket remains loopback-bound"_, a
 *   sentence `--host 0.0.0.0` makes false. `bridge.ts` records the same finding at the site.
 */

let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;
let restoreStderr: (() => void) | null = null;

afterEach(async () => {
  /*
    Restored FIRST and in the same hook as the closes, not in a second `afterEach`. Hook
    ORDER between two sibling `afterEach`es is a vitest detail nobody should have to know,
    and a spy left installed while the next file's bridge boots would swallow output that
    has nothing to do with this suite.
  */
  restoreStderr?.();
  restoreStderr = null;
  await handle?.close();
  handle = null;
  await playout?.stop();
  playout = null;
});

/**
 * Capture `process.stderr.write` for the life of one test.
 *
 * ⚠ The spy REPLACES the write, so the captured lines do not also reach the terminal. That is
 * deliberate: a bridge booted against `deadConnection()` writes connection noise, and a suite
 * whose subject is one warning should not print a page of it.
 */
function captureStderr(): { writes: () => readonly string[] } {
  const written: string[] = [];
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown): boolean => {
    written.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  restoreStderr = () => {
    spy.mockRestore();
  };
  return { writes: () => written };
}

/**
 * The warning, matched by the FACT it states rather than by its sentence.
 *
 * ⚠ Two decisions here, both load-bearing:
 *
 * 1. **Substrings, not the whole line.** The wording was read out of `bridge.ts` before this was
 *    written; asserting the whole sentence would redden this spec on a rewording that keeps
 *    every fact, which teaches the next author to delete the spec rather than read it.
 * 2. **Per WRITE, not over the joined output.** `LAN-EXPOSED` is ALSO written by the template
 *    HTTP server's own warning (`bridge.ts` and `caspar-runtime.ts` both), and `auth OFF`
 *    appears in other prose. Joining every chunk into one blob would let those two unrelated
 *    lines fake a match for a warning that never printed. This warning is about a COMBINATION,
 *    so the match must be a combination inside ONE write.
 */
function controlSocketExposureWarnings(writes: readonly string[]): string[] {
  return writes.filter((w) => w.includes('LAN-EXPOSED') && w.includes('auth OFF'));
}

/**
 * A handful of representative channels, one per family, each with the payload its own request
 * schema accepts (`z.void()` for four of them, `z.object({})` for `audit.health`).
 *
 * ⚠ A SAMPLE is the right instrument here and the wrong one next door. "Auth off refuses
 * nothing" is a claim about all sixty routes and is censused in `auth-gate.integration.test.ts`
 * over the route table. What this file adds is that the claim survives the whole round trip —
 * socket, frame parse, gate, handler, response — which can only be pressed one channel at a
 * time, so it presses five rather than pretending to press sixty.
 */
const REPRESENTATIVE_CHANNELS: readonly (readonly [string, unknown])[] = [
  ['stack.snapshot', undefined],
  ['connections.config', undefined],
  ['lock.state', undefined],
  ['templates.list', undefined],
  ['audit.health', {}],
];

describe('C-037 — auth OFF is the bridge that was already there', () => {
  it('a bridge created with NO `playout` option answers every representative channel', async () => {
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const client = await openClient(handle);

    for (const [index, [channel, payload]] of REPRESENTATIVE_CHANNELS.entries()) {
      const res = await client.ask(`r${String(index)}`, channel, payload);
      expect(res.error, `${channel} was refused on a bridge with auth OFF`).toBeUndefined();
      expect(res.payload, `${channel} answered with no payload at all`).toBeDefined();
    }

    /*
      POSITIVE CONTROL for the five `toBeUndefined()`s above. Without it, "no error" would
      also be what a socket that had quietly stopped reporting errors looks like — the vacuous
      shape this repo keeps meeting. An unknown channel must still come back as a refusal, so
      the absence of one on the five above is a fact about the gate rather than about the
      instrument.
    */
    const bogus = await client.ask('control', 'stack.no-such-channel', undefined);
    expect(
      typeof bogus.error,
      'the error path is dead — even an unknown channel answered clean',
    ).toBe('string');
  });

  it('`handle.auth` is `off` with no Playout, and there is no verifier at all', async () => {
    handle = await createBridge({ port: 0, connection: deadConnection() });

    /*
      Asserted as a LITERAL rather than against the exported `AUTH_OFF` constant. Comparing the
      resolved settings to the constant they are built from would pass whatever either became;
      the literal is the decision.
    */
    expect(handle.auth).toEqual({ mode: 'off', playout: null });
    /*
      ⚠ `null`, not "a verifier that always says yes". There is no object to misconfigure, no
      JWKS to fetch and no background poll running — auth OFF costs nothing at runtime, which
      is half of what "byte-identical" means.
    */
    expect(handle.playoutAuth).toBeNull();
  });

  it('an `auth` frame is ANSWERED honestly — `mode: off`, not ignored and not an error', async () => {
    /*
      🔴 WHY AN ANSWER AT ALL. A console that presents a token to a bridge that does not
      authenticate is not a console in error: it is a console that has been pointed at a
      development bridge. Refusing would tell it something false; SILENCE would be worse still,
      because the frame is correlated by id and the console would sit waiting for a reply that
      was never coming — a sign-in screen that hangs forever. It is told `off`, which is exactly
      what `bridge.capabilities` already told it, and it stops offering a sign-in.
    */
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const client = await openClient(handle);

    const res = await client.authenticate('t', 'whatever-this-console-happened-to-hold');
    expect(
      res.error,
      'an `auth` frame to a bridge with auth OFF was treated as an error',
    ).toBeUndefined();
    expect(res.payload).toEqual({ mode: 'off', principal: null });
  });

  it('…and the same frame on an auth-ON bridge is REFUSED — the control for that answer', async () => {
    /*
      POSITIVE CONTROL for the spec above, and it controls for a specific vacuity: `mode: off`
      would also be what you get if the `auth` frame were never routed anywhere and some default
      reply came back. Here the identical garbage token reaches a real verifier and is refused,
      which proves the frame really does travel the `handleAuthFrame` path — so the OFF answer
      is a decision taken there, not a fallback taken somewhere else.
    */
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(handle);

    const res = await client.authenticate('t', 'whatever-this-console-happened-to-hold');
    expect(typeof res.error, 'an auth-ON bridge accepted a token that is not one').toBe('string');
    expect(res.payload).toBeUndefined();
  });

  it('publishes flow freely with auth OFF — the second door is open when auth is', async () => {
    /*
      The mirror image of `auth-gate.integration.test.ts`'s publish-gate spec, and deliberately
      the SAME provocation and the same wait so the pair reads as one measurement: there, a
      never-authenticated socket receives nothing; here, a socket on a bridge with auth OFF
      receives what it always did. `lock.engage` is driven straight on the runtime so the
      publish genuinely fires rather than being an echo of this client's own request.
    */
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const client = await openClient(handle);

    handle.runtime.engage('1234');
    await new Promise((r) => setTimeout(r, 120));

    expect(
      client.publishes().map((f) => (f.type === 'publish' ? f.channel : '')),
      'a socket on a bridge with auth OFF was cut off from state it has always had',
    ).toContain('lock.state-changed');
  });
});

describe('C-037 / ADR 0010 rule 11 — a LAN-exposed control socket with auth OFF says so', () => {
  it('🔴 THE WARNING: binding `0.0.0.0` with auth OFF writes it to stderr', async () => {
    const capture = captureStderr();
    handle = await createBridge({ host: '0.0.0.0', port: 0, connection: deadConnection() });

    const warnings = controlSocketExposureWarnings(capture.writes());
    expect(warnings, 'a LAN-exposed unauthenticated control socket said nothing').toHaveLength(1);
    // The address is part of the fact: WHICH socket is exposed, not merely that one is.
    expect(warnings[0]).toContain(`0.0.0.0:${String(handle.port)}`);
  });

  it('a LOOPBACK bind with auth OFF writes no such warning — control (a)', async () => {
    /*
      POSITIVE CONTROL (a). It controls for the spec above passing on SOME OTHER stderr line: a
      bridge booted against `deadConnection()` writes connection noise, and a match built out of
      that noise would fire here too. It does not, so the match above is the warning.
    */
    const capture = captureStderr();
    handle = await createBridge({ host: '127.0.0.1', port: 0, connection: deadConnection() });

    expect(
      controlSocketExposureWarnings(capture.writes()),
      'a loopback bridge warned about an exposure it does not have',
    ).toEqual([]);

    /*
      …and the control's own control, because "nothing was captured" is exactly what a spy that
      was never installed looks like. A negative observation needs a live instrument: this write
      goes through the same spy, at the same point in the test, and must come back.
    */
    process.stderr.write('[spec] the stderr capture is live\n');
    expect(
      capture.writes().some((w) => w.includes('[spec] the stderr capture is live')),
      'the stderr spy captured nothing at all — the loopback result above is void',
    ).toBe(true);
  });

  it('a NON-LOOPBACK bind with auth ON writes no such warning — control (b)', async () => {
    /*
      POSITIVE CONTROL (b), and it is the one that matters most. The warning is about the
      COMBINATION — exposed AND unauthenticated — so a spec that only varied the HOST would stay
      green if the `playoutAuth === null` half of the condition were deleted, and the bridge
      would then shout at every authenticated station on the plant. Here the host is identical
      to the failing case and only auth differs.
    */
    const capture = captureStderr();
    const started = await startAuthedBridge({ host: '0.0.0.0', port: 0 });
    handle = started.handle;
    playout = started.playout;

    expect(
      controlSocketExposureWarnings(capture.writes()),
      'an AUTHENTICATED station was warned that it is unauthenticated',
    ).toEqual([]);
  });
});
