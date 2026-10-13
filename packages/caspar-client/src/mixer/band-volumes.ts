import * as net from 'node:net';

/**
 * 🔴 `BRIDGE-TRUTH-01` §3 — **READ A BAND'S LAYER VOLUMES: ONE WRITE BURST, ONE READ.**
 *
 * There is no bulk read of mixer state. `get_current_transform(index)` is the only read-out
 * and it is per layer, reached by `MIXER <ch>-<layer> VOLUME` with no value. But AMCP pipelines:
 * the Playout team wrote fifty such lines back to back, flushed once, and read fifty replies in
 * 182 ms on loopback. So a band reading is one write and one read, never N round trips.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * 🔴 NOT `INFO`. `INFO`'s `<volume>` nodes are the OUTPUT BUS's meters, one per audio channel
 * of the channel format — not per-layer transform volumes; a layer set to `0.25` does not
 * appear in `INFO` at all. And `INFO <ch>-<layer>` answers for the whole CHANNEL: the layer
 * argument is accepted and ignored. A reader that wanted one layer's volume from `INFO` would
 * get a plausible, wrong answer either way.
 *
 * ⚠ **A READ IS NOT SIDE-EFFECT FREE.** `tweens_[index]` is `std::map::operator[]`, so reading
 * a layer with no transform entry inserts one at identity (volume `1`). Benign — it is what the
 * layer would read as anyway — but no caller may treat this as a pure observation.
 *
 * ⚠ It opens its OWN connection, so it never interleaves with a session's queue: the replies are
 * matched to the queries by ORDER, which only holds on a socket nothing else writes to.
 */

/** The burst: one `MIXER <ch>-<layer> VOLUME` query per layer, in order. */
export function bandVolumeQuery(channel: number, layers: readonly number[]): string {
  return layers.map((layer) => `MIXER ${String(channel)}-${String(layer)} VOLUME\r\n`).join('');
}

/** One layer's reading: its volume, or the reply that stood in for one. */
export type BandVolume =
  | { readonly layer: number; readonly volume: number }
  | { readonly layer: number; readonly error: string };

/**
 * Match the replies to the queries by order, or `null` while the text is still incomplete.
 *
 * A query is answered `201 MIXER OK` then the value on its own line; anything else is one line
 * and is reported as that layer's error rather than skipped, so a refusal can never shift every
 * later reading onto the wrong layer. The value is parsed as a NUMBER — the server's spelling of
 * it (`1` or `1.000000`) is not relied on.
 */
export function parseBandVolumeReplies(
  text: string,
  layers: readonly number[],
): BandVolume[] | null {
  const lines = text.split('\r\n');
  // The last element follows the final CRLF: it is either '' or a line still arriving.
  const complete = (index: number): boolean => index < lines.length - 1;
  const out: BandVolume[] = [];
  let i = 0;
  for (const layer of layers) {
    if (!complete(i)) return null;
    const head = lines[i] as string;
    if (head.startsWith('201 ')) {
      if (!complete(i + 1)) return null;
      const raw = (lines[i + 1] as string).trim();
      const volume = Number(raw);
      out.push(
        raw !== '' && Number.isFinite(volume)
          ? { layer, volume }
          : { layer, error: `unreadable value: ${raw}` },
      );
      i += 2;
    } else {
      out.push({ layer, error: head });
      i += 1;
    }
  }
  return out;
}

/**
 * Read `layers`' volumes on `channel` from the server at `host:port`: connect, write the whole
 * burst once, read until every query is answered. `elapsedMs` runs from the write to the last
 * reply, which is the cost worth reporting.
 */
export function readBandVolumes(options: {
  readonly host: string;
  readonly port: number;
  readonly channel: number;
  readonly layers: readonly number[];
  readonly timeoutMs?: number;
}): Promise<{ volumes: BandVolume[]; elapsedMs: number }> {
  const { host, port, channel, layers } = options;
  const timeoutMs = options.timeoutMs ?? 5000;
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let text = '';
    let started = 0;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(
        new Error(
          `band read timed out after ${String(timeoutMs)} ms — ${String(text.split('\r\n').length - 1)} reply lines received`,
        ),
      );
    }, timeoutMs);
    socket.setEncoding('utf8');
    socket.once('connect', () => {
      started = performance.now();
      socket.write(bandVolumeQuery(channel, layers));
    });
    socket.on('data', (chunk: string) => {
      text += chunk;
      const volumes = parseBandVolumeReplies(text, layers);
      if (volumes === null) return;
      const elapsedMs = performance.now() - started;
      clearTimeout(timer);
      socket.end();
      resolve({ volumes, elapsedMs });
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
