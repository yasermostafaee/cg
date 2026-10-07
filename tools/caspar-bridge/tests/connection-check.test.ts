import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AMCP_TRUST_WINDOW_MS,
  BRIDGE_NEEDS_ADMIN_LINE,
  CONNECTION_CHECK_GROUPS,
  CONNECTION_CHECK_LINE_MS,
  SETUP_CHECK_LET_IN_WAIT_MS,
  SETUP_CHECK_WAIT_MS,
  type ConnectionCheckLine,
} from '@cg/shared-ipc';
import {
  NATIVE_SIGN_IN_LINE,
  ProbeError,
  parseTasklist,
  proxyEndpoint,
  stationStateLines,
  withStationLines,
  type StationState,
} from '../src/connection-check.js';
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
/**
 * `R-081` — the PROBED lines in the order things happen (`CONNECTION_CHECK_GROUPS`): what needs
 * nothing, then whether this console can sign in, then what needs a signed-in session. The four lines
 * that read CG Bridge's own state are added by the route (`withStationLines`, below). `R-090` — no
 * `ports` and no `topology`: the check judges nothing about the machine it runs on.
 */
const PROBED_IN_ORDER = ['proxy', 'route', 'api', 'playout-version', 'cors', 'amcp'];
const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function probes(overrides: Partial<CheckProbes> = {}): CheckProbes {
  return {
    ...realProbes(),
    processes: async () => [],
    systemProxy: async () => null,
    // `B-318` — pinned: the dev host runs a TUN (`singbox_tun`), and a test must not read it.
    adapters: () => [],
    portHolder: async () => ({ kind: 'free' }),
    ...overrides,
  };
}

