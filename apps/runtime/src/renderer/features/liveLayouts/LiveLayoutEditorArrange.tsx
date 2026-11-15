import { useState } from 'react';
import { ArrowLeftRight, Columns2, LayoutGrid, PanelsTopLeft, Rows2 } from 'lucide-react';
import {
  controlLiveLayoutRects,
  type ControlLiveLayout,
  type ControlLiveLayoutArrangement,
  type ControlLiveLayoutPreset,
} from '@cg/shared-schema';
import { parseLocalizedNumber } from '@cg/text-shaping';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { NumericInput } from '../../ui/NumericInput.js';

const choices: readonly {
  value: ControlLiveLayoutArrangement;
  name: string;
  icon: typeof LayoutGrid;
  counts: readonly number[];
}[] = [
  { value: 'side-by-side', name: 'Side by side', icon: Columns2, counts: [2, 3, 4] },
  { value: 'top-and-bottom', name: 'Top and bottom', icon: Rows2, counts: [2] },
  { value: 'grid-top', name: 'Grid · fuller top', icon: LayoutGrid, counts: [3, 4] },
  { value: 'grid-bottom', name: 'Grid · fuller bottom', icon: LayoutGrid, counts: [3] },
  { value: 'host-and-guests', name: 'Host + guests', icon: PanelsTopLeft, counts: [3, 4] },
];

type GapAxis = 'horizontalGap' | 'verticalGap';

function GapInput({
  axis,
  value,
  max,
  onChange,
}: {
  axis: GapAxis;
  value: number;
  max: number;
  onChange: (value: number) => void;
}): JSX.Element {
  const [typed, setTyped] = useState<string>();
  return (
    <label>
      {axis === 'horizontalGap' ? 'Horizontal gap' : 'Vertical gap'}
      <NumericInput
        value={typed ?? String(value)}
        allow="digits"
        scrub={{ step: 1, min: 0, max }}
        onBlur={() => setTyped(undefined)}
        onValueChange={(text) => {
          setTyped(text);
          const pixels = parseLocalizedNumber(text);
          if (pixels !== null && Number.isSafeInteger(pixels) && pixels >= 0 && pixels <= max) {
            onChange(pixels);
          }
        }}
      />
    </label>
  );
}

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

  function changeGeometry(patch: Partial<ControlLiveLayoutPreset>): void {
    const proposed = { ...preset, ...patch };
    if (Object.keys(controlLiveLayoutRects(layout, proposed)).length === count) onChange(patch);
  }

  return (
    <section className="cg-live-layout-arrange" aria-label="Arrange">
      <div className="cg-live-layout-panel-head">
        <h3>Arrange</h3>
        <Button
          variant="secondary"
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
          .map(({ value, name, icon }) => (
            <Button
              key={value}
              active={preset.arrangement === value}
              aria-pressed={preset.arrangement === value}
              onClick={() => changeGeometry({ arrangement: value })}
            >
              <Icon icon={icon} size={16} /> {name}
            </Button>
          ))}
      </div>
      <div className="cg-live-layout-effect-controls">
        <GapInput
          key={`${preset.id}-horizontal`}
          axis="horizontalGap"
          value={preset.horizontalGap}
          max={layout.resolution.width}
          onChange={(horizontalGap) => changeGeometry({ horizontalGap })}
        />
        <GapInput
          key={`${preset.id}-vertical`}
          axis="verticalGap"
          value={preset.verticalGap}
          max={layout.resolution.height}
          onChange={(verticalGap) => changeGeometry({ verticalGap })}
        />
      </div>
    </section>
  );
}
