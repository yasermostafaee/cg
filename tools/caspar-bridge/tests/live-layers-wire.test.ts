import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { parseWsFrame, serializeWsFrame, type WsFrame } from '@cg/shared-ipc';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBridge, type BridgeHandle } from '../src/bridge.js';
import { savePersistedLiveLayers } from '../src/live-layers-store.js';
import { CasparRuntime } from '../src/caspar-runtime.js';
import {
  projectLiveLayers,
  type LiveLayerLedger,
  type LiveLayerRecord,
} from '../src/live-layers.js';
import type { ConnectionConfig } from '@cg/shared-ipc';

/**
 * 🔴 **`B-145` acceptance 1, DISPLAY half (`multibox-layout-switch` `tasks.md` 2.8) —
 * the ledger reaching a browser at all.**
 *
 * ── WHAT WAS BROKEN, AND WHY IT WAS INVISIBLE FOR A WEEK ────────────────────
 *
 * `B-145`'s persistence half landed and worked: the ledger survived a bridge restart,
 * was adopted against the server at boot, and every teardown/repoint door read it by
 * `itemId`. What NOTHING did was show it. `CasparRuntime.liveLayers()` had no
 * production caller — its own doc said *"for tests and for phase 6's re-emission"* —
 * and no `@cg/shared-ipc` channel carried the ledger, so a guest's face could be
 * composited on air with nothing on any screen naming the layer it was on. The item
 * was ticked with that half of its first acceptance unmet, and went back to `[~]`.
 *
 * These tests exist so that cannot recur silently: they assert the ledger is
 * PROJECTED, is REACHABLE over the wire, and is PUSHED on change.
 *
 * ── ⚠ `awaitChannelModeRead` (flake family 3) IS NOT NEEDED HERE, AND THAT IS A
 *    STATEMENT ABOUT THESE TESTS RATHER THAN A CONVENIENCE ─────────────────────
 *
 * The harness helper is REQUIRED of any boot whose tests baseline the wire — i.e. that
 * take `before = trace.length` and assert the slice is empty — because a negative
 * observation is valid only from a proven-quiescent wire, and R-030's one-shot
 * channel-mode `INFO` rides the first sweep tick on a timer.
 *
 * **No test in this file takes a silence baseline.** The ledger is BOOKKEEPING:
 * `registerLiveLayers` and `adoptLiveLayers` send no AMCP at all (the runtime's own
 * doc: *"Bookkeeping ONLY — this sends no AMCP and creates no producer"*), so the unit
 * tests below construct a `CasparRuntime` without starting it and open no sockets. The
 * one WS test asserts a frame that ARRIVES; it never asserts that nothing did. Adding
 * the wait would be cargo — and, worse, would imply a quiescence guarantee these
 * assertions do not actually rest on.
 */

const dirs: BridgeHandle[] = [];
const tmpDirs: string[] = [];
afterEach(async () => {
  for (const h of dirs.splice(0)) await h.close();
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function deadConnection(): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
    strategy: 'single',
    autoFailoverEnabled: false,
  };
}

/** A ledger record, shaped exactly as `live-layers-restart.test.ts` builds one. */
function record(layer: number, sourceId: string, held?: boolean): LiveLayerRecord {
  const rect = { x: 0, y: 0, width: 1, height: 1 };
  return {
    slot: { channel: 1, layer },
    sourceId,
    role: 'fill',
    producer: `route://1-${String(layer)}`,
    fill: rect,
    clip: rect,
    intendedVolume: 0,
    ...(held === undefined ? {} : { held }),
  };
}

const ledgerOf = (entries: [string, LiveLayerRecord[]][]): LiveLayerLedger => new Map(entries);

/**
 * The projection with NOTHING marked unverified — the ordinary in-session case, where
 * every record was written first-hand by a seat the bridge itself sent.
 */
const projectSeated = (l: LiveLayerLedger | ReadonlyMap<string, readonly LiveLayerRecord[]>) =>
  projectLiveLayers(l, () => false);

/** A runtime with no sockets — enough for bookkeeping, per the note above. */
const bookkeepingRuntime = (): CasparRuntime => new CasparRuntime(deadConnection());

