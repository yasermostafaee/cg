import type { DynamicField, FieldBinding, Scene } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { activeFieldData } from '../../state/scene-doc.js';
import { NEW_FIELD_DIGITS } from '../../state/slices/fields.js';
import { PATTERN_PRESETS } from './pattern-presets.js';

/**
 * 🔴 `D-141` 5.4 (`add-azan-countdown` design §4, §7.1) — **THE CLOCK'S DATA KEY: THE AZAN TIME
 * THE OPERATOR TYPES.**
 *
 * A `text` field carrying the existing `Time (HH:MM)` pattern, bound to the clock as `clock-target`.
 * The page re-targets the countdown from it on every play and update without replaying (the driver
 * seam, `reapplyClockTargets`), and a value that is not a time applies nothing. No new field type:
 * CG Control already renders a text field, so the operator side needs no change (design §4.1).
 *
 * One key, one owner — a field another target is bound to is refused, as `setElementDataKey`
 * refuses one. Every change is ONE undo entry.
 */

const isClockTarget =
  (elementId: string) =>
  (b: FieldBinding): boolean =>
    b.target.kind === 'clock-target' && b.target.elementId === elementId;

/** The key the clock's target is bound to in the open composition, or `null`. */
export function clockTargetDataKey(scene: Scene, elementId: string): string | null {
  return activeFieldData(scene).bindings.find(isClockTarget(elementId))?.fieldId ?? null;
}

/**
 * Set, rename or clear the clock's data key. `time` seeds a NEW field's default (its `HH:mm` — the
 * pattern takes no seconds). Answers `false`, changing nothing, when the key belongs to something
 * else or names a field that is not text.
 */
export function setClockTargetDataKey(elementId: string, key: string, time: string): boolean {
  const scene = designerStore.get().scene;
  if (scene === null) return false;
  const trimmed = key.trim();
  const doc = activeFieldData(scene);
  const mine = isClockTarget(elementId);
  const currentKey = doc.bindings.find(mine)?.fieldId ?? null;

  if (trimmed === '') {
    if (currentKey !== null) designerStore.removeField(currentKey);
    return true;
  }
  if (trimmed === currentKey) return true;
  if (doc.bindings.some((b) => b.fieldId === trimmed && !mine(b))) return false;
  const existing = doc.fields.find((f) => f.id === trimmed);
  if (existing !== undefined && existing.type !== 'text') return false;

  const binding: FieldBinding = { fieldId: trimmed, target: { kind: 'clock-target', elementId } };
  designerStore.runAsSingleHistoryEntry(() => {
    if (currentKey === null) {
      // An orphaned text field with this id is re-adopted, its configuration kept.
      if (existing === undefined) designerStore.addField(newTimeField(trimmed, time));
      designerStore.addBinding(binding);
      return;
    }
    // A rename: the field keeps its configuration under the new id.
    const previous = doc.fields.find((f) => f.id === currentKey);
    designerStore.removeField(currentKey);
    if (existing === undefined) {
      designerStore.addField(
        previous === undefined
          ? newTimeField(trimmed, time)
          : ({
              ...previous,
              id: trimmed,
              label: previous.label === currentKey ? trimmed : previous.label,
            } as DynamicField),
      );
    }
    designerStore.addBinding(binding);
  });
  return true;
}

function newTimeField(id: string, time: string): DynamicField {
  return {
    id,
    type: 'text',
    label: id,
    required: false,
    default: time.slice(0, 5),
    maxLength: 8,
    pattern: PATTERN_PRESETS['time']?.pattern ?? '',
    // `TEXT-DIGITS-01` — a new field's typed text starts in Persian, like every new field.
    digits: NEW_FIELD_DIGITS,
  } as DynamicField;
}
