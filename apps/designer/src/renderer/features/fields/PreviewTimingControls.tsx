import {
  playoutOf,
  type HoldSource,
  type Lifecycle,
  type Playout,
  type PlayoutMode,
} from '@cg/shared-schema';
import { Callout } from '../../ui/Callout.js';
import { Select } from '../../ui/Select.js';
import { CollapseSection } from '../inspector/CollapseSection.js';
import { RealtimeNumberInput } from '../inspector/controls.js';
import * as s from '../inspector/InspectorPanel.css.js';
import * as t from './PreviewTimingControls.css.js';

/** The lifecycle-relevant fields of the scope a timing control edits. */
export interface TimingSource {
  playout?: Playout | undefined;
  lifecycle?: Lifecycle | undefined;
}

/** Modes that are worth timing in the preview (have an outro / repeat to tune). */
export const TIMING_RELEVANT_MODES: ReadonlySet<PlayoutMode> = new Set<PlayoutMode>([
  'auto-out',
  'loop-cycle',
]);

/** The effective playout mode of a scope: its override, else its stored default. */
export function effectiveMode(source: TimingSource, override: TimingOverride): PlayoutMode {
  return override.mode ?? playoutOf(source).mode;
}

/**
 * D-020/D-028 — a session-only playout override. Held by the preview modal,
 * applied by rebuilding the preview runtime (`playoutOverride`/`scopeOverrides`),
 * and never written back to the stored template. Two orthogonal axes: `mode`
 * (open/close cycles) and `holdSource` (timed `holdMs` vs. the scope's tickers
 * completing); `tickerRepeat`/`tickerBoundary` override every ticker in the
 * scope. There is no continuous-loop toggle: a looping playout is `loop-cycle`
 * with `repeat: ∞`; an endlessly crawling ticker is `tickerRepeat: ∞`.
 */
export interface TimingOverride {
  mode?: PlayoutMode;
  holdSource?: HoldSource;
  holdMs?: number;
  repeat?: number | 'infinite';
  tickerRepeat?: number | 'infinite';
  tickerBoundary?: 'seamless' | 'drain';
}

/** D-028 — a scope's first ticker's AUTHORED repeat/boundary (resting values). */
export interface TickerTimingDefaults {
  repeat: number | 'infinite';
  boundary: 'seamless' | 'drain';
}

const MODE_LABELS: Record<PlayoutMode, string> = {
  manual: 'Manual — hold until stop',
  'auto-out': 'Auto-out — outro after hold',
  'loop-cycle': 'Loop cycle — repeat in → hold → out',
};

const HOLD_LABELS: Record<HoldSource, string> = {
  timed: 'Timed — hold for a duration',
  'content-driven':
    'Content-driven — until the content completes (ticker passes / countdown / sequence passes)',
};

/** Modes that need an explicit out-point to mean anything (an exit segment). */
const NEEDS_OUTPOINT: ReadonlySet<PlayoutMode> = new Set<PlayoutMode>(['auto-out', 'loop-cycle']);

/**
 * D-020/D-028 — live playout override for the preview modal, bound to the
 * composition's **effective** playout (stored defaults + the current session
 * override) so it re-syncs whenever the composition changes (out-point added or
 * removed, stored mode changed). Tuning here is **session-only**: it never
 * changes the template's stored defaults. With no out-point the entrance is the
 * whole timeline and the default is play-once-and-hold; `auto-out` / `loop-cycle`
 * are disabled because they have no exit segment to run. The Hold-source and
 * ticker rows only render when the scope actually contains a ticker (a dead
 * control teaches nothing). Authoritative live control belongs to the rundown.
 */