/** A fake Playout API: the JWKS and the token endpoint's CORS preflight, both configurable. */
async function fakeApi(opts: {
  keys: unknown[];
  allowOrigin: string | null;
  /** Every request the fake was asked, as `METHOD url` — what a check probed, and what it did not. */
  seen?: string[];
  /** `R-084` — the `version` `/api/v1/system/version` answers (`2.9.2` by default); `null` — `404`. */
  version?: string | null;
  /** `R-084` — the headers each version request carried. */
  versionHeaders?: http.IncomingHttpHeaders[];
}): Promise<string> {
  const server = http.createServer((req, res) => {
    opts.seen?.push(`${String(req.method)} ${String(req.url)}`);
    const version = opts.version === undefined ? '2.9.2' : opts.version;
    if (req.method === 'GET' && req.url === '/api/v1/system/version' && version !== null) {
      opts.versionHeaders?.push({ ...req.headers });
      res.writeHead(200, { 'content-type': 'application/json' });
      // As `.111` answered it — more than a reader may use (`PLAYOUT-CG-RESPONSE-0110-111-v1.md` §3.1).
      res.end(
        JSON.stringify({
          component: 'engine',
          title: 'Apasai Playout',
          version,
          releaseDate: '2026-09-30',
          assemblyVersion: `${version}.0`,
          changelog: [{ version, items: ['بهبودِ پایداری'] }],
        }),
      );
      return;
    }
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
      { amcpTimeoutMs: 2000 },
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
      { amcpSignInAt: Date.now(), amcpTrustWindowMs: 30_000 },
    );
    expect(line(lines, 'amcp')).toEqual({
      id: 'amcp',
      status: 'wait',
      text: "CasparCG on 127.0.0.1: waiting for the Playout to let CG Bridge's machine in.",
    });
  });

  it('AFTER the window: this machine, by its IPv4, waiting for approval in the Playout — and never a script', async () => {
    const port = await closedPort();
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes({ amcp: (host, _p, t) => realProbes().amcp(host, port, t) }),
      { amcpTimeoutMs: 2000, ...PAST_WINDOW },
    );
    expect(line(lines, 'amcp')).toEqual({
      id: 'amcp',
      status: 'fail',
      text:
        `CG Bridge's machine, 127.0.0.1, is waiting for approval in the Playout, at ${SETTINGS}, ` +
        "where the Playout's administrator approves it. If it is not listed there, CG Bridge's " +
        'machine reaches the Playout through NAT, a proxy or a VPN.',
    });
  });

  it('CONTROL — a server that answers VERSION passes, before the sign-in and after the window alike', async () => {
    const port = await amcpThatAnswers();
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    for (const phase of [{}, PAST_WINDOW]) {
      const { lines } = await runConnectionCheck(
        { playoutAddress: api, origin: ORIGIN },
        probes({ amcp: (host, _p, t) => realProbes().amcp(host, port, t) }),
        { ...phase },
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
      { amcpSignInAt: signedInAt, amcpTrustWindowMs: 400, letInRetryMs: 20 },
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
        { letInRetryMs: 20, ...phase },
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
  it('EVERY probe at a black hole (192.0.2.1): every line comes back within the bound, each saying what did not answer', async () => {
    const timings: { id: string; ms: number }[] = [];
    let total = 0;
    const started = Date.now();
    const { lines } = await runConnectionCheck(
      { playoutAddress: 'http://192.0.2.1:8080', origin: ORIGIN },
      probes(),
      {
        onTimed: (t, ms) => {
          timings.push(...t);
          total = ms;
        },
      },
    );
    const elapsed = Date.now() - started;
    // Every PROBED line, in the order things happen (`R-081`), within the one bound the console's
    // wait is derived from.
    expect(lines.map((l) => l.id)).toEqual(PROBED_IN_ORDER);
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
    // `R-084` — a Playout that does not answer serves no version: a fact, never a failure.
    expect(line(lines, 'playout-version')).toEqual({
      id: 'playout-version',
      status: 'skip',
      text: "The Playout's version: not served.",
    });
  });

  it('CONTROL — against the fakes every network line comes back OK', async () => {
    const port = await amcpThatAnswers();
    const api = await fakeApi({ keys: [{ kid: 'k1' }], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes({
        amcp: (host, _p, t) => realProbes().amcp(host, port, t),
      }),
      {},
    );
    expect(lines.map((l) => l.id)).toEqual(PROBED_IN_ORDER);
    for (const l of lines) {
      if (l.id === 'proxy') continue; // this host's own VPN state, not the Playout's
      expect(l.status, `${l.id}: ${l.text}`).toBe('pass');
    }
  });

  it('C6 — a host with no IPv4 address is ONE line, and the address-bound probes are not run', async () => {
    const { lines } = await runConnectionCheck(
      { playoutAddress: 'http://playout.example:8080', origin: ORIGIN },
      probes({ ipv4: async () => null }),
      {},
    );
    expect(lines.map((l) => l.id)).toEqual(['proxy', 'route']);
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
      amcpTimeoutMs: 300,
    });
    expect(line(lines, 'api').status).toBe('pass');
  });
});

describe('🔴 R-084 (`RELEASE-0111-01-A` A1) — the Playout’s version, read by CG Bridge with no token', () => {
  const check = (api: string) =>
    runConnectionCheck({ playoutAddress: api, origin: ORIGIN }, probes(), { amcpTimeoutMs: 300 });

  it('served: the Versions line reads the Playout’s `version` — asked with no token and no Origin', async () => {
    const versionHeaders: http.IncomingHttpHeaders[] = [];
    const api = await fakeApi({ keys: [{ kid: 'k1' }], allowOrigin: ORIGIN, versionHeaders });
    const { lines } = await check(api);
    expect(line(lines, 'playout-version')).toEqual({
      id: 'playout-version',
      status: 'pass',
      text: 'Playout 2.9.2.',
    });
    expect(versionHeaders).toHaveLength(1);
    expect(versionHeaders[0]?.authorization).toBeUndefined();
    expect(versionHeaders[0]?.origin).toBeUndefined();
    // In the Versions group, beside CG Bridge's release.
    expect(CONNECTION_CHECK_GROUPS.find((g) => g.id === 'versions')?.lines).toEqual([
      'bridge-version',
      'playout-version',
    ]);
  });

  it('CONTROL — a Playout that does not serve it reads `not served`, and every other line is unchanged', async () => {
    const served = await check(await fakeApi({ keys: [{ kid: 'k1' }], allowOrigin: ORIGIN }));
    const notServed = await check(
      await fakeApi({ keys: [{ kid: 'k1' }], allowOrigin: ORIGIN, version: null }),
    );
    expect(line(notServed.lines, 'playout-version')).toEqual({
      id: 'playout-version',
      status: 'skip',
      text: "The Playout's version: not served.",
    });
    const others = (lines: readonly ConnectionCheckLine[]): ConnectionCheckLine[] =>
      lines.filter((l) => l.id !== 'playout-version' && l.id !== 'proxy');
    expect(others(notServed.lines)).toEqual(others(served.lines));
  });
});

describe('§2F — the Playout API and CORS', () => {
  it('an EMPTY key set fails in its own words; control: one key passes', async () => {
    const empty = await fakeApi({ keys: [], allowOrigin: ORIGIN });
    const failed = line(
      (
        await runConnectionCheck({ playoutAddress: empty, origin: ORIGIN }, probes(), {
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
          { amcpTimeoutMs: 300 },
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
          { amcpTimeoutMs: 300, connectMs: 500, lineMs: 1500 },
        )
      ).lines,
      'api',
    );
    const keyless = await fakeApi({ keys: [], allowOrigin: ORIGIN });
    const empty = line(
      (
        await runConnectionCheck({ playoutAddress: keyless, origin: ORIGIN }, probes(), {
          amcpTimeoutMs: 300,
        })
      ).lines,
      'api',
    );
    const elsewhere = await fakeApi({ keys: [{}], allowOrigin: 'http://elsewhere.example' });
    const wrongOrigin = line(
      (
        await runConnectionCheck({ playoutAddress: elsewhere, origin: ORIGIN }, probes(), {
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
      {},
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
      {},
    );
    expect(line(lines, 'api').status).toBe('pass');
    expect(line(lines, 'cors')).toMatchObject({ status: 'fail', command: ORIGIN });
  });

  it('🔴 CENTRAL-BRIDGE-01 rule 8 — a console that signs in directly (CG Control) meets no CORS list: a fact, never probed — control: the same Playout refuses a browser origin', async () => {
    const seen: string[] = [];
    const api = await fakeApi({ keys: [{}], allowOrigin: 'http://elsewhere.example', seen });
    const native = await runConnectionCheck(
      { playoutAddress: api, origin: 'http://tauri.localhost', signIn: 'native' },
      probes(amcpSays({ kind: 'refused' })),
      {},
    );
    expect(line(native.lines, 'api').status).toBe('pass');
    expect(line(native.lines, 'cors')).toEqual(NATIVE_SIGN_IN_LINE);
    // Never probed: the Playout was asked for its keys, and nothing of its CORS list.
    expect(seen.some((r) => r.startsWith('OPTIONS '))).toBe(false);
    expect(seen.some((r) => r.startsWith('GET /.well-known/jwks.json'))).toBe(true);

    // CONTROL — the same Playout, for a browser console's origin: the list is asked, and refuses.
    const browser = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes(amcpSays({ kind: 'refused' })),
      {},
    );
    expect(line(browser.lines, 'cors')).toMatchObject({ status: 'fail', command: ORIGIN });
    expect(seen.some((r) => r.startsWith('OPTIONS '))).toBe(true);
  });

  it('an API that answers with NO signing keys — CORS is not checked, and says that is why', async () => {
    const api = await fakeApi({ keys: [], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes(amcpSays({ kind: 'refused' })),
      {},
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
        {},
      );
      expect(line(lines, 'amcp'), outcome.kind).toEqual({ id: 'amcp', status: 'fail', text });
    }
  });

  it('CONTROL — with the API up and AMCP refused, it waits for sign-in', async () => {
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes(amcpSays({ kind: 'refused' })),
      {},
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
      { lineMs: 300, connectMs: 200 },
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
      {},
    );
    expect(line(lines, 'amcp')).toEqual({
      id: 'amcp',
      status: 'pass',
      text: 'CasparCG on 127.0.0.1 answered VERSION: 2.3.2.',
    });
  });
});

/**
 * 🔴 `B-318` — **A VPN OR PROXY, EXACT OR NOT AT ALL.** The owner quit v2rayN and the line stayed: it
 * failed on a process NAME, and it ran on CG Bridge's machine. Each planted state below is one the old
 * line got wrong; the route probe is pinned to a LAN card unless a test says otherwise, because the dev
 * host itself runs a TUN.
 */
describe('§2F / B-318 — VPN or proxy, exact or not at all; R-090 — no verdict about this machine', () => {
  const lan = (): Promise<{ address: string; iface: string }> =>
    Promise.resolve({ address: '192.168.1.20', iface: 'Ethernet' });
  const proxyLine = async (overrides: Partial<CheckProbes>): Promise<ConnectionCheckLine> => {
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes({ route: lan, ...overrides }),
      { amcpTimeoutMs: 300 },
    );
    return line(lines, 'proxy');
  };
  const PASS = { id: 'proxy', status: 'pass', text: 'No VPN or proxy in the way.' };

  it('process gone, no proxy, no tunnel: the line passes', async () => {
    expect(await proxyLine({})).toEqual(PASS);
  });

  it('v2rayN RUNNING with no proxy on and no tunnel up intercepts nothing: the line passes (it failed before)', async () => {
    expect(
      await proxyLine({
        processes: async () => [
          { name: 'explorer.exe', pid: 4 },
          { name: 'v2rayN.exe', pid: 2136 },
        ],
      }),
    ).toEqual(PASS);
  });

  it('the proxy setting LEFT BEHIND with nothing listening on its address: the line passes', async () => {
    const asked: string[] = [];
    expect(
      await proxyLine({
        systemProxy: async () => ({ server: '127.0.0.1:10808', bypass: ['<local>'] }),
        portHolder: async (proto, port) => {
          asked.push(`${proto}:${String(port)}`);
          return { kind: 'free' };
        },
      }),
    ).toEqual(PASS);
    // The instrument looked where the setting points — the listener, not the setting, decides.
    expect(asked).toEqual(['tcp:10808']);
  });

  it('a REAL proxy on: a WARNING naming the proxy, what holds it and the clients with their PIDs', async () => {
    expect(
      await proxyLine({
        processes: async () => [
          { name: 'v2rayN.exe', pid: 2136 },
          { name: 'xray.exe', pid: 9132 },
        ],
        systemProxy: async () => ({ server: '127.0.0.1:10808', bypass: [] }),
        portHolder: async (proto, port) =>
          proto === 'tcp' && port === 10808
            ? { kind: 'other', name: 'xray.exe', pid: 9132 }
            : { kind: 'free' },
      }),
    ).toEqual({
      id: 'proxy',
      status: 'warn',
      text:
        "On CG Bridge's machine, the Windows proxy 127.0.0.1:10808 is on, held by xray.exe (PID 9132); " +
        'running: v2rayN (PID 2136) and the v2ray/xray core (PID 9132).',
    });
  });

  it('a proxy on ANOTHER host cannot be read here, so it is taken as live: a warning', async () => {
    const proxied = await proxyLine({
      systemProxy: async () => ({ server: 'proxy.corp:3128', bypass: [] }),
    });
    expect(proxied).toEqual({
      id: 'proxy',
      status: 'warn',
      text: "On CG Bridge's machine, the Windows proxy proxy.corp:3128 is on.",
    });
  });

  it('a tunnel UP beside a LAN route: a warning naming the adapter; Windows’ Teredo is not a tunnel', async () => {
    expect(await proxyLine({ adapters: () => ['Ethernet', 'singbox_tun'] })).toEqual({
      id: 'proxy',
      status: 'warn',
      text: "On CG Bridge's machine, the tunnel singbox_tun is up.",
    });
    expect(
      await proxyLine({ adapters: () => ['Ethernet', 'Teredo Tunneling Pseudo-Interface'] }),
    ).toEqual(PASS);
  });

  it('the ROUTE to the Playout through the tunnel is proved interception: a FAILURE', async () => {
    const tunnelled = await proxyLine({
      route: async () => ({ address: '172.18.0.1', iface: 'singbox_tun' }),
      adapters: () => ['singbox_tun'],
      processes: async () => [{ name: 'sing-box.exe', pid: 8352 }],
    });
    expect(tunnelled).toEqual({
      id: 'proxy',
      status: 'fail',
      text:
        "CG Bridge's traffic to 127.0.0.1 goes through the tunnel singbox_tun; running: sing-box " +
        '(PID 8352). Turn it off, then check again.',
    });
  });

  it('🔴 R-090 — no `ports` and no `topology` line, however the ports are held; no line says "this machine"', async () => {
    const api = await fakeApi({ keys: [{}], allowOrigin: ORIGIN });
    const { lines } = await runConnectionCheck(
      { playoutAddress: api, origin: ORIGIN },
      probes({
        route: lan,
        portHolder: async () => ({ kind: 'other', name: 'casparcg.exe', pid: 4242 }),
      }),
      { amcpTimeoutMs: 300, ...PAST_WINDOW },
    );
    // Control: the check ran — its probed lines are all there.
    expect(lines.map((l) => l.id)).toEqual(PROBED_IN_ORDER);
    expect(lines.map((l) => l.id)).not.toContain('ports');
    expect(lines.map((l) => l.id)).not.toContain('topology');
    for (const l of lines) expect(l.text, l.id).not.toMatch(/this machine/i);
  });

  it('tasklist CSV gives each process its name and PID', () => {
    expect(
      parseTasklist(
        '"System Idle Process","0","Services","0","8 K"\r\n"v2rayN.exe","2136","Console","1","90,112 K"\r\n',
      ),
    ).toEqual([
      { name: 'System Idle Process', pid: null },
      { name: 'v2rayN.exe', pid: 2136 },
    ]);
  });

  it('a proxy setting names its host and port in each Windows spelling', () => {
    expect(proxyEndpoint('127.0.0.1:10808')).toEqual({ host: '127.0.0.1', port: 10808 });
    expect(proxyEndpoint('http=127.0.0.1:10809;https=127.0.0.1:10809')).toEqual({
      host: '127.0.0.1',
      port: 10809,
    });
    expect(proxyEndpoint('http://127.0.0.1:10810/pac')).toEqual({ host: '127.0.0.1', port: 10810 });
    expect(proxyEndpoint('proxy.corp')).toEqual({ host: 'proxy.corp', port: null });
  });

  it('a mistyped address is one line saying so', async () => {
    // (A bare host name is NOT mistyped since `-01-C` C3 — `playout` is checked as
    // `http://playout:8080`. What cannot be an http address still is.)
    const { lines } = await runConnectionCheck(
      { playoutAddress: 'ftp://playout', origin: ORIGIN },
      probes(),
      {},
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

describe('🔴 R-081 — CG Bridge’s own state, as check lines, in the order things happen', () => {
  const FSI = String.fromCodePoint(0x2068);
  const PDI = String.fromCodePoint(0x2069);
  const BEFORE_SIGN_IN: StationState = {
    playout: true,
    session: { state: 'needs-admin' },
    primary: { state: 'disconnected' },
    oscPort: 6251,
    license: null,
    channels: 'no-sign-in',
  };
  const byId = (lines: readonly ConnectionCheckLine[]): Record<string, ConnectionCheckLine> =>
    Object.fromEntries(lines.map((l) => [l.id, l]));

  it('before any sign-in every line WAITS — neutral, never a failure — and says what it waits for', () => {
    const lines = byId(stationStateLines(BEFORE_SIGN_IN));
    expect(Object.keys(lines).sort()).toEqual(['bridge-session', 'channels', 'license', 'osc']);
    for (const l of Object.values(lines)) expect(l.status, l.id).toBe('wait');
    expect(lines['bridge-session']?.text).toBe(`${BRIDGE_NEEDS_ADMIN_LINE}.`);
    expect(lines['osc']?.text).toBe('OSC from CasparCG: waiting for CasparCG.');
    expect(lines['license']?.text).toBe("CG license: waiting for CG Bridge's sign-in.");
    expect(lines['channels']?.text).toBe("The Playout's channels: waiting for sign-in.");
  });

  it('after the sign-in: the session, OSC, the license with its cap, and the channels this sign-in holds', () => {
    const lines = byId(
      stationStateLines({
        playout: true,
        session: { state: 'signed-in', name: 'cg-admin' },
        primary: { state: 'healthy', oscFreshAt: '2026-10-03T10:00:00.000Z' },
        oscPort: 6251,
        license: { licensed: true, maxChannels: 2, expiresAt: '2027-01-01' },
        channels: 2,
      }),
    );
    expect(lines['bridge-session']).toEqual({
      id: 'bridge-session',
      status: 'pass',
      text: `CG Bridge is signed in to the Playout as ${FSI}cg-admin${PDI}.`,
    });
    expect(lines['osc']).toEqual({
      id: 'osc',
      status: 'pass',
      text: "CasparCG's OSC arrives on port 6251.",
    });
    expect(lines['license']).toEqual({
      id: 'license',
      status: 'pass',
      text: 'CG Control is licensed for 2 channels, until 2027-01-01.',
    });
    expect(lines['channels']).toEqual({
      id: 'channels',
      status: 'pass',
      text: 'The Playout lists 2 channels for this sign-in.',
    });
  });

  it('golden rule 8 — AMCP up and OSC silent is a WARNING about confirmation, never a failure', () => {
    const osc = byId(stationStateLines({ ...BEFORE_SIGN_IN, primary: { state: 'degraded' } }))[
      'osc'
    ];
    expect(osc?.status).toBe('warn');
    expect(osc?.text).toBe(
      'No OSC from CasparCG on port 6251: what is on air cannot be confirmed.',
    );
  });

  it('the Playout’s own refusals are its words, isolated; an unlicensed Playout fails the license line', () => {
    const message = 'لایسنسِ CG در این Playout نیست.';
    const lines = byId(
      stationStateLines({
        ...BEFORE_SIGN_IN,
        session: { state: 'refused', message },
        license: { licensed: false, message },
        channels: 0,
      }),
    );
    expect(lines['bridge-session']?.status).toBe('fail');
    expect(lines['bridge-session']?.text).toBe(`CG Bridge: ${FSI}${message}${PDI}`);
    expect(lines['license']).toEqual({
      id: 'license',
      status: 'fail',
      text: `${FSI}${message}${PDI}`,
    });
    expect(lines['channels']?.status).toBe('fail');
  });

  it('CONTROL — with no Playout (auth off) only OSC is read; and a signed-in Playout with no license read says it publishes none', () => {
    expect(
      stationStateLines({ ...BEFORE_SIGN_IN, playout: false, session: { state: 'off' } }).map(
        (l) => l.id,
      ),
    ).toEqual(['osc']);
    const license = byId(stationStateLines({ ...BEFORE_SIGN_IN, session: { state: 'signed-in' } }))[
      'license'
    ];
    expect(license).toEqual({
      id: 'license',
      status: 'skip',
      text: 'CG license: this Playout publishes none.',
    });
    // A bridge with no session of its own (a development bridge) waits for nothing by name.
    const sessionless = byId(stationStateLines({ ...BEFORE_SIGN_IN, session: { state: 'off' } }));
    expect(sessionless['bridge-session']).toBeUndefined();
    expect(sessionless['license']).toEqual({
      id: 'license',
      status: 'wait',
      text: 'CG license: not read yet.',
    });
  });

  it('merged with the probed lines, the check reads in the four groups’ order', () => {
    const probed = PROBED_IN_ORDER.map(
      (id): ConnectionCheckLine => ({
        id: id as ConnectionCheckLine['id'],
        status: 'pass',
        text: id,
      }),
    ).reverse();
    const merged = withStationLines({ lines: probed, localAddress: null }, BEFORE_SIGN_IN);
    const order: readonly string[] = CONNECTION_CHECK_GROUPS.flatMap((g) => g.lines);
    const ids = merged.lines.map((l) => l.id);
    expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    // The sign-in reads as the gate: everything that needs nothing comes before it, the rest after.
    expect(ids.indexOf('cors')).toBeGreaterThan(ids.indexOf('ports'));
    expect(ids.indexOf('amcp')).toBeGreaterThan(ids.indexOf('bridge-session'));
  });
});
