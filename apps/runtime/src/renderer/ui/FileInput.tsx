import { forwardRef, type InputHTMLAttributes } from 'react';

export type FileInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** The single Runtime primitive for a native file chooser input. */
export const FileInput = forwardRef<HTMLInputElement, FileInputProps>(
  function FileInput(props, ref): JSX.Element {
    return <input {...props} ref={ref} type="file" />;
  },
);