export function PreviewTimingControls({
  source,
  title = 'Timing (session)',
  defaultExpanded = true,
  showFooter = true,
  hasTicker = false,
  hasContent = hasTicker,
  tickerDefaults = null,
  override,
  onChange,
}: {
  source: TimingSource;
  /** Section header — the scope's label (e.g. the composition or instance name). */
  title?: string;
  defaultExpanded?: boolean;
  /** Show the "session only" footnote (once is enough when many scopes stack). */
  showFooter?: boolean;
  /** D-028 — whether this scope contains ticker elements (gates the ticker rows). */
  hasTicker?: boolean;
  /**
   * D-027 — whether this scope contains ANY content source (ticker or
   * countdown clock); gates the hold-source select. Defaults to `hasTicker`.
   */
  hasContent?: boolean;
  /** D-028 — the scope's authored ticker repeat/boundary (resting values). */
  tickerDefaults?: TickerTimingDefaults | null;
  override: TimingOverride;
  onChange: (patch: TimingOverride) => void;
}): JSX.Element {
  const stored = playoutOf(source);
  const hasOutPoint = source.lifecycle !== undefined;
  const mode = override.mode ?? stored.mode;
  const holdSource = override.holdSource ?? stored.holdSource ?? 'timed';
  const holdMs = override.holdMs ?? stored.holdMs ?? 0;
  const repeat = override.repeat ?? stored.repeat;
  const repeatInfinite = repeat === 'infinite';
  const tickerRepeat = override.tickerRepeat ?? tickerDefaults?.repeat ?? 'infinite';
  const tickerRepeatInfinite = tickerRepeat === 'infinite';
  const tickerBoundary = override.tickerBoundary ?? tickerDefaults?.boundary ?? 'seamless';

  // `auto-out` / `loop-cycle` only do something with an explicit out-point;
  // the timed hold input is moot when the hold is content-driven.
  const timedHold = !hasContent || holdSource === 'timed';
  const showHold = hasOutPoint && timedHold && (mode === 'auto-out' || mode === 'loop-cycle');
  // `loop-cycle` repeats the full open/close cycle (needs an out-point).
  const showRepeat = mode === 'loop-cycle' && hasOutPoint;

  return (
    <CollapseSection title={title} defaultExpanded={defaultExpanded}>
      {hasOutPoint ? (
        <p className={t.hint}>
          Out point @ frame {String(source.lifecycle?.outPoint)} (set on the timeline).
        </p>
      ) : (
        <Callout variant="info" className={t.notice}>
          No out-point set — the whole timeline is the entrance and it holds the last frame. Add an
          out-point on the timeline to enable auto-out / loop-cycle.
        </Callout>
      )}

      <div className={s.row}>
        <span className={s.label}>mode</span>
        <Select
          className={t.select}
          value={mode}
          aria-label="Preview playout mode"
          onChange={(e) => onChange({ mode: e.target.value as PlayoutMode })}
        >
          {(Object.keys(MODE_LABELS) as PlayoutMode[]).map((m) => (
            <option key={m} value={m} disabled={!hasOutPoint && NEEDS_OUTPOINT.has(m)}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </Select>
      </div>

      {hasContent && mode !== 'manual' && (
        <div className={s.row}>
          <span className={s.label}>hold</span>
          <Select
            className={t.select}
            value={holdSource}
            aria-label="Preview hold source"
            onChange={(e) => onChange({ holdSource: e.target.value as HoldSource })}
          >
            {(Object.keys(HOLD_LABELS) as HoldSource[]).map((h) => (
              <option key={h} value={h}>
                {HOLD_LABELS[h]}
              </option>
            ))}
          </Select>
        </div>
      )}

      {showHold && (
        <div className={s.row}>
          <span className={s.label}>hold</span>
          <div className={t.inline}>
            <RealtimeNumberInput
              className={t.num}
              min={0}
              step={100}
              value={holdMs}
              onCommit={(n) => onChange({ holdMs: Math.max(0, Math.round(n)) })}
              ariaLabel="Preview hold duration in milliseconds"
            />
            <span className={t.muted}>ms</span>
          </div>
        </div>
      )}

      {showRepeat && (
        <div className={s.row}>
          <span className={s.label}>repeat</span>
          <div className={t.repeatControls}>
            {repeatInfinite ? (
              <span className={t.muted}>∞ until stop</span>
            ) : (
              <RealtimeNumberInput
                className={t.num}
                min={1}
                step={1}
                value={typeof repeat === 'number' ? repeat : 1}
                onCommit={(n) => onChange({ repeat: Math.max(1, Math.round(n)) })}
                ariaLabel="Preview repeat count"
              />
            )}
            <label className={t.checkLabel}>
              <input
                type="checkbox"
                checked={repeatInfinite}
                onChange={(e) => onChange({ repeat: e.target.checked ? 'infinite' : 1 })}
              />
              infinite
            </label>
          </div>
        </div>
      )}

      {hasTicker && (
        <>
          <div className={s.row}>
            <span className={s.label}>ticker passes</span>
            <div className={t.repeatControls}>
              {tickerRepeatInfinite ? (
                <span className={t.muted}>∞ until stop</span>
              ) : (
                <RealtimeNumberInput
                  className={t.num}
                  min={1}
                  step={1}
                  value={typeof tickerRepeat === 'number' ? tickerRepeat : 1}
                  onCommit={(n) => onChange({ tickerRepeat: Math.max(1, Math.round(n)) })}
                  ariaLabel="Preview ticker repeat count"
                />
              )}
              <label className={t.checkLabel}>
                <input
                  type="checkbox"
                  checked={tickerRepeatInfinite}
                  onChange={(e) => onChange({ tickerRepeat: e.target.checked ? 'infinite' : 1 })}
                />
                infinite
              </label>
            </div>
          </div>
          <div className={s.row}>
            <span className={s.label}>cycle seam</span>
            <Select
              className={t.select}
              value={tickerBoundary}
              aria-label="Preview ticker cycle boundary"
              onChange={(e) => onChange({ tickerBoundary: e.target.value as 'seamless' | 'drain' })}
            >
              <option value="seamless">Seamless — first follows last</option>
              <option value="drain">Drain — empty band between passes</option>
            </Select>
          </div>
        </>
      )}

      {showFooter && (
        <p className={t.hint}>
          Session only — these test the playout and do not change the template&apos;s stored
          defaults. Authoritative live control belongs to the rundown.
        </p>
      )}
    </CollapseSection>
  );
}
