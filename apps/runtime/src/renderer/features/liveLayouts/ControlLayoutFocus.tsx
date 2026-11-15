import { CornerUpLeft } from 'lucide-react';
import {
  controlLiveLayoutFocusLookId,
  controlLiveLayoutFocusTarget,
  controlLiveLayoutPresetFrameIds,
  type ControlLiveLayout,
} from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import './control-layout-focus.css';

export function ControlLayoutFocus({
  layout,
  current,
  target,
  disabled = false,
  rowName,
  onSelect,
}: {
  layout: ControlLiveLayout;
  current: string | undefined;
  target: 'Preview' | 'Programme';
  disabled?: boolean | undefined;
  rowName?: string | undefined;
  onSelect(lookId: string): void;
}): JSX.Element {
  const focus = controlLiveLayoutFocusTarget(layout, current);
  const preset =
    layout.presets.find(({ id }) => id === (focus?.presetId ?? current)) ??
    layout.presets.find(({ id }) => id === layout.defaultPresetId);
  if (preset === undefined) return <></>;
  const presetFrames = controlLiveLayoutPresetFrameIds(preset);
  const soloFrame = focus?.frameId ?? (presetFrames.length === 1 ? presetFrames[0] : undefined);
  const frameIds =
    soloFrame === undefined
      ? presetFrames
      : [
          ...presetFrames,
          ...layout.frames.map(({ id }) => id).filter((id) => !presetFrames.includes(id)),
        ];
  const frames = new Map(
    layout.frames.map((frame, index) => [frame.id, { frame, number: index + 1 }]),
  );
  return (
    <div
      className="cg-control-layout-focus"
      role="group"
      aria-label={target + ' Focus'}
      data-control-layout-focus={target.toLowerCase()}
    >
      <span className="cg-control-layout-focus__label cg-monitor-fact">
        {target === 'Preview' ? 'Focus · PVW' : 'Focus · PGM'}
      </span>
      <span className="cg-control-layout-focus__buttons">
        {frameIds.map((id) => {
          const option = frames.get(id);
          if (option === undefined) return null;
          const { frame, number } = option;
          const active = id === soloFrame;
          const alias = frame.focusAlias?.trim() || undefined;
          const label = frame.title.trim() || `Frame ${number}`;
          const caption =
            alias === undefined ? label : alias === label ? alias : `${alias} · ${label}`;
          const accessibleName = `Focus frame ${number} in ${target}`;
          return (
            <Button
              key={id}
              variant="icon"
              className={alias === undefined ? undefined : 'cg-control-layout-focus__named'}
              aria-label={alias === undefined ? accessibleName : `${accessibleName} · ${alias}`}
              aria-pressed={active}
              active={active}
              {...(active && target === 'Programme' ? { 'data-focus-onair': '' } : {})}
              disabled={disabled || active}
              title={caption}
              onClick={() => onSelect(controlLiveLayoutFocusLookId(preset.id, id))}
            >
              {alias === undefined ? number : <bdi>{alias}</bdi>}
            </Button>
          );
        })}
        {focus !== undefined && (
          <Button
            variant="icon"
            aria-label={`Return to ${preset.name}`}
            title={`Return to ${preset.name}`}
            disabled={disabled}
            onClick={() => onSelect(preset.id)}
          >
            <Icon icon={CornerUpLeft} size={14} />
          </Button>
        )}
      </span>
      {rowName !== undefined && (
        <bdi className="cg-control-layout-focus__row cg-monitor-fact" title={rowName}>
          {rowName}
        </bdi>
      )}
    </div>
  );
}
