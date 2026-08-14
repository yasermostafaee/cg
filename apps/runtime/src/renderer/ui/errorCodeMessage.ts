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
  /*
    §8 — THE ONE CODE THAT MUST SAY "UNKNOWN", AND MUST BE SEEN RARELY.

    `amcp-error` is the bridge's fallback when a send failed with no code to
    quote. It had no sentence at all, so it rendered as "Not accepted
    (amcp-error)." — which reads as a diagnosis (AMCP, therefore CasparCG,
    therefore go to the playout machine) while being the absence of one.

    Naming the wrong mechanism is worse than naming none, because a wrong name
    gets acted on. So this says plainly that the cause is not known, and points at
    the two places it could be. The bridge now threads the REAL code wherever it
    has one (`amcp-404`, `amcp-send-failed`, `template-serve-down`), so this
    should be genuinely rare — if an operator sees it often, that is the bug.
  */
  'amcp-error':
    'The command failed and the reason was not reported — it is not known whether CasparCG refused it or it never arrived. Check the layer on the output before assuming either.',
  // fix-setconfig-serve-restart — the bridge's OWN template HTTP server is down,
  // so the page could not be handed to CasparCG. Named separately because the
  // remedy is on THIS machine: it used to surface as `amcp-error` and sent the
  // operator to the playout box for a fault that was never there.
  'template-serve-down':
    'The bridge could not serve the template to CasparCG — its template server is down. This is the bridge machine, not the playout server; restart the bridge.',
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
    'That layer already has a graphic on it — CLEAR it first to put the same template back, or REMOVE the row to bind a different one. (Never one compound step.)',
  // R-022 — the LOAD interlock. Names the way out, because there always is one:
  // rehearse no longer needs the layer, so taking the row off PVW costs nothing.
  'mute-failed':
    'CasparCG refused to mute the layer, so PVW was not started. PVW is only claimed once the graphic genuinely cannot reach air.',
  rehearsing:
    'That row is on PVW. Take it off PVW first — loading would put an unmuted graphic on the layer.',
  // The BANK-SCOPED clear's two structural refusals. Both are guard verdicts rather
  // than transient failures, so neither suggests retrying: the answer will not change
  // until the CONFIG does.
  'not-in-bank':
    'That layer is not part of the declared operator bank — this clear is scoped to the bank and can address nothing else.',
  reserved:
    'That layer is inside the reserved playout range — the company’s playout system owns it, and it can never be cleared from this console.',
  /*
    C-015 phase 6 — THE FOUR WAYS A LIVE PLATE REFUSES A TAKE.

    These are FALLBACKS. The bridge sends its own sentence with each of them
    (`StackTakeChannel.message`), which names the plate, the source and the
    numbers that disagree — and `asyncResultMessage` prefers that. What is here
    is what an operator sees if the message is ever absent, so each still has to
    name the remedy rather than restate the rule.

    Four codes rather than one, because the four remedies are in four different
    places: assign a source, correct a format, declare a band, free a layer.
  */
  'live-source-unassigned':
    'This template has a live plate with no source assigned, so it would go to air empty. Assign it in CG Control → Sources, then take again.',
  'live-source-aspect-mismatch':
    'A live plate is designed for a different picture shape than the source assigned to it — cropping it would cut part of the picture the author never saw. Re-assign the plate, or correct the source’s format.',
  'live-source-no-layer-range':
    'No Live Source layer band is declared on this installation, so there is nowhere to put the live picture. Declare the band in CG Control’s source settings.',
  'live-source-no-layer':
    'The Live Source layer band has no room left for this template’s plates. Clear a graphic that is holding live layers, or widen the band in CG Control’s source settings.',
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
