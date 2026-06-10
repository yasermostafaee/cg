import type { CSSProperties } from 'react';
import { activeRangeOf, playoutOf, type PlayoutMode, type Scene } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { Select } from '../../ui/Select.js';
import { designerStore } from '../../state/store.js';
import { CollapseSection } from './CollapseSection.js';
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
 * D-020 — no-code "Playout" inspector section. Picks the composition's playout
 * `mode` (the design-time decision: what kind of template this is), wired to
 * `designerStore.setPlayout`. The single `outPoint` marker is dragged on the
 * timeline (this section just reports it). `holdMs` / `repeat` are NOT here —
 * they are playout-time / operator decisions and live in the preview modal as a
 * session-only override (and at the control surface later).
 */
export function PlayoutSection({ scene }: { scene: Scene }): JSX.Element {
  const playout = playoutOf(scene);
  const mode = playout.mode;
  const lifecycle = scene.lifecycle;

  /** Default out-point at 75 % of the active region (leaves room for the exit). */
  function defaultMarker(): { outPoint: number } {
    const r = activeRangeOf(scene);
    const span = Math.max(1, r.out - r.in);
    return { outPoint: r.in + Math.round(span * 0.75) };
  }

  function changeMode(next: PlayoutMode): void {
    // `auto-out` / `loop-cycle` need an out-point (an exit segment) — seed a
    // sensible one so the mode does something out of the box (the operator then
    // drags it). `content-driven` runs `repeat` passes off the duration hook and
    // does not require an out-point, so it is left alone.
    if ((next === 'auto-out' || next === 'loop-cycle') && lifecycle === undefined) {
      designerStore.setLifecycle(defaultMarker());
    }
    designerStore.setPlayout({ mode: next });
  }

  return (
    <CollapseSection title="Playout" defaultExpanded>
      <div className={s.row}>
        <span className={s.label}>mode</span>
        <Select
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
        </Select>
      </div>

      {lifecycle !== undefined ? (
        <p style={hintStyle}>
          Out point @ frame {String(lifecycle.outPoint)} — drag the marker on the timeline. Hold /
          repeat are tuned live in the preview.{' '}
          <Button
            variant="bare"
            style={linkBtnStyle}
            onClick={() => designerStore.setLifecycle(null)}
          >
            Clear
          </Button>
        </p>
      ) : (
        <p style={hintStyle}>
          No out point yet.{' '}
          <Button
            variant="bare"
            style={linkBtnStyle}
            onClick={() => designerStore.setLifecycle(defaultMarker())}
          >
            Add an out point
          </Button>{' '}
          to enable in → hold → out, then drag it on the timeline.
        </p>
      )}
    </CollapseSection>
  );
}
