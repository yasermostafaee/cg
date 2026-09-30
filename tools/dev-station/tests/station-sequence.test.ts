import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  CONSOLE_URL,
  assess,
  type Listener,
  type ProcessRow,
  type StationPort,
} from '../src/station-plan.mjs';
import * as stationProcesses from '../src/station-processes.mjs';
import { runDevStation, type DevStationDeps, type Seen } from '../src/station-sequence.mjs';

/**
 * 🔴 `DEV-STATION-01` — **THE SEQUENCE: name what holds the station's ports and stop NOTHING, build
 * before starting, one origin.**
 *
 * `CENTRAL-BRIDGE-01` — the CG Bridge here is a REAL process holding a REAL port (an ephemeral one,
 * never a station port), judged by the REAL `assess` and left running: the sequence is given no way
 * to stop it, and the test proves it still holds its port afterwards. Only its NAME is given
 * (`cg-bridge.exe`), because the test cannot be the service; the Windows reader that finds that name
 * is pinned in `station-plan.test.ts`.
 */

const children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill('SIGKILL');
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

/** Does something accept a connection on this port? */
function held(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/** Is this process still there? Signal 0 asks without touching it. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A stand-in for CG Bridge: a real process holding a real ephemeral port until the test ends. */
async function holdPort(): Promise<{ pid: number; port: number }> {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [
      '-e',
      `require('net').createServer().listen(${String(port)}, '127.0.0.1', () => console.log('up'));` +
        'setInterval(() => {}, 1e9);',
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  children.push(child);
  await new Promise<void>((resolve) => child.stdout?.once('data', () => resolve()));
  return { pid: child.pid ?? -1, port };
}

/** What the probe reads: the process list, the listeners, and which ports are the station's. */
interface Holding {
  readonly processes?: readonly ProcessRow[];
  readonly listeners?: readonly Listener[];
  readonly ports?: readonly StationPort[];
}

interface Harness {
  deps: DevStationDeps;
  calls: string[];
  printed: string[];
  asked: string[];
  opened: string[];
}

function harness(
  overrides: Partial<DevStationDeps> & { holding?: Holding; answer?: string | null } = {},
): Harness {
  const calls: string[] = [];
  const printed: string[] = [];
  const asked: string[] = [];
  const opened: string[] = [];
  let address: string | null = 'http://192.168.21.111:8080';
  const { holding, answer, ...rest } = overrides;
  const deps: DevStationDeps = {
    // The REAL judgement of who holds what, over the tables the test gives.
    probe: async (): Promise<Seen> => {
      calls.push('probe');
      return assess(holding?.processes ?? [], holding?.listeners ?? [], holding?.ports);
    },
    ask: async (question) => {
      asked.push(question);
      return answer === undefined ? null : answer;
    },
    build: () => {
      calls.push('build');
      return 0;
    },
    readPlayoutAddress: () => {
      calls.push('read-address');
      return address;
    },
    setPlayoutAddress: async (value) => {
      calls.push(`set-address ${value}`);
      address = value;
    },
    freshFakeState: () => {
      calls.push('fresh-fake');
    },
    startFake: async () => {
      calls.push('start-fake');
      return {
        address: 'http://127.0.0.1:43111',
        username: 'admin',
        password: 'pw',
        caspar: '127.0.0.1:5250',
        feeds: [9250, 9251],
        notes: [],
        stop: async () => undefined,
      };
    },
    start: async (playout) => {
      calls.push(`start ${playout}`);
      return { stop: async () => undefined };
    },
    open: (url) => {
      opened.push(url);
    },
    print: (line) => {
      printed.push(line);
    },
    ...rest,
  };
  return { deps, calls, printed, asked, opened };
}

const OPTIONS = { fake: false, playout: undefined, open: true, stateDir: 'C:\\dev' } as const;

/** `CENTRAL-BRIDGE-01` — the one line that names CG Bridge on a port: what it is, how to stop it. */
const cgBridgeLine = (port: string, pid: number): string =>
  `Port ${port} is held by CG Bridge (cg-bridge.exe, PID ${String(pid)}) — the CG Bridge service, or an older CG Control's own bridge. Stop it (Stop-Service CGBridge in an administrator PowerShell, or close that CG Control), then run pnpm dev:station again.`;

describe('🔴 `CENTRAL-BRIDGE-01` — the dev station stops NOTHING: what holds its ports is named, and it refuses', () => {
  it('CG Bridge on a station port: ONE line naming it and how to stop it by hand — and the real process still holds its port afterwards', async () => {
    const bridge = await holdPort();
    // Control: both instruments see the stand-in before the run, so "still there" below reads something.
    expect(alive(bridge.pid)).toBe(true);
    expect(await held(bridge.port)).toBe(true);
    const h = harness({
      holding: {
        processes: [{ name: 'cg-bridge.exe', pid: bridge.pid }],
        listeners: [{ proto: 'tcp', port: bridge.port, pid: bridge.pid }],
        // The test's own ephemeral port stands in for 5280: no station port is bound here.
        ports: [{ proto: 'tcp', port: bridge.port }],
      },
    });
    const result = await runDevStation(OPTIONS, h.deps);
    expect(result.outcome).toBe('blocked');
    expect(h.printed).toEqual([cgBridgeLine(String(bridge.port), bridge.pid)]);
    // Nothing asked, built or started: the probe was the whole run.
    expect(h.asked).toEqual([]);
    expect(h.calls).toEqual(['probe']);
    // 🔴 And nothing stopped: the process is alive and still holds its port.
    expect(alive(bridge.pid)).toBe(true);
    expect(await held(bridge.port)).toBe(true);
  });

  it('the sequence is given no way to stop a process: no `stop` dependency, and the process module exports none', () => {
    expectTypeOf<DevStationDeps>().not.toHaveProperty('stop');
    // Control: the type instrument does see a dependency that is there.
    expectTypeOf<DevStationDeps>().toHaveProperty('probe');
    expect(Object.keys(stationProcesses).sort()).toEqual(['probeStation', 'writeConsoleStub']);
  });

  it('every held port is its own line, in the station’s order — CG Bridge’s three and another program’s console port', async () => {
    const h = harness({
      holding: {
        processes: [
          { name: 'cg-bridge.exe', pid: 1234 },
          { name: 'node.exe', pid: 4242 },
        ],
        listeners: [
          { proto: 'udp', port: 6251, pid: 1234 },
          { proto: 'tcp', port: 5280, pid: 1234 },
          { proto: 'tcp', port: 7911, pid: 1234 },
          { proto: 'tcp', port: 5174, pid: 4242 },
        ],
      },
    });
    expect((await runDevStation(OPTIONS, h.deps)).outcome).toBe('blocked');
    expect(h.printed).toEqual([
      'Port 5174 is held by node.exe (PID 4242) — stop it, then run pnpm dev:station again.',
      cgBridgeLine('5280', 1234),
      cgBridgeLine('7911', 1234),
      cgBridgeLine('6251/udp', 1234),
    ]);
    expect(h.asked).toEqual([]);
    expect(h.calls).toEqual(['probe']);
  });

  it('🔴 CG Control running and holding no port: no question, no line, and the station starts', async () => {
    const h = harness({
      holding: { processes: [{ name: 'cg-control.exe', pid: 13468 }], listeners: [] },
    });
    expect((await runDevStation(OPTIONS, h.deps)).outcome).toBe('running');
    expect(h.asked).toEqual([]);
    expect(h.printed.filter((line) => line.startsWith('Port '))).toEqual([]);
    expect(h.calls).toContain('start http://192.168.21.111:8080');
  });

  it('CONTROL — the same process list with a program on a station port does refuse, naming only that program', async () => {
    const h = harness({
      holding: {
        processes: [
          { name: 'cg-control.exe', pid: 13468 },
          { name: 'node.exe', pid: 4242 },
        ],
        listeners: [{ proto: 'tcp', port: 5280, pid: 4242 }],
      },
    });
    expect((await runDevStation(OPTIONS, h.deps)).outcome).toBe('blocked');
    expect(h.printed).toEqual([
      'Port 5280 is held by node.exe (PID 4242) — stop it, then run pnpm dev:station again.',
    ]);
    expect(h.asked).toEqual([]);
    expect(h.calls).toEqual(['probe']);
  });
});

describe('no stale code — it builds before anything starts', () => {
  it('the build runs on every start, before the station starts; control: nothing else was asked of it', async () => {
    const h = harness();
    expect((await runDevStation(OPTIONS, h.deps)).outcome).toBe('running');
    expect(h.calls.filter((c) => c === 'build')).toHaveLength(1);
    expect(h.calls.indexOf('build')).toBeLessThan(h.calls.findIndex((c) => c.startsWith('start')));
  });

  it('a failed build starts nothing', async () => {
    const h = harness({ build: () => 2 });
    expect((await runDevStation(OPTIONS, h.deps)).outcome).toBe('build-failed');
    expect(h.calls.some((c) => c.startsWith('start'))).toBe(false);
    expect(h.opened).toEqual([]);
  });
});

describe('the origin — what the banner and the browser use', () => {
  it('the browser is opened on exactly http://127.0.0.1:5174/, and no line names localhost', async () => {
    const h = harness();
    await runDevStation(OPTIONS, h.deps);
    expect(h.opened).toEqual([CONSOLE_URL]);
    expect(CONSOLE_URL).toBe('http://127.0.0.1:5174/');
    // Control: the banner was printed and names the URL, so "no localhost" read something.
    expect(h.printed.join('\n')).toContain('http://127.0.0.1:5174/');
    expect(h.printed.join('\n')).toContain('C:\\dev');
    expect(h.printed.join('\n')).not.toMatch(/localhost/i);
  });

  it('--no-open opens nothing', async () => {
    const h = harness();
    await runDevStation({ ...OPTIONS, open: false }, h.deps);
    expect(h.opened).toEqual([]);
  });
});

describe('the Playout address — asked once, remembered, changed by --playout', () => {
  it('none remembered: asked ONCE, written by the one writer, then used', async () => {
    let remembered: string | null = null;
    const h = harness({
      answer: '192.168.21.111',
      readPlayoutAddress: () => remembered,
      setPlayoutAddress: async (value) => {
        remembered = `http://${value}:8080`;
      },
    });
    const result = await runDevStation(OPTIONS, h.deps);
    expect(result.outcome).toBe('running');
    expect(h.asked).toHaveLength(1);
    expect(h.calls).toContain('start http://192.168.21.111:8080');
  });

  it('none remembered and nobody to ask: one line, and nothing starts', async () => {
    const h = harness({ readPlayoutAddress: () => null });
    expect((await runDevStation(OPTIONS, h.deps)).outcome).toBe('no-address');
    expect(h.asked).toHaveLength(1);
    expect(h.printed).toEqual([
      'No Playout address — run pnpm dev:station --playout <address>, or --fake.',
    ]);
    expect(h.calls.some((c) => c.startsWith('start'))).toBe(false);
  });

  it('remembered: not asked', async () => {
    const h = harness();
    await runDevStation(OPTIONS, h.deps);
    expect(h.asked).toEqual([]);
  });

  it('--playout <url> rewrites it before the start', async () => {
    const h = harness();
    await runDevStation({ ...OPTIONS, playout: 'http://10.0.0.5:8080' }, h.deps);
    expect(h.calls.indexOf('set-address http://10.0.0.5:8080')).toBeLessThan(
      h.calls.indexOf('start http://10.0.0.5:8080'),
    );
  });

  it('--fake: the fake Playout’s address is written and its sign-in is on the banner', async () => {
    const h = harness();
    await runDevStation({ ...OPTIONS, fake: true }, h.deps);
    expect(h.calls).toContain('set-address http://127.0.0.1:43111');
    expect(h.calls).toContain('start http://127.0.0.1:43111');
    expect(h.printed.join('\n')).toContain('sign in as admin / pw');
  });
});

describe('`DELTA-MULTI-CHANNEL-01-A` A1 — `--fake` starts a whole station, fresh', () => {
  it('the last fake station moves aside AFTER the build and BEFORE the fake starts and its address is written', async () => {
    const h = harness();
    expect((await runDevStation({ ...OPTIONS, fake: true }, h.deps)).outcome).toBe('running');
    const at = (call: string): number => h.calls.indexOf(call);
    expect(at('fresh-fake')).toBeGreaterThan(at('build'));
    expect(at('fresh-fake')).toBeLessThan(at('start-fake'));
    expect(at('fresh-fake')).toBeLessThan(at('set-address http://127.0.0.1:43111'));
    // The banner carries the fake CasparCG, and says the same-machine warning is expected.
    expect(h.printed).toContain(
      '  CasparCG 127.0.0.1:5250  (fake · channels 1 and 2 · programme feeds on 9250, 9251)',
    );
    expect(h.printed.join('\n')).toContain('is expected here: they do.');
  });

  it('CONTROL — a dev station on a real Playout keeps its state: nothing is moved aside', async () => {
    const h = harness();
    expect((await runDevStation(OPTIONS, h.deps)).outcome).toBe('running');
    expect(h.calls).not.toContain('fresh-fake');
    expect(h.calls).not.toContain('start-fake');
  });

  it('a failed build leaves the last fake station exactly as it was', async () => {
    const h = harness({ build: () => 2 });
    expect((await runDevStation({ ...OPTIONS, fake: true }, h.deps)).outcome).toBe('build-failed');
    expect(h.calls).not.toContain('fresh-fake');
  });
});

describe('`DEV-LOCAL-CASPAR-01` — `--fake --caspar`: the fake Playout in front of this machine’s CasparCG', () => {
  it('a station that cannot start is ONE line — its own — and nothing else starts or opens', async () => {
    const line =
      'Nothing answers AMCP on 127.0.0.1:5250 (ECONNREFUSED) — start CasparCG, then run the command again.';
    const h = harness({
      startFake: async () => {
        h.calls.push('start-fake');
        throw new Error(line);
      },
    });
    expect((await runDevStation({ ...OPTIONS, fake: true }, h.deps)).outcome).toBe('failed');
    expect(h.printed).toEqual([line]);
    expect(h.calls).toContain('start-fake');
    expect(h.calls.some((c) => c.startsWith('set-address') || c.startsWith('start '))).toBe(false);
    expect(h.opened).toEqual([]);
  });

  it('the banner carries what the start read from the core', async () => {
    const h = harness({
      startFake: async () => ({
        address: 'http://127.0.0.1:43111',
        username: 'cg-admin',
        password: 'pw',
        caspar: '127.0.0.1:5250',
        local: {
          version: '2.5.0 69e8ad5 Stable',
          channels: [{ channel: 1, format: '1080i5000' }],
          mediaFolder: 'D:/CasparCG/media/',
          clips: 2,
          stills: 0,
        },
        notes: [],
        stop: async () => undefined,
      }),
    });
    expect((await runDevStation({ ...OPTIONS, fake: true }, h.deps)).outcome).toBe('running');
    expect(h.printed).toContain(
      "  CasparCG 127.0.0.1:5250  (this machine's · 2.5.0 69e8ad5 Stable · CH 1 1080i5000)",
    );
    expect(h.printed).toContain("  PROGRAM  no return feed here — watch CasparCG's own window");
    expect(h.calls).toContain('start http://127.0.0.1:43111');
  });
});
