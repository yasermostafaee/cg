/**
 * Streaming AMCP response parser.
 *
 * AMCP responses come in three shapes per Phase 5 §3.1:
 *   - `<code> <command>\r\n`                      (202)
 *   - `<code> <command> OK\r\n<data>\r\n`         (201)
 *   - `<code> <command> OK\r\n<line>\r\n…\r\n\r\n` (200, multi-line)
 *
 * Plus the error variants (`<code> ERROR\r\n[detail\r\n]`).
 *
 * The parser is fed byte chunks via `feed()` and emits complete responses
 * via the `onResponse` callback. Partial bytes are kept in an internal
 * buffer until the next chunk arrives — there is no maximum buffer size
 * here (the line lengths CasparCG emits are small; the layer above can
 * impose a limit if it cares).
 *
 * State machine:
 *
 *   IDLE
 *     - receives a header line → parse code:
 *         code in {200}                   → MULTI_LINE   (collect until blank line)
 *         code in {201}                   → ONE_LINE     (collect one data line)
 *         code in {202}                   → emit, IDLE
 *         4xx/5xx, "ERROR" verb           → maybe ONE_LINE_OPTIONAL (detail line if next non-empty)
 *
 *   ONE_LINE
 *     - receives a single line            → emit, IDLE
 *
 *   MULTI_LINE
 *     - receives a non-empty line         → append, MULTI_LINE
 *     - receives a blank line             → emit, IDLE
 *
 *   Errors are emitted immediately on the header line. CasparCG 2.3.x
 *   does not emit detail lines after a 4xx/5xx; any orphaned text that
 *   follows is dropped as garbage on the next IDLE pass.
 */

export interface AmcpHeader {
  code: number;
  /** Verb (or `'ERROR'` for 4xx/5xx). */
  verb: string;
  /** True when the header carried the `OK` token (= data follows). */
  hasData: boolean;
}

export type ParsedAmcpResponse =
  | { kind: 'ok'; code: 202; verb: string; header: string }
  | { kind: 'ok-line'; code: 201; verb: string; header: string; data: string }
  | { kind: 'ok-multi'; code: 200; verb: string; header: string; lines: readonly string[] }
  | { kind: 'err'; code: number; verb: string; header: string; detail?: string };

type State =
  | { kind: 'idle' }
  | { kind: 'one-line'; header: AmcpHeader; rawHeader: string }
  | { kind: 'multi-line'; header: AmcpHeader; rawHeader: string; lines: string[] };

export class AmcpResponseParser {
  private state: State = { kind: 'idle' };
  private buffer = '';

  constructor(private readonly onResponse: (resp: ParsedAmcpResponse) => void) {}

  /** Push raw bytes (or a string, if already decoded). The parser holds onto partials. */
  feed(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const lineEnd = this.buffer.indexOf('\r\n');
      if (lineEnd === -1) return;
      const line = this.buffer.slice(0, lineEnd);
      this.buffer = this.buffer.slice(lineEnd + 2);
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    const state = this.state;
    switch (state.kind) {
      case 'idle':
        this.handleIdleLine(line);
        return;
      case 'one-line':
        this.emit({
          kind: 'ok-line',
          code: 201,
          verb: state.header.verb,
          header: state.rawHeader,
          data: line,
        });
        this.state = { kind: 'idle' };
        return;
      case 'multi-line':
        if (line.length === 0) {
          this.emit({
            kind: 'ok-multi',
            code: 200,
            verb: state.header.verb,
            header: state.rawHeader,
            lines: state.lines,
          });
          this.state = { kind: 'idle' };
        } else {
          state.lines.push(line);
        }
        return;
    }
  }

  private handleIdleLine(line: string): void {
    if (line.length === 0) return;
    const header = parseHeader(line);
    if (header === null) {
      // Garbage outside of a response — drop it. AMCP doesn't emit unsolicited
      // chatter, but if it ever does we don't want to derail the stream.
      return;
    }
    if (header.code >= 400) {
      this.emit({
        kind: 'err',
        code: header.code,
        verb: header.verb,
        header: line,
      });
      return;
    }
    if (header.code === 202) {
      this.emit({ kind: 'ok', code: 202, verb: header.verb, header: line });
      return;
    }
    if (header.code === 201) {
      this.state = { kind: 'one-line', header, rawHeader: line };
      return;
    }
    if (header.code === 200) {
      this.state = { kind: 'multi-line', header, rawHeader: line, lines: [] };
      return;
    }
    // 1xx informational, 3xx — neither documented for AMCP. Treat as
    // best-effort acks: emit as a synthetic ok-no-data so the layer above
    // can decide whether that's a problem.
    this.emit({ kind: 'ok', code: 202, verb: header.verb, header: line });
  }

  private emit(resp: ParsedAmcpResponse): void {
    this.onResponse(resp);
  }

  /** Number of bytes currently buffered (awaiting CRLF). For diagnostics. */
  get pendingBytes(): number {
    return this.buffer.length;
  }
}

/**
 * Parse the first line of a response — either `<code> <verb>` or
 * `<code> <verb> OK`. Returns null if the line doesn't look like a header.
 */
function parseHeader(line: string): AmcpHeader | null {
  const firstSpace = line.indexOf(' ');
  if (firstSpace === -1) return null;
  const codeStr = line.slice(0, firstSpace);
  const code = Number(codeStr);
  if (!Number.isInteger(code) || code < 100 || code > 999) return null;

  const rest = line.slice(firstSpace + 1);
  if (rest.length === 0) return null;

  const secondSpace = rest.indexOf(' ');
  if (secondSpace === -1) {
    return { code, verb: rest, hasData: false };
  }
  const verb = rest.slice(0, secondSpace);
  const tail = rest.slice(secondSpace + 1);
  return { code, verb, hasData: tail === 'OK' };
}
