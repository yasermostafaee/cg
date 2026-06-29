import { type ReactNode } from 'react';
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
 * D-102 Phase 1 — a single ticker's session-only timing override (its own `repeat` /
 * `cycleBoundary`), addressed by the ticker's element id within {@link TimingOverride.tickers}.
 */
export interface TickerTimingOverride {
  repeat?: number | 'infinite';
  cycleBoundary?: 'seamless' | 'drain';
}

/**
 * D-020/D-028 — a session-only playout override. Held by the preview modal,
 * applied by rebuilding the preview runtime (`playoutOverride`/`scopeOverrides`),
 * and never written back to the stored template. Per-scope LIFECYCLE axes: `mode`
 * (open/close cycles), `holdSource` (timed `holdMs` vs. content completing), and
 * `repeat`. D-102 Phase 1 — ticker timing is PER-ELEMENT: `tickers` maps a ticker's
 * element id to its own `repeat`/`cycleBoundary`, so two tickers in one scope are
 * tuned independently.
 */
export interface TimingOverride {
  mode?: PlayoutMode;
  holdSource?: HoldSource;
  holdMs?: number;
  repeat?: number | 'infinite';
  tickers?: Record<string, TickerTimingOverride>;
}

const MODE_LABELS: Record<PlayoutMode, string> = {
  manual: 'Manual — hold until stop',
  'auto-out': 'Auto-out — outro after hold',
  'loop-cycle': 'Loop cycle — repeat in → hold → out',
  // D-114 — the no-out-point mode (the preview reflects it; it's resolved by `playoutOf`).
  static: 'Static — plays in, holds, cut on stop',
};

const HOLD_LABELS: Record<HoldSource, string> = {
  timed: 'Timed — hold for a duration',
  'content-driven':
    'Content-driven — until the content completes (ticker passes / countdown / sequence passes)',
};

/**
 * D-020/D-028 — live playout override for the preview modal, bound to the
 * composition's **effective** playout (stored defaults + the current session
 * override) so it re-syncs whenever the composition changes (out-point added or
 * removed, stored mode changed). Tuning here is **session-only**: it never
 * changes the template's stored defaults. With no out-point the entrance is the
 * whole timeline and the default is play-once-and-hold; `auto-out` / `loop-cycle`
 * are disabled because they have no exit segment to run. The Hold-source select
 * renders only when the scope contains a content source (a dead control teaches
 * nothing); D-102 Phase 1 — per-ticker timing rows are rendered separately by
 * `PreviewScopeTiming`, one per ticker. Authoritative live control belongs to the rundown.
 */
export function PreviewTimingControls({
  source,
  title = 'Timing (session)',
  defaultExpanded = true,
  showFooter = true,
  hasContent = false,
  override,
  onChange,
  children,
}: {
  source: TimingSource;
  /** Section header — the scope's label (e.g. the composition or instance name). */
  title?: string;
  defaultExpanded?: boolean;
  /** Show the "session only" footnote (once is enough when many scopes stack). */
  showFooter?: boolean;
  /**
   * D-027/D-028 — whether this scope contains ANY content source (ticker / countdown clock /
   * sequence); gates the hold-source select.
   */
  hasContent?: boolean;
  override: TimingOverride;
  onChange: (patch: TimingOverride) => void;
  /** D-102 Phase 1 — per-ticker timing rows, nested INSIDE this scope's section, below its lifecycle. */
  children?: ReactNode;
}): JSX.Element {
  const stored = playoutOf(source);
  const hasOutPoint = source.lifecycle !== undefined;
  const mode = override.mode ?? stored.mode;
  const holdSource = override.holdSource ?? stored.holdSource ?? 'timed';
  const holdMs = override.holdMs ?? stored.holdMs ?? 0;
  const repeat = override.repeat ?? stored.repeat;
  const repeatInfinite = repeat === 'infinite';

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
            // D-114 — match the composition inspector: with no out-point only `static` is selectable
            // (manual / auto-out / loop-cycle are disabled); with one, `static` is disabled. Keeps the
            // preview and the main scene properties from getting mixed up.
            <option key={m} value={m} disabled={hasOutPoint ? m === 'static' : m !== 'static'}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </Select>
      </div>

      {hasContent && mode !== 'manual' && mode !== 'static' && (
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

      {/* D-102 Phase 1 — per-ticker timing rows nest here, below the scope's lifecycle controls. */}
      {children}

      {showFooter && (
        <p className={t.hint}>
          Session only — these test the playout and do not change the template&apos;s stored
          defaults. Authoritative live control belongs to the rundown.
        </p>
      )}
    </CollapseSection>
  );
}

/**
 * D-102 Phase 1 — one ticker's session-only timing row (repeat + cycle-seam), addressed by the
 * ticker's element id. Rendered by `PreviewScopeTiming` under its scope, ONE row per ticker, so
 * two tickers in a scope are tuned independently. `defaults` are the element's authored resting
 * values; the patch carries only what the operator changed. The `name` disambiguates the controls
 * (label + aria-label) so each ticker's row is individually addressable.
 */
export function PreviewTickerTimingRow({
  name,
  defaults,
  override,
  onChange,
}: {
  name: string;
  defaults: { repeat: number | 'infinite'; cycleBoundary: 'seamless' | 'drain' };
  override: TickerTimingOverride;
  onChange: (patch: TickerTimingOverride) => void;
}): JSX.Element {
  const repeat = override.repeat ?? defaults.repeat;
  const repeatInfinite = repeat === 'infinite';
  const boundary = override.cycleBoundary ?? defaults.cycleBoundary;
  return (
    <>
      <div className={s.row}>
        <span className={s.label}>{name} — passes</span>
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
              ariaLabel={`Preview ${name} ticker repeat count`}
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
      <div className={s.row}>
        <span className={s.label}>{name} — cycle seam</span>
        <Select
          className={t.select}
          value={boundary}
          aria-label={`Preview ${name} ticker cycle boundary`}
          onChange={(e) => onChange({ cycleBoundary: e.target.value as 'seamless' | 'drain' })}
        >
          <option value="seamless">Seamless — first follows last</option>
          <option value="drain">Drain — empty band between passes</option>
        </Select>
      </div>
    </>
  );
}
