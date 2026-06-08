import type { CSSProperties } from 'react';
import { activeRangeOf, playoutOf, type PlayoutMode, type Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { designerStore } from '../../state/store.js';
import { CollapseSection } from './CollapseSection.js';
import { RealtimeNumberInput } from './controls.js';
import * as s from './InspectorPanel.css.js';

const MODE_LABELS: Record<PlayoutMode, string> = {
  manual: 'Manual — hold until stop',
  'auto-out': 'Auto-out — outro after hold',
  'loop-cycle': 'Loop cycle — repeat in → hold → out',
  'content-driven': 'Content-driven — duration from content',
};

const selectStyle: CSSProperties = {
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.18rem',
  padding: '0.14rem 0.3rem',
  fontSize: '0.72rem',
  width: '100%',
  boxSizing: 'border-box',
};

const numStyle: CSSProperties = {
  background: colors.panelMuted,
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '0.18rem',
  padding: '0.1rem 0.35rem',
  fontSize: '0.72rem',
  width: 76,
  fontVariantNumeric: 'tabular-nums',
  boxSizing: 'border-box',
};

const mutedStyle: CSSProperties = { color: colors.textMuted, fontSize: '0.66rem' };
const hintStyle: CSSProperties = { ...mutedStyle, lineHeight: 1.4, margin: '0.35rem 0 0' };
const linkBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: colors.accent,
  cursor: 'pointer',
  fontSize: '0.66rem',
  padding: 0,
  textDecoration: 'underline',
};

/**
 * D-020 — no-code "Playout / Timing" inspector section. Picks the composition's
 * playout `mode` and the `holdMs` / `repeat` it needs, all wired to
 * `designerStore.setPlayout`. The IN / HOLD / OUT phase markers themselves are
 * dragged on the timeline (this section just reports them).
 */
export function PlayoutTimingSection({ scene }: { scene: Scene }): JSX.Element {
  const playout = playoutOf(scene);
  const mode = playout.mode;
  const showHold = mode === 'auto-out' || mode === 'loop-cycle' || mode === 'content-driven';
  const showRepeat = mode === 'loop-cycle';
  const repeatInfinite = playout.repeat === 'infinite';
  const lifecycle = scene.lifecycle;

  /** Default phase markers at 25 % / 75 % of the active region. */
  function defaultMarkers(): { introEndFrame: number; outroStartFrame: number } {
    const r = activeRangeOf(scene);
    const span = Math.max(1, r.out - r.in);
    return {
      introEndFrame: r.in + Math.round(span * 0.25),
      outroStartFrame: r.in + Math.round(span * 0.75),
    };
  }

  function changeMode(next: PlayoutMode): void {
    // The in → hold → out modes need phase markers — seed sensible ones so the
    // mode does something out of the box (the operator then drags them).
    if (next !== 'manual' && lifecycle === undefined) {
      designerStore.setLifecycle(defaultMarkers());
    }
    designerStore.setPlayout({ mode: next });
  }

  return (
    <CollapseSection title="Playout / Timing" defaultExpanded>
      <div className={s.row}>
        <span className={s.label}>mode</span>
        <select
          style={selectStyle}
          value={mode}
          aria-label="Playout mode"
          onChange={(e) => changeMode(e.target.value as PlayoutMode)}
        >
          {(Object.keys(MODE_LABELS) as PlayoutMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      {showHold && mode !== 'content-driven' && (
        <div className={s.row}>
          <span className={s.label}>hold</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <RealtimeNumberInput
              style={numStyle}
              min={0}
              step={100}
              value={playout.holdMs ?? 0}
              onCommit={(n) => designerStore.setPlayout({ holdMs: Math.max(0, Math.round(n)) })}
              ariaLabel="Hold duration in milliseconds"
            />
            <span style={mutedStyle}>ms</span>
          </div>
        </div>
      )}

      {showRepeat && (
        <div className={s.row}>
          <span className={s.label}>repeat</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {repeatInfinite ? (
              <span style={mutedStyle}>∞ until stop</span>
            ) : (
              <RealtimeNumberInput
                style={numStyle}
                min={1}
                step={1}
                value={typeof playout.repeat === 'number' ? playout.repeat : 1}
                onCommit={(n) => designerStore.setPlayout({ repeat: Math.max(1, Math.round(n)) })}
                ariaLabel="Repeat count"
              />
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', ...mutedStyle }}>
              <input
                type="checkbox"
                checked={repeatInfinite}
                onChange={(e) =>
                  designerStore.setPlayout({ repeat: e.target.checked ? 'infinite' : 1 })
                }
              />
              infinite
            </label>
          </div>
        </div>
      )}

      {lifecycle !== undefined ? (
        <p style={hintStyle}>
          Intro ends @ frame {String(lifecycle.introEndFrame)} · outro starts @{' '}
          {String(lifecycle.outroStartFrame)} — drag the markers on the timeline.{' '}
          <button
            type="button"
            style={linkBtnStyle}
            onClick={() => designerStore.setLifecycle(null)}
          >
            Clear
          </button>
        </p>
      ) : (
        <p style={hintStyle}>
          No phase markers yet.{' '}
          <button
            type="button"
            style={linkBtnStyle}
            onClick={() => designerStore.setLifecycle(defaultMarkers())}
          >
            Add phase markers
          </button>{' '}
          to enable in → hold → out, then drag them on the timeline.
        </p>
      )}
    </CollapseSection>
  );
}
