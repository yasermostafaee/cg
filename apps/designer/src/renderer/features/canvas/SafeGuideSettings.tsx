import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CircleDot,
  Info,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import {
  PositionAnchorSchema,
  outputTranslate,
  type Position,
  type PositionAnchor,
  type Resolution,
} from '@cg/shared-schema';
import {
  BROADCAST_GUIDE_ASPECTS,
  DEFAULT_BROADCAST_GUIDE_CUSTOM_ASPECT,
  MAX_BROADCAST_GUIDE_ASPECT_PART,
  MAX_BROADCAST_GUIDE_LINES,
  broadcastGuideColor,
  normalizeBroadcastGuideColor,
  normalizeBroadcastGuideCustomAspect,
  type BroadcastGuideCustomAspect,
  type BroadcastGuideLine,
  type BroadcastGuideProfile,
} from '@cg/ui';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { Popover } from '../../ui/Popover.js';
import { designerStore } from '../../state/store.js';
import { RealtimeNumberInput } from '../inspector/controls.js';
import { designerGuideStore } from './broadcastGuideStore.js';
import * as colorStyle from './BackgroundControl.css.js';
import * as s from './SafeGuideSettings.css.js';

export function SafeGuideSettings({
  profile,
  buttonClassName,
  outputRaster,
  outputPosition,
  compositionResolution,
  onEdit,
}: {
  profile: BroadcastGuideProfile;
  buttonClassName: string;
  outputRaster: Resolution;
  outputPosition: Position;
  compositionResolution: Resolution;
  onEdit(): void;
}): JSX.Element {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const update = (next: BroadcastGuideProfile): void => {
    designerGuideStore.set(next);
    onEdit();
  };
  const customAspect = profile.customAspect ?? DEFAULT_BROADCAST_GUIDE_CUSTOM_ASPECT;
  const changeCustomAspect = (axis: keyof BroadcastGuideCustomAspect, value: number): void => {
    const ratio = normalizeBroadcastGuideCustomAspect({ ...customAspect, [axis]: value });
    if (ratio !== null) update({ ...profile, customAspect: ratio });
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
            <ProjectOutputControls
              raster={outputRaster}
              position={outputPosition}
              compositionResolution={compositionResolution}
              onEdit={onEdit}
            />
            <div className={s.heading}>
              <span>Guide aspect ratio</span>
              <span title="EBU R95 defines the 16:9 broadcast guides. Other ratios use proportional guides inside the project output.">
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
                  onClick={() =>
                    update({ ...profile, aspect, ...(aspect === 'custom' && { customAspect }) })
                  }
                >
                  {aspect === 'auto' ? 'Auto' : aspect === 'custom' ? 'Custom' : aspect}
                </Button>
              ))}
            </div>
            {profile.aspect === 'custom' && (
              <div className={s.outputGrid} role="group" aria-label="Custom guide ratio">
                <label className={s.outputField}>
                  <span>Ratio width</span>
                  <RealtimeNumberInput
                    className={s.input}
                    ariaLabel="Custom guide ratio width"
                    value={customAspect.width}
                    min={1}
                    max={MAX_BROADCAST_GUIDE_ASPECT_PART}
                    step={1}
                    scrub={false}
                    onCommit={(value) => changeCustomAspect('width', value)}
                  />
                </label>
                <label className={s.outputField}>
                  <span>Ratio height</span>
                  <RealtimeNumberInput
                    className={s.input}
                    ariaLabel="Custom guide ratio height"
                    value={customAspect.height}
                    min={1}
                    max={MAX_BROADCAST_GUIDE_ASPECT_PART}
                    step={1}
                    scrub={false}
                    onCommit={(value) => changeCustomAspect('height', value)}
                  />
                </label>
              </div>
            )}
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
              <span>Guide color</span>
              <GuideColorControl
                label="Guide color"
                value={profile.color}
                onChange={(color) => update({ ...profile, color })}
              />
            </div>
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
                    color={broadcastGuideColor(profile, line)}
                    index={index + 1}
                    change={(patch) => changeLine(line.id, patch)}
                    inherit={() =>
                      update({
                        ...profile,
                        lines: profile.lines.map((candidate) => {
                          if (candidate.id !== line.id) return candidate;
                          const { color: _override, ...inherited } = candidate;
                          return inherited;
                        }),
                      })
                    }
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
            <p className={s.hint}>Guide settings are shared across projects in this app.</p>
          </div>
        </Popover>
      )}
    </>
  );
}

const ANCHOR_LABELS: Record<PositionAnchor, string> = {
  'top-left': 'Top left',
  'top-center': 'Top center',
  'top-right': 'Top right',
  'mid-left': 'Middle left',
  center: 'Center',
  'mid-right': 'Middle right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom center',
  'bottom-right': 'Bottom right',
};

const ANCHOR_ICONS = {
  'top-left': ArrowUpLeft,
  'top-center': ArrowUp,
  'top-right': ArrowUpRight,
  'mid-left': ArrowLeft,
  center: CircleDot,
  'mid-right': ArrowRight,
  'bottom-left': ArrowDownLeft,
  'bottom-center': ArrowDown,
  'bottom-right': ArrowDownRight,
} satisfies Record<PositionAnchor, typeof ArrowUp>;

