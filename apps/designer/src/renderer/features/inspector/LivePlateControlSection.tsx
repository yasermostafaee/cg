import {
  DEFAULT_LIVE_FIT_MODE,
  LIVE_FIT_MODES,
  type LiveFitMode,
  type Scene,
  type VideoPlaceholderElement,
} from '@cg/shared-schema';
import { Crop, Scan } from 'lucide-react';
import { Icon } from '../../ui/Icon.js';
import { activeDocOf } from '../../state/scene-doc.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { CollapseSection } from './CollapseSection.js';
import { SelectField } from './controls.js';
import { CheckRow } from './DynamicDataSection.js';
import * as dds from './DynamicDataSection.css.js';
import * as s from './InspectorPanel.css.js';

const MIXED = '__cg_mixed__';
const resizeOptions = ['locked', 'proportional', 'free'] as const;

type PlatePatch = Partial<
  Pick<VideoPlaceholderElement, 'fitMode' | 'operatorMove' | 'operatorPlacement'>
>;

function commonChoice<T extends string>(values: readonly T[]): T | typeof MIXED {
  const first = values[0];
  return first !== undefined && values.every((value) => value === first) ? first : MIXED;
}

function allowsMove(plate: VideoPlaceholderElement): boolean {
  return plate.operatorMove ?? plate.operatorPlacement !== undefined;
}

/**
 * ⭐ `C-028` — **the FIT MODE: how the picture is placed in this plate's box.**
 *
 * ── WHAT THE AUTHOR IS ACTUALLY CHOOSING ────────────────────────────────────
 *
 * The client's decision (2026-08-23, via the owner): **the picture must not be cut.** A
 * live input keeps its own aspect, is centred on both axes, and the leftover margin shows
 * **the template's own background** — never black, because the mask hole is punched at
 * the FITTED rect rather than at the box. `cover` keeps the old centre-crop for the shots
 * where losing the edges is the accepted cost.
 *
 * 🔴 **The label says what happens to the PICTURE, not to the BOX**, because the natural
 * misreading is that the box changes shape. It does not: the box is exactly where the
 * author drew it, and only the picture inside it moves. The owner accepted the visible
 * consequence in advance — a stroke or frame authored tight around a box **no longer hugs
 * the picture** when the source aspect differs.
 *
 * ── WHY THIS IS PER ELEMENT AND NOT PER SOURCE ──────────────────────────────
 *
 * The same catalog source seated in a 16:9 box and a 3:4 box needs DIFFERENT fits, so a
 * per-source field would have to be wrong in one of them. The mode is a property of the
 * PAIRING of a picture with a box, and this is where that pairing is authored.
 *
 * ⚠ **The operator can override it per assignment, and that is not a bug in this
 * control.** The author states what the design wants; the operator, who is looking at the
 * picture on the day, may revise it. Note the direction is the OPPOSITE of `D-147`'s
 * aspect chain, where the installation outranks the author — that one resolves a
 * measurable property of the feed, this one a presentation choice about it.
 */
export function LivePlateControlSection({
  plates,
  onCommit,
}: {
  plates: readonly VideoPlaceholderElement[];
  onCommit: (patchFor: (plate: VideoPlaceholderElement) => PlatePatch) => void;
}): JSX.Element {
  const fit = commonChoice(plates.map((plate) => plate.fitMode ?? DEFAULT_LIVE_FIT_MODE));
  const resize = commonChoice(plates.map((plate) => plate.operatorPlacement ?? 'locked'));
  const allAllowMove = plates.every(allowsMove);
  const someAllowMove = plates.some(allowsMove);
  const composition = useDesignerSelector(({ scene }) =>
    scene === null ? undefined : activeDocOf(scene),
  );

  return (
    <CollapseSection title="CG Control" defaultExpanded>
      <SelectField<LiveFitMode | typeof MIXED>
        label="Fit"
        value={fit}
        options={fit === MIXED ? [MIXED, ...LIVE_FIT_MODES] : LIVE_FIT_MODES}
        labels={[
          ...(fit === MIXED ? ['— mixed —'] : []),
          'Fit whole picture',
          'Fill box (crop edges)',
        ]}
        onCommit={(fitMode) => {
          if (fitMode !== MIXED) onCommit(() => ({ fitMode }));
        }}
        trailing={
          fit === MIXED ? undefined : (
            <span
              className={dds.hint}
              title={
                fit === 'contain'
                  ? 'The WHOLE picture is shown, centred, at the source’s own aspect. Where the ' +
                    'source is a different shape from this box, the margin shows the template’s ' +
                    'own background — not black. Nothing is cropped, so a frame drawn tight ' +
                    'around this box will not hug the picture.'
                  : 'The picture is scaled until it FILLS the box and the overflow is cropped ' +
                    'evenly from both edges. The box is filled corner to corner, at the cost of ' +
                    'the edges of the source frame.'
              }
            >
              <Icon icon={fit === 'contain' ? Scan : Crop} />
            </span>
          )
        }
      />
      <CheckRow
        label="Allow move"
        checked={allAllowMove}
        indeterminate={someAllowMove && !allAllowMove}
        onChange={(operatorMove) => onCommit(() => ({ operatorMove }))}
      />
      <SelectField<(typeof resizeOptions)[number] | typeof MIXED>
        label="Resize"
        value={resize}
        options={resize === MIXED ? [MIXED, ...resizeOptions] : resizeOptions}
        labels={[
          ...(resize === MIXED ? ['— mixed —'] : []),
          'Locked',
          'Preserve aspect ratio',
          'Operator chooses aspect ratio',
        ]}
        onCommit={(mode) => {
          if (mode === MIXED) return;
          const operatorPlacement = mode === 'locked' ? undefined : mode;
          onCommit((plate) => {
            const operatorMove = allowsMove(plate);
            return {
              operatorPlacement,
              // Older projects derive movement from whether resize is enabled.
              ...(plate.operatorMove === undefined &&
                operatorMove !== (operatorPlacement !== undefined) && { operatorMove }),
            };
          });
        }}
      />
      {composition !== undefined && <LivePlateCompositionSettings composition={composition} />}
    </CollapseSection>
  );
}

const compositionSettings = [
  { field: 'allowLivePlateOverlap', label: 'Allow live plate overlap' },
  { field: 'allowOperatorAutoLayout', label: 'Allow Auto layout in CG Control' },
] as const;

export function LivePlateCompositionSettings({
  composition,
}: {
  composition: Pick<Scene, (typeof compositionSettings)[number]['field']>;
}): JSX.Element {
  return (
    <>
      {compositionSettings.map(({ field, label }) => (
        <label
          key={field}
          className={s.row}
          title="Applies to the open composition. When exporting a parent composition, enable this on that parent."
        >
          <span className={s.label}>{label}</span>
          <input
            type="checkbox"
            className={dds.checkbox}
            checked={composition[field] === true}
            onChange={(event) =>
              designerStore.updateScene({
                [field]: event.currentTarget.checked ? true : undefined,
              })
            }
          />
        </label>
      ))}
    </>
  );
}
