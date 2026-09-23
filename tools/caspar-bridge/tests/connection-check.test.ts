import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONNECTION_CHECK_IDS,
  CONNECTION_CHECK_LINE_MS,
  SETUP_CHECK_WAIT_MS,
  type ConnectionCheckLine,
} from '@cg/shared-ipc';
import { realProbes, runConnectionCheck, type CheckProbes } from '../src/index.js';

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

/**
 * `DESKTOP-APPS-01-B` B2 / `-01-C` C7 — the AMCP line in its phases. A refusal or a drop WAITS
 * before any station admin has signed in; still waits (for the Playout) inside the window after
 * one; and after it names this machine, by its IPv4, waiting for APPROVAL in the Playout's own app.
 */
const RLI = String.fromCharCode(0x2067);
const PDI = String.fromCharCode(0x2069);
const SETTINGS = `${RLI}تنظیمات ← اتصال به CG Control${PDI}`;
/** A station admin signed in long ago: the window has passed. */
const PAST_WINDOW = { amcpSignInAt: 0, amcpTrustWindowMs: 1000 } as const;

describe('§2F / C7 — AMCP: waiting for a sign-in, for the Playout, for approval — or an answer', () => {
  it('BEFORE any station admin has signed in a refusal only WAITS — neutral, never a failure', async () => {
    const port = await closedPort();
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes({ amcp: (host, _p, t) => realProbes().amcp(host, port, t) }),
      { ports: PORTS, amcpTimeoutMs: 2000 },
    );
    expect(line(lines, 'amcp')).toEqual({
      id: 'amcp',
      status: 'wait',
      text: 'CasparCG on 127.0.0.1: waiting for sign-in.',
    });
  });

  it('INSIDE the window after the sign-in it still waits — for the Playout to let this machine in', async () => {
    const port = await closedPort();
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes({ amcp: (host, _p, t) => realProbes().amcp(host, port, t) }),
      { ports: PORTS, amcpSignInAt: Date.now(), amcpTrustWindowMs: 30_000 },
    );
    expect(line(lines, 'amcp')).toEqual({
      id: 'amcp',
      status: 'wait',
      text: 'CasparCG on 127.0.0.1: waiting for the Playout to let this machine in.',
    });
  });

  it('AFTER the window: this machine, by its IPv4, waiting for approval in the Playout — and never a script', async () => {
    const port = await closedPort();
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes({ amcp: (host, _p, t) => realProbes().amcp(host, port, t) }),
      { ports: PORTS, amcpTimeoutMs: 2000, ...PAST_WINDOW },
    );
    expect(line(lines, 'amcp')).toEqual({
      id: 'amcp',
      status: 'fail',
      text:
        `This machine, 127.0.0.1, is waiting for approval in the Playout, at ${SETTINGS}, where the ` +
        "Playout's administrator approves it. If it is not listed there, this machine reaches the " +
        'Playout through NAT, a proxy or a VPN.',
    });
  });

  it('CONTROL — a server that answers VERSION passes, before the sign-in and after the window alike', async () => {
    const port = await amcpThatAnswers();
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    for (const phase of [{}, PAST_WINDOW]) {
      const { lines } = await runConnectionCheck(
        { playoutAddress: api, origin: ORIGIN },
        probes({ amcp: (host, _p, t) => realProbes().amcp(host, port, t) }),
        { ports: PORTS, ...phase },
      );
      expect(line(lines, 'amcp')).toEqual({
        id: 'amcp',
        status: 'pass',
        text: 'CasparCG on 127.0.0.1 answered VERSION: 2.5.0 fake.',
      });
    }
  });
});

/**
 * 🔴 `DESKTOP-APPS-01-C` C2 — **THE CHECK ALWAYS RETURNS ITS LINES.** Measured on the owner's
 * machine before the fix: one after another, a black-hole Playout cost 3.0 + 5.0 + 5.0 s and the
 * console gave up at 8 s with no line at all.
 */
