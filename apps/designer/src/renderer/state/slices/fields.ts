import type { DynamicField, Element, FieldBinding, ListItem } from '@cg/shared-schema';
import { current, set } from '../store-core.js';
import { activeFieldData, locate, withActiveFieldData } from '../scene-doc.js';
import { designerStore } from '../store.js';

/**
 * Fields & bindings slice — the active composition's dynamic fields and
 * field→target bindings (D-025 per-composition), the scene font registry, and
 * the D-018 "Data key" convenience layer that keeps a text element's field +
 * full-text binding in sync. Cross-slice: `setElementFieldMeta` syncs the
 * element's text via the elements slice's `updateElement` (through
 * `designerStore`). See `state/README.md`.
 */

/**
 * D-018 — high-level patch for the field backing a text element's Data key.
 * The store maps it onto the discriminated `DynamicField` union (handling the
 * text ↔ multiline ↔ number variant switch) so the inspector stays declarative.
 */
export interface ElementFieldMetaPatch {
  title?: string;
  description?: string;
  required?: boolean;
  fieldType?: 'text' | 'number';
  multiline?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: string | number;
}

/**
 * Default `maxLength` for a field created via the Data-key convenience layer —
 * a sensible cap for broadcast text that also engages the element's auto-size /
 * auto-squeeze when an operator sends an over-long value. Editable per field in
 * the inspector (set 0 to clear).
 */
const DEFAULT_DATA_FIELD_MAX_LENGTH = 100;

/** Coerce any field `default` to a string (for the text/multiline variants). */
function defaultAsString(field: DynamicField): string {
  if (field.type === 'image') return '';
  return typeof field.default === 'string' ? field.default : String(field.default);
}

/**
 * Rebuild the dynamic field backing a Data key from a high-level meta patch,
 * producing a valid variant for the selected `fieldType`/`multiline` and
 * coercing `default` to that variant. Length/pattern constraints carry forward
 * where the target variant supports them; a 0 / empty value clears them.
 */
