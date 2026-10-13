import { useReadOnlyReason } from '../../hooks/useCanOperate.js';
import { colors } from '../../theme.js';
import { Tag } from '../../ui/Tag.js';

/**
 * 🔴 `C-038` / `R-066` bullet 4 — **THE CONSOLE IS READ-ONLY, SAID ONCE.**
 *
 * ── WHY A PILL RATHER THAN A MARK ON EVERY CONTROL ──────────────────────────
 *
 * Because there are no controls to mark. Golden rule 13: the operator controls are ABSENT for
 * a principal who may not use them, not greyed out — _"the strongest form of 'it refuses' is
 * that it does not exist"_ — so a console that said nothing would simply look broken, with an
 * empty toolbar and no account of why.
 *
 * ONE sentence, in the same row as the link and the identity, one pill per axis. That is
 * `IdentityIndicator`'s own argument reused: an instrument reports the axis it measures, and
 * folding "read only" into "signed in as ‹name›" would make one pill report two.
 *
 * ⚠ **It is a `Tag`, whose type makes `onClick`, `tabIndex` and `role="button"`
 * inexpressible.** That is deliberate and is the enforcement rather than the decoration: a
 * fact that could be pressed is a control, and this must never become one.
 *
 * Renders NOTHING when the console is operable, when auth is off, and while the bridge has
 * not answered — a station that does not authenticate is byte-identical, and a console with
 * no verdict yet has nothing to state.
 */
const style = { color: colors.textMuted } as const;

export function ReadOnlyIndicator(): JSX.Element | null {
  const reason = useReadOnlyReason();
  if (reason === null) return null;

  return (
    <Tag className="cg-pill" role="status" aria-label="Operating state">
      <span style={style}>{reason}</span>
    </Tag>
  );
}
