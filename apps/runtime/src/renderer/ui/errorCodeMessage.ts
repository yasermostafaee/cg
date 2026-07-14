/**
 * B-070 — turn a bridge `errorCode` into something an operator can act on.
 *
 * The playout channels answer `{ accepted, errorCode? }`, but the UI used to
 * throw the code away and render a bare "Not accepted." — which told the
 * operator nothing about WHY (a producerless layer? a dead link? an
 * unregistered template?). `stack.update` did not even carry a code until
 * B-070; now every refusal can explain itself.
 *
 * Unknown codes are surfaced verbatim rather than swallowed: an unrecognised
 * reason the operator can quote to an engineer beats a generic dead end.
 */
const MESSAGES: Readonly<Record<string, string>> = {
  'unknown-item': 'That item is no longer on the stack.',
  'unknown-template': 'That template is not registered with the bridge — re-import it.',
  'amcp-send-failed': 'The command never reached CasparCG — check the server link.',
  // R-006 — refused BEFORE the send, because the server is not connected. Say plainly that
  // nothing was queued: the operator must reissue it, or they will believe it is pending.
  disconnected:
    'Not connected to CasparCG — the command was refused, not queued. Reissue it once the server is back.',
};

/** A human message for a refusal, or `null` when there is no code to explain. */
export function errorCodeMessage(errorCode: string | undefined): string | null {
  if (errorCode === undefined || errorCode === '') return null;
  const known = MESSAGES[errorCode];
  if (known !== undefined) return known;
  // `amcp-403` et al — CasparCG refused the command outright.
  const amcp = /^amcp-(\d+)$/.exec(errorCode);
  if (amcp !== null) return `CasparCG refused the command (AMCP ${String(amcp[1])}).`;
  return `Not accepted (${errorCode}).`;
}
