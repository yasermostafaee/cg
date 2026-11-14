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

const MOTION_LABELS: Record<FrameTransition['motion'], string> = {
  cut: 'Cut',
  linear: 'Linear',
  'ease-in': 'Ease in',
  'ease-out': 'Ease out',
  'ease-in-out': 'Ease in/out',
};

export function FrameEffectControls({ disabled }: { disabled: boolean }): JSX.Element {
  const controlId = useId();
  const { motion, fade, durationMs } = useFrameTransitionPreference();
  const [typedDuration, setTypedDuration] = useState<string | null>(null);
  const hasEffect = motion !== 'cut' || fade;

  function changeDuration(value: string): void {
    setTypedDuration(value);
    const duration = Number(value);
    if (duration >= FRAME_TRANSITION_MIN_MS && duration <= FRAME_TRANSITION_MAX_MS)
      setFrameTransitionPreference({ durationMs: duration });
  }

  return (
    <fieldset className="cg-position-effect" disabled={disabled}>
      <legend>Frame effect</legend>
      <label>
        Motion
        <select
          className="cg-field"
          value={motion}
          onChange={(event) => {
            const next = FrameTransitionSchema.shape.motion.safeParse(event.currentTarget.value);
            if (next.success) setFrameTransitionPreference({ motion: next.data });
          }}
        >
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
          onChange={(next) => setFrameTransitionPreference({ fade: next })}
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
