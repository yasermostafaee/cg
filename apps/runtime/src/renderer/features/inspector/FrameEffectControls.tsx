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

export function PresetDepartureControl({
  direction,
  onChange,
}: {
  direction: InputTransitionDirection | undefined;
  onChange: (direction: InputTransitionDirection | undefined) => void;
}): JSX.Element {
  return (
    <label className="cg-preset-departure-control">
      Departing plates
      <select
        className="cg-field"
        aria-label="Departing plates"
        value={direction ?? ''}
        onChange={(event) => {
          const value = event.currentTarget.value;
          const parsed = InputTransitionDirectionSchema.safeParse(value);
          if (value === '' || parsed.success) onChange(parsed.success ? parsed.data : undefined);
        }}
      >
        <option value="">Fade</option>
        {InputTransitionDirectionSchema.options.map((option) => (
          <option key={option} value={option}>
            {DEPARTURE_LABELS[option]}
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
  preset?: { itemId: string; value: FrameTransition } | undefined;
}): JSX.Element {
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
        Motion
        <select
          className="cg-field"
          aria-label="Motion"
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
            <option value="default">Layout default ({MOTION_LABELS[preset.value.motion]})</option>
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
        Fade
      </label>
      {hasEffect && (
        <label htmlFor={`${controlId}-duration`}>
          Duration (ms)
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
        <PresetDepartureControl
          direction={effect.exitDirection}
          onChange={(exitDirection) => changeEffect({ exitDirection })}
        />
      )}
    </fieldset>
  );
}
