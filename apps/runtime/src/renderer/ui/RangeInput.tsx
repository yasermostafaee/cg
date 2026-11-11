import type { InputHTMLAttributes } from 'react';

type RangeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** Native range input with pointer and keyboard interaction. */
export function RangeInput(props: RangeInputProps): JSX.Element {
  return <input {...props} type="range" />;
}
