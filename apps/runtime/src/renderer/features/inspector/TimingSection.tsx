import { useState } from 'react';
import type { TemplateInfo } from '@cg/shared-ipc';
import { TEMPLATE_TIMING_VERSION, type StackItemState } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Tag } from '../../ui/Tag.js';
import { Button } from '../../ui/Button.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { isOnAir } from '../stack/onAir.js';
import { reportCommandError } from '../status/commandFeedback.js';

/**
 * 🔴 **`TIMING-WIRE-22` §4 — THE CONSOLE'S TIMING SECTION.**
 *
 * ── THE TWO OWNERSHIPS, ON ONE PANEL (ADR 0009) ──────────────────────────────
 *
 * `mode` and `hold` are FACTS — `Tag`s, never inputs and never DISABLED inputs. A greyed box
 * tells the operator they lack a permission; the truth is the value was never theirs to set.
 * `passes` and `gap` are CONTROLS, inherited until the operator sets them.
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
 * can only ever know what it SENT. A numeric placeholder under "Passes remaining" is a reading
 * with a shelf life — one pass later it is wrong, and it decays with nobody touching anything.
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
  const override = item.timingOverride;
  /*
    `loops` is the TEMPLATE's bit, not `mode === 'loop-cycle'`: the row's mode is the root's,
    and the scope that repeats is often a nested instance below it. Deriving it from `mode`
    would hide the pass controls on exactly the templates that loop.
  */
  const loops = playout.loops === true;

  const send = (patch: { passes?: number | 'infinite'; delayMs?: number }): void => {
    setBusy(true);
    void window.cg.stack
      .setPassTiming({ itemId: item.itemId, ...patch })
      .then(
        (res) => {
          // A refusal is PERSISTENT, not a toast (DELTA R), and the display is not touched: the
          // control renders from the row's published value, which the bridge writes only on
          // acceptance.
          if (!res.ok) {
            reportCommandError(res.message ?? 'The timing change was not accepted.');
            return;
          }
          if (patch.passes !== undefined) recordSentPasses(item.itemId);
        },
        (err: unknown) => {
          reportCommandError(err instanceof Error ? err.message : 'The timing change failed.');
        },
      )
      .finally(() => setBusy(false));
  };

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

/** `∞` for infinite, else the number. The ONE spelling, so two rows cannot disagree. */
const passesWord = (v: number | 'infinite'): string => (v === 'infinite' ? '∞' : String(v));

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
    🔴 `DELTA B3` — THE HOUSE PRIMITIVE, WITH NO `style` PROP.

    These were raw `<input className="cg-input" style={…}>`, and the inline style is why they
    did not match POSITION's `dx`/`dy` and why the gap box read as disabled. `NumericInput` is
    what POSITION uses; it also carries the `INSPECTOR-DELTA` §1 guard that makes `disabled` a
    BEHAVIOUR rather than a rendering, which a raw input does not.

    ⚠ The value is held locally so typing survives a re-render. `DELTA B4` moves it into the
    draft store, where Update / Discard own it.
  */
  const [typed, setTyped] = useState('');
  const inherited = authored ?? 'infinite';
  const shown = override ?? inherited;
  const label = onAir ? 'Passes remaining' : 'Passes next take';
  const sentAtLabel = lastSentPasses(itemId);
  const sentLine =
    override === undefined
      ? 'Nothing sent'
      : `Sent ${passesWord(override)} more${sentAtLabel === undefined ? '' : ` · ${sentAtLabel}`}`;

  const commit = (): void => {
    const raw = typed.trim();
    setTyped('');
    if (raw === '') return;
    const parsed = parsePasses(raw);
    if (parsed === undefined) {
      // 🔴 REFUSED WITH A REASON — never silently rewritten. `0` is an instruction and reaches
      // the bridge; what is refused is text that is not a count. One clause (`DELTA B2`).
      reportCommandError(`"${raw}" is not a pass count.`);
      return;
    }
    onCommit(parsed);
  };

  return (
    <div style={styles.stack}>
      <span style={styles.label}>{label}</span>
      <div style={styles.inline}>
        <NumericInput
          value={typed}
          onValueChange={setTyped}
          aria-label={label}
          disabled={busy}
          // ON AIR: no number — the console cannot see the page's counter. OFF AIR: the stored
          // count, naming what it inherits when the operator has set nothing.
          placeholder={
            onAir
              ? ''
              : override === undefined
                ? `Default (${passesWord(inherited)})`
                : passesWord(shown)
          }
          {...(busy ? { title: 'Sending…' } : {})}
          onBlur={commit}
        />
        <Button
          variant="ghost"
          disabled={busy}
          title="Keep looping until stop"
          onClick={() => {
            setTyped('');
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
    </div>
  );
}

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
  const [typed, setTyped] = useState('');
  const inheritedMs = authored ?? 0;
  const shownMs = override ?? inheritedMs;
  const secs = (ms: number): string => `${String(Math.round(ms / 100) / 10)} s`;

  return (
    <div style={styles.stack}>
      <span style={styles.label}>Gap between passes</span>
      <NumericInput
        value={typed}
        onValueChange={setTyped}
        decimal
        aria-label="Gap between passes"
        disabled={busy}
        placeholder={override === undefined ? `Default (${secs(inheritedMs)})` : secs(shownMs)}
        {...(busy ? { title: 'Sending…' } : {})}
        onBlur={() => {
          const raw = typed.trim();
          setTyped('');
          if (raw === '') return;
          const n = Number(raw);
          // `0` is legal and means no gap, so it is NOT refused here.
          if (!Number.isFinite(n) || n < 0) {
            reportCommandError(`"${raw}" is not a gap in seconds.`);
            return;
          }
          onCommit(Math.round(n * 1000));
        }}
      />
    </div>
  );
}

/**
 * `DELTA A2` — when this browser last sent a pass count, as a local clock time.
 *
 * Browser-local and deliberately not persisted: the console is stating something it did itself,
 * and the only honest source for "when" is the moment it happened here. A count set from another
 * console has no time this browser can know, so the line omits it rather than timing a
 * republish — which would time the RECONCILE, not the operator's action.
 */
const sentAt = new Map<string, string>();

function recordSentPasses(itemId: string): void {
  sentAt.set(itemId, new Date().toLocaleTimeString());
}

function lastSentPasses(itemId: string): string | undefined {
  return sentAt.get(itemId);
}

/**
 * Text → a pass count, or `undefined` for "not a count".
 *
 * ⚠ `0` returns `0`, not `undefined`: it is the instruction "out after this pass". Reading it as
 * absent is the silent-clamp failure this tree has paid for twice.
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
  hint: { color: colors.textMuted, fontSize: '0.66rem', lineHeight: 1.4, margin: '0.15rem 0 0' },
} as const satisfies Record<string, React.CSSProperties>;