describe('C2 — every probe bounded, the lines in parallel, each line its own words', () => {
  it('EVERY probe at a black hole (192.0.2.1): all seven lines come back within the bound, each saying what did not answer', async () => {
    const timings: { id: string; ms: number }[] = [];
    let total = 0;
    const started = Date.now();
    const { lines } = await runConnectionCheck(
      { playoutAddress: 'http://192.0.2.1:8080', origin: ORIGIN },
      probes(),
      {
        ports: PORTS,
        onTimed: (t, ms) => {
          timings.push(...t);
          total = ms;
        },
      },
    );
    const elapsed = Date.now() - started;
    // Every line, and within the one bound the console's wait is derived from.
    expect(lines.map((l) => l.id)).toEqual([...CONNECTION_CHECK_IDS]);
    expect(elapsed).toBeLessThan(SETUP_CHECK_WAIT_MS);
    expect(total).toBeLessThanOrEqual(CONNECTION_CHECK_LINE_MS + 500);
    for (const t of timings) expect(t.ms, t.id).toBeLessThanOrEqual(CONNECTION_CHECK_LINE_MS + 500);
    // What did not answer, in the check's words. A host whose route is a TUN accepts every
    // connection and never replies (measured on the dev host), which is the other no-answer shape.
    const noAnswer =
      /^No answer from 192\.0\.2\.1 on port 8080\.$|^192\.0\.2\.1 accepted the connection on port 8080 but did not reply in time\.$/;
    expect(line(lines, 'api').text).toMatch(noAnswer);
    expect(line(lines, 'cors').text).toMatch(noAnswer);
    // AMCP, before any station admin has signed in, waits — a drop is not judged yet.
    expect(line(lines, 'amcp').status).toMatch(/^(wait|fail)$/);
  });

  it('CONTROL — against the fakes every network line comes back OK', async () => {
    const port = await amcpThatAnswers();
    const api = await fakeApi({ keys: [{ kid: 'k1' }], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes({
        amcp: (host, _p, t) => realProbes().amcp(host, port, t),
        // Not this machine, so the topology advice does not apply to a loopback fake.
        resolve: async () => ['10.0.0.1'],
      }),
      { ports: PORTS },
    );
    expect(lines.map((l) => l.id)).toEqual([...CONNECTION_CHECK_IDS]);
    for (const l of lines) {
      if (l.id === 'proxy') continue; // this host's own VPN state, not the Playout's
      expect(l.status, `${l.id}: ${l.text}`).toBe('pass');
    }
  });

  it('C6 — a host with no IPv4 address is ONE line, and the address-bound probes are not run', async () => {
    const { lines } = await runConnectionCheck(
      { playoutAddress: 'http://playout.example:8080', origin: ORIGIN },
      probes({ ipv4: async () => null }),
      { ports: PORTS },
    );
    expect(lines.map((l) => l.id)).toEqual(['proxy', 'route', 'ports', 'topology']);
    expect(line(lines, 'route')).toEqual({
      id: 'route',
      status: 'fail',
      text: 'playout.example has no IPv4 address. CG Control reaches the Playout over IPv4 — type its IPv4 address.',
    });
  });

  it('C3 — an address typed with no scheme is checked as http://, its explicit port kept', async () => {
    const api = await fakeApi({ keys: [{ kid: 'k1' }], allowOrigin: ORIGIN });
    const bare = api.replace(/^http:\/\//, '');
    const { lines } = await runConnectionCheck({ playoutAddress: bare, origin: ORIGIN }, probes(), {
      ports: PORTS,
      amcpTimeoutMs: 300,
    });
    expect(line(lines, 'api').status).toBe('pass');
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

  it('the four failure shapes print four DIFFERENT sentences — a closed port, a black hole, a wrong CORS origin, an empty key set', async () => {
    const port = await closedPort();
    const refused = line(
      (
        await runConnectionCheck(
          { playoutAddress: `http://127.0.0.1:${String(port)}`, origin: ORIGIN },
          probes(),
          { ports: PORTS, amcpTimeoutMs: 300 },
        )
      ).lines,
      'api',
    );
    expect(refused.text).toBe(`127.0.0.1 answers, but nothing listens on port ${String(port)}.`);
    const dropped = line(
      (
        await runConnectionCheck(
          { playoutAddress: 'http://192.0.2.1:8080', origin: ORIGIN },
          probes(),
          { ports: PORTS, amcpTimeoutMs: 300, connectMs: 500, lineMs: 1500 },
        )
      ).lines,
      'api',
    );
    const api = await fakeApi({ keys: [], allowOrigin: 'http://elsewhere.example' });
    const all = (
      await runConnectionCheck({ playoutAddress: api, origin: ORIGIN }, probes(), {
        ports: PORTS,
        amcpTimeoutMs: 300,
      })
    ).lines;
    const texts = [refused.text, dropped.text, line(all, 'api').text, line(all, 'cors').text];
    expect(new Set(texts).size).toBe(4);
    for (const l of [refused, dropped, line(all, 'api'), line(all, 'cors')])
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
    // (A bare host name is NOT mistyped since `-01-C` C3 — `playout` is checked as
    // `http://playout:8080`. What cannot be an http address still is.)
    const { lines } = await runConnectionCheck(
      { playoutAddress: 'ftp://playout', origin: ORIGIN },
      probes(),
      { ports: PORTS },
    );
    expect(lines).toEqual([
      {
        id: 'api',
        status: 'fail',
        text: 'ftp://playout is not a Playout address. Type it as http://host:port.',
      },
    ]);
  });
});
