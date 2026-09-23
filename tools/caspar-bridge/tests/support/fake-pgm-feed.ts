import net from 'node:net';

/**
 * 🔴 `C-016` — **A FAKE PLAYOUT `pgm` FEED, byte for byte as the Playout team specified it**
 * (`docs/integration/playout/PLAYOUT-CG-RESPONSE-PGM-FEED-v1.md` §1). Nothing in the suite
 * connects to a real Playout; this is what every test reads instead.
 *
 * What it reproduces, because each is a property the client depends on:
 *   - it sends NOTHING until it has read `\r\n\r\n` (a silent client gets zero bytes);
 *   - the head is the measured one, HTTP/1.0 with `boundary=apasaipgm`;
 *   - each part is `--apasaipgm\r\nContent-Type: image/jpeg\r\nContent-Length: N\r\n\r\n`,
 *     N bytes, `\r\n` — no CRLF before the first boundary, no closing boundary;
 *   - the stream ends only when the connection closes.
 *
 * And what it RECORDS, because the tests are about the client's behaviour: every byte each
 * connection sent, when it opened, when its request completed and when it closed.
 */

/** The response head, exactly as measured on the Playout's loopback (their §1). */
export const PGM_FEED_HEAD =
  'HTTP/1.0 200 OK\r\n' +
  'Connection: close\r\n' +
  'Cache-Control: no-cache, no-store, must-revalidate, private\r\n' +
  'Pragma: no-cache\r\n' +
  'Expires: 0\r\n' +
  'Access-Control-Allow-Origin: *\r\n' +
  'Content-Type: multipart/x-mixed-replace; boundary=apasaipgm\r\n' +
  '\r\n';

