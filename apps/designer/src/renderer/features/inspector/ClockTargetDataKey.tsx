import { useState } from 'react';
import { useDesignerSelector } from '../../state/store.js';
import { Tag } from '../../ui/Tag.js';
import { TextField } from './controls.js';
import * as dds from './DynamicDataSection.css.js';
import { clockTargetDataKey, setClockTargetDataKey } from './clock-data-key.js';

/**
 * `D-141` 5.4 / `DELTA-RUN-NEXT-VERSION-01-C` §2 — the clock's Dynamic / Data affordance for a time
 * of day or a date and time: a data key makes the target a field the operator sets in CG Control
 * (see `clock-data-key.ts`). Clearing the key makes the target static again. What is in force is
 * stated as a FACT — the key — with the long form in its title, never as prose.
 */
export function ClockTargetDataKey({
  elementId,
  value,
}: {
  elementId: string;
  /** The target as its field writes it — seeds a new field's default. */
  value: string;
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
          const ok = setClockTargetDataKey(elementId, key, value);
          setRefused(ok ? null : key.trim());
        }}
      />
      {refused !== null && (
        <p className={dds.warn}>
          “{refused}” already belongs to another element, or names a field that is not text.
        </p>
      )}
      {current !== null ? (
        <Tag
          data-testid="clock-target-field"
          title="CG Control sets this countdown's target through this field; the countdown re-targets without replaying"
        >
          CG Control field · <bdi>{current}</bdi>
        </Tag>
      ) : (
        <Tag data-testid="clock-target-static">target fixed in the template</Tag>
      )}
    </div>
  );
}
