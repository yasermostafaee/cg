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
  // C-014 — the two ways a load can run out of layers, told apart because the
  // remedies differ: a genuinely full range frees up by removing an item; a
  // foreign-occupied range cannot be freed from this console at all (R-015).
  'no-layer': 'No free layer left in this template’s range — Remove an item to free one.',
  'no-layer-foreign-occupied':
    'No free layer — the range is occupied by another system’s output (video), which cannot be cleared from here.',
  // R-021 stage 3 — the exact-slot load's own refusals (FIXED_LAYERS_LOAD_REASONS).
  // Both are structural, so both name the remedy rather than the rule.
  'not-fixed':
    'That layer is not part of the fixed bank — only bank layers can be loaded this way.',
  'slot-bound':
    'That fixed layer already holds an item — Remove it first, then load. (Never one compound step.)',
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
