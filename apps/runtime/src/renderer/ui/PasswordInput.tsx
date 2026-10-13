import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './Button.js';
import { Icon } from './Icon.js';
import { TextInput, type TextInputProps } from './TextInput.js';

/**
 * 🔴 `R-082` (`CONSOLE-POLISH-01` §7) — **THE SHARED PASSWORD FIELD: a `TextInput` with a show/hide
 * control.** Every password the console asks for — the Playout's, first-run's, CG Bridge's own —
 * renders through here, so the three sign-in surfaces cannot drift apart again (they had no show
 * control at all, and one of them submitted on Enter from this field only).
 *
 * The control is an icon `Button` INSIDE the field's edge, named by what it will do — `Show
 * password` / `Hide password` — and the label carries the state, so it takes no `aria-pressed` (the
 * `Button` primitive's own rule for a toggle that flips its label). It is disabled with the field.
 *
 * A password is a machine token, never prose: the field is LTR whatever the page's direction, which
 * is why `dir` is not on this type.
 */
export type PasswordInputProps = Omit<TextInputProps, 'type' | 'dir'>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(props, ref): JSX.Element {
    const [shown, setShown] = useState(false);
    const label = shown ? 'Hide password' : 'Show password';
    return (
      <span className="cg-password" data-password-shown={shown ? 'true' : 'false'}>
        <TextInput {...props} ref={ref} type={shown ? 'text' : 'password'} dir="ltr" />
        <Button
          variant="icon"
          className="cg-password__toggle"
          aria-label={label}
          title={label}
          disabled={props.disabled}
          onClick={() => setShown((s) => !s)}
        >
          <Icon icon={shown ? EyeOff : Eye} size={14} />
        </Button>
      </span>
    );
  },
);
