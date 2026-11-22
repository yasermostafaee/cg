import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  calculateLiveSourceAutoLayout,
  liveSourceAutoLayoutRowCounts,
  liveSourceLayoutMargins,
  type Element,
  type LiveSourceLayoutBias,
  type LiveSourceLayoutMargins,
  type LiveSourceLayoutOptions,
  type TwoPlateLayout,
} from '@cg/shared-schema';
import { LayoutGrid, Move } from 'lucide-react';
import {
  designerStore,
  editSceneOf,
  shallowEqual,
  useDesignerSelector,
} from '../../state/store.js';
import { renderedTransformAt } from '../../state/slices/arrangements.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import {
  getMeasureVersion,
  measureElementSceneSize,
  subscribeMeasure,
} from '../canvas/measure-element.js';
import { CollapseSection } from './CollapseSection.js';
import { NumberField, SelectField } from './controls.js';
import { liveFrameCompositionAspect } from './composition-aspect.js';
import { autoLayoutTargets, autoLayoutTransform } from './live-source-auto-layout.js';
import * as s from './MultiSelectSection.css.js';

export function useFrameArrangeTargets(elements: readonly Element[]) {
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
  const measureVersion = useSyncExternalStore(subscribeMeasure, getMeasureVersion);
  const targets = useMemo(
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
  const key = JSON.stringify([
    activeCompositionId,
    activeArrangementId,
    ...targets.map(({ id }) => id),
  ]);
  return { targets, resolution: scene?.resolution, key };
}

export function SinglePlateArrange({ element }: { element: Element }): JSX.Element | null {
  const isLiveFrame = useDesignerSelector(
    (state) =>
      element.type === 'video-placeholder' ||
      liveFrameCompositionAspect(state.scene, element) !== undefined,
  );
  const elements = useMemo(() => [element], [element]);
  const { targets, resolution, key } = useFrameArrangeTargets(elements);
  if (!isLiveFrame || resolution === undefined || targets.length === 0) {
    return null;
  }
  return <FrameArrange key={key} targets={targets} resolution={resolution} collapsed />;
}

const EDGE_FIELDS = [
  ['top', 'top margin', 'height', 'bottom'],
  ['right', 'right margin', 'width', 'left'],
  ['bottom', 'bottom margin', 'height', 'top'],
  ['left', 'left margin', 'width', 'right'],
] as const;

const ZERO_MARGINS: LiveSourceLayoutMargins = { top: 0, right: 0, bottom: 0, left: 0 };

type ArrangeTargets = ReturnType<typeof useFrameArrangeTargets>;
type LayoutControls = LiveSourceLayoutOptions & { bias: LiveSourceLayoutBias };

export function FrameArrange({
  targets,
  resolution,
  collapsed = false,
}: {
  targets: ArrangeTargets['targets'];
  resolution: NonNullable<ArrangeTargets['resolution']>;
  collapsed?: boolean;
}): JSX.Element {
  const shortSide = Math.min(resolution.width, resolution.height);
  const single = targets.length === 1;
  const canFill = targets.every(
    (target) => target.kind === 'plate' || (target.kind === 'composition' && target.containsPlate),
  );
  const fillName = targets.some(({ kind }) => kind === 'composition')
    ? 'Fill area and scale frame graphics'
    : 'Fill available area';
  const [controls, setControls] = useState<LayoutControls>(() => ({
    horizontalGap: Math.round(shortSide * 0.025),
    verticalGap: Math.round(shortSide * 0.025),
    twoPlateLayout: 'horizontal',
    bias: 'more-top',
  }));
  const [custom, setCustom] = useState(false);
  const { bias, horizontalGap = 0, verticalGap = 0 } = controls;
  const margins = liveSourceLayoutMargins(resolution, controls.margins, single ? 0 : 0.05);
  const rows = liveSourceAutoLayoutRowCounts(targets, resolution, bias, controls);
  const oppositeRows = liveSourceAutoLayoutRowCounts(
    targets,
    resolution,
    bias === 'more-top' ? 'more-bottom' : 'more-top',
    controls,
  );
  const hasRemainderChoice = String(rows) !== String(oppositeRows);

  const applyArrangement = (
    overrides: Partial<LayoutControls>,
    history: 'discrete' | 'live' = 'discrete',
  ): void => {
    const next = { ...controls, ...overrides };
    const layout = calculateLiveSourceAutoLayout(targets, resolution, next.bias, {
      ...next,
      fill: canFill && next.fill === true,
    });
    if (layout.length !== targets.length) return;
    setControls(next);
    setCustom(false);
    const byId = new Map(targets.map((target) => [target.id, target]));
    const write = (): void => {
      for (const item of layout) {
        const target = byId.get(item.id);
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
    if (history === 'discrete') designerStore.runAsSingleHistoryEntry(write);
    else write();
  };
  const commitBoundary = (): void => designerStore.markHistoryBoundary();

  return (
    <CollapseSection title="Arrange" defaultExpanded={!collapsed}>
      {targets.length === 2 && (
        <SelectField
          label="layout"
          value={controls.twoPlateLayout ?? 'horizontal'}
          options={['horizontal', 'vertical'] satisfies TwoPlateLayout[]}
          labels={['Side by side', 'Top and bottom']}
          onCommit={(twoPlateLayout) => applyArrangement({ twoPlateLayout })}
        />
      )}
      <div className={s.layoutActions}>
        {single || !hasRemainderChoice ? (
          <Button
            className={s.layoutButton}
            size="sm"
            onClick={() => applyArrangement({ bias: 'more-top' })}
          >
            <Icon icon={LayoutGrid} size={14} />
            {single ? 'Arrange one plate' : 'Arrange evenly'}
          </Button>
        ) : (
          <>
            <Button
              className={s.layoutButton}
              size="sm"
              onClick={() => applyArrangement({ bias: 'more-top' })}
            >
              <Icon icon={LayoutGrid} size={14} /> More frames on top
            </Button>
            <Button
              className={s.layoutButton}
              size="sm"
              onClick={() => applyArrangement({ bias: 'more-bottom' })}
            >
              <Icon icon={LayoutGrid} size={14} /> More frames on bottom
            </Button>
          </>
        )}
        <Button
          className={s.layoutButton}
          size="sm"
          selected={custom}
          aria-pressed={custom}
          title="Select, move or resize individual frames on the canvas"
          onClick={() => {
            setCustom(true);
            designerStore.setTool('cursor');
            for (const { id, kind } of targets) {
              if (kind === 'plate' || kind === 'composition')
                designerStore.setAspectLock(id, false);
            }
          }}
        >
          <Icon icon={Move} size={14} /> Custom
        </Button>
      </div>
      {!custom && (
        <>
          {canFill && (
            <SelectField
              label="sizing"
              value={controls.fill === true ? 'fill' : 'fit'}
              options={['fit', 'fill']}
              labels={['Keep plate aspect', fillName]}
              onCommit={(value) => applyArrangement({ fill: value === 'fill' })}
            />
          )}
          {rows.some((count) => count > 1) && (
            <NumberField
              label="horizontal gap"
              value={horizontalGap}
              min={0}
              max={Math.max(0, resolution.width - margins.left - margins.right - 1)}
              step={1}
              suffix="px"
              onCommit={(value) => applyArrangement({ horizontalGap: value }, 'live')}
              onCommitBoundary={commitBoundary}
            />
          )}
          {rows.length > 1 && (
            <NumberField
              label="vertical gap"
              value={verticalGap}
              min={0}
              max={Math.max(0, resolution.height - margins.top - margins.bottom - 1)}
              step={1}
              suffix="px"
              onCommit={(value) => applyArrangement({ verticalGap: value }, 'live')}
              onCommitBoundary={commitBoundary}
            />
          )}
          <div role="group" aria-label="Outer margins">
            {EDGE_FIELDS.map(([edge, label, dimension, opposite]) => (
              <NumberField
                key={edge}
                label={label}
                value={margins[edge]}
                min={0}
                max={Math.max(0, resolution[dimension] - margins[opposite] - 1)}
                step={1}
                suffix="px"
                onCommit={(value) =>
                  applyArrangement({ margins: { ...margins, [edge]: value } }, 'live')
                }
                onCommitBoundary={commitBoundary}
              />
            ))}
          </div>
          <div className={s.layoutActions}>
            <Button
              className={s.layoutButton}
              size="sm"
              onClick={() => applyArrangement({ margins: ZERO_MARGINS })}
            >
              Zero margins
            </Button>
            {!single && (
              <Button
                className={s.layoutButton}
                size="sm"
                onClick={() => applyArrangement({ reverse: controls.reverse !== true })}
                title={
                  targets.length === 2 && controls.twoPlateLayout === 'vertical'
                    ? 'Exchange the top and bottom frames'
                    : 'Exchange frame positions without changing layer order'
                }
              >
                Swap frame order
              </Button>
            )}
          </div>
        </>
      )}
    </CollapseSection>
  );
}
