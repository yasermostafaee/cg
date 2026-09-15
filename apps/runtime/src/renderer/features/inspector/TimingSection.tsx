import { useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Tag } from '../../ui/Tag.js';
import { Button } from '../../ui/Button.js';
import { isOnAir } from '../stack/onAir.js';
import { reportCommandError } from '../status/commandFeedback.js';

/**
 * 🔴 **`TIMING-WIRE-22` §4 — THE CONSOLE'S TIMING SECTION.**
 *
 * It exists only now, and the order is the point. The previous session declined to ship a
 * control that set a value which never reached air, because a console whose number disagrees
 * with the picture is worse than a console with no number. Pieces (a)–(e) built the road; this
 * is the surface at the end of it.
 *
 * ── THE TWO OWNERSHIPS, ON ONE PANEL (ADR 0009) ──────────────────────────────
 *
 * **`mode` and `hold` are FACTS.** They state what the template promises to do, and the promise
 * is the author's. They are `Tag`s — a type with no `onClick`, no `tabIndex` and no expressible
 * `role="button"` — with none of a control's chrome. Emphatically NOT disabled inputs: a greyed
 * box tells the operator they lack a permission, when the truth is the value was never theirs.
 *
 * **`repeat` and `delay` are CONTROLS**, inherited from the template until the operator sets
 * them, and showing that inheritance the way the source defaults do: `Default (∞)`, never a bare
 * `∞`. An operator has to be able to tell a value they chose from one they were given.
 *
 * ── 🔴 THE LABEL CHANGES WITH THE STATE, AND THAT IS THE WHOLE CONTRACT ──────
 *
 * The same field means two different things:
 *
 *  - **ON AIR** — PASSES REMAINING FROM NOW. The pass on screen is not one of them, so `2` means
 *    that one finishes and two more play. `0` is legal and means "out after this pass" — an
 *    instruction, not a stop, so `mode`'s outro still runs.
 *  - **OFF AIR** — the count for the NEXT TAKE.
 *
 * Same pattern as `Update on air`: a control states what it will do IN THE STATE IT IS IN. A
 * field labelled "repeat" that silently means two different numbers is how an operator asks for
 * two more passes and gets two total.
 *
 * ── §2's SEAM: SET vs APPLIED ────────────────────────────────────────────────
 *
 * The console SETS an intent; the page APPLIES it. While a set is in flight the control shows
 * the row's existing value — never the typed one — and on refusal the reason goes to the
 * PERSISTENT refusal surface (`reportCommandError`), never a toast, with the display returning
 * to what air is actually doing. Nothing is displayed as set until the bridge has said so, which
 * it does by republishing `timingOverride`.
 */
