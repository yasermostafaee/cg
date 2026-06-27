import type { CSSProperties } from 'react';
import {
  activeRangeOf,
  playoutOf,
  type Element,
  type HoldSource,
  type PlayoutMode,
  type Scene,
} from '@cg/shared-schema';
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
};

const HOLD_LABELS: Record<HoldSource, string> = {
  timed: 'Timed — hold for a duration',
  'content-driven':
    'Content-driven — until the content completes (ticker passes / countdown / sequence passes)',
};

/**
 * Does this composition contain a content source — a ticker, a countdown
 * clock (D-027), or a sequence (D-029)? Wall/countup clocks are NOT content
 * sources: they never complete, so they can't end a hold. Tickers and
 * sequences count regardless of their authored `repeat` (an infinite one
 * holds until stop — still a meaningful content-driven authoring choice).
 */
function hasContentElement(scene: Scene): boolean {
  // D-104 — a nested composition instance participates in the parent's
  // content-driven hold, so resolve the referenced composition's layers and
  // check THEM too (cycle-guarded by a visited set), exactly as we recurse into
  // a container. So the hold control is offered for a parent whose only finite
  // content lives inside a nested composition.
  const visited = new Set<string>();
  const walk = (children: readonly Element[]): boolean =>
    children.some((el) => {
      if (
        el.type === 'ticker' ||
        el.type === 'sequence' ||
        (el.type === 'clock' && el.mode === 'countdown')
      ) {
        return true;
      }
      if (el.type === 'container') return walk(el.children);
      if (el.type === 'composition') {
        if (visited.has(el.compositionId)) return false;
        visited.add(el.compositionId);
        const comp = scene.compositions?.find((c) => c.id === el.compositionId);
        return comp !== undefined && comp.layers.some((l) => walk(l.children));
      }
      return false;
    });
  return scene.layers.some((l) => walk(l.children));
}

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
  // D-028/D-027 — the Hold-source select only exists when the composition
  // actually contains a content source (a ticker or a countdown clock): a
  // dead control teaches nothing (same principle as Next disabled at steps=1).
  const hasContent = hasContentElement(scene);

  /** Default out-point at 75 % of the active region (leaves room for the exit). */
  function defaultMarker(): { outPoint: number } {
    const r = activeRangeOf(scene);
    const span = Math.max(1, r.out - r.in);
    return { outPoint: r.in + Math.round(span * 0.75) };
  }

  function changeMode(next: PlayoutMode): void {
    // `auto-out` / `loop-cycle` need an out-point (an exit segment) — seed a
    // sensible one so the mode does something out of the box (the operator
    // then drags it).
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

      {hasContent && mode !== 'manual' && (
        <div className={s.row}>
          <span className={s.label}>hold</span>
          <Select
            style={selectStyle}
            value={playout.holdSource ?? 'timed'}
            aria-label="Hold source"
            onChange={(e) => designerStore.setPlayout({ holdSource: e.target.value as HoldSource })}
          >
            {(Object.keys(HOLD_LABELS) as HoldSource[]).map((h) => (
              <option key={h} value={h}>
                {HOLD_LABELS[h]}
              </option>
            ))}
          </Select>
        </div>
      )}

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
