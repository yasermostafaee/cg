import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConnectionCheckLine } from '@cg/shared-ipc';
import { probeRoute, realProbes, runConnectionCheck, type CheckProbes } from '../src/index.js';

/**
 * 🔴 `DESKTOP-APPS-01` §2F / §5 — **THE CONNECTION CHECK: every failure shape prints its own
 * sentence, and each has the passing control that makes the failure mean something.**
 *
 * The network probes are REAL (a real socket to a closed port, to TEST-NET, a real HTTP server
 * answering OPTIONS and the JWKS); only the Windows-only readers — the process list, the system
 * proxy, the port table — are pinned, so the suite is the same on every host.
 */

const ORIGIN = 'http://127.0.0.1:5174';
const PORTS = { console: 5174, control: 5280, templates: 7911, osc: 6250 };
const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function probes(overrides: Partial<CheckProbes> = {}): CheckProbes {
  return {
    ...realProbes(),
    processes: async () => [],
    systemProxy: async () => null,
    portHolder: async () => ({ kind: 'free' }),
    localAddresses: () => [],
    resolve: async (host) => [host],
    ...overrides,
  };
}

/** A fake Playout API: the JWKS and the token endpoint's CORS preflight, both configurable. */
async function fakeApi(opts: { keys: unknown[]; allowOrigin: string | null }): Promise<string> {
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS' && req.url === '/api/cg/auth/token') {
      res.writeHead(
        204,
        opts.allowOrigin === null ? {} : { 'access-control-allow-origin': opts.allowOrigin },
      );
      res.end();
      return;
    }
    if (req.method === 'GET' && req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: opts.keys }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise((resolve) => server.close(() => resolve())));
  const addr = server.address() as net.AddressInfo;
  return `http://127.0.0.1:${String(addr.port)}`;
}

/** A port that was listening a moment ago and is now closed: connecting to it is REFUSED. */
async function closedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** A CasparCG stand-in that answers VERSION the way the server does. */
async function amcpThatAnswers(): Promise<number> {
  const server = net.createServer((socket) => {
    socket.on('data', () => socket.write('201 VERSION OK\r\n2.5.0 fake\r\n'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise((resolve) => server.close(() => resolve())));
  return (server.address() as net.AddressInfo).port;
}

const line = (
  lines: readonly ConnectionCheckLine[],
  id: ConnectionCheckLine['id'],
): ConnectionCheckLine => {
  const found = lines.find((l) => l.id === id);
  if (found === undefined) throw new Error(`no ${id} line`);
  return found;
};

describe('§2F — AMCP: a reset, a timeout and an answer are three different lines', () => {
  it('a CLOSED port is a reset: reachable, refused — no firewall command', async () => {
    const port = await closedPort();
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes({ amcp: (host, _p, t) => realProbes().amcp(host, port, t) }),
      { ports: PORTS, amcpTimeoutMs: 2000 },
    );
    const amcp = line(lines, 'amcp');
    expect(amcp.status).toBe('fail');
    expect(amcp.text).toBe(
      '127.0.0.1 refused the connection on port 5250. CasparCG is not running there, or the port is closed.',
    );
    expect(amcp.command).toBeUndefined();
  });

  it('192.0.2.1 (RFC 5737) is a TIMEOUT: a dropped connection, and the exact command to run', async () => {
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, casparHost: '192.0.2.1', origin: ORIGIN },
      probes(),
      { ports: PORTS, amcpTimeoutMs: 1500 },
    );
    /*
      ⚠ A host whose traffic runs through a TUN cannot show a DROP: the tunnel's own stack accepts
      every connection (measured on the dev host, 2026-09-23 — sing-box's `singbox_tun` owned a
      default route, and 192.0.2.1:5250 CONNECTED). There the check's duty is its first line, and
      that is what is asserted; everywhere else — CI's clean runner included — the timeout itself.
    */
    const toTestNet = await probeRoute('192.0.2.1');
    if (toTestNet !== null && /tun|tap|wintun|wireguard|vpn/i.test(toTestNet.iface)) {
      expect(line(lines, 'proxy').status).toBe('fail');
      return;
    }
    const amcp = line(lines, 'amcp');
    expect(amcp.status).toBe('fail');
    expect(amcp.text).toBe(
      "No answer from 192.0.2.1 on port 5250: its firewall drops this machine. The Playout's administrator runs this on the Playout server:",
    );
    expect(amcp.command).toMatch(/^\.\\secure-ports\.ps1 -AllowAmcpFrom \S+$/);
  });

  it('CONTROL — a server that answers VERSION passes, with the version it gave', async () => {
    const port = await amcpThatAnswers();
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes({ amcp: (host, _p, t) => realProbes().amcp(host, port, t) }),
      { ports: PORTS },
    );
    expect(line(lines, 'amcp')).toEqual({
      id: 'amcp',
      status: 'pass',
      text: 'CasparCG on 127.0.0.1 answered VERSION: 2.5.0 fake.',
    });
  });
});

