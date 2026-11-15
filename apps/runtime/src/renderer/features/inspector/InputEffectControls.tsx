import { useId, useState } from 'react';
import {
  DEFAULT_INPUT_SLIDE_DIRECTION,
  FRAME_TRANSITION_MAX_MS,
  FRAME_TRANSITION_MIN_MS,
  InputTransitionDirectionSchema,
  InputTransitionSchema,
  isInputSlideMode,
  type InputTransitionDirection,
} from '@cg/shared-schema';
import { NumericInput } from '../../ui/NumericInput.js';
import {
  setInputTransitionPreference,
  useInputTransitionPreference,
} from './inputTransitionPreference.js';

const DIRECTION_LABELS: Record<InputTransitionDirection, string> = {
  left: 'From left',
  right: 'From right',
  up: 'From top',
  down: 'From bottom',
};

export function InputEffectControls(): JSX.Element {
  const durationId = useId();
  const {
    mode,
    durationMs,
    direction = DEFAULT_INPUT_SLIDE_DIRECTION,
  } = useInputTransitionPreference();
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
          <option value="push">Push</option>
          <option value="slide-over">Slide over</option>
        </select>
      </label>
      {isInputSlideMode(mode) && (
        <label>
          Direction
          <select
            aria-label="Input direction"
            className="cg-field"
            value={direction}
            onChange={(event) => {
              const next = InputTransitionDirectionSchema.safeParse(event.currentTarget.value);
              if (next.success) setInputTransitionPreference({ direction: next.data });
            }}
          >
            {InputTransitionDirectionSchema.options.map((value) => (
              <option key={value} value={value}>
                {DIRECTION_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode !== 'cut' && (
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
