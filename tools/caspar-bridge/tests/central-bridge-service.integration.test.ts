import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isOnAirStatus, type StackItemState } from '@cg/shared-schema';
import type { PlayoutFlags } from '../src/index.js';
import { connect, openClient, type Client } from './support/auth-harness.js';
import { startFakePlayout, type FakePlayout } from './support/fake-playout.js';
import { track } from './support/harness.js';
import {
  addressing,
  delay,
  FURNITURE,
  STALE_MS,
  standardBank,
  SWEEP_MS,
  twoChannelRig,
  waitUntil,
  writes,
  type TwoChannelRig,
} from './support/two-channel-rig.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §5 — **THE TWO TESTS OF CG BRIDGE AS A SERVICE THAT THE REST OF THE LIST DOES
 * NOT COVER**, in the prompt's words:
 *
 * - _"Service: the bridge survives a console closing: an item on air stays in the ledger, and a new
 *   console sees it."_ The record of what is on air is the bridge's own stack file (`B-294`, D5); the
 *   B-145 ledger holds live-input plates, which a template take does not seat.
 * - _"Separate server: the bridge on a non-loopback address drives the mock, and a console that was
 *   given that address connects."_ The prompt's CONTROL for it — a console with no address set and no
 *   bridge on the Playout host shows the "not reachable" line — is `playout-address-gate.spec.ts`'s
 *   first test, in a real browser.
 */

let n = 0;
const id = (): string => `r-${String(++n)}`;

function playoutFlags(playout: FakePlayout, address?: string): PlayoutFlags {
  return address === undefined
    ? {
        auth: 'playout',
        issuer: playout.issuer,
        jwksUrl: playout.jwksUrl,
        tokenUrl: playout.tokenUrl,
        refreshUrl: playout.refreshUrl,
        revokedUrl: playout.revokedUrl,
      }
    : // Configured by ADDRESS, as CG Bridge's service is: every endpoint derived from it. The issuer
      // is an opaque string the Playout signs with, compared byte for byte, never a location.
      { auth: 'playout', address, issuer: playout.issuer };
}

async function signedIn(rig: TwoChannelRig, playout: FakePlayout): Promise<Client> {
  const client = await openClient(rig.handle);
  // `cg-op1`: channel 1, its grant spelled `127.0.0.1` — the Playout's own `casparHost` on `.111`.
  const { token } = await playout.issueToken({ user: 'operator' });
  expect((await client.authenticate(id(), token)).error, 'sign-in').toBeUndefined();
  return client;
}

async function loadAndTake(client: Client, itemId: string): Promise<void> {
  const load = await client.ask(id(), 'fixedLayers.load', {
    channel: 1,
    layer: 80,
    itemId,
    templateId: FURNITURE.templateId,
    fields: {},
  });
  expect(load.error, 'the load').toBeUndefined();
  expect(load.payload, 'the load').toMatchObject({ accepted: true });
  const take = await client.ask(id(), 'stack.take', { itemId });
  expect(take.error, 'the take').toBeUndefined();
}

async function rowOf(client: Client, itemId: string): Promise<StackItemState | undefined> {
  const told = (await client.ask(id(), 'stack.snapshot')).payload as StackItemState[];
  return told.find((i) => i.itemId === itemId);
}

/**
 * Settled and ON AIR as a console draws it: `on-air` while the OSC truth is fresh, and `playing` — the
 * take's ack — once it ages (`B-053`). The Reconciler's own note names these two as the states that
 * render `● ON AIR` alike; a pending row is not settled.
 */
function shownOnAir(row: StackItemState | undefined): boolean {
  return row !== undefined && !row.pending && (row.status === 'on-air' || row.status === 'playing');
}

async function takeOnWire(rig: TwoChannelRig, from = 0): Promise<boolean> {
  return addressing(writes((await rig.lines()).slice(from)), 1).some((l) =>
    l.startsWith('CG 1-80 PLAY'),
  );
}