describe('§2F — the Playout API and CORS', () => {
  it('an EMPTY key set fails in its own words; control: one key passes', async () => {
    const empty = await fakeApi({ keys: [], allowOrigin: ORIGIN });
    const failed = line(
      (
        await runConnectionCheck({ playoutAddress: empty, origin: ORIGIN }, probes(), {
          ports: PORTS,
          amcpTimeoutMs: 300,
        })
      ).lines,
      'api',
    );
    expect(failed.status).toBe('fail');
    expect(failed.text).toContain('publishes no signing keys');

    const good = await fakeApi({ keys: [{ kid: 'k1' }], allowOrigin: ORIGIN });
    const passed = line(
      (
        await runConnectionCheck({ playoutAddress: good, origin: ORIGIN }, probes(), {
          ports: PORTS,
          amcpTimeoutMs: 300,
        })
      ).lines,
      'api',
    );
    expect(passed).toEqual({
      id: 'api',
      status: 'pass',
      text: 'The Playout answers and publishes 1 signing key.',
    });
  });

  it('a WRONG CORS origin fails and prints the one line to add; control: the right origin passes', async () => {
    const wrong = await fakeApi({ keys: [{}], allowOrigin: 'http://elsewhere.example' });
    const failed = line(
      (
        await runConnectionCheck({ playoutAddress: wrong, origin: ORIGIN }, probes(), {
          ports: PORTS,
          amcpTimeoutMs: 300,
        })
      ).lines,
      'cors',
    );
    expect(failed).toEqual({
      id: 'cors',
      status: 'fail',
      text: "The Playout does not accept sign-in from this console. Its administrator adds this line to the Playout's CORS list:",
      command: ORIGIN,
    });

    const right = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    expect(
      line(
        (
          await runConnectionCheck({ playoutAddress: right, origin: ORIGIN }, probes(), {
            ports: PORTS,
            amcpTimeoutMs: 300,
          })
        ).lines,
        'cors',
      ).status,
    ).toBe('pass');
  });

  it('the four failure shapes print four DIFFERENT sentences', async () => {
    const port = await closedPort();
    const api = await fakeApi({ keys: [], allowOrigin: 'http://elsewhere.example' });
    const refused = line(
      (
        await runConnectionCheck(
          { playoutAddress: api, origin: ORIGIN },
          probes({ amcp: (h, _p, t) => realProbes().amcp(h, port, t) }),
          { ports: PORTS },
        )
      ).lines,
      'amcp',
    );
    const timeout = line(
      (
        await runConnectionCheck(
          { playoutAddress: api, casparHost: '192.0.2.1', origin: ORIGIN },
          probes(),
          { ports: PORTS, amcpTimeoutMs: 1500 },
        )
      ).lines,
      'amcp',
    );
    const all = (
      await runConnectionCheck({ playoutAddress: api, origin: ORIGIN }, probes(), {
        ports: PORTS,
        amcpTimeoutMs: 300,
      })
    ).lines;
    const texts = [refused.text, timeout.text, line(all, 'api').text, line(all, 'cors').text];
    expect(new Set(texts).size).toBe(4);
    for (const l of [refused, timeout, line(all, 'api'), line(all, 'cors')])
      expect(l.status).toBe('fail');
  });
});

