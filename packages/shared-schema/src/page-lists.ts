import type { FieldBinding } from './bindings.js';
import {
  sequenceItemsBinding,
  sequencePictureFit,
  sequenceStepsByOperator,
  type Element,
  type ImageFit,
  type SequenceElement,
} from './elements.js';
import type { DynamicField, ListItem } from './fields.js';
import type { Composition, Layer, Scene } from './scene.js';

/** `R-100` — one PAGE LIST of a template: its field, and whether Next/Previous wrap around. */
export interface PageListInfo {
  fieldId: string;
  /** `true` when the sequence it drives repeats forever; `false` for a book that stops at its ends. */
  wrap: boolean;
  /** The sequence's authored advance mode; CG Control may override it per row. */
  advance: 'auto' | 'manual';
  /**
   * `D-163` — `false` when the operator does not step the sequence (`sequenceStepsByOperator`): its
   * pictures are still the operator's to load, but no console verb turns them. Absent ⇒ steps.
   */
  step?: false;
  /**
   * `RUN-NEXT-VERSION-03` 1.4 — the SEQUENCE's name, which CG Control heads the book with when the author
   * gave its field no Title (never the field's id). Absent for a nameless sequence.
   */
  name?: string;
  /**
   * `RUN-NEXT-VERSION-03` delta A — how the sequence fits its pictures (`sequencePictureFit`): CG
   * Control's page thumbnails draw each picture at it, as the air does.
   */
  fit: ImageFit;
}

type ListField = Extract<DynamicField, { type: 'list' }>;

/** A picture item of a sequence or of a list value: `{ kind: 'image', … }`. */
function isPicture(item: unknown): boolean {
  return typeof item === 'object' && item !== null && (item as { kind?: unknown }).kind === 'image';
}

/** `RUN-NEXT-VERSION-03` 1.6 — a TEXT page of a book: `{ id, text }`, `kind` absent or `'text'`. */
function isTextPage(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const o = item as { kind?: unknown; text?: unknown };
  return (o.kind === undefined || o.kind === 'text') && typeof o.text === 'string';
}

/**
 * `RUN-NEXT-VERSION-03` 1.6 — whether a list VALUE reads as a book: every item a picture or a text
 * page, and at least one picture (an empty list has nothing to judge by, and passes).
 */
export function isBookValue(items: readonly unknown[]): boolean {
  if (items.length === 0) return true;
  return items.every((i) => isPicture(i) || isTextPage(i)) && items.some(isPicture);
}

/**
 * 🔴 `B-353` — **THE ONE ANSWER to "is this list field, bound to this sequence's items, a PAGE LIST?"**
 * (golden rule 6): exactly when the sequence's items make a BOOK (`sequenceItemsBinding` → `pages`:
 * at least one picture, every other item a text page — `RUN-NEXT-VERSION-03` 1.6) — and the field's
 * own default reads as one too ({@link isBookValue}), so a list of text can never be read as pages.
 * Whatever order the author worked in, and whatever the stored `pages` mark says: the mark is this
 * answer written down, and {@link withPageListMark} keeps the two equal.
 *
 * An EMPTY sequence has nothing to judge by, so the author's mark stands — a book whose every page
 * the operator loads in CG Control.
 *
 * It was a stored mark alone until the owner's book (`telavat2.vcg`, 2026-10-15) arrived with its
 * Data key but without the mark: the Designer rebuilt the field from scratch when its "Allow file
 * source" was ticked and dropped `pages`, so CG Control showed six empty text boxes instead of a book.
 */
export function isPageListField(
  field: DynamicField,
  sequence: Pick<SequenceElement, 'items'>,
): boolean {
  if (field.type !== 'list') return false;
  if (sequence.items.length === 0) return field.pages === true;
  return sequenceItemsBinding(sequence.items) === 'pages' && isBookValue(field.default);
}

/**
 * `B-353` — the field with its `pages` mark set or cleared by {@link isPageListField}; the SAME object
 * when the mark already agrees, so a clean scene stays clean.
 */
