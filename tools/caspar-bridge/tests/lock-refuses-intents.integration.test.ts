import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  LOCK_ENGAGED_REFUSAL,
  parseWsFrame,
  serializeWsFrame,
  type ConnectionConfig,
  type WsFrame,
} from '@cg/shared-ipc';
import { buildRoutes, createBridge, refusedWhileLocked, type BridgeHandle } from '../src/index.js';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { track } from './support/harness.js';

/**
 * `B-229`, the half a renderer cannot do — **THE EXECUTING SIDE REFUSES WHILE LOCKED.**
 *
 * The bridge stored `#lock` and `#lockPin` and NOTHING consulted them. `lockState()`
 * answered questions about the lock; not one intent handler asked. So the lock was a
 * picture: the overlay drew a scrim, and the socket underneath it accepted `stack.take`,
 * `stack.clear-all` and everything else from anyone who could reach the port.
 *
 * 🔴 **A renderer-only fix would have been the very defect being fixed.** The trap in
 * `ui/focusTrap.ts` stops the operator's own keyboard, which is the reported symptom; it
 * cannot stop a SECOND browser on the LAN (the dev servers are LAN-visible by default,
 * `P-041`), a dialog left open over the scrim, or a stale render. A lock whose executing
 * side ignores it is not a lock — so both halves ship together, and this file is the one
 * that would still fail if the trap were perfect.
 *
 * ── THE CARVE-OUT QUESTION, ANSWERED (owner, 2026-09-06) ────────────────────
 *
 * **The lock refuses EVERYTHING — `CLEAR`, `CLEAR ALL` and `STOP` included — and the way
 * out is to UNLOCK.** The reasoning, which belongs beside the rule so nobody "harmonises"
 * it later: a lock is a DELIBERATE act with a KNOWN PIN. The operator who engaged it can
 * end it in the two seconds it takes to type four digits, so an emergency verb behind the
 * lock is two seconds away and not unreachable.
 *
 * That is what makes this different from `B-226`, where CLEAR is disabled by a SYSTEM
 * CONDITION the operator cannot undo — there, withholding the verb strands him, so the
 * verb stays. Same shape on screen, opposite situation underneath: `B-226` is "you cannot
 * fix this", the lock is "you already know how".
 *
 * ⚠ Falsified against the tree before it was written down: no documented emergency path,
 * operator guide sentence, or spec requires a verb to survive the lock. See
 * `specs/runtime-ui/spec.md`.
 */

let handle: BridgeHandle | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
});

/** Unreachable AMCP + ephemeral OSC bind — no fixed ports, no hanging on a server. */
function deadConnection(): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = track(new WebSocket(url), (w) => {
      w.close();
    });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** One request/response round-trip, returned as `{ payload, error }`. */
async function ask(
  ws: WebSocket,
  frames: WsFrame[],
  id: string,
  channel: string,
  payload: unknown,
): Promise<{ payload?: unknown; error?: string }> {
  ws.send(serializeWsFrame({ type: 'request', id, channel, payload }));
  await waitFor(() => frames.some((f) => f.type === 'response' && f.id === id));
  const resp = frames.find((f) => f.type === 'response' && f.id === id);
  if (resp?.type !== 'response') throw new Error('no response');
  return { payload: resp.payload, ...(resp.error ? { error: resp.error.message } : {}) };
}

/**
 * ⚠ **THE ASSERTION HAS TO NAME THE STRING, not just compare to the constant.**
 *
 * Written the obvious way — `expect(res.error).toBe(LOCK_ENGAGED_REFUSAL)` — these specs
 * PASSED against the unfixed bridge on their first run. Before the constant existed the
 * import resolved to `undefined`, and an unlocked bridge answers with no error, so the
 * comparison was `expect(undefined).toBe(undefined)`. A test that cannot fail is worse
 * than no test, and this one proved it out loud in its own red-first run.
 *
 * So the refusal is checked for being a non-empty STRING first, and only then for being
 * the shared one.
 */
function expectRefused(error: string | undefined, what: string): void {
  expect(typeof error, `${what}: expected a refusal, got no error at all`).toBe('string');
  expect(error, `${what}: refused with the wrong sentence`).toBe(LOCK_ENGAGED_REFUSAL);
}

async function openBridge(): Promise<{ ws: WebSocket; frames: WsFrame[] }> {
  handle = await createBridge({ port: 0, connection: deadConnection() });
  const ws = await connect(handle.url);
  const frames: WsFrame[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = parseWsFrame(data.toString());
    if (frame !== null) frames.push(frame);
  });
  return { ws, frames };
}

