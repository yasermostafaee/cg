import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  framePlacementRects,
  lookAllowsOperatorAutoLayout,
  lookOperatorFrames,
  lookPlateRects,
  type TemplateLiveSources,
} from '@cg/shared-ipc';
import {
  calculateLiveSourceAutoLayout,
  liveSourceAutoLayoutRowCounts,
  type LiveFrameTarget,
  type LiveSourceLayoutBias,
  type LiveSourceLayoutItem,
  type LiveSourceLayoutOptions,
  type LiveSourceRect,
  type StackItemState,
  type TwoPlateLayout,
} from '@cg/shared-schema';
import { parseLocalizedNumber } from '@cg/text-shaping';
import { Button } from '../../ui/Button.js';
import { NumericInput } from '../../ui/NumericInput.js';
import {
  framePlacementsWithDraft,
  snapshotFramePlacementDraft,
  stageFramePlacements,
} from './draftStore.js';

interface Frame {
  id: string;
  target: LiveFrameTarget;
  authored: LiveSourceRect;
}

type AutoLayoutAvailability =
  | { kind: 'eligible'; frames: Frame[] }
  | { kind: 'permissions' }
  | { kind: 'hidden' };

interface GapControl {
  text: string;
  amount: number;
}

type GapAxis = 'horizontalGap' | 'verticalGap';

interface LayoutControls {
  horizontalGap: GapControl;
  verticalGap: GapControl;
  twoPlateLayout: TwoPlateLayout;
  bias: LiveSourceLayoutBias;
  reverse: boolean;
}

function readGap(text: string): number | null {
  // A trailing decimal mark is still being typed, even if it has an integer prefix.
  return text.trimEnd().endsWith('.') ? null : parseLocalizedNumber(text);
}

/** A preset is arranged as a unit. Every visible frame must be allowed to move and resize. */
export function frameAutoLayoutAvailability(
  live: TemplateLiveSources,
  lookId: string | undefined,
): AutoLayoutAvailability {
  if (!lookAllowsOperatorAutoLayout(live, lookId)) return { kind: 'hidden' };
  const rects = lookPlateRects(live, lookId);
  const rectCount = Object.keys(rects).length;
  if (rectCount < 2) return { kind: 'hidden' };
  const targets = lookOperatorFrames(live, lookId);
  const frames: Frame[] = [];
  let missingPermission = false;
  for (const { sourceId } of live.sources) {
    const authored = rects[sourceId];
    if (authored === undefined) continue;
    if (authored.width <= 0 || authored.height <= 0) return { kind: 'hidden' };
    const target = targets[sourceId];
    if (target === undefined || target.move === false || target.resize === 'move-only') {
      missingPermission = true;
    } else {
      frames.push({ id: sourceId, target, authored });
    }
  }
  if (missingPermission) return { kind: 'permissions' };
  return frames.length === rectCount ? { kind: 'eligible', frames } : { kind: 'hidden' };
}

