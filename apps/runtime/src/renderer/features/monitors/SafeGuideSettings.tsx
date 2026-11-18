import { useEffect, useId, useRef, useState } from 'react';
import { MoveHorizontal, MoveVertical, Plus, RotateCcw, Settings2, Trash2, X } from 'lucide-react';
import {
  DEFAULT_BROADCAST_GUIDE_CUSTOM_ASPECT,
  MAX_BROADCAST_GUIDE_FRAMES,
  MAX_BROADCAST_GUIDE_ASPECT_PART,
  MAX_BROADCAST_GUIDE_LINES,
  broadcastGuideColor,
  broadcastGuideEditingFrame,
  broadcastGuideFrameSettings,
  createBroadcastGuideFrame,
  normalizeBroadcastGuideCustomAspect,
  type BroadcastGuideFrameSetting,
  type BroadcastGuideCustomAspect,
  type BroadcastGuideLine,
  type BroadcastGuideProfile,
} from '@cg/ui';
import { parseLocalizedNumber } from '@cg/text-shaping';
import { uuid } from '../../lib/uuid.js';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { ColorInput } from '../../ui/ColorInput.js';
import { Icon } from '../../ui/Icon.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { Popover } from '../../ui/Popover.js';
import { TextInput } from '../../ui/TextInput.js';
import { GUIDE_BORDER_LABELS, guideFrameLabel } from './safeGuideLabels.js';
import './safe-guide-settings.css';

