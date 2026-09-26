import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import type { AmcpExchange } from '@cg/caspar-client';

/**
 * 🔴 `FIELD-FIXES-01-A` — **THE AMCP LOG: every command the bridge sends CasparCG, its reply line,
 * and its time**, in the station's logs folder, size-capped and rotating.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────────
 *
 * On 2026-09-26 a take of Bed 59 was refused `amcp-403` and nothing on the owner's machine could
 * say which command was refused, or what the server answered: the audit keeps the code, and the
 * bridge printed no exchange. `FIELD-FIXES-01` §0 had to REPLAY the take on the mock to recover
 * the wire. Neither the installed app nor the dev station had ever written one — the only AMCP
 * trace in the tree was the MOCK's own, which the tests switch on. So the log is written HERE, by
 * the bridge, for every launcher: the path comes from `--state-home` (`bin/caspar-bridge.mjs`),
 * which the installed app's sidecar and the dev station both already pass.
 *
 * ── WHAT A LINE SAYS ─────────────────────────────────────────────────────────────
 *
 *     2026-09-26T09:40:00.296Z A 192.168.21.111:5250 4ms >> PLAY 2-60 DECKLINK DEVICE 1 << 403 PLAY FAILED
 *
 * The reply is the HEADER line exactly as CasparCG sent it; an INFO reply's XML body is not
 * copied. A command no reply settled says why (`<< no reply: timeout`); a reply that came after
 * its timeout is written again as `(late)`.
 *
 * ⚠ **NO TOKEN IS EVER WRITTEN.** The one token an AMCP line carries is the take token in a
 * `CG ADD`/`CG UPDATE` payload (`__cg.take`, the page's completion key); it is redacted. The
 * Playout's sign-in token never travels over AMCP at all.
 *
 * ⚠ **FAIL-OPEN.** A log that cannot be written is said once on stderr and switched off; playout
 * never waits on it and never fails because of it.
 */

export interface AmcpLogEntry extends AmcpExchange {
  /** The declared server the command went to (`A`, `B`). */
  readonly server: string;
  /** That server's AMCP address as configured (`192.168.21.111:5250`). */
  readonly host: string;
  /** When it settled (epoch ms). */
  readonly at: number;
}

/** The longest command a line carries — a Persian ticker's payload is not the log's business. */
export const AMCP_LOG_LINE_MAX = 2000;
/** The active file's cap; one previous file is kept beside it (`amcp.previous.log`). */
export const AMCP_LOG_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The take token, in either spelling a line can carry it: escaped inside an AMCP-quoted payload
 * (`\"take\":\"…\"`) or bare (`"take":"…"`).
 */
const TAKE_TOKEN = /(\\?"take\\?"\s*:\s*\\?")[^"\\]+/g;

/** Redact every token an AMCP line can carry. Pure and total. */
export function redactAmcpLine(line: string): string {
  return line.replace(TAKE_TOKEN, '$1<redacted>');
}

/** One log line for one exchange (no trailing newline). */
export function formatAmcpLogLine(entry: AmcpLogEntry): string {
  const command = redactAmcpLine(entry.line);
  const capped =
    command.length > AMCP_LOG_LINE_MAX
      ? `${command.slice(0, AMCP_LOG_LINE_MAX)}… (${String(command.length)} chars)`
      : command;
  const reply =
    entry.reply !== undefined
      ? `${entry.reply}${entry.late === true ? ' (late — after its timeout)' : ''}`
      : `no reply: ${entry.error ?? 'unknown'}`;
  const where = entry.host === '' ? entry.server : `${entry.server} ${entry.host}`;
  return `${new Date(entry.at).toISOString()} ${where} ${String(entry.ms)}ms >> ${capped} << ${reply}`;
}

/** The previous file beside `amcp.log`: `amcp.previous.log`. */
export function previousLogPath(file: string): string {
  const ext = path.extname(file);
  return `${file.slice(0, file.length - ext.length)}.previous${ext}`;
}

export class AmcpLog {
  readonly #file: string;
  readonly #previous: string;
  readonly #maxBytes: number;
  /** Bytes in the active file; unknown (-1) until the first write reads it. */
  #size = -1;
  #chain: Promise<void> = Promise.resolve();
  #off = false;

  constructor(file: string, options: { maxBytes?: number } = {}) {
    this.#file = file;
    this.#previous = previousLogPath(file);
    this.#maxBytes = options.maxBytes ?? AMCP_LOG_MAX_BYTES;
  }

  get file(): string {
    return this.#file;
  }

  /** Queue one exchange. Never throws, never blocks the caller. */
  write(entry: AmcpLogEntry): void {
    const text = `${formatAmcpLogLine(entry)}\n`;
    this.#chain = this.#chain.then(() => this.#append(text));
  }

  /** Resolves once every exchange queued so far has been written (or dropped). */
  flush(): Promise<void> {
    return this.#chain;
  }

  async #append(text: string): Promise<void> {
    if (this.#off) return;
    try {
      if (this.#size < 0) {
        await mkdir(path.dirname(this.#file), { recursive: true });
        this.#size = await stat(this.#file).then(
          (s) => s.size,
          () => 0,
        );
      }
      const bytes = Buffer.byteLength(text);
      if (this.#size > 0 && this.#size + bytes > this.#maxBytes) {
        // One previous file, replaced — the same shape `bridge.log` has.
        await rename(this.#file, this.#previous);
        this.#size = 0;
      }
      await appendFile(this.#file, text, 'utf8');
      this.#size += bytes;
    } catch (err) {
      this.#off = true;
      process.stderr.write(
        `[caspar-bridge] ⚠ AMCP log switched off: cannot write ${this.#file} ` +
          `(${err instanceof Error ? err.message : String(err)}). Playout is unaffected.\n`,
      );
    }
  }
}
