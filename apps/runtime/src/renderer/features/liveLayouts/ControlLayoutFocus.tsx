import { CornerUpLeft } from 'lucide-react';
import {
  controlLiveLayoutFocusLookId,
  controlLiveLayoutFocusTarget,
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
  const soloFrame =
    focus?.frameId ?? (preset.frameIds.length === 1 ? preset.frameIds[0] : undefined);
  return (
    <div
      className="cg-control-layout-focus"
      role="group"
      aria-label={target + ' Focus'}
      data-control-layout-focus={target.toLowerCase()}
    >
      <span className="cg-monitor-fact">
        {target === 'Preview' ? 'Focus · PVW' : 'Focus · PGM'}
      </span>
      {layout.frames.map((frame, index) => {
        if (soloFrame === undefined && !preset.frameIds.includes(frame.id)) return null;
        const active = frame.id === soloFrame;
        const label = frame.title.trim() || `Frame ${index + 1}`;
        return (
          <Button
            key={frame.id}
            variant="icon"
            aria-label={`Focus frame ${index + 1} in ${target}`}
            aria-pressed={active}
            active={active}
            disabled={disabled || active}
            title={label}
            onClick={() => onSelect(controlLiveLayoutFocusLookId(preset.id, frame.id))}
          >
            {index + 1}
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
      {rowName !== undefined && (
        <bdi className="cg-control-layout-focus__row cg-monitor-fact" title={rowName}>
          {rowName}
        </bdi>
      )}
    </div>
  );
}