export function withPageListMark(
  field: ListField,
  sequence: Pick<SequenceElement, 'items'>,
): ListField {
  const pages = isPageListField(field, sequence);
  if (pages === (field.pages === true)) return field;
  if (pages) return { ...field, pages: true };
  const rest: ListField = { ...field };
  delete rest.pages;
  return rest;
}

/**
 * `R-100` — **THE TEMPLATE'S PAGE LISTS**, read once at import (where CG Control holds the scene) so
 * the bridge and every console know which rows load pictures and how a page turn behaves at the
 * ends. A page list is a `list` field bound (`sequence-items`) to a sequence in the root or the
 * ENTRY composition — the fields an operator edits at the row's top level — that
 * {@link isPageListField} answers yes for. Its `wrap` is that sequence's `repeat: 'infinite'`.
 */
export function pageListsOf(scene: Scene): PageListInfo[] {
  const out: PageListInfo[] = [];
  const seen = new Set<string>();
  for (const doc of operatorDocs(scene)) {
    for (const field of doc.fields ?? []) {
      if (field.type !== 'list' || seen.has(field.id)) continue;
      const sequence = boundSequence(doc, field.id);
      if (sequence === undefined || !isPageListField(field, sequence)) continue;
      seen.add(field.id);
      out.push({
        fieldId: field.id,
        wrap: sequence.repeat === 'infinite',
        advance: sequence.advance,
        ...(sequenceStepsByOperator(sequence) ? {} : { step: false as const }),
        ...(sequence.name.trim() !== '' ? { name: sequence.name.trim() } : {}),
        fit: sequencePictureFit(sequence),
      });
    }
  }
  return out;
}

/**
 * 🔴 `B-353` — **EVERY PAGE-LIST MARK IN THE SCENE AGREES WITH {@link isPageListField}**, in the root and
 * in every composition. A registered scene migration (`SCENE_MIGRATIONS`): a project or package whose
 * book lost its mark — the owner's `telavat2` — opens with it back, and IDENTITY-PRESERVING, so a scene
 * with nothing to repair is returned as the same object and a clean project does not load dirty.
 */
export function migratePageListMarks(scene: Scene): Scene {
  if (!Array.isArray(scene.layers)) return scene; // tolerate partial fixtures
  const rootFields = markedFields(scene);
  let compositions = scene.compositions;
  if (compositions !== undefined) {
    let changed = false;
    const next = compositions.map((c) => {
      const fields = markedFields(c);
      if (fields === c.fields) return c;
      changed = true;
      return { ...c, fields };
    });
    if (changed) compositions = next;
  }
  if (rootFields === scene.fields && compositions === scene.compositions) return scene;
  return {
    ...scene,
    fields: [...rootFields],
    ...(compositions !== undefined ? { compositions } : {}),
  };
}

/** The id an automatic page list is given: stable across re-exports, because the element's id is. */
export function autoPageListFieldId(elementId: string): string {
  return `pages-${elementId}`;
}

/**
 * 🔴 `B-353` (BOOK-EXPORT Q2) — **A PICTURE SEQUENCE THE OPERATOR STEPS IS A BOOK IN CG CONTROL, WITH OR
 * WITHOUT A DATA KEY.** Each one in the root or the entry composition whose items no field drives is
 * given a page list: the id {@link autoPageListFieldId}, the sequence's name as its label, the pages
 * as its default, and a `sequence-items` binding. Run where a package is made (the Designer's export)
 * and where it is read (CG Control's import), never on the author's project — the author's own fields
 * are the author's. Identity-preserving.
 */
export function withAutoPageLists(scene: Scene): Scene {
  if (!Array.isArray(scene.layers)) return scene;
  const entryId = scene.entryCompositionId;
  const rootPatch = autoPageListsFor(scene);
  let compositions = scene.compositions;
  if (compositions !== undefined && entryId !== undefined) {
    let changed = false;
    const next = compositions.map((c) => {
      if (c.id !== entryId) return c;
      const patch = autoPageListsFor(c);
      if (patch === null) return c;
      changed = true;
      return { ...c, ...patch };
    });
    if (changed) compositions = next;
  }
  if (rootPatch === null && compositions === scene.compositions) return scene;
  return {
    ...scene,
    ...(rootPatch ?? {}),
    ...(compositions !== undefined ? { compositions } : {}),
  };
}

