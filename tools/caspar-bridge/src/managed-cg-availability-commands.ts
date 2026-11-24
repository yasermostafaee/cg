import { randomUUID } from 'node:crypto';
import {
  ManagedCgAvailabilityApi,
  ManagedCgAvailabilityApiError,
  availabilityIntentSchema,
  type AvailabilityIntent,
  type AvailabilityStatus,
} from './managed-cg-availability-api.js';
import {
  availabilityCommandId,
  type ManagedCgAvailabilityState,
  type ManagedCgAvailabilityStore,
} from './managed-cg-availability-store.js';
import {
  managedTemplateSchema,
  type ManagedLayoutLayer,
  type ManagedResult,
  type ManagedTemplate,
} from './managed-cg-contract.js';
import type { ManagedCgEndpoint, ManagedCgOutcome } from './managed-cg-commands.js';
import type { playoutFetch } from './playout-http.js';

interface Options {
  readonly groupId: string;
  /** First member is the configured initial Master. */
  readonly members: readonly ManagedCgEndpoint[];
  readonly store: ManagedCgAvailabilityStore;
  readonly fetch?: typeof playoutFetch;
}

type Observation = Awaited<ReturnType<ManagedCgAvailabilityApi['observe']>>;
type Target = Observation & { readonly local: ManagedCgAvailabilityState };
type Edit = (layers: readonly ManagedLayoutLayer[]) => readonly ManagedLayoutLayer[] | undefined;
type Change = Partial<
  Pick<ManagedCgAvailabilityState, 'lastSequence' | 'selected' | 'committed' | 'pending'>
>;

function confirmsLayout(render: string, layout: readonly ManagedLayoutLayer[]): boolean {
  return (
    render === 'htmlPaintConfirmed' ||
    render === 'htmlPaintAndLiveReady' ||
    (render === 'nativeOnly' &&
      !layout.some(({ kind, visibility }) => kind === 'html' && visibility !== 'stopped'))
  );
}

function confirmedReplica(status: AvailabilityStatus, intent: AvailabilityIntent): boolean {
  return (
    status.replica.appliedRevision === status.committedSequence &&
    status.replica.error === null &&
    confirmsLayout(status.replica.renderConfirmation, intent.layout)
  );
}

function applied(result: ManagedResult, intent: AvailabilityIntent): boolean {
  return (
    result.commandId === intent.commandId &&
    result.revision === intent.sequence &&
    result.admitted &&
    result.status === 'applied' &&
    result.nativeStatus === 'applied' &&
    result.error === null &&
    confirmsLayout(result.renderStatus, intent.layout)
  );
}

function networkUnavailable(error: unknown): boolean {
  return error instanceof ManagedCgAvailabilityApiError && error.kind === 'unavailable';
}

function refusedBeforeAdmission(error: ManagedCgAvailabilityApiError): boolean {
  return (
    error.kind === 'refused' &&
    (error.status === 401 ||
      error.status === 403 ||
      error.code === 'cg.templateCannotResume' ||
      error.status === 413)
  );
}

/**
 * The opt-in .37 command plane for one durable controller and two local Engine permits.
 * The committed intent is the complete state, including omissions after Clear.
 */
export class ManagedCgAvailabilityCommands {
  readonly #api: ManagedCgAvailabilityApi;
  readonly #members: readonly ManagedCgEndpoint[];
  readonly #store: ManagedCgAvailabilityStore;
  #busy = false;

  constructor(options: Options) {
    this.#api = new ManagedCgAvailabilityApi(options);
    this.#members = options.members;
    this.#store = options.store;
  }

  // The availability command verifies and retains the package on the selected Engine.
  // Both Engines receive the complete package references through the Playout checkpoint.
  async prepareTemplate(template: ManagedTemplate): Promise<void> {
    const parsed = managedTemplateSchema.safeParse(template);
    if (!parsed.success || !parsed.data.resumeWithoutReplay)
      throw new Error('DualReady requires a template with absolute recovery.');
  }

