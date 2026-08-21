import type { SOURCES_SET_ASSIGNMENTS_REASONS, SOURCES_SET_CONFIG_REASONS } from '@cg/shared-ipc';
import { BRIDGE_SKEW_MESSAGE, isBridgeSkewMessage } from '../../shared/bridgeSkew.js';

/**
 * D-137 / C-015 — operator wording for a refused `sources.*` call, keyed off the
 * wire contract's OWN reason unions so a new validator code cannot ship without
 * a sentence here (the records below fail typecheck if a member is missing).
 *
 * The `fixedLayersReasonMessage` shape exactly, and beside it deliberately: each
 * channel family keeps its own vocabulary, and folding them together blurs which
 * codes belong to which contract.
 *
 * These sentences carry the RULE; the bridge's `message` carries the SPECIFICS
 * (which name collided, which two ranges overlap) — the surface shows both.
 *
 * ── 🔴 AND THE TRANSPORT HALF, WHICH IS WHERE THE WIRE LEAKED ───────────────
 *
 * A refusal the operator actually met read `invalid request for
 * sources.set-config`. That string is the BRIDGE's frame validator
 * (`bridge.ts` — `invalid request for ${frame.channel}`), it names an IPC
 * channel, and there is nothing an operator can do with it.
 *
 * It is not a typo, it is a STATE: the browser is talking to a bridge PROCESS
 * whose build predates the current shape of this channel, so the payload is
 * legal here and rejected there. `unknown channel` was already translated —
 * that is the case where the bridge has never heard of the feature — and this is
 * its sibling: the bridge knows the channel and disagrees about its shape. Both
 * mean the same thing to the operator and both now say it.
 */
type SourcesSetConfigReason = (typeof SOURCES_SET_CONFIG_REASONS)[number];
type SourcesSetAssignmentsReason = (typeof SOURCES_SET_ASSIGNMENTS_REASONS)[number];

const CONFIG_MESSAGES = {
  'duplicate-id':
    'Two sources have the same internal id — reload this page; if it persists, the bridge’s source file has been hand-edited.',
  'duplicate-name':
    'Another source already has that name. The name is what you pick from when binding a plate, so two the same would leave you choosing blind.',
  'overlaps-fixed-bank':
    'The live source layer band would overlap the operator’s candidate layers — the two must stay disjoint.',
  'overlaps-reserved':
    'The live source layer band would overlap the reserved playout range — the two must stay disjoint.',
} satisfies Record<SourcesSetConfigReason, string>;

const ASSIGNMENT_MESSAGES = {
  'duplicate-plate':
    'That plate already has a source in this template — reload this page and set it again.',
  'unknown-source':
    'That source is no longer defined on this station — pick another, or define it again under Live sources.',
} satisfies Record<SourcesSetAssignmentsReason, string>;

const MESSAGES: Readonly<Record<string, string>> = { ...CONFIG_MESSAGES, ...ASSIGNMENT_MESSAGES };

/**
 * The operator sentence for a refusal reason, or `null` when there is none to
 * explain. Unknown codes surface verbatim rather than being swallowed — a
 * quotable code beats a generic dead end (the B-070 stance).
 */
export function sourcesReasonMessage(reason: string | undefined): string | null {
  if (reason === undefined || reason === '') return null;
  return MESSAGES[reason] ?? `Not accepted (${reason}).`;
}

/**
 * Turn a TRANSPORT failure into something an operator can act on, never into a
 * wire identifier.
 *
 * The three shapes the bridge's own frame handler can answer with are
 * `unknown channel: <name>`, `invalid request for <name>` and `invalid response
 * for <name>`. All three mean one thing on this surface — this browser and this
 * bridge disagree about the feature — and none of them should ever reach the
 * screen as written.
 */
export function sourcesTransportMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  /*
    `B-152` — THE SHAPE TEST HAS ONE OWNER NOW (`shared/bridgeSkew.ts`), and what stays here
    is only the sentence that is genuinely THIS family's: what a skewed bridge costs a LIVE
    PLATE. The regex used to be spelled here and again in `delimiterStore`, and every other
    channel had neither — which is how `unknown channel: stack.set-active-look` reached an
    operator mid-show. The transport now words itself at the throw site, so this branch is
    reached only when something hands us a raw string rather than a caught bridge error.
  */
  if (isBridgeSkewMessage(raw)) {
    return (
      `${BRIDGE_SKEW_MESSAGE} Until then a template with a live plate cannot be taken, ` +
      'because nothing here can tell the bridge which source that plate uses.'
    );
  }
  return raw.trim() === '' ? 'The change could not be saved.' : raw;
}
