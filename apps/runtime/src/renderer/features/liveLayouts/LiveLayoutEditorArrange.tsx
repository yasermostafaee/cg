import { useUiText } from '../../i18n/locale.js';
import { useId } from 'react';
import { ArrowLeftRight, LayoutGrid, Move, MoveHorizontal, MoveVertical } from 'lucide-react';
import {
  DEFAULT_LIVE_CROP_FOCUS,
  controlLiveLayoutFocusRect,
  controlLiveLayoutRects,
  liveSourceLayoutMargins,
  type LiveCropFocus,
  type ControlLiveLayout,
  type ControlLiveLayoutArrangement,
  type ControlLiveLayoutPreset,
  type LiveSourceLayoutMargins,
  type LiveSourceRect,
  type Resolution,
} from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { Icon } from '../../ui/Icon.js';
import { LiveLayoutEditorCropControls } from './LiveLayoutEditorCropControls.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import { LiveLayoutGeometryThumbnail } from './LiveLayoutGeometryThumbnail.js';
import { LiveLayoutEditorPlatePresentation } from './LiveLayoutEditorPlatePresentation.js';
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

const EDGES = [
  { side: 'top', name: 'Top', axis: 'height', opposite: 'bottom' },
  { side: 'right', name: 'Right', axis: 'width', opposite: 'left' },
  { side: 'bottom', name: 'Bottom', axis: 'height', opposite: 'top' },
  { side: 'left', name: 'Left', axis: 'width', opposite: 'right' },
] as const;
const ZERO_MARGINS: LiveSourceLayoutMargins = { top: 0, right: 0, bottom: 0, left: 0 };
const RECT_FIELDS = [
  { key: 'x', limit: 'width', name: 'X', axis: 'width', min: 0 },
  { key: 'y', limit: 'height', name: 'Y', axis: 'height', min: 0 },
  { key: 'width', limit: 'x', name: 'Width', axis: 'width', min: 1 },
  { key: 'height', limit: 'y', name: 'Height', axis: 'height', min: 1 },
] as const;

function MarginFields({
  kind,
  resolution,
  margins,
  onChange,
}: {
  kind: 'Preset' | 'Focus';
  resolution: Resolution;
  margins: LiveSourceLayoutMargins;
  onChange: (margins: LiveSourceLayoutMargins) => void;
}): JSX.Element {
  const localizeUi = useUiText();
  return (
    <div
      className="cg-live-layout-margin-row"
      role="group"
      aria-label={localizeUi(kind === 'Preset' ? 'Preset margins (px)' : 'Focus margins (px)')}
    >
      <span>{localizeUi(kind === 'Preset' ? 'Preset margins (px)' : 'Focus margins (px)')}</span>
      <div className="cg-live-layout-margin-fields">
        {EDGES.map(({ side, name, axis, opposite }) => (
          <LiveLayoutEditorNumber
            key={side}
            label={localizeUi(name)}
            value={margins[side]}
            min={0}
            max={Math.max(0, Math.floor(resolution[axis] - margins[opposite] - 1))}
            onChange={(value) => onChange({ ...margins, [side]: value })}
          />
        ))}
        <Button
          variant="neutral"
          aria-label={localizeUi(kind === 'Preset' ? 'Zero preset margins' : 'Zero focus margins')}
          disabled={Object.values(margins).every((value) => value === 0)}
          onClick={() => onChange(ZERO_MARGINS)}
        >
          {localizeUi('Zero margins')}
        </Button>
      </div>
    </div>
  );
}

