import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  fixedBankEnd,
  isLayerVisible,
  type ConnectionConfig,
  type FixedLayerBank,
} from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';

/**
 * A MACHINE WITH NO CONFIG MUST COME UP CORRECT.
 *
 * The bank a station gets when its fixed-layers file is ABSENT used to be no
 * bank at all, so a fresh machine showed an empty Layers panel and an old
 * machine showed whatever its file last said — on 2026-08-01 that was a
 * four-layer 70–73 bank written before the thirty-layer decision, on one
 * machine and not the other, with nothing anywhere announcing the difference.
 *
 * These boot against a DEAD CasparCG (unreachable AMCP, ephemeral OSC bind):
 * the bank is resolved and validated before anything connects, so no mock
 * server is needed to observe it.
 */

let bridge: BridgeHandle | null = null;
let dir: string | null = null;

afterEach(async () => {
  await bridge?.close();
  bridge = null;
  if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

/** Unreachable AMCP + ephemeral OSC bind — no fixed ports, no hanging on a server. */
function deadConnection(): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

/** A real, empty config directory — the state of a machine nobody has configured. */
function freshConfigDir(): string {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-bridge-default-bank-'));
  return dir;
}

function visibleLayers(bank: FixedLayerBank): number[] {
  const out: number[] = [];
  for (let layer = bank.start; layer <= fixedBankEnd(bank); layer++) {
    if (isLayerVisible(bank, layer)) out.push(layer);
  }
  return out;
}

it('no config file: the station comes up on channel 1, layers 70–99, thirty rows, top five ticked', async () => {
  const fixedLayersPath = path.join(freshConfigDir(), 'bridge-fixed-layers.json');
  expect(fs.existsSync(fixedLayersPath)).toBe(false);

  bridge = await createBridge({
    port: 0,
    connection: deadConnection(),
    fixedLayersPath,
  });

  const bank = bridge.runtime.fixedLayersConfig();
  expect(bank).not.toBeNull();
  if (bank === null) throw new Error('no bank');
  expect(bank.channel).toBe(1);
  expect(bank.start).toBe(70);
  expect(bank.count).toBe(30);
  expect(visibleLayers(bank)).toEqual([95, 96, 97, 98, 99]);

  // All thirty are FENCED from automatic allocation, not just the five shown —
  // fencing derives from start/count, never from the ticks.
  const slots = bridge.runtime.fixedSlots();
  // Thirty operator rows plus the nine BED rows the default bank also declares
  // (`single-clock-look-switch`) — both halves fenced, for the same reason.
  expect(slots).toHaveLength(39);
  expect(slots[0]).toEqual({ channel: 1, layer: 70 });
  expect(slots[29]).toEqual({ channel: 1, layer: 99 });

  // Resolving a default must not WRITE one. The file still records a deviation
  // from the default; a bridge that persisted the default on boot would make
  // every future change to the default invisible to a machine that had once
  // booted — the same silent-staleness this change exists to end.
  expect(fs.existsSync(fixedLayersPath)).toBe(false);
});

it('a config file still wins: a station that declared 70–73 gets 70–73, not the default', async () => {
  const fixedLayersPath = path.join(freshConfigDir(), 'bridge-fixed-layers.json');
  const declared: FixedLayerBank = {
    channel: 1,
    low: { start: 1, count: 9 },
    start: 70,
    count: 4,
    aliases: { '70': 'logo22', '71': 'clock' },
  };
  fs.writeFileSync(fixedLayersPath, JSON.stringify(declared, null, 2), 'utf8');

  bridge = await createBridge({
    port: 0,
    connection: deadConnection(),
    fixedLayersPath,
  });

  // The bank the operator wrote, verbatim — the default does not merge into it,
  // does not extend it, and does not overwrite the file.
  expect(bridge.runtime.fixedLayersConfig()).toEqual(declared);
  expect(bridge.runtime.fixedSlots()).toHaveLength(13); // 4 operator rows + 9 bed rows
  expect(JSON.parse(fs.readFileSync(fixedLayersPath, 'utf8'))).toEqual(declared);
});

it('a deliberately narrow bank is not widened by the default, ticks and all', async () => {
  const fixedLayersPath = path.join(freshConfigDir(), 'bridge-fixed-layers.json');
  // Two rows on a NON-default channel, one of them deliberately hidden: every
  // field the default has an opinion about is set to something else here.
  const declared: FixedLayerBank = {
    channel: 2,
    low: { start: 1, count: 9 },
    start: 80,
    count: 2,
    visibility: { '80': false, '81': true },
  };
  fs.writeFileSync(fixedLayersPath, JSON.stringify(declared, null, 2), 'utf8');

  bridge = await createBridge({ port: 0, connection: deadConnection(), fixedLayersPath });

  const bank = bridge.runtime.fixedLayersConfig();
  expect(bank).toEqual(declared);
  if (bank === null) throw new Error('no bank');
  expect(visibleLayers(bank)).toEqual([81]);
  expect(bridge.runtime.fixedSlots()).toEqual([
    { channel: 2, layer: 80 },
    { channel: 2, layer: 81 },
    // The BED rows ride the same channel as the bank that declares them, and the file
    // said nothing about them — so they come from the schema default, on channel 2.
    ...Array.from({ length: 9 }, (_, i) => ({ channel: 2, layer: i + 1 })),
  ]);
});

it('a present-but-unusable file is still a hard boot failure — never quietly replaced by the default', async () => {
  const fixedLayersPath = path.join(freshConfigDir(), 'bridge-fixed-layers.json');
  fs.writeFileSync(fixedLayersPath, '{ this is not json', 'utf8');

  // The default fills the ABSENT case only. A file the operator wrote and
  // broke must stop the boot: falling through to the default here would hand
  // them a bank they never declared while their own sat unread on disk.
  await expect(
    createBridge({ port: 0, connection: deadConnection(), fixedLayersPath }),
  ).rejects.toThrow(/present but unusable/);
});

it('the default is refused LOUDLY when it collides with this station config, naming where it came from', async () => {
  const fixedLayersPath = path.join(freshConfigDir(), 'bridge-fixed-layers.json');

  // A station whose playout system owns 95–99: the default bank's top five.
  // The disjointness rule is not weakened for a default — but the refusal must
  // say the bank was the BUILT-IN one, or the operator goes hunting through a
  // file that does not exist.
  await expect(
    createBridge({
      port: 0,
      connection: deadConnection(),
      fixedLayersPath,
      reservedLayers: { ranges: [{ from: 95, to: 99 }] },
    }),
  ).rejects.toThrow(/BUILT-IN DEFAULT/);
});

it('no path configured at all: still no bank — an embedder with no config surface', async () => {
  // `createBridge({})` is not a station. The default applies to a CONFIGURED
  // location that holds no file, which is what every real install has.
  bridge = await createBridge({ port: 0, connection: deadConnection() });
  expect(bridge.runtime.fixedLayersConfig()).toBeNull();
  expect(bridge.runtime.fixedSlots()).toEqual([]);
});