describe('B-229 — a locked bridge refuses operator intents', () => {
  it('🔴 THE BUG: `stack.take` is REFUSED while the lock is engaged', async () => {
    const { ws, frames } = await openBridge();

    // Before the lock: the channel is routed and answers with a PAYLOAD. This is the
    // positive control — without it, a refusal after locking could just be an unrouted
    // channel, and the test would pass for the wrong reason.
    const before = await ask(ws, frames, 'a', 'stack.take', { itemId: 'nope' });
    expect(before.error, 'the channel must be routed BEFORE the lock').toBeUndefined();
    expect(before.payload).toBeDefined();

    await ask(ws, frames, 'lock', 'lock.engage', { pin: '1234' });

    const after = await ask(ws, frames, 'b', 'stack.take', { itemId: 'nope' });
    expectRefused(after.error, 'a locked bridge accepted a take');
  });

  it('🔴 refuses the EMERGENCY verbs too — clear-all, stop-all, remove-all (owner)', async () => {
    // The carve-out the owner was asked about and declined. Asserted per verb rather than
    // once, because "the lock refuses everything" is a claim about each of them and a
    // single sample cannot make it — and because these are exactly the three someone will
    // later be tempted to exempt.
    const { ws, frames } = await openBridge();
    await ask(ws, frames, 'lock', 'lock.engage', { pin: '1234' });

    // Each with its OWN request payload: the bulk verbs take none by design (`B-122` — an
    // emergency control must not be handed a browser-resolved scope), and sending the
    // wrong shape would be refused as `invalid request` and read as a pass.
    const emergency: readonly [string, unknown][] = [
      ['stack.clear-all', undefined],
      ['stack.stop-all', undefined],
      ['stack.remove-all', undefined],
      ['stack.silence-all-live-plates', undefined],
      ['layers.clear', { channel: 1, layer: 10 }],
      ['playoutLayers.clear', { channel: 1, layer: 10 }],
    ];
    for (const [i, [channel, payload]] of emergency.entries()) {
      const res = await ask(ws, frames, `e${String(i)}`, channel, payload);
      expectRefused(res.error, channel);
    }
  });

  it('the refusal is ONE exported constant, and it is written for an operator', async () => {
    // The `R-017` discipline: the sentence the bridge sends and the sentence any surface
    // shows are the SAME string, because two that match today drift the day one is edited.
    // It also has to survive `bridgeErrorFrom` unchanged — that helper rewrites the three
    // SKEW shapes and passes everything else through, so a refusal worded like one of them
    // would reach the operator as "restart the bridge" (`B-152`).
    const { ws, frames } = await openBridge();
    await ask(ws, frames, 'lock', 'lock.engage', { pin: '1234' });
    const res = await ask(ws, frames, 'x', 'stack.take', { itemId: 'nope' });

    expectRefused(res.error, 'stack.take');
    expect(LOCK_ENGAGED_REFUSAL).not.toMatch(/^(unknown channel|invalid (request|response) for)/i);
    // Names the state and the remedy, in the operator's words — no channel name, no code.
    expect(LOCK_ENGAGED_REFUSAL.toLowerCase()).toContain('locked');
    expect(LOCK_ENGAGED_REFUSAL.toLowerCase()).toContain('pin');
    expect(LOCK_ENGAGED_REFUSAL).not.toContain('stack.take');
    // Says plainly that nothing was sent — the `R-006` rule for a pre-send refusal: an
    // operator who thinks a command is queued will not reissue it.
    expect(LOCK_ENGAGED_REFUSAL.toLowerCase()).toContain('nothing was sent');
  });

  it('the WAY OUT still works, and so does every read', async () => {
    // A lock that refused `lock.release` would need a bridge restart to escape, which is
    // strictly worse than the bug. And the reads must answer: the overlay itself is drawn
    // from `lock.state`, and a browser that reconnects to a locked bridge has to be able
    // to see the stack it is not allowed to touch.
    const { ws, frames } = await openBridge();
    await ask(ws, frames, 'lock', 'lock.engage', { pin: '1234' });

    for (const [i, channel] of ['lock.state', 'stack.snapshot', 'connections.config'].entries()) {
      const res = await ask(ws, frames, `r${String(i)}`, channel, undefined);
      expect(res.error, `${channel} is a READ and must answer while locked`).toBeUndefined();
    }

    const wrong = await ask(ws, frames, 'w', 'lock.release', { pin: '9999' });
    expect(wrong.error, 'release must not be refused BY THE LOCK').toBeUndefined();
    expect(wrong.payload).toMatchObject({ ok: false, reason: 'pin-mismatch' });

    const right = await ask(ws, frames, 'ok', 'lock.release', { pin: '1234' });
    expect(right.payload).toMatchObject({ ok: true });
  });

  it('🔴 THE INVERSE: unlocking restores every intent immediately, with no reconnect', async () => {
    // Same socket, no reconnect, no reload — the refusal is read per request from the
    // CURRENT lock state, never latched onto the connection. A gate that armed at connect
    // would leave a browser locked out for the life of its socket.
    const { ws, frames } = await openBridge();
    await ask(ws, frames, 'lock', 'lock.engage', { pin: '1234' });
    expectRefused(
      (await ask(ws, frames, 'l1', 'stack.take', { itemId: 'nope' })).error,
      'stack.take while locked',
    );

    await ask(ws, frames, 'rel', 'lock.release', { pin: '1234' });

    const after = await ask(ws, frames, 'l2', 'stack.take', { itemId: 'nope' });
    expect(after.error, 'the intent is still refused after unlocking').toBeUndefined();
    expect(after.payload).toBeDefined();
  });

  /**
   * 🔴 **THE CENSUS — every route, not a sample.**
   *
   * The specs above press six channels. "The lock refuses everything" is a claim about all
   * sixty, and six cannot make it: the channel that gets forgotten is by definition the one
   * nobody wrote a spec for. So this walks the route table itself.
   *
   * It pins the EXEMPTIONS by name rather than counting them. A count would pass when a new
   * channel took an exemption and an old one lost it, which is the swap most likely to
   * happen and the one hardest to see in a diff. Adding a route that is reachable while
   * locked now fails HERE, with the channel named, and the fix is either to reclassify it or
   * to add it to this list deliberately — which is a decision with a diff, not an omission.
   */
  it('THE CENSUS — every route is classified, and only these are reachable while locked', () => {
    const runtime = new CasparRuntime({
      servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    });
    // `buildRoutes` only wires handlers onto the backing runtime — it binds nothing, so an
    // unstarted runtime is enough and this spec opens no sockets.
    const routes = buildRoutes(runtime);
    expect(routes.size, 'the census is looking at the real table').toBeGreaterThan(50);

    const reachable = [...routes.entries()]
      .filter(([, r]) => !refusedWhileLocked(r, {}))
      .map(([name]) => name)
      .sort();

    expect(reachable).toEqual(
      [
        // Reads: the overlay is drawn from `lock.state`, and a browser that reconnects to a
        // locked bridge must still be able to SEE the stack it may not touch.
        //
        // ⚠ The emptied-air READ is `air.emptied`, not `emptied-air.notice`: the wire name
        // and the renderer's name for that feature differ, and this census caught the
        // author using the wrong one on its first run. Read names off the table, never off
        // the constant's identifier.
        'air.emptied',
        'app.info',
        'audit.health',
        'audit.recent',
        'bridge.capabilities',
        'channelSettings.get',
        'connections.config',
        'connections.health',
        'connections.template-serve',
        'delimiters.list',
        'fixedLayers.config',
        'fixedLayers.state',
        'layers.orphans',
        'layers.owned-occupancy',
        'liveLayers.state',
        // The way out. A lock that refused this would need a bridge restart to escape.
        'lock.release',
        'lock.state',
        'playoutLayers.state',
        'rehearse.state',
        'sources.assignments',
        'sources.config',
        // The client's own reconnect machinery, unreachable from any operator control.
        'stack.restore',
        'stack.snapshot',
        'templates.get',
        'templates.list',
        'update.state',
      ].sort(),
    );
  });

  it('`templates.import` splits on the redelivery flag, not on the channel', () => {
    // The one channel carrying both an operator act and machinery. An operator's real import
    // is a catalogue change and is refused; `#resync`'s re-deliveries are marked and pass, so
    // a browser reloading against a locked bridge still reconciles its library.
    const runtime = new CasparRuntime({
      servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    });
    const route = buildRoutes(runtime).get('templates.import');
    if (route === undefined) throw new Error('templates.import is not routed');

    expect(refusedWhileLocked(route, { redelivery: true }), 'a re-delivery was refused').toBe(
      false,
    );
    expect(refusedWhileLocked(route, { redelivery: false }), 'an import was allowed').toBe(true);
    // An operator import carries no flag at all — the default must be the REFUSING one.
    expect(refusedWhileLocked(route, {}), 'an unflagged import was allowed').toBe(true);
  });

  it('re-engaging while locked is refused, so a second console cannot change the PIN', async () => {
    // `lock.engage` is a MUTATION and takes no exemption. Without this, anyone who can
    // reach the port could overwrite `#lockPin` and the operator who set it would be
    // locked out of his own console with the right PIN.
    const { ws, frames } = await openBridge();
    await ask(ws, frames, 'lock', 'lock.engage', { pin: '1234' });

    const again = await ask(ws, frames, 'again', 'lock.engage', { pin: '5555' });
    expect(again.error).toBe(LOCK_ENGAGED_REFUSAL);

    // …and the ORIGINAL pin still opens it, which is the property that was at risk.
    expect((await ask(ws, frames, 'rel', 'lock.release', { pin: '1234' })).payload).toMatchObject({
      ok: true,
    });
  });
});