export function LiveLayoutEditorArrange({
  layout,
  preset,
  onChange,
  onFitChange,
  canEditCrop,
  onCropChange,
  editingPlacement,
  onEditingPlacementChange,
  onCustom,
  selectedPlate,
}: {
  layout: ControlLiveLayout;
  preset: ControlLiveLayoutPreset;
  onChange: (patch: Partial<ControlLiveLayoutPreset>) => void;
  onFitChange: (fit: ControlLiveLayoutPreset['plateFitMode']) => void;
  canEditCrop: boolean;
  onCropChange: (crop: LiveCropFocus | undefined) => void;
  editingPlacement: boolean;
  onEditingPlacementChange: (editing: boolean) => void;
  onCustom: () => void;
  selectedPlate?:
    | { id: string; rect: LiveSourceRect; onChange: (rect: LiveSourceRect) => void }
    | undefined;
}): JSX.Element | null {
  const localizeUi = useUiText();
  const fillId = useId();
  const count = preset.frameIds.length;
  if (count === 0) return null;
  const { width, height } = layout.resolution;
  const custom = preset.arrangement === 'custom';

  function changeGeometry(patch: Partial<ControlLiveLayoutPreset>): void {
    const proposed = { ...preset, ...patch };
    if (
      Object.keys(controlLiveLayoutRects(layout, proposed)).length === count &&
      controlLiveLayoutFocusRect(layout, proposed) !== undefined
    )
      onChange(patch);
  }

  return (
    <section className="cg-live-layout-arrange" aria-label={localizeUi('Arrange')}>
      <div className="cg-live-layout-panel-head">
        <h3>
          <Icon icon={LayoutGrid} size={16} /> {localizeUi('Arrange')}
        </h3>
        {custom && (
          <Button
            variant="neutral"
            active={editingPlacement}
            aria-pressed={editingPlacement}
            onClick={() => onEditingPlacementChange(!editingPlacement)}
          >
            <Icon icon={Move} size={14} /> {localizeUi('Edit plate layout')}
          </Button>
        )}
        {count > 1 && !custom && (
          <Button
            variant="neutral"
            active={preset.reverse}
            aria-pressed={preset.reverse}
            onClick={() => changeGeometry({ reverse: !preset.reverse })}
          >
            <Icon icon={ArrowLeftRight} size={14} /> {localizeUi('Reverse order')}
          </Button>
        )}
      </div>
      {custom && editingPlacement && selectedPlate !== undefined && (
        <div
          key={preset.id + ':' + selectedPlate.id}
          className="cg-live-layout-margin-row"
          role="group"
          aria-label={localizeUi('Plate position and size (px)')}
        >
          <span>{localizeUi('Plate position and size (px)')}</span>
          <div className="cg-live-layout-margin-fields">
            {RECT_FIELDS.map(({ key, limit, name, axis, min }) => (
              <LiveLayoutEditorNumber
                key={key}
                label={localizeUi(name)}
                value={Number(selectedPlate.rect[key].toFixed(2))}
                min={min}
                max={Math.max(min, layout.resolution[axis] - selectedPlate.rect[limit])}
                decimal
                onChange={(value) =>
                  selectedPlate.onChange({ ...selectedPlate.rect, [key]: value })
                }
              />
            ))}
          </div>
        </div>
      )}
      <LiveLayoutEditorPlatePresentation
        key={preset.id}
        scope="preset"
        value={{ aspectRatio: preset.plateAspectRatio, fitMode: preset.plateFitMode }}
        inheritedAspect={width / height}
        inheritedFit={localizeUi('Plate defaults')}
        geometryControls={!custom && preset.fill !== true}
        onChange={(patch) => {
          if ('aspectRatio' in patch) changeGeometry({ plateAspectRatio: patch.aspectRatio });
          if ('fitMode' in patch) onFitChange(patch.fitMode);
        }}
      />
      <div
        className="cg-live-layout-arrange-buttons"
        role="group"
        aria-label={localizeUi('Arrangement')}
      >
        {(count === 1
          ? [{ value: 'side-by-side' as const, name: 'Single plate' }]
          : choices.filter(({ counts }) => counts.includes(count))
        ).map(({ value, name }) => (
          <Button
            key={value}
            active={count === 1 ? !custom : preset.arrangement === value}
            aria-pressed={count === 1 ? !custom : preset.arrangement === value}
            onClick={() => changeGeometry({ arrangement: value })}
          >
            <LiveLayoutGeometryThumbnail
              layout={layout}
              preset={{
                ...preset,
                arrangement: value,
                horizontalGap: 0,
                verticalGap: 0,
                margins: ZERO_MARGINS,
                reverse: false,
              }}
              className="cg-live-layout-arrangement-glyph"
            />
            <span>{localizeUi(value === 'grid-top' && count === 4 ? 'Grid · 2 × 2' : name)}</span>
          </Button>
        ))}
        <Button active={custom} aria-pressed={custom} onClick={onCustom}>
          <LiveLayoutGeometryThumbnail
            layout={layout}
            preset={{
              ...preset,
              arrangement: preset.customRects === undefined ? preset.arrangement : 'custom',
            }}
            className="cg-live-layout-arrangement-glyph"
          />
          {localizeUi('Custom')}
        </Button>
      </div>
      {!custom && (
        <label className="cg-live-layout-arrange-fill" htmlFor={fillId}>
          <Checkbox
            id={fillId}
            checked={preset.fill === true}
            onChange={(fill) => changeGeometry({ fill })}
          />
          {localizeUi('Fill available area')}
        </label>
      )}
      {count > 1 && !custom && (
        <div
          className="cg-live-layout-gaps"
          role="group"
          aria-label={localizeUi('Plate gaps, pixels')}
        >
          <div className="cg-live-layout-gap-control">
            <Icon icon={MoveHorizontal} size={14} />
            <LiveLayoutEditorNumber
              key={`${preset.id}-horizontal`}
              label={localizeUi('Horizontal gap')}
              value={preset.horizontalGap}
              min={0}
              max={layout.resolution.width}
              onChange={(horizontalGap) => changeGeometry({ horizontalGap })}
            />
            <span aria-hidden="true">{localizeUi('px')}</span>
          </div>
          <div className="cg-live-layout-gap-control">
            <Icon icon={MoveVertical} size={14} />
            <LiveLayoutEditorNumber
              key={`${preset.id}-vertical`}
              label={localizeUi('Vertical gap')}
              value={preset.verticalGap}
              min={0}
              max={layout.resolution.height}
              onChange={(verticalGap) => changeGeometry({ verticalGap })}
            />
            <span aria-hidden="true">{localizeUi('px')}</span>
          </div>
        </div>
      )}
      {!custom && (
        <MarginFields
          key={preset.id + '-preset-margins'}
          kind="Preset"
          resolution={layout.resolution}
          margins={liveSourceLayoutMargins(
            layout.resolution,
            preset.margins,
            count === 1 ? 0 : 0.05,
          )}
          onChange={(margins) => changeGeometry({ margins })}
        />
      )}
      <MarginFields
        key={preset.id + '-focus-margins'}
        kind="Focus"
        resolution={layout.resolution}
        margins={liveSourceLayoutMargins(layout.resolution, preset.focusMargins, 0)}
        onChange={(focusMargins) => changeGeometry({ focusMargins })}
      />
      {canEditCrop && (
        <LiveLayoutEditorCropControls
          key={preset.id + '-crop'}
          scope="preset"
          value={preset.plateCropFocus ?? DEFAULT_LIVE_CROP_FOCUS}
          canReset={preset.plateCropFocus !== undefined}
          onChange={onCropChange}
          onReset={() => onCropChange(undefined)}
        />
      )}
    </section>
  );
}
