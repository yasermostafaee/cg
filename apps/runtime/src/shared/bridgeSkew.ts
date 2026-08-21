/**
 * 🔴 **`B-152` — THE ONE PLACE THAT KNOWS WHAT A BRIDGE-SKEW FAILURE LOOKS LIKE, and the one
 * place that words it.**
 *
 * ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
 *
 * An operator pressed a LOOK button during a live show and got a red toast reading exactly
 * `unknown channel: stack.set-active-look`. That is the BRIDGE's frame router talking
 * (`bridge.ts`: `unknown channel: ${frame.channel}`), it names an internal IPC identifier,
 * and there is nothing an operator can do with it. A developer string must never appear on a
 * broadcast surface.
 *
 * It was not one careless call site. Fourteen places in the renderer pass a caught
 * `err.message` straight to a toast, and exactly TWO of them translated these shapes —
 * `sourcesTransportMessage` and `delimiterStore`'s `describeCommitFailure`, each with its own
 * copy of the same regex. So the rule existed twice, applied twice, and every other channel
 * leaked. That is the shape this repo keeps paying for: a rule that must be REMEMBERED at
 * each call site is a rule that is already broken somewhere you have not looked.
 *
 * ── WHY THE CLASSIFICATION HAPPENS AT THE TRANSPORT, NOT AT THE TOAST ───────
 *
 * `WebSocketRuntime` turns every bridge error response into an `Error` at ONE line. Wording
 * it there means every call site — including ones not yet written — gets a legible message
 * without knowing this file exists. The alternative, asking each surface to translate, is
 * the thing that just failed.
 *
 * ⚠ It is a REAL STATE, not a typo: the browser is talking to a bridge PROCESS whose build
 * predates this page. A browser reload updates the SPA and not the long-lived bridge, so
 * this arises normally, and the honest sentence names the cause and the remedy.
 */

/**
 * The three answers the bridge's own frame handler can give when this page and that process
 * disagree about a channel.
 *
 * - `unknown channel: <name>`   — the bridge has never heard of the feature.
 * - `invalid request for <name>`  — it knows the channel and disagrees about its shape.
 * - `invalid response for <name>` — the same disagreement, caught on the way back.
 *
 * All three mean ONE thing to the operator. Kept as one expression because they are one
 * fact; splitting them would invite a surface to handle two and forget the third.
 */
const SKEW_SHAPES = /^(?:unknown channel|invalid (?:request|response) for)\b[:\s]*(\S+)?/i;

/** The channel name a skew message is about, or `undefined` when the shape does not match. */
export function skewChannelOf(raw: string): string | undefined {
  const m = SKEW_SHAPES.exec(raw.trim());
  if (m === null) return undefined;
  // The captured token, stripped of a trailing period a future message might carry. An
  // EMPTY capture still counts as skew — the shape matched, and the sentence below does not
  // depend on knowing which channel it was.
  return (m[1] ?? '').replace(/[.,]$/, '');
}

/** Does this bridge error mean "this page and that bridge process disagree"? */
export function isBridgeSkewMessage(raw: string): boolean {
  return SKEW_SHAPES.test(raw.trim());
}

/**
 * The operator's sentence for a skew failure. **The channel name is deliberately NOT in it.**
 *
 * It names what happened, why, and the one action that fixes it. `channel` is carried on the
 * error OBJECT instead, so a developer reading a console log still has it and the operator
 * never does.
 */
export const BRIDGE_SKEW_MESSAGE =
  'This bridge is running an older build than this page — that command is not available ' +
  'until the bridge is restarted with a matching build. Nothing was sent to CasparCG.';

/**
 * A command the running bridge cannot serve because its build predates this page.
 *
 * Carries the channel for DIAGNOSTICS only. `message` is what reaches a surface, and it is
 * already operator-legible — which is what lets every existing `err.message` call site stay
 * exactly as it is and still be correct.
 */
export class BridgeSkewError extends Error {
  /** The IPC channel that was refused. For logs and tests — never for display. */
  readonly channel: string;

  constructor(channel: string) {
    super(BRIDGE_SKEW_MESSAGE);
    this.name = 'BridgeSkewError';
    this.channel = channel;
  }
}

/**
 * Turn a bridge error response into the error a caller should see.
 *
 * A skew shape becomes a {@link BridgeSkewError}; anything else keeps the bridge's own
 * sentence, because the bridge's refusals carry SPECIFICS this side cannot know (which look,
 * which template is already on air, how many boxes it has) and swallowing those would trade
 * one unhelpful message for another.
 */
export function bridgeErrorFrom(rawMessage: string): Error {
  const channel = skewChannelOf(rawMessage);
  if (channel !== undefined) return new BridgeSkewError(channel);
  return new Error(rawMessage);
}
