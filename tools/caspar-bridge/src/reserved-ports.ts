import { execFile } from 'node:child_process';

/**
 * 🔴 `CENTRAL-BRIDGE-01` rule 12 (D11) — **WINDOWS RESERVED PORT RANGES MOVE, AND A PORT INSIDE ONE
 * CANNOT BE LISTENED ON.**
 *
 * Hyper-V, WinNAT and Docker reserve blocks of TCP and UDP ports — excluded port ranges — and the
 * blocks move between boots. A port inside one refuses every bind (`EACCES`), whoever asks, so a
 * CG Bridge whose `5280`, `7911` or OSC port lands in one simply cannot take consoles, serve pages or
 * hear its core. At start the bridge reads the ranges, and a port inside one is said — one log line
 * and one `/health` problem, naming the port, what it is for and the range. The installer runs the
 * same check (`--check-ports`) and warns. **Ports are never changed by themselves**: the Playout
 * team and every console were told a number, and a bridge that moved would be one nobody can find.
 *
 * `netsh interface ipv4 show excludedportrange protocol=<tcp|udp>` prints a localized header and
 * then one row per range — start, end, and a `*` for an administered (persistent) exclusion. Only the
 * rows are read, by their shape; the header's words are never matched.
 */

export type PortProtocol = 'tcp' | 'udp';

/** One excluded range, inclusive at both ends. */
export interface PortRange {
  readonly start: number;
  readonly end: number;
}

/** A port the bridge uses, and what for — the words a problem names it with. */
export interface BridgePort {
  readonly port: number;
  readonly protocol: PortProtocol;
  /** `consoles`, `template pages`, `OSC from CasparCG`. */
  readonly role: string;
}

/** A port the bridge cannot use, in the words the log, `/health` and the installer say. */
export interface PortProblem {
  readonly port: number;
  readonly protocol: PortProtocol;
  readonly range: PortRange;
  readonly message: string;
}

const RANGE_ROW = /^\s*(\d+)\s+(\d+)(?:\s+\*)?\s*$/;

/** The rows of `netsh … show excludedportrange`, by shape; the (localized) header is skipped. */
export function parseExcludedPortRanges(text: string): PortRange[] {
  const ranges: PortRange[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = RANGE_ROW.exec(line);
    if (m === null) continue;
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (start > 0 && end >= start && end <= 65535) ranges.push({ start, end });
  }
  return ranges;
}

/** Every port the bridge uses that falls inside a reserved range of its protocol. */
export function reservedPortProblems(
  ports: readonly BridgePort[],
  reserved: Readonly<Record<PortProtocol, readonly PortRange[]>>,
): PortProblem[] {
  const problems: PortProblem[] = [];
  for (const p of ports) {
    const range = reserved[p.protocol].find((r) => p.port >= r.start && p.port <= r.end);
    if (range === undefined) continue;
    problems.push({
      port: p.port,
      protocol: p.protocol,
      range,
      message: reservedPortSentence(p, range),
    });
  }
  return problems;
}

/** The one sentence for a reserved port — the log line, the `/health` problem and the installer's warning. */
export function reservedPortSentence(p: BridgePort, range: PortRange): string {
  return (
    `${p.protocol.toUpperCase()} ${String(p.port)} (${p.role}) is inside a port range Windows has ` +
    `reserved (${String(range.start)}-${String(range.end)}), so nothing can listen on it. Remove the ` +
    'reservation, or give CG Bridge another port in its configuration file; it never changes a port ' +
    'by itself.'
  );
}

/** Runs one `netsh` read. Injected in tests; the real one exists only on Windows. */
export type ExcludedRangeReader = (protocol: PortProtocol) => Promise<string>;

export const netshExcludedRanges: ExcludedRangeReader = (protocol) =>
  new Promise((resolve, reject) => {
    execFile(
      'netsh',
      ['interface', 'ipv4', 'show', 'excludedportrange', `protocol=${protocol}`],
      { windowsHide: true, timeout: 5_000 },
      (err, stdout) => {
        if (err !== null) reject(err);
        else resolve(stdout);
      },
    );
  });

/**
 * Read both protocols' ranges and judge the bridge's ports against them. `null` when the ranges
 * cannot be read (not Windows, or `netsh` failed): no verdict, never "all clear" — a bind that then
 * fails with `EACCES` is reported by the listener itself.
 */
export async function checkReservedPorts(
  ports: readonly BridgePort[],
  read: ExcludedRangeReader = netshExcludedRanges,
  platform: NodeJS.Platform = process.platform,
): Promise<PortProblem[] | null> {
  if (platform !== 'win32') return null;
  try {
    const [tcp, udp] = await Promise.all([read('tcp'), read('udp')]);
    return reservedPortProblems(ports, {
      tcp: parseExcludedPortRanges(tcp),
      udp: parseExcludedPortRanges(udp),
    });
  } catch {
    return null;
  }
}

/**
 * A listener that failed with `EACCES` on a port no listed range holds — WSL and some VPN clients
 * reserve ports `netsh` does not show. Said the same way, with no range to name.
 */
export function unlistedReservationSentence(p: BridgePort): string {
  return (
    `${p.protocol.toUpperCase()} ${String(p.port)} (${p.role}) was refused by Windows (EACCES), ` +
    'though no reserved range lists it; another program or a reservation outside netsh holds it. ' +
    'CG Bridge never changes a port by itself.'
  );
}
