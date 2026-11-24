import { useUiText } from '../../i18n/locale.js';
import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { isOnAirStatus } from '@cg/shared-schema';
import type { Position, PositionAnchor, StackItemState } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { appliedPositionOf, defaultPositionOf } from '../stack/defaultPositionStore.js';
import {
  draftsVersion,
  offsetNumber,
  positionDraftOf,
  stagePosition,
  subscribeDrafts,
  type PositionDraft,
} from './draftStore.js';

/** Row-major 3×3 anchor grid (the 9-point Position model). */
const ANCHOR_GRID: readonly (readonly PositionAnchor[])[] = [
  ['top-left', 'top-center', 'top-right'],
  ['mid-left', 'center', 'mid-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
];

/** On-air edits require a positive capability on the row's current producer. */
export function isPositionLocked(item: StackItemState): boolean {
  return isOnAirStatus(item) && item.onAirPosition !== true;
}

/**
 * R-011 — the per-item on-air position picker: a 3×3 anchor grid + x/y
 * pixel-offset nudge. The preview follows the draft. Update applies it to the
 * current producer when Bridge publishes on-air position support, or saves it
 * for Take while the row is off air. Callers key the picker by itemId.
 *
 * B-072 — it seeds from the item's APPLIED override (published in its state by
 * the bridge), and from the template's manifest default (recorded at import;
 * centered when the template declares none) only when there is no override. It
 * used to seed from the default ALWAYS: a reselect then re-seeded the picker to
 * the default even though the override was live on air, so the UI lied about
 * what was applied — and a re-Apply of that stale display silently overwrote a
 * correct on-air position with the default.
 */
export function PositionPicker({
  item,
  templatePosition = defaultPositionOf(item.templateId),
  canReset = true,
  disclosure,
  adjustments,
}: {
  item: StackItemState;
  templatePosition?: Position | undefined;
  canReset?: boolean;
  disclosure?: { open: boolean; toggle: () => void } | undefined;
  adjustments?: ReactNode;
}): JSX.Element {
  const localizeUi = useUiText();
  const [localOpen, setLocalOpen] = useState(true);
  const open = disclosure?.open ?? localOpen;
  const controlsId = useId();
  // B-072 — seed from the APPLIED override the bridge publishes, falling back
  // to the manifest default only when the item has none. Same precedence as
  // the on-air boot (override → manifest default → centered), so the picker
  // shows what the graphic actually does. The override comes from the item's
  // published state — never a renderer-local store, which would go stale on
  // reload/reconnect and miss delete-on-remove.
  const seed = appliedPositionOf(item, templatePosition);
  /*
   * `RUNTIME-REDESIGN-01` PHASE 5 — THE DRAFT LIVES IN THE STORE, NOT HERE.
   *
   * This was three `useState`s. The picker is keyed by item so that switching items
   * re-seeds it — and that same remount threw away whatever the operator had staged but not
   * applied: move the anchor, glance at another row, come back, and the anchor was where the
   * bridge last put it. Every other staged edit in the panel survives that round trip through
   * `draftStore`; the position uses the same Update and Discard controls. The seed rule
   * (B-072) reads a draft when one is
   * staged, else the APPLIED override, else the manifest default.
   */
  useSyncExternalStore(subscribeDrafts, draftsVersion);
  const draft: PositionDraft = positionDraftOf(item.itemId) ?? {
    anchor: seed.anchor,
    x: String(seed.offset.x),
    y: String(seed.offset.y),
  };
  const { anchor, x: dx, y: dy } = draft;
  const stage = (patch: Partial<PositionDraft>): void =>
    stagePosition(item.itemId, { ...draft, ...patch });
  const setAnchor = (next: PositionAnchor): void => stage({ anchor: next });
  const setDx = (next: string): void => stage({ x: next });
  const setDy = (next: string): void => stage({ y: next });
  const locked = isPositionLocked(item);
  const resetDraft = {
    anchor: templatePosition.anchor,
    x: String(templatePosition.offset.x),
    y: String(templatePosition.offset.y),
  };
  const resetDisabled =
    locked ||
    !canReset ||
    (anchor === resetDraft.anchor && dx === resetDraft.x && dy === resetDraft.y);

  /**
   * STAGED-BUT-UNAPPLIED, said the same way a dynamic field says it (owner
   * request). Position was the one editable thing in this panel that changed
   * silently: an operator could move the anchor, look away, and have no way to
   * tell whether that had reached air — while every field beside it carries a
   * dirty mark for exactly that question.
   *
   * COMPARED AGAINST THE SEED, which is the APPLIED value (`item.position`, the
   * bridge's own published state) falling back to the manifest default — the same
   * precedence B-072 established for what this picker displays. So this cannot
   * drift from what Apply would overwrite: it is dirty exactly when pressing Apply
   * would change something.
   *
   * It clears by ITSELF when the applied value catches up, because the seed is
   * re-read from the item on every render. No local "clean" flag to get stuck.
   */
  const dirty =
    anchor !== seed.anchor ||
    offsetNumber(dx) !== seed.offset.x ||
    offsetNumber(dy) !== seed.offset.y;

  return (
    <div
      className="cg-inspector-section cg-inspector-position"
      aria-label={localizeUi('On-air position')}
    >
      <h2>
        <span className="cg-inspector-position__heading">
          <button
            type="button"
            className="cg-inspector-disclosure"
            aria-controls={controlsId}
            aria-expanded={open}
            onClick={disclosure?.toggle ?? (() => setLocalOpen((expanded) => !expanded))}
          >
            <Icon icon={open ? ChevronDown : ChevronRight} size={14} flipRtl={!open} />
            {localizeUi('Position')}
          </button>
          {dirty && (
            <span
              className="cg-dirty-dot"
              aria-label={localizeUi('Position has unapplied changes')}
            >
              ●
            </span>
          )}
        </span>
        <span className="cg-inspector-position__summary">
          {localizeUi('{anchor} · {x}, {y}', {
            anchor: localizeUi(anchor.replace('-', ' ')),
            x: offsetNumber(dx),
            y: offsetNumber(dy),
          })}
        </span>
      </h2>
      <div id={controlsId} className="cg-inspector-position__controls" hidden={!open}>
        <div className="cg-inspector-position__placement">
          <div
            className="cg-anchor-grid"
            dir="ltr"
            role="group"
            aria-label={localizeUi('Position anchor')}
          >
            {ANCHOR_GRID.flat().map((a) => (
              <Button
                key={a}
                variant="default"
                className="cg-anchor-cell"
                aria-label={localizeUi('Anchor {anchor}', { anchor: localizeUi(a) })}
                aria-pressed={a === anchor}
                disabled={locked}
                title={localizeUi(a)}
                onClick={() => setAnchor(a)}
              >
                <span className="cg-anchor-cell__dot" aria-hidden="true" />
              </Button>
            ))}
          </div>
          <div className="cg-position-row">
            <label className="cg-inspector-control-label">
              <span>{localizeUi('Horizontal')}</span>
              <NumericInput
                dir="ltr"
                decimal
                scrub={{ step: 1 }}
                value={dx}
                disabled={locked}
                onValueChange={setDx}
                aria-label={localizeUi('Position offset X')}
              />
            </label>
            <label className="cg-inspector-control-label">
              <span>{localizeUi('Vertical')}</span>
              <NumericInput
                dir="ltr"
                decimal
                scrub={{ step: 1 }}
                value={dy}
                disabled={locked}
                onValueChange={setDy}
                aria-label={localizeUi('Position offset Y')}
              />
            </label>
          </div>
          <Button
            className="cg-position-reset"
            variant="neutral"
            disabled={resetDisabled}
            onClick={() => stagePosition(item.itemId, resetDraft)}
          >
            {localizeUi('Reset position')}
          </Button>
        </div>
        {adjustments !== undefined && <div className="cg-position-adjustments">{adjustments}</div>}
        {/* BELOW the row, not inside it: it is a note about why the controls above are
          inert, and a note that sits in the control row changes the row's height as
          it appears and disappears. */}
        {locked && (
          <span className="cg-inspector-position__lock">
            {localizeUi('Position locked while on air for this layer')}
          </span>
        )}
      </div>
    </div>
  );
}
