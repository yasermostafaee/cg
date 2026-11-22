import { useRef, useState } from 'react';
import { parseLocalizedNumber } from '@cg/text-shaping';
import { NumericInput } from '../../ui/NumericInput.js';

export function LiveLayoutEditorNumber({
  label,
  value,
  min,
  max,
  step = 1,
  decimal = false,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimal?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}): JSX.Element {
  const [typed, setTyped] = useState<string>();
  const typing = useRef(false);
  return (
    <label className="cg-form-field">
      {label}
      <NumericInput
        className="cg-field"
        value={typed ?? String(value)}
        allow={decimal ? 'number' : 'digits'}
        decimal={decimal}
        disabled={disabled}
        scrub={{ step, min, max }}
        onFocus={() => {
          typing.current = true;
        }}
        onBlur={() => {
          typing.current = false;
          setTyped(undefined);
        }}
        onValueChange={(text) => {
          // Dragging adjusts the saved value without focusing the field for text entry.
          if (typing.current) setTyped(text);
          const number = parseLocalizedNumber(text);
          if (
            number !== null &&
            (decimal || Number.isSafeInteger(number)) &&
            number >= min &&
            number <= max
          )
            onChange(number);
        }}
      />
    </label>
  );
}