describe('4.1 — the seated layers are projected onto the wire', () => {
  it('an EMPTY ledger projects to an empty list, not to a placeholder row', () => {
    // The panel's "nothing seated" state has to be reachable, and it has to mean
    // exactly that: no band declared / nothing taken. A projection that invented a
    // row here would put a layer on screen that is not on air.
    expect(projectSeated(new Map())).toEqual([]);
    expect(bookkeepingRuntime().liveLayersState()).toEqual([]);
  });

  it('every record becomes one row carrying the plate, the producer and its owner', () => {
    const rows = projectSeated(ledgerOf([['item-a', [record(10, 'guest-1')]]]));

    expect(rows).toEqual([
      {
        channel: 1,
        layer: 10,
        itemId: 'item-a',
        sourceId: 'guest-1',
        role: 'fill',
        producer: 'route://1-10',
        held: false,
        unverified: false,
      },
    ]);
  });

  it('🔴 the OWNER rides every row — it is the only handle any verb takes', () => {
    /*
      The ledger is keyed by itemId precisely because every sanctioned verb for a
      seated layer is item-scoped (swap, volume, out, remove). A payload that dropped
      the key would show the operator a lit layer and no way to reach it — which is
      the defect, restated on a different surface.
    */
    const rows = projectSeated(
      ledgerOf([
        ['item-a', [record(10, 'guest-1'), record(11, 'guest-2')]],
        ['item-b', [record(12, 'guest-1')]],
      ]),
    );

    expect(rows.map((r) => r.itemId)).toEqual(['item-a', 'item-a', 'item-b']);
  });

  it('rows are ordered by COORDINATE, not by the ledger’s item grouping', () => {
    /*
      The ledger groups by item because verbs do; the surface reading it is a LAYER
      LIST, whose order is the coordinate. Sorting at the seam rather than in the
      renderer keeps the order a property of the payload, so two browsers — and the
      same browser across a pull and a push — cannot show the list differently.
    */
    const rows = projectSeated(
      ledgerOf([
        ['item-b', [record(30, 'guest-1'), record(12, 'guest-2')]],
        ['item-a', [record(20, 'guest-1')]],
      ]),
    );

    expect(rows.map((r) => r.layer)).toEqual([12, 20, 30]);
  });

  it('an absent `held` resolves to false ONCE, at the seam', () => {
    /*
      The record's field is optional because it is additive to the persisted form: a
      ledger written before looks existed parses unchanged and described a plate that
      was on screen. That ambiguity is a persistence concern and is answered here, so
      no consumer re-decides what a missing flag meant.
    */
    const rows = projectSeated(
      ledgerOf([['item-a', [record(10, 'guest-1'), record(11, 'guest-2', true)]]]),
    );

    expect(rows.map((r) => r.held)).toEqual([false, true]);
  });

  it('🔴 `liveLayersState()` is the SAME projection the push uses, not a second one', () => {
    // Golden rule 6, applied to a projection: a pull and a push that disagreed about
    // the shape or order of a row would make the list flicker between two truths on
    // every seat, with no way to tell which one is on air.
    const r = bookkeepingRuntime();
    r.registerLiveLayers('item-a', [record(11, 'guest-2'), record(10, 'guest-1')]);

    expect(r.liveLayersState()).toEqual(projectSeated(r.liveLayers()));
  });
});

describe('4.2 — the list is PUSHED when the ledger changes, never polled', () => {
  it('a SEAT publishes the new ledger', () => {
    const r = bookkeepingRuntime();
    const seen: number[][] = [];
    r.liveLayersChanged.subscribe((l) => seen.push(projectSeated(l).map((x) => x.layer)));

    r.registerLiveLayers('item-a', [record(10, 'guest-1')]);

    expect(seen).toEqual([[10]]);
  });

  it('a RELEASE publishes too — the row leaving is as much news as it arriving', () => {
    const r = bookkeepingRuntime();
    r.registerLiveLayers('item-a', [record(10, 'guest-1')]);
    const seen: number[][] = [];
    r.liveLayersChanged.subscribe((l) => seen.push(projectSeated(l).map((x) => x.layer)));

    // `registerLiveLayers` with no records IS the release — it deletes the entry.
    r.registerLiveLayers('item-a', []);

    expect(seen).toEqual([[]]);
  });

  it('a HOLD publishes, and the pushed row says it is held', () => {
    /*
      §12.4's hold is a ledger WRITE with no seat and no teardown, so it is exactly the
      change a poll-driven list would miss for a whole interval — the operator would see
      a plate as on screen while the look had already stopped showing it.
    */
    const r = bookkeepingRuntime();
    r.registerLiveLayers('item-a', [record(10, 'guest-1')]);
    const seen: boolean[][] = [];
    r.liveLayersChanged.subscribe((l) => seen.push(projectSeated(l).map((x) => x.held)));

    r.registerLiveLayers('item-a', [record(10, 'guest-1', true)]);

    expect(seen).toEqual([[true]]);
  });

  it('🔴 the ADOPTION at boot publishes as well — the restart is a change like any other', () => {
    // The browser also PULLS on connect, so this is belt and braces — but a bridge that
    // adopted while a console was already attached (a reconnect, a second browser) would
    // otherwise leave that console showing an empty list over a lit band.
    const r = bookkeepingRuntime();
    const seen: number[][] = [];
    r.liveLayersChanged.subscribe((l) => seen.push(projectSeated(l).map((x) => x.layer)));

    r.adoptLiveLayers(ledgerOf([['item-a', [record(10, 'guest-1')]]]), () => 'occupied');

    expect(seen).toEqual([[10]]);
  });
});

