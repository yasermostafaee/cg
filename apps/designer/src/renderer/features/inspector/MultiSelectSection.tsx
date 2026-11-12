import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  calculateLiveSourceAutoLayout,
  liveSourceAutoLayoutRowCounts,
  type AnimatableProperty,
  type Element,
  type Fill,
  type LiveSourceLayoutBias,
  type LiveSourceLayoutOptions,
  type TwoPlateLayout,
  type VideoPlaceholderElement,
} from '@cg/shared-schema';
import { LayoutGrid } from 'lucide-react';
import {
  designerStore,
  editSceneOf,
  shallowEqual,
  useDesignerSelector,
} from '../../state/store.js';
import { renderedTransformAt } from '../../state/slices/arrangements.js';
import { isAspectLocked } from '../../state/slices/view.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import {
  getMeasureVersion,
  measureElementSceneSize,
  subscribeMeasure,
} from '../canvas/measure-element.js';
import { CollapseSection } from './CollapseSection.js';
import { ColorField, NumberField, SelectField } from './controls.js';
import { FillField } from './FillPopover.js';
import { MultiKeyframeDot } from './keyframe-diamond.js';
import { Seg, SingleField, transformFieldProps } from './transform-fields.js';
import {
  sharedEditableProperties,
  type SharedProperty,
  type SharedSection,
} from './shared-properties.js';
import { clearOrphanColourTrack } from './fill-commit.js';
import { autoLayoutTargets, autoLayoutTransform } from './live-source-auto-layout.js';
import {
  commitCompositionDimension,
  compositionSizeRatio,
  liveFrameCompositionAspect,
} from './composition-aspect.js';
import {
  ASPECT_CUSTOM,
  ASPECT_PRESETS,
  ASPECT_UNSPECIFIED,
  effectiveAspect,
  fitToAspect,
  matchesAspect,
  optionLabelFor,
  presetKeyFor,
  presetValueFor,
} from './aspect-presets.js';
import { LivePlateFallbackPicker } from './LivePlateFallbackPicker.js';
import { LivePlateControlSection } from './LivePlateControlSection.js';
import * as s from './InspectorPanel.css.js';
import * as ms from './MultiSelectSection.css.js';
import * as tx from './TransformSection.css.js';
import * as fieldCss from './controls.css.js';

/** Non-transform sections, in the single-inspector order (Transform is rendered first, explicitly). */
const SECTION_ORDER: readonly SharedSection[] = [
  'Path Style',
  'Border Radius',
  'Drop Shadow',
  'Filter',
];

/** Select-only sentinel. It is never written to a scene. */
const MIXED = '__cg_mixed__';

function allSame<T>(values: readonly T[]): boolean {
  return values.length > 0 && values.every((value) => Object.is(value, values[0]));
}

/**
 * Multi-selection inspector (D-041 / D-049 / D-050). Shown when more than one
 * element is selected; renders ALL properties COMMON to the selected kinds (the
 * intersection from `sharedEditableProperties`) using the SAME primitives and
 * section grouping as the single inspector — the horizontal-drag number field
 * under Transform, plus Path Style / Border Radius / Drop Shadow / Filter via
 * `NumberField` / `ColorField` / `FillField`. A field whose selected elements
 * DIFFER shows the neutral "mixed" state through the same primitive.
 *
 * Commit model (D-053 + D-054): each field is the SAME primitive as single
 * selection — drag-scrub + live (onChange) updates — and now KEYFRAME-AWARE
 * (Option B). Number-field live values fan out through
 * `applySharedPropertyLiveKeyframed` (loops `commitAnimatable`: a member with a
 * track keyframes at the playhead, others write static; NO per-tick boundary so the
 * burst coalesces), with `onCommitBoundary` → `markHistoryBoundary` once at the
 * gesture endpoint = ONE undo. Discrete colour / solid-fill commits use
 * `applySharedPropertyKeyframed` (one undo). Each shared keyframe-able property
 * shows an aggregate `MultiKeyframeDot` (empty / at-frame / partial) whose click
 * toggles keyframes across the selection in one undo (D-054).
 */
