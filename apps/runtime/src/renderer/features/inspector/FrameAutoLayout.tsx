import { useId, useState } from 'react';
import {
  framePlacementRects,
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

interface LayoutControls {
  horizontalGap: string;
  verticalGap: string;
  twoPlateLayout: TwoPlateLayout;
  bias: LiveSourceLayoutBias;
  reverse: boolean;
}

/** Reflow the whole preset, or leave it alone if an authored frame has to stay fixed. */
export function autoLayoutFrames(live: TemplateLiveSources, lookId: string | undefined): Frame[] {
  if (live.allowOperatorAutoLayout !== true) return [];
  const rects = lookPlateRects(live, lookId);
  const targets = lookOperatorFrames(live, lookId);
  const frames: Frame[] = [];
  for (const { sourceId } of live.sources) {
    const authored = rects[sourceId];
    if (authored === undefined) continue;
    const target = targets[sourceId];
    if (
      target === undefined ||
      target.move === false ||
      target.resize === 'move-only' ||
      authored.width <= 0 ||
      authored.height <= 0
    )
      return [];
    frames.push({ id: sourceId, target, authored });
  }
  return frames.length >= 2 && frames.length === Object.keys(rects).length ? frames : [];
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
  if (frames.length < 2) return null;

  const defaultGap = Math.round(Math.min(live.resolution.width, live.resolution.height) * 0.025);
  const defaults: LayoutControls = {
    horizontalGap: String(defaultGap),
    verticalGap: String(defaultGap),
    twoPlateLayout: 'horizontal',
    bias: 'more-top',
    reverse: false,
  };
  const { horizontalGap, verticalGap, twoPlateLayout, bias, reverse } =
    controlsByLook.get(lookId) ?? defaults;
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
    horizontalGap: horizontalGap === '' ? defaultGap : Number(horizontalGap),
    verticalGap: verticalGap === '' ? defaultGap : Number(verticalGap),
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
          {rows.some((count) => count > 1) && (
            <label htmlFor={`${gapId}-horizontal`}>
              Horizontal gap (px)
              <NumericInput
                id={`${gapId}-horizontal`}
                className="cg-field"
                allow="digits"
                value={horizontalGap}
                onValueChange={(value) => updateControls({ horizontalGap: value })}
              />
            </label>
          )}
          {rows.length > 1 && (
            <label htmlFor={`${gapId}-vertical`}>
              Vertical gap (px)
              <NumericInput
                id={`${gapId}-vertical`}
                className="cg-field"
                allow="digits"
                value={verticalGap}
                onValueChange={(value) => updateControls({ verticalGap: value })}
              />
            </label>
          )}
        </div>
        {layout.length !== frames.length && (
          <span role="status">Reduce the gaps to fit the frames.</span>
        )}
        <div className="cg-frame-auto-layout__actions">
          <Button
            variant="neutral"
            disabled={layout.length !== frames.length}
            onClick={() => arrange(layout)}
          >
            Arrange frames
          </Button>
          <Button
            variant="neutral"
            disabled={swapped.length !== frames.length}
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
