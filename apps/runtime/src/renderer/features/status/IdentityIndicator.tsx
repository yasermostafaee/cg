import type { AuthSessionState } from '../../../shared/runtime-bridge.js';
import { useAuthSession } from '../../hooks/useAuthSession.js';
import { colors } from '../../theme.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { Tag } from '../../ui/Tag.js';
import { signInFailureLine } from '../auth/signInMessages.js';

/**
 * 🔴 `R-066` — **WHO IS SIGNED IN AT THIS CONSOLE, in the operator's words.**
 *
 * ── WHY THIS IS A SECOND PILL AND NOT A STATE OF `LinkIndicator` ────────────
 *
 * `R-066`'s acceptance says "the link indicator names the state". `LinkIndicator`'s own
 * header forbids exactly that, and the reason it gives is the one this repo has paid for
 * twice: _"What it may not do is claim, in the word and the colour that mean 'connected', to
 * be connected to something it does not measure."_ A signed-out console has a perfectly LIVE
 * link — the socket is open, the bridge is answering, `bridge.capabilities` came back. Folding
 * identity into that pill would make one instrument report two axes, which is golden rule 8's
 * shape, and it is how `● LIVE` came to be read as a claim about the plant.
 *
 * So the state is named, in the operator's words, in the same row and immediately beside the
 * link — one pill per axis. That satisfies the acceptance where it can be satisfied honestly.
 *
 * ── WHAT IT SAYS, AND WHAT IT REFUSES TO SAY ────────────────────────────────
 *
 * Three sentences and no fourth. `off` and `unknown` render NOTHING: a station that does not
 * authenticate must be byte-identical to yesterday, and a console that has not heard from the
 * bridge has no verdict to give — a pill that appeared saying "checking…" would be an
 * instrument reporting its own latency.
 *
 * 🔴 Golden rule 11 — the `sub` never appears here. It is an internal id, it is in the audit
 * record beside the name, and the sentence an operator reads under pressure carries the name
 * only. The `title` carries the session's end time, which is a fact about the state rather
 * than an identifier.
 *
 * ⚠ The name goes through {@link IsolatedName}. A Persian name beside English chrome in one
 * text node has its placement decided by the bidi algorithm rather than by us — the mistake
 * four surfaces made separately before it was written down.
 */
const styles = {
  signedOut: { color: colors.textMuted },
  expired: { color: colors.errorText },
  signedIn: { color: colors.text },
} as const;

export function IdentityIndicator(): JSX.Element | null {
  const auth = useAuthSession();

  switch (auth.kind) {
    case 'off':
    case 'unknown':
      return null;
    case 'signed-out':
      return (
        <Tag className="cg-pill" role="status" aria-label="Sign-in state">
          <span style={styles.signedOut}>SIGNED OUT</span>
        </Tag>
      );
    case 'expired':
      return (
        <Tag className="cg-pill" role="status" aria-label="Sign-in state">
          <span style={styles.expired}>
            SESSION EXPIRED — <IsolatedName>{auth.name}</IsolatedName> — SIGN IN AGAIN
          </span>
        </Tag>
      );
    case 'signed-in':
      return (
        <Tag
          className="cg-pill"
          role="status"
          aria-label="Sign-in state"
          title={sessionTitle(auth)}
          {...(auth.renewalRefused !== undefined ? { 'data-renewal-refused': '' } : {})}
        >
          <span style={styles.signedIn}>
            SIGNED IN AS <IsolatedName>{auth.principal.name}</IsolatedName>
          </span>
        </Tag>
      );
  }
}

/** First-strong isolate … pop directional isolate: a plain-text `<bdi>`, for a `title`. */
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);

/**
 * The pill's `title`: when the session ends — and, `CENTRAL-BRIDGE-01-A` A2, why the Playout will not
 * renew it while it refuses (the session still works to that time, and the renewal is asked again
 * every minute). A state fact, not advice; the Playout's own words go in an isolate.
 */
export function sessionTitle(auth: Extract<AuthSessionState, { kind: 'signed-in' }>): string {
  const ends = `This session ends at ${formatEndTime(auth.principal.expiresAt)}.`;
  const refused = auth.renewalRefused;
  if (refused === undefined) return ends;
  const line = signInFailureLine(refused.code, refused.message);
  return `${ends} ${line.fromPlayout ? `${FSI}${line.text}${PDI}` : line.text}`;
}

/**
 * The session's end time as a clock reading, or the raw value if it cannot be parsed.
 *
 * ⚠ Never invents a value. An unparseable `exp` shown verbatim is something an engineer can
 * act on; a fabricated time is something an operator would plan a shift around.
 */
export function formatEndTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
