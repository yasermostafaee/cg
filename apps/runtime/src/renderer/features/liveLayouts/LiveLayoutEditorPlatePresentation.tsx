import { useState } from 'react';
import {
  CONTROL_LIVE_LAYOUT_PLATE_ASPECT_MAX,
  CONTROL_LIVE_LAYOUT_PLATE_ASPECT_MIN,
  type ControlLiveLayoutPlateOverride,
} from '@cg/shared-schema';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import './live-layout-plate-presentation.css';

const ASPECT_CHOICES = [
  [16 / 9, '16:9'],
  [4 / 3, '4:3'],
  [1, '1:1'],
  [3 / 4, '3:4'],
  [9 / 16, '9:16'],
] as const;

export function LiveLayoutEditorPlatePresentation({
  scope,
  value,
  inheritedAspect,
  inheritedFit,
  onChange,
}: {
  scope: 'preset' | 'plate';
  value: ControlLiveLayoutPlateOverride | undefined;
  inheritedAspect: number;
  inheritedFit: string;
  onChange: (value: ControlLiveLayoutPlateOverride) => void;
}): JSX.Element {
  const [editingCustom, setEditingCustom] = useState(false);
  const aspect = value?.aspectRatio;
  const standardAspect = ASPECT_CHOICES.find(([ratio]) => ratio === aspect)?.[0];
  const aspectChoice =
    editingCustom || (aspect !== undefined && standardAspect === undefined)
      ? 'custom'
      : standardAspect === undefined
        ? ''
        : String(standardAspect);
  const preset = scope === 'preset';
  return (
    <div className="cg-live-layout-plate-presentation">
      <label>
        Plate aspect ratio
        <select
          className="cg-field"
          aria-label={preset ? 'Preset plate aspect ratio' : 'Plate aspect ratio'}
          value={aspectChoice}
          onChange={(event) => {
            const selected = event.target.value;
            setEditingCustom(selected === 'custom');
            if (selected !== 'custom')
              onChange({ aspectRatio: selected === '' ? undefined : Number(selected) });
          }}
        >
          <option value="">{preset ? 'Match canvas' : 'Preset default'}</option>
          {ASPECT_CHOICES.map(([ratio, label]) => (
            <option key={ratio} value={ratio}>
              {label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>
      {aspectChoice === 'custom' && (
        <LiveLayoutEditorNumber
          label="Custom width ÷ height"
          value={Number((aspect ?? inheritedAspect).toFixed(3))}
          min={CONTROL_LIVE_LAYOUT_PLATE_ASPECT_MIN}
          max={CONTROL_LIVE_LAYOUT_PLATE_ASPECT_MAX}
          step={0.05}
          decimal
          onChange={(aspectRatio) => onChange({ aspectRatio })}
        />
      )}
      <label>
        Input fit
        <select
          className="cg-field"
          aria-label={preset ? 'Preset input fit' : 'Plate input fit'}
          value={value?.fitMode ?? ''}
          onChange={(event) => {
            const fit = event.target.value;
            onChange({ fitMode: fit === 'contain' || fit === 'cover' ? fit : undefined });
          }}
        >
          <option value="">{inheritedFit}</option>
          <option value="contain">Fit whole picture</option>
          <option value="cover">Crop edges</option>
        </select>
      </label>
    </div>
  );
}