function rebuildField(field: DynamicField, patch: ElementFieldMetaPatch): DynamicField {
  const label = patch.title ?? field.label;
  const required = patch.required ?? field.required;
  const description = patch.description ?? field.description;
  const base = {
    id: field.id,
    label,
    required,
    ...(field.group !== undefined ? { group: field.group } : {}),
    ...(description !== undefined && description !== '' ? { description } : {}),
  };

  // D-028 — a list field (the ticker's Data key) has no text/number variant
  // switching; only the base meta applies. Its default (the items) is edited
  // through the items editor (`setTickerItems`), not this meta patch.
  if (field.type === 'list') {
    return { ...base, type: 'list', default: field.default };
  }

  const fieldType = patch.fieldType ?? (field.type === 'number' ? 'number' : 'text');
  const multiline = patch.multiline ?? field.type === 'multiline';

  if (fieldType === 'number') {
    const cur = field.type === 'number' ? field.default : Number(defaultAsString(field));
    const raw = patch.default !== undefined ? Number(patch.default) : cur;
    const next = Number.isFinite(raw) ? raw : 0;
    return {
      ...base,
      type: 'number',
      default: next,
      ...(field.type === 'number' && field.min !== undefined ? { min: field.min } : {}),
      ...(field.type === 'number' && field.max !== undefined ? { max: field.max } : {}),
      ...(field.type === 'number' && field.step !== undefined ? { step: field.step } : {}),
      ...(field.type === 'number' && field.unit !== undefined ? { unit: field.unit } : {}),
    };
  }

  const def = patch.default !== undefined ? String(patch.default) : defaultAsString(field);
  const curMin = field.type === 'text' || field.type === 'multiline' ? field.minLength : undefined;
  const curPattern =
    field.type === 'text' || field.type === 'multiline' ? field.pattern : undefined;
  const curMax = field.type === 'text' ? field.maxLength : undefined;
  const rawMin = patch.minLength ?? curMin;
  const minLength = rawMin !== undefined && rawMin > 0 ? Math.floor(rawMin) : undefined;
  const rawMax = patch.maxLength ?? curMax;
  const maxLength = rawMax !== undefined && rawMax > 0 ? Math.floor(rawMax) : undefined;
  const rawPattern = patch.pattern ?? curPattern;
  const pattern = rawPattern !== undefined && rawPattern.trim() !== '' ? rawPattern : undefined;

  if (multiline) {
    return {
      ...base,
      type: 'multiline',
      default: def,
      ...(field.type === 'multiline' && field.maxLines !== undefined
        ? { maxLines: field.maxLines }
        : {}),
      ...(minLength !== undefined ? { minLength } : {}),
      ...(pattern !== undefined ? { pattern } : {}),
    };
  }
  return {
    ...base,
    type: 'text',
    default: def,
    ...(minLength !== undefined ? { minLength } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(pattern !== undefined ? { pattern } : {}),
    ...(field.type === 'text' && field.direction !== undefined
      ? { direction: field.direction }
      : {}),
  };
}

/**
 * Structural equality for two binding targets — they identify the same wire when
 * every field matches (kind, elementId, and any discriminant-specific keys like
 * `property` / `placeholder` / `layer` / `prop`). The target objects are flat and
 * hold only primitives, so a key-by-key compare is exact. Used to dedupe
 * field→target bindings (B-008).
 */
function sameBindingTarget(a: FieldBinding['target'], b: FieldBinding['target']): boolean {
  const ak = Object.keys(a) as (keyof typeof a)[];
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

/**
 * D-018/D-028/D-029/D-030 — is `b` a Data-key convenience binding (for ANY
 * element)? A text element's convenience binding is its full-text binding
 * (no placeholder); a ticker's / sequence's / repeater's is its
 * `*-items` binding.
 */
function isConvBinding(b: FieldBinding): boolean {
  return (
    (b.target.kind === 'text' && b.target.placeholder === undefined) ||
    b.target.kind === 'ticker-items' ||
    b.target.kind === 'sequence-items' ||
    b.target.kind === 'repeater-items'
  );
}

/** The element id a convenience binding drives ('' when not a conv binding). */
function convElementId(b: FieldBinding): string {
  return isConvBinding(b) && 'elementId' in b.target ? b.target.elementId : '';
}

export const fieldsSlice = {
  /** Enter bind-from-canvas mode for a field. Pass null to cancel. */
  setBindMode(fieldId: string | null): void {
    set({ bindModeFieldId: fieldId });
  },

  /** Append a dynamic field to the ACTIVE composition's fields (D-025). */
  addField(field: DynamicField): void {
    if (current.scene === null) return;
    const fields = [...activeFieldData(current.scene).fields, field];
    set({ scene: withActiveFieldData(current.scene, { fields }) });
  },

  /**
   * D-011 — idempotently add a scene-level font (e.g. when a font asset
   * is imported). No-op if a font with the same `family` already exists
   * so the panel can call this on every mount without duplicating.
   */
  addSceneFont(font: { family: string; displayName?: string; assetId?: string }): void {
    if (current.scene === null) return;
    if (current.scene.fonts.some((f) => f.family === font.family)) return;
    const next = [
      ...current.scene.fonts,
      {
        family: font.family,
        weights: [400],
        styles: ['normal' as const],
        source: 'bundled' as const,
        // We reuse `bundledPath` to round-trip the original filename
        // / display name so the inspector dropdown can show something
        // friendlier than the family slug.
        ...(font.displayName !== undefined ? { bundledPath: font.displayName } : {}),
      },
    ];
    set({ scene: { ...current.scene, fonts: next } });
  },

  /** Patch a field's editable properties (label/required/default/etc.). */
  updateField(fieldId: string, patch: Partial<DynamicField>): void {
    if (current.scene === null) return;
    const fields = activeFieldData(current.scene).fields.map((f) =>
      f.id === fieldId ? ({ ...f, ...patch } as DynamicField) : f,
    );
    set({ scene: withActiveFieldData(current.scene, { fields }) });
  },

  /** Remove a field and any bindings that reference it (active composition). */
  removeField(fieldId: string): void {
    if (current.scene === null) return;
    const doc = activeFieldData(current.scene);
    const fields = doc.fields.filter((f) => f.id !== fieldId);
    const bindings = doc.bindings.filter((b) => b.fieldId !== fieldId);
    set({ scene: withActiveFieldData(current.scene, { fields, bindings }) });
  },

  /** Append a binding (no dedup — same target appearing twice is allowed). */
  /**
   * Append a field→target binding, **idempotently**: if an identical
   * field→target pair already exists it's a no-op (B-008). This guards the
   * "Bind from canvas" flow (one activation = one bind, and re-activating +
   * re-clicking the same element must not stack duplicates) at the single
   * source, so every caller is protected. Binding a field to a DIFFERENT target
   * (other element / property) is still allowed — only exact duplicates are
   * dropped. The optional `transform` is not part of identity.
   */
  addBinding(binding: FieldBinding): void {
    if (current.scene === null) return;
    const doc = activeFieldData(current.scene);
    const duplicate = doc.bindings.some(
      (b) => b.fieldId === binding.fieldId && sameBindingTarget(b.target, binding.target),
    );
    if (duplicate) return;
    const bindings = [...doc.bindings, binding];
    set({ scene: withActiveFieldData(current.scene, { bindings }) });
  },

  /**
   * Remove a binding identified by its array index (into the active composition's
   * bindings). Index-based removal is unambiguous when two share a field/target.
   */
  removeBindingAt(index: number): void {
    if (current.scene === null) return;
    const doc = activeFieldData(current.scene);
    if (index < 0 || index >= doc.bindings.length) return;
    const bindings = doc.bindings.filter((_, i) => i !== index);
    set({ scene: withActiveFieldData(current.scene, { bindings }) });
  },

  /**
   * D-018 convenience layer — make a text element dynamic by giving it a **Data
   * key**. The key auto-syncs a scene-level field (`id = key`) and a full-text
   * `text` binding, so `fields[]`/`bindings[]` remain the single source of truth
   * (fields are project-global — see `editSceneOf`). Setting it the first time
   * creates the field+binding (seeding the field default from the element's
   * current text); changing it renames the field id and every binding that
   * referenced it; clearing it removes the field and its bindings.
   *
   * Returns `false` (and changes nothing) only when `key` is already *owned by
   * another element* via a full-text binding (a real conflict). A field that
   * exists but is **orphaned** — e.g. its binding was removed via the Bindings
   * `×`, leaving the field behind — is **re-adopted** rather than rejected, so
   * re-typing the same key reconnects it. Only the convenience binding
   * (full-text, no placeholder) is touched; `{{placeholder}}` bindings are left
   * alone. The inspector warns live with the same ownership rule.
   */
  setElementDataKey(elementId: string, key: string): boolean {
    if (current.scene === null) return false;
    const trimmed = key.trim();
    const doc = activeFieldData(current.scene);
    const bindings = doc.bindings;
    // D-028/D-029 — the element's type decides the convenience-binding kind:
    // a text element syncs a full-text binding, a ticker its `ticker-items`
    // binding, a sequence its `sequence-items` binding (both list-backed).
    const found = locate(current.scene, elementId);
    const el = found === null ? undefined : found.layer.children[found.elIdx];
    const itemsKind =
      el !== undefined && el.type === 'ticker'
        ? ('ticker-items' as const)
        : el !== undefined && el.type === 'sequence'
          ? ('sequence-items' as const)
          : el !== undefined && el.type === 'repeater'
            ? ('repeater-items' as const)
            : null;
    const isListElement = itemsKind !== null;
    const convIdx = bindings.findIndex((b) => isConvBinding(b) && convElementId(b) === elementId);
    const currentKey = convIdx === -1 ? null : (bindings[convIdx]?.fieldId ?? null);

    // Cleared → element becomes static again.
    if (trimmed === '') {
      if (currentKey !== null) designerStore.removeField(currentKey);
      return true;
    }
    if (trimmed === currentKey) return true; // unchanged

    // Reject only when *another* element already owns this key via a
    // convenience binding (of either kind — one key, one owner), OR a sequence
    // TEXT ITEM owns it via a per-item `sequence-item-text` binding (D-083
    // follow-up — per-item keys share the one-key-one-owner rule). An
    // existing-but-orphaned field (no such binding) is re-adopted.
    const ownedElsewhere = bindings.some(
      (b) =>
        b.fieldId === trimmed &&
        ((isConvBinding(b) && convElementId(b) !== elementId) ||
          b.target.kind === 'sequence-item-text'),
    );
    if (ownedElsewhere) return false;

    const existing = doc.fields.find((f) => f.id === trimmed);
    // A ticker/sequence can only adopt a `list` field (and a text element
    // only a text-shaped one) — a kind mismatch would wire an uneditable
    // value.
    if (existing !== undefined && (existing.type === 'list') !== isListElement) return false;

    if (currentKey === null) {
      const binding: FieldBinding =
        itemsKind !== null
          ? { fieldId: trimmed, target: { kind: itemsKind, elementId } }
          : { fieldId: trimmed, target: { kind: 'text', elementId } };
      // Re-adopt an orphaned field (keep its config); otherwise create a fresh
      // one seeded from the element's current content.
      if (existing !== undefined) {
        set({ scene: withActiveFieldData(current.scene, { bindings: [...bindings, binding] }) });
        return true;
      }
      const field: DynamicField = isListElement
        ? {
            id: trimmed,
            type: 'list',
            label: trimmed,
            required: false,
            // Seed from the element's authored items (stable ids — and any
            // open fields like a sequence's dwellMs or a repeater's row
            // values — carry over).
            default:
              el !== undefined &&
              (el.type === 'ticker' || el.type === 'sequence' || el.type === 'repeater')
                ? el.items.map((i) => ({ ...i }))
                : [],
          }
        : {
            id: trimmed,
            type: 'text',
            label: trimmed,
            required: false,
            default: el !== undefined && el.type === 'text' ? el.text : '',
            maxLength: DEFAULT_DATA_FIELD_MAX_LENGTH,
          };
      set({
        scene: withActiveFieldData(current.scene, {
          fields: [...doc.fields, field],
          bindings: [...bindings, binding],
        }),
      });
      return true;
    }

    // Rename. If an (orphaned) field already owns the new id, don't fork the id
    // space — reject and let the operator clear then re-set.
    if (existing !== undefined) return false;
    const fields = doc.fields.map((f) =>
      f.id === currentKey ? ({ ...f, id: trimmed } as DynamicField) : f,
    );
    const nextBindings = bindings.map((b) =>
      b.fieldId === currentKey ? { ...b, fieldId: trimmed } : b,
    );
    set({ scene: withActiveFieldData(current.scene, { fields, bindings: nextBindings }) });
    return true;
  },

  /**
   * D-018 — patch the field backing a text element's Data key (title,
   * description, required, field type, multiline, min/max length, pattern,
   * default). No-op when the element has no Data key yet. Variant switches
   * (text ↔ multiline ↔ number) are handled in `rebuildField`.
   */
  setElementFieldMeta(elementId: string, patch: ElementFieldMetaPatch): void {
    if (current.scene === null) return;
    const doc = activeFieldData(current.scene);
    const conv = doc.bindings.find((b) => isConvBinding(b) && convElementId(b) === elementId);
    if (conv === undefined) return;
    const oldField = doc.fields.find((f) => f.id === conv.fieldId);
    if (oldField === undefined) return;
    const newField = rebuildField(oldField, patch);
    const fields = doc.fields.map((f) => (f.id === conv.fieldId ? newField : f));
    set({ scene: withActiveFieldData(current.scene, { fields }) });

    // Keep the element's authoring text in lockstep with the field default
    // whenever the default changed (editing "Default" here, or a field-type
    // switch that coerced it), so the inline editor opens with the same value
    // the canvas shows rather than a stale one. (List fields skip this — their
    // default is the items array, synced by `setTickerItems`.)
    const newDefault =
      'default' in newField && newField.type !== 'list' ? String(newField.default) : undefined;
    if (newDefault !== undefined) {
      const found = locate(current.scene, elementId);
      const el = found === null ? undefined : found.layer.children[found.elIdx];
      if (el !== undefined && el.type === 'text' && el.text !== newDefault) {
        designerStore.updateElement(elementId, { text: newDefault } as Partial<Element>);
      }
    }
  },

  /**
   * D-083 follow-up — make a sequence TEXT ITEM operator-editable by giving it an
   * EXPLICIT Data key (parallel to {@link setElementDataKey}, scoped to one item). The key
   * auto-syncs a `text` field (`id = key`, seeded from the item's authored text) + a
   * `sequence-item-text` binding `{elementId, itemId}`, so `fields[]`/`bindings[]` stay the
   * single source of truth. Setting it the first time creates the field+binding; changing it
   * renames; clearing removes them (the item goes back to STATIC design-time content). An
   * unbound text item is never exposed — sequences never auto-expose their items.
   *
   * Returns `false` (changing nothing) when `key` is already owned by another element OR
   * another sequence item (one key, one owner), when the field shape doesn't match, or when
   * the item is missing / a composition item (which has no bindable text). An orphaned field
   * (no binding) is re-adopted, like {@link setElementDataKey}.
   */
  setSequenceItemDataKey(elementId: string, itemId: string, key: string): boolean {
    if (current.scene === null) return false;
    const trimmed = key.trim();
    const doc = activeFieldData(current.scene);
    const bindings = doc.bindings;
    const isThisItem = (b: FieldBinding): boolean =>
      b.target.kind === 'sequence-item-text' &&
      b.target.elementId === elementId &&
      b.target.itemId === itemId;
    const convIdx = bindings.findIndex(isThisItem);
    const currentKey = convIdx === -1 ? null : (bindings[convIdx]?.fieldId ?? null);

    // Cleared → the item becomes static again.
    if (trimmed === '') {
      if (currentKey !== null) designerStore.removeField(currentKey);
      return true;
    }
    if (trimmed === currentKey) return true; // unchanged

    // One key, one owner: reject a key already owned by ANOTHER element (a convenience
    // binding) or ANOTHER sequence item (a per-item text binding). An orphaned field is
    // re-adopted below.
    const ownedElsewhere = bindings.some(
      (b) =>
        b.fieldId === trimmed &&
        !isThisItem(b) &&
        (isConvBinding(b) || b.target.kind === 'sequence-item-text'),
    );
    if (ownedElsewhere) return false;

    // Resolve the item; only a TEXT item has bindable text.
    const found = locate(current.scene, elementId);
    const el = found === null ? undefined : found.layer.children[found.elIdx];
    const item =
      el !== undefined && el.type === 'sequence'
        ? el.items.find((it) => it.id === itemId)
        : undefined;
    if (item === undefined || item.kind === 'composition') return false;
    const seedText = item.text;

    const existing = doc.fields.find((f) => f.id === trimmed);
    // A text item can only adopt a text-shaped field.
    if (existing !== undefined && existing.type !== 'text' && existing.type !== 'multiline') {
      return false;
    }

    if (currentKey === null) {
      const binding: FieldBinding = {
        fieldId: trimmed,
        target: { kind: 'sequence-item-text', elementId, itemId },
      };
      // Re-adopt an orphaned field (keep its config); else create a fresh one seeded from
      // the item's authored text.
      if (existing !== undefined) {
        set({ scene: withActiveFieldData(current.scene, { bindings: [...bindings, binding] }) });
        return true;
      }
      const field: DynamicField = {
        id: trimmed,
        type: 'text',
        label: trimmed,
        required: false,
        default: seedText,
        maxLength: DEFAULT_DATA_FIELD_MAX_LENGTH,
      };
      set({
        scene: withActiveFieldData(current.scene, {
          fields: [...doc.fields, field],
          bindings: [...bindings, binding],
        }),
      });
      return true;
    }

    // Rename. If an (orphaned) field already owns the new id, don't fork the id space.
    if (existing !== undefined) return false;
    const fields = doc.fields.map((f) =>
      f.id === currentKey ? ({ ...f, id: trimmed } as DynamicField) : f,
    );
    const nextBindings = bindings.map((b) =>
      b.fieldId === currentKey ? { ...b, fieldId: trimmed } : b,
    );
    set({ scene: withActiveFieldData(current.scene, { fields, bindings: nextBindings }) });
    return true;
  },

  /**
   * D-028 — edit a ticker's items as ONE intent: updates the element's
   * authored items and, when a `list` field is bound via the element's Data
   * key, keeps that field's default in lockstep (the same canvas ↔ field
   * coupling the text Data-key layer maintains for `text`/`default`).
   */
  setTickerItems(elementId: string, items: ListItem[]): void {
    if (current.scene === null) return;
    // The ticker element stores only what it renders: {id, text}. The bound
    // field's default keeps the FULL open item shape (extra fields survive).
    const authored = items.map((i) => ({
      id: i.id,
      text: typeof (i as Record<string, unknown>)['text'] === 'string' ? String(i['text']) : '',
    }));
    designerStore.updateElement(elementId, { items: authored } as Partial<Element>);
    const doc = activeFieldData(current.scene);
    const conv = doc.bindings.find(
      (b) => b.target.kind === 'ticker-items' && b.target.elementId === elementId,
    );
    if (conv === undefined) return;
    const field = doc.fields.find((f) => f.id === conv.fieldId);
    if (field === undefined || field.type !== 'list') return;
    designerStore.updateField(field.id, { default: items.map((i) => ({ ...i })) });
  },

  /**
   * D-029 — edit a sequence's items as ONE intent: updates the element's
   * authored items and, when a `list` field is bound via the element's Data
   * key, keeps that field's default in lockstep (the `setTickerItems`
   * pattern).
   */
  setSequenceItems(elementId: string, items: ListItem[]): void {
    if (current.scene === null) return;
    // D-083 — the sequence stores a discriminated union of what it renders: a TEXT
    // item {id,text,dwellMs?} (kind defaults to 'text') or a COMPOSITION item
    // {id,kind:'composition',compositionId,dwellMs?}. The bound field's default keeps
    // the FULL open item shape (extras survive); only a text-only sequence is bindable.
    const authored = items.map((i) => {
      const o = i as Record<string, unknown>;
      const dwell = o['dwellMs'];
      const dwellMs =
        typeof dwell === 'number' && Number.isInteger(dwell) && dwell > 0 ? dwell : undefined;
      if (o['kind'] === 'composition') {
        const compositionId = typeof o['compositionId'] === 'string' ? o['compositionId'] : '';
        return dwellMs === undefined
          ? { id: i.id, kind: 'composition', compositionId }
          : { id: i.id, kind: 'composition', compositionId, dwellMs };
      }
      const text = typeof o['text'] === 'string' ? o['text'] : '';
      return dwellMs === undefined ? { id: i.id, text } : { id: i.id, text, dwellMs };
    });
    designerStore.updateElement(elementId, { items: authored } as Partial<Element>);

    // (A) LIST binding (`sequence-items`): keep its default in lockstep, or — once a
    // composition item is present — DROP the now-illegal binding + list field (the binding
    // is TEXT-ONLY; syncing a composition into a list default would be coerced back to empty
    // text, erasing the composition). Mirrors the clear path of setElementDataKey.
    const listDoc = activeFieldData(current.scene);
    const conv = listDoc.bindings.find(
      (b) => b.target.kind === 'sequence-items' && b.target.elementId === elementId,
    );
    if (conv !== undefined) {
      if (authored.some((i) => (i as Record<string, unknown>)['kind'] === 'composition')) {
        designerStore.removeField(conv.fieldId);
      } else {
        const field = listDoc.fields.find((f) => f.id === conv.fieldId);
        if (field !== undefined && field.type === 'list') {
          designerStore.updateField(field.id, { default: items.map((i) => ({ ...i })) });
        }
      }
    }

    // (B) D-083 follow-up — per-item TEXT bindings: drop a binding whose item was removed or
    // switched to a composition item; keep each bound text item's field default in lockstep
    // with its authored text (the same canvas ↔ default coupling as the list/element layers).
    const itemDoc = activeFieldData(current.scene); // fresh — (A) may have removed a field
    for (const b of itemDoc.bindings) {
      const tgt = b.target;
      if (tgt.kind !== 'sequence-item-text' || tgt.elementId !== elementId) continue;
      const item = authored.find((i) => i.id === tgt.itemId) as Record<string, unknown> | undefined;
      if (item === undefined || item['kind'] === 'composition') {
        designerStore.removeField(b.fieldId);
      } else {
        designerStore.updateField(b.fieldId, {
          default: typeof item['text'] === 'string' ? item['text'] : '',
        });
      }
    }
  },

  /**
   * D-030 — edit a repeater's rows as ONE intent: the element stores the
   * FULL open items (row keys are child field values), and a bound `list`
   * field's default stays in lockstep (the setTickerItems pattern).
   */
  setRepeaterItems(elementId: string, items: ListItem[]): void {
    if (current.scene === null) return;
    designerStore.updateElement(elementId, {
      items: items.map((i) => ({ ...i })),
    } as Partial<Element>);
    const doc = activeFieldData(current.scene);
    const conv = doc.bindings.find(
      (b) => b.target.kind === 'repeater-items' && b.target.elementId === elementId,
    );
    if (conv === undefined) return;
    const field = doc.fields.find((f) => f.id === conv.fieldId);
    if (field === undefined || field.type !== 'list') return;
    designerStore.updateField(field.id, { default: items.map((i) => ({ ...i })) });
  },
} as const;
