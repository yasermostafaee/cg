import type { ComponentPropsWithoutRef } from 'react';

type SelectInputProps = Omit<ComponentPropsWithoutRef<'select'>, 'style'>;

/** Native select with the shared CG Control field appearance. */
export function SelectInput({ className, ...props }: SelectInputProps): JSX.Element {
  return <select {...props} className={['cg-field', className].filter(Boolean).join(' ')} />;
}
