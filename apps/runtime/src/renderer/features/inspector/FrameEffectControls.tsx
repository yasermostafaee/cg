import { useId, useState } from 'react';
import {
  FRAME_TRANSITION_MAX_MS,
  FRAME_TRANSITION_MIN_MS,
  FrameTransitionSchema,
  type FrameTransition,
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

export function FrameEffectControls({
  disabled,
  label = 'Frame effect',
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
    </fieldset>
  );
}
