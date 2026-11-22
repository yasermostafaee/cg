import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { ManagedCgCommands, ManagedCgOutcome } from './managed-cg-commands.js';
import {
  managedLayoutLayerSchema,
  managedTemplateSchema,
  type ManagedLayoutLayer,
  type ManagedResult,
  type ManagedTemplate,
} from './managed-cg-contract.js';

export type ManagedHtmlLayer = Extract<ManagedLayoutLayer, { kind: 'html' }>;

export interface ManagedCgStackRow {
  readonly rowId: string;
  readonly layer: number;
}

export interface ManagedCgStackIntent extends ManagedCgStackRow {
  readonly operation: 'take' | 'update' | 'stop' | 'out' | 'clear' | 'next';
  readonly template?: ManagedTemplate;
  readonly expectedTemplateVersion?: string;
  readonly expectedData?: Readonly<Record<string, unknown>>;
  /** Complete applied values. An update never merges values from an earlier layout. */
  readonly data?: Readonly<Record<string, unknown>>;
}

export type ManagedCgStackOutcome =
  | {
      readonly status: 'applied';
      readonly result: ManagedResult;
      readonly layer: ManagedHtmlLayer | undefined;
    }
  | { readonly status: 'rolledBack'; readonly result: ManagedResult }
  | { readonly status: 'pending'; readonly commandId: string }
  | { readonly status: 'unchanged'; readonly layer: ManagedHtmlLayer | undefined };

const fullRaster = { x: 0, y: 0, width: 1, height: 1 };

/** A retained CG row keeps its graphic identity across Bridge and Playout restarts. */
function instanceId(rowId: string): string {
  if (rowId.trim() === '') throw new Error('The managed graphic needs a retained CG row.');
  return 'cg-row-' + createHash('sha256').update(rowId).digest('hex');
}

function findRow(
  layout: readonly ManagedLayoutLayer[],
  row: ManagedCgStackRow,
): ManagedHtmlLayer | undefined {
  const graphicInstanceId = instanceId(row.rowId);
  const existing = layout.find(({ layer }) => layer === row.layer);
  if (
    layout.some((item) => item.layer !== row.layer && item.graphicInstanceId === graphicInstanceId)
  ) {
    throw new Error('The managed graphic is already seated on a different layer.');
  }
  if (existing === undefined) return undefined;
  if (
    existing.kind !== 'html' ||
    existing.graphicInstanceId !== graphicInstanceId ||
    (existing.page ?? 0) !== 0 ||
    !existing.template.resumeWithoutReplay
  ) {
    throw new Error('The managed layer is occupied by another graphic.');
  }
  return existing;
}

function sameBundle(current: ManagedTemplate, candidate: ManagedTemplate): boolean {
  return (
    current.version === candidate.version &&
    current.entryPath === candidate.entryPath &&
    current.resumeWithoutReplay === candidate.resumeWithoutReplay &&
    current.assets.length === candidate.assets.length &&
    current.assets.every(({ path, sha256, contentType }) =>
      candidate.assets.some(
        (asset) =>
          asset.path === path &&
          asset.sha256.toLowerCase() === sha256.toLowerCase() &&
          asset.contentType === contentType,
      ),
    )
  );
}

function htmlLayer(value: unknown): ManagedHtmlLayer {
  const parsed = managedLayoutLayerSchema.parse(value);
  if (parsed.kind !== 'html') throw new Error('Managed CG controls require a static HTML graphic.');
  return parsed;
}

/**
 * Converts existing CG row intents to a complete Playout layout. The Engine's
 * verified applied layout is the only source of already-seated layers.
 */
export class ManagedCgStack {
  constructor(
    private readonly commands: Pick<
      ManagedCgCommands,
      'editLayout' | 'readAppliedLayout' | 'reconcilePending'
    >,
    private readonly now: () => number = Date.now,
  ) {}

  async apply(intent: ManagedCgStackIntent): Promise<ManagedCgStackOutcome> {
    const operation = intent.operation;
    if (operation === 'next') {
      throw new Error('A managed static graphic has no next page.');
    }

    // Capture the complete operator intent before querying the remote Engine.
    const captured = { ...structuredClone(intent), operation };
    let desired: ManagedHtmlLayer | undefined;
    const outcome = await this.commands.editLayout((layout) => {
      const current = findRow(layout, captured);
      if (current !== undefined && (operation === 'take' || operation === 'update')) {
        if (
          captured.expectedData !== undefined &&
          !isDeepStrictEqual(current.data ?? {}, captured.expectedData)
        )
          throw new Error(
            'The managed graphic data changed on Playout. Refresh the row before retrying.',
          );
        if (
          captured.expectedTemplateVersion !== undefined &&
          current.template.version !== captured.expectedTemplateVersion
        )
          throw new Error('The managed template version on Playout differs from the retained row.');
      }
      desired = this.nextLayer(current, captured);
      if (isDeepStrictEqual(current, desired)) return undefined;

      if (current === undefined) {
        return desired === undefined ? undefined : [...layout, desired];
      }
      return layout.flatMap((entry) =>
        entry.layer === current.layer ? (desired === undefined ? [] : [desired]) : [entry],
      );
    });
    if (outcome.status === 'applied' || outcome.status === 'unchanged') {
      return { ...outcome, layer: desired };
    }
    if (outcome.status === 'pending') return outcome;
    return { status: 'rolledBack', result: outcome.result };
  }

  async inspect(rowId: string, layer: number): Promise<ManagedHtmlLayer | undefined> {
    return findRow(await this.commands.readAppliedLayout(), { rowId, layer });
  }

  async inspectRows(
    rows: readonly ManagedCgStackRow[],
  ): Promise<readonly (ManagedHtmlLayer | undefined)[]> {
    const layout = await this.commands.readAppliedLayout();
    return rows.map((row) => findRow(layout, row));
  }

  recoverPending(): Promise<ManagedCgOutcome | undefined> {
    return this.commands.reconcilePending();
  }

  private nextLayer(
    current: ManagedHtmlLayer | undefined,
    intent: ManagedCgStackIntent & {
      operation: Exclude<ManagedCgStackIntent['operation'], 'next'>;
    },
  ): ManagedHtmlLayer | undefined {
    switch (intent.operation) {
      case 'take': {
        if (intent.data === undefined || !intent.template?.resumeWithoutReplay) {
          throw new Error('Take requires a prepared static template and complete graphic data.');
        }
        const template = managedTemplateSchema.parse(intent.template);
        if (current !== undefined && !sameBundle(current.template, template)) {
          throw new Error('An already-seated managed graphic must keep its prepared template.');
        }
        return htmlLayer({
          ...(current ?? {
            kind: 'html',
            layer: intent.layer,
            graphicInstanceId: instanceId(intent.rowId),
            template,
            page: 0,
            transform: { fill: fullRaster, crop: fullRaster },
            animationOrigin: new Date(this.now()).toISOString(),
          }),
          visibility: 'shown',
          data: intent.data,
        });
      }
      case 'update':
        if (intent.data === undefined) throw new Error('Update requires complete graphic data.');
        return current === undefined ? undefined : htmlLayer({ ...current, data: intent.data });
      case 'stop':
        return current === undefined ? undefined : { ...current, visibility: 'stopped' };
      case 'out':
      case 'clear':
        return undefined;
    }
  }
}