describe('4.3 / 4.4 — the RESTART case, which is the one that matters', () => {
  it('4.3 — a ledger rebuilt from file + INFO is LISTED', () => {
    const r = bookkeepingRuntime();

    // The "restart": nothing in memory, a persisted claim, and the server confirming it.
    r.adoptLiveLayers(
      ledgerOf([['item-a', [record(10, 'guest-1'), record(11, 'guest-2')]]]),
      () => 'occupied',
    );

    expect(r.liveLayersState().map((x) => x.layer)).toEqual([10, 11]);
  });

  it('4.3 — …and CONTROLLABLE: the listed rows carry the handle the row verbs take', () => {
    /*
      "Controllable" is not a second mechanism to build — it is the `itemId`. The row's
      verbs already reach an adopted record by that key (`teardownLiveLayers`, the swap
      paths), and the browser re-delivers its stack intent on connect (B-092) so the row
      itself survives. What was missing was a surface that NAMES the key, which is what
      the payload asserted here supplies.
    */
    const r = bookkeepingRuntime();
    r.adoptLiveLayers(ledgerOf([['item-a', [record(10, 'guest-1')]]]), () => 'occupied');

    expect(r.liveLayersState().map((x) => x.itemId)).toEqual(['item-a']);
    // And the handle really does reach the record — the same door the row's verbs use.
    expect([...r.liveLayers().keys()]).toEqual(['item-a']);
  });

  it('4.3 — an UNVERIFIED record is still listed: absence of knowledge is not absence', () => {
    /*
      At boot no session has connected, so occupancy is `unknown` for every record and
      `bridge.ts` adopts them all. Dropping them would strand exactly the producers
      B-145 exists to stop stranding — the failure mode arrived at from the other side —
      so they must appear in the list too, not merely in the ledger.
    */
    const r = bookkeepingRuntime();
    const adoption = r.adoptLiveLayers(
      ledgerOf([['item-a', [record(10, 'guest-1')]]]),
      () => 'unknown',
    );

    expect(adoption.unverified).toHaveLength(1);
    expect(r.liveLayersState().map((x) => x.layer)).toEqual([10]);
  });

  it('🔴 4.4 — a producer that VANISHED server-side is not listed as seated', () => {
    /*
      B-145 acceptance 3, the self-correcting direction. The server is the authority on
      what is on a layer: a producer that went away while the bridge was down must not
      come back as a belief, and above all must not be PRINTED as a seated layer — the
      operator would be looking at a row for something that is not there.
    */
    const r = bookkeepingRuntime();
    r.adoptLiveLayers(
      ledgerOf([['item-a', [record(10, 'guest-1'), record(11, 'guest-2')]]]),
      (slot) => (slot.layer === 11 ? 'empty' : 'occupied'),
    );

    expect(r.liveLayersState().map((x) => x.layer)).toEqual([10]);
  });

  it('4.4 — an item the server contradicted ENTIRELY leaves no row at all', () => {
    const r = bookkeepingRuntime();
    r.adoptLiveLayers(ledgerOf([['item-a', [record(10, 'guest-1')]]]), () => 'empty');

    expect(r.liveLayersState()).toEqual([]);
  });
});