export function MultiSelectSection({ elements }: { elements: readonly Element[] }): JSX.Element {
  const shared = sharedEditableProperties(elements);
  const ids = elements.map((e) => e.id);
  const liveSources = elements.every(
    (element): element is VideoPlaceholderElement => element.type === 'video-placeholder',
  )
    ? elements
    : null;
  const { project, activeCompositionId, activeArrangementId, currentFrame } = useDesignerSelector(
    (state) => ({
      project: state.scene,
      activeCompositionId: state.activeCompositionId,
      activeArrangementId: state.activeArrangementId,
      currentFrame: state.currentFrame,
    }),
    shallowEqual,
  );
  const scene = useMemo(
    () => editSceneOf(project, activeCompositionId),
    [project, activeCompositionId],
  );
  const resolution = scene?.resolution ?? null;
  const measureVersion = useSyncExternalStore(subscribeMeasure, getMeasureVersion);
  const layoutTargets = useMemo(
    () =>
      scene === null
        ? []
        : autoLayoutTargets(scene, elements, (element) => {
            const transform = renderedTransformAt(element, currentFrame);
            if (element.type !== 'text' || element.fitMode !== 'autosize') return transform;
            const size = measureElementSceneSize(element.id);
            return size === null ? transform : { ...transform, size };
          }),
    [scene, elements, currentFrame, activeArrangementId, measureVersion],
  );
  const shortSide = Math.min(resolution?.width ?? 0, resolution?.height ?? 0);
  const [horizontalGap, setHorizontalGap] = useState(() => Math.round(shortSide * 0.025));
  const [verticalGap, setVerticalGap] = useState(() => Math.round(shortSide * 0.025));
  const [twoPlateLayout, setTwoPlateLayout] = useState<TwoPlateLayout>('horizontal');
  const [layoutBias, setLayoutBias] = useState<LiveSourceLayoutBias>('more-top');
  const [reverseLayoutOrder, setReverseLayoutOrder] = useState(false);
  const layoutOptions: LiveSourceLayoutOptions = {
    horizontalGap,
    verticalGap,
    twoPlateLayout,
    reverse: reverseLayoutOrder,
  };
  const currentRows =
    layoutTargets.length >= 2 && resolution !== null
      ? liveSourceAutoLayoutRowCounts(layoutTargets, resolution, layoutBias, layoutOptions)
      : [];
  const hasHorizontalNeighbours = currentRows.some((count) => count > 1);
  const hasVerticalNeighbours = currentRows.length > 1;
  const topRows =
    layoutTargets.length >= 2 && resolution !== null
      ? liveSourceAutoLayoutRowCounts(layoutTargets, resolution, 'more-top', layoutOptions)
      : [];
  const bottomRows =
    layoutTargets.length >= 2 && resolution !== null
      ? liveSourceAutoLayoutRowCounts(layoutTargets, resolution, 'more-bottom', layoutOptions)
      : [];
  const hasRemainderChoice = String(topRows) !== String(bottomRows);
  const hasLockedLiveSource = useDesignerSelector((state) =>
    elements.some(
      (element) =>
        element.type === 'video-placeholder' &&
        element.expectedAspect !== undefined &&
        isAspectLocked(state, element.id),
    ),
  );
  const compositionAspects = useMemo(
    () =>
      new Map(
        elements.flatMap((element) => {
          const aspect = liveFrameCompositionAspect(project, element);
          return aspect === undefined ? [] : [[element.id, aspect] as const];
        }),
      ),
    [activeArrangementId, elements, project],
  );
  const hasLockedComposition = useDesignerSelector((state) =>
    [...compositionAspects.keys()].some((id) => isAspectLocked(state, id)),
  );
  const lockedScaleReason = hasLockedComposition
    ? 'A selected composition keeps its proportions. Resize with Width or Height.'
    : hasLockedLiveSource
      ? 'Scale is unavailable while a selected Plate keeps its aspect locked. Resize with Width or Height.'
      : undefined;
  const byKey = new Map(shared.map((sp) => [sp.descriptor.key, sp]));

  const has = (key: string): boolean => byKey.has(key);
  const isMixed = (key: string): boolean => byKey.get(key)?.mixed === true;
  const numOf = (key: string): number => {
    const v = byKey.get(key)?.value;
    return typeof v === 'number' ? v : 0;
  };
  // Number fields apply LIVE during the gesture (drag-scrub / typing) with no
  // per-tick boundary, KEYFRAME-AWARE (Option B — a member with a track keyframes at
  // the playhead, others write static), then set ONE history boundary at the commit
  // endpoint so the whole edit is one undo entry across the selection.
  const applyNumLive =
    (prop: AnimatableProperty) =>
    (v: number): void => {
      if (!hasLockedComposition || (prop !== 'size.w' && prop !== 'size.h')) {
        designerStore.applySharedPropertyLiveKeyframed(ids, prop, v);
        return;
      }
      const state = designerStore.get();
      for (const element of elements) {
        const aspect = compositionAspects.get(element.id);
        const ratio =
          aspect !== undefined && isAspectLocked(state, element.id)
            ? compositionSizeRatio(aspect, renderedTransformAt(element, currentFrame).scale)
            : null;
        commitCompositionDimension(element.id, prop, v, ratio);
      }
    };
  const commitBoundary = (): void => designerStore.markHistoryBoundary();
  // The aggregate keyframe diamond for a shared property — undefined (no glyph) when
  // it isn't keyframe-able for every selected kind (D-051 registry gate).
  const dot = (prop: AnimatableProperty): JSX.Element | undefined =>
    MultiKeyframeDot(elements, prop, currentFrame);

  // Transform field props (icon-based Seg/SingleField; display via TRANSFORM_FIELD_META),
  // live keyframe-aware apply + boundary-on-commit + the aggregate diamond — the SAME
  // primitive (and now the same keyframe behaviour) as single selection.
  const tf = (prop: AnimatableProperty) => ({
    ...transformFieldProps(prop, numOf(prop), applyNumLive(prop)),
    mixed: isMixed(prop),
    onCommitBoundary: commitBoundary,
    point: dot(prop),
    withheld: prop === 'scale.x' || prop === 'scale.y' ? lockedScaleReason : undefined,
  });

  const inSection = (section: SharedSection): SharedProperty[] =>
    shared.filter((sp) => sp.descriptor.section === section);

  const applyAutoLayout = (
    bias: LiveSourceLayoutBias,
    reverse = reverseLayoutOrder,
    overrides: Partial<LiveSourceLayoutOptions> = {},
    history: 'discrete' | 'live' = 'discrete',
  ): void => {
    if (layoutTargets.length < 2 || resolution === null) return;
    setLayoutBias(bias);
    const layout = calculateLiveSourceAutoLayout(layoutTargets, resolution, bias, {
      horizontalGap,
      verticalGap,
      twoPlateLayout,
      reverse,
      ...overrides,
    });
    const targetsById = new Map(layoutTargets.map((target) => [target.id, target]));
    const writeLayout = (): void => {
      for (const item of layout) {
        const target = targetsById.get(item.id);
        if (target === undefined) continue;
        const { position, size, scale, rotation } = autoLayoutTransform(target, item);
        if (rotation !== undefined) designerStore.commitAnimatable(item.id, 'rotation', rotation);
        if (scale !== undefined) {
          designerStore.commitAnimatable(item.id, 'scale.x', scale.x);
          designerStore.commitAnimatable(item.id, 'scale.y', scale.y);
        }
        if (size !== undefined) {
          designerStore.commitAnimatable(item.id, 'size.w', size.w);
          designerStore.commitAnimatable(item.id, 'size.h', size.h);
        }
        designerStore.commitAnimatable(item.id, 'position.x', position.x);
        designerStore.commitAnimatable(item.id, 'position.y', position.y);
      }
    };
    // Selects and buttons are isolated one-shot commands. Gap fields are live
    // scrubbers/inputs, so their consecutive ticks must coalesce until blur or
    // pointer-up instead of creating one Undo entry per typed digit.
    if (history === 'discrete') designerStore.runAsSingleHistoryEntry(writeLayout);
    else writeLayout();
  };

  // Solid fill fans out keyframe-AWARE like the number fields (D-054 — a member with
  // a fill.color track keyframes at the playhead, others write static); a gradient
  // (not keyframe-able) applies the whole Fill to every selected shape as one undo.
  const applyFill = (f: Fill): void => {
    if (f.kind === 'solid') {
      designerStore.applySharedPropertyKeyframed(ids, 'fill.color', f.color);
    } else {
      designerStore.runAsSingleHistoryEntry(() => {
        for (const el of elements) {
          if (el.type === 'shape') {
            designerStore.updateElement(el.id, { fill: f } as Partial<Element>);
            // B-014 — the gradient makes fill.color non-keyframe-able; drop the
            // orphaned colour track (same undo step as the fan-out).
            clearOrphanColourTrack({ ...el, fill: f } as Element, 'fill.color');
          }
        }
      });
    }
  };

  function renderField(sp: SharedProperty): JSX.Element {
    const d = sp.descriptor;
    if (d.kind === 'fill') {
      const fillValue: Fill | undefined =
        sp.mixed || typeof sp.value !== 'string' ? undefined : { kind: 'solid', color: sp.value };
      return (
        <FillField
          key={d.key}
          label={d.label}
          value={fillValue}
          onChange={applyFill}
          trailing={dot('fill.color')}
        />
      );
    }
    if (d.kind === 'color') {
      return (
        <ColorField
          key={d.key}
          label={d.label}
          value={typeof sp.value === 'string' ? sp.value : '#000000'}
          mixed={sp.mixed}
          onCommit={(hex) => designerStore.applySharedPropertyKeyframed(ids, d.prop, hex)}
          trailing={dot(d.prop)}
        />
      );
    }
    return (
      <NumberField
        key={d.key}
        label={d.label}
        value={numOf(d.key)}
        step={d.step}
        min={d.min}
        max={d.max}
        suffix={d.suffix}
        mixed={sp.mixed}
        onCommit={applyNumLive(d.prop)}
        onCommitBoundary={commitBoundary}
        trailing={dot(d.prop)}
      />
    );
  }

  return (
    <aside className={s.panel} aria-label="Inspector" data-testid="multi-select-inspector">
      <h2 className={s.headingFirst}>{elements.length} ELEMENTS SELECTED</h2>
      {shared.length === 0 && layoutTargets.length < 2 ? (
        <p className={s.empty}>No shared editable properties for this mix.</p>
      ) : (
        <>
          {shared.length > 0 && (
            <CollapseSection title="Transform" pinned>
              <div className={tx.col}>
                {(has('position.x') || has('position.y')) && (
                  <div className="cg-input-group">
                    {has('position.x') && <Seg {...tf('position.x')} />}
                    {has('position.y') && <Seg {...tf('position.y')} />}
                  </div>
                )}
                {(has('size.w') || has('size.h')) && (
                  <div className="cg-input-group">
                    {has('size.w') && <Seg {...tf('size.w')} />}
                    {has('size.h') && <Seg {...tf('size.h')} />}
                  </div>
                )}
                {(has('scale.x') || has('scale.y')) && (
                  <div className="cg-input-group">
                    {has('scale.x') && <Seg {...tf('scale.x')} />}
                    {has('scale.y') && <Seg {...tf('scale.y')} />}
                  </div>
                )}
                {has('rotation') && <SingleField {...tf('rotation')} />}
                {has('opacity') && <SingleField {...tf('opacity')} />}
              </div>
            </CollapseSection>
          )}
          {liveSources !== null && (
            <LiveSourceAppearanceSections
              elements={liveSources}
              resolution={resolution}
              onCommitBoundary={commitBoundary}
            />
          )}
          {layoutTargets.length >= 2 && resolution !== null && (
            <CollapseSection title="Auto layout" defaultExpanded>
              {layoutTargets.length === 2 && (
                <SelectField
                  label="layout"
                  value={twoPlateLayout}
                  options={['horizontal', 'vertical']}
                  labels={['Side by side', 'Top and bottom']}
                  onCommit={(value) => {
                    setTwoPlateLayout(value);
                    applyAutoLayout(layoutBias, reverseLayoutOrder, { twoPlateLayout: value });
                  }}
                />
              )}
              {hasHorizontalNeighbours && (
                <NumberField
                  label="horizontal gap"
                  value={horizontalGap}
                  min={0}
                  max={resolution.width}
                  step={1}
                  suffix="px"
                  onCommit={(value) => {
                    setHorizontalGap(value);
                    applyAutoLayout(
                      layoutBias,
                      reverseLayoutOrder,
                      { horizontalGap: value },
                      'live',
                    );
                  }}
                  onCommitBoundary={commitBoundary}
                />
              )}
              {hasVerticalNeighbours && (
                <NumberField
                  label="vertical gap"
                  value={verticalGap}
                  min={0}
                  max={resolution.height}
                  step={1}
                  suffix="px"
                  onCommit={(value) => {
                    setVerticalGap(value);
                    applyAutoLayout(layoutBias, reverseLayoutOrder, { verticalGap: value }, 'live');
                  }}
                  onCommitBoundary={commitBoundary}
                />
              )}
              <div className={ms.layoutActions}>
                {!hasRemainderChoice ? (
                  <Button
                    className={ms.layoutButton}
                    size="sm"
                    onClick={() => applyAutoLayout('more-top')}
                    title="Arrange with equal gaps and centred margins"
                  >
                    <Icon icon={LayoutGrid} size={14} />
                    Arrange evenly
                  </Button>
                ) : (
                  <>
                    <Button
                      className={ms.layoutButton}
                      size="sm"
                      onClick={() => applyAutoLayout('more-top')}
                      title="Put the fuller row at the top"
                    >
                      <Icon icon={LayoutGrid} size={14} />
                      More frames on top
                    </Button>
                    <Button
                      className={ms.layoutButton}
                      size="sm"
                      onClick={() => applyAutoLayout('more-bottom')}
                      title="Put the fuller row at the bottom"
                    >
                      <Icon icon={LayoutGrid} size={14} />
                      More frames on bottom
                    </Button>
                  </>
                )}
                <Button
                  className={ms.layoutButton}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const reverse = !reverseLayoutOrder;
                    setReverseLayoutOrder(reverse);
                    applyAutoLayout(layoutBias, reverse);
                  }}
                  title={
                    layoutTargets.length === 2 && twoPlateLayout === 'vertical'
                      ? 'Exchange the top and bottom frames'
                      : 'Exchange frame positions without changing layer order'
                  }
                >
                  Swap frame order
                </Button>
              </div>
            </CollapseSection>
          )}
          {SECTION_ORDER.map((section) => {
            const descs = inSection(section);
            if (descs.length === 0) return null;
            return (
              <CollapseSection key={section} title={section} pinned={section === 'Path Style'}>
                {descs.map(renderField)}
              </CollapseSection>
            );
          })}
        </>
      )}
    </aside>
  );
}

