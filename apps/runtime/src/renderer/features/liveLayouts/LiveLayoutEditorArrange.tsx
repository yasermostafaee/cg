import { ArrowLeftRight, LayoutGrid, MoveHorizontal, MoveVertical } from 'lucide-react';
import {
  controlLiveLayoutRects,
  type ControlLiveLayout,
  type ControlLiveLayoutArrangement,
  type ControlLiveLayoutPreset,
} from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import './live-layout-arrangement.css';

const choices: readonly {
  value: ControlLiveLayoutArrangement;
  name: string;
  counts: readonly number[];
}[] = [
  { value: 'side-by-side', name: 'Side by side', counts: [2, 3, 4] },
  { value: 'top-and-bottom', name: 'Top and bottom', counts: [2] },
  { value: 'grid-top', name: 'Grid · fuller top', counts: [3, 4] },
  { value: 'grid-bottom', name: 'Grid · fuller bottom', counts: [3] },
  { value: 'host-and-guests', name: 'Host + guests', counts: [3, 4] },
];

export function LiveLayoutEditorArrange({
  layout,
  preset,
  onChange,
}: {
  layout: ControlLiveLayout;
  preset: ControlLiveLayoutPreset;
  onChange: (patch: Partial<ControlLiveLayoutPreset>) => void;
}): JSX.Element | null {
  const count = preset.frameIds.length;
  if (count < 2) return null;
  const { width, height } = layout.resolution;

  function changeGeometry(patch: Partial<ControlLiveLayoutPreset>): void {
    const proposed = { ...preset, ...patch };
    if (Object.keys(controlLiveLayoutRects(layout, proposed)).length === count) onChange(patch);
  }

  return (
    <section className="cg-live-layout-arrange" aria-label="Arrange">
      <div className="cg-live-layout-panel-head">
        <h3>
          <Icon icon={LayoutGrid} size={16} /> Arrange
        </h3>
        <Button
          variant="neutral"
          active={preset.reverse}
          aria-pressed={preset.reverse}
          onClick={() => changeGeometry({ reverse: !preset.reverse })}
        >
          <Icon icon={ArrowLeftRight} size={14} /> Reverse order
        </Button>
      </div>
      <div className="cg-live-layout-arrange-buttons" role="group" aria-label="Arrangement">
        {choices
          .filter(({ counts }) => counts.includes(count))
          .map(({ value, name }) => (
            <Button
              key={value}
              active={preset.arrangement === value}
              aria-pressed={preset.arrangement === value}
              onClick={() => changeGeometry({ arrangement: value })}
            >
              <span className="cg-live-layout-arrangement-glyph" aria-hidden="true">
                {Object.entries(
                  controlLiveLayoutRects(layout, {
                    ...preset,
                    arrangement: value,
                    horizontalGap: 0,
                    verticalGap: 0,
                    reverse: false,
                  }),
                ).map(([id, rect]) => (
                  <span
                    key={id}
                    style={{
                      left: `${(100 * rect.x) / width}%`,
                      top: `${(100 * rect.y) / height}%`,
                      width: `${(100 * rect.width) / width}%`,
                      height: `${(100 * rect.height) / height}%`,
                    }}
                  />
                ))}
              </span>
              <span>{name}</span>
            </Button>
          ))}
      </div>
      <div className="cg-live-layout-gaps" role="group" aria-label="Frame gaps, pixels">
        <div className="cg-live-layout-gap-control">
          <Icon icon={MoveHorizontal} size={14} />
          <LiveLayoutEditorNumber
            key={`${preset.id}-horizontal`}
            label="Horizontal gap"
            value={preset.horizontalGap}
            min={0}
            max={layout.resolution.width}
            onChange={(horizontalGap) => changeGeometry({ horizontalGap })}
          />
          <span aria-hidden="true">px</span>
        </div>
        <div className="cg-live-layout-gap-control">
          <Icon icon={MoveVertical} size={14} />
          <LiveLayoutEditorNumber
            key={`${preset.id}-vertical`}
            label="Vertical gap"
            value={preset.verticalGap}
            min={0}
            max={layout.resolution.height}
            onChange={(verticalGap) => changeGeometry({ verticalGap })}
          />
          <span aria-hidden="true">px</span>
        </div>
      </div>
    </section>
  );
}