describe('🔴 UNVERIFIED — an adopted file claim is not a present-tense fact about air', () => {
  /*
    ── THE THIRD DEFECT REVIEW FOUND IN THIS CHANGE ──────────────────────────────

    The channel header used to argue that this payload needed no "unknown" arm because
    the ledger is "resolved at boot against the server's INFO". That premise is FALSE
    in the shipped bridge: the one production call is
    `adoptLiveLayers(loaded.ledger, () => 'unknown')` — no session exists at that point,
    and dropping an unverifiable record would strand exactly the producer B-145 exists
    to protect. So `reconcileLiveLayers` drops nothing and marks EVERY record
    unverified, and the omission was the one distinction that is ALWAYS true after a
    restart.

    A row the bridge seated thirty seconds ago and a row read out of a file after a
    reboot — with CasparCG possibly black — were indistinguishable on the wire, and the
    surface stated the second in the present tense.
  */

  it('🔴 a boot adoption marks every record unverified', () => {
    const r = bookkeepingRuntime();
    r.adoptLiveLayers(ledgerOf([['item-a', [record(10, 'guest-1')]]]), () => 'unknown');

    expect(r.liveLayersState().map((x) => x.unverified)).toEqual([true]);
  });

  it('a record the server CONFIRMED at boot is not marked', () => {
    // The mark tracks what could not be checked, not merely what was adopted.
    const r = bookkeepingRuntime();
    r.adoptLiveLayers(ledgerOf([['item-a', [record(10, 'guest-1')]]]), () => 'occupied');

    expect(r.liveLayersState().map((x) => x.unverified)).toEqual([false]);
  });

  it('an ordinary in-session seat is FIRST-HAND and never marked', () => {
    const r = bookkeepingRuntime();
    r.registerLiveLayers('item-a', [record(10, 'guest-1')]);

    expect(r.liveLayersState().map((x) => x.unverified)).toEqual([false]);
  });

  it('🔴 the mark CLEARS when the bridge next writes that item — a re-take confirms it', () => {
    /*
      The clearing rule is "the bridge itself wrote these records", because a take, a
      look reconcile and a swap all send real AMCP and so are first-hand knowledge.
      Deliberately NOT an occupancy read: consulting the tap would make it a SECOND
      authority over the ledger, and `reconcileLiveLayers` exists to keep there being
      exactly one.
    */
    const r = bookkeepingRuntime();
    r.adoptLiveLayers(ledgerOf([['item-a', [record(10, 'guest-1')]]]), () => 'unknown');
    expect(r.liveLayersState()[0]?.unverified).toBe(true);

    r.registerLiveLayers('item-a', [record(10, 'guest-1')]);

    expect(r.liveLayersState()[0]?.unverified).toBe(false);
  });

  it('clearing is PER ITEM — another item’s adopted records stay unconfirmed', () => {
    const r = bookkeepingRuntime();
    r.adoptLiveLayers(
      ledgerOf([
        ['item-a', [record(10, 'guest-1')]],
        ['item-b', [record(20, 'guest-1')]],
      ]),
      () => 'unknown',
    );

    r.registerLiveLayers('item-a', [record(10, 'guest-1')]);

    const byLayer = new Map(r.liveLayersState().map((x) => [x.layer, x.unverified]));
    expect(byLayer.get(10)).toBe(false);
    expect(byLayer.get(20)).toBe(true);
  });

  it('a RELEASE forgets the mark too — a dropped record cannot be unverified', () => {
    const r = bookkeepingRuntime();
    r.adoptLiveLayers(ledgerOf([['item-a', [record(10, 'guest-1')]]]), () => 'unknown');

    r.registerLiveLayers('item-a', []);
    // …and if the same coordinate is seated again later, it is first-hand.
    r.registerLiveLayers('item-a', [record(10, 'guest-1')]);

    expect(r.liveLayersState()[0]?.unverified).toBe(false);
  });
});

