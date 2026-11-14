import { describe, expect, it } from 'vitest';
import {
  readPlayoutPgmTopology,
  type PlayoutPgmTopologyOptions,
} from '../src/playout-pgm-topology.js';

const HOSTS = ['192.0.2.11:8080', '192.0.2.22:8080', '192.0.2.33:8080', '192.0.2.44:8080'] as const;
const [A, B, C, D] = HOSTS;
const CHANNEL = 'main';
const UNLINKED = '192.0.2.50:8080';

function origin(host: string): string {
  return 'http://' + host;
}

function peers(self: string, listed: readonly string[] = [...HOSTS, UNLINKED]) {
  return listed.map((host) => ({
    name: 'Broadcast Engine',
    instanceId: host,
    baseUrl: origin(host),
    self: host === self,
  }));
}

function row(code: string, channelNumber: number) {
  return {
    code,
    primaryOutput: { host: '127.0.0.1', channelNumber, layerNumber: 5, apiPort: 5250 },
  };
}

function master(hosts: readonly string[]) {
  return {
    ...row(CHANNEL, 5),
    mirrorOf: null,
    role: 'master',
    slaves: hosts.map((host) => ({
      host,
      remoteCode: 'mirror',
      // This historical hint must never determine the remote programme port.
      remoteChannelNumber: 999,
    })),
  };
}

function reserve(channelNumber: number) {
  return {
    ...row('mirror', channelNumber),
    slaves: [],
    role: 'slave',
    mirrorOf: { masterHost: A, masterCode: CHANNEL },
  };
}

function authority(code: string, local: boolean, peerHost: string | null, epoch = 120) {
  const peerCode = peerHost === null ? null : peerHost === A ? CHANNEL : 'mirror';
  return {
    code,
    epoch,
    owner: local ? 'local' : 'peer',
    phase: local ? 'acquired' : 'observed',
    canControl: local,
    peerHost: peerHost === null ? null : origin(peerHost),
    peerCode,
  };
}

const apiRoutes = {
  channels: '/api/v1/channels',
  peers: '/api/v1/discovery/peers',
  control: (code: string) => '/api/v1/channels/' + encodeURIComponent(code) + '/redundancy/control',
};

function fourNodes() {
  return new Map<string, unknown>([
    [origin(A) + apiRoutes.channels, [master([D, B, C])]],
    [origin(A) + apiRoutes.peers, peers(A)],
    [origin(B) + apiRoutes.channels, [reserve(3)]],
    [origin(C) + apiRoutes.channels, [reserve(8)]],
    [origin(D) + apiRoutes.channels, [reserve(12)]],
    [origin(A) + apiRoutes.control(CHANNEL), authority(CHANNEL, true, B)],
    [origin(B) + apiRoutes.control('mirror'), authority('mirror', false, A)],
    [origin(C) + apiRoutes.control('mirror'), authority('mirror', false, A)],
    [origin(D) + apiRoutes.control('mirror'), authority('mirror', false, A)],
  ]);
}

function fake(routes: ReadonlyMap<string, unknown>) {
  const calls: string[] = [];
  const fetchImpl: NonNullable<PlayoutPgmTopologyOptions['fetchImpl']> = (raw, init) => {
    const url = raw instanceof URL ? raw.href : String(raw);
    calls.push(url);
    expect(init?.method).toBe('GET');
    expect(init?.headers).toBeUndefined();
    expect(init?.redirect).toBe('error');
    const data = routes.get(url);
    return Promise.resolve(
      data instanceof Response
        ? data
        : data === undefined
          ? new Response('', { status: 404 })
          : Response.json(data),
    );
  };
  return { calls, fetchImpl };
}

