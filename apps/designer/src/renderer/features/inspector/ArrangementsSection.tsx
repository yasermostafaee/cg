import {
  arrangementCount,
  type Arrangement,
  type ArrangementEasing,
  type ArrangementTransition,
  type Scene,
} from '@cg/shared-schema';
import { Star, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { activeArrangements } from '../../state/slices/arrangements.js';
import { CollapseSection } from './CollapseSection.js';
import { NumberField, SelectField, TextField } from './controls.js';
import * as s from './InspectorPanel.css.js';
import * as cls from './ArrangementsSection.css.js';

/**
 * ⭐ **`multibox-layout-switch` C2 (`tasks.md` 5.3 / 5.4) — the ARRANGEMENTS section.**
 *
 * Sits in the RIGHT PANEL beside Playout, because an arrangement is a property of the
 * COMPOSITION — the thing that becomes the `.vcg` on one layer. The ACTIVE-arrangement
 * selector deliberately does NOT live here: this panel switches to element properties the
 * moment the author selects an element, so a selector here would vanish exactly when it is
 * being used. It lives in the canvas toolbar instead (`CanvasToolbar`).
 *
 * ── 🔴 THERE IS NO COUNT FIELD, AND THERE MUST NEVER BE ONE ─────────────────
 *
 * The count IS `cells.length`. Every count shown below is computed at the point of display
 * through `arrangementCount`, never stored and never cached in component state. A count
 * input would let the stored number and the cell list disagree, and the disagreement is
 * invisible until air.
 *
 * ── WHAT "not every count needs an arrangement" LOOKS LIKE HERE ─────────────
 *
 * §12.9.1 Q4: a template need not author every count. So this list is exactly what the
 * author made — there are no placeholder rows for counts they have not authored, and the
 * summary line says which counts DO exist rather than implying a full set. Reaching an
 * unauthored count is a runtime refusal, not an authoring error.
 */
export function ArrangementsSection({ scene }: { scene: Scene }): JSX.Element {
  const activeId = useDesignerSelector((st) => st.activeArrangementId);
  const arrangements = activeArrangements(scene);

  const counts = [...new Set(arrangements.map(arrangementCount))].sort((a, b) => a - b);

  return (
    <CollapseSection title="Arrangements" defaultExpanded={arrangements.length > 0}>
      {arrangements.length === 0 ? (
        <p className={cls.empty}>
          No arrangements. This composition plays as authored — add one to give a box count its own
          geometry.
        </p>
      ) : (
        <p className={cls.summary}>
          {/* Computed here, at the point of display. Never stored. */}
          {arrangements.length} arrangement{arrangements.length === 1 ? '' : 's'} for{' '}
          {counts.length === 1 ? 'the' : ''} {counts.map((c) => `${String(c)}-box`).join(', ')}{' '}
          count
          {counts.length === 1 ? '' : 's'}. Counts with no arrangement are refused at play time, not
          here.
        </p>
      )}

      {arrangements.map((a) => (
        <ArrangementRow key={a.id} arrangement={a} active={a.id === activeId} />
      ))}

      <div className={cls.addRow}>
        {[1, 2, 3, 4].map((n) => (
          <Button
            key={n}
            variant="secondary"
            onClick={() => designerStore.addArrangement(n)}
            title={`Add a ${String(n)}-box arrangement`}
          >
            + {n}-box
          </Button>
        ))}
      </div>
      <p className={cls.hint}>
        A new arrangement starts on an even grid — that is a starting point to drag, not a computed
        layout. Where a box sits is a design decision.
      </p>
    </CollapseSection>
  );
}

const MODES = ['cut', 'fade', 'move'] as const;
const MODE_LABELS = [
  'Cut — no transition (free)',
  'Fade — the mask dissolves (cheapest)',
  'Move — the boxes travel (linear only)',
] as const;

const EASINGS: readonly ArrangementEasing[] = [
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
];

function ArrangementRow({
  arrangement,
  active,
}: {
  arrangement: Arrangement;
  active: boolean;
}): JSX.Element {
  const count = arrangementCount(arrangement);
  const t = arrangement.transition;

  /**
   * Changing the MODE has to produce a WHOLE valid transition, because the schema is a
   * discriminated union: a cut has no duration or easing, and a move's easing can only be
   * `linear` (§12.2 — the one name both tween vocabularies denote the same function; a
   * pinned cubic-bezier measured 4–10 px out, `linear` measured 0.0). Carrying the old
   * arm's fields across would build an object the schema refuses.
   */
  const setMode = (mode: (typeof MODES)[number]): void => {
    const durationMs = 'durationMs' in t ? t.durationMs : 400;
    const next: ArrangementTransition =
      mode === 'cut'
        ? { mode: 'cut' }
        : mode === 'move'
          ? { mode: 'move', durationMs, easing: 'linear' }
          : { mode: 'fade', durationMs, easing: 'easing' in t ? t.easing : 'ease-in-out' };
    designerStore.setArrangementTransition(arrangement.id, next);
  };

  return (
    <div className={active ? cls.rowActive : cls.row}>
      <div className={cls.rowHead}>
        <Button
          variant="bare"
          className={cls.pick}
          aria-pressed={active}
          onClick={() => designerStore.setActiveArrangement(active ? null : arrangement.id)}
          title={active ? 'Stop showing this arrangement' : 'Show this arrangement on the canvas'}
        >
          {/* The count is read off the cells every render — the two cannot drift. */}
          <span className={cls.badge}>{count}-box</span>
          <span className={cls.name}>{arrangement.name}</span>
        </Button>
        <Button
          variant="bare"
          aria-pressed={arrangement.isDefault}
          disabled={arrangement.isDefault}
          onClick={() => designerStore.setArrangementDefault(arrangement.id)}
          title={
            arrangement.isDefault
              ? `The default for the ${String(count)}-box count`
              : `Make this the default for the ${String(count)}-box count`
          }
        >
          <Icon icon={Star} size={13} />
        </Button>
        <Button
          variant="bare"
          onClick={() => designerStore.removeArrangement(arrangement.id)}
          title="Delete this arrangement"
        >
          <Icon icon={Trash2} size={13} />
        </Button>
      </div>

      {active && (
        <div className={cls.body}>
          <TextField
            label="name"
            value={arrangement.name}
            onCommit={(v) => designerStore.renameArrangement(arrangement.id, v)}
          />

          {/* D2 — the transition the arrangement is ENTERED with. Per-ARRANGEMENT, which is
              a strict SUBSET of the deferred per-pair form: a later change adds a `from`
              dimension to entries that already exist and treats this as that row's default,
              so nothing built here has to be torn out. */}
          <SelectField
            label="entered with"
            value={t.mode}
            options={MODES}
            labels={MODE_LABELS}
            onCommit={setMode}
          />
          {t.mode !== 'cut' && (
            <>
              <NumberField
                label="duration"
                value={t.durationMs}
                min={1}
                max={10_000}
                step={50}
                onCommit={(v) =>
                  designerStore.setArrangementTransition(
                    arrangement.id,
                    t.mode === 'move'
                      ? { mode: 'move', durationMs: v, easing: 'linear' }
                      : { mode: 'fade', durationMs: v, easing: t.easing },
                  )
                }
              />
              {t.mode === 'fade' ? (
                <SelectField
                  label="easing"
                  value={t.easing}
                  options={EASINGS}
                  onCommit={(v) =>
                    designerStore.setArrangementTransition(arrangement.id, {
                      mode: 'fade',
                      durationMs: t.durationMs,
                      easing: v,
                    })
                  }
                />
              ) : (
                <p className={cls.hint}>
                  A move is always <code>linear</code>. It is the only easing whose CSS and CasparCG
                  spellings mean the same curve — anything else drifts the picture off its hole
                  while it travels.
                </p>
              )}
            </>
          )}

          <h4 className={cls.cellsHead}>cells</h4>
          {arrangement.cells.length === 0 ? (
            <p className={cls.hint}>
              No cells — this is the 0-box arrangement: the background alone, which is a real on-air
              state.
            </p>
          ) : (
            arrangement.cells.map((c, i) => (
              <div key={i} className={cls.cell}>
                <span className={s.label}>cell {i + 1}</span>
                <div className={cls.cellFields}>
                  {(['x', 'y', 'width', 'height'] as const).map((k) => (
                    <NumberField
                      key={k}
                      label={k}
                      value={c[k]}
                      step={1}
                      onCommit={(v) =>
                        designerStore.setArrangementCell(arrangement.id, i, { ...c, [k]: v })
                      }
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
