import { describe, expect, it, vi } from 'vitest';
import {
  FIRST_ALLOCATABLE_LAYER,
  LAYER_BANDS,
  defaultFixedLayerBank,
  fixedBankSlots,
  isLayerVisible,
  type ConnectionConfig,
  type ConnectionCheckLine,
  type FixedLayerBank,
} from '@cg/shared-ipc';
import {
  checkAllowsConnect,
  commitFirstRun,
  declareChannelSet,
  declareFirstRunChannels,
  firstRunBank,
  firstRunConnection,
  groupByHost,
  nextChannelSet,
  normalisePlayoutAddress,
  type ChannelChoice,
} from '../src/renderer/features/firstRun/firstRunStation.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';

/**
 * `DESKTOP-APPS-01` §2E — what first-run writes, through the existing doors only.
 */

const current: ConnectionConfig = {
  servers: {
    A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 },
    B: { host: '127.0.0.2', amcpPort: 5251, oscPort: 6251 },
  },
  strategy: 'mirror-sync',
  autoFailoverEnabled: true,
  templateServeHost: '10.0.0.1',
};

describe('the bank first-run declares', () => {
  it('is the chosen channel on the default bands, with EVERY row shown', () => {
    const bank = firstRunBank(2);
    const base = defaultFixedLayerBank();
    expect(bank.channel).toBe(2);
    expect([bank.start, bank.count, bank.low.start, bank.low.count]).toEqual([
      base.start,
      base.count,
      base.low.start,
      base.low.count,
    ]);
    // With no CasparCG link, hiding a row of unknown occupancy is refused — so none is hidden.
    const slots = [...fixedBankSlots(bank)];
    expect(slots.length).toBe(base.count + base.low.count);
    expect(slots.every(({ layer }) => isLayerVisible(bank, layer))).toBe(true);
    // Control: the DEFAULT bank does hide rows, so "every row shown" is a choice, not a default.
    expect([...fixedBankSlots(base)].some(({ layer }) => !isLayerVisible(base, layer))).toBe(true);
  });
});

/*
  🔴 `DESKTOP-APPS-01-D` b — **THE BANK FIRST-RUN WRITES SITS IN CG'S BANDS, NEVER IN 1–49.**

  The owner's channel-1 station (the Playout's programme channel) had exactly this bank on disk —
  beds 50–59 and operator rows 80–99 — and no command reached a layer below 50. The guard held; it
  is pinned here so a change to the default bank cannot move a row into the playout server's span.
*/
describe('DESKTOP-APPS-01-D b — the layers first-run declares', () => {
  it('are exactly 50–59 and 80–99 on every channel, and none is in 1–49', () => {
    for (const channel of [1, 2, 4]) {
      const layers = [...fixedBankSlots(firstRunBank(channel))]
        .map((s) => s.layer)
        .sort((a, b) => a - b);
      expect(layers).toEqual([
        50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92,
        93, 94, 95, 96, 97, 98, 99,
      ]);
      expect(layers.filter((layer) => layer < FIRST_ALLOCATABLE_LAYER)).toEqual([]);
    }
  });

  it('control — the three bands come out byte for byte: beds 50–59, plates 60–79, templates 80–99', () => {
    expect(JSON.stringify(LAYER_BANDS)).toBe(
      '{"bed":{"start":50,"end":59},"plate":{"start":60,"end":79},"template":{"start":80,"end":99}}',
    );
    expect(FIRST_ALLOCATABLE_LAYER).toBe(50);
  });
});

