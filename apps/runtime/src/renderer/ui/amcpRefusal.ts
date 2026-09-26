/**
 * 🔴 `FIELD-FIXES-01` A — **THE ONE PLACE AN AMCP FAILURE BECOMES THE OPERATOR'S WORDS.** Every
 * surface that has to say why CasparCG refused something asks here: `errorCodeMessage` (the
 * banner and every verb's refusal), and the row's and the Inspector's take-refusal line.
 *
 * The owner met "CasparCG refused the command (AMCP 403)." on 2026-09-26: true, and of no use to
 * anyone who is not reading the source. The code, the command and the reply line go to the log
 * (the bridge's `logs/amcp.log`, and the audit record's `command`); the operator reads what the
 * refusal means for THIS command. "AMCP" and the number never reach an operator surface.
 *
 * ── WHAT EACH CODE MEANS — CasparCG 2.5.0-stable's source, not memory ──────────────
 *
 * Execution (`AMCPCommandQueue.cpp`): the command was understood, and running it threw.
 *   404 `<CMD> FAILED`  `file_not_found`
 *   403 `<CMD> FAILED`  a user error, or a parameter that would not convert
 *   402 `<CMD> FAILED`  a missing parameter
 *   501 `<CMD> FAILED`  anything else
 * Parse (`AMCPProtocolStrategy.cpp`): the command was not run.
 *   400 `ERROR` + the line echoed  not understood — AND a channel that does not exist, because
 *                                  `create_channel_command` answers null for it
 *   401 `<CMD> ERROR`              a channel that could not be parsed (an `out_of_range` thrown
 *                                  while parsing); the documented "invalid/missing channel"
 *   402 `<CMD> ERROR`              a parameter missing
 *   503 `<CMD> FAILED`             access denied: another client holds the channel's lock
 *   500 `FAILED`                   anything else
 * The reply carries no reason in any of them; CasparCG writes one only to its own log.
 *
 * DeckLink (`decklink_producer.cpp`): a device index the machine does not have throws a user
 * error → 403; a device another producer holds is swallowed and the registry answers → 404
 * (`B-177`). So a refused `DECKLINK` play is 403 OR 404, and to the operator both mean the same.
 * The file line is for a media or a stream play only (`FIELD-FIXES-01-A`).
 */

/** What one refusal means, in the two shapes a surface needs. */
export interface AmcpRefusalWords {
  /** A whole sentence, for a surface that names nothing else. */
  readonly sentence: string;
  /**
   * The same fact as a clause that follows a row's and a source's names:
   * `Bed 59 · studio1 (DeckLink 1): the server has no such input, or it is in use.`
   */
  readonly clause: string;
}

/** The AMCP reply code an `amcp-NNN` refusal carries, or null for any other code. */
export function amcpReplyCode(errorCode: string | undefined): number | null {
  const m = /^amcp-(\d{3})$/.exec(errorCode ?? '');
  return m === null ? null : Number(m[1]);
}

/** What the refused command was for, read off its line. */
export interface AmcpCommandFacts {
  /** The channel it addressed (`PLAY 2-60 …` → 2), when it addressed one. */
  readonly channel: number | null;
  /** The DeckLink device a `DECKLINK` play named (`DECKLINK DEVICE 1` → 1). */
  readonly decklink: number | null;
  /** The clip or URL a media or stream play named. */
  readonly file: string | null;
  /** A `CG … ADD`: the graphic's own page. */
  readonly cgAdd: boolean;
}

const NONE: AmcpCommandFacts = { channel: null, decklink: null, file: null, cgAdd: false };

/**
 * Read what the refused command was for. Pure and total: a line it cannot read answers
 * {@link NONE}, and the words fall back to the code's generic line.
 */
export function amcpCommandFacts(command: string | undefined): AmcpCommandFacts {
  if (command === undefined || command.trim() === '') return NONE;
  const tokens = command.trim().split(/\s+/);
  const verb = (tokens[0] ?? '').toUpperCase();
  const target = /^(\d+)(?:-\d+)?$/.exec(tokens[1] ?? '');
  const channel = target === null ? null : Number(target[1]);
  const cgAdd = verb === 'CG' && (tokens[2] ?? '').toUpperCase() === 'ADD';
  if (verb !== 'PLAY' && verb !== 'LOAD' && verb !== 'LOADBG') {
    return { ...NONE, channel, cgAdd };
  }
  const rest = tokens.slice(2);
  if ((rest[0] ?? '').toUpperCase() === 'DECKLINK') {
    // `DECKLINK DEVICE 1`, and the older bare `DECKLINK 1`.
    const index = (rest[1] ?? '').toUpperCase() === 'DEVICE' ? rest[2] : rest[1];
    const device = /^\d+$/.test(index ?? '') ? Number(index) : null;
    return { ...NONE, channel, decklink: device };
  }
  // A media or stream play names its clip or URL as the first argument, quoted by the builder.
  const quoted = /^\S+\s+\S+\s+"((?:[^"\\]|\\.)*)"/.exec(command.trim());
  const first = quoted?.[1] ?? rest[0];
  if (first === undefined || first === '' || /^route:\/\//i.test(first)) {
    return { ...NONE, channel };
  }
  if (/^(NDI|COLOR|COLOUR|EMPTY)$/i.test(first)) return { ...NONE, channel };
  return { ...NONE, channel, file: first };
}

/**
 * 🔴 **THE MAPPING.** The words for an `amcp-NNN` refusal of `command`, or null when the code is
 * not a server reply (`amcp-timeout`, `amcp-send-failed` and the bridge's own codes have their
 * own sentences in `errorCodeMessage`).
 */
export function amcpRefusalWords(
  errorCode: string | undefined,
  command?: string,
): AmcpRefusalWords | null {
  const code = amcpReplyCode(errorCode);
  if (code === null) return null;
  const facts = amcpCommandFacts(command);

  if (facts.decklink !== null && (code === 403 || code === 404)) {
    return words(
      `The server has no DeckLink input ${String(facts.decklink)}, or it is in use.`,
      'the server has no such input, or it is in use.',
    );
  }
  if (code === 404 && facts.file !== null) {
    return same(`the server cannot find the file ${facts.file}.`);
  }
  if (code === 404 && facts.cgAdd) return same('the server could not load the graphic.');
  if (code === 400) {
    return facts.channel === null
      ? same('the server did not understand this command.')
      : same(
          `the server has no channel ${String(facts.channel)}, or did not understand this command.`,
        );
  }
  if (code === 401) {
    return facts.channel === null
      ? same('the server has no such channel.')
      : same(`the server has no channel ${String(facts.channel)}.`);
  }
  if (code === 402 || code === 403) return same('the server refused a setting in this command.');
  if (code === 404) return same('the server cannot find what this command names.');
  if (code === 503)
    return same('the server refused this command: another client holds the channel.');
  if (code >= 500) return same('the server failed while running this command.');
  return same('the server refused this command.');
}

function words(sentence: string, clause: string): AmcpRefusalWords {
  return { sentence, clause };
}

/** One fact, as a clause and as the sentence that opens with it. */
function same(clause: string): AmcpRefusalWords {
  return { sentence: clause.charAt(0).toUpperCase() + clause.slice(1), clause };
}
