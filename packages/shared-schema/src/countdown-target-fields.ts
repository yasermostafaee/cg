import { afterZeroOf, type CountdownTargetField } from './countdown.js';
import type { AggregatedFields, FieldDoc } from './composition-fields.js';
import type { ClockElement, Element } from './elements.js';
import type { DynamicField } from './fields.js';
import { PATTERN_PRESETS } from './field-patterns.js';
import type { Scene } from './scene.js';

/** Derive the target editor from its binding, in both Designer and CG Control.
 * Each nested instance resolves the fields in its own composition, never its parent.
 * A stale authored marker is removed: a field cannot claim it drives a clock it does not bind.
 */
export function countdownTargetFieldsOf(
  scene: Pick<Scene, 'compositions'>,
  doc: FieldDoc,
  aggregate: AggregatedFields,
): AggregatedFields {
  return {
    fields: aggregate.fields.map((field) => markField(doc, field)),
    groups: aggregate.groups.map((group) => {
      const child = scene.compositions?.find((c) => c.id === group.compositionId);
      return child === undefined
        ? group
        : { ...group, aggregate: countdownTargetFieldsOf(scene, child, group.aggregate) };
    }),
  };
}

function markField(doc: FieldDoc, field: DynamicField): DynamicField {
  if (field.type !== 'text') return field;
  const countdown = countdownOf(doc, field.id);
  if (countdown !== undefined) {
    const pattern = field.pattern?.split('\\d').join('[0-9]');
    const standard = ['time', 'time-seconds', 'datetime'].some(
      (key) => pattern !== undefined && PATTERN_PRESETS[key]?.pattern === pattern,
    );
    // Older projects can already contain a date target with the previous time-only
    // pattern/length. Repair that derived editor contract without relaxing custom rules.
    return {
      ...field,
      countdown,
      ...(standard
        ? {
            pattern:
              PATTERN_PRESETS[countdown.target === 'datetime' ? 'datetime' : 'time-seconds']
                ?.pattern,
            ...(field.maxLength === 8 || field.maxLength === 32
              ? { maxLength: countdown.target === 'datetime' ? 32 : 8 }
              : {}),
          }
        : {}),
    };
  }
  if (field.countdown === undefined) return field;
  const { countdown: _notJustified, ...rest } = field;
  return rest;
}

function countdownOf(doc: FieldDoc, fieldId: string): CountdownTargetField | undefined {
  const aimed: { kind: 'datetime' | 'timeofday'; clock: ClockElement }[] = [];
  for (const binding of doc.bindings ?? []) {
    if (binding.fieldId !== fieldId || binding.target.kind !== 'clock-target') continue;
    const clock = clockIn(doc, binding.target.elementId);
    if (clock === undefined || clock.mode !== 'countdown') continue;
    const kind = clock.target?.kind;
    if (kind === 'datetime' || kind === 'timeofday') aimed.push({ kind, clock });
  }
  const [first] = aimed;
  if (first === undefined) return undefined;
  return {
    target: aimed.every((a) => a.kind === 'timeofday') ? 'timeofday' : 'datetime',
    afterZero: afterZeroOf(first.clock.afterZero),
  };
}

function clockIn(doc: Pick<FieldDoc, 'layers'>, id: string): ClockElement | undefined {
  const walk = (children: readonly Element[]): ClockElement | undefined => {
    for (const el of children) {
      if (el.id === id) return el.type === 'clock' ? el : undefined;
      if (el.type === 'container') {
        const found = walk(el.children);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  for (const layer of doc.layers) {
    const found = walk(layer.children);
    if (found !== undefined) return found;
  }
  return undefined;
}
