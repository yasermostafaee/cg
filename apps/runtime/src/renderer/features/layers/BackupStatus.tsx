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
    next: 'Add the same file to the backup media library, then take the graphic again.',
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
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        ref={anchor}
        variant="caution"
        className="cg-backup-status"
        aria-label="Backup incomplete"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title="Backup incomplete. View details"
        onClick={() => setOpen(!open)}
      >
        <Icon icon={TriangleAlert} size={12} />
        {compact ? ' B' : ' Backup incomplete'}
      </Button>
      {open && (
        <Popover
          anchor={anchor}
          onClose={() => setOpen(false)}
          id={id}
          aria-label="Backup details"
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
                      <span>{MEDIA_ISSUES[reason].reason}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {live && <p>Live inputs routed through Playout remain on the primary engine.</p>}
            {Array.from(new Set(clips.map(({ reason }) => reason)), (reason) => (
              <p key={reason}>{MEDIA_ISSUES[reason].next}</p>
            ))}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </Popover>
      )}
    </>
  );
}
