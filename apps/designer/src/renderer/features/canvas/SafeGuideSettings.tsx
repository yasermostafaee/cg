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
  Check,
  Plus,
  Trash2,
  RotateCcw,
  Settings2,
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
  DEFAULT_BROADCAST_GUIDE_CUSTOM_ASPECT,
  DEFAULT_BROADCAST_GUIDE_PROFILE,
  MAX_BROADCAST_GUIDE_ASPECT_PART,
  MAX_BROADCAST_GUIDE_FRAMES,
  broadcastGuideEditingFrame,
  createBroadcastGuideFrame,
  broadcastGuideFrameSettings,
  normalizeBroadcastGuideColor,
  normalizeBroadcastGuideCustomAspect,
  type BroadcastGuideCustomAspect,
  type BroadcastGuideProfile,
  type BroadcastGuideFrameSetting,
  type BroadcastGuideBorder,
} from '@cg/ui';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { Popover } from '../../ui/Popover.js';
import { Modal, ModalButton } from '../shell/Modal.js';
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
  const [confirmReset, setConfirmReset] = useState(false);
  const returnToReset = useRef(false);
  const choices = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const update = (next: BroadcastGuideProfile): void => {
    designerGuideStore.set(next);
    onEdit();
  };
  const frames = broadcastGuideFrameSettings(profile);
  const activeFrame = broadcastGuideEditingFrame(profile, frames);
  useEffect(() => {
    const list = choices.current;
    const selected = list?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!list || !selected) return;
    const box = selected.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    if (box.bottom > bounds.bottom) list.scrollTop += box.bottom - bounds.bottom;
    else if (box.top < bounds.top) list.scrollTop -= bounds.top - box.top;
  }, [activeFrame?.id, open, confirmReset]);
  const selectFrame = (frame: BroadcastGuideFrameSetting, nextFrames = frames): void =>
    update({
      ...profile,
      frames: nextFrames,
      aspect: frame.aspect,
      activeFrameId: frame.id,
      ...(frame.customAspect === undefined ? {} : { customAspect: frame.customAspect }),
    });
  const updateFrame = (next: BroadcastGuideFrameSetting): void =>
    selectFrame(
      next,
      frames.map((frame) => (frame.id === next.id ? next : frame)),
    );
  const updateBorder = (next: BroadcastGuideBorder): void => {
    if (activeFrame === undefined) return;
    updateFrame({
      ...activeFrame,
      borders: activeFrame.borders.map((border) =>
        border.percent === next.percent ? next : border,
      ),
    });
  };
  const customAspect = activeFrame?.customAspect ?? DEFAULT_BROADCAST_GUIDE_CUSTOM_ASPECT;
  const changeCustomAspect = (axis: keyof BroadcastGuideCustomAspect, value: number): void => {
    const ratio = normalizeBroadcastGuideCustomAspect({ ...customAspect, [axis]: value });
    if (ratio !== null && activeFrame?.aspect === 'custom')
      updateFrame({ ...activeFrame, customAspect: ratio });
  };
  const addCustom = (): void => {
    const frame = createBroadcastGuideFrame(crypto.randomUUID());
    selectFrame(frame, [...frames, frame]);
  };
  const removeCustom = (): void => {
    if (activeFrame?.aspect !== 'custom') return;
    const nextFrames = frames.filter((frame) => frame.id !== activeFrame.id);
    const next = nextFrames.find((frame) => frame.aspect === 'custom') ?? nextFrames[0];
    if (next !== undefined) selectFrame(next, nextFrames);
  };
  return (
    <>
      <Control
        ref={anchor}
        variant="bare"
        className={buttonClassName}
        aria-label="Configure safe areas"
        title="Configure safe areas"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          returnToReset.current = false;
          setOpen((shown) => !shown);
        }}
      >
        <Icon icon={Settings2} size={14} />
      </Control>
      {open && !confirmReset && (
        <Popover
          anchor={anchor}
          aria-label="Safe area settings"
          onClose={close}
          initialFocusSelector={returnToReset.current ? '[data-safe-area-reset]' : undefined}
        >
          <div className={s.body}>
            <div className={s.heading}>
              <strong>Safe area settings</strong>
              <Control
                aria-label="Close safe area settings"
                size="sm"
                variant="bare"
                onClick={close}
              >
                <Icon icon={X} size={14} />
              </Control>
            </div>
            <div className={s.scrollBody}>
              <ProjectOutputControls
                raster={outputRaster}
                position={outputPosition}
                compositionResolution={compositionResolution}
                onEdit={onEdit}
              />
              <div className={s.heading}>
                <span>Reference frames</span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={addCustom}
                  disabled={frames.length >= MAX_BROADCAST_GUIDE_FRAMES}
                >
                  <Icon icon={Plus} size={13} />
                  Add custom frame
                </Button>
              </div>
              <div
                ref={choices}
                className={s.choices}
                role="radiogroup"
                aria-label="Guide aspect ratio"
              >
                {frames.map((frame, index) => {
                  const label =
                    frame.customAspect === undefined
                      ? frame.aspect === 'auto'
                        ? 'Auto'
                        : frame.aspect
                      : `${frame.customAspect.width}:${frame.customAspect.height}`;
                  const current = activeFrame?.id === frame.id;
                  const customName =
                    frame.aspect === 'custom'
                      ? 'Custom ' +
                        frames.slice(0, index + 1).filter((f) => f.aspect === 'custom').length
                      : undefined;
                  return (
                    <Button
                      key={frame.id}
                      size="sm"
                      role="radio"
                      className={s.choice}
                      aria-label={label}
                      aria-description={customName}
                      tabIndex={current ? 0 : -1}
                      title={frame.visible ? 'Visible on canvas' : 'Hidden on canvas'}
                      aria-checked={current}
                      selected={current}
                      onClick={() => selectFrame(frame)}
                      onKeyDown={(e) => {
                        let next: number;
                        switch (e.key) {
                          case 'ArrowDown':
                          case 'ArrowRight':
                            next = (index + 1) % frames.length;
                            break;
                          case 'ArrowUp':
                          case 'ArrowLeft':
                            next = (index + frames.length - 1) % frames.length;
                            break;
                          case 'Home':
                            next = 0;
                            break;
                          case 'End':
                            next = frames.length - 1;
                            break;
                          default:
                            return;
                        }
                        e.preventDefault();
                        const radios =
                          choices.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
                        radios?.[next]?.focus({ preventScroll: true });
                        selectFrame(frames[next]!);
                      }}
                    >
                      {current && (
                        <span className={s.selectedMark}>
                          <Icon icon={Check} size={12} />
                        </span>
                      )}
                      {customName && <span>{customName}</span>}
                      <span>{label}</span>
                      {frame.visible && (
                        <span
                          aria-hidden="true"
                          className={s.visibleDot}
                          style={{ backgroundColor: frame.color }}
                        />
                      )}
                    </Button>
                  );
                })}
              </div>
              {activeFrame?.aspect === 'custom' && (
                <div className={s.ratioControlRow}>
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
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label="Remove custom frame"
                    title="Remove custom frame"
                    onClick={removeCustom}
                  >
                    <Icon icon={Trash2} size={14} /> Remove
                  </Button>
                </div>
              )}
              {activeFrame !== undefined && (
                <section className={s.frameOptions} aria-label="Selected safe frame settings">
                  <div className={s.heading}>
                    <label className={s.check}>
                      <input
                        className={s.checkbox}
                        type="checkbox"
                        checked={activeFrame.visible}
                        onChange={(event) =>
                          updateFrame({ ...activeFrame, visible: event.target.checked })
                        }
                      />
                      Show this frame
                    </label>
                    <div className={s.colorLabel}>
                      Frame color
                      <GuideColorControl
                        label="Frame color"
                        value={activeFrame.color}
                        onChange={(color) => updateFrame({ ...activeFrame, color })}
                      />
                    </div>
                  </div>
                  {activeFrame.borders.map((border) => (
                    <div className={s.borderRow} key={border.percent}>
                      <label className={s.check}>
                        <input
                          className={s.checkbox}
                          type="checkbox"
                          checked={border.visible}
                          onChange={(event) =>
                            updateBorder({ ...border, visible: event.target.checked })
                          }
                        />
                        {border.percent}% {BORDER_LABELS[border.percent]}
                      </label>
                      <GuideColorControl
                        label={`${border.percent}% color`}
                        value={border.color ?? activeFrame.color}
                        onChange={(color) => updateBorder({ ...border, color })}
                      />
                      <Control
                        variant="bare"
                        aria-label={`Use frame color for ${border.percent}%`}
                        title="Use frame color"
                        disabled={border.color === undefined}
                        onClick={() =>
                          updateBorder({ percent: border.percent, visible: border.visible })
                        }
                      >
                        <Icon icon={RotateCcw} size={13} />
                      </Control>
                    </div>
                  ))}
                </section>
              )}
              <details className={s.help}>
                <summary>About safe areas · EBU R 95</summary>
                <p>
                  100% is the full reference frame. Action Safe (93%) leaves 3.5% at each edge for
                  important action. Graphics Safe (90%) leaves 5% for text and graphics.
                </p>
                <p>
                  EBU R 95 defines Action Safe and Graphics Safe for 16:9 television. Other ratios
                  use proportional guides. 80% is an additional guide with a 10% inset on each side.
                </p>
              </details>
              <p className={s.hint}>Guide settings are shared across projects in this app.</p>
            </div>
            <div className={s.footer}>
              <Button
                size="sm"
                data-safe-area-reset=""
                onClick={() => {
                  returnToReset.current = true;
                  setConfirmReset(true);
                }}
              >
                <Icon icon={RotateCcw} size={13} /> Restore defaults
              </Button>
            </div>
          </div>
        </Popover>
      )}
      {open && confirmReset && (
        <Modal
          title="Restore default safe areas?"
          ariaLabel="Restore default safe areas"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <ModalButton autoFocus onClick={() => setConfirmReset(false)}>
                Cancel
              </ModalButton>
              <ModalButton
                variant="danger"
                onClick={() => {
                  designerGuideStore.set(DEFAULT_BROADCAST_GUIDE_PROFILE);
                  setConfirmReset(false);
                }}
              >
                Restore defaults
              </ModalButton>
            </>
          }
        >
          This removes added frames and restores the default guide ratios, visibility, and colors
          across Designer projects.
        </Modal>
      )}
    </>
  );
}

const BORDER_LABELS = {
  100: 'Frame',
  93: 'Action Safe',
  90: 'Graphics Safe',
  80: 'Inset',
} as const;

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
  const anchorOrigin = outputTranslate(
    { resolution: compositionResolution },
    { anchor: position.anchor, offset: { x: 0, y: 0 } },
    raster,
  );
  const origin = {
    x: anchorOrigin.x + position.offset.x,
    y: anchorOrigin.y + position.offset.y,
  };
  const atAnchor = position.offset.x === 0 && position.offset.y === 0;
  const changePosition = (next: Position): void => {
    designerStore.setCompositionOutputPosition(next);
    onEdit();
  };
  const changeOrigin = (axis: 'x' | 'y', value: number): void => {
    changePosition({
      ...position,
      offset: { ...position.offset, [axis]: value - anchorOrigin[axis] },
    });
  };
  return (
    <section className={s.outputSettings} aria-label="Project output and composition placement">
      <div className={s.heading}>
        <strong>Project output frame</strong>
        <span aria-label="Project output resolution">
          {raster.width}×{raster.height}
        </span>
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
              aria-pressed={atAnchor && position.anchor === anchor}
              selected={atAnchor && position.anchor === anchor}
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
