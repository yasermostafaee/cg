import { useUiText } from '../../i18n/locale.js';
import { Crop, RotateCcw } from 'lucide-react';
import { MAX_LIVE_CROP_ZOOM, type LiveCropFocus } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import './live-layout-crop-controls.css';

const toPercent = (value: number): number => Math.round(value * 1000) / 10;

export function LiveLayoutEditorCropControls({
  scope,
  value,
  editing = false,
  canEditPreview,
  canReset,
  onChange,
  onEditChange,
  onReset,
}: {
  scope: 'preset' | 'plate';
  value: LiveCropFocus;
  editing?: boolean | undefined;
  canEditPreview?: boolean | undefined;
  canReset: boolean;
  onChange: (focus: LiveCropFocus) => void;
  onEditChange?: ((editing: boolean) => void) | undefined;
  onReset: () => void;
}): JSX.Element {
  const localizeUi = useUiText();
  const preset = scope === 'preset';
  const group = localizeUi(preset ? 'Crop defaults' : 'Plate crop');
  const resetLabel = localizeUi(preset ? 'Reset default crop' : 'Reset plate crop');
  return (
    <section className="cg-live-layout-crop-controls" aria-label={group}>
      <div className="cg-live-layout-crop-head">
        <span>{group}</span>
        <div className="cg-live-layout-crop-actions">
          {onEditChange !== undefined && (
            <Button
              variant="neutral"
              active={editing}
              aria-pressed={editing}
              disabled={!canEditPreview}
              onClick={() => onEditChange(!editing)}
            >
              <Icon icon={Crop} size={14} />
              {localizeUi('Edit crop in preview')}
            </Button>
          )}
          <Button
            variant="icon"
            aria-label={resetLabel}
            title={resetLabel}
            disabled={!canReset}
            onClick={onReset}
          >
            <Icon icon={RotateCcw} size={14} />
          </Button>
        </div>
      </div>
      <div className="cg-form-grid cg-live-layout-crop-values">
        <LiveLayoutEditorNumber
          label={localizeUi(preset ? 'Default crop X (%)' : 'Crop X (%)')}
          value={toPercent(value.x)}
          min={0}
          max={100}
          decimal
          onChange={(x) => onChange({ ...value, x: x / 100 })}
        />
        <LiveLayoutEditorNumber
          label={localizeUi(preset ? 'Default crop Y (%)' : 'Crop Y (%)')}
          value={toPercent(value.y)}
          min={0}
          max={100}
          decimal
          onChange={(y) => onChange({ ...value, y: y / 100 })}
        />
        <LiveLayoutEditorNumber
          label={localizeUi(preset ? 'Default crop zoom (%)' : 'Crop zoom (%)')}
          value={toPercent(value.zoom ?? 1)}
          min={100}
          max={MAX_LIVE_CROP_ZOOM * 100}
          decimal
          onChange={(zoom) => onChange({ ...value, zoom: zoom / 100 })}
        />
      </div>
    </section>
  );
}
