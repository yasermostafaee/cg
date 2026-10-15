import type { ClockTarget, DynamicField, Element, FieldBinding, Scene } from '@cg/shared-schema';
import { parseTimeOfDay } from '@cg/text-shaping';
import { designerStore, editSceneOf } from '../../state/store.js';
import { activeFieldData } from '../../state/scene-doc.js';
import { NEW_FIELD_DIGITS } from '../../state/slices/fields.js';
import { PATTERN_PRESETS } from './pattern-presets.js';

/**
 * 🔴 `D-141` 5.4 (`add-azan-countdown` design §4, §7.1) and `DELTA-RUN-NEXT-VERSION-01-C` §2 —
 * **THE CLOCK'S DATA KEY: THE TARGET TIME THE OPERATOR SETS.**
 *
 * A `text` field bound to the clock as `clock-target`, its pattern following the VALUE: a time of day
 * (`HH:MM[:SS]`) or an ISO date and time. The author's target is its default and follows every edit
 * of the target, and a countdown aimed at a time of day or a date and time is exposed by default
 * (`targetTime`, labelled "Target time"); the author may clear the key to keep the target static.
 * The page re-targets the countdown from it on every play and update without replaying (the driver
 * seam, `reapplyClockTargets`), and a value that is neither applies nothing. No new field type: CG
 * Control already renders a text field, and its import marks this one as a countdown's target.
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
 * Set, rename or clear the clock's data key. `value` — the target as its field writes it
 * (`clockTargetValue`) — seeds a NEW field's default. Answers `false`, changing nothing, when the
 * key belongs to something else or names a field that is not text.
 */
export function setClockTargetDataKey(elementId: string, key: string, value: string): boolean {
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
      if (existing === undefined) designerStore.addField(newTargetField(trimmed, value));
      designerStore.addBinding(binding);
      return;
    }
    // A rename: the field keeps its configuration under the new id.
    const previous = doc.fields.find((f) => f.id === currentKey);
    designerStore.removeField(currentKey);
    if (existing === undefined) {
      designerStore.addField(
        previous === undefined
          ? newTargetField(trimmed, value)
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

/** The default label of a target field (delta C §2). */
export const TARGET_FIELD_LABEL = 'Target time';
/** The key a target is exposed under by default; a taken one gets a number (`targetTime2`). */
export const TARGET_FIELD_KEY = 'targetTime';

/** The presets a target field may carry and still be re-shaped by its target (any other is the author's). */
const TARGET_PATTERN_KEYS = ['time', 'time-seconds', 'datetime'] as const;

/** The text a target is written as in its field: `HH:mm[:ss]`, the ISO instant, or `''`. */
export function clockTargetValue(target: ClockTarget): string {
  if (target.kind === 'timeofday') return target.time;
  if (target.kind === 'datetime') return target.iso;
  return '';
}

/** The pattern and length a target VALUE asks of its field — the value decides. */
function targetFieldShape(value: string): { pattern: string; maxLength: number } {
  return parseTimeOfDay(value) !== undefined
    ? { pattern: PATTERN_PRESETS['time-seconds']?.pattern ?? '', maxLength: 8 }
    : { pattern: PATTERN_PRESETS['datetime']?.pattern ?? '', maxLength: 32 };
}

function newTargetField(id: string, value: string): DynamicField {
  return {
    id,
    type: 'text',
    label: TARGET_FIELD_LABEL,
    required: false,
    default: value,
    ...targetFieldShape(value),
    // `TEXT-DIGITS-01` — a new field's typed text starts in Persian, like every new field.
    digits: NEW_FIELD_DIGITS,
  } as DynamicField;
}

/**
 * The bound field follows its target: the default becomes the new value and, unless the author
 * wrote a pattern of their own, the pattern follows the value's shape. Nothing when no field is
 * bound. ⚠ No history boundary of its own — the caller's one entry holds it.
 */
function syncTargetField(elementId: string, value: string): void {
  const scene = designerStore.get().scene;
  if (scene === null || value === '') return;
  const doc = activeFieldData(scene);
  const key = doc.bindings.find(isClockTarget(elementId))?.fieldId;
  const field = doc.fields.find((f) => f.id === key);
  if (field === undefined || field.type !== 'text') return;
  const own = field.pattern ?? '';
  const ours = own === '' || TARGET_PATTERN_KEYS.some((k) => PATTERN_PRESETS[k]?.pattern === own);
  designerStore.updateField(field.id, {
    default: value,
    ...(ours ? targetFieldShape(value) : {}),
  } as Partial<DynamicField>);
}

/**
 * Expose the countdown's target as a field — the default for a time of day or a date and time
 * (delta C §2): a bound field just follows the value; otherwise `targetTime` (or the first free
 * `targetTime<n>`) is created and bound. ⚠ No history boundary of its own: call it inside the edit
 * that switched the target, so the switch and the field are ONE undo entry.
 */
export function exposeClockTarget(elementId: string, value: string): void {
  const scene = designerStore.get().scene;
  if (scene === null || value === '') return;
  const doc = activeFieldData(scene);
  if (doc.bindings.some(isClockTarget(elementId))) {
    syncTargetField(elementId, value);
    return;
  }
  const taken = new Set([...doc.fields.map((f) => f.id), ...doc.bindings.map((b) => b.fieldId)]);
  let key = TARGET_FIELD_KEY;
  for (let n = 2; taken.has(key); n++) key = `${TARGET_FIELD_KEY}${String(n)}`;
  designerStore.addField(newTargetField(key, value));
  designerStore.addBinding({ fieldId: key, target: { kind: 'clock-target', elementId } });
}

function findElement(elements: readonly Element[], id: string): Element | undefined {
  for (const el of elements) {
    if (el.id === id) return el;
    if (el.type === 'container') {
      const hit = findElement(el.children, id);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

/** Store a new target and carry it into the bound field's default — ONE undo entry, or nothing. */
export function commitClockTarget(elementId: string, target: ClockTarget): void {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId);
  if (scene === null) return;
  const current = findElement(
    scene.layers.flatMap((l) => l.children),
    elementId,
  );
  if (current?.type === 'clock' && JSON.stringify(current.target) === JSON.stringify(target))
    return;
  designerStore.runAsSingleHistoryEntry(() => {
    designerStore.updateElement(elementId, { target } as Partial<Element>);
    syncTargetField(elementId, clockTargetValue(target));
  });
}