describe('CENTRAL-BRIDGE-01 §5 — the service outlives a console', () => {
  it('🔴 a console closes: its take stays in the record and on the layer, nothing is sent, and a NEW console is told it ON AIR', async () => {
    const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-outlives-')), (d) => {
      fs.rmSync(d, { recursive: true, force: true });
    });
    const stackPath = path.join(dir, 'bridge-stack.json');
    const recorded = (itemId: string): string | undefined => {
      if (!fs.existsSync(stackPath)) return undefined;
      const file = JSON.parse(fs.readFileSync(stackPath, 'utf8')) as {
        items: { itemId: string; state: string }[];
      };
      return file.items.find((i) => i.itemId === itemId)?.state;
    };
    const playout = track(await startFakePlayout(), (p) => p.stop());
    const rig = await twoChannelRig({
      banks: [standardBank(1)],
      bridge: { stackPath, playout: playoutFlags(playout) },
    });
    const consoles = async (): Promise<number> => {
      const res = await fetch(`http://${rig.handle.host}:${String(rig.handle.port)}/health`);
      return ((await res.json()) as { consoles: number }).consoles;
    };

    const a = await signedIn(rig, playout);
    await loadAndTake(a, 'row-1');
    await waitUntil(() => takeOnWire(rig), 'the take on the wire');
    await waitUntil(async () => shownOnAir(await rowOf(a, 'row-1')), 'row-1 ON AIR');
    await waitUntil(() => recorded('row-1') === 'on-air', 'the record to say ON AIR');
    expect(rig.mock.layerState({ channel: 1, layer: 80 })?.onAir, 'the layer').toBe(true);
    const mark = (await rig.lines()).length;

    a.ws.close();
    await waitUntil(async () => (await consoles()) === 0, 'the bridge to count the console gone');
    // Sweeps run with no console attached before anything is read.
    await delay(STALE_MS + 3 * SWEEP_MS);

    expect(
      addressing(writes((await rig.lines()).slice(mark)), 1),
      'a console closing sent something to channel 1',
    ).toEqual([]);
    expect(rig.mock.layerState({ channel: 1, layer: 80 })?.onAir, 'the layer').toBe(true);
    expect(recorded('row-1'), 'the record').toBe('on-air');

    const b = await signedIn(rig, playout);
    const told = await rowOf(b, 'row-1');
    expect(shownOnAir(told), `what a NEW console is told: ${JSON.stringify(told)}`).toBe(true);
    // CONTROL — the same read says otherwise once the row is not on air: B clears it.
    const clear = await b.ask(id(), 'stack.out', { itemId: 'row-1' });
    expect(clear.error, 'the clear').toBeUndefined();
    await waitUntil(async () => {
      const row = await rowOf(b, 'row-1');
      return row !== undefined && !isOnAirStatus(row);
    }, 'row-1 off air');
  }, 60_000);
});

/**
 * One of THIS machine's own network addresses, never another machine's. The test binds and dials
 * only this, so it reaches nothing beyond the host it runs on.
 */
function ownNetworkAddress(): string | undefined {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return undefined;
}

const NETWORK = ownNetworkAddress();

describe('CENTRAL-BRIDGE-01 §5 — CG Bridge on a separate server', () => {
  it('the instrument: a CI runner has a network address, so the spec below never skips there', () => {
    if (process.env['CI'] !== undefined) expect(NETWORK, 'no network address on CI').toBeDefined();
  });

  it.runIf(NETWORK !== undefined)(
    '🔴 on a network address: it drives the core there, the core fetches the page from it, and a console given the address takes — CONTROL: nothing answers on loopback',
    async () => {
      const lan = NETWORK as string;
      // The Playout's machine — its API and its CasparCG — at `lan`, as a separate server sees it.
      const playout = track(await startFakePlayout({ listenHost: lan }), (p) => p.stop());
      const address = playout.baseUrl.replace('127.0.0.1', lan);
      const rig = await twoChannelRig({
        host: lan,
        banks: [standardBank(1)],
        bridge: {
          playout: playoutFlags(playout, address),
          // The service configuration's `bridgeAddress` (`--template-serve-host`): what CasparCG
          // fetches pages from.
          templateServe: { serveHost: lan },
        },
      });
      expect(rig.handle.url, 'the console socket').toBe(`ws://${lan}:${String(rig.handle.port)}`);
      // CONTROL — CG Bridge is on the network address alone: loopback does not answer, so the
      // console below reached it only by the address it was given.
      await expect(connect(`ws://127.0.0.1:${String(rig.handle.port)}`)).rejects.toThrow();

      const console = await signedIn(rig, playout);
      await loadAndTake(console, 'row-1');
      await waitUntil(() => takeOnWire(rig), 'the take at the core on the network address');
      const add = rig.mock.lastCgAdd({ channel: 1, layer: 80 });
      expect(add?.template, 'the page CasparCG was told to load').toMatch(
        new RegExp(`^http://${lan.replaceAll('.', '\\.')}:\\d+/template/`),
      );
      expect(
        await rig.mock.waitForCgAddResolution({ channel: 1, layer: 80 }, 5000),
        'the core fetching the page from CG Bridge',
      ).toBe('resolved');
      await waitUntil(async () => shownOnAir(await rowOf(console, 'row-1')), 'ON AIR');
    },
    60_000,
  );
});