export function FrameAutoLayout({
  item,
  live,
  lookId,
  frames,
  enabled,
}: {
  item: StackItemState;
  live: TemplateLiveSources;
  lookId: string | undefined;
  frames: readonly Frame[];
  enabled: boolean;
}): JSX.Element | null {
  const gapId = useId();
  const [controlsByLook, setControlsByLook] = useState<
    ReadonlyMap<string | undefined, LayoutControls>
  >(() => new Map());
  const gapScope = useMemo(() => ({ live, lookId, enabled }), [live, lookId, enabled]);
  const activeGapScope = useRef<typeof gapScope>();
  useLayoutEffect(() => {
    activeGapScope.current = gapScope;
    return () => {
      activeGapScope.current = undefined;
    };
  }, [gapScope]);
  if (frames.length < 2) return null;

  const defaultGap = Math.round(Math.min(live.resolution.width, live.resolution.height) * 0.025);
  const defaultGapControl = { text: String(defaultGap), amount: defaultGap };
  const defaults: LayoutControls = {
    horizontalGap: defaultGapControl,
    verticalGap: defaultGapControl,
    twoPlateLayout: 'horizontal',
    bias: 'more-top',
    reverse: false,
  };
  const controls = controlsByLook.get(lookId) ?? defaults;
  const { horizontalGap, verticalGap, twoPlateLayout, bias, reverse } = controls;
  function updateControls(changes: Partial<LayoutControls>): void {
    setControlsByLook((current) =>
      new Map(current).set(lookId, { ...(current.get(lookId) ?? defaults), ...changes }),
    );
  }
  const frameDraft = snapshotFramePlacementDraft(item.itemId);
  const applied =
    item.framePlacementsPendingReset === true || frameDraft?.reset !== undefined
      ? []
      : item.framePlacements;
  const baselineRects = framePlacementRects(live, lookId, applied);
  const effectiveRects = framePlacementRects(
    live,
    lookId,
    framePlacementsWithDraft(applied, frameDraft),
  );
  const geometry = frames.map(({ id, target, authored }) => {
    const rect = target.resize === 'free' ? (effectiveRects[id] ?? authored) : authored;
    return { id, aspect: rect.width / rect.height };
  });
  const options: LiveSourceLayoutOptions = {
    horizontalGap: horizontalGap.amount,
    verticalGap: verticalGap.amount,
    twoPlateLayout,
    reverse,
  };
  const rows = liveSourceAutoLayoutRowCounts(geometry, live.resolution, bias, options);
  const alternateRows = liveSourceAutoLayoutRowCounts(
    geometry,
    live.resolution,
    bias === 'more-top' ? 'more-bottom' : 'more-top',
    options,
  );
  const canChooseFullerRow =
    frames.length > 2 &&
    (alternateRows.length !== rows.length || alternateRows.some((count, i) => count !== rows[i]));
  const layout = calculateLiveSourceAutoLayout(geometry, live.resolution, bias, options);
  const swapped = calculateLiveSourceAutoLayout(geometry, live.resolution, bias, {
    ...options,
    reverse: !reverse,
  });
  const hasHorizontalGap =
    rows.some((count) => count > 1) ||
    (frames.length > 2 && horizontalGap.text !== defaultGapControl.text);
  const hasVerticalGap =
    rows.length > 1 || (frames.length > 2 && verticalGap.text !== defaultGapControl.text);
  const invalidGap = (gap: GapControl): boolean => {
    const entered = readGap(gap.text);
    return entered !== null && entered !== gap.amount;
  };
  const hasInvalidGap =
    (hasHorizontalGap && invalidGap(horizontalGap)) || (hasVerticalGap && invalidGap(verticalGap));

  function arrange(next: readonly LiveSourceLayoutItem[]): void {
    const byPlate = new Map(frames.map((frame) => [frame.id, frame]));
    const updates = next.flatMap(({ id, ...rect }) => {
      const frame = byPlate.get(id);
      if (frame === undefined) return [];
      return [
        {
          placement: { frameKey: frame.target.frameKey, lookId, rect },
          baseline: baselineRects[id] ?? frame.authored,
        },
      ];
    });
    if (updates.length === frames.length) stageFramePlacements(item.itemId, updates);
  }

  function changeGap(axis: GapAxis, text: string): void {
    // A captured pointer gesture can outlive the preset or its edit permission.
    if (!enabled || activeGapScope.current !== gapScope) return;
    const entered = readGap(text);
    const max = axis === 'horizontalGap' ? live.resolution.width : live.resolution.height;
    const next =
      entered === null || !Number.isFinite(entered) || entered < 0 || entered > max
        ? []
        : calculateLiveSourceAutoLayout(geometry, live.resolution, bias, {
            ...options,
            [axis]: entered,
          });
    const accepted = entered !== null && next.length === frames.length;
    updateControls({ [axis]: { text, amount: accepted ? entered : controls[axis].amount } });
    if (accepted) arrange(next);
  }

  return (
    <details className="cg-frame-auto-layout">
      <summary>Auto layout</summary>
      <fieldset className="cg-frame-auto-layout__fields" disabled={!enabled}>
        {frames.length === 2 && (
          <label>
            Arrangement
            <select
              className="cg-field"
              value={twoPlateLayout}
              onChange={(event) =>
                updateControls({
                  twoPlateLayout:
                    event.currentTarget.value === 'vertical' ? 'vertical' : 'horizontal',
                })
              }
            >
              <option value="horizontal">Side by side</option>
              <option value="vertical">Top and bottom</option>
            </select>
          </label>
        )}
        {canChooseFullerRow && (
          <label>
            Arrangement
            <select
              className="cg-field"
              value={bias}
              onChange={(event) =>
                updateControls({
                  bias: event.currentTarget.value === 'more-bottom' ? 'more-bottom' : 'more-top',
                })
              }
            >
              <option value="more-top">More frames on top</option>
              <option value="more-bottom">More frames on bottom</option>
            </select>
          </label>
        )}
        <div className="cg-frame-auto-layout__gaps">
          {hasHorizontalGap && (
            <label htmlFor={`${gapId}-horizontal`}>
              Horizontal gap (px)
              <NumericInput
                id={`${gapId}-horizontal`}
                className="cg-field"
                decimal
                allow="number"
                scrub={{ step: 1, min: 0, max: live.resolution.width }}
                disabled={!enabled}
                value={horizontalGap.text}
                onValueChange={(value) => changeGap('horizontalGap', value)}
              />
            </label>
          )}
          {hasVerticalGap && (
            <label htmlFor={`${gapId}-vertical`}>
              Vertical gap (px)
              <NumericInput
                id={`${gapId}-vertical`}
                className="cg-field"
                decimal
                allow="number"
                scrub={{ step: 1, min: 0, max: live.resolution.height }}
                disabled={!enabled}
                value={verticalGap.text}
                onValueChange={(value) => changeGap('verticalGap', value)}
              />
            </label>
          )}
        </div>
        {(hasInvalidGap || layout.length !== frames.length) && (
          <span role="status">Enter gaps that fit the frames.</span>
        )}
        <div className="cg-frame-auto-layout__actions">
          <Button
            variant="neutral"
            disabled={hasInvalidGap || layout.length !== frames.length}
            onClick={() => arrange(layout)}
          >
            Arrange frames
          </Button>
          <Button
            variant="neutral"
            disabled={hasInvalidGap || swapped.length !== frames.length}
            title="Exchange frame positions without changing layer order"
            onClick={() => {
              updateControls({ reverse: !reverse });
              arrange(swapped);
            }}
          >
            Swap frame order
          </Button>
        </div>
      </fieldset>
    </details>
  );
}
