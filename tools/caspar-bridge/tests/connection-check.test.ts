import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AMCP_TRUST_WINDOW_MS,
  CONNECTION_CHECK_IDS,
  CONNECTION_CHECK_LINE_MS,
  SETUP_CHECK_LET_IN_WAIT_MS,
  SETUP_CHECK_WAIT_MS,
  type ConnectionCheckLine,
} from '@cg/shared-ipc';
import { ProbeError } from '../src/connection-check.js';
import {
  realProbes,
  runConnectionCheck,
  type AmcpOutcome,
  type CheckProbes,
} from '../src/index.js';

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
 * 🔴 `DELTA-MULTI-CHANNEL-01-A` A2 — **THE HOLD.** The console's one automatic re-run, after a
 * station admin's sign-in, asks the bridge to answer the AMCP line once the Playout has let this
 * machine in (`awaitLetIn`). Within the window the bridge asks CasparCG again ITSELF, so the console
 * gets one answer where it used to re-run the whole check every two seconds (the owner's loop).
 */
describe('DELTA-MULTI-CHANNEL-01-A A2 — a held AMCP line answers once this machine is let in', () => {
  it('refused, then let in: the held line PASSES, having asked CasparCG again itself; control: the same check unheld only waits', async () => {
    const refused = await closedPort();
    const answering = await amcpThatAnswers();
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    let letIn = false;
    let asked = 0;
    const amcp: CheckProbes['amcp'] = (host, _p, t) => {
      asked += 1;
      return realProbes().amcp(host, letIn ? answering : refused, t);
    };
    const inWindow = {
      ports: PORTS,
      amcpSignInAt: Date.now(),
      amcpTrustWindowMs: 30_000,
      letInRetryMs: 20,
    };

    // CONTROL — unheld, inside the window: one probe, and the line waits, as it always has.
    const unheld = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes({ amcp }),
      inWindow,
    );
    expect(line(unheld.lines, 'amcp').status).toBe('wait');
    expect(asked).toBe(1);

    asked = 0;
    setTimeout(() => {
      letIn = true;
    }, 150);
    const held = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN, awaitLetIn: true },
      probes({ amcp }),
      inWindow,
    );
    expect(line(held.lines, 'amcp')).toEqual({
      id: 'amcp',
      status: 'pass',
      text: 'CasparCG on 127.0.0.1 answered VERSION: 2.5.0 fake.',
    });
    expect(asked).toBeGreaterThan(1);
    // Only that line waited: every other line is the unheld check's.
    expect(held.lines.filter((l) => l.id !== 'amcp')).toEqual(
      unheld.lines.filter((l) => l.id !== 'amcp'),
    );
  });

  it('never let in: the held line answers when the window ends — naming the approval, not waiting', async () => {
    const refused = await closedPort();
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const signedInAt = Date.now();
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN, awaitLetIn: true },
      probes({ amcp: (host, _p, t) => realProbes().amcp(host, refused, t) }),
      { ports: PORTS, amcpSignInAt: signedInAt, amcpTrustWindowMs: 400, letInRetryMs: 20 },
    );
    expect(Date.now() - signedInAt).toBeGreaterThanOrEqual(400);
    expect(line(lines, 'amcp').status).toBe('fail');
    expect(line(lines, 'amcp').text).toContain('is waiting for approval in the Playout');
  });

  it('no hold before any sign-in, nor once the window has passed — one probe, as before', async () => {
    const refused = await closedPort();
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    let asked = 0;
    const amcp: CheckProbes['amcp'] = (host, _p, t) => {
      asked += 1;
      return realProbes().amcp(host, refused, t);
    };
    for (const phase of [{}, PAST_WINDOW]) {
      asked = 0;
      await runConnectionCheck(
        { playoutAddress: api, origin: ORIGIN, awaitLetIn: true },
        probes({ amcp }),
        { ports: PORTS, letInRetryMs: 20, ...phase },
      );
      expect(asked).toBe(1);
    }
  });

  it('the console waits for a held check at least the window and a line’s bound', () => {
    expect(SETUP_CHECK_LET_IN_WAIT_MS).toBeGreaterThanOrEqual(
      AMCP_TRUST_WINDOW_MS + CONNECTION_CHECK_LINE_MS,
    );
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
    // `CHECK-RERUN-01` B — said ONCE: CORS needs the API, so it is not checked, not a repeat.
    expect(line(lines, 'cors')).toEqual({
      id: 'cors',
      status: 'skip',
      text: 'Sign-in from this console: not checked — the Playout does not answer.',
    });
    // …and AMCP does not wait for a sign-in no Playout can take: it is its own result, a failure.
    expect(line(lines, 'amcp').status).toBe('fail');
    expect(line(lines, 'amcp').text).not.toMatch(/sign-in/);
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
    // (Since `CHECK-RERUN-01` B the wrong origin is read off a Playout WITH keys: behind an empty
    // key set the CORS line is not checked, so it cannot fail on its own there.)
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
    const keyless = await fakeApi({ keys: [], allowOrigin: ORIGIN });
    const empty = line(
      (
        await runConnectionCheck({ playoutAddress: keyless, origin: ORIGIN }, probes(), {
          ports: PORTS,
          amcpTimeoutMs: 300,
        })
      ).lines,
      'api',
    );
    const elsewhere = await fakeApi({ keys: [{}], allowOrigin: 'http://elsewhere.example' });
    const wrongOrigin = line(
      (
        await runConnectionCheck({ playoutAddress: elsewhere, origin: ORIGIN }, probes(), {
          ports: PORTS,
          amcpTimeoutMs: 300,
        })
      ).lines,
      'cors',
    );
    const texts = [refused.text, dropped.text, empty.text, wrongOrigin.text];
    expect(new Set(texts).size).toBe(4);
    for (const l of [refused, dropped, empty, wrongOrigin]) expect(l.status).toBe('fail');
  });
});

