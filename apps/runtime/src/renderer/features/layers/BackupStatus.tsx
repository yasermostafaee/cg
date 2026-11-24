import { useUiText } from '../../i18n/locale.js';
import { useId, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { Popover } from '../../ui/Popover.js';
import { plateLabelOf } from './takeRefusalLine.js';

type Clips = NonNullable<StackItemState['backupNoCopy']>;

const MEDIA_ISSUES: Readonly<Record<Clips[number]['reason'], { reason: string; next: string }>> = {
  'no-copy': {
    reason: 'Matching copy missing from the backup media library.',
    next: 'Check media synchronization and library indexing in the backup Playout before taking the graphic again.',
  },
  'no-fingerprint': {
    reason: 'Primary media fingerprint missing.',
    next: 'Check the source file in the primary media library.',
  },
  'backup-old': {
    reason: 'Backup Playout is older than 2.9.1.',
    next: 'Update the backup Playout to a version that supports media fingerprints.',
  },
  'backup-unread': {
    reason: 'Backup media library unread.',
    next: 'Check the backup engine connection and Bridge sign-in.',
  },
};

export function BackupStatus({
  item,
  template,
  compact = false,
}: {
  item: StackItemState;
  template: TemplateInfo | null | undefined;
  compact?: boolean;
}): JSX.Element | null {
  const clips = item.backupNoCopy ?? [];
  const live = item.backupUnmirrored === true;
  if (clips.length === 0 && !live) return null;
  return (
    <BackupDetails
      key={item.itemId}
      clips={clips}
      live={live}
      template={template}
      compact={compact}
    />
  );
}

function BackupDetails({
  clips,
  live,
  template,
  compact,
}: {
  clips: Clips;
  live: boolean;
  template: TemplateInfo | null | undefined;
  compact: boolean;
}): JSX.Element {
  const localizeUi = useUiText();
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        ref={anchor}
        variant="caution"
        className="cg-backup-status"
        aria-label={localizeUi('Backup incomplete')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={localizeUi('Backup incomplete. View details')}
        onClick={() => setOpen(!open)}
      >
        <Icon icon={TriangleAlert} size={12} />
        {compact ? ' B' : localizeUi('Backup incomplete')}
      </Button>
      {open && (
        <Popover
          anchor={anchor}
          onClose={() => setOpen(false)}
          id={id}
          aria-label={localizeUi('Backup details')}
          minWidth={320}
          maxHeight={360}
        >
          <div className="cg-backup-details" dir="ltr">
            {clips.length > 0 && (
              <ul className="cg-backup-details__clips">
                {clips.map(({ plateId, name, reason }) => {
                  const plate = plateLabelOf(template, plateId);
                  return (
                    <li key={plateId}>
                      <strong>
                        {plate !== undefined && `${plate} · `}
                        <IsolatedName>{name}</IsolatedName>
                      </strong>
                      <span>{localizeUi(MEDIA_ISSUES[reason].reason)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {live && (
              <p>
                {localizeUi('Live inputs routed through Playout remain on the primary engine.')}
              </p>
            )}
            {Array.from(new Set(clips.map(({ reason }) => reason)), (reason) => (
              <p key={reason}>{localizeUi(MEDIA_ISSUES[reason].next)}</p>
            ))}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {localizeUi('Close')}
            </Button>
          </div>
        </Popover>
      )}
    </>
  );
}