type GuidePercent = BroadcastGuideFrameSetting['borders'][number]['percent'];

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
  const frames = broadcastGuideFrameSettings(profile);
  const editing = broadcastGuideEditingFrame(profile, frames);
  const selectFrame = (frame: BroadcastGuideFrameSetting, nextFrames = frames): void =>
    onChange({
      ...profile,
      frames: nextFrames,
      activeFrameId: frame.id,
      aspect: frame.aspect,
      ...(frame.customAspect === undefined ? {} : { customAspect: frame.customAspect }),
    });
  const changeFrame = (patch: Partial<BroadcastGuideFrameSetting>): void => {
    if (editing === undefined) return;
    const next = { ...editing, ...patch };
    selectFrame(
      next,
      frames.map((frame) => (frame.id === editing.id ? next : frame)),
    );
  };
  const changeBorder = (
    percent: GuidePercent,
    patch: { visible?: boolean; color?: string },
  ): void => {
    if (editing === undefined) return;
    changeFrame({
      borders: editing.borders.map((border) =>
        border.percent === percent ? { ...border, ...patch } : border,
      ),
    });
  };
  const inheritBorder = (percent: GuidePercent): void => {
    if (editing === undefined) return;
    changeFrame({
      borders: editing.borders.map((border) => {
        if (border.percent !== percent) return border;
        const { color: _override, ...inherited } = border;
        return inherited;
      }),
    });
  };
  const addCustomFrame = (): void => {
    if (frames.length >= MAX_BROADCAST_GUIDE_FRAMES) return;
    const frame = createBroadcastGuideFrame(uuid());
    selectFrame(frame, [...frames, frame]);
  };
  const removeCustomFrame = (): void => {
    if (editing?.aspect !== 'custom') return;
    const next = frames.filter((frame) => frame.id !== editing.id);
    const replacement = next[0];
    if (replacement !== undefined) selectFrame(replacement, next);
  };
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
          minWidth={400}
          maxHeight={560}
          onClose={() => setOpen(false)}
        >
          <div className="cg-safe-guide-settings">
            <header className="cg-safe-guide-settings__heading">
              <strong>Safe guides</strong>
              <Button variant="icon" aria-label="Close safe guides" onClick={() => setOpen(false)}>
                <Icon icon={X} size={14} />
              </Button>
            </header>
            <span className="cg-safe-guide-settings__label">
              Select a frame to edit. Visible frames stay on.
            </span>
            <div
              className="cg-safe-guide-settings__frames"
              role="radiogroup"
              aria-label="Guide aspect ratio"
              tabIndex={-1}
              onKeyDown={(event) => {
                const current = frames.findIndex((frame) => frame.id === editing?.id);
                let next = current;
                if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = frames.length - 1;
                else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
                  const step = (event.key === 'ArrowRight') !== rtl ? 1 : -1;
                  next = (current + step + frames.length) % frames.length;
                } else return;
                event.preventDefault();
                const frame = frames[next];
                if (frame === undefined) return;
                selectFrame(frame);
                const buttons =
                  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
                buttons.item(next)?.focus();
              }}
            >
              {frames.map((frame) => {
                const customIndex =
                  frames
                    .filter((entry) => entry.aspect === 'custom')
                    .findIndex((entry) => entry.id === frame.id) + 1;
                const label =
                  frame.aspect === 'custom'
                    ? `Custom ${String(customIndex)} (${guideFrameLabel(frame).replace('Custom ', '')})`
                    : guideFrameLabel(frame);
                return (
                  <Button
                    key={frame.id}
                    variant="neutral"
                    role="radio"
                    aria-label={label}
                    aria-checked={editing?.id === frame.id}
                    active={editing?.id === frame.id}
                    data-guide-aspect={frame.aspect}
                    data-guide-frame-id={frame.id}
                    data-frame-visible={frame.visible}
                    tabIndex={editing?.id === frame.id ? 0 : -1}
                    onClick={() => selectFrame(frame)}
                  >
                    {frame.aspect === 'custom' ? (
                      <span className="cg-safe-guide-settings__custom-label">
                        <span>Custom {customIndex}</span>
                        <small>{guideFrameLabel(frame).replace('Custom ', '')}</small>
                      </span>
                    ) : (
                      guideFrameLabel(frame)
                    )}
                    {frame.visible && (
                      <span className="cg-safe-guide-settings__visible" aria-hidden>
                        ●
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
            <div className="cg-safe-guide-settings__heading">
              <Button
                variant="neutral"
                aria-label="Add custom safe area"
                disabled={frames.length >= MAX_BROADCAST_GUIDE_FRAMES}
                onClick={addCustomFrame}
              >
                <Icon icon={Plus} size={13} /> Add custom
              </Button>
              {editing?.aspect === 'custom' && (
                <Button
                  variant="neutral"
                  aria-label="Remove custom safe area"
                  onClick={removeCustomFrame}
                >
                  <Icon icon={Trash2} size={13} /> Remove custom
                </Button>
              )}
            </div>
            {editing !== undefined && (
              <>
                {editing.aspect === 'custom' && (
                  <CustomAspectFields
                    key={editing.id}
                    value={editing.customAspect ?? DEFAULT_BROADCAST_GUIDE_CUSTOM_ASPECT}
                    onChange={(customAspect) => changeFrame({ customAspect })}
                  />
                )}
                <div className="cg-safe-guide-settings__heading">
                  <label className="cg-safe-guide-settings__check" htmlFor={`${id}-frame`}>
                    <Checkbox
                      id={`${id}-frame`}
                      checked={editing.visible}
                      onChange={(visible) => changeFrame({ visible })}
                    />{' '}
                    Show frame
                  </label>
                  <div className="cg-safe-guide-settings__check">
                    Frame color
                    <ColorInput
                      aria-label="Frame color"
                      className="cg-safe-guide-settings__color"
                      value={editing.color}
                      onChange={(color) => changeFrame({ color })}
                    />
                  </div>
                </div>
                <div
                  className="cg-safe-guide-settings__borders"
                  role="group"
                  aria-label="Safe area borders"
                >
                  {editing.borders.map((border) => (
                    <div key={border.percent} className="cg-safe-guide-settings__heading">
                      <label className="cg-safe-guide-settings__check">
                        <Checkbox
                          aria-label={`Show ${GUIDE_BORDER_LABELS[border.percent]}`}
                          checked={border.visible}
                          onChange={(visible) => changeBorder(border.percent, { visible })}
                        />
                        {GUIDE_BORDER_LABELS[border.percent]}
                      </label>
                      <div className="cg-safe-guide-settings__colors">
                        <ColorInput
                          aria-label={`${GUIDE_BORDER_LABELS[border.percent]} color`}
                          className="cg-safe-guide-settings__color"
                          value={border.color ?? editing.color}
                          onChange={(color) => changeBorder(border.percent, { color })}
                        />
                        <Button
                          variant="icon"
                          aria-label={`Use frame color for ${GUIDE_BORDER_LABELS[border.percent]}`}
                          title="Use frame color"
                          disabled={border.color === undefined}
                          onClick={() => inheritBorder(border.percent)}
                        >
                          <Icon icon={RotateCcw} size={13} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <details className="cg-safe-guide-settings__about">
              <summary>About safe areas</summary>
              <p>
                100% marks the full ratio frame. EBU R95 defines Action 93% and Graphics 90% for
                16:9. Other ratios use proportional guides; 80% is an additional guide.
              </p>
              <p>
                Frame visibility, borders and colors are independent. Guides appear only in Preview
                and New live layout; they never enter programme output.
              </p>
            </details>
            <div className="cg-safe-guide-settings__heading">
              <strong>Named guides</strong>
              <span className="cg-safe-guide-settings__label">
                {profile.lines.length}/{MAX_BROADCAST_GUIDE_LINES}
              </span>
            </div>
            <span className="cg-safe-guide-settings__label">
              Named guides use the selected frame ratio.
            </span>
            <div className="cg-safe-guide-settings__heading">
              Named guide color
              <ColorInput
                aria-label="Guide color"
                className="cg-safe-guide-settings__color"
                value={profile.color}
                onChange={(color) => onChange({ ...profile, color })}
              />
            </div>
            <div className="cg-safe-guide-settings__add">
              <Button
                variant="neutral"
                aria-label="Add horizontal guide"
                disabled={profile.lines.length >= MAX_BROADCAST_GUIDE_LINES}
                onClick={() => add('y')}
              >
                <Icon icon={Plus} size={13} />
                <Icon icon={MoveHorizontal} size={14} /> Horizontal
              </Button>
              <Button
                variant="neutral"
                aria-label="Add vertical guide"
                disabled={profile.lines.length >= MAX_BROADCAST_GUIDE_LINES}
                onClick={() => add('x')}
              >
                <Icon icon={Plus} size={13} />
                <Icon icon={MoveVertical} size={14} /> Vertical
              </Button>
            </div>
            <div className="cg-safe-guide-settings__lines">
              {profile.lines.map((line, index) => (
                <GuideRow
                  key={line.id}
                  line={line}
                  index={index + 1}
                  color={broadcastGuideColor(profile, line)}
                  onChange={(patch) => changeLine(line.id, patch)}
                  onInherit={() =>
                    onChange({
                      ...profile,
                      lines: profile.lines.map((entry) => {
                        if (entry.id !== line.id) return entry;
                        const { color, ...inherited } = entry;
                        return color === undefined ? entry : inherited;
                      }),
                    })
                  }
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

function CustomAspectFields({
  value,
  onChange,
}: {
  value: BroadcastGuideCustomAspect;
  onChange: (value: BroadcastGuideCustomAspect) => void;
}): JSX.Element {
  const id = useId();
  const [width, setWidth] = useState(String(value.width));
  const [height, setHeight] = useState(String(value.height));
  useEffect(() => setWidth(String(value.width)), [value.width]);
  useEffect(() => setHeight(String(value.height)), [value.height]);
  const parts = { width: parseLocalizedNumber(width), height: parseLocalizedNumber(height) };
  const next = normalizeBroadcastGuideCustomAspect(parts);
  const widthValid =
    normalizeBroadcastGuideCustomAspect({ width: parts.width, height: 1 }) !== null;
  const heightValid =
    normalizeBroadcastGuideCustomAspect({ width: 1, height: parts.height }) !== null;
  const commit = (): void => {
    if (next !== null) onChange(next);
    else {
      setWidth(String(value.width));
      setHeight(String(value.height));
    }
  };
  return (
    <div className="cg-safe-guide-settings__ratio" role="group" aria-label="Custom reference ratio">
      <label htmlFor={`${id}-width`}>
        <span className="cg-safe-guide-settings__label">Width</span>
        <NumericInput
          id={`${id}-width`}
          aria-label="Custom aspect width"
          value={width}
          min={1}
          max={MAX_BROADCAST_GUIDE_ASPECT_PART}
          maxLength={6}
          aria-invalid={!widthValid}
          onValueChange={setWidth}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      </label>
      <label htmlFor={`${id}-height`}>
        <span className="cg-safe-guide-settings__label">Height</span>
        <NumericInput
          id={`${id}-height`}
          aria-label="Custom aspect height"
          value={height}
          min={1}
          max={MAX_BROADCAST_GUIDE_ASPECT_PART}
          maxLength={6}
          aria-invalid={!heightValid}
          onValueChange={setHeight}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      </label>
    </div>
  );
}

function GuideRow({
  line,
  index,
  color,
  onChange,
  onInherit,
  onRemove,
}: {
  line: BroadcastGuideLine;
  index: number;
  color: string;
  onChange: (patch: Partial<BroadcastGuideLine>) => void;
  onInherit: () => void;
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
      <div className="cg-safe-guide-settings__colors">
        <ColorInput
          aria-label={`${label} color`}
          className="cg-safe-guide-settings__color"
          value={color}
          onChange={(color) => onChange({ color })}
        />
        <Button
          variant="icon"
          aria-label={`Use guide color for ${label.toLowerCase()}`}
          title="Use guide color"
          disabled={line.color === undefined}
          onClick={onInherit}
        >
          <Icon icon={RotateCcw} size={13} />
        </Button>
      </div>
      <Button variant="icon" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
        <Icon icon={Trash2} size={14} />
      </Button>
    </div>
  );
}