/**
 * 🔴 `CHECK-RERUN-01` B — **ONE FAULT IS SAID ONCE.** The owner's dialog, 2026-09-24, with the
 * Playout off: "No answer from 192.168.21.111 on port 8080." on the API line AND on the CORS line,
 * and AMCP "waiting for sign-in" when no sign-in could work. Each absence has its control.
 */
describe('CHECK-RERUN-01 B — a line that needs the API line says so, once', () => {
  /** The Playout's API as the owner met it: nothing answers the connection. */
  const silentApi: Partial<CheckProbes> = {
    request: () => Promise.reject(new ProbeError('CONNECT_TIMEOUT')),
  };
  const amcpSays = (outcome: AmcpOutcome): Partial<CheckProbes> => ({
    amcp: () => Promise.resolve(outcome),
  });
  const PLAYOUT_OFF = { playoutAddress: 'http://127.0.0.1:8080', origin: ORIGIN } as const;

  it('API DOWN — CORS reads "not checked" with the reason, and the no-answer is said ONCE', async () => {
    const { lines } = await runConnectionCheck(
      PLAYOUT_OFF,
      probes({ ...silentApi, ...amcpSays({ kind: 'refused' }) }),
      { ports: PORTS },
    );
    expect(line(lines, 'api')).toEqual({
      id: 'api',
      status: 'fail',
      text: 'No answer from 127.0.0.1 on port 8080.',
    });
    expect(line(lines, 'cors')).toEqual({
      id: 'cors',
      status: 'skip',
      text: 'Sign-in from this console: not checked — the Playout does not answer.',
    });
    expect(lines.filter((l) => l.text.includes('on port 8080'))).toHaveLength(1);
  });

  it('CONTROL — with the API up, CORS is evaluated, and fails on its own', async () => {
    const api = await fakeApi({ keys: [{}], allowOrigin: 'http://elsewhere.example' });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes(amcpSays({ kind: 'refused' })),
      { ports: PORTS },
    );
    expect(line(lines, 'api').status).toBe('pass');
    expect(line(lines, 'cors')).toMatchObject({ status: 'fail', command: ORIGIN });
  });

  it('an API that answers with NO signing keys — CORS is not checked, and says that is why', async () => {
    const api = await fakeApi({ keys: [], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes(amcpSays({ kind: 'refused' })),
      { ports: PORTS },
    );
    expect(line(lines, 'api').status).toBe('fail');
    expect(line(lines, 'cors')).toEqual({
      id: 'cors',
      status: 'skip',
      text: 'Sign-in from this console: not checked — the Playout publishes no signing keys.',
    });
  });

  it('API DOWN — AMCP before any sign-in is its OWN result, said plainly, never "waiting for sign-in"', async () => {
    const cases: readonly [AmcpOutcome, string][] = [
      [{ kind: 'refused' }, '127.0.0.1 refused the connection on port 5250.'],
      [{ kind: 'timeout' }, 'No answer from 127.0.0.1 on port 5250.'],
    ];
    for (const [outcome, text] of cases) {
      const { lines } = await runConnectionCheck(
        PLAYOUT_OFF,
        probes({ ...silentApi, ...amcpSays(outcome) }),
        { ports: PORTS },
      );
      expect(line(lines, 'amcp'), outcome.kind).toEqual({ id: 'amcp', status: 'fail', text });
    }
  });

  it('CONTROL — with the API up and AMCP refused, it waits for sign-in', async () => {
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes(amcpSays({ kind: 'refused' })),
      { ports: PORTS },
    );
    expect(line(lines, 'amcp')).toEqual({
      id: 'amcp',
      status: 'wait',
      text: 'CasparCG on 127.0.0.1: waiting for sign-in.',
    });
  });

  it('API DOWN and an AMCP probe held past its bound — the bound says it plainly too', async () => {
    const { lines } = await runConnectionCheck(
      PLAYOUT_OFF,
      probes({ ...silentApi, amcp: () => new Promise<AmcpOutcome>(() => undefined) }),
      { ports: PORTS, lineMs: 300, connectMs: 200 },
    );
    expect(line(lines, 'amcp')).toEqual({
      id: 'amcp',
      status: 'fail',
      text: 'No answer from 127.0.0.1 on port 5250.',
    });
    expect(line(lines, 'cors').status).toBe('skip');
  });

  it('CONTROL — an AMCP that ANSWERS passes, whatever the API line says', async () => {
    const { lines } = await runConnectionCheck(
      PLAYOUT_OFF,
      probes({ ...silentApi, ...amcpSays({ kind: 'answered', version: '2.3.2' }) }),
      { ports: PORTS },
    );
    expect(line(lines, 'amcp')).toEqual({
      id: 'amcp',
      status: 'pass',
      text: 'CasparCG on 127.0.0.1 answered VERSION: 2.3.2.',
    });
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
