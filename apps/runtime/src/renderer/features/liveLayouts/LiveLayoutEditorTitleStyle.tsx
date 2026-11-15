import {
  CONTROL_LIVE_LAYOUT_TITLE_FONTS,
  CONTROL_LIVE_LAYOUT_TITLE_SIZE_MAX_PERCENT,
  CONTROL_LIVE_LAYOUT_TITLE_SIZE_MIN_PERCENT,
  type ControlLiveLayoutTitleStyle,
  type Resolution,
} from '@cg/shared-schema';
import { ColorInput } from '../../ui/ColorInput.js';
import { controlLiveLayoutTitleGeometry } from './controlLiveLayoutCompiler.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';

const toTenths = (value: number): number => Math.round(value * 10) / 10;

export function LiveLayoutEditorTitleStyle({
  raster,
  style,
  onChange,
}: {
  raster: Resolution;
  style: ControlLiveLayoutTitleStyle | undefined;
  onChange: (patch: ControlLiveLayoutTitleStyle) => void;
}): JSX.Element {
  const title = controlLiveLayoutTitleGeometry(raster, style);
  const color = title.backgroundColor.slice(0, 7);
  const alpha = title.backgroundColor.slice(7);
  const opacity = alpha === '' ? 100 : Math.round((Number.parseInt(alpha, 16) / 255) * 100);

  return (
    <details className="cg-live-layout-title-style">
      <summary>Title style</summary>
      <div className="cg-live-layout-title-fields">
        <LiveLayoutEditorNumber
          label="Title X (%)"
          value={toTenths(title.xPercent)}
          min={0}
          max={100}
          decimal
          onChange={(xPercent) => onChange({ xPercent })}
        />
        <LiveLayoutEditorNumber
          label="Title Y (%)"
          value={toTenths(title.yPercent)}
          min={0}
          max={100}
          decimal
          onChange={(yPercent) => onChange({ yPercent })}
        />
        <LiveLayoutEditorNumber
          label="Title size (%)"
          value={toTenths(title.sizePercent)}
          min={CONTROL_LIVE_LAYOUT_TITLE_SIZE_MIN_PERCENT}
          max={CONTROL_LIVE_LAYOUT_TITLE_SIZE_MAX_PERCENT}
          step={0.1}
          decimal
          onChange={(sizePercent) => onChange({ sizePercent })}
        />
        <label>
          Title font
          <select
            className="cg-field"
            aria-label="Title font"
            value={title.fontFamily}
            onChange={(event) => {
              const value = event.currentTarget.value;
              const fontFamily = CONTROL_LIVE_LAYOUT_TITLE_FONTS.find((font) => font === value);
              if (fontFamily !== undefined) onChange({ fontFamily });
            }}
          >
            {CONTROL_LIVE_LAYOUT_TITLE_FONTS.map((font) => (
              <option key={font}>{font}</option>
            ))}
          </select>
        </label>
        <div className="cg-live-layout-title-field">
          <span>Title background</span>
          <ColorInput
            className="cg-field"
            aria-label="Title background"
            value={color}
            onChange={(backgroundColor) => onChange({ backgroundColor: backgroundColor + alpha })}
          />
        </div>
        <LiveLayoutEditorNumber
          label="Title background opacity (%)"
          value={opacity}
          min={0}
          max={100}
          onChange={(next) => {
            const opacityHex = Math.round((next / 100) * 255)
              .toString(16)
              .padStart(2, '0');
            onChange({ backgroundColor: color + opacityHex });
          }}
        />
      </div>
    </details>
  );
}