export function TimingSection({
  item,
  info,
}: {
  item: StackItemState;
  /** `null` while the Inspector is still fetching it — the same shape its siblings take. */
  info: TemplateInfo | null | undefined;
}): JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const playout = info?.playout;
  /*
    A template imported before `TemplateInfo.playout` existed states nothing rather than
    guessing. Re-import to get it — degradation, not a second rule, and the same shape
    `hasNext` uses for a template that predates IT.
  */
  if (playout === undefined) return null;

  const onAir = isOnAir(item);
  const override = item.timingOverride;
  /*
    🔴 `loops` is the TEMPLATE'S bit, not `mode === 'loop-cycle'`. The row's mode is the ENTRY
    composition's, and the scope that actually repeats is often a level below it — `logo-bug`'s
    entry is `manual` while its `comp-logo-mark` child loops forever. Deriving the bit from
    `mode` here would hide the pass controls on exactly the templates that loop.
  */
  const loops = playout.loops === true;

  const send = (patch: { passes?: number | 'infinite'; delayMs?: number }): void => {
    setBusy(true);
    void window.cg.stack
      .setPassTiming({ itemId: item.itemId, ...patch })
      .then(
        (res) => {
          /*
            🔴 A REFUSAL IS PERSISTENT, NOT A TOAST (DELTA R) — and the display is not touched.
            The control renders from `item.timingOverride`, which the bridge republishes only
            after a set it ACCEPTED, so a refused set leaves the number showing what air is
            doing without this handler having to put it back.
          */
          if (!res.ok) {
            reportCommandError(
              res.message ?? 'The timing change was not accepted. The row keeps the timing on air.',
            );
          }
        },
        (err: unknown) => {
          reportCommandError(
            err instanceof Error ? err.message : 'The timing change could not be sent.',
          );
        },
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="cg-inspector-section">
      <h2>Timing</h2>

      {/* FACTS — stated, never offered. See the header for why these are not disabled inputs. */}
      <div style={styles.row}>
        <span style={styles.label}>Mode</span>
        <Tag className="cg-fact" data-testid="timing-mode-fact">
          {MODE_WORDS[playout.mode] ?? playout.mode}
        </Tag>
      </div>
      {playout.holdSource !== undefined && (
        <div style={styles.row}>
          <span style={styles.label}>Hold</span>
          <Tag className="cg-fact" data-testid="timing-hold-fact">
            {HOLD_WORDS[playout.holdSource] ?? playout.holdSource}
          </Tag>
        </div>
      )}
      <p style={styles.hint}>
        Set by the template — the console states these, it cannot change them.
      </p>

      {/*
        The CONTROLS are offered only for a template that loops. A pass count and a gap between
        passes mean nothing where there is only ever one pass, and a control that can only no-op
        is the anti-pattern R-021 stage 2b named.
      */}
      {loops && (
        <>
          <PassesControl
            onAir={onAir}
            busy={busy}
            authored={playout.repeat}
            override={override?.repeat}
            onCommit={(passes) => send({ passes })}
          />
          <DelayControl
            busy={busy}
            authored={playout.delayMs}
            override={override?.delayMs}
            onCommit={(delayMs) => send({ delayMs })}
          />
          <p style={styles.hint}>
            {onAir
              ? 'Takes effect from the next pass — the pass on screen is not disturbed.'
              : 'Applies from the next take.'}
          </p>
        </>
      )}
    </div>
  );
}

const MODE_WORDS: Record<string, string> = {
  static: 'Static — plays in, holds, cut on stop',
  manual: 'Manual — holds until stop',
  'auto-out': 'Auto-out — outro after the hold',
  'loop-cycle': 'Loop cycle — repeats in → hold → out',
};

const HOLD_WORDS: Record<string, string> = {
  timed: 'Timed — holds for a duration',
  'content-driven': 'Content-driven — until the content completes',
};

/** `∞` for infinite, else the number. The ONE spelling, so two rows cannot disagree. */
const passesWord = (v: number | 'infinite'): string => (v === 'infinite' ? '∞' : String(v));

/**
 * The pass count. Its LABEL is the contract — see the section header — so the two readings are
 * spelled here once each and chosen by `onAir`, never by a caller passing a string.
 */
