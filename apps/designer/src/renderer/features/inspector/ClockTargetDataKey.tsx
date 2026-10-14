import { useState } from 'react';
import { useDesignerSelector } from '../../state/store.js';
import { TextField } from './controls.js';
import * as dds from './DynamicDataSection.css.js';
import { clockTargetDataKey, setClockTargetDataKey } from './clock-data-key.js';

/**
 * `D-141` 5.4 — the clock's Dynamic / Data affordance for a `timeofday` target: a data key makes the
 * azan time a field the operator sets (see `clock-data-key.ts`). Clearing the key makes the target
 * static again.
 */
export function ClockTargetDataKey({
  elementId,
  time,
}: {
  elementId: string;
  time: string;
}): JSX.Element {
  const scene = useDesignerSelector((s) => s.scene);
  const current = scene === null ? null : clockTargetDataKey(scene, elementId);
  const [refused, setRefused] = useState<string | null>(null);
  return (
    <div data-testid="clock-target-data-key">
      <TextField
        label="data key"
        ariaLabel="Countdown target data key"
        value={current ?? ''}
        resetKey={elementId}
        onCommit={(key) => {
          const ok = setClockTargetDataKey(elementId, key, time);
          setRefused(ok ? null : key.trim());
        }}
      />
      {refused !== null && (
        <p className={dds.warn}>
          “{refused}” already belongs to another element, or names a field that is not text.
        </p>
      )}
      {current !== null && (
        <p className={dds.hint}>
          CG Control shows “{current}” as a text field (HH:MM); the countdown re-targets to it
          without replaying.
        </p>
      )}
    </div>
  );
}
