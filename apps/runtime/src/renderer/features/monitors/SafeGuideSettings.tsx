import { useUiText } from '../../i18n/locale.js';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Check,
  Eye,
  MoveHorizontal,
  MoveVertical,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
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
  onReset,
}: {
  profile: BroadcastGuideProfile;
  onChange: (profile: BroadcastGuideProfile) => void;
  onReset: () => void;
}): JSX.Element {
  const localizeUi = useUiText();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const frameList = useRef<HTMLDivElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const returnToReset = useRef(false);
  const id = useId();
  const frames = broadcastGuideFrameSettings(profile);
  const editing = broadcastGuideEditingFrame(profile, frames);
  useLayoutEffect(() => {
    const list = frameList.current;
    const selected = list?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!list || !selected) return;
    const frame = selected.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    if (frame.top < bounds.top) list.scrollTop += frame.top - bounds.top;
    else if (frame.bottom > bounds.bottom) list.scrollTop += frame.bottom - bounds.bottom;
  }, [open, editing?.id, confirmReset]);
  useEffect(() => {
    if (confirmReset) cancelButton.current?.focus();
    else if (returnToReset.current) {
      returnToReset.current = false;
      resetButton.current?.focus();
    }
  }, [confirmReset]);
  const finishReset = (restore: boolean): void => {
    if (restore) onReset();
    returnToReset.current = true;
    setConfirmReset(false);
  };
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
        aria-label={localizeUi('Safe area settings')}
        title={localizeUi('Safe area settings')}
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
          aria-label={localizeUi('Safe area settings')}
          minWidth={460}
          maxHeight={560}
          onClose={() => (confirmReset ? finishReset(false) : setOpen(false))}
        >
          <div className="cg-form cg-safe-guide-settings">
            <header className="cg-safe-guide-settings__heading">
              <strong>{localizeUi('Safe area settings')}</strong>
              <Button
                variant="icon"
                aria-label={localizeUi('Close safe area settings')}
                onClick={() => {
                  setOpen(false);
                  setConfirmReset(false);
                }}
              >
                <Icon icon={X} size={14} />
              </Button>
            </header>
            {confirmReset ? (
              <section
                className="cg-safe-guide-settings__confirmation"
                role="group"
                aria-labelledby={`${id}-question`}
              >
                <strong id={`${id}-question`}>{localizeUi('Restore safe area defaults?')}</strong>
                <p>
                  {localizeUi(
                    'This resets frame ratios, borders and colors, and removes added frames and named guides from Preview and New live layout.',
                  )}
                </p>
                <div className="cg-safe-guide-settings__actions">
                  <Button variant="neutral" ref={cancelButton} onClick={() => finishReset(false)}>
                    {localizeUi('Cancel')}
                  </Button>
                  <Button variant="danger" onClick={() => finishReset(true)}>
                    {localizeUi('Restore defaults')}
                  </Button>
                </div>
              </section>
            ) : (
              <>
                <div className="cg-safe-guide-settings__scroll">
                  <div className="cg-safe-guide-settings__legend">
                    <strong>{localizeUi('Edit frame')}</strong>
                    <span>
                      <Icon icon={Eye} size={13} /> {localizeUi('Shown in preview')}
                    </span>
                  </div>
                  <div
                    className="cg-safe-guide-settings__frames"
                    ref={frameList}
                    role="radiogroup"
                    aria-label={localizeUi('Guide aspect ratio')}
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
                      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        const columns = getComputedStyle(
                          event.currentTarget,
                        ).gridTemplateColumns.split(' ').length;
                        next = Math.max(
                          0,
                          Math.min(
                            frames.length - 1,
                            current + (event.key === 'ArrowDown' ? columns : -columns),
                          ),
                        );
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
                          active={editing?.id === frame.id}
                          role="radio"
                          aria-label={label}
                          aria-description={
                            frame.visible
                              ? localizeUi('Shown in preview')
                              : localizeUi('Hidden in preview')
                          }
                          title={`${label} · ${frame.visible ? 'Shown' : 'Hidden'} in preview`}
                          aria-checked={editing?.id === frame.id}
                          data-guide-aspect={frame.aspect}
                          data-guide-frame-id={frame.id}
                          data-frame-visible={frame.visible}
                          tabIndex={editing?.id === frame.id ? 0 : -1}
                          onClick={() => selectFrame(frame)}
                        >
                          {editing?.id === frame.id && (
                            <span className="cg-safe-guide-settings__selected">
                              <Icon icon={Check} size={12} />
                            </span>
                          )}
                          {frame.aspect === 'custom' ? (
                            <span className="cg-safe-guide-settings__custom-label">
                              <span>
                                {localizeUi('Custom')} {customIndex}
                              </span>
                              <small>{guideFrameLabel(frame).replace('Custom ', '')}</small>
                            </span>
                          ) : (
                            guideFrameLabel(frame)
                          )}
                          {frame.visible && (
                            <span className="cg-safe-guide-settings__visible" aria-hidden>
                              <Icon icon={Eye} size={12} />
                            </span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                  <div className="cg-safe-guide-settings__actions">
                    <Button
                      variant="add"
                      aria-label={localizeUi('Add custom safe area')}
                      disabled={frames.length >= MAX_BROADCAST_GUIDE_FRAMES}
                      onClick={addCustomFrame}
                    >
                      <Icon icon={Plus} size={13} /> {localizeUi('Add custom')}
                    </Button>
                    {editing?.aspect === 'custom' && (
                      <Button
                        variant="danger"
                        aria-label={localizeUi('Remove custom safe area')}
                        onClick={removeCustomFrame}
                      >
                        <Icon icon={Trash2} size={13} /> {localizeUi('Remove custom')}
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
                          {localizeUi('Show frame')}
                        </label>
                        <label
                          className="cg-form-field cg-form-field--inline"
                          htmlFor={`${id}-frame-color`}
                        >
                          {localizeUi('Frame color')}
                          <ColorInput
                            appearance="swatch"
                            id={`${id}-frame-color`}
                            aria-label={localizeUi('Frame color')}
                            value={editing.color}
                            onChange={(color) => changeFrame({ color })}
                          />
                        </label>
                      </div>
                      <div
                        className="cg-safe-guide-settings__borders"
                        role="group"
                        aria-label={localizeUi('Safe area borders')}
                      >
                        {editing.borders.map((border) => (
                          <div key={border.percent} className="cg-safe-guide-settings__heading">
                            <label className="cg-safe-guide-settings__check">
                              <Checkbox
                                aria-label={localizeUi('Show {name}', {
                                  name: GUIDE_BORDER_LABELS[border.percent],
                                })}
                                checked={border.visible}
                                onChange={(visible) => changeBorder(border.percent, { visible })}
                              />
                              {GUIDE_BORDER_LABELS[border.percent]}
                            </label>
                            <div className="cg-safe-guide-settings__colors">
                              <ColorInput
                                appearance="swatch"
                                aria-label={localizeUi('{border} color', {
                                  border: GUIDE_BORDER_LABELS[border.percent],
                                })}
                                value={border.color ?? editing.color}
                                onChange={(color) => changeBorder(border.percent, { color })}
                              />
                              <Button
                                variant="icon"
                                aria-label={localizeUi('Use frame color for {name}', {
                                  name: GUIDE_BORDER_LABELS[border.percent],
                                })}
                                title={localizeUi('Use frame color')}
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
                    <summary>{localizeUi('About safe areas')}</summary>
                    <p>
                      {localizeUi(
                        '100% marks the full ratio frame. EBU R95 defines Action 93% and Graphics 90% for 16:9. Other ratios use proportional guides; 80% is an additional guide.',
                      )}
                    </p>
                    <p>
                      {localizeUi(
                        'Frame visibility, borders and colors are independent. Guides appear only in Preview and New live layout; they never enter programme output.',
                      )}
                    </p>
                  </details>
                  <div className="cg-safe-guide-settings__heading">
                    <strong>{localizeUi('Named guides')}</strong>
                    <span className="cg-safe-guide-settings__label">
                      {profile.lines.length}/{MAX_BROADCAST_GUIDE_LINES}
                    </span>
                  </div>
                  <span className="cg-safe-guide-settings__label">
                    {localizeUi('Named guides use the selected frame ratio.')}
                  </span>
                  <label
                    className="cg-form-field cg-form-field--inline"
                    htmlFor={`${id}-guide-color`}
                  >
                    {localizeUi('Named guide color')}
                    <ColorInput
                      appearance="swatch"
                      id={`${id}-guide-color`}
                      aria-label={localizeUi('Guide color')}
                      value={profile.color}
                      onChange={(color) => onChange({ ...profile, color })}
                    />
                  </label>
                  <div className="cg-safe-guide-settings__add">
                    <Button
                      variant="neutral"
                      aria-label={localizeUi('Add horizontal guide')}
                      disabled={profile.lines.length >= MAX_BROADCAST_GUIDE_LINES}
                      onClick={() => add('y')}
                    >
                      <Icon icon={Plus} size={13} />
                      <Icon icon={MoveHorizontal} size={14} /> {localizeUi('Horizontal')}
                    </Button>
                    <Button
                      variant="neutral"
                      aria-label={localizeUi('Add vertical guide')}
                      disabled={profile.lines.length >= MAX_BROADCAST_GUIDE_LINES}
                      onClick={() => add('x')}
                    >
                      <Icon icon={Plus} size={13} />
                      <Icon icon={MoveVertical} size={14} /> {localizeUi('Vertical')}
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
                <footer className="cg-safe-guide-settings__footer">
                  <Button variant="ghost" ref={resetButton} onClick={() => setConfirmReset(true)}>
                    <Icon icon={RotateCcw} size={13} /> {localizeUi('Restore defaults…')}
                  </Button>
                </footer>
              </>
            )}
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
  const localizeUi = useUiText();
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
    <div
      className="cg-form-grid cg-safe-guide-settings__ratio"
      role="group"
      aria-label={localizeUi('Custom reference ratio')}
    >
      <label className="cg-form-field" htmlFor={`${id}-width`}>
        <span>{localizeUi('Width')}</span>
        <NumericInput
          className="cg-field"
          id={`${id}-width`}
          aria-label={localizeUi('Custom aspect width')}
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
      <label className="cg-form-field" htmlFor={`${id}-height`}>
        <span>{localizeUi('Height')}</span>
        <NumericInput
          className="cg-field"
          id={`${id}-height`}
          aria-label={localizeUi('Custom aspect height')}
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
  const localizeUi = useUiText();
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
      <div className="cg-safe-guide-settings__line-heading">
        <Checkbox
          aria-label={localizeUi('Show {name}', { name: label.toLowerCase() })}
          checked={line.visible}
          onChange={(visible) => onChange({ visible })}
        />
        <span
          className="cg-safe-guide-settings__axis"
          title={line.axis === 'y' ? localizeUi('Horizontal') : localizeUi('Vertical')}
        >
          <Icon icon={line.axis === 'y' ? MoveHorizontal : MoveVertical} size={14} />
        </span>
        <TextInput
          className="cg-safe-guide-settings__line-name"
          aria-label={localizeUi('{guide} name', { guide: label })}
          value={line.name}
          onChange={(name) => onChange({ name })}
          maxLength={80}
          dir="auto"
        />
      </div>
      <div className="cg-safe-guide-settings__line-controls">
        <div className="cg-safe-guide-settings__position">
          <NumericInput
            className="cg-field"
            aria-label={localizeUi('{guide} position percent', { guide: label })}
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
            appearance="swatch"
            aria-label={localizeUi('{guide} color', { guide: label })}
            value={color}
            onChange={(color) => onChange({ color })}
          />
          <Button
            variant="icon"
            aria-label={localizeUi('Use guide color for {name}', { name: label.toLowerCase() })}
            title={localizeUi('Use guide color')}
            disabled={line.color === undefined}
            onClick={onInherit}
          >
            <Icon icon={RotateCcw} size={13} />
          </Button>
        </div>
        <Button
          variant="icon"
          aria-label={localizeUi('Remove {name}', { name: label.toLowerCase() })}
          onClick={onRemove}
        >
          <Icon icon={Trash2} size={14} />
        </Button>
      </div>
    </div>
  );
}
