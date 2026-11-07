import type { ListItem, Scene, SequenceCompositionItem, SequenceElement } from '@cg/shared-schema';

/** The authored facts needed to turn one flat operator list into Sequence pages. */
export interface PagedRepeaterSequence {
  readonly sequenceId: string;
  readonly compositionId: string;
  readonly fieldId: string;
  readonly rowsPerPage: number;
  readonly authoredPages: readonly SequenceCompositionItem[];
}

/**
 * Recognise the same deliberately narrow shape CG Control exposes as one table:
 * a composition-only Sequence whose pages all stamp one composition containing
 * exactly one bounded Repeater list field.
 */
export function pagedRepeaterSequenceOf(
  scene: Pick<Scene, 'compositions'>,
  sequence: SequenceElement,
): PagedRepeaterSequence | undefined {
  if (sequence.items.length === 0) return undefined;
  const pages = sequence.items.filter(
    (item): item is SequenceCompositionItem => item.kind === 'composition',
  );
  if (pages.length !== sequence.items.length) return undefined;
  const first = pages[0];
  if (first === undefined || pages.some((page) => page.compositionId !== first.compositionId)) {
    return undefined;
  }

  const composition = scene.compositions?.find((candidate) => candidate.id === first.compositionId);
  if (composition === undefined) return undefined;
  const bindings = (composition.bindings ?? []).filter(
    (binding) => binding.target.kind === 'repeater-items',
  );
  if (bindings.length !== 1) return undefined;
  const binding = bindings[0];
  if (binding === undefined) return undefined;
  const field = (composition.fields ?? []).find((candidate) => candidate.id === binding.fieldId);
  if (
    field?.type !== 'list' ||
    field.maxItems === undefined ||
    !Number.isInteger(field.maxItems) ||
    field.maxItems <= 0 ||
    field.itemFields === undefined ||
    field.itemFields.length === 0
  ) {
    return undefined;
  }

  return {
    sequenceId: sequence.id,
    compositionId: first.compositionId,
    fieldId: field.id,
    rowsPerPage: field.maxItems,
    authoredPages: pages,
  };
}

/**
 * Build exactly as many composition pages as the current rows need. Existing
 * authored ids/defaults are reused first so an on-air page reconciles in place;
 * overflow pages get stable deterministic ids and clone the last page shell.
 */
export function pagedRepeaterItems(
  definition: PagedRepeaterSequence,
  rows: readonly ListItem[],
): SequenceCompositionItem[] {
  const pageCount = Math.ceil(rows.length / definition.rowsPerPage);
  const fallback =
    definition.authoredPages[definition.authoredPages.length - 1] ?? definition.authoredPages[0];
  if (fallback === undefined) return [];

  return Array.from({ length: pageCount }, (_, index) => {
    const authored = definition.authoredPages[index] ?? fallback;
    const pageRows = rows
      .slice(index * definition.rowsPerPage, (index + 1) * definition.rowsPerPage)
      .map((row) => ({ ...row }));
    return {
      kind: 'composition',
      id:
        definition.authoredPages[index]?.id ??
        `${definition.sequenceId}:data-page:${String(index + 1)}`,
      compositionId: definition.compositionId,
      ...(authored.dwellMs === undefined ? {} : { dwellMs: authored.dwellMs }),
      fieldValues: {
        ...(authored.fieldValues ?? {}),
        [definition.fieldId]: pageRows,
      },
    };
  });
}
