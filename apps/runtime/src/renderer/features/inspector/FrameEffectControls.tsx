import { useUiText } from '../../i18n/locale.js';
import { useId, useState } from 'react';
import {
  FRAME_TRANSITION_MAX_MS,
  FRAME_TRANSITION_MIN_MS,
  FrameTransitionSchema,
  InputTransitionDirectionSchema,
  type FrameTransition,
  type InputTransitionDirection,
} from '@cg/shared-schema';
import { Checkbox } from '../../ui/Checkbox.js';
import { NumericInput } from '../../ui/NumericInput.js';
import {
  setFrameTransitionPreference,
  useFrameTransitionPreference,
} from './frameTransitionPreference.js';

import { setRowEffectOverrides, useRowEffectOverrides } from './rowEffectOverrides.js';

const MOTION_LABELS: Record<FrameTransition['motion'], string> = {
  cut: 'Cut',
  linear: 'Linear',
  'ease-in': 'Ease in',
  'ease-out': 'Ease out',
  'ease-in-out': 'Ease in/out',
  bounce: 'Bounce',
  elastic: 'Elastic',
};

const DEPARTURE_LABELS: Record<InputTransitionDirection, string> = {
  left: 'Slide left + fade',
  right: 'Slide right + fade',
  up: 'Slide up + fade',
  down: 'Slide down + fade',
};

const ARRIVAL_LABELS: Record<InputTransitionDirection, string> = {
  left: 'Slide in from left + fade',
  right: 'Slide in from right + fade',
  up: 'Slide in from top + fade',
  down: 'Slide in from bottom + fade',
};

export function PresetPlateDirectionControl({
  phase,
  direction,
  onChange,
}: {
  phase: 'enter' | 'exit';
  direction: InputTransitionDirection | undefined;
  onChange: (direction: InputTransitionDirection | undefined) => void;
}): JSX.Element {
  const localizeUi = useUiText();
  const label = phase === 'enter' ? 'Arriving plates' : 'Departing plates';
  const choices = phase === 'enter' ? ARRIVAL_LABELS : DEPARTURE_LABELS;
  return (
    <label className="cg-preset-plate-direction-control">
      {label}
      <select
        className="cg-field"
        aria-label={label}
        value={direction ?? ''}
        onChange={(event) => {
          const value = event.currentTarget.value;
          const parsed = InputTransitionDirectionSchema.safeParse(value);
          if (value === '' || parsed.success) onChange(parsed.success ? parsed.data : undefined);
        }}
      >
        <option value="">{localizeUi('Fade')}</option>
        {InputTransitionDirectionSchema.options.map((option) => (
          <option key={option} value={option}>
            {choices[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FrameEffectControls({
  disabled,
  label = 'Move / resize effect',
  preset,
}: {
  disabled: boolean;
  label?: string;
  preset?: { itemId: string; value: FrameTransition; defaultLabel?: string } | undefined;
}): JSX.Element {
  const localizeUi = useUiText();
  const controlId = useId();
  const consoleDefault = useFrameTransitionPreference();
  const override = useRowEffectOverrides(preset?.itemId ?? '')?.preset;
  const effect = preset === undefined ? consoleDefault : (override ?? preset.value);
  const { motion, fade, durationMs } = effect;
  function changeEffect(change: Partial<FrameTransition>): void {
    if (preset === undefined) setFrameTransitionPreference(change);
    else setRowEffectOverrides(preset.itemId, { preset: { ...effect, ...change } });
  }
  const [typedDuration, setTypedDuration] = useState<string | null>(null);
  const hasEffect = motion !== 'cut' || fade;

  function changeDuration(value: string): void {
    setTypedDuration(value);
    const duration = Number(value);
    if (duration >= FRAME_TRANSITION_MIN_MS && duration <= FRAME_TRANSITION_MAX_MS)
      changeEffect({ durationMs: duration });
  }

  return (
    <fieldset className="cg-position-effect" disabled={disabled}>
      <legend>{label}</legend>
      <label>
        {localizeUi('Motion')}
        <select
          className="cg-field"
          aria-label={localizeUi('Motion')}
          value={preset !== undefined && override === undefined ? 'default' : motion}
          onChange={(event) => {
            if (event.currentTarget.value === 'default' && preset !== undefined) {
              setRowEffectOverrides(preset.itemId, { preset: undefined });
              setTypedDuration(null);
            } else {
              const next = FrameTransitionSchema.shape.motion.safeParse(event.currentTarget.value);
              if (next.success) changeEffect({ motion: next.data });
            }
          }}
        >
          {preset !== undefined && (
            <option value="default">
              {preset.defaultLabel ?? 'Layout default'} ({MOTION_LABELS[preset.value.motion]})
            </option>
          )}
          {FrameTransitionSchema.shape.motion.options.map((value) => (
            <option key={value} value={value}>
              {MOTION_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="cg-position-aspect" htmlFor={`${controlId}-fade`}>
        <Checkbox
          id={`${controlId}-fade`}
          checked={fade}
          onChange={(next) => changeEffect({ fade: next })}
        />
        {localizeUi('Fade')}
      </label>
      {hasEffect && (
        <label htmlFor={`${controlId}-duration`}>
          {localizeUi('Duration (ms)')}
          <NumericInput
            id={`${controlId}-duration`}
            className="cg-field"
            allow="digits"
            scrub={{ step: 20, min: FRAME_TRANSITION_MIN_MS, max: FRAME_TRANSITION_MAX_MS }}
            title={`${String(FRAME_TRANSITION_MIN_MS)}–${String(FRAME_TRANSITION_MAX_MS)} ms`}
            value={typedDuration ?? String(durationMs)}
            onValueChange={changeDuration}
            onBlur={() => setTypedDuration(null)}
          />
        </label>
      )}
      {preset !== undefined && hasEffect && (
        <>
          <PresetPlateDirectionControl
            phase="enter"
            direction={effect.enterDirection}
            onChange={(enterDirection) => changeEffect({ enterDirection })}
          />
          <PresetPlateDirectionControl
            phase="exit"
            direction={effect.exitDirection}
            onChange={(exitDirection) => changeEffect({ exitDirection })}
          />
        </>
      )}
    </fieldset>
  );
}
