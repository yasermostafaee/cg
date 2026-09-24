import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ASK, CONSOLE_URL, DECLINED } from '../src/station-plan.mjs';
import { isAlive, stopProcesses } from '../src/station-processes.mjs';
import { runDevStation, type DevStationDeps, type Seen } from '../src/station-sequence.mjs';

/**
 * 🔴 `DEV-STATION-01` — **THE SEQUENCE: ask before stopping, build before starting, one origin.**
 *
 * The "installed app" here is a REAL process holding a REAL port, stopped — on a yes — by the real
 * stop code. Only its NAME is given (`cg-bridge.exe`), because the test cannot be the installed app;
 * the Windows reader that finds that name is pinned in `station-plan.test.ts`.
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

/** A stand-in for CG Control's bridge: a process that holds the port until it is stopped. */
async function fakeInstalledApp(): Promise<{ pid: number; port: number }> {
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

interface Harness {
  deps: DevStationDeps;
  calls: string[];
  printed: string[];
  asked: string[];
  opened: string[];
}

function harness(
  overrides: Partial<DevStationDeps> & { installedPid?: number; answer?: string | null } = {},
): Harness {
  const calls: string[] = [];
  const printed: string[] = [];
  const asked: string[] = [];
  const opened: string[] = [];
  let address: string | null = 'http://192.168.21.111:8080';
  const { installedPid, answer, ...rest } = overrides;
  const deps: DevStationDeps = {
    probe: async (): Promise<Seen> => {
      calls.push('probe');
      return {
        installed:
          installedPid !== undefined && isAlive(installedPid)
            ? [{ name: 'cg-bridge.exe', pid: installedPid }]
            : [],
        blocked: [],
      };
    },
    ask: async (question) => {
      asked.push(question);
      return answer === undefined ? 'y' : answer;
    },
    stop: async (pids) => {
      calls.push('stop');
      await stopProcesses(pids, { graceMs: 1500 });
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
    startFake: async () => ({
      address: 'http://127.0.0.1:43111',
      username: 'admin',
      password: 'pw',
      stop: async () => undefined,
    }),
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

describe('asks before stopping the installed CG Control', () => {
  it('on "n" it does NOT stop it: the app keeps its port, nothing is built or started', async () => {
    const app = await fakeInstalledApp();
    const h = harness({ installedPid: app.pid, answer: 'n' });
    const result = await runDevStation(OPTIONS, h.deps);
    expect(result.outcome).toBe('declined');
    expect(h.asked).toEqual([ASK]);
    expect(h.printed).toEqual([DECLINED]);
    expect(h.calls).not.toContain('stop');
    expect(h.calls.some((c) => c === 'build' || c.startsWith('start'))).toBe(false);
    expect(isAlive(app.pid)).toBe(true);
    expect(await held(app.port)).toBe(true);
  });

  it('with nobody to ask (no terminal) it does not stop it either', async () => {
    const app = await fakeInstalledApp();
    const h = harness({ installedPid: app.pid, answer: null });
    expect((await runDevStation(OPTIONS, h.deps)).outcome).toBe('declined');
    expect(isAlive(app.pid)).toBe(true);
  });

  it('CONTROL — on "Y" it stops it, the port is freed, and the station starts', async () => {
    const app = await fakeInstalledApp();
    expect(await held(app.port)).toBe(true);
    const h = harness({ installedPid: app.pid, answer: 'Y' });
    const result = await runDevStation(OPTIONS, h.deps);
    expect(result.outcome).toBe('running');
    expect(h.calls.indexOf('stop')).toBeLessThan(h.calls.indexOf('build'));
    expect(isAlive(app.pid)).toBe(false);
    expect(await held(app.port)).toBe(false);
    expect(h.calls).toContain('start http://192.168.21.111:8080');
  });

  it('another program on a station port is NAMED and left alone — never asked about, never stopped', async () => {
    const h = harness({
      probe: async () => ({
        installed: [],
        blocked: [{ proto: 'tcp', port: 5174, pid: 4242, name: 'node.exe' }],
      }),
    });
    expect((await runDevStation(OPTIONS, h.deps)).outcome).toBe('blocked');
    expect(h.asked).toEqual([]);
    expect(h.calls).not.toContain('stop');
    expect(h.printed).toEqual([
      'Port 5174 is held by node.exe (PID 4242) — stop it, then run pnpm dev:station again.',
    ]);
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