function PassesControl({
  onAir,
  busy,
  authored,
  override,
  onCommit,
}: {
  onAir: boolean;
  busy: boolean;
  authored: number | 'infinite' | undefined;
  override: number | 'infinite' | undefined;
  onCommit: (passes: number | 'infinite') => void;
}): JSX.Element {
  /*
    ABSENT means INHERITING, which is a third state and not a zero. The default NAMES the value
    it inherits — `Default (∞)` — because a bare `∞` cannot be told from one the operator chose.
    An authored-absent repeat resolves to infinite (the schema's `repeatOf`), and the label says
    so rather than leaving an empty box that silently means forever.
  */
  const inherited = authored ?? 'infinite';
  const shown = override ?? inherited;
  const label = onAir ? 'Passes remaining' : 'Passes next take';
  const help = onAir
    ? 'From now — the pass on screen is not counted. 0 goes out after it.'
    : 'The count this row will run when it is next taken.';

  return (
    <div style={styles.stack}>
      <span style={styles.label}>{label}</span>
      <div style={styles.inline}>
        {/*
          🔴 UNCONTROLLED, and that is the §2 rule in the markup rather than in a handler.

          The box holds the operator's TYPING until they commit it; what it DISPLAYS when empty
          is the placeholder, which is rendered from the row's published value. So the control
          structurally cannot show a number the template has not accepted — there is no state
          holding an optimistic value that a refusal would have to put back.
        */}
        <input
          type="text"
          inputMode="numeric"
          className="cg-input"
          style={styles.num}
          aria-label={label}
          disabled={busy}
          placeholder={
            override === undefined ? `Default (${passesWord(inherited)})` : passesWord(shown)
          }
          onBlur={(e) => {
            const raw = e.currentTarget.value;
            e.currentTarget.value = '';
            if (raw.trim() === '') return;
            const parsed = parsePasses(raw);
            if (parsed === undefined) {
              /*
                🔴 REFUSED WITH A REASON, never silently rewritten. `0` is an instruction and
                must reach the bridge; what is refused here is text that is not a count at all.
                A clamp would turn nonsense into a plausible number and show the operator a
                value nothing agreed to — the class this tree has paid for twice.
              */
              reportCommandError(
                `"${raw.trim()}" is not a pass count. Type a whole number of passes (0 goes out after the current pass), or ∞ to keep looping.`,
              );
              return;
            }
            onCommit(parsed);
          }}
        />
        <Button
          variant="ghost"
          disabled={busy}
          title="Keep looping until stop"
          onClick={() => {
            onCommit('infinite');
          }}
        >
          ∞
        </Button>
      </div>
      <p style={styles.hint}>{help}</p>
    </div>
  );
}

/** The gap between passes, in SECONDS on this surface — an operator thinks in seconds. */
function DelayControl({
  busy,
  authored,
  override,
  onCommit,
}: {
  busy: boolean;
  authored: number | undefined;
  override: number | undefined;
  onCommit: (delayMs: number) => void;
}): JSX.Element {
  const inheritedMs = authored ?? 0;
  const shownMs = override ?? inheritedMs;
  const secs = (ms: number): string => `${String(Math.round(ms / 100) / 10)} s`;

  return (
    <div style={styles.stack}>
      <span style={styles.label}>Gap between passes</span>
      <input
        type="text"
        inputMode="decimal"
        className="cg-input"
        style={styles.num}
        aria-label="Gap between passes"
        disabled={busy}
        placeholder={override === undefined ? `Default (${secs(inheritedMs)})` : secs(shownMs)}
        onBlur={(e) => {
          const raw = e.currentTarget.value.trim();
          e.currentTarget.value = '';
          if (raw === '') return;
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) {
            // Refused with a reason. 0 is legal and means no gap, so it is NOT refused here.
            reportCommandError(
              `"${raw}" is not a gap. Type the seconds to wait between passes — 0 for no gap.`,
            );
            return;
          }
          onCommit(Math.round(n * 1000));
        }}
      />
      <p style={styles.hint}>
        Dead air between repeats — the graphic is off screen for it. It never delays the first
        showing.
      </p>
    </div>
  );
}

/**
 * Text → a pass count, or `undefined` for "not a count".
 *
 * ⚠ `0` returns `0`, not `undefined`: it is the instruction "out after this pass". Reading it as
 * absent is the exact silent-clamp failure the section header names.
 */
function parsePasses(raw: string): number | 'infinite' | undefined {
  const s = raw.trim();
  if (s === '') return undefined;
  if (s === '∞' || s.toLowerCase() === 'inf' || s.toLowerCase() === 'infinite') return 'infinite';
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

const styles = {
  row: { display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '0.25rem 0' },
  stack: { display: 'flex', flexDirection: 'column', gap: '0.2rem', margin: '0.5rem 0' },
  inline: { display: 'flex', alignItems: 'center', gap: '0.35rem' },
  label: { color: colors.textMuted, fontSize: '0.7rem', minWidth: '5.5rem' },
  num: { width: '100%', fontVariantNumeric: 'tabular-nums' },
  hint: { color: colors.textMuted, fontSize: '0.66rem', lineHeight: 1.4, margin: '0.15rem 0 0' },
} as const satisfies Record<string, React.CSSProperties>;
