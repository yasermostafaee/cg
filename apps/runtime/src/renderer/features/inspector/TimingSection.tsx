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
    🔴 `DELTA A6` — **AN OLD IMPORT SAYS WHY, INSTEAD OF VANISHING.**

    A template imported before `TemplateInfo.playout` existed carries no timing metadata, so the
    section cannot state anything and must not guess. But rendering NOTHING is the silence this
    product forbids: the operator finds a control on one row and no control on the next, with
    the panel offering no account of the difference, and the only way to learn the reason is to
    ask someone. One sentence turns an absence into a fact with a remedy.

    ⚠ It renders for a template with `info` but no `playout` — NOT while `info` is still `null`
    (the Inspector is fetching it), which would flash "re-import" at every row selection.

    🔴 **THE INVARIANT THAT KEEPS A DEAD CONTROL OFF AN OLD PAGE, stated here because the next
    person to touch it will be tempted to break it:**

        `playout` metadata and a page that can read `__cg.timing` are produced by the SAME
        import — `produceTemplateDelivery` derives the metadata and renders the HTML in one
        call, from one unpacked scene.

    That is the whole reason an absent `playout` is a safe proxy for "this page cannot obey a
    timing command". ⚠ **Anything that ever BACK-FILLS `playout` onto an existing registry entry
    without rebuilding its HTML breaks it** — the console would then offer a live pass control
    over a page from an older build that ignores `__cg.timing`, and the operator would set a
    count, see it accepted, and watch the graphic loop on regardless. A migration, a repair
    script, or a bridge-side default are all the same hazard. If the metadata is ever separated
    from the render, this gate needs a real capability bit instead.
  */
  if (playout === undefined) {
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
            return;
          }
          // `DELTA A2` — stamped only on ACCEPTANCE, so the line can never time a send the
          // bridge refused. It is what this console did, and it is true from then on.
          if (patch.passes !== undefined) recordSentPasses(item.itemId);
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
            itemId={item.itemId}
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
  itemId,
  onAir,
  busy,
  authored,
  override,
  onCommit,
}: {
  itemId: string;
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
  /*
    🔴 `DELTA A2` — **ON AIR THE BOX SHOWS NO NUMBER, BECAUSE THE CONSOLE CANNOT SEE ONE.**

    The pass counter lives in `PlayoutController.cyclesLeft`, inside the page, inside CEF. It is
    carried by NO return path: swept for `cyclesLeft` / `passesLeft` / `remainingPasses` /
    `passesRemaining` / `cycleCount` across `caspar-client`, `caspar-bridge`, `shared-ipc` and
    the Runtime app and found in none of them, against a positive control of 15 files matching
    `osc`. The console can only ever know what it SENT.

    So a numeric placeholder under "Passes remaining" is a false reading with a shelf life: one
    pass after "set 2" it still says 2 while ONE remains, and after the count runs out it still
    says 2 over a graphic that has gone. That is precisely the belief this console exists to
    prevent, and it decays on its own without anybody touching anything.

    On air the box therefore carries no placeholder at all and a FACT LINE states what was sent
    and when — a claim that stays true forever, because it is about the past. OFF AIR the
    placeholder stays: the count for the next take is a STORED value the console really does
    hold, so naming it (and naming what it inherits) is honest there.
  */
  const sent = onAir ? lastSentPasses(itemId) : undefined;
  const sentLine =
    override === undefined
      ? 'Nothing sent this run — the template’s own count is running.'
      : `Sent ${passesWord(override)} more${sent === undefined ? '' : ` · ${sent}`}`;

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
          // ON AIR: no number — see the note above. OFF AIR: the stored count, naming what it
          // inherits when the operator has set nothing.
          placeholder={
            onAir
              ? ''
              : override === undefined
                ? `Default (${passesWord(inherited)})`
                : passesWord(shown)
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
      {onAir && (
        <p style={styles.hint} data-testid="timing-passes-sent">
          {sentLine}
        </p>
      )}
      <p style={styles.hint}>{help}</p>
    </div>
  );
}

/**
 * 🔴 `DELTA A2` — WHEN THIS BROWSER LAST SENT A PASS COUNT for an item, as a local clock time.
 *
 * Browser-local and deliberately NOT persisted or carried on the wire: the console is stating
 * something it did itself, and the only honest source for "when" is the moment it happened here.
 * A count set from ANOTHER console, or before this page was loaded, has no time this browser can
 * know — so the line then says what was sent and simply omits the when, rather than inventing
 * one from a republish (which would time the RECONCILE, not the operator's action).
 */
const sentAt = new Map<string, string>();

function recordSentPasses(itemId: string): void {
  sentAt.set(itemId, new Date().toLocaleTimeString());
}

function lastSentPasses(itemId: string): string | undefined {
  return sentAt.get(itemId);
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
