import { useId, useState } from 'react';
import {
  FRAME_TRANSITION_MAX_MS,
  FRAME_TRANSITION_MIN_MS,
  InputTransitionSchema,
} from '@cg/shared-schema';
import { NumericInput } from '../../ui/NumericInput.js';
import {
  setInputTransitionPreference,
  useInputTransitionPreference,
} from './inputTransitionPreference.js';

export function InputEffectControls(): JSX.Element {
  const durationId = useId();
  const { mode, durationMs } = useInputTransitionPreference();
  const [typedDuration, setTypedDuration] = useState<string | null>(null);
  return (
    <fieldset className="cg-position-effect">
      <legend>Input effect</legend>
      <label>
        Transition
        <select
          aria-label="Input transition"
          className="cg-field"
          value={mode}
          onChange={(event) => {
            const next = InputTransitionSchema.shape.mode.safeParse(event.currentTarget.value);
            if (next.success) setInputTransitionPreference({ mode: next.data });
            setTypedDuration(null);
          }}
        >
          <option value="cut">Cut</option>
          <option value="fade">Fade</option>
        </select>
      </label>
      {mode === 'fade' && (
        <label htmlFor={durationId}>
          Duration (ms)
          <NumericInput
            id={durationId}
            className="cg-field"
            allow="digits"
            scrub={{ step: 20, min: FRAME_TRANSITION_MIN_MS, max: FRAME_TRANSITION_MAX_MS }}
            value={typedDuration ?? String(durationMs)}
            onValueChange={(value) => {
              setTypedDuration(value);
              const duration = InputTransitionSchema.shape.durationMs.safeParse(Number(value));
              if (duration.success) setInputTransitionPreference({ durationMs: duration.data });
            }}
            onBlur={() => setTypedDuration(null)}
          />
        </label>
      )}
    </fieldset>
  );
}
