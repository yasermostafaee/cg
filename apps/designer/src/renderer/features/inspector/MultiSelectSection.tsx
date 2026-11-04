import { useState } from 'react';
import {
  DEFAULT_LIVE_FIT_MODE,
  LIVE_FIT_MODES,
  type AnimatableProperty,
  type Element,
  type Fill,
  type LiveFitMode,
  type VideoPlaceholderElement,
} from '@cg/shared-schema';
import { LayoutGrid } from 'lucide-react';
import { designerStore, editSceneOf, useDesignerSelector } from '../../state/store.js';
import { isAspectLocked } from '../../state/slices/view.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
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
import {
  calculateLiveSourceAutoLayout,
  liveSourceAutoLayoutRowCounts,
  type LiveSourceLayoutBias,
  type LiveSourceLayoutOptions,
  type TwoPlateLayout,
} from './live-source-auto-layout.js';
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
import { useAssets } from '../assets/useAssets.js';
import { useSharedImages } from '../sharedLibrary/useSharedImages.js';
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

function nameWithoutExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
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
  const resolution = useDesignerSelector(
    (state) => editSceneOf(state.scene, state.activeCompositionId)?.resolution ?? null,
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
    liveSources !== null && resolution !== null
      ? liveSourceAutoLayoutRowCounts(liveSources, resolution, layoutBias, layoutOptions)
      : [];
  const hasHorizontalNeighbours = currentRows.some((count) => count > 1);
  const hasVerticalNeighbours = currentRows.length > 1;
  const topRows =
    liveSources !== null && resolution !== null
      ? liveSourceAutoLayoutRowCounts(liveSources, resolution, 'more-top', layoutOptions)
      : [];
  const bottomRows =
    liveSources !== null && resolution !== null
      ? liveSourceAutoLayoutRowCounts(liveSources, resolution, 'more-bottom', layoutOptions)
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
  const lockedScaleReason = hasLockedLiveSource
    ? 'Scale is unavailable while a selected Plate keeps its aspect locked. Resize with Width or Height.'
    : undefined;
  const byKey = new Map(shared.map((sp) => [sp.descriptor.key, sp]));

  const has = (key: string): boolean => byKey.has(key);
  const isMixed = (key: string): boolean => byKey.get(key)?.mixed === true;
  const numOf = (key: string): number => {
    const v = byKey.get(key)?.value;
    return typeof v === 'number' ? v : 0;
  };
  // D-054 — the playhead drives keyframe-vs-static per member (via commitAnimatable),
  // and the aggregate diamond's state; subscribe so it tracks playback.
  const currentFrame = useDesignerSelector((st) => st.currentFrame);
  // Number fields apply LIVE during the gesture (drag-scrub / typing) with no
  // per-tick boundary, KEYFRAME-AWARE (Option B — a member with a track keyframes at
  // the playhead, others write static), then set ONE history boundary at the commit
  // endpoint so the whole edit is one undo entry across the selection.
  const applyNumLive =
    (prop: AnimatableProperty) =>
    (v: number): void =>
      designerStore.applySharedPropertyLiveKeyframed(ids, prop, v);
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
    if (liveSources === null || resolution === null) return;
    setLayoutBias(bias);
    const layout = calculateLiveSourceAutoLayout(liveSources, resolution, bias, {
      horizontalGap,
      verticalGap,
      twoPlateLayout,
      reverse,
      ...overrides,
    });
    const writeLayout = (): void => {
      for (const item of layout) {
        // B-360 — an auto layout is deliberately axis-aligned and normalised. Writing
        // through commitAnimatable keeps existing position/size tracks authoritative:
        // tracked properties receive a keyframe at the playhead; static ones stay static.
        designerStore.commitAnimatable(item.id, 'rotation', 0);
        designerStore.commitAnimatable(item.id, 'scale.x', 1);
        designerStore.commitAnimatable(item.id, 'scale.y', 1);
        designerStore.commitAnimatable(item.id, 'size.w', item.width);
        designerStore.commitAnimatable(item.id, 'size.h', item.height);
        designerStore.commitAnimatable(item.id, 'position.x', item.x);
        designerStore.commitAnimatable(item.id, 'position.y', item.y);
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
      {shared.length === 0 ? (
        <p className={s.empty}>No shared editable properties for this mix.</p>
      ) : (
        <>
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
          {liveSources !== null && (
            <LiveSourceAppearanceSections
              elements={liveSources}
              resolution={resolution}
              onCommitBoundary={commitBoundary}
            />
          )}
          {liveSources !== null && resolution !== null && (
            <CollapseSection title="Auto layout" defaultExpanded>
              {liveSources.length === 2 && (
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
                    liveSources.length === 2 && twoPlateLayout === 'vertical'
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
  const projectPosters = useAssets().filter((asset) => asset.kind === 'image');
  const sharedPosters = useSharedImages();
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

  const fitModes = elements.map((element) => element.fitMode ?? DEFAULT_LIVE_FIT_MODE);
  const selectedFitMode: LiveFitMode | typeof MIXED = allSame(fitModes)
    ? (fitModes[0] ?? DEFAULT_LIVE_FIT_MODE)
    : MIXED;

  const posterIds = [
    ...projectPosters.map((asset) => asset.assetId),
    ...sharedPosters.map((asset) => asset.assetId),
  ];
  const posterNames = [
    ...projectPosters.map((asset) => `${nameWithoutExtension(asset.filename)} (project)`),
    ...sharedPosters.map((asset) => `${nameWithoutExtension(asset.filename)} (shared)`),
  ];
  const selectedPosters = elements.map((element) => element.posterAssetId ?? '');
  const selectedPoster = allSame(selectedPosters) ? (selectedPosters[0] ?? '') : MIXED;
  const missingPosters = Array.from(
    new Set(selectedPosters.filter((id) => id !== '' && !posterIds.includes(id))),
  );

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
        <SelectField
          label="fit"
          value={selectedFitMode}
          options={[...(selectedFitMode === MIXED ? [MIXED] : []), ...LIVE_FIT_MODES]}
          labels={[
            ...(selectedFitMode === MIXED ? ['— mixed —'] : []),
            'Fit whole picture',
            'Fill box (crop edges)',
          ]}
          onCommit={(fitMode) => {
            if (fitMode === MIXED) return;
            updateAll(() => ({ fitMode: fitMode as LiveFitMode }));
          }}
        />
        <SelectField
          label="poster"
          value={selectedPoster}
          options={[
            ...(selectedPoster === MIXED ? [MIXED] : []),
            '',
            ...missingPosters,
            ...posterIds,
          ]}
          labels={[
            ...(selectedPoster === MIXED ? ['— mixed —'] : []),
            'bars',
            ...missingPosters.map((id) => `${id} (missing)`),
            ...posterNames,
          ]}
          onCommit={(posterAssetId) => {
            if (posterAssetId === MIXED) return;
            updateAll(() => ({
              posterAssetId: posterAssetId === '' ? undefined : posterAssetId,
            }));
          }}
        />
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
