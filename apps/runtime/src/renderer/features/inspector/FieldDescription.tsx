import { useUiText } from '../../i18n/locale.js';
import { useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { Popover } from '../../ui/Popover.js';

export function FieldDescription({
  label,
  description,
}: {
  label: string;
  description: string | undefined;
}): JSX.Element | null {
  const localizeUi = useUiText();
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  if (description === undefined || description.trim() === '') return null;
  const name = `Description for ${label}`;
  return (
    <>
      <Button
        ref={anchor}
        variant="ghost"
        title={localizeUi('Field description')}
        aria-label={name}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((visible) => !visible)}
      >
        <Icon icon={Info} size={13} />
      </Button>
      {open && (
        <Popover
          anchor={anchor}
          onClose={() => setOpen(false)}
          id={id}
          aria-label={name}
          minWidth={260}
          maxHeight={280}
        >
          <div className="cg-field-description">
            <p dir="auto">{description}</p>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {localizeUi('Close')}
            </Button>
          </div>
        </Popover>
      )}
    </>
  );
}
