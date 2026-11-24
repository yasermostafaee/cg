import { useUiText } from '../../i18n/locale.js';
import { useId, useState } from 'react';
import {
  DEFAULT_INPUT_SLIDE_DIRECTION,
  FRAME_TRANSITION_MAX_MS,
  FRAME_TRANSITION_MIN_MS,
  InputTransitionDirectionSchema,
  InputTransitionSchema,
  isInputSlideMode,
  type ControlLiveLayout,
  type InputTransition,
  type InputTransitionDirection,
} from '@cg/shared-schema';
import { NumericInput } from '../../ui/NumericInput.js';
import {
  authoredInputTransition,
  setInputTransitionPreference,
  useInputTransitionPreference,
} from './inputTransitionPreference.js';

import { setRowEffectOverrides, useRowEffectOverrides } from './rowEffectOverrides.js';

const MODE_LABELS: Record<InputTransition['mode'], string> = {
  cut: 'Cut',
  fade: 'Fade',
  push: 'Push',
  'slide-over': 'Slide over',
};

const DIRECTION_LABELS: Record<InputTransitionDirection, string> = {
  left: 'From left',
  right: 'From right',
  up: 'From top',
  down: 'From bottom',
};

export function InputEffectControls({
  itemId,
  layout,
}: {
  itemId: string;
  layout?: ControlLiveLayout | undefined;
}): JSX.Element {
  const localizeUi = useUiText();
  const durationId = useId();
  const consoleDefault = useInputTransitionPreference();
  const override = useRowEffectOverrides(itemId)?.input;
  const effect =
    layout === undefined ? consoleDefault : (override ?? authoredInputTransition(layout));
  const { mode, durationMs, direction = DEFAULT_INPUT_SLIDE_DIRECTION } = effect;
  function changeEffect(change: Partial<InputTransition>): void {
    if (layout === undefined) setInputTransitionPreference(change);
    else setRowEffectOverrides(itemId, { input: { ...effect, ...change } });
  }
  const [typedDuration, setTypedDuration] = useState<string | null>(null);
  return (
    <fieldset className="cg-position-effect">
      <legend>{localizeUi('Input effect')}</legend>
      <div className="cg-position-effect__body cg-inspector-effect--input">
        <label className="cg-inspector-control-label cg-effect-transition">
          {localizeUi('Transition')}
          <select
            aria-label={localizeUi('Input transition')}
            className="cg-field"
            value={layout !== undefined && override === undefined ? 'default' : mode}
            onChange={(event) => {
              if (event.currentTarget.value === 'default') {
                setRowEffectOverrides(itemId, { input: undefined });
              } else {
                const next = InputTransitionSchema.shape.mode.safeParse(event.currentTarget.value);
                if (next.success) changeEffect({ mode: next.data });
              }
              setTypedDuration(null);
            }}
          >
            {layout !== undefined && (
              <option value="default">
                {localizeUi('Layout default ({effect})', {
                  effect: localizeUi(MODE_LABELS[authoredInputTransition(layout).mode]),
                })}
              </option>
            )}
            {InputTransitionSchema.shape.mode.options.map((value) => (
              <option key={value} value={value}>
                {localizeUi(MODE_LABELS[value])}
              </option>
            ))}
          </select>
        </label>
        {isInputSlideMode(mode) && (
          <label className="cg-inspector-control-label cg-effect-direction">
            {localizeUi('Direction')}
            <select
              aria-label={localizeUi('Input direction')}
              className="cg-field"
              value={direction}
              onChange={(event) => {
                const next = InputTransitionDirectionSchema.safeParse(event.currentTarget.value);
                if (next.success) changeEffect({ direction: next.data });
              }}
            >
              {InputTransitionDirectionSchema.options.map((value) => (
                <option key={value} value={value}>
                  {localizeUi(DIRECTION_LABELS[value])}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode !== 'cut' && (
          <label className="cg-inspector-control-label cg-effect-duration" htmlFor={durationId}>
            {localizeUi('Duration (ms)')}
            <NumericInput
              id={durationId}
              className="cg-field"
              allow="digits"
              scrub={{ step: 20, min: FRAME_TRANSITION_MIN_MS, max: FRAME_TRANSITION_MAX_MS }}
              value={typedDuration ?? String(durationMs)}
              onValueChange={(value) => {
                setTypedDuration(value);
                const duration = InputTransitionSchema.shape.durationMs.safeParse(Number(value));
                if (duration.success) changeEffect({ durationMs: duration.data });
              }}
              onBlur={() => setTypedDuration(null)}
            />
          </label>
        )}
      </div>
    </fieldset>
  );
}