describe('the connection first-run applies', () => {
  it('is ONE server — the Playout-named CasparCG host — on the standard ports, with the serve host', () => {
    expect(firstRunConnection(current, ' 192.168.21.111 ', '192.168.21.93')).toEqual({
      servers: { A: { host: '192.168.21.111', amcpPort: 5250, oscPort: 6250 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: true,
      templateServeHost: '192.168.21.93',
    });
  });

  it('an empty serve address leaves the serve host to the bridge’s derivation', () => {
    expect(firstRunConnection(current, 'caspar', '  ').templateServeHost).toBeUndefined();
  });
});

describe('the channel list, grouped by the host it plays on', () => {
  it('keeps the Playout’s order within and across hosts', () => {
    const row = (id: string, host: string, ch: number) => ({
      id,
      name: id,
      casparHost: host,
      casparChannel: ch,
    });
    expect(
      groupByHost([row('a', 'h1', 1), row('b', 'h2', 1), row('c', 'h1', 2)]).map((g) => [
        g.host,
        g.rows.map((r) => r.id),
      ]),
    ).toEqual([
      ['h1', ['a', 'c']],
      ['h2', ['b']],
    ]);
  });
});

describe('Connect needs the two links a sign-in needs', () => {
  const line = (
    id: ConnectionCheckLine['id'],
    status: ConnectionCheckLine['status'],
  ): ConnectionCheckLine => ({
    id,
    status,
    text: id,
  });
  it('passes on the keys and CORS, whatever AMCP says', () => {
    expect(
      checkAllowsConnect([line('api', 'pass'), line('cors', 'pass'), line('amcp', 'fail')]),
    ).toBe(true);
  });
  it('refuses when either the keys or CORS fail', () => {
    expect(checkAllowsConnect([line('api', 'fail'), line('cors', 'pass')])).toBe(false);
    expect(checkAllowsConnect([line('api', 'pass'), line('cors', 'fail')])).toBe(false);
  });
});

describe('the Playout address as typed (DESKTOP-APPS-01-C C3)', () => {
  it('is normalised to http(s)://host:port without a trailing slash, or refused', () => {
    expect(normalisePlayoutAddress(' http://192.168.21.111:8080/ ')).toBe(
      'http://192.168.21.111:8080',
    );
    expect(normalisePlayoutAddress('https://playout.local')).toBe('https://playout.local');
    expect(normalisePlayoutAddress('ftp://x')).toBeNull();
  });

  it('an address typed without a scheme or a port is the Playout’s API port — the owner’s case', () => {
    expect(normalisePlayoutAddress('192.168.21.111')).toBe('http://192.168.21.111:8080');
    expect(normalisePlayoutAddress('http://192.168.21.111')).toBe('http://192.168.21.111:8080');
  });
});

describe('commit — the CasparCG host first, then the channel, each through its own door', () => {
  function fakeBridge(refuse?: 'connection' | 'bank') {
    const calls: string[] = [];
    const bridge = {
      connections: {
        config: async () => current,
        setConfig: async (req: ConnectionConfig) => {
          calls.push(`connections:${req.servers.A.host}`);
          return refuse === 'connection'
            ? { ok: false as const, reason: 'on-air-block' as const, message: 'on air' }
            : { ok: true as const };
        },
      },
      fixedLayers: {
        setConfig: async (req: FixedLayerBank) => {
          calls.push(`fixedLayers:${String(req.channel)}`);
          return refuse === 'bank'
            ? { ok: false as const, reason: 'untick-unknown' as const, message: 'hidden row' }
            : { ok: true as const };
        },
      },
    };
    return { bridge, calls };
  }

  it('applies both, in that order', async () => {
    const { bridge, calls } = fakeBridge();
    const refused = await commitFirstRun(bridge as never, {
      channel: 2,
      casparHost: 'caspar',
      serveHost: '10.1.1.1',
    });
    expect(refused).toBeNull();
    expect(calls).toEqual(['connections:caspar', 'fixedLayers:2']);
  });

  it('a refused connection stops before the channel, and says the bridge’s sentence', async () => {
    const { bridge, calls } = fakeBridge('connection');
    expect(
      await commitFirstRun(bridge as never, { channel: 2, casparHost: 'caspar', serveHost: '' }),
    ).toBe('on air');
    expect(calls).toEqual(['connections:caspar']);
  });
});

/** A bridge recording which bank door was called, with what. */
function bankDoors(refusal?: string): {
  bridge: Pick<RuntimeBridge, 'fixedLayers'>;
  setConfig: ReturnType<typeof vi.fn>;
  setBanks: ReturnType<typeof vi.fn>;
} {
  const answer = (): Promise<{ ok: boolean; message?: string }> =>
    Promise.resolve(refusal === undefined ? { ok: true } : { ok: false, message: refusal });
  const setConfig = vi.fn(answer);
  const setBanks = vi.fn(answer);
  return {
    bridge: { fixedLayers: { setConfig, setBanks } } as unknown as Pick<
      RuntimeBridge,
      'fixedLayers'
    >,
    setConfig,
    setBanks,
  };
}

const choice = (channel: number): ChannelChoice => ({
  channel,
  casparHost: '127.0.0.1',
  serveHost: '',
});

describe('`MULTI-CHANNEL-01` §2 E — first-run declares one or more channels', () => {
  it('🔴 ONE channel goes through set-config, exactly as before — the single-channel first-run is byte-identical', async () => {
    const doors = bankDoors();
    expect(await declareFirstRunChannels(doors.bridge, [choice(2)])).toBeNull();
    expect(doors.setConfig.mock.calls).toEqual([[firstRunBank(2)]]);
    expect(doors.setBanks).not.toHaveBeenCalled();
  });

  it('two or more go through set-banks in ONE write, each channel with first-run’s own bank', async () => {
    const doors = bankDoors();
    expect(await declareFirstRunChannels(doors.bridge, [choice(1), choice(2)])).toBeNull();
    expect(doors.setBanks.mock.calls).toEqual([[{ banks: [firstRunBank(1), firstRunBank(2)] }]]);
    expect(doors.setConfig).not.toHaveBeenCalled();
  });

  it('a refusal comes back as the bridge’s own sentence', async () => {
    const doors = bankDoors('channel 2 is not yours');
    expect(await declareFirstRunChannels(doors.bridge, [choice(1), choice(2)])).toBe(
      'channel 2 is not yours',
    );
  });
});

describe('`MULTI-CHANNEL-01` §2 M — Station setup’s next channel set', () => {
  const one: FixedLayerBank = { ...firstRunBank(1), aliases: { '99': 'ارم' } };
  const two: FixedLayerBank = { ...firstRunBank(2), aliases: { '99': 'زیرنویس' } };

  it('a KEPT channel keeps its own bank, and an ADDED one gets first-run’s', () => {
    expect(nextChannelSet([one], [1, 3])).toEqual([one, firstRunBank(3)]);
  });

  it('a one-for-one SWAP carries the station’s bank to the new channel (D-e’s replacement)', () => {
    expect(nextChannelSet([one], [2])).toEqual([{ ...one, channel: 2 }]);
  });

  it('control — a removal from two leaves the kept channel’s bank exactly as it was', () => {
    expect(nextChannelSet([one, two], [2])).toEqual([two]);
  });

  it('one bank left is written through set-config; two or more through set-banks', async () => {
    const single = bankDoors();
    await declareChannelSet(single.bridge, [one, two], [choice(2)]);
    expect(single.setConfig.mock.calls).toEqual([[two]]);
    expect(single.setBanks).not.toHaveBeenCalled();

    const plural = bankDoors();
    await declareChannelSet(plural.bridge, [one], [choice(1), choice(2)]);
    expect(plural.setBanks.mock.calls).toEqual([[{ banks: [one, firstRunBank(2)] }]]);
    expect(plural.setConfig).not.toHaveBeenCalled();
  });
});