/** D-167 — the static plate controls that intentionally do not belong in the animation registry. */
function LiveSourceAppearanceSections({
  elements,
  resolution,
  onCommitBoundary,
}: {
  elements: readonly VideoPlaceholderElement[];
  resolution: { readonly width: number; readonly height: number } | null;
  onCommitBoundary: () => void;
}): JSX.Element {
  const owner = elements.map((element) => element.id).join('|');
  const [aspectPick, setAspectPick] = useState<string | null>(null);
  const [aspectPickOwner, setAspectPickOwner] = useState(owner);
  if (aspectPickOwner !== owner) {
    setAspectPickOwner(owner);
    setAspectPick(null);
  }

  const updateAll = (patchFor: (element: VideoPlaceholderElement) => Partial<Element>): void => {
    designerStore.runAsSingleHistoryEntry(() => {
      for (const element of elements) designerStore.updateElement(element.id, patchFor(element));
    });
  };

  // NumberField is live while typing/scrubbing. Keep those ticks in one coalesced
  // history burst, then let onCommitBoundary close it at blur / Enter / pointer-up.
  const updateAllLive = (
    patchFor: (element: VideoPlaceholderElement) => Partial<Element>,
  ): void => {
    for (const element of elements) designerStore.updateElement(element.id, patchFor(element));
  };

  const aspectKeys = elements.map((element) => presetKeyFor(element.expectedAspect));
  const derivedAspect =
    !allSame(aspectKeys) ||
    (aspectKeys[0] === ASPECT_CUSTOM && !allSame(elements.map((element) => element.expectedAspect)))
      ? MIXED
      : (aspectKeys[0] ?? MIXED);
  const selectedAspect = aspectPick ?? derivedAspect;
  const aspectOptions = [
    ...(selectedAspect === MIXED ? [MIXED] : []),
    ...ASPECT_PRESETS.map((preset) => preset.key),
    ASPECT_CUSTOM,
    ASPECT_UNSPECIFIED,
  ];
  const commitAspect = (key: string): void => {
    if (key === MIXED) return;
    setAspectPick(key);
    if (key === ASPECT_UNSPECIFIED) {
      updateAll(() => ({ expectedAspect: undefined }));
      return;
    }
    const preset = presetValueFor(key);
    if (preset !== undefined) {
      updateAll(() => ({ expectedAspect: preset }));
      return;
    }
    if (key === ASPECT_CUSTOM) {
      const first = elements[0];
      const rendered = first === undefined ? Number.NaN : effectiveAspect(first.transform);
      const seed = first?.expectedAspect ?? (rendered > 0 ? rendered : 16 / 9);
      updateAll(() => ({ expectedAspect: seed }));
    }
  };
  const customAspects = elements.map((element) => element.expectedAspect ?? 0);

  const lockSummary = useDesignerSelector((state) =>
    elements
      .filter((element) => element.expectedAspect !== undefined)
      .map((element) => (isAspectLocked(state, element.id) ? '1' : '0'))
      .join(''),
  );
  const eligibleLocks = elements.filter((element) => element.expectedAspect !== undefined);
  const allAspectLocked = eligibleLocks.length > 0 && !lockSummary.includes('0');
  const someAspectLocked = lockSummary.includes('1');

  const strokeColors = elements.map((element) => element.stroke?.color ?? '#ffffff');
  const strokeWidths = elements.map((element) => element.stroke?.width ?? 0);
  const repairable = elements.filter((element) => {
    if (element.expectedAspect === undefined || resolution === null) return false;
    return (
      !matchesAspect(element.transform, element.expectedAspect) &&
      fitToAspect(element.transform, element.expectedAspect, resolution) !== null
    );
  });

  const repairSelectedAspects = (): void => {
    if (resolution === null || repairable.length === 0) return;
    designerStore.runAsSingleHistoryEntry(() => {
      for (const element of repairable) {
        const aspect = element.expectedAspect;
        if (aspect === undefined) continue;
        const fitted = fitToAspect(element.transform, aspect, resolution);
        if (fitted === null) continue;
        designerStore.updateElement(element.id, {
          transform: { ...element.transform, size: fitted.size },
        } as Partial<Element>);
      }
    });
  };

  return (
    <>
      <CollapseSection title="Plate" defaultExpanded>
        <SelectField
          label="aspect"
          value={selectedAspect}
          options={aspectOptions}
          labels={aspectOptions.map((key) =>
            key === MIXED ? '— mixed —' : optionLabelFor(key, elements[0]?.expectedAspect),
          )}
          onCommit={commitAspect}
        />
        {selectedAspect === ASPECT_CUSTOM && (
          <NumberField
            label="custom aspect"
            value={customAspects[0] ?? 0}
            mixed={!allSame(customAspects)}
            min={0.01}
            step={0.01}
            onCommit={(expectedAspect) => updateAllLive(() => ({ expectedAspect }))}
            onCommitBoundary={onCommitBoundary}
          />
        )}
        <div className={fieldCss.row}>
          <span className={fieldCss.label}>keep aspect</span>
          <Button
            variant="secondary"
            selected={allAspectLocked}
            aria-pressed={someAspectLocked ? (allAspectLocked ? true : 'mixed') : false}
            disabled={eligibleLocks.length === 0}
            aria-label="Keep aspect while resizing selected plates"
            title={
              eligibleLocks.length === 0
                ? 'Choose an aspect before locking it.'
                : allAspectLocked
                  ? 'All selected plates keep their own aspect. Click to resize freely.'
                  : 'Lock every selected plate that has a declared aspect.'
            }
            onClick={() => {
              const next = !allAspectLocked;
              for (const element of eligibleLocks) designerStore.setAspectLock(element.id, next);
            }}
          >
            {someAspectLocked && !allAspectLocked ? 'MIXED' : allAspectLocked ? 'LOCKED' : 'FREE'}
          </Button>
        </div>
        <LivePlateFallbackPicker plates={elements} onCommit={(patch) => updateAll(() => patch)} />
        <div className={fieldCss.row}>
          <span className={fieldCss.label} />
          <Button
            className={ms.layoutButton}
            variant="secondary"
            disabled={repairable.length === 0}
            onClick={repairSelectedAspects}
            title="Repair each selected plate to its own declared aspect"
            aria-label="Repair selected plates to aspect"
          >
            {repairable.length === 0 ? '✓ Matches aspect' : 'Repair all to aspect'}
          </Button>
        </div>
      </CollapseSection>
      <LivePlateControlSection plates={elements} onCommit={updateAll} />
      <CollapseSection title="Frame" defaultExpanded>
        <ColorField
          label="stroke"
          value={strokeColors[0] ?? '#ffffff'}
          mixed={!allSame(strokeColors)}
          withheld={
            strokeWidths.every((width) => width <= 0)
              ? 'No selected frame has a width. Set a stroke width first; each colour is kept.'
              : undefined
          }
          onCommit={(color) =>
            updateAll((element) => ({
              stroke: { width: element.stroke?.width ?? 0, ...element.stroke, color },
            }))
          }
        />
        <NumberField
          label="stroke width"
          value={strokeWidths[0] ?? 0}
          mixed={!allSame(strokeWidths)}
          step={1}
          min={0}
          suffix="px"
          onCommit={(width) =>
            updateAllLive((element) => ({
              stroke: {
                color: element.stroke?.color ?? '#ffffff',
                ...element.stroke,
                width: Math.max(0, width),
              },
            }))
          }
          onCommitBoundary={onCommitBoundary}
        />
      </CollapseSection>
    </>
  );
}