describe('the WIRE — the channel a browser actually reads', () => {
  const connect = async (url: string): Promise<WebSocket> => {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        resolve();
      });
      ws.on('error', reject);
    });
    return ws;
  };

  const waitFor = async (predicate: () => boolean, timeoutMs = 4000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() >= deadline) throw new Error('timed out waiting for a frame');
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  };

  it('🔴 answers `liveLayers.state` AND publishes `liveLayers.state-changed`', async () => {
    /*
      THE END-TO-END ASSERTION THIS FILE EXISTS FOR. The unit tests above prove the
      runtime can project its ledger; only this one proves a BROWSER can obtain it —
      which is the whole of the display half. Both halves are asserted together on
      purpose: a route with no push would go stale the moment a plate moved, and a push
      with no route would leave a console that connected mid-show showing nothing.

      `liveLayersPath` is deliberately NOT set, so this test writes no ledger file
      anywhere. Persistence is B-145's other half and has its own tests.
    */
    const handle = await createBridge({ port: 0, connection: deadConnection() });
    dirs.push(handle);
    const ws = await connect(handle.url);
    const frames: WsFrame[] = [];
    ws.on('message', (data: Buffer) => {
      const f = parseWsFrame(data.toString());
      if (f !== null) frames.push(f);
    });

    ws.send(
      serializeWsFrame({
        type: 'request',
        id: '1',
        channel: 'liveLayers.state',
        payload: undefined,
      }),
    );
    await waitFor(() => frames.some((f) => f.type === 'response' && f.id === '1'));
    const answer = frames.find((f) => f.type === 'response' && f.id === '1');
    expect(answer, 'the channel is routed at all').toBeDefined();
    expect(answer?.type === 'response' ? answer.payload : null).toEqual([]);

    // Now write the ledger through the bridge's own runtime and expect it to arrive
    // UNASKED — no second request is sent below, which is what makes this a push.
    handle.runtime.registerLiveLayers('item-a', [record(10, 'guest-1')]);
    await waitFor(() =>
      frames.some((f) => f.type === 'publish' && f.channel === 'liveLayers.state-changed'),
    );
    const pushed = frames.filter(
      (f) => f.type === 'publish' && f.channel === 'liveLayers.state-changed',
    );
    const payload = pushed[pushed.length - 1];
    expect(payload?.type === 'publish' ? payload.payload : null).toEqual([
      {
        channel: 1,
        layer: 10,
        itemId: 'item-a',
        sourceId: 'guest-1',
        role: 'fill',
        producer: 'route://1-10',
        held: false,
        unverified: false,
      },
    ]);
    ws.close();
  });
  it('🔴 4.3 END TO END — a bridge that ADOPTED a persisted ledger serves it to a browser', async () => {
    /*
      THE ACCEPTANCE SENTENCE ITSELF: *"WHEN the bridge restarts while live plates are
      seated THEN those layers appear in the layer list and are controllable, rather
      than being invisible to every code path."*

      The unit tests above prove each half — the adoption resolves the file against the
      server, and the wire carries the projection. This one proves the COMPOSITION, which
      is where the defect actually lived: for a week both halves worked and the layers
      were still invisible, because nothing joined them. A browser connecting after a
      restart PULLS this channel, and what it gets back has to be the adopted ledger.

      Occupancy is `unknown` here because no session has connected — exactly the real
      boot, where `bridge.ts` passes `() => 'unknown'` and adopts everything rather than
      dropping records it cannot yet verify.
    */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-live-layers-wire-'));
    tmpDirs.push(dir);
    const file = path.join(dir, 'ledger.json');
    savePersistedLiveLayers(
      file,
      ledgerOf([['item-a', [record(10, 'guest-1'), record(11, 'guest-2', true)]]]),
    );

    const handle = await createBridge({
      port: 0,
      connection: deadConnection(),
      liveLayersPath: file,
    });
    dirs.push(handle);
    expect(handle.liveLayers.adopted, 'the boot really did adopt the file').toBe(1);

    const ws = await connect(handle.url);
    const frames: WsFrame[] = [];
    ws.on('message', (data: Buffer) => {
      const f = parseWsFrame(data.toString());
      if (f !== null) frames.push(f);
    });
    ws.send(
      serializeWsFrame({
        type: 'request',
        id: '9',
        channel: 'liveLayers.state',
        payload: undefined,
      }),
    );
    await waitFor(() => frames.some((f) => f.type === 'response' && f.id === '9'));

    const answer = frames.find((f) => f.type === 'response' && f.id === '9');
    const rows = (answer?.type === 'response' ? answer.payload : []) as {
      layer: number;
      itemId: string;
      held: boolean;
      unverified: boolean;
    }[];
    // LISTED — the half that was missing.
    expect(rows.map((r) => r.layer)).toEqual([10, 11]);
    // …and CONTROLLABLE, which on this wire means: carrying the handle every
    // item-scoped verb takes. Without it the operator sees a lit layer and can do
    // nothing about it, which is the defect with a list bolted on.
    expect(rows.map((r) => r.itemId)).toEqual(['item-a', 'item-a']);
    // The held disposition survives the round trip too — a restart must not silently
    // promote a held plate to "on screen".
    expect(rows.map((r) => r.held)).toEqual([false, true]);
    // 🔴 …and every row arrives DEMOTED. This is the assertion that stops the surface
    // stating a file claim in the present tense: production adopts with occupancy
    // `unknown`, so after a restart nothing here has been confirmed and CasparCG may be
    // black. A payload without this field made a re-read record indistinguishable from
    // one the bridge seated seconds ago.
    expect(rows.map((r) => r.unverified)).toEqual([true, true]);
    ws.close();
  });
});
