import * as net from 'node:net';

/**
 * A minimal AMCP client for the harness's OWN commands — the file consumer, the channel
 * mode, and the `INFO` read that records what mode the measurement was taken in.
 *
 * 🔴 **It never issues a look switch.** The switch under measurement goes through
 * `CasparRuntime.setActiveLook`, because a hand-typed `MIXER FILL` + `CG UPDATE` pair would
 * measure this file rather than the product. This client exists for the RECORDER and the
 * channel, which are the instrument, not the subject.
 *
 * ── FRAMING, AS MEASURED ON 2.5.0 `69e8ad5` RATHER THAN AS DOCUMENTED ───────
 *
 *   `202`/`4xx`/`5xx` → exactly one CRLF line, no payload.
 *   `201`             → status line + ONE payload chunk, which contains bare `\n` of its own
 *                       (an `INFO` XML document arrives as a single CRLF-terminated chunk).
 *   `200`             → status line + N lines + a BLANK line.
 *
 * ⚠ Splitting on bare `\n` shreds an `INFO` reply into dozens of phantom responses and
 * desynchronises every command after it — measured, and the reason the rule above is stated
 * as bytes rather than as prose.
 */
export interface AmcpReply {
  readonly command: string;
  readonly status: string;
  readonly body: readonly string[];
  readonly ms: number;
}

export interface AmcpClient {
  send(command: string, timeoutMs?: number): Promise<AmcpReply>;
  close(): void;
}

export function connectAmcp(host: string, port: number): Promise<AmcpClient> {
  const socket = net.connect(port, host);
  socket.setEncoding('utf-8');
  socket.setNoDelay(true);

  let buffer = '';
  let pending: { resolve: (lines: string[]) => void; want: number; lines: string[] } | null = null;
  const spare: string[] = [];

  function feed(line: string): void {
    if (pending === null) {
      spare.push(line);
      return;
    }
    const p = pending;
    p.lines.push(line);
    if (p.want === 0) {
      const code = Number(line.slice(0, 3));
      p.want = code === 201 ? 2 : code === 200 ? -1 : 1;
    }
    const done = p.want === -1 ? p.lines.length > 1 && line === '' : p.lines.length >= p.want;
    if (done) {
      pending = null;
      p.resolve(p.lines);
    }
  }

  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let i = buffer.indexOf('\r\n');
    while (i >= 0) {
      feed(buffer.slice(0, i));
      buffer = buffer.slice(i + 2);
      i = buffer.indexOf('\r\n');
    }
  });

  return new Promise<AmcpClient>((resolve, reject) => {
    socket.once('error', reject);
    socket.once('connect', () => {
      resolve({
        async send(command: string, timeoutMs = 15_000): Promise<AmcpReply> {
          const started = process.hrtime.bigint();
          const lines = await new Promise<string[]>((res, rej) => {
            const timer = setTimeout(
              () => rej(new Error(`AMCP timed out after ${String(timeoutMs)} ms: ${command}`)),
              timeoutMs,
            );
            pending = {
              resolve: (l) => {
                clearTimeout(timer);
                res(l);
              },
              want: 0,
              lines: [],
            };
            while (spare.length > 0 && pending !== null) {
              const next = spare.shift();
              if (next !== undefined) feed(next);
            }
            if (pending !== null) socket.write(`${command}\r\n`);
          });
          const ms = Number(process.hrtime.bigint() - started) / 1e6;
          return { command, status: lines[0] ?? '', body: lines.slice(1), ms };
        },
        close(): void {
          socket.end();
          socket.destroy();
        },
      });
    });
  });
}

/** The channel's configured video mode and the field rate `INFO` reports for it. */
export interface ChannelMode {
  readonly format: string;
  /**
   * ⚠ What `INFO` calls `framerate` is the FIELD rate, not the frame rate: `video_channel`
   * publishes `framerate.numerator() * field_count`, so `1080i5000` and `1080p5000` both
   * report **50**. The frame period is derived from {@link framePeriodMs}, never from this.
   */
  readonly reportedFramerate: number;
}

export async function readChannelMode(client: AmcpClient, channel: number): Promise<ChannelMode> {
  const reply = await client.send(`INFO ${String(channel)}`);
  const xml = reply.body.join('\n');
  const format = /<format>([^<]+)<\/format>/.exec(xml)?.[1] ?? 'unknown';
  const framerate = Number(/<framerate>([^<]+)<\/framerate>/.exec(xml)?.[1] ?? 'NaN');
  return { format, reportedFramerate: framerate };
}

/**
 * The period of ONE CHANNEL FRAME — the unit `k` is counted in — for a CasparCG mode name.
 *
 * 🔴 **This is the distinction the whole measurement turns on, and it is a fact about the
 * SERVER, not about the file.** `stage.cpp` pulls BOTH fields inside a single tick under
 * `field_count == 2`, with the comment _"it lets us tick at 25hz and avoids amcp changes
 * starting on the second field"_. So at `1080i5000` a producer is sampled and an AMCP
 * transform lands **once per 40 ms**, while at `1080p5000` it is once per 20 ms. The two
 * modes are NOT the same measurement wearing different packaging, and a `k` taken at
 * `1080p5000` cannot be quoted for a plant running `1080i5000`.
 */
export function framePeriodMs(format: string): number {
  const match = /^\d+([ip])(\d{4})$/.exec(format.trim().toLowerCase());
  if (match === null) return Number.NaN;
  const interlaced = match[1] === 'i';
  const rate = Number(match[2]) / 100;
  if (!Number.isFinite(rate) || rate <= 0) return Number.NaN;
  // The mode name always carries the FIELD rate; an interlaced channel ticks at half of it.
  return interlaced ? 2000 / rate : 1000 / rate;
}
