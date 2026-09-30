import { describe, expect, it } from 'vitest';
import {
  checkReservedPorts,
  parseExcludedPortRanges,
  reservedPortProblems,
  type BridgePort,
} from '../src/reserved-ports.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` rule 12 (D11) — a port Windows has reserved cannot be listened on, and the
 * bridge says so; it never moves a port by itself.
 */

/** `netsh interface ipv4 show excludedportrange protocol=tcp`, as Windows 11 prints it. */
const NETSH_TCP = [
  '',
  'Protocol tcp Port Exclusion Ranges',
  '',
  'Start Port    End Port',
  '----------    --------',
  '      5230        5329',
  '      5357        5357',
  '     50000       50059     *',
  '',
  '* - Administered port exclusions.',
  '',
].join('\r\n');

/** The same table under a localized header: only the rows' SHAPE is read. */
const NETSH_UDP_LOCALIZED = [
  '',
  'Protokoll udp Portausschlussbereiche',
  '',
  'Startport    Endport',
  '----------    --------',
  '      6200        6299',
  '',
  '* - Verwaltete Portausschlüsse.',
].join('\n');

const PORTS: readonly BridgePort[] = [
  { port: 5280, protocol: 'tcp', role: 'consoles' },
  { port: 7911, protocol: 'tcp', role: 'template pages' },
  { port: 6251, protocol: 'udp', role: 'OSC from CasparCG' },
];

describe('the excluded ranges, read by their shape', () => {
  it('every row of the table — the administered one too — and no header line', () => {
    expect(parseExcludedPortRanges(NETSH_TCP)).toEqual([
      { start: 5230, end: 5329 },
      { start: 5357, end: 5357 },
      { start: 50000, end: 50059 },
    ]);
  });

  it('a localized header changes nothing', () => {
    expect(parseExcludedPortRanges(NETSH_UDP_LOCALIZED)).toEqual([{ start: 6200, end: 6299 }]);
  });

  it('an empty table is no ranges, and a malformed row is not a range', () => {
    expect(parseExcludedPortRanges('')).toEqual([]);
    expect(parseExcludedPortRanges('  70000  70010\n  900  800\n  0  10')).toEqual([]);
  });
});

describe('🔴 a bridge port inside a range is said — naming the port, its role and the range', () => {
  it('control and OSC inside, templates outside', () => {
    const problems = reservedPortProblems(PORTS, {
      tcp: parseExcludedPortRanges(NETSH_TCP),
      udp: parseExcludedPortRanges(NETSH_UDP_LOCALIZED),
    });
    expect(problems.map((p) => `${p.protocol} ${String(p.port)}`)).toEqual([
      'tcp 5280',
      'udp 6251',
    ]);
    expect(problems[0]?.message).toBe(
      'TCP 5280 (consoles) is inside a port range Windows has reserved (5230-5329), so nothing can ' +
        'listen on it. Remove the reservation, or give CG Bridge another port in its configuration ' +
        'file; it never changes a port by itself.',
    );
  });

  it('CONTROL — the same ports with no ranges reserved: nothing to say', () => {
    expect(reservedPortProblems(PORTS, { tcp: [], udp: [] })).toEqual([]);
  });

  it('a TCP range does not reserve the same UDP number', () => {
    expect(
      reservedPortProblems([{ port: 5280, protocol: 'udp', role: 'x' }], {
        tcp: [{ start: 5280, end: 5280 }],
        udp: [],
      }),
    ).toEqual([]);
  });
});

describe('reading the ranges', () => {
  it('reads both protocols and judges every port', async () => {
    const asked: string[] = [];
    const problems = await checkReservedPorts(
      PORTS,
      (protocol) => {
        asked.push(protocol);
        return Promise.resolve(protocol === 'tcp' ? NETSH_TCP : NETSH_UDP_LOCALIZED);
      },
      'win32',
    );
    expect(asked.sort()).toEqual(['tcp', 'udp']);
    expect(problems?.length).toBe(2);
  });

  it('no verdict — never "all clear" — when the ranges cannot be read, or off Windows', async () => {
    expect(
      await checkReservedPorts(PORTS, () => Promise.reject(new Error('netsh missing')), 'win32'),
    ).toBeNull();
    expect(await checkReservedPorts(PORTS, () => Promise.resolve(NETSH_TCP), 'linux')).toBeNull();
  });
});
