import { designerFocusPreset, designerFocusTarget, type TemplateLiveSources } from '@cg/shared-ipc';
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
  liveSources,
  current,
  target,
  disabled = false,
  rowName,
  onSelect,
}: {
  layout?: ControlLiveLayout | undefined;
  liveSources?: TemplateLiveSources | undefined;
  current: string | undefined;
  target: 'Preview' | 'Programme';
  disabled?: boolean | undefined;
  rowName?: string | undefined;
  onSelect(lookId: string): void;
}): JSX.Element | null {
  if (layout === undefined) {
    const preset = designerFocusPreset(liveSources, current);
    if (preset === undefined) return null;
    const focus = designerFocusTarget(liveSources, current);
    const options = Object.keys(preset.rects).flatMap((id, index) => {
      const lookId = preset.presetFocus?.targets[id];
      if (lookId === undefined) return [];
      const label = liveSources?.looks?.find((look) => look.id === lookId)?.name ?? '';
      return [{ id, lookId, number: index + 1, label }];
    });
    return (
      <FocusStrip
        options={options}
        active={focus?.frameId}
        origin={focus === undefined ? undefined : preset}
        target={target}
        disabled={disabled}
        rowName={rowName}
        onSelect={onSelect}
      />
    );
  }
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
  const options = frameIds.flatMap((id) => {
    const option = frames.get(id);
    if (option === undefined) return [];
    const { frame, number } = option;
    const alias = frame.focusAlias?.trim() || undefined;
    const label = frame.title.trim() || `Plate ${number}`;
    return [{ id, lookId: controlLiveLayoutFocusLookId(preset.id, id), number, alias, label }];
  });
  return (
    <FocusStrip
      options={options}
      active={soloFrame}
      origin={focus === undefined ? undefined : preset}
      target={target}
      disabled={disabled}
      rowName={rowName}
      onSelect={onSelect}
    />
  );
}

function FocusStrip({
  options,
  active,
  origin,
  target,
  disabled,
  rowName,
  onSelect,
}: {
  options: readonly {
    id: string;
    lookId: string;
    number: number;
    label: string;
    alias?: string | undefined;
  }[];
  active: string | undefined;
  origin: { id: string; name: string } | undefined;
  target: 'Preview' | 'Programme';
  disabled: boolean;
  rowName: string | undefined;
  onSelect: (lookId: string) => void;
}): JSX.Element {
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
        {options.map(({ id, lookId, number, label, alias }) => {
          const selected = id === active;
          const caption =
            alias === undefined ? label : alias === label ? alias : `${alias} · ${label}`;
          const accessibleName = `Focus plate ${number} in ${target}`;
          return (
            <Button
              key={id}
              variant="icon"
              className={alias === undefined ? undefined : 'cg-control-layout-focus__named'}
              aria-label={alias === undefined ? accessibleName : `${accessibleName} · ${alias}`}
              aria-pressed={selected}
              active={selected}
              {...(selected && target === 'Programme' ? { 'data-focus-onair': '' } : {})}
              disabled={disabled || selected}
              title={caption}
              onClick={() => onSelect(lookId)}
            >
              {alias === undefined ? number : <bdi>{alias}</bdi>}
            </Button>
          );
        })}
        {origin !== undefined && (
          <Button
            variant="icon"
            aria-label={`Return to ${origin.name}`}
            title={`Return to ${origin.name}`}
            disabled={disabled}
            onClick={() => onSelect(origin.id)}
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
