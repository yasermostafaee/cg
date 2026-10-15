import {
  afterZeroOf,
  type AggregatedFields,
  type ClockElement,
  type CountdownTargetField,
  type DynamicField,
  type Element,
  type FieldDoc,
  type Scene,
} from '@cg/shared-schema';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §2 — **WHICH TEXT FIELDS SET A COUNTDOWN'S TARGET**, derived at
 * import from the template's own `clock-target` bindings, the one moment CG Control holds the
 * unpacked scene (the `hasNext` / `listFieldTargets` reason: no `.vcg` reaches CG Bridge, so a fact
 * not captured here is not recoverable later).
 *
 * 🔴 **THE BINDING IS THE ONE SOURCE OF TRUTH.** A `text` field gets `countdown` exactly when, IN
 * ITS OWN DOC (the root scene or the composition that owns it — a nested group's fields are looked
 * up in that group's composition, never in the parent), a `clock-target` binding names it and the
 * clock it aims is a `countdown` whose authored target is a `datetime` or a `timeofday`. Nothing
 * else writes the marker: a `countdown` key the bindings do not justify is DROPPED here, so a
 * package can never tell CG Control something its page will not do.
 *
 * - A `duration` target gets nothing — its field is still a plain text field.
 * - One field aiming several countdowns: `timeofday` only when every one of them is a time of day,
 *   else `datetime` (an ISO instant means the same instant to both kinds on the page — the value
 *   decides, `@cg/template-runtime`'s `parseClockTarget`); `afterZero` is the first one's, in
 *   binding order.
 */
export function countdownTargetFieldsOf(
  scene: Pick<Scene, 'compositions'>,
  doc: FieldDoc,
  aggregate: AggregatedFields,
): AggregatedFields {
  return {
    fields: aggregate.fields.map((field) => markField(doc, field)),
    // The aggregate is already depth-bounded (`aggregateCompositionFields`), so following it is too.
    groups: aggregate.groups.map((group) => {
      const child = scene.compositions?.find((c) => c.id === group.compositionId);
      return child === undefined
        ? group
        : { ...group, aggregate: countdownTargetFieldsOf(scene, child, group.aggregate) };
    }),
  };
}

/** `field` with `countdown` as its doc's bindings say — set, or absent. */
function markField(doc: FieldDoc, field: DynamicField): DynamicField {
  if (field.type !== 'text') return field;
  const countdown = countdownOf(doc, field.id);
  if (countdown !== undefined) return { ...field, countdown };
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

/** The clock element `id` in a doc's own layers, at any container depth. */
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
