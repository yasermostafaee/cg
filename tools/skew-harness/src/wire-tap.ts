import * as net from 'node:net';

/**
 * A transparent TCP tap between the bridge and CasparCG, so the harness can say WHICH VERBS
 * were in the switch window without changing a line of the bridge.
 *
 * ── WHY A PROXY AND NOT A HOOK IN THE BRIDGE ────────────────────────────────
 *
 * `B-174` and `B-155` are separated by exactly one question — _did a `PLAY` land inside the
 * switch?_ — and the answer has to come from the WIRE, because that is where the two items
 * were defined to differ. Instrumenting `CasparRuntime` would answer a question about the
 * bridge's intent; the tap answers the question about the bytes. It also costs the product
 * nothing: the harness points the bridge at this port instead of 5250 and everything else,
 * including the urgent-lane ordering the skew is made of, is untouched.
 *
 * ⚠ The tap adds a loopback hop to every command. It is a memcpy on an already-connected
 * socket and is well under the sub-millisecond noise of the measurement, but it is a real
 * addition and is recorded here rather than assumed away — `k` is a frame count at 20–40 ms
 * granularity, which is three orders of magnitude above it.
 */
export interface TappedLine {
  /** `send` = bridge → CasparCG, `recv` = CasparCG → bridge. */
  readonly dir: 'send' | 'recv';
  /** Milliseconds since the tap was opened, from a monotonic clock. */
  readonly at: number;
  readonly line: string;
}

export interface WireTap {
  readonly port: number;
  lines(): readonly TappedLine[];
  /** Everything tapped since `mark`, which is a `lines().length` taken earlier. */
  since(mark: number): readonly TappedLine[];
  close(): Promise<void>;
}

export async function openWireTap(
  upstreamHost: string,
  upstreamPort: number,
  bindHost = '127.0.0.1',
): Promise<WireTap> {
  const captured: TappedLine[] = [];
  const started = process.hrtime.bigint();
  const sockets = new Set<net.Socket>();
  const now = (): number => Number(process.hrtime.bigint() - started) / 1e6;

  const record = (dir: 'send' | 'recv', text: string, hold: { rest: string }): void => {
    hold.rest += text;
    let i = hold.rest.indexOf('\r\n');
    while (i >= 0) {
      const line = hold.rest.slice(0, i);
      hold.rest = hold.rest.slice(i + 2);
      if (line.length > 0) captured.push({ dir, at: now(), line });
      i = hold.rest.indexOf('\r\n');
    }
  };

  const server = net.createServer((downstream) => {
    sockets.add(downstream);
    downstream.setNoDelay(true);
    const upstream = net.connect(upstreamPort, upstreamHost);
    upstream.setNoDelay(true);
    sockets.add(upstream);

    const outHold = { rest: '' };
    const inHold = { rest: '' };

    downstream.on('data', (buf: Buffer) => {
      record('send', buf.toString('utf-8'), outHold);
      upstream.write(buf);
    });
    upstream.on('data', (buf: Buffer) => {
      record('recv', buf.toString('utf-8'), inHold);
      downstream.write(buf);
    });

    const drop = (): void => {
      downstream.destroy();
      upstream.destroy();
      sockets.delete(downstream);
      sockets.delete(upstream);
    };
    downstream.on('error', drop);
    upstream.on('error', drop);
    downstream.on('close', drop);
    upstream.on('close', drop);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, bindHost, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('wire tap did not bind a TCP port');
  }

  return {
    port: address.port,
    lines: () => captured,
    since: (mark: number) => captured.slice(mark),
    close: async () => {
      for (const s of sockets) s.destroy();
      sockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * The verbs that can MOVE A PICTURE, enumerated rather than summarised — the same list
 * `look-switch-refusal.integration.test.ts` keeps, and for the same reason: a switch moves
 * boxes with `MIXER FILL`, so a `PLAY`-only check is blind to most of what a switch does.
 */
export const MOVING_VERBS = ['PLAY', 'LOADBG', 'MIXER', 'CG', 'CLEAR'] as const;

/** A one-line-per-command summary of what the bridge SENT in a window. */
export function sentCommands(window: readonly TappedLine[]): readonly string[] {
  return window.filter((l) => l.dir === 'send').map((l) => l.line);
}

/**
 * 🔴 **THE ONE TEST THAT SEPARATES `B-174` FROM `B-155`.**
 *
 * `B-174` is the gap between `MIXER FILL` and the following `CG UPDATE` in a switch with NO
 * `PLAY` at all. `B-155` requires a producer change inside the same window. So a window
 * carrying a `PLAY` is not a `B-174` sample, however clean its numbers look, and the harness
 * refuses to report it as one.
 */
export function windowContainsPlay(window: readonly TappedLine[]): boolean {
  return sentCommands(window).some((line) => /^\s*(PLAY|LOADBG)\b/i.test(line));
}