  editLayout(edit: Edit): Promise<ManagedCgOutcome | { readonly status: 'unchanged' }> {
    return this.#exclusive(async () => {
      const local = this.#store.read();
      if (local.pending !== null) return { status: 'pending', commandId: local.pending.commandId };
      const target = await this.#restoreBaseline(await this.#selectTarget(local));
      const layout = edit(structuredClone(target.local.committed?.intent.layout ?? []));
      if (layout === undefined) return { status: 'unchanged' };
      const sequence = target.local.lastSequence + 1;
      const selection = target.local.selected?.selection;
      if (selection === undefined) throw new Error('DualReady has no durable selected Engine.');
      const parsed = availabilityIntentSchema.safeParse({
        controllerId: target.local.controllerId,
        commandId: availabilityCommandId(target.local.controllerId, sequence),
        sequence,
        originEpoch: selection.epoch,
        operation: 'layout',
        layout,
      });
      if (!parsed.success) throw new Error('The DualReady layout is invalid.');
      const intent = parsed.data;
      this.#api.validateSubmission(target.endpoint, target.owner, target.status, intent);
      const reserved = this.#write(target.local, { lastSequence: sequence, pending: intent });
      try {
        const result = await this.#api.post(target.endpoint, target.owner, target.status, intent);
        return this.#settle(reserved, intent, result);
      } catch (error) {
        if (!(error instanceof ManagedCgAvailabilityApiError)) throw error;
        // This branch is reached only for the initial send in this process.
        if (refusedBeforeAdmission(error)) {
          this.#write(reserved, { pending: null });
          throw error;
        }
        return { status: 'pending', commandId: intent.commandId };
      }
    });
  }

  readAppliedLayout(): Promise<readonly ManagedLayoutLayer[]> {
    return this.#exclusive(async () => {
      const local = this.#store.read();
      if (local.pending !== null)
        throw new Error('Resolve the pending managed CG command before reading row state.');
      // A surviving replica can attest to the durable layout without taking command authority.
      return this.#withReachableMember(local, async (member) => {
        const observed = await this.#api.observe(member);
        this.#verifyCheckpoint(local, observed.status);
        if (local.committed === null && observed.status.committedSequence === 0) {
          await this.#confirmSnapshot(observed);
          return [];
        }
        if (
          local.committed === null ||
          observed.status.committedSequence !== local.committed.intent.sequence ||
          !confirmedReplica(observed.status, local.committed.intent)
        ) {
          throw new Error('Playout has not confirmed the current DualReady layout.');
        }
        await this.#confirmSnapshot(observed, local.committed.intent);
        return structuredClone(local.committed.intent.layout);
      });
    });
  }

  reconcilePending(): Promise<ManagedCgOutcome | undefined> {
    return this.#exclusive(async () => {
      const local = this.#store.read();
      const intent = local.pending;
      if (intent === null) return undefined;
      const pending = { status: 'pending', commandId: intent.commandId } as const;
      const target = await this.#selectTarget(local);
      try {
        const result = await this.#recoverOnTarget(target, intent);
        if (result === undefined || !applied(result, intent)) return pending;
        // A replicated receipt can exist before the newly selected Core has applied it.
        const current = await this.#api.observe(target.endpoint);
        this.#verifyCheckpoint(target.local, current.status);
        if (
          current.status.committedSequence !== intent.sequence ||
          current.status.committedRequestHash !== result.requestHash ||
          !confirmedReplica(current.status, intent)
        )
          return pending;
        await this.#confirmSnapshot(current, intent);
        return this.#settle(target.local, intent, result);
      } catch (error) {
        if (!(error instanceof ManagedCgAvailabilityApiError)) throw error;
        return pending;
      }
    });
  }

  async #recoverOnTarget(
    { endpoint, owner, status }: Target,
    intent: AvailabilityIntent,
  ): Promise<ManagedResult | undefined> {
    const receipt = await this.#api.receipt(endpoint, intent);
    if (receipt.result !== null) {
      return receipt.result.status === 'prepared' || receipt.result.status === 'unresolved'
        ? this.#api.reconcile(endpoint, owner, status, intent)
        : receipt.result;
    }
    if (
      receipt.status === 'expired' ||
      status.committedSequence >= intent.sequence ||
      receipt.committedSequence >= intent.sequence
    )
      return undefined;
    // Retry the same full intent on the durable selected target.
    return this.#api.post(endpoint, owner, status, intent);
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#busy) throw new Error('A managed CG operation is already in progress.');
    this.#busy = true;
    try {
      return await operation();
    } finally {
      this.#busy = false;
    }
  }

  #write(local: ManagedCgAvailabilityState, change: Change): ManagedCgAvailabilityState {
    return this.#store.write(local, {
      lastSequence: local.lastSequence,
      selected: local.selected,
      committed: local.committed,
      pending: local.pending,
      ...change,
    });
  }

  #currentMember(local: ManagedCgAvailabilityState): ManagedCgEndpoint {
    const selected = local.selected?.selection.engineId;
    const member =
      selected === undefined
        ? this.#members[0]
        : this.#members.find(({ engineId }) => engineId === selected);
    if (member === undefined)
      throw new Error('The selected DualReady Engine is absent from configuration.');
    return member;
  }

  #verifyCheckpoint(local: ManagedCgAvailabilityState, status: AvailabilityStatus): void {
    const committed = local.committed;
    if (
      status.committedSequence > (committed?.intent.sequence ?? 0) &&
      status.committedSequence !== local.pending?.sequence
    )
      throw new Error('The DualReady Engine is ahead of the durable Bridge state.');
    if (
      committed !== null &&
      status.committedSequence === committed.intent.sequence &&
      status.committedRequestHash !== committed.requestHash
    )
      throw new Error('The DualReady checkpoint conflicts with the durable Bridge state.');
    const remote = status.selection;
    const selected = local.selected?.selection;
    if (remote === null && status.committedSequence > 0)
      throw new Error('DualReady requires a reviewed controller for an existing checkpoint.');
    if (
      remote !== null &&
      (remote.controllerId !== local.controllerId ||
        selected === undefined ||
        remote.epoch > selected.epoch ||
        (remote.epoch === selected.epoch &&
          (remote.selectionId !== selected.selectionId || remote.engineId !== selected.engineId)))
    )
      throw new Error('The DualReady Engine reports a different controller or selection.');
  }

  async #withReachableMember<T>(
    local: ManagedCgAvailabilityState,
    read: (member: ManagedCgEndpoint) => Promise<T>,
  ): Promise<T> {
    const member = this.#currentMember(local);
    try {
      return await read(member);
    } catch (error) {
      if (!networkUnavailable(error) || local.selected === null) throw error;
      const reserve = this.#members.find(({ engineId }) => engineId !== member.engineId);
      if (reserve === undefined) throw error;
      return read(reserve);
    }
  }

  async #selectTarget(local: ManagedCgAvailabilityState): Promise<Target> {
    const observed = await this.#withReachableMember(local, (member) => this.#api.observe(member));
    const { endpoint, owner, status } = observed;
    this.#verifyCheckpoint(local, status);
    let reviewed = local.selected;
    // Peer catch-up can change the reviewed checkpoint before an unconfirmed selection.
    // Review it again under a new epoch while retaining the command's original intent.
    if (
      reviewed?.selection.engineId !== endpoint.engineId ||
      (status.selection?.selectionId !== reviewed.selection.selectionId &&
        (status.committedSequence !== reviewed.expectedSequence ||
          status.committedRequestHash !== reviewed.expectedRequestHash))
    ) {
      if (!status.readyForSelection)
        throw new Error('The DualReady Engine is not ready for selection.');
      reviewed = {
        selection: {
          controllerId: local.controllerId,
          epoch: (reviewed?.selection.epoch ?? 0) + 1,
          selectionId: randomUUID(),
          engineId: endpoint.engineId,
        },
        expectedSequence: status.committedSequence,
        expectedRequestHash: status.committedRequestHash,
      };
      local = this.#write(local, { selected: reviewed });
    }
    let permitted = status;
    if (status.selection?.selectionId !== reviewed.selection.selectionId) {
      if (!status.readyForSelection)
        throw new Error('The DualReady Engine is not ready for selection.');
      permitted = await this.#api.select(endpoint, owner, status, reviewed.selection);
      this.#verifyCheckpoint(local, permitted);
    }
    if (
      !permitted.canSendCommands ||
      permitted.localFence === null ||
      permitted.selection?.selectionId !== reviewed.selection.selectionId ||
      permitted.selection.epoch !== reviewed.selection.epoch
    )
      throw new Error('Playout has not confirmed the selected DualReady Engine permit.');
    return { endpoint, owner, status: permitted, local };
  }

  async #restoreBaseline(target: Target): Promise<Target> {
    const { local, status, endpoint } = target;
    const committed = local.committed;
    if (committed === null) {
      await this.#confirmSnapshot(target);
      return target;
    }
    let current = target;
    if (status.committedSequence < committed.intent.sequence) {
      const result = await this.#recoverOnTarget(target, committed.intent);
      if (
        result === undefined ||
        !applied(result, committed.intent) ||
        result.requestHash !== committed.requestHash
      )
        throw new Error('Playout has not restored the durable layout on the selected Engine.');
      const observed = await this.#api.observe(endpoint);
      this.#verifyCheckpoint(local, observed.status);
      current = { ...observed, local };
    }
    if (
      current.status.committedSequence !== committed.intent.sequence ||
      !confirmedReplica(current.status, committed.intent)
    )
      throw new Error('The selected DualReady layout is not ready.');
    await this.#confirmSnapshot(current, committed.intent);
    return current;
  }

  async #confirmSnapshot(observed: Observation, intent?: AvailabilityIntent): Promise<void> {
    const { endpoint, owner, status } = observed;
    const { snapshot, pending, replica } = await this.#api.state(endpoint, owner);
    if (
      pending !== null ||
      snapshot.revision !== status.committedSequence ||
      snapshot.requestHash !== status.committedRequestHash ||
      (intent === undefined
        ? snapshot.revision !== 0 || snapshot.layers.length !== 0
        : snapshot.commandId !== intent.commandId ||
          replica.appliedRevision !== intent.sequence ||
          replica.coreGeneration !== status.replica.coreGeneration ||
          replica.error !== null ||
          !confirmsLayout(replica.renderConfirmation, intent.layout))
    ) {
      throw new Error('Playout has not confirmed the settled DualReady checkpoint.');
    }
  }

  #settle(
    local: ManagedCgAvailabilityState,
    intent: AvailabilityIntent,
    result: ManagedResult,
  ): ManagedCgOutcome {
    if (!applied(result, intent)) return { status: 'pending', commandId: intent.commandId };
    this.#write(local, { pending: null, committed: { intent, requestHash: result.requestHash } });
    return { status: 'applied', result };
  }
}
