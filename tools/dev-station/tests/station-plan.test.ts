import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BACKUP_AMCP_PORT,
  BACKUP_OSC_PORT,
  BRIDGE_CONSOLE_PORT,
  CONSOLE_URL,
  PLAYOUT_ONLY_PORT,
  STATION_PORTS,
  assess,
  banner,
  blockedLine,
  bridgeArgs,
  bridgeStateDir,
  buildArgs,
  devStateDir,
  fakeModulePaths,
  fakeStateName,
  installedStateDir,
  isInside,
  parseArgs,
  parseNetstat,
  parseTasklist,
  playoutOnlyLines,
  previousStateDir,
  setAddressArgs,
  stateOverlap,
  stationPaths,
  stationPorts,
  viteArgs,
  viteEnv,
} from '../src/station-plan.mjs';

/**
 * 🔴 `DEV-STATION-01` — **THE PLAN: one origin, CG Bridge's ports, its own state, and every path
 * named.** Each absence has its positive control beside it.
 */

/** `CENTRAL-BRIDGE-01` — the one line that names CG Bridge on a port: what it is, how to stop it. */
const cgBridgeLine = (port: string, name: string, pid: number): string =>
  `Port ${port} is held by CG Bridge (${name}, PID ${String(pid)}) — the CG Bridge service, or an older CG Control's own bridge. Stop it (Stop-Service CGBridge in an administrator PowerShell, or close that CG Control), then run pnpm dev:station again.`;

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

  it('the station binds CG Bridge’s three ports and the console’s, plus the one internal listener', () => {
    expect(STATION_PORTS).toEqual([
      { proto: 'tcp', port: 5174 },
      { proto: 'tcp', port: 5280 },
      { proto: 'tcp', port: 7911 },
      { proto: 'udp', port: 6251 },
      { proto: 'tcp', port: BRIDGE_CONSOLE_PORT },
    ]);
  });
});

