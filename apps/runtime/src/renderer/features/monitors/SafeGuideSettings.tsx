import { useEffect, useId, useRef, useState } from 'react';
import { MoveHorizontal, MoveVertical, Plus, Settings2, Trash2, X } from 'lucide-react';
import {
  BROADCAST_GUIDE_ASPECTS,
  MAX_BROADCAST_GUIDE_LINES,
  type BroadcastGuideLine,
  type BroadcastGuideProfile,
} from '@cg/ui';
import { parseLocalizedNumber } from '@cg/text-shaping';
import { uuid } from '../../lib/uuid.js';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { Icon } from '../../ui/Icon.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { Popover } from '../../ui/Popover.js';
import { TextInput } from '../../ui/TextInput.js';
import './safe-guide-settings.css';

export function SafeGuideSettings({
  profile,
  onChange,
}: {
  profile: BroadcastGuideProfile;
  onChange: (profile: BroadcastGuideProfile) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const changeLine = (lineId: string, patch: Partial<BroadcastGuideLine>): void =>
    onChange({
      ...profile,
      lines: profile.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    });
  const add = (axis: BroadcastGuideLine['axis']): void => {
    if (profile.lines.length >= MAX_BROADCAST_GUIDE_LINES) return;
    onChange({
      ...profile,
      lines: [
        ...profile.lines,
        {
          id: uuid(),
          axis,
          position: 50,
          visible: true,
          name: `${axis === 'y' ? 'Horizontal' : 'Vertical'} ${String(profile.lines.length + 1)}`,
        },
      ],
    });
  };
  return (
    <>
      <Button
        ref={anchor}
        variant="icon"
        aria-label="Configure safe guides"
        title="Configure safe guides"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <Icon icon={Settings2} size={13} />
      </Button>
      {open && (
        <Popover
          anchor={anchor}
          id={id}
          aria-label="Safe guides"
          minWidth={360}
          maxHeight={480}
          onClose={() => setOpen(false)}
        >
          <div className="cg-safe-guide-settings">
            <header className="cg-safe-guide-settings__heading">
              <strong>Safe guides</strong>
              <Button variant="icon" aria-label="Close safe guides" onClick={() => setOpen(false)}>
                <Icon icon={X} size={14} />
              </Button>
            </header>
            <span className="cg-safe-guide-settings__label">Aspect ratio</span>
            <div
              className="cg-safe-guide-settings__aspects"
              role="radiogroup"
              aria-label="Guide aspect ratio"
              tabIndex={-1}
              onKeyDown={(event) => {
                const current = BROADCAST_GUIDE_ASPECTS.indexOf(profile.aspect);
                let next = current;
                if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = BROADCAST_GUIDE_ASPECTS.length - 1;
                else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
                  const step = (event.key === 'ArrowRight') !== rtl ? 1 : -1;
                  next =
                    (current + step + BROADCAST_GUIDE_ASPECTS.length) %
                    BROADCAST_GUIDE_ASPECTS.length;
                } else return;
                event.preventDefault();
                const aspect = BROADCAST_GUIDE_ASPECTS[next];
                if (aspect === undefined) return;
                onChange({ ...profile, aspect });
                event.currentTarget
                  .querySelector<HTMLButtonElement>(`[data-guide-aspect="${aspect}"]`)
                  ?.focus();
              }}
            >
              {BROADCAST_GUIDE_ASPECTS.map((aspect) => (
                <Button
                  key={aspect}
                  variant="neutral"
                  role="radio"
                  aria-checked={profile.aspect === aspect}
                  active={profile.aspect === aspect}
                  data-guide-aspect={aspect}
                  tabIndex={profile.aspect === aspect ? 0 : -1}
                  onClick={() => onChange({ ...profile, aspect })}
                >
                  {aspect === 'auto' ? 'Auto' : aspect}
                </Button>
              ))}
            </div>
            <label
              className="cg-safe-guide-settings__check"
              htmlFor={`${id}-standard`}
              title="EBU R95 Action 93% / Graphics 90% for 16:9; proportional guides for other aspect ratios."
            >
              <Checkbox
                id={`${id}-standard`}
                checked={profile.standardVisible}
                onChange={(standardVisible) => onChange({ ...profile, standardVisible })}
              />
              Broadcast safe areas
            </label>
            <div className="cg-safe-guide-settings__heading">
              <strong>Custom guides</strong>
              <span className="cg-safe-guide-settings__label">
                {profile.lines.length}/{MAX_BROADCAST_GUIDE_LINES}
              </span>
            </div>
            <div className="cg-safe-guide-settings__add">
              <Button
                variant="neutral"
                aria-label="Add horizontal guide"
                disabled={profile.lines.length >= MAX_BROADCAST_GUIDE_LINES}
                onClick={() => add('y')}
              >
                <Icon icon={Plus} size={13} />
                <Icon icon={MoveHorizontal} size={14} />
                Horizontal
              </Button>
              <Button
                variant="neutral"
                aria-label="Add vertical guide"
                disabled={profile.lines.length >= MAX_BROADCAST_GUIDE_LINES}
                onClick={() => add('x')}
              >
                <Icon icon={Plus} size={13} />
                <Icon icon={MoveVertical} size={14} />
                Vertical
              </Button>
            </div>
            <div className="cg-safe-guide-settings__lines">
              {profile.lines.map((line, index) => (
                <GuideRow
                  key={line.id}
                  line={line}
                  index={index + 1}
                  onChange={(patch) => changeLine(line.id, patch)}
                  onRemove={() =>
                    onChange({
                      ...profile,
                      lines: profile.lines.filter((entry) => entry.id !== line.id),
                    })
                  }
                />
              ))}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

function GuideRow({
  line,
  index,
  onChange,
  onRemove,
}: {
  line: BroadcastGuideLine;
  index: number;
  onChange: (patch: Partial<BroadcastGuideLine>) => void;
  onRemove: () => void;
}): JSX.Element {
  const [position, setPosition] = useState(String(line.position));
  useEffect(() => setPosition(String(line.position)), [line.position]);
  const number = parseLocalizedNumber(position);
  const valid = number !== null && number >= 0 && number <= 100;
  const savePosition = (): void => {
    if (valid && number !== null) onChange({ position: number });
    else setPosition(String(line.position));
  };
  const label = `Guide ${String(index)}`;
  return (
    <div className="cg-safe-guide-settings__line" data-custom-guide-row={line.id}>
      <Checkbox
        aria-label={`Show ${label.toLowerCase()}`}
        checked={line.visible}
        onChange={(visible) => onChange({ visible })}
      />
      <span
        className="cg-safe-guide-settings__axis"
        title={line.axis === 'y' ? 'Horizontal' : 'Vertical'}
      >
        <Icon icon={line.axis === 'y' ? MoveHorizontal : MoveVertical} size={14} />
      </span>
      <TextInput
        aria-label={`${label} name`}
        value={line.name}
        onChange={(name) => onChange({ name })}
        maxLength={80}
        dir="auto"
      />
      <div className="cg-safe-guide-settings__position">
        <NumericInput
          aria-label={`${label} position percent`}
          value={position}
          decimal
          maxLength={8}
          aria-invalid={!valid}
          onValueChange={setPosition}
          onBlur={savePosition}
          onKeyDown={(event) => {
            if (event.key === 'Enter') savePosition();
          }}
        />
        <span>%</span>
      </div>
      <Button variant="icon" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
        <Icon icon={Trash2} size={14} />
      </Button>
    </div>
  );
}