/** One part, exactly as their §1 frames it. */
export function pgmFeedPart(jpeg: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--apasaipgm\r\nContent-Type: image/jpeg\r\nContent-Length: ${String(jpeg.length)}\r\n\r\n`,
      'latin1',
    ),
    jpeg,
    Buffer.from('\r\n', 'latin1'),
  ]);
}

/** A real 64×36 baseline JPEG (a teal ground, a white square) — decodable by a browser. */
export const FRAME_A = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAUEBAQEAwUEBAQGBQUGCA0ICAcHCBALDAkNExAUExIQEhIUFx0ZFBYcFhISGiMaHB4fISEhFBkkJyQgJh0gISD/2wBDAQUGBggHCA8ICA8gFRIVICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICD/wAARCAAkAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDxyiiv0urNK58vhcL9Yvrax+aNFfpdXzR+1X/zJ/8A2+f+0KbVjevgPZU3Pmvby/4J80UUUVJ5YUUUUAFfpdX5o19L/wDDVf8A1If/AJVP/tNUnY9TAV6dLm53a9v1Ppevmj9qv/mT/wDt8/8AaFH/AA1X/wBSH/5VP/tNeZ/Fb4rf8LO/sf8A4kP9k/2b53/L15/meZs/2FxjZ75z7U21Y6sXi6NSi4xevz7nmlFFFQeCFFFFABRRRQAUUUUAFFFFABRRRQB//9k=',
  'base64',
);

/** A second real 64×36 JPEG (a violet ground), so a test can tell two frames apart. */
export const FRAME_B = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAUEBAQEAwUEBAQGBQUGCA0ICAcHCBALDAkNExAUExIQEhIUFx0ZFBYcFhISGiMaHB4fISEhFBkkJyQgJh0gISD/2wBDAQUGBggHCA8ICA8gFRIVICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICD/wAARCAAkAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDwWiiv1FrsnPlPoMRiPY20vc/Lqiv1Fr5d/a4/5kv/ALff/aFTGrzO1jKjjPaTUOW1/M+XKKKK2PQCiiigAr9Ra/LqvqP/AIa4/wCqff8AlW/+01jVi5WsefjKM6nLyK9rn1FXy7+1x/zJf/b7/wC0KP8Ahrj/AKp9/wCVb/7TXl3xc+Ln/C0/7F/4p/8Asj+y/P8A+Xvz/N8zy/8AYXGPL9859qiEJKV2c+Gw1WFVSktDy2iiiuk9gKKKKACiiigAooooAKKKKACiiigD/9k=',
  'base64',
);

/**
 * A still-valid JPEG with a comment (`COM`, `FF FE`) segment inserted after SOI. Used two ways:
 * to plant the boundary text INSIDE a frame's data (the framing test), and to pad a frame to a
 * realistic size (~13 KB, the cost measurement) — a decoder skips the comment.
 */
export function jpegWithComment(jpeg: Buffer, comment: Buffer): Buffer {
  const segments: Buffer[] = [jpeg.subarray(0, 2)];
  for (let at = 0; at < comment.length; at += 65_533) {
    const data = comment.subarray(at, at + 65_533);
    const head = Buffer.alloc(4);
    head.writeUInt16BE(0xfffe, 0);
    head.writeUInt16BE(data.length + 2, 2);
    segments.push(head, data);
  }
  segments.push(jpeg.subarray(2));
  return Buffer.concat(segments);
}

/** `jpeg` padded with a comment of pseudo-random bytes to exactly `total` bytes. */
export function padJpeg(jpeg: Buffer, total: number): Buffer {
  const need = Math.max(0, total - jpeg.length - 4);
  const filler = Buffer.alloc(need);
  for (let i = 0; i < need; i++) filler[i] = (i * 131 + 7) & 0xff;
  return jpegWithComment(jpeg, filler);
}

export interface FakeFeedConnection {
  readonly openedAt: number;
  /** Every byte this connection sent the feed. */
  received: Buffer;
  /** When `\r\n\r\n` arrived (the request completed), or `null`. */
  requestAt: number | null;
  closedAt: number | null;
}

export interface FakePgmFeed {
  readonly port: number;
  readonly connections: readonly FakeFeedConnection[];
  openCount(): number;
  /** Stop sending frames on every connection, and keep every connection open (a stall). */
  pause(): void;
  resume(): void;
  /** The frames to cycle through from now on. */
  setFrames(frames: readonly Buffer[]): void;
  /** Close every connection now (a core restart). */
  closeAll(): void;
  /** From now on, close each connection the moment it is accepted. */
  closeOnAccept(on: boolean): void;
  stop(): Promise<void>;
}

export interface FakePgmFeedOptions {
  /** `0` = ephemeral. A real rule port (`pgmPort(n)`) when a test proves the rule end to end. */
  readonly port?: number;
  readonly host?: string;
  readonly fps?: number;
  readonly frames?: readonly Buffer[];
}

export async function startFakePgmFeed(options: FakePgmFeedOptions = {}): Promise<FakePgmFeed> {
  const connections: FakeFeedConnection[] = [];
  const sockets = new Set<net.Socket>();
  let frames: readonly Buffer[] = options.frames ?? [FRAME_A, FRAME_B];
  let paused = false;
  let closeOnAccept = false;
  const interval = Math.round(1000 / (options.fps ?? 25));

  const server = net.createServer((socket) => {
    if (closeOnAccept) {
      connections.push({
        openedAt: Date.now(),
        received: Buffer.alloc(0),
        requestAt: null,
        closedAt: Date.now(),
      });
      socket.destroy();
      return;
    }
    sockets.add(socket);
    const record: FakeFeedConnection = {
      openedAt: Date.now(),
      received: Buffer.alloc(0),
      requestAt: null,
      closedAt: null,
    };
    connections.push(record);
    let timer: NodeJS.Timeout | null = null;
    let next = 0;
    socket.on('data', (chunk: Buffer) => {
      record.received = Buffer.concat([record.received, chunk]);
      if (record.requestAt !== null || !record.received.includes('\r\n\r\n')) return;
      record.requestAt = Date.now();
      socket.write(PGM_FEED_HEAD);
      timer = setInterval(() => {
        if (paused || socket.destroyed || frames.length === 0) return;
        const frame = frames[next % frames.length] as Buffer;
        next++;
        socket.write(pgmFeedPart(frame));
      }, interval);
    });
    socket.on('error', () => undefined);
    socket.on('close', () => {
      if (timer !== null) clearInterval(timer);
      record.closedAt = Date.now();
      sockets.delete(socket);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;

  return {
    port,
    connections,
    openCount: () => sockets.size,
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    setFrames: (next) => {
      frames = next;
    },
    closeAll: () => {
      for (const socket of sockets) socket.destroy();
    },
    closeOnAccept: (on) => {
      closeOnAccept = on;
    },
    stop: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