/**
 * `B-353` — **WHAT A PACKAGE CARRIES FOR ITS BOOKS**: every mark agreeing ({@link migratePageListMarks})
 * and every stepped picture sequence a page list ({@link withAutoPageLists}). The one call the export
 * and the import both make, so the two cannot disagree about which rows are books.
 */
export function withPageLists(scene: Scene): Scene {
  return withAutoPageLists(migratePageListMarks(scene));
}

// ── internals ──────────────────────────────────────────────────────────────────

interface FieldDoc {
  readonly layers: readonly Layer[];
  readonly fields?: readonly DynamicField[] | undefined;
  readonly bindings?: readonly FieldBinding[] | undefined;
}

/** The root and the ENTRY composition: the documents whose fields the operator edits at the top. */
function operatorDocs(scene: Scene): FieldDoc[] {
  return [
    scene,
    ...(scene.compositions ?? []).filter((c: Composition) => c.id === scene.entryCompositionId),
  ];
}

/** The sequence `fieldId` drives through a `sequence-items` binding in `doc`, if any. */
function boundSequence(doc: FieldDoc, fieldId: string): SequenceElement | undefined {
  const binding = (doc.bindings ?? []).find(
    (b) => b.fieldId === fieldId && b.target.kind === 'sequence-items',
  );
  if (binding === undefined || binding.target.kind !== 'sequence-items') return undefined;
  const el = findElement(
    doc.layers.flatMap((l) => l.children),
    binding.target.elementId,
  );
  return el?.type === 'sequence' ? el : undefined;
}

/** `doc`'s fields with every page-list mark agreeing; the SAME value when nothing changed. */
function markedFields<F extends readonly DynamicField[] | undefined>(
  doc: FieldDoc & { readonly fields?: F },
): F | DynamicField[] {
  const fields = doc.fields;
  if (!Array.isArray(fields) || !Array.isArray(doc.layers)) return fields as F;
  let changed = false;
  const next = (fields as readonly DynamicField[]).map((field) => {
    if (field.type !== 'list') return field;
    const sequence = boundSequence(doc, field.id);
    if (sequence === undefined) return field;
    const marked = withPageListMark(field, sequence);
    if (marked !== field) changed = true;
    return marked;
  });
  return changed ? next : (fields as F);
}

/** The fields + bindings `doc` gains for its unkeyed stepped picture sequences, or `null`. */
function autoPageListsFor(
  doc: FieldDoc,
): { fields: DynamicField[]; bindings: FieldBinding[] } | null {
  const fields = [...(doc.fields ?? [])];
  const bindings = [...(doc.bindings ?? [])];
  let added = false;
  for (const sequence of sequencesOf(doc.layers)) {
    if (!sequenceStepsByOperator(sequence)) continue;
    if (sequence.items.length === 0 || sequenceItemsBinding(sequence.items) !== 'pages') continue;
    const driven = bindings.some(
      (b) => b.target.kind === 'sequence-items' && b.target.elementId === sequence.id,
    );
    if (driven) continue;
    const base = autoPageListFieldId(sequence.id);
    let id = base;
    for (let n = 2; fields.some((f) => f.id === id); n += 1) id = `${base}-${String(n)}`;
    const label = sequence.name.trim() === '' ? 'Pages' : sequence.name;
    fields.push({
      id,
      label,
      required: false,
      type: 'list',
      default: sequence.items.map((i) => ({ ...i }) as ListItem),
      pages: true,
    });
    bindings.push({ fieldId: id, target: { kind: 'sequence-items', elementId: sequence.id } });
    added = true;
  }
  return added ? { fields, bindings } : null;
}

/** Every sequence among `layers`' elements, containers flattened, in authored order. */
function sequencesOf(layers: readonly Layer[]): SequenceElement[] {
  const out: SequenceElement[] = [];
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'sequence') out.push(el);
      if (el.type === 'container') walk(el.children);
    }
  };
  for (const layer of layers) walk(layer.children);
  return out;
}

function findElement(children: readonly Element[], id: string): Element | undefined {
  for (const el of children) {
    if (el.id === id) return el;
    if (el.type === 'container') {
      const inner = findElement(el.children, id);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}
