import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BRIDGE_CONSOLE_PORT,
  CONSOLE_URL,
  STATION_PORTS,
  answerIsYes,
  assess,
  banner,
  blockedLine,
  bridgeArgs,
  buildArgs,
  devStateDir,
  installedStateDir,
  isInside,
  parseArgs,
  parseNetstat,
  parseTasklist,
  setAddressArgs,
  stationPaths,
  viteArgs,
} from '../src/station-plan.mjs';

/**
 * 🔴 `DEV-STATION-01` — **THE PLAN: one origin, the installed app's ports, its own state, and every
 * path named.** Each absence has its positive control beside it.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_CLI = path.resolve(here, '../../caspar-bridge/bin/caspar-bridge.mjs');

const WIN_ENV = {
  APPDATA: 'C:\\Users\\op\\AppData\\Roaming',
  LOCALAPPDATA: 'C:\\Users\\op\\AppData\\Local',
};

describe('the origin — exactly http://127.0.0.1:5174', () => {
  it('the console is served on 127.0.0.1:5174 and on nothing else: strictPort, never a fallback port', () => {
    expect(CONSOLE_URL).toBe('http://127.0.0.1:5174/');
    expect(viteArgs()).toEqual([
      '--host',
      '127.0.0.1',
      '--port',
      '5174',
      '--strictPort',
      '--clearScreen',
      'false',
    ]);
  });

  it('the banner names that origin — and never localhost', () => {
    const lines = banner({ stateDir: 'C:\\x', playout: 'http://192.168.21.111:8080' }).join('\n');
    // Control: the instrument reads the banner's URL, so the absence below is not vacuous.
    expect(lines).toContain('http://127.0.0.1:5174/');
    expect(lines).not.toMatch(/localhost/i);
  });

  it('the station binds the installed app’s own ports, plus the one internal listener', () => {
    expect(STATION_PORTS).toEqual([
      { proto: 'tcp', port: 5174 },
      { proto: 'tcp', port: 5280 },
      { proto: 'tcp', port: 7911 },
      { proto: 'udp', port: 6250 },
      { proto: 'tcp', port: BRIDGE_CONSOLE_PORT },
    ]);
  });
});

describe('isolation — its own state folder, every path named', () => {
  it('the dev state is %LOCALAPPDATA%\\CG Control Dev; the installed app’s is %APPDATA%\\CG Control; neither holds the other', () => {
    const dev = devStateDir(WIN_ENV, 'win32', 'C:\\Users\\op');
    const installed = installedStateDir(WIN_ENV, 'win32', 'C:\\Users\\op');
    expect(dev).toBe('C:\\Users\\op\\AppData\\Local\\CG Control Dev');
    expect(installed).toBe('C:\\Users\\op\\AppData\\Roaming\\CG Control');
    expect(isInside(dev, installed, 'win32')).toBe(false);
    expect(isInside(installed, dev, 'win32')).toBe(false);
    // Control: the containment test does see a folder inside another, whatever its casing.
    expect(isInside('c:\\users\\OP\\appdata\\roaming\\cg control\\x', installed, 'win32')).toBe(
      true,
    );
  });

  it('elsewhere the two are SIBLINGS, one name a prefix of the other — and still neither holds the other', () => {
    const env = { XDG_DATA_HOME: '/h/.local/share' };
    const dev = devStateDir(env, 'linux', '/h');
    const installed = installedStateDir(env, 'linux', '/h');
    expect([dev, installed]).toEqual([
      '/h/.local/share/CG Control Dev',
      '/h/.local/share/CG Control',
    ]);
    expect(dev.startsWith(installed)).toBe(true); // the trap CI run 35975399174 met
    expect(isInside(dev, installed, 'linux')).toBe(false);
    expect(isInside(`${installed}/.cg-runtime`, installed, 'linux')).toBe(true);
  });

  it('EVERY path flag the bridge CLI reads is passed, each inside the dev state folder', () => {
    // Read from the bridge's own CLI, so a path flag added there later fails HERE until it is named.
    const cli = fs.readFileSync(BRIDGE_CLI, 'utf8');
    const read = new Set(
      [...cli.matchAll(/args\['([a-z-]+-(?:path|dir)|state-home)'\]/g)].map((m) => `--${m[1]}`),
    );
    expect(read.size).toBeGreaterThan(8); // the instrument found the flags at all
    const stateDir = 'C:\\Users\\op\\AppData\\Local\\CG Control Dev';
    const args = bridgeArgs(stationPaths(stateDir, 'win32'), 'http://192.168.21.111:8080');
    const passed = new Map<string, string>();
    for (let i = 0; i < args.length; i++) {
      const flag = args[i] ?? '';
      const value = args[i + 1];
      if (flag.startsWith('--') && value !== undefined && !value.startsWith('--')) {
        passed.set(flag, value);
      }
    }
    for (const flag of read) {
      expect(passed.has(flag), `${flag} is passed`).toBe(true);
      expect(isInside(passed.get(flag) ?? '', stateDir, 'win32'), `${flag} is inside`).toBe(true);
    }
  });

  it('the bridge is started as CG Control starts it, with no flag that would override the plant connection', () => {
    const args = bridgeArgs(stationPaths('/s', 'linux'), 'http://192.168.21.111:8080');
    for (const flag of ['--first-run', '--exit-on-stdin-close']) expect(args).toContain(flag);
    expect(
      args.slice(args.indexOf('--playout-address'), args.indexOf('--playout-address') + 2),
    ).toEqual(['--playout-address', 'http://192.168.21.111:8080']);
    expect(args.slice(args.indexOf('--port'), args.indexOf('--port') + 2)).toEqual([
      '--port',
      '5280',
    ]);
    expect(
      args.slice(args.indexOf('--template-serve-port'), args.indexOf('--template-serve-port') + 2),
    ).toEqual(['--template-serve-port', '7911']);
    // Any of these would build the CasparCG connection from flags and ignore first-run's.
    for (const flag of ['--caspar-host', '--amcp-port', '--osc-port']) {
      expect(args).not.toContain(flag);
    }
  });

  it('the Playout address is written by the bridge’s own one-shot, into the dev state', () => {
    const paths = stationPaths('/s', 'linux');
    expect(setAddressArgs(paths, '192.168.21.111')).toEqual([
      '--state-home',
      '/s',
      '--playout-config-path',
      '/s/.cg-runtime/bridge-playout.json',
      '--set-playout-address',
      '192.168.21.111',
    ]);
  });
});

describe('no stale code — the build covers what runs from dist', () => {
  it('the bridge and everything it imports, and every package the console imports — not the console itself', () => {
    expect(buildArgs()).toEqual([
      'run',
      'build',
      '--filter=@cg/caspar-bridge...',
      '--filter=@cg/runtime^...',
    ]);
  });
});

describe('asking — a yes nobody typed is not a yes', () => {
  it.each([
    ['', true],
    ['y', true],
    ['Y', true],
    [' yes ', true],
    ['n', false],
    ['no', false],
    ['q', false],
    [null, false],
  ])('%j → %s', (answer, yes) => {
    expect(answerIsYes(answer)).toBe(yes);
  });
});

describe('who holds what — the Windows readers', () => {
  const TASKS = [
    '"System Idle Process","0","Services","0","8 K"',
    '"cg-control.exe","13468","RDP-Tcp#0","1","27,632 K"',
    '"cg-bridge.exe","19360","RDP-Tcp#0","1","42,808 K"',
    '"node.exe","4242","RDP-Tcp#0","1","60,000 K"',
  ].join('\r\n');
  const NETSTAT = [
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    127.0.0.1:5174         0.0.0.0:0              LISTENING       19360',
    '  TCP    127.0.0.1:5280         127.0.0.1:54040        ESTABLISHED     19360',
    '  TCP    127.0.0.1:7911         0.0.0.0:0              ABHÖREN         4242',
    '  TCP    [::]:5175              [::]:0                 LISTENING       4242',
    '  UDP    127.0.0.1:6250         *:*                                    19360',
  ].join('\r\n');

  it('reads processes and listeners — a connection is not a listener, and the state word is not read', () => {
    expect(parseTasklist(TASKS)).toContainEqual({ name: 'cg-bridge.exe', pid: 19360 });
    const listeners = parseNetstat(NETSTAT);
    expect(listeners).toContainEqual({ proto: 'tcp', port: 7911, pid: 4242 });
    expect(listeners).toContainEqual({ proto: 'udp', port: 6250, pid: 19360 });
    expect(listeners).toContainEqual({ proto: 'tcp', port: 5175, pid: 4242 });
    expect(listeners.filter((l) => l.port === 5280)).toEqual([]);
  });

  it('the installed CG Control is to ASK about; any other program on a port is NAMED, never stopped', () => {
    const { installed, blocked } = assess(parseTasklist(TASKS), parseNetstat(NETSTAT));
    expect(installed.map((p) => p.pid).sort()).toEqual([13468, 19360]);
    expect(blocked).toEqual([
      { proto: 'tcp', port: 7911, pid: 4242, name: 'node.exe' },
      { proto: 'tcp', port: 5175, pid: 4242, name: 'node.exe' },
    ]);
    const first = blocked[0];
    if (first === undefined) throw new Error('nothing blocked');
    expect(blockedLine(first)).toBe(
      'Port 7911 is held by node.exe (PID 4242) — stop it, then run pnpm dev:station again.',
    );
  });

  it('control — nothing running, nothing held: nothing in the way', () => {
    expect(assess([{ name: 'explorer.exe', pid: 1 }], [])).toEqual({ installed: [], blocked: [] });
  });
});

describe('the flags', () => {
  it('--playout <url>, --fake, --no-open; anything else refused', () => {
    expect(parseArgs([])).toEqual({ playout: undefined, fake: false, open: true });
    expect(parseArgs(['--', '--playout', '192.168.21.111'])).toMatchObject({
      playout: '192.168.21.111',
    });
    expect(parseArgs(['--fake', '--no-open'])).toMatchObject({ fake: true, open: false });
    expect(parseArgs(['--playout'])).toHaveProperty('error');
    expect(parseArgs(['--fake', '--playout', 'x'])).toHaveProperty('error');
    expect(parseArgs(['--port', '1'])).toHaveProperty('error');
  });
});