describe('§2F — the local lines: VPN or proxy, ports, topology', () => {
  it('a recognisable interceptor is NAMED; control: nothing running passes', async () => {
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const intercepted = line(
      (
        await runConnectionCheck(
          { playoutAddress: api, origin: ORIGIN },
          probes({ processes: async () => ['explorer.exe', 'v2rayN.exe'] }),
          { ports: PORTS, amcpTimeoutMs: 300 },
        )
      ).lines,
      'proxy',
    );
    expect(intercepted.status).toBe('fail');
    expect(intercepted.text).toContain('v2rayN is running');
    // Control: nothing running, no proxy, and a route out through a LAN card (pinned, because a
    // developer's own machine may well be running exactly what this line exists to catch).
    const lan = { route: async () => ({ address: '192.168.1.20', iface: 'Ethernet' }) };
    expect(
      line(
        (
          await runConnectionCheck({ playoutAddress: api, origin: ORIGIN }, probes(lan), {
            ports: PORTS,
            amcpTimeoutMs: 300,
          })
        ).lines,
        'proxy',
      ),
    ).toEqual({ id: 'proxy', status: 'pass', text: 'No VPN or proxy in the way.' });
    // …and the same machine with a tunnel owning the route out is named by its interface.
    const tunnelled = line(
      (
        await runConnectionCheck(
          { playoutAddress: api, origin: ORIGIN },
          probes({ route: async () => ({ address: '172.18.0.1', iface: 'singbox_tun' }) }),
          { ports: PORTS, amcpTimeoutMs: 300 },
        )
      ).lines,
      'proxy',
    );
    expect(tunnelled.text).toBe(
      "A tunnel (singbox_tun) carries this machine's traffic. Turn it off, then check again.",
    );
  });

  it('a port held by another program names it; control: the station’s own ports pass', async () => {
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const held = line(
      (
        await runConnectionCheck(
          { playoutAddress: api, origin: ORIGIN },
          probes({
            portHolder: async (proto, port) =>
              proto === 'udp' && port === 6250
                ? { kind: 'other', name: 'casparcg.exe', pid: 4242 }
                : { kind: 'self' },
          }),
          { ports: PORTS, amcpTimeoutMs: 300 },
        )
      ).lines,
      'ports',
    );
    expect(held.status).toBe('fail');
    expect(held.text).toContain('6250/udp is held by casparcg.exe (PID 4242)');
    const ok = line(
      (
        await runConnectionCheck(
          { playoutAddress: api, origin: ORIGIN },
          probes({ portHolder: async () => ({ kind: 'self' }) }),
          { ports: PORTS, amcpTimeoutMs: 300 },
        )
      ).lines,
      'ports',
    );
    expect(ok).toEqual({
      id: 'ports',
      status: 'pass',
      text: 'Ports 5174, 5280, 7911 and 6250/udp are free for this station.',
    });
  });

  it('the Playout on THIS machine is a warning, not a failure; control: another machine passes', async () => {
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const here = line(
      (
        await runConnectionCheck({ playoutAddress: api, origin: ORIGIN }, probes(), {
          ports: PORTS,
          amcpTimeoutMs: 300,
        })
      ).lines,
      'topology',
    );
    expect(here.status).toBe('warn');
    const away = line(
      (
        await runConnectionCheck(
          { playoutAddress: api, origin: ORIGIN },
          probes({ resolve: async () => ['10.20.30.40'] }),
          { ports: PORTS, amcpTimeoutMs: 300 },
        )
      ).lines,
      'topology',
    );
    expect(away.status).toBe('pass');
  });

  it('a mistyped address is one line saying so', async () => {
    const { lines } = await runConnectionCheck(
      { playoutAddress: 'playout', origin: ORIGIN },
      probes(),
      { ports: PORTS },
    );
    expect(lines).toEqual([
      {
        id: 'api',
        status: 'fail',
        text: 'playout is not a Playout address. Type it as http://host:port.',
      },
    ]);
  });
});
