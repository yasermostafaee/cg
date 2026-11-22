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
  liveSourceLayoutMargins,
  type LiveSourceLayoutMargins,
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
import { Checkbox } from '../../ui/Checkbox.js';
import { SelectInput } from '../../ui/SelectInput.js';
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
type MarginEdge = keyof LiveSourceLayoutMargins;
const marginEdges = [
  ['top', 'Top'],
  ['right', 'Right'],
  ['bottom', 'Bottom'],
  ['left', 'Left'],
] as const;

interface LayoutControls {
  horizontalGap: GapControl;
  verticalGap: GapControl;
  twoPlateLayout: TwoPlateLayout;
  bias: LiveSourceLayoutBias;
  reverse: boolean;
  margins: LiveSourceLayoutMargins;
  marginText?: Partial<Record<MarginEdge, string | undefined>>;
  fill: boolean;
  custom: boolean;
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
  if (rectCount === 0) return { kind: 'hidden' };
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
  authoredMargins,
  authoredFill,
}: {
  item: StackItemState;
  live: TemplateLiveSources;
  lookId: string | undefined;
  frames: readonly Frame[];
  enabled: boolean;
  authoredMargins?: LiveSourceLayoutMargins | undefined;
  authoredFill?: boolean | undefined;
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
  if (frames.length === 0) return null;

  const defaultGap = Math.round(Math.min(live.resolution.width, live.resolution.height) * 0.025);
  const defaultGapControl = { text: String(defaultGap), amount: defaultGap };
  const canFill = frames.every(({ target }) => target.resize === 'free');
  const defaults: LayoutControls = {
    horizontalGap: defaultGapControl,
    verticalGap: defaultGapControl,
    twoPlateLayout: 'horizontal',
    bias: 'more-top',
    reverse: false,
    margins: liveSourceLayoutMargins(
      live.resolution,
      authoredMargins,
      frames.length === 1 ? 0 : 0.05,
    ),
    fill: authoredFill === true,
    custom: false,
  };
  const controls = controlsByLook.get(lookId) ?? defaults;
  const { horizontalGap, verticalGap, twoPlateLayout, bias, reverse, margins, fill, custom } =
    controls;
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
    margins,
    fill: canFill && fill,
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

  function changeArrangement(
    changes: Partial<Pick<LayoutControls, 'twoPlateLayout' | 'bias'>>,
  ): void {
    if (!enabled) return;
    updateControls({ ...changes, custom: false });
    arrange(
      calculateLiveSourceAutoLayout(geometry, live.resolution, changes.bias ?? bias, {
        ...options,
        twoPlateLayout: changes.twoPlateLayout ?? twoPlateLayout,
      }),
    );
  }

  function changeMargins(next: LiveSourceLayoutMargins): void {
    if (!enabled || activeGapScope.current !== gapScope) return;
    const result = calculateLiveSourceAutoLayout(geometry, live.resolution, bias, {
      ...options,
      margins: next,
    });
    if (result.length !== frames.length) return;
    updateControls({ margins: next, marginText: {} });
    arrange(result);
  }

  function changeMarginField(edge: MarginEdge, text: string): void {
    if (!enabled || activeGapScope.current !== gapScope) return;
    const amount = readGap(text);
    const next = { ...margins, [edge]: amount ?? margins[edge] };
    const result =
      amount === null
        ? []
        : calculateLiveSourceAutoLayout(geometry, live.resolution, bias, {
            ...options,
            margins: next,
          });
    const accepted = result.length === frames.length;
    updateControls({
      margins: accepted ? next : margins,
      marginText: { ...controls.marginText, [edge]: text },
    });
    if (accepted) arrange(result);
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
        <label>
          Arrangement
          <SelectInput
            value={custom ? 'custom' : frames.length === 2 ? twoPlateLayout : bias}
            onChange={({ currentTarget: { value } }) => {
              if (value === 'custom') updateControls({ custom: true });
              else if (value === 'horizontal' || value === 'vertical')
                changeArrangement({ twoPlateLayout: value });
              else
                changeArrangement({ bias: value === 'more-bottom' ? 'more-bottom' : 'more-top' });
            }}
          >
            {frames.length === 2 ? (
              <>
                <option value="horizontal">Side by side</option>
                <option value="vertical">Top and bottom</option>
              </>
            ) : (
              <>
                <option value="more-top">
                  {frames.length === 1
                    ? 'Single plate'
                    : canChooseFullerRow
                      ? 'More frames on top'
                      : 'Grid'}
                </option>
                {canChooseFullerRow && <option value="more-bottom">More frames on bottom</option>}
              </>
            )}
            <option value="custom">Custom</option>
          </SelectInput>
        </label>
        {custom ? (
          <span>Move or resize the plates in PVW.</span>
        ) : (
          <>
            <fieldset className="cg-frame-auto-layout__margins">
              <legend>Margins (px)</legend>
              <div className="cg-frame-auto-layout__gaps">
                {marginEdges.map(([edge, label]) => (
                  <label key={edge} htmlFor={gapId + '-margin-' + edge}>
                    {label}
                    <NumericInput
                      id={gapId + '-margin-' + edge}
                      className="cg-field"
                      decimal
                      allow="number"
                      scrub={{
                        step: 1,
                        min: 0,
                        max:
                          edge === 'left' || edge === 'right'
                            ? live.resolution.width
                            : live.resolution.height,
                      }}
                      disabled={!enabled}
                      value={controls.marginText?.[edge] ?? String(margins[edge])}
                      onValueChange={(value) => changeMarginField(edge, value)}
                      onBlur={() =>
                        updateControls({
                          marginText: { ...controls.marginText, [edge]: undefined },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <Button
                variant="neutral"
                onClick={() =>
                  changeMargins(liveSourceLayoutMargins(live.resolution, undefined, 0))
                }
              >
                Zero margins
              </Button>
            </fieldset>
            {canFill && (
              <label className="cg-position-aspect">
                <Checkbox
                  checked={fill}
                  onChange={(checked) => {
                    const result = calculateLiveSourceAutoLayout(geometry, live.resolution, bias, {
                      ...options,
                      fill: checked,
                    });
                    if (result.length !== frames.length) return;
                    updateControls({ fill: checked });
                    arrange(result);
                  }}
                />
                Fill available area
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
              {frames.length > 1 && (
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
              )}
            </div>
          </>
        )}
      </fieldset>
    </details>
  );
}