describe('isolation — its own state folder, every path named', () => {
  it('the dev state is %LOCALAPPDATA%\\CG Control Dev; CG Control’s is %APPDATA%\\CG Control; neither holds the other', () => {
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

  it('the bridge is started as a station’s bridge starts — first-run, the lifeline, 5280 and 7911 — with no flag that would override the plant connection', () => {
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

describe('`CENTRAL-BRIDGE-01` — the dev state keeps out of CG Bridge’s folder too', () => {
  const HOME = 'C:\\Users\\op';
  const ENV = { ...WIN_ENV, ProgramData: 'C:\\ProgramData' };

  it('CG Bridge’s folder is %ProgramData%\\CG Bridge — C:\\ProgramData when unset — and there is none off Windows', () => {
    expect(bridgeStateDir(ENV, 'win32')).toBe('C:\\ProgramData\\CG Bridge');
    expect(bridgeStateDir({ ProgramData: 'E:\\Data' }, 'win32')).toBe('E:\\Data\\CG Bridge');
    expect(bridgeStateDir({}, 'win32')).toBe('C:\\ProgramData\\CG Bridge');
    // An empty value names no folder, and a relative one would guard nothing.
    expect(bridgeStateDir({ ProgramData: ' ' }, 'win32')).toBe('C:\\ProgramData\\CG Bridge');
    expect(bridgeStateDir(ENV, 'linux')).toBeNull();
    expect(bridgeStateDir(ENV, 'darwin')).toBeNull();
  });

  it('🔴 a dev folder inside it is refused, naming the folder; control: %LOCALAPPDATA%\\CG Control Dev overlaps neither', () => {
    expect(stateOverlap('C:\\ProgramData\\CG Bridge\\dev', ENV, 'win32', HOME)).toBe(
      "The dev state folder C:\\ProgramData\\CG Bridge\\dev overlaps CG Bridge's own C:\\ProgramData\\CG Bridge — refusing.",
    );
    // Whatever its casing — and the other way round: a dev folder that HOLDS CG Bridge's.
    expect(stateOverlap('c:\\programdata\\cg bridge\\.cg-runtime', ENV, 'win32', HOME)).toMatch(
      / overlaps CG Bridge's own C:\\ProgramData\\CG Bridge — refusing\.$/,
    );
    expect(stateOverlap('C:\\ProgramData', ENV, 'win32', HOME)).toBe(
      "The dev state folder C:\\ProgramData overlaps CG Bridge's own C:\\ProgramData\\CG Bridge — refusing.",
    );
    // CG Control's folder is refused exactly as before.
    expect(
      stateOverlap('C:\\Users\\op\\AppData\\Roaming\\CG Control\\dev', ENV, 'win32', HOME),
    ).toBe(
      "The dev state folder C:\\Users\\op\\AppData\\Roaming\\CG Control\\dev overlaps CG Control's own C:\\Users\\op\\AppData\\Roaming\\CG Control — refusing.",
    );
    // CONTROL — the dev station's own folder overlaps neither; nor does a sibling whose name only
    // starts with CG Bridge's.
    const dev = devStateDir(ENV, 'win32', HOME);
    expect(dev).toBe('C:\\Users\\op\\AppData\\Local\\CG Control Dev');
    expect(stateOverlap(dev, ENV, 'win32', HOME)).toBeNull();
    expect(stateOverlap('C:\\ProgramData\\CG Bridge Dev', ENV, 'win32', HOME)).toBeNull();
  });

  it('off Windows only CG Control’s folder is guarded: there is no CG Bridge folder to overlap', () => {
    const env = { XDG_DATA_HOME: '/h/.local/share', ProgramData: '/h/.local/share' };
    expect(stateOverlap('/h/.local/share/CG Control Dev', env, 'linux', '/h')).toBeNull();
    expect(stateOverlap('/h/.local/share/CG Control/x', env, 'linux', '/h')).toBe(
      "The dev state folder /h/.local/share/CG Control/x overlaps CG Control's own /h/.local/share/CG Control — refusing.",
    );
  });
});

describe('`DELTA-MULTI-CHANNEL-01-A` A1 — `--fake` is a whole station', () => {
  const repo = path.resolve(here, '..', '..', '..');

  it('the five modules the launcher loads by path are there — the three fakes, their two compositions, and CasparCG’s stand-in from its build', () => {
    const files = fakeModulePaths(repo);
    expect(Object.keys(files).sort()).toEqual([
      'caspar',
      'localCaspar',
      'pgmFeed',
      'playout',
      'station',
    ]);
    for (const [name, file] of Object.entries(files)) {
      expect(fs.existsSync(file), `${name}: ${file}`).toBe(true);
    }
    // Control: the instrument can say "not there".
    expect(fs.existsSync(path.join(repo, 'tools', 'amcp-mock', 'dist', 'no-such-file.js'))).toBe(
      false,
    );
  });

  it('the bridge’s log is kept inside the dev state; the last fake station is kept beside it', () => {
    const stateDir = 'C:\\Users\\op\\AppData\\Local\\CG Control Dev\\fake';
    const paths = stationPaths(stateDir, 'win32');
    expect(paths.bridgeLog).toBe(`${stateDir}\\bridge.log`);
    expect(isInside(paths.bridgeLog, stateDir, 'win32')).toBe(true);
    // `FIELD-FIXES-01-A` — and the AMCP log beside it.
    expect(paths.amcpLog).toBe(`${stateDir}\\amcp.log`);
    expect(isInside(paths.amcpLog, stateDir, 'win32')).toBe(true);
    expect(previousStateDir(stateDir)).toBe(`${stateDir}.previous`);
    expect(isInside(previousStateDir(stateDir), stateDir, 'win32')).toBe(false);
  });

  it('the banner names the fake CasparCG, and says in one line that the same-machine warning is expected', () => {
    const lines = banner({
      stateDir: 'C:\\x\\fake',
      playout: 'http://127.0.0.1:63114',
      fake: {
        username: 'cg-admin',
        password: 'pw',
        caspar: '127.0.0.1:5250',
        feeds: [9250, 9251],
        notes: [],
      },
      log: 'C:\\x\\fake\\bridge.log',
    });
    expect(lines).toContain(
      '  CasparCG 127.0.0.1:5250  (fake · channels 1 and 2 · programme feeds on 9250, 9251)',
    );
    expect(lines.filter((l) => l.includes('The Playout and CasparCG run on this machine'))).toEqual(
      ['  check    "The Playout and CasparCG run on this machine" is expected here: they do.'],
    );
    expect(lines).toContain('  log      C:\\x\\fake\\bridge.log');
    // Control: a dev station on a real Playout has no fake CasparCG and no such line.
    const plain = banner({ stateDir: 'C:\\x', playout: 'http://192.168.21.111:8080' });
    expect(plain.some((l) => l.includes('CasparCG'))).toBe(false);
  });

  it('a part that could not start is said on the banner, one line each', () => {
    const lines = banner({
      stateDir: 'C:\\x\\fake',
      playout: 'http://127.0.0.1:63114',
      fake: {
        username: 'cg-admin',
        password: 'pw',
        caspar: '127.0.0.1:5250',
        feeds: [9250],
        notes: ['Channel 2’s programme feed did not start.'],
      },
    });
    expect(lines.filter((l) => l.startsWith('  note '))).toEqual([
      '  note     Channel 2’s programme feed did not start.',
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

  it('🔴 every program on a station port is NAMED, one line per port — CG Bridge by its name — and CG Control, holding none, is no line at all', () => {
    const { blocked } = assess(parseTasklist(TASKS), parseNetstat(NETSTAT));
    expect(blocked).toEqual([
      { proto: 'tcp', port: 5174, pid: 19360, name: 'cg-bridge.exe' },
      { proto: 'tcp', port: 7911, pid: 4242, name: 'node.exe' },
      { proto: 'tcp', port: 5175, pid: 4242, name: 'node.exe' },
    ]);
    expect(blocked.map((b) => blockedLine(b))).toEqual([
      cgBridgeLine('5174', 'cg-bridge.exe', 19360),
      'Port 7911 is held by node.exe (PID 4242) — stop it, then run pnpm dev:station again.',
      'Port 5175 is held by node.exe (PID 4242) — stop it, then run pnpm dev:station again.',
    ]);
    // cg-control.exe (13468) is in the process list and on no line.
    expect(blocked.some((b) => b.pid === 13468)).toBe(false);
  });

  it('🔴 `CENTRAL-BRIDGE-01` — cg-bridge.exe on 5280 is named as CG Bridge, with how to stop it by hand, and never an offer to', () => {
    const { blocked } = assess(
      [{ name: 'cg-bridge.exe', pid: 1234 }],
      [{ proto: 'tcp', port: 5280, pid: 1234 }],
    );
    expect(blocked.map((b) => blockedLine(b))).toEqual([
      "Port 5280 is held by CG Bridge (cg-bridge.exe, PID 1234) — the CG Bridge service, or an older CG Control's own bridge. Stop it (Stop-Service CGBridge in an administrator PowerShell, or close that CG Control), then run pnpm dev:station again.",
    ]);
  });

  it('the service on all three of its ports is three lines, in the station’s order — the OSC one as 6251/udp', () => {
    const { blocked } = assess(
      [{ name: 'cg-bridge.exe', pid: 1234 }],
      [
        { proto: 'udp', port: 6251, pid: 1234 },
        { proto: 'tcp', port: 7911, pid: 1234 },
        { proto: 'tcp', port: 5280, pid: 1234 },
      ],
    );
    expect(blocked.map((b) => blockedLine(b))).toEqual([
      cgBridgeLine('5280', 'cg-bridge.exe', 1234),
      cgBridgeLine('7911', 'cg-bridge.exe', 1234),
      cgBridgeLine('6251/udp', 'cg-bridge.exe', 1234),
    ]);
  });

  it('the image is matched whatever its casing and named as the reader reported it; control: any other image keeps the plain line', () => {
    expect(blockedLine({ proto: 'tcp', port: 5280, pid: 7, name: 'CG-Bridge.EXE' })).toBe(
      cgBridgeLine('5280', 'CG-Bridge.EXE', 7),
    );
    expect(blockedLine({ proto: 'tcp', port: 5280, pid: 7, name: 'cg-bridge-old.exe' })).toBe(
      'Port 5280 is held by cg-bridge-old.exe (PID 7) — stop it, then run pnpm dev:station again.',
    );
    expect(blockedLine({ proto: 'udp', port: 6251, pid: 7, name: 'another program' })).toBe(
      'Port 6251/udp is held by another program (PID 7) — stop it, then run pnpm dev:station again.',
    );
  });

  it('🔴 CG Control running, holding no port, is not in the way; control: the same list with a program on a station port is', () => {
    const processes = [
      { name: 'cg-control.exe', pid: 13468 },
      { name: 'node.exe', pid: 4242 },
    ];
    // CG Control connected to a CG Bridge: a connection, never a listener.
    const connected = parseNetstat(
      '  TCP    127.0.0.1:61234        127.0.0.1:5280         ESTABLISHED     13468',
    );
    expect(connected).toEqual([]);
    expect(assess(processes, connected)).toEqual({ blocked: [] });
    expect(assess(processes, [])).toEqual({ blocked: [] });
    // CONTROL — the same processes, one of them on a station port: named, one line.
    expect(assess(processes, [{ proto: 'tcp', port: 5280, pid: 4242 }])).toEqual({
      blocked: [{ proto: 'tcp', port: 5280, pid: 4242, name: 'node.exe' }],
    });
  });

  it('control — nothing running, nothing held: nothing in the way', () => {
    expect(assess([{ name: 'explorer.exe', pid: 1 }], [])).toEqual({ blocked: [] });
  });
});

describe('the flags', () => {
  it('--playout <url>, --fake, --no-open; anything else refused', () => {
    expect(parseArgs([])).toEqual({
      playout: undefined,
      fake: false,
      pair: false,
      open: true,
      playoutOnly: false,
    });
    expect(parseArgs(['--', '--playout', '192.168.21.111'])).toMatchObject({
      playout: '192.168.21.111',
    });
    expect(parseArgs(['--fake', '--no-open'])).toMatchObject({ fake: true, open: false });
    expect(parseArgs(['--playout'])).toHaveProperty('error');
    expect(parseArgs(['--fake', '--playout', 'x'])).toHaveProperty('error');
    expect(parseArgs(['--port', '1'])).toHaveProperty('error');
  });
});

describe('`RELEASE-0112-01` (`R-085`) — `--fake --pair`: two engines on one PC', () => {
  it('--pair goes with --fake, and not with --caspar — each refused in one line', () => {
    expect(parseArgs(['--fake', '--pair'])).toMatchObject({ fake: true, pair: true });
    expect(parseArgs(['--pair'])).toEqual({
      error: '--pair goes with --fake: pnpm dev:station --fake --pair.',
    });
    expect(parseArgs(['--fake', '--pair', '--caspar', '127.0.0.1:5250'])).toEqual({
      error:
        "--pair runs two fake engines, each with its own CasparCG stand-in — not this machine's (--caspar).",
    });
    // Control: a one-engine run carries no pair.
    expect(parseArgs(['--fake'])).toMatchObject({ pair: false });
  });

  it('a pair keeps its own state folder, and binds server B’s OSC port too', () => {
    expect(fakeStateName({ caspar: undefined, pair: true })).toBe('fake-pair');
    expect(stationPorts({ pair: true })).toEqual([
      ...STATION_PORTS,
      { proto: 'udp', port: BACKUP_OSC_PORT },
    ]);
    expect(BACKUP_OSC_PORT).toBe(6252);
    // Control: a one-engine run probes the station's ports, exactly.
    expect(stationPorts({ pair: false })).toBe(STATION_PORTS);
  });

  it('the bridge is told server B and the backup engine’s address — and server A stays the fake station’s', () => {
    const backup = {
      address: 'http://127.0.0.1:63200',
      caspar: `127.0.0.1:${String(BACKUP_AMCP_PORT)}`,
    };
    const args = bridgeArgs(stationPaths('/s', 'linux'), 'http://127.0.0.1:63114', {}, backup);
    const value = (flag: string): string | undefined => args[args.indexOf(flag) + 1];
    expect(value('--backup-host')).toBe('127.0.0.1');
    expect(value('--backup-amcp-port')).toBe('5251');
    expect(value('--backup-playout-address')).toBe('http://127.0.0.1:63200');
    expect(value('--playout-address')).toBe('http://127.0.0.1:63114');
    // Server A is the flags' default, which IS the fake station's — no A flag is passed.
    for (const flag of ['--caspar-host', '--amcp-port', '--osc-port', '--backup-osc-port']) {
      expect(args).not.toContain(flag);
    }
    for (const flag of ['--first-run', '--exit-on-stdin-close']) expect(args).toContain(flag);
    // Control: without a backup the bridge is told no server B at all.
    const single = bridgeArgs(stationPaths('/s', 'linux'), 'http://127.0.0.1:63114');
    expect(single.filter((a) => a.startsWith('--backup-'))).toEqual([]);
  });

  it('the banner prints both engines, each with its own password', () => {
    const lines = banner({
      stateDir: 'C:\\x\\fake-pair',
      playout: 'http://127.0.0.1:63114',
      fake: {
        username: 'cg-admin',
        password: 'pw-a',
        caspar: '127.0.0.1:5250',
        feeds: [9250, 9251],
        notes: [],
        backup: {
          address: 'http://127.0.0.1:63200',
          username: 'cg-admin',
          password: 'pw-b',
          caspar: '127.0.0.1:5251',
        },
      },
    });
    expect(lines).toContain(
      '  Playout  http://127.0.0.1:63114  (fake · sign in as cg-admin / pw-a)',
    );
    expect(lines).toContain(
      '  backup   http://127.0.0.1:63200  (fake backup engine · sign in as cg-admin / pw-b)',
    );
    expect(lines).toContain(
      "  server B 127.0.0.1:5251  (fake · the backup engine's CasparCG, channels 1 and 2)",
    );
  });
});

describe('`DEV-LOCAL-CASPAR-01` — `--fake --caspar <host:port>`', () => {
  it('--caspar carries its value as typed, in either spelling, with --fake', () => {
    expect(parseArgs(['--fake', '--caspar', '127.0.0.1:5250'])).toEqual({
      playout: undefined,
      fake: true,
      pair: false,
      open: true,
      caspar: '127.0.0.1:5250',
      playoutOnly: false,
    });
    expect(parseArgs(['--fake', '--caspar=[::1]:5250', '--no-open'])).toMatchObject({
      caspar: '[::1]:5250',
      open: false,
    });
    // The loopback rule is NOT here: whatever was typed reaches the one rule the launcher asks.
    expect(parseArgs(['--fake', '--caspar', '192.168.21.111:5250'])).toMatchObject({
      caspar: '192.168.21.111:5250',
    });
    // Control: a run without it carries none.
    expect(parseArgs(['--fake'])).toMatchObject({ caspar: undefined });
  });

  it('--caspar goes with --fake, and needs a value — each refused in one line', () => {
    expect(parseArgs(['--caspar', '127.0.0.1:5250'])).toEqual({
      error: '--caspar goes with --fake: pnpm dev:station --fake --caspar 127.0.0.1:5250.',
    });
    expect(parseArgs(['--fake', '--caspar'])).toEqual({
      error: "--caspar needs this machine's CasparCG: --caspar 127.0.0.1:5250.",
    });
    expect(parseArgs(['--fake', '--caspar', '--no-open'])).toHaveProperty('error');
    expect(parseArgs(['--fake', '--playout', 'x', '--caspar', '127.0.0.1:5250'])).toHaveProperty(
      'error',
    );
  });

  it('a local-core run keeps its own state folder, beside the fake one', () => {
    expect(fakeStateName({ caspar: undefined })).toBe('fake');
    expect(fakeStateName({ caspar: '127.0.0.1:5250' })).toBe('fake-local');
  });

  const LOCAL = {
    version: '2.5.0 69e8ad5 Stable',
    channels: [
      { channel: 1, format: '1080i5000' },
      { channel: 2, format: '720p5000' },
    ],
    mediaFolder: 'D:/CasparCG Server/Server/media/',
    clips: 812,
    stills: 3,
  };

  it('the start names the core, its version and its channels; its media; and where PROGRAM is seen', () => {
    const lines = banner({
      stateDir: 'C:\\x\\fake-local',
      playout: 'http://127.0.0.1:63114',
      fake: {
        username: 'cg-admin',
        password: 'pw',
        caspar: '127.0.0.1:5250',
        local: LOCAL,
        notes: [],
      },
    });
    expect(lines).toContain(
      "  CasparCG 127.0.0.1:5250  (this machine's · 2.5.0 69e8ad5 Stable · CH 1 1080i5000, CH 2 720p5000)",
    );
    expect(lines).toContain(
      '  media    812 clips, 3 stills in D:/CasparCG Server/Server/media/  (read again when the Media tab asks after 30 s)',
    );
    expect(lines).toContain("  PROGRAM  no return feed here — watch CasparCG's own window");
    expect(lines).toContain('  Ctrl+C stops it — what is on air stays on CasparCG.');
    // The same-machine warning is still said to be expected — it is true here too.
    expect(
      lines.filter((l) => l.includes('The Playout and CasparCG run on this machine')),
    ).toHaveLength(1);
    // No fake CasparCG, and no programme feed, is claimed.
    expect(lines.join('\n')).not.toMatch(/fake · channels|programme feeds on/);
  });

  it('one clip, no still, and no media folder read at all', () => {
    const one = banner({
      stateDir: 'C:\\x',
      playout: 'http://127.0.0.1:1',
      fake: {
        username: 'a',
        password: 'b',
        caspar: '127.0.0.1:5250',
        local: { ...LOCAL, clips: 1, stills: 0 },
      },
    });
    expect(one).toContain(
      '  media    1 clip in D:/CasparCG Server/Server/media/  (read again when the Media tab asks after 30 s)',
    );
    const none = banner({
      stateDir: 'C:\\x',
      playout: 'http://127.0.0.1:1',
      fake: {
        username: 'a',
        password: 'b',
        caspar: '127.0.0.1:5250',
        local: { ...LOCAL, mediaFolder: null, clips: 0, stills: 0 },
        notes: [
          'CasparCG did not name its media folder (INFO PATHS answered 404) — the Media tab is empty.',
        ],
      },
    });
    expect(none).toContain('  media    none — see the note below');
    expect(none).toContain(
      '  note     CasparCG did not name its media folder (INFO PATHS answered 404) — the Media tab is empty.',
    );
  });
});

describe('`FIELD-FIXES-01` H — what the console server is started with', () => {
  it('🔴 the relay’s listener and the one console host, and never a HOST or PORT that would move the bind', () => {
    const env = viteEnv(
      { HOST: '0.0.0.0', PORT: '80', PATH: 'C:\\bin', CG_BRIDGE_CONSOLE: 'stale' },
      'http://127.0.0.1:5175',
    );
    expect(env).toEqual({
      PATH: 'C:\\bin',
      CG_BRIDGE_CONSOLE: 'http://127.0.0.1:5175',
      CG_CONSOLE_HOST: '127.0.0.1',
    });
  });
});

describe('`CENTRAL-BRIDGE-01` — `--playout-only`: the fake Playout alone, for CG Bridge installed here', () => {
  const local = ['--fake', '--caspar', '127.0.0.1:5250'];

  it('goes with --fake --caspar, on CG Bridge’s default Playout port unless --playout-port says', () => {
    expect(parseArgs([...local, '--playout-only'])).toMatchObject({
      caspar: '127.0.0.1:5250',
      playoutOnly: true,
      playoutPort: undefined,
    });
    expect(PLAYOUT_ONLY_PORT).toBe(8080);
    expect(parseArgs([...local, '--playout-only', '--playout-port', '18080'])).toMatchObject({
      playoutPort: 18080,
    });
    expect(parseArgs([...local, '--playout-only', '--playout-port=18080'])).toMatchObject({
      playoutPort: 18080,
    });
    // Control: without it, the same flags are a whole station.
    expect(parseArgs(local)).toMatchObject({ playoutOnly: false, playoutPort: undefined });
  });

  it('each misuse is refused in one line', () => {
    expect(parseArgs(['--playout-only'])).toEqual({
      error:
        '--playout-only goes with --fake --caspar: ' +
        'pnpm dev:station --fake --caspar 127.0.0.1:5250 --playout-only.',
    });
    expect(parseArgs(['--fake', '--playout-only'])).toHaveProperty('error');
    expect(parseArgs([...local, '--playout-port', '8080'])).toEqual({
      error: '--playout-port goes with --playout-only.',
    });
    expect(parseArgs([...local, '--playout-only', '--playout-port'])).toEqual({
      error: '--playout-port needs a port: --playout-port 8080.',
    });
    for (const bad of ['0', '65536', 'eighty', '-1'])
      expect(parseArgs([...local, '--playout-only', `--playout-port=${bad}`]), bad).toEqual({
        error: `${bad} is not a port — --playout-port 8080.`,
      });
  });

  it('says where the fake is, who signs it in, and that no bridge runs here', () => {
    const text = playoutOnlyLines({
      address: 'http://127.0.0.1:8080',
      username: 'cg-admin',
      password: 'fixture-password',
      caspar: '127.0.0.1:5250',
      local: {
        version: '2.5.0 69e8ad5 Stable',
        channels: [{ channel: 1, format: '1080i5000' }],
        mediaFolder: null,
        clips: 0,
        stills: 0,
      },
    }).join('\n');
    expect(text).toContain('Playout  http://127.0.0.1:8080');
    expect(text).toContain('cg-admin · fixture-password');
    expect(text).toContain('no bridge, no console here');
    expect(text).toContain('CasparCG 127.0.0.1:5250');
    expect(text).toContain('Ctrl+C stops it.');
  });
});
