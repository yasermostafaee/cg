import { useSyncExternalStore } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { TEMPLATE_TIMING_VERSION, type StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Tag } from '../../ui/Tag.js';
import { Button } from '../../ui/Button.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { isOnAir } from '../stack/onAir.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { lastSentPasses } from './timingSent.js';
import { draftsVersion, stageTiming, subscribeDrafts, timingDraftOf } from './draftStore.js';

/**
 * 🔴 **`TIMING-WIRE-22` §4 — THE CONSOLE'S TIMING SECTION.**
 *
 * ── THE TWO OWNERSHIPS, ON ONE PANEL (ADR 0009) ──────────────────────────────
 *
 * `mode` and `hold` are FACTS — `Tag`s, never inputs and never DISABLED inputs. A greyed box
 * tells the operator they lack a permission; the truth is the value was never theirs to set.
 * `passes` and `gap` are CONTROLS, inherited until the operator sets them.
 *
 * ── 🔴 `DELTA B4` — AND THEY DRAFT, LIKE EVERY OTHER INSPECTOR EDIT ─────────
 *
 * **This component sends nothing.** It stages into the one draft store, and the commit bar's
 * `Update` / `Update on air` spends it together with the field and position edits in ONE press;
 * `Discard` drops it with them. What that replaces was a BLUR commit — so a click anywhere else
 * on the panel sent a command toward air, and the typed number vanished on the way.
 *
 * ── 🔴 THE LABEL CHANGES WITH THE STATE ─────────────────────────────────────
 *
 * ON AIR the count is PASSES REMAINING FROM NOW — the pass on screen is not one of them, and
 * `0` means "out after this pass". OFF AIR it is the count for the next take, which since
 * `DELTA B0` is the count that actually airs. Same field, two readings; the labels say which.
 *
 * ── 🔴 `DELTA B2` — NO EXPLANATORY PROSE ────────────────────────────────────
 *
 * An operator surface states LABELS, VALUES, STATE FACTS and REFUSALS. It does not teach. Five
 * explanatory lines lived here and are gone; what they said belongs in the docs and in training,
 * and the long form of a fact word belongs in its `title`. The rule is `CLAUDE.md`'s, under
 * "Design system — interactive controls".
 *
 * ── 🔴 `DELTA A2` — ON AIR THE BOX SHOWS NO NUMBER ──────────────────────────
 *
 * The pass counter lives in the page inside CEF and NO return path carries it, so the console
 * can only ever know what it SENT. A number under "Passes remaining" is a reading with a shelf
 * life — one pass later it is wrong, and it decays with nobody touching anything.
 */
export function TimingSection({
  item,
  info,
}: {
  item: StackItemState;
  /** `null` while the Inspector is still fetching it — the same shape its siblings take. */
  info: TemplateInfo | null | undefined;
}): JSX.Element | null {
  // The draft is module state, so this section re-renders from the store's version counter —
  // the same subscription every other drafting control on this panel already uses.
  useSyncExternalStore(subscribeDrafts, draftsVersion, draftsVersion);
  const playout = info?.playout;
  /*
    🔴 `DELTA A6` + `DELTA B1.4` — AN OLD OR STALE RECORD SAYS WHY, instead of vanishing or
    lying. A record without the current derivation version was produced by the entry-composition
    resolver, which published whichever panel a per-composition export listed first — the plant's
    crawler read `static / timed` over `auto-out / content-driven`. Those facts are WRONG, not
    old, and a console that is confidently wrong is the one thing an operator cannot defend
    against.

    🔴 **THE INVARIANT THAT KEEPS A DEAD CONTROL OFF AN OLD PAGE:** `playout` metadata and a page
    that can read `__cg.timing` are produced by the SAME import — `produceTemplateDelivery`
    derives the metadata and renders the HTML in one call, from one unpacked scene. ⚠ Anything
    that BACK-FILLS `playout` onto an existing registry entry without rebuilding its HTML breaks
    it: the console would offer a live pass control over a page that ignores `__cg.timing`.
  */
  if (playout === undefined || playout.v !== TEMPLATE_TIMING_VERSION) {
    // `null` is "not known yet", not "known to be old" — flashing this at every row selection
    // would make the sentence noise, and noise is how a real one stops being read.
    if (info == null) return null;
    return (
      <div className="cg-inspector-section">
        <h2>Timing</h2>
        <p style={styles.hint} data-testid="timing-needs-reimport">
          Timing controls appear after this template is re-imported.
        </p>
      </div>
    );
  }

  const onAir = isOnAir(item);
  /*
    `loops` is the TEMPLATE's bit, not `mode === 'loop-cycle'`: the row's mode is the root's,
    and the scope that repeats is often a nested instance below it. Deriving it from `mode`
    would hide the pass controls on exactly the templates that loop.
  */
  const loops = playout.loops === true;

  return (
    <div className="cg-inspector-section">
      <h2>Timing</h2>

      <div style={styles.row}>
        <span style={styles.label}>Mode</span>
        <Tag
          className="cg-meta-chip"
          data-testid="timing-mode-fact"
          title={MODE_LONG[playout.mode]}
        >
          {MODE_WORD[playout.mode] ?? playout.mode}
        </Tag>
      </div>
      {playout.holdSource !== undefined && (
        <div style={styles.row}>
          <span style={styles.label}>Hold</span>
          <Tag
            className="cg-meta-chip"
            data-testid="timing-hold-fact"
            title={HOLD_LONG[playout.holdSource]}
          >
            {HOLD_WORD[playout.holdSource] ?? playout.holdSource}
          </Tag>
        </div>
      )}

      {loops && (
        <>
          <PassesControl item={item} onAir={onAir} authored={playout.repeat} />
          <DelayControl item={item} authored={playout.delayMs} />
        </>
      )}
    </div>
  );
}

