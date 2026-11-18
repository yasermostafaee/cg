import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, Plus, Settings2, Trash2, X } from 'lucide-react';
import {
  BROADCAST_GUIDE_ASPECTS,
  MAX_BROADCAST_GUIDE_LINES,
  type BroadcastGuideLine,
  type BroadcastGuideProfile,
} from '@cg/ui';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { Popover } from '../../ui/Popover.js';
import { designerGuideStore } from './broadcastGuideStore.js';
import * as s from './SafeGuideSettings.css.js';

export function SafeGuideSettings({
  profile,
  buttonClassName,
  onEdit,
}: {
  profile: BroadcastGuideProfile;
  buttonClassName: string;
  onEdit(): void;
}): JSX.Element {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const update = (next: BroadcastGuideProfile): void => {
    designerGuideStore.set(next);
    onEdit();
  };
  const changeLine = (id: string, patch: Partial<BroadcastGuideLine>): void =>
    update({
      ...profile,
      lines: profile.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    });
  const add = (axis: 'x' | 'y'): void => {
    if (profile.lines.length === MAX_BROADCAST_GUIDE_LINES) return;
    update({
      ...profile,
      lines: [
        ...profile.lines,
        {
          id: crypto.randomUUID(),
          name: `Guide ${profile.lines.length + 1}`,
          axis,
          position: 50,
          visible: true,
        },
      ],
    });
  };
  return (
    <>
      <Control
        ref={anchor}
        variant="bare"
        className={buttonClassName}
        aria-label="Configure safe guides"
        title="Configure safe guides"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
      >
        <Icon icon={Settings2} size={14} />
      </Control>
      {open && (
        <Popover anchor={anchor} aria-label="Safe guides" onClose={close}>
          <div className={s.body}>
            <div className={s.heading}>
              <strong>Safe guides</strong>
              <Control
                aria-label="Close safe guide settings"
                size="sm"
                variant="bare"
                onClick={close}
              >
                <Icon icon={X} size={14} />
              </Control>
            </div>
            <div className={s.heading}>
              <span>Reference frame</span>
              <span title="EBU R95 is the 16:9 broadcast reference. Other ratios use proportional composition guides.">
                <Icon icon={Info} size={13} />
              </span>
            </div>
            <div className={s.choices} role="radiogroup" aria-label="Guide aspect ratio">
              {BROADCAST_GUIDE_ASPECTS.map((aspect) => (
                <Button
                  key={aspect}
                  size="sm"
                  role="radio"
                  aria-checked={profile.aspect === aspect}
                  selected={profile.aspect === aspect}
                  onClick={() => update({ ...profile, aspect })}
                >
                  {aspect === 'auto' ? 'Auto' : aspect}
                </Button>
              ))}
            </div>
            <label className={s.check}>
              <input
                className={s.checkbox}
                type="checkbox"
                checked={profile.standardVisible}
                onChange={(event) => update({ ...profile, standardVisible: event.target.checked })}
              />
              Broadcast safe areas
            </label>
            <div className={s.heading}>
              <span>Custom guides</span>
              <div className={s.choices}>
                <Button
                  size="sm"
                  aria-label="Add horizontal guide"
                  disabled={profile.lines.length >= MAX_BROADCAST_GUIDE_LINES}
                  onClick={() => add('y')}
                >
                  <Icon icon={Plus} size={12} />
                  Horizontal
                </Button>
                <Button
                  size="sm"
                  aria-label="Add vertical guide"
                  disabled={profile.lines.length >= MAX_BROADCAST_GUIDE_LINES}
                  onClick={() => add('x')}
                >
                  <Icon icon={Plus} size={12} />
                  Vertical
                </Button>
              </div>
            </div>
            {profile.lines.length === 0 ? (
              <p className={s.hint}>
                Add a line and set its position as a percentage of the reference frame.
              </p>
            ) : (
              <div className={s.list}>
                {profile.lines.map((line, index) => (
                  <GuideRow
                    key={line.id}
                    line={line}
                    index={index + 1}
                    change={(patch) => changeLine(line.id, patch)}
                    remove={() =>
                      update({
                        ...profile,
                        lines: profile.lines.filter((candidate) => candidate.id !== line.id),
                      })
                    }
                  />
                ))}
              </div>
            )}
            <p className={s.hint}>Saved for all projects in this app. Preview only.</p>
          </div>
        </Popover>
      )}
    </>
  );
}

function GuideRow({
  line,
  index,
  change,
  remove,
}: {
  line: BroadcastGuideLine;
  index: number;
  change(patch: Partial<BroadcastGuideLine>): void;
  remove(): void;
}): JSX.Element {
  const [position, setPosition] = useState(String(line.position));
  useEffect(() => setPosition(String(line.position)), [line.position]);
  const number = Number(position);
  const valid = position.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= 100;
  return (
    <div className={s.row}>
      <input
        className={s.checkbox}
        type="checkbox"
        aria-label={`Show guide ${index}`}
        checked={line.visible}
        onChange={(event) => change({ visible: event.target.checked })}
      />
      <span className={s.axis} title={line.axis === 'x' ? 'Vertical' : 'Horizontal'}>
        {line.axis === 'x' ? 'V' : 'H'}
      </span>
      <input
        className={s.input}
        dir="auto"
        aria-label={`Guide ${index} name`}
        value={line.name}
        maxLength={80}
        onChange={(event) => change({ name: event.target.value })}
      />
      <span className={s.position}>
        <input
          className={s.input}
          type="number"
          min={0}
          max={100}
          step={0.1}
          aria-label={`Guide ${index} position percent`}
          aria-invalid={!valid}
          value={position}
          onChange={(event) => {
            const raw = event.target.value;
            setPosition(raw);
            const next = Number(raw);
            if (raw !== '' && Number.isFinite(next) && next >= 0 && next <= 100)
              change({ position: next });
          }}
          onBlur={() => {
            if (!valid) setPosition(String(line.position));
          }}
        />
        <span>%</span>
      </span>
      <Control
        variant="bare"
        aria-label={`Remove guide ${index}`}
        title="Remove guide"
        onClick={remove}
      >
        <Icon icon={Trash2} size={13} />
      </Control>
    </div>
  );
}
