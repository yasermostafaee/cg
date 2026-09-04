import {
  arrangementCount,
  type Arrangement,
  type Element,
  type ArrangementEasing,
  type ArrangementTransition,
  type Scene,
} from '@cg/shared-schema';
import { Star, Trash2 } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import {
  activeArrangements,
  boxInstanceIds,
  lockedCellEdit,
} from '../../state/slices/arrangements.js';
import { activeLayersOf } from '../../state/scene-doc.js';
import { isAspectLocked } from '../../state/slices/view.js';
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

      {/* 🔴 FIRST, not last. Session AX opened the panel in this state and the guidance was
          scrolled off the top under the cell number fields — present, and unreadable. When
          there are no boxes, nothing else on this panel matters. */}
      {arrangements.length > 0 && boxInstanceIds(scene).length === 0 && <NoBoxesYet />}

      {arrangements.map((a) => (
        <ArrangementRow key={a.id} scene={scene} arrangement={a} active={a.id === activeId} />
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
      <HowBoxesWork />
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
  scene,
  arrangement,
  active,
}: {
  scene: Scene;
  arrangement: Arrangement;
  active: boolean;
}): JSX.Element {
  const count = arrangementCount(arrangement);
  const t = arrangement.transition;
  /**
   * `D-155` §4 / `B-218` — THIS ARRANGEMENT's lock, through the ONE predicate the plate's
   * aspect row and the gizmo also ask (`isAspectLocked`), keyed by the arrangement's id.
   *
   * It used to ride the plate's toggle as a single shared flag ("one value, two surfaces").
   * `B-218` made the lock per plate, so the `CELLS` fields — which constrain a different
   * quantity, a cell's composition RESOLUTION (see `lockedCellEdit`) — need a key of their own
   * and a toggle of their own, beside the cells it governs.
   */
  const aspectLocked = useDesignerSelector((st) => isAspectLocked(st, arrangement.id));

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

          <BoxBinding scene={scene} arrangement={arrangement} />

          <h4 className={cls.cellsHead}>cells</h4>
          {/*
            `B-218` — the CELLS lock, beside the cells it governs. Per ARRANGEMENT, keyed by its
            id in the same session set the plates' locks live in. A width typed here derives the
            height (and vice versa) so the cell keeps its box composition's RESOLUTION aspect —
            see `lockedCellEdit` for why that, and never a plate's `expectedAspect`.
          */}
          {arrangement.cells.length > 0 && (
            <div className={cls.cellLockRow}>
              <span className={s.label}>keep aspect</span>
              <Button
                variant="secondary"
                selected={aspectLocked}
                aria-pressed={aspectLocked}
                data-aspect-lock={aspectLocked ? 'on' : 'off'}
                onClick={() => designerStore.setAspectLock(arrangement.id, !aspectLocked)}
                title={
                  aspectLocked
                    ? 'ON — typing a cell width derives its height (and the reverse), keeping ' +
                      'each cell at its box composition’s resolution aspect. Turn it off to ' +
                      'type both freely.'
                    : 'OFF — a cell’s width and height are typed independently. Turn it on to ' +
                      'keep each cell at its box composition’s resolution aspect.'
                }
                aria-label="Keep cell aspect while editing"
              >
                {aspectLocked ? 'LOCKED' : 'FREE'}
              </Button>
            </div>
          )}
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
                        designerStore.setArrangementCell(
                          arrangement.id,
                          i,
                          // D-155 §4 — the lock derives the OTHER axis, keeping the cell at
                          // its box composition's RESOLUTION aspect (never a plate's
                          // `expectedAspect` — see `lockedCellEdit`). `x`/`y` pass through.
                          lockedCellEdit(scene, i, c, k, v, aspectLocked),
                        )
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

/**
 * ⭐ **`D-153` face 2 — WHICH BOX EACH CELL HOLDS, and which box is hidden.**
 *
 * `arrangementViewOf` fills cell `i` with box instance `i` in document order. That rule was
 * correct and completely invisible: a box with no cell in the active arrangement simply
 * VANISHED from the canvas, which reads as a bug rather than as §12.4's HELD state (the
 * plate stops being on screen while its producer stays seated).
 *
 * ⚠ **A READOUT of the existing order — not a new binding.** Per-cell assignment is
 * deliberately not provided (§12.9.1 Q2): a cell is not a separately addressable identity
 * beside the plate, and an author who wants a different order authors a different order.
 * Nothing here is a control.
 */
function BoxBinding({
  scene,
  arrangement,
}: {
  scene: Scene;
  arrangement: Arrangement;
}): JSX.Element {
  const ids = boxInstanceIds(scene);
  // Same accessor as `boxInstanceIds`, so the names and the ids come from ONE document.
  const byId = new Map<string, Element>();
  for (const layer of activeLayersOf(scene)) for (const el of layer.children) byId.set(el.id, el);

  // The EMPTY state is not rendered from here: it now sits at the top of the section (see
  // `ArrangementsSection`). Buried under four number fields per cell it was scrolled out of
  // view exactly when it was the only thing worth reading — measured by eye, session AX.
  if (ids.length === 0) return <></>;

  return (
    <>
      <h4 className={cls.cellsHead}>boxes</h4>
      {ids.map((id, i) => {
        const held = i < arrangement.cells.length;
        return (
          <p key={id} className={held ? cls.boxRow : cls.boxRowHidden}>
            <span className={cls.boxName}>{byId.get(id)?.name ?? id}</span>
            <span className={held ? cls.boxWhere : cls.boxWhereHidden}>
              {held
                ? `cell ${String(i + 1)}`
                : 'hidden in this arrangement — its source is held, not torn down'}
            </span>
          </p>
        );
      })}
      {arrangement.cells.length > ids.length && (
        <p className={cls.hint}>
          {arrangement.cells.length - ids.length} cell
          {arrangement.cells.length - ids.length === 1 ? '' : 's'} have no box yet.
        </p>
      )}
    </>
  );
}

/**
 * 🔴 **`D-153` face 3 — the EMPTY STATE, which is the screen the owner was actually on.**
 *
 * He had four arrangements and eight cell coordinates and asked _"now what do I do — do I
 * have to add a live source with those coordinates to each layer myself?"_ The panel at that
 * moment explained counts and refusals: guidance for a later problem than the one he had.
 *
 * ⚠ **This POINTS AT the shipped flow and does not reimplement it.** Session AV established
 * from the code that the existing path works — a composition holding the plate and its
 * title, then the Compositions panel's right-click → "Add to composition". A second way to
 * do one operation is the divergence this repo keeps paying for, so this is a signpost, not
 * a button.
 */
function NoBoxesYet(): JSX.Element {
  return (
    <div className={cls.callout}>
      <p className={cls.calloutHead}>This arrangement has no boxes to place.</p>
      <p className={cls.calloutBody}>
        A <strong>box</strong> is a composition holding one live-source plate and its title. The
        cells above position box <em>instances</em>: the first box goes in cell 1, the second in
        cell 2, and so on in the order they sit in this composition.
      </p>
      <p className={cls.calloutBody}>
        To make one: create a <strong>new composition</strong>, put the plate and the title inside
        it, then come back here, <strong>right-click that composition</strong> in the Compositions
        panel and choose <strong>“Add to composition”</strong>.
      </p>
      <p className={cls.calloutBody}>
        Do that <strong>once per box</strong>, for as many boxes as your <em>largest</em>{' '}
        arrangement needs — <strong>not once per arrangement</strong>. A 3-box and a 2-box
        arrangement share the same three boxes; the 2-box one simply hides the third.
      </p>
      <p className={cls.calloutWarn}>
        ⚠ Don’t put a plate inside a <code>repeater</code> or a <code>sequence</code> item — those
        stamp their content at play time, so a plate in one declares no hole and punches none.
        Export refuses it.
      </p>
    </div>
  );
}

/**
 * 🔴 **`D-153` face 3 — THE CONVENTION, stated where it is needed.**
 *
 * ── WHY IT IS INLINE AND NOT A DOCS PAGE ────────────────────────────────────
 *
 * Every fact below is already true and already decided; the only place to learn any of it
 * was by reading `live-sources.ts`. A linked docs page is one click an author under time
 * pressure does not take, and it rots separately from the code. This is collapsed by
 * default so it costs nothing once learned, and it sits in the panel where the questions
 * arise rather than in the panel where someone might later look them up.
 */
function HowBoxesWork(): JSX.Element {
  return (
    <CollapseSection title="How boxes and backgrounds work">
      {/* 🔴 FIRST, because it is the misunderstanding an author actually ARRIVES with — the
          owner described exactly this workflow: "switch to 3-box and import 3, then switch to
          2-box and import 2…". It is not merely untidy: a per-arrangement instance set would give
          every arrangement its own plate identities, so `(templateId, plateId)` would change on
          every switch and the assigned source would NOT survive it — the model design.md §3
          rejected outright. */}
      <p className={cls.calloutBody}>
        <strong>Import each box ONCE — as many as the biggest arrangement needs.</strong> You do not
        add boxes per arrangement. Every arrangement is a different set of cells over the{' '}
        <em>same</em> boxes: with three imported, the 3-box arrangement fills all three, the 2-box
        fills boxes 1–2 and hides the third for you, the 1-box fills box 1 and hides the rest.
        “Adjust the 2-box arrangement” means moving <em>its two cells</em>, never importing two more
        boxes.
      </p>
      <p className={cls.calloutBody}>
        That is also what keeps a source assigned: a box holds one plate identity for the whole
        template, so the source an operator points at box 2 stays there through every switch. Give
        each arrangement its own boxes and the identities change underneath them.
      </p>
      <p className={cls.calloutBody}>
        <strong>Size a box like a typical cell.</strong> Only the plate’s{' '}
        <em>proportion inside its box</em> is exported — the box is measured, the plate’s rect is
        divided by it, and at play time the hole is that fraction of whatever cell the box lands in.
        Absolute pixels inside the box are not stored, so a box drawn at the size of a cell shows
        you what will air.
      </p>
      <p className={cls.calloutWarn}>
        ⚠ <strong>One box across counts of different shape changes its CROP.</strong> The fractions
        are fixed, so a box designed for a half-frame cell that later lands in a full-frame one
        keeps its proportions and re-crops the picture. It is not an obvious break — the plate is a
        hole filled edge-to-edge — so check a wide arrangement and a narrow one before air.
      </p>
      <p className={cls.calloutBody}>
        <strong>The background is an ordinary element</strong> of this composition — a shape or an
        image behind the boxes — not a setting on an arrangement. One background shared by every
        arrangement is the default and is usually enough. To give one arrangement its own, add a
        second element and hide it in the others with the eye on its timeline row.
      </p>
      {/* D-154 §3.4 — what the authored transform IS for, said where the author meets it. The
          algebra behind "does not reach air" is pinned by
          packages/vcg-format/tests/box-instance-transform-cancels.test.ts. */}
      <p className={cls.calloutBody}>
        <strong>With an arrangement active, a box is positioned by its CELL.</strong> Dragging the
        box on canvas edits that arrangement’s cell — the other arrangements are not touched. The
        Transform panel shows the same numbers; they are one value, two places.
      </p>
      <p className={cls.calloutWarn}>
        ⚠ <strong>“As authored” is a preview, not a layout.</strong> Where you place a box with no
        arrangement active does <em>not</em> reach air: only the plate’s proportion inside its own
        box composition is exported, so moving or resizing the box <em>instance</em>
        changes nothing on air. Use it to see the composition bare; author real positions in the
        cells.
      </p>
      <p className={cls.calloutWarn}>
        ⚠ <strong>The checkerboard is not a background.</strong> It is the editor backdrop, shown so
        you can see transparency while designing; it never reaches air. If you want something behind
        the boxes on air, draw it.
      </p>
    </CollapseSection>
  );
}