/*
  🔴 `DELTA B2` — THE SHORT FORM IS THE VALUE; THE LONG FORM IS A `title`.

  These used to read `Loop cycle — repeats in → hold → out` on the panel. That sentence is an
  explanation, and an operator reading a row under pressure wants the name of the thing.
*/
const MODE_WORD: Record<string, string> = {
  static: 'Static',
  manual: 'Manual',
  'auto-out': 'Auto-out',
  'loop-cycle': 'Loop cycle',
};
const MODE_LONG: Record<string, string> = {
  static: 'Plays in, holds, cut on stop',
  manual: 'Holds until stop',
  'auto-out': 'Outro after the hold',
  'loop-cycle': 'Repeats in → hold → out',
};
const HOLD_WORD: Record<string, string> = { timed: 'Timed', 'content-driven': 'Content-driven' };
const HOLD_LONG: Record<string, string> = {
  timed: 'Holds for a duration',
  'content-driven': 'Holds until the content completes',
};

/**
 * 🔴 `DELTA B4` — THE PASS COUNT: A LABELLED TWO-STATE CHOICE, THEN A NUMBER.
 *
 * ── WHY THE BARE `∞` IS GONE ────────────────────────────────────────────────
 *
 * Owner-observed: it was not understood. It was a ghost button beside a box, and nothing said
 * whether it was the state the row was IN or an action pressing it would take — so the one
 * thing a toggle exists to carry, WHICH OF THE TWO IS SELECTED, was the thing it did not carry.
 * `Until stop` / `Count` say what they mean in words, and `aria-pressed` makes the selection a
 * fact the paint and a screen reader read from one place.
 *
 * ⚠ THE COUNT BOX BELONGS TO THE `Count` STATE and is not rendered beside `Until stop`. A box
 * that cannot affect anything is the R-021 stage-2b anti-pattern, and a DISABLED one would be
 * the greyed control this section's header refuses on the facts above.
 */