function ProjectOutputControls({
  raster,
  position,
  compositionResolution,
  onEdit,
}: {
  raster: Resolution;
  position: Position;
  compositionResolution: Resolution;
  onEdit(): void;
}): JSX.Element {
  const origin = outputTranslate({ resolution: compositionResolution }, position, raster);
  const changePosition = (next: Position): void => {
    designerStore.setCompositionOutputPosition(next);
    onEdit();
  };
  const changeRaster = (axis: keyof Resolution, value: number): void => {
    designerStore.setProjectOutputRaster({ ...raster, [axis]: Math.round(value) });
    onEdit();
  };
  const changeOrigin = (axis: 'x' | 'y', value: number): void => {
    changePosition({
      ...position,
      offset: { ...position.offset, [axis]: position.offset[axis] + value - origin[axis] },
    });
  };
  return (
    <section className={s.outputSettings} aria-label="Project output and composition placement">
      <strong>Project output frame</strong>
      <div className={s.outputGrid}>
        <label className={s.outputField}>
          <span>Width</span>
          <RealtimeNumberInput
            className={s.input}
            ariaLabel="Project output width"
            value={raster.width}
            min={1}
            step={1}
            scrub={false}
            onCommit={(value) => changeRaster('width', value)}
            onCommitBoundary={designerStore.markHistoryBoundary}
          />
        </label>
        <label className={s.outputField}>
          <span>Height</span>
          <RealtimeNumberInput
            className={s.input}
            ariaLabel="Project output height"
            value={raster.height}
            min={1}
            step={1}
            scrub={false}
            onCommit={(value) => changeRaster('height', value)}
            onCommitBoundary={designerStore.markHistoryBoundary}
          />
        </label>
      </div>
      <strong>Composition position on output</strong>
      <div className={s.placementControls}>
        <div className={s.anchorGrid} role="group" aria-label="Composition output anchor">
          {PositionAnchorSchema.options.map((anchor) => (
            <Button
              key={anchor}
              size="sm"
              className={s.anchorButton}
              aria-label={ANCHOR_LABELS[anchor]}
              title={ANCHOR_LABELS[anchor]}
              aria-pressed={position.anchor === anchor}
              selected={position.anchor === anchor}
              onClick={() => {
                changePosition({ anchor, offset: { x: 0, y: 0 } });
                designerStore.markHistoryBoundary();
              }}
            >
              <Icon icon={ANCHOR_ICONS[anchor]} size={13} />
            </Button>
          ))}
        </div>
        <div className={s.outputGrid}>
          <label className={s.outputField}>
            <span>X (px)</span>
            <RealtimeNumberInput
              className={s.input}
              ariaLabel="Composition output X"
              value={origin.x}
              onCommit={(value) => changeOrigin('x', value)}
              onCommitBoundary={designerStore.markHistoryBoundary}
            />
          </label>
          <label className={s.outputField}>
            <span>Y (px)</span>
            <RealtimeNumberInput
              className={s.input}
              ariaLabel="Composition output Y"
              value={origin.y}
              onCommit={(value) => changeOrigin('y', value)}
              onCommitBoundary={designerStore.markHistoryBoundary}
            />
          </label>
        </div>
      </div>
      <p className={s.hint}>Choose an anchor to reset the position. Drag X or Y to adjust it.</p>
    </section>
  );
}

function GuideRow({
  line,
  color,
  index,
  change,
  inherit,
  remove,
}: {
  line: BroadcastGuideLine;
  color: string;
  index: number;
  change(patch: Partial<BroadcastGuideLine>): void;
  inherit(): void;
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
      <GuideColorControl
        label={`Guide ${index} color`}
        value={color}
        onChange={(next) => change({ color: next })}
      />
      <Control
        variant="bare"
        aria-label={`Use guide color for guide ${index}`}
        title={line.color === undefined ? 'Using guide color' : 'Use guide color'}
        disabled={line.color === undefined}
        onClick={inherit}
      >
        <Icon icon={RotateCcw} size={13} />
      </Control>
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

function GuideColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(color: string): void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const normalized = normalizeBroadcastGuideColor(draft);
  const commit = (): void => {
    if (normalized === null) setDraft(value);
    else {
      setDraft(normalized);
      if (normalized !== value) onChange(normalized);
    }
  };
  return (
    <span className={s.colorControl}>
      <span className={colorStyle.swatchButton} style={{ background: value }}>
        <input
          className={colorStyle.colorInput}
          type="color"
          aria-label={label}
          value={value}
          onChange={(event) => {
            const next = normalizeBroadcastGuideColor(event.target.value);
            if (next !== null) onChange(next);
          }}
        />
      </span>
      <input
        className={s.colorHex}
        aria-label={`${label} hex`}
        aria-invalid={normalized === null}
        value={draft}
        maxLength={7}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
    </span>
  );
}