describe('readPlayoutPgmTopology', () => {
  it('reads four linked programmes, uses reciprocal physical channels and ignores unrelated peers', async () => {
    const client = fake(fourNodes());
    const topology = await readPlayoutPgmTopology(new URL(origin(A)), CHANNEL, client);

    expect(topology?.activeMemberKey).toBe(origin(A));
    expect(topology?.members).toEqual([
      {
        key: origin(A),
        name: 'Broadcast Engine (192.0.2.11)',
        channelCode: CHANNEL,
        pgmHost: '192.0.2.11',
        physicalChannel: 5,
      },
      {
        key: origin(B),
        name: 'Broadcast Engine (192.0.2.22)',
        channelCode: 'mirror',
        pgmHost: '192.0.2.22',
        physicalChannel: 3,
      },
      {
        key: origin(C),
        name: 'Broadcast Engine (192.0.2.33)',
        channelCode: 'mirror',
        pgmHost: '192.0.2.33',
        physicalChannel: 8,
      },
      {
        key: origin(D),
        name: 'Broadcast Engine (192.0.2.44)',
        channelCode: 'mirror',
        pgmHost: '192.0.2.44',
        physicalChannel: 12,
      },
    ]);
    expect(client.calls).not.toContain(origin(UNLINKED) + apiRoutes.channels);
  });

  it('keeps configured mirror first after failover while requiring an acquired and corroborated owner', async () => {
    const routes = fourNodes();
    routes.set(origin(B) + apiRoutes.peers, peers(B));
    routes.set(origin(A) + apiRoutes.control(CHANNEL), authority(CHANNEL, false, B));
    routes.set(origin(B) + apiRoutes.control('mirror'), authority('mirror', true, A));
    routes.set(origin(C) + apiRoutes.control('mirror'), authority('mirror', false, B));
    routes.set(origin(D) + apiRoutes.control('mirror'), authority('mirror', false, B));

    const topology = await readPlayoutPgmTopology(new URL(origin(B)), 'mirror', fake(routes));

    expect(topology?.members.map(({ key }) => key)).toEqual([
      origin(B),
      origin(A),
      origin(C),
      origin(D),
    ]);
    expect(topology?.activeMemberKey).toBe(origin(B));
  });

  it('correlates the current transfer even when engines report different local epochs', async () => {
    const routes = fourNodes();
    routes.set(origin(A) + apiRoutes.channels, [master([B])]);
    const transferId = 'manual-transfer';
    routes.set(origin(A) + apiRoutes.control(CHANNEL), {
      ...authority(CHANNEL, false, B, 118),
      transferId,
    });
    routes.set(origin(B) + apiRoutes.control('mirror'), {
      ...authority('mirror', true, A, 121),
      transferId,
    });
    const read = () => readPlayoutPgmTopology(new URL(origin(A)), CHANNEL, fake(routes));
    expect((await read())?.activeMemberKey).toBe(origin(B));

    routes.set(origin(A) + apiRoutes.control(CHANNEL), {
      ...authority(CHANNEL, false, B, 121),
      transferId: 'previous-transfer',
    });
    expect((await read())?.activeMemberKey).toBeNull();
  });

  it('finishes a cancelled read with a pending peer DNS lookup', async () => {
    const controller = new AbortController();
    const client = fake(fourNodes());
    let resolveStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => (resolveStarted = resolve));
    const read = readPlayoutPgmTopology(new URL(origin(A)), CHANNEL, {
      ...client,
      signal: controller.signal,
      resolveIPv4: () => {
        resolveStarted();
        return new Promise(() => undefined);
      },
    });
    await started;
    controller.abort();
    expect(await read).toBeNull();
    expect(client.calls.every((call) => call.startsWith(origin(A)))).toBe(true);
  });

  it.each([
    authority('mirror', false, A, 119),
    authority('mirror', true, A),
    { ...authority('mirror', false, A), phase: 'acquiring' },
    authority('mirror', false, UNLINKED),
    null,
  ])('leaves ownership unknown if a control response disagrees: %j', async (control) => {
    const routes = fourNodes();
    routes.set(origin(B) + apiRoutes.control('mirror'), control);

    const topology = await readPlayoutPgmTopology(new URL(origin(A)), CHANNEL, fake(routes));
    expect(topology?.activeMemberKey).toBeNull();
    expect(topology?.members.map(({ physicalChannel }) => physicalChannel)).toEqual([5, 3, 8, 12]);
  });

  it('shows a declared but undiscovered or mismatched mirror with no return', async () => {
    const routes = fourNodes();
    routes.set(origin(A) + apiRoutes.peers, peers(A, [A, B, D, UNLINKED]));
    routes.set(origin(B) + apiRoutes.channels, [
      { ...reserve(3), mirrorOf: { masterHost: A, masterCode: 'unrelated' } },
    ]);
    const client = fake(routes);

    const topology = await readPlayoutPgmTopology(new URL(origin(A)), CHANNEL, client);
    expect(topology?.activeMemberKey).toBeNull();
    expect(topology?.members.map(({ physicalChannel }) => physicalChannel)).toEqual([
      5,
      null,
      null,
      12,
    ]);
    expect(client.calls).not.toContain(origin(C) + apiRoutes.channels);
    expect(client.calls.some((url) => url.includes('/redundancy/control'))).toBe(false);
  });

  it('rejects an unrelated output host and never follows a redirect', async () => {
    const routes = fourNodes();
    routes.set(origin(B) + apiRoutes.channels, [
      { ...reserve(3), primaryOutput: { host: '192.0.2.50', channelNumber: 3 } },
    ]);
    routes.set(
      origin(D) + apiRoutes.channels,
      new Response('', {
        status: 302,
        headers: { location: origin(UNLINKED) + apiRoutes.channels },
      }),
    );
    const client = fake(routes);

    const topology = await readPlayoutPgmTopology(new URL(origin(A)), CHANNEL, client);
    expect(topology?.members.map(({ pgmHost }) => pgmHost)).toEqual([
      '192.0.2.11',
      null,
      '192.0.2.33',
      null,
    ]);
    expect(client.calls).not.toContain(origin(UNLINKED) + apiRoutes.channels);
  });

  it('pins a linked hostname before the peer read and refuses DNS aliases to loopback', async () => {
    const hostname = 'backup.example.test';
    const host = hostname + ':8080';
    const routes = new Map<string, unknown>([
      [origin(A) + apiRoutes.channels, [master([host])]],
      [origin(A) + apiRoutes.peers, peers(A, [A, host])],
      [origin(host) + apiRoutes.channels, [reserve(3)]],
    ]);
    const client = fake(routes);
    const refused = await readPlayoutPgmTopology(new URL(origin(A)), CHANNEL, {
      ...client,
      resolveIPv4: async () => '127.0.0.1',
    });
    expect(refused?.members[1]?.physicalChannel).toBeNull();
    expect(client.calls).not.toContain(origin(host) + apiRoutes.channels);

    const resolved: string[] = [];
    const topology = await readPlayoutPgmTopology(new URL(origin(A)), CHANNEL, {
      ...client,
      resolveIPv4: async (name) => {
        resolved.push(name);
        return '192.0.2.22';
      },
    });
    expect(resolved).toContain(hostname);
    expect(topology?.members[1]).toMatchObject({ pgmHost: hostname, physicalChannel: 3 });
  });

  it('returns no topology on an old, duplicate, redirected, or unreachable catalogue', async () => {
    const url = origin(A) + apiRoutes.channels;
    for (const response of [
      undefined,
      { channels: [master([B])] },
      [row(CHANNEL, 5)],
      [master([B]), master([C])],
      Response.redirect(origin(B) + apiRoutes.channels, 302),
    ]) {
      const client = fake(new Map([[url, response]]));
      expect(await readPlayoutPgmTopology(new URL(origin(A)), CHANNEL, client)).toBeNull();
      expect(client.calls.every((call) => call.startsWith(origin(A)))).toBe(true);
    }
  });

  it('does not treat a duplicate link as settings for two members', async () => {
    const routes = fourNodes();
    routes.set(origin(A) + apiRoutes.channels, [master([C, B, B])]);
    const client = fake(routes);

    const topology = await readPlayoutPgmTopology(new URL(origin(A)), CHANNEL, client);
    expect(topology?.activeMemberKey).toBeNull();
    expect(topology?.members.map(({ key }) => key)).toEqual([origin(A), origin(C)]);
    expect(client.calls).not.toContain(origin(B) + apiRoutes.channels);
  });

  it('leaves unlinked stations usable and does not assume an active state without a control fact', async () => {
    const routes = new Map<string, unknown>([
      [origin(A) + apiRoutes.channels, [{ ...row(CHANNEL, 5), mirrorOf: null, slaves: [] }]],
    ]);
    const read = () => readPlayoutPgmTopology(new URL(origin(A)), CHANNEL, fake(routes));

    expect(await read()).toEqual({
      members: [
        {
          key: origin(A),
          channelCode: CHANNEL,
          name: '192.0.2.11',
          pgmHost: '192.0.2.11',
          physicalChannel: 5,
        },
      ],
      activeMemberKey: null,
    });
    routes.set(origin(A) + apiRoutes.control(CHANNEL), {
      ...authority(CHANNEL, true, null, 0),
      phase: 'default',
    });
    expect((await read())?.activeMemberKey).toBe(origin(A));
  });
});
