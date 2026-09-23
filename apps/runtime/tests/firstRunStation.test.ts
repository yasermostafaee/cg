import { describe, expect, it } from 'vitest';
import {
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
  firstRunBank,
  firstRunConnection,
  groupByHost,
  normalisePlayoutAddress,
} from '../src/renderer/features/firstRun/firstRunStation.js';

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