function PassesControl({
  item,
  onAir,
  authored,
}: {
  item: StackItemState;
  onAir: boolean;
  authored: number | 'infinite' | undefined;
}): JSX.Element {
  const draft = timingDraftOf(item.itemId);
  const applied = item.timingOverride?.repeat;
  const inherited = authored ?? 'infinite';
  const label = onAir ? 'Passes remaining' : 'Passes next take';
  /*
    WHICH STATE IS SELECTED, resolved once from three layers in falling authority: the draft the
    operator is composing, then the count this row has stored, then what the template authored.
    One resolution, so the two buttons and the box can never disagree about the answer.
  */
  const chosen: 'until-stop' | 'count' =
    draft?.passes !== undefined
      ? draft.passes.kind
      : (applied ?? inherited) === 'infinite'
        ? 'until-stop'
        : 'count';
  /*
    🔴 WHAT THE BOX HOLDS, and the on-air asymmetry is `DELTA A2`'s.

    A draft in progress always wins — that is the whole of "typing stays visible". With no
    draft: OFF AIR it shows the STORED count, which is a value the console really does hold;
    ON AIR it shows nothing, because the page's remaining count is a number nothing here sees.
  */
  const typed =
    draft?.passes?.text ?? (onAir || typeof applied !== 'number' ? '' : String(applied));

  const sentAtLabel = lastSentPasses(item.itemId);
  const sentLine =
    applied === undefined
      ? 'Nothing sent'
      : `Sent ${passesWord(applied)} more${sentAtLabel === undefined ? '' : ` · ${sentAtLabel}`}`;

  return (
    <div style={styles.stack}>
      <span style={styles.label}>{label}</span>
      {/*
        The house's segmented group: a `role="group"` of `Button`s keyed on `aria-pressed`,
        painted by the shared selected-not-on-air family. No `style` prop and no new colour —
        `controls.css` names `.cg-timing-choice` in the template picker's own chip selectors, so
        "a chosen thing that is not on air" keeps ONE appearance in this app.
      */}
      <div className="cg-timing-choice" role="group" aria-label={label}>
        <Button
          variant="neutral"
          aria-pressed={chosen === 'until-stop'}
          onClick={() => {
            // Carry the box's text INTO the choice, so a flip back to `Count` returns the
            // operator's number rather than re-seeding from what the row has stored.
            stageTiming(item.itemId, { passes: { kind: 'until-stop', text: typed } });
          }}
        >
          Until stop
        </Button>
        <Button
          variant="neutral"
          aria-pressed={chosen === 'count'}
          onClick={() => {
            // Carry whatever the box already holds across the switch — pressing `Count` after
            // typing 3 and changing your mind twice must not eat the 3.
            stageTiming(item.itemId, { passes: { kind: 'count', text: typed } });
          }}
        >
          Count
        </Button>
      </div>
      {chosen === 'count' && (
        <NumericInput
          value={typed}
          onValueChange={(text) => {
            stageTiming(item.itemId, { passes: { kind: 'count', text } });
          }}
          aria-label={label}
          // OFF AIR: names what it inherits when the operator has stored nothing. ON AIR: no
          // number and no placeholder either — a placeholder would be that same unseeable
          // count in lighter ink.
          placeholder={onAir ? '' : `Default (${passesWord(inherited)})`}
          onBlur={() => {
            refuseIfNotACount(typed);
          }}
        />
      )}
      {onAir && (
        <p style={styles.hint} data-testid="timing-passes-sent">
          {sentLine}
        </p>
      )}
    </div>
  );
}

function DelayControl({
  item,
  authored,
}: {
  item: StackItemState;
  authored: number | undefined;
}): JSX.Element {
  const draft = timingDraftOf(item.itemId);
  const applied = item.timingOverride?.delayMs;
  const inheritedMs = authored ?? 0;
  /*
    The gap has no on-air asymmetry: unlike the pass count it is not consumed as it runs, so the
    stored value IS what the next pass will wait — on air and off — and showing it is honest in
    both states.
  */
  const typed =
    draft?.gapSeconds ?? (applied === undefined ? '' : String(Math.round(applied / 100) / 10));

  return (
    <div style={styles.stack}>
      <span style={styles.label}>Gap between passes</span>
      <NumericInput
        value={typed}
        onValueChange={(gapSeconds) => {
          stageTiming(item.itemId, { gapSeconds });
        }}
        decimal
        aria-label="Gap between passes"
        placeholder={`Default (${secondsWord(inheritedMs)})`}
        onBlur={() => {
          const raw = typed.trim();
          if (raw === '') return;
          const n = Number(raw);
          // `0` is legal and means no gap, so it is NOT refused here.
          if (!Number.isFinite(n) || n < 0) reportCommandError(`"${raw}" is not a gap in seconds.`);
        }}
      />
    </div>
  );
}

/** `∞` for infinite, else the number. The ONE spelling, so two rows cannot disagree. */
const passesWord = (v: number | 'infinite'): string => (v === 'infinite' ? '∞' : String(v));

/** A gap in ms as the operator thinks of it — seconds, one decimal. */
const secondsWord = (ms: number): string => `${String(Math.round(ms / 100) / 10)} s`;

/**
 * 🔴 REFUSED WITH A REASON — never silently rewritten, and never on the way to the wire.
 *
 * ⚠ What is refused is TEXT THAT IS NOT A COUNT. `0` is an instruction ("out after this pass")
 * and reaches the bridge; reading it as absent is the silent-clamp failure this tree has paid
 * for twice.
 *
 * ⚠ And since `DELTA B4` a refusal changes nothing about the draft — the text stays in the box
 * for the operator to correct. What a press would CARRY is decided by `timingPassesOf`, which
 * answers `undefined` for the same text, so nonsense cannot reach air whether or not this
 * sentence was ever read.
 */
function refuseIfNotACount(raw: string): void {
  const s = raw.trim();
  if (s === '') return;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) reportCommandError(`"${s}" is not a pass count.`);
}

const styles = {
  row: { display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '0.25rem 0' },
  stack: { display: 'flex', flexDirection: 'column', gap: '0.2rem', margin: '0.5rem 0' },
  label: { color: colors.textMuted, fontSize: '0.7rem', minWidth: '5.5rem' },
  hint: { color: colors.textMuted, fontSize: '0.66rem', lineHeight: 1.4, margin: '0.15rem 0 0' },
} as const satisfies Record<string, React.CSSProperties>;
