import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { ManagedCgEndpoint } from './managed-cg-commands.js';
import {
  managedAppliedStateSchema,
  managedFenceSchema,
  managedLayoutLayerSchema,
  managedMemberSchema,
  managedOwnerSchema,
  managedResultSchema,
  type ManagedFence,
  type ManagedResult,
} from './managed-cg-contract.js';
import { playoutFetch, PlayoutRequestError } from './playout-http.js';

const READ_TIMEOUT_MS = 5_000;
const WRITE_TIMEOUT_MS = 60_000;
const MAX_REQUEST_BYTES = 262_144;
const MAX_RESPONSE_BYTES = 524_288;

const sequence = z.number().int().safe().nonnegative();
const uuid = z.string().uuid();
const engineId = managedMemberSchema.shape.engineId;
const hash = managedFenceSchema.shape.membershipHash;
const checkpointHash = z.union([hash, z.literal('')]);
const replica = managedAppliedStateSchema.shape.replica;
const layout = z
  .array(managedLayoutLayerSchema)
  .max(64)
  .refine((layers) => new Set(layers.map(({ layer }) => layer)).size === layers.length, {
    message: 'Duplicate managed CG layer',
  });

export const availabilitySelectionSchema = z
  .object({ controllerId: uuid, epoch: sequence.positive(), selectionId: uuid, engineId })
  .strict();

// Only these fields identify the intent across a Bridge target change. The fence
// and selection belong to the individual submission.
export const availabilityIntentSchema = z
  .object({
    commandId: uuid,
    controllerId: uuid,
    sequence: sequence.positive(),
    originEpoch: sequence.positive(),
    operation: z.enum(['play', 'update', 'stop', 'clear', 'layout']),
    layout,
  })
  .strict();

const selectSchema = z.object({
  selection: availabilitySelectionSchema,
  expectedSequence: sequence,
  expectedRequestHash: checkpointHash,
});

const availabilityOwnerSchema = managedOwnerSchema.extend({
  status: z.literal('availabilityOnly'),
  owner: z.null(),
  fence: z.null(),
  leaseExpiresAt: z.null(),
  canSendCommands: z.literal(false),
});

const availabilityStatusSchema = z
  .object({
    mode: z.literal('dualReady'),
    globallyExclusiveOwner: z.literal(false),
    engineId,
    readyForSelection: z.boolean(),
    selection: availabilitySelectionSchema.nullable(),
    localFence: managedFenceSchema.nullable(),
    canSendCommands: z.boolean(),
    committedSequence: sequence,
    committedRequestHash: checkpointHash,
    receiptFloor: sequence,
    replica,
    reason: z.string().nullable(),
    standby: replica.nullable(),
  })
  .refine((status) => status.committedSequence === 0 || status.committedRequestHash !== '', {
    message: 'A committed sequence must identify its request hash',
  });

const availabilityStateSchema = z.object({
  snapshot: managedAppliedStateSchema.shape.snapshot
    .extend({ commandId: uuid, requestHash: checkpointHash })
    .refine((snapshot) => snapshot.revision === 0 || snapshot.requestHash !== '', {
      message: 'A committed checkpoint must identify its request hash',
    }),
  replica,
  pending: z.unknown(),
});

const availabilityReceiptSchema = z.object({
  commandId: uuid,
  sequence: sequence.positive(),
  status: z.enum(['retained', 'expired', 'notRetained', 'notKnownLocally']),
  result: managedResultSchema.nullable(),
  committedSequence: sequence,
  receiptFloor: sequence,
  globalNonAcceptanceProven: z.literal(false),
  next: z.string(),
});

const errorSchema = z.object({ error: z.string().regex(/^cg\.[a-z0-9_.-]+$/i) });

export type AvailabilitySelection = z.infer<typeof availabilitySelectionSchema>;
export type AvailabilityIntent = z.infer<typeof availabilityIntentSchema>;
export type AvailabilityOwner = z.infer<typeof availabilityOwnerSchema>;
export type AvailabilityStatus = z.infer<typeof availabilityStatusSchema>;
export type AvailabilityState = z.infer<typeof availabilityStateSchema>;
export type AvailabilityReceipt = z.infer<typeof availabilityReceiptSchema>;

export interface AvailabilityObservation {
  readonly endpoint: ManagedCgEndpoint;
  readonly owner: AvailabilityOwner;
  readonly status: AvailabilityStatus;
}

export class ManagedCgAvailabilityApiError extends Error {
  override readonly name = 'ManagedCgAvailabilityApiError';

  constructor(
    message: string,
    readonly kind: 'unavailable' | 'refused' | 'invalid',
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

interface AvailabilityApiOptions {
  readonly groupId: string;
  readonly members: readonly ManagedCgEndpoint[];
  readonly fetch?: typeof playoutFetch;
}

function invalid(message: string): never {
  throw new ManagedCgAvailabilityApiError(message, 'invalid');
}

function serializeRequest(body: object): string {
  const request = JSON.stringify(body);
  if (Buffer.byteLength(request, 'utf8') > MAX_REQUEST_BYTES)
    invalid('The availability request exceeds the Playout size limit.');
  return request;
}

function matchesReplica(
  reported: { engineId: string; channelCode: string; nativeChannel: number },
  endpoint: ManagedCgEndpoint,
): boolean {
  return (
    reported.engineId === endpoint.engineId &&
    reported.channelCode === endpoint.channelCode &&
    reported.nativeChannel === endpoint.nativeChannel
  );
}

function matchesMembership(
  reported: { groupId: string; membershipRevision: number; membershipHash: string },
  owner: AvailabilityOwner,
): boolean {
  return (
    reported.groupId === owner.groupId &&
    reported.membershipRevision === owner.membershipRevision &&
    reported.membershipHash === owner.membershipHash
  );
}

/**
 * Availability-first wire protocol for an explicitly configured two-Engine group.
 * This class never selects a destination on its own. The Bridge controller owns
 * selection, durable ordering and decisions about retrying ambiguous commands.
 */
export class ManagedCgAvailabilityApi {
  readonly #groupId: string;
  readonly #members: readonly ManagedCgEndpoint[];
  readonly #fetch: typeof playoutFetch;

  constructor(options: AvailabilityApiOptions) {
    this.#groupId = managedFenceSchema.shape.groupId.parse(options.groupId);
    this.#members = options.members.map((endpoint) => {
      const parsedOrigin = managedMemberSchema.shape.apiOrigin.parse(endpoint.origin);
      return {
        ...endpoint,
        origin: new URL(parsedOrigin).origin,
        engineId: engineId.parse(endpoint.engineId),
        channelCode: managedMemberSchema.shape.channelCode
          .refine((value) => value !== '.' && value !== '..')
          .parse(endpoint.channelCode),
        nativeChannel: managedMemberSchema.shape.nativeChannel.parse(endpoint.nativeChannel),
      };
    });
    if (
      this.#members.length !== 2 ||
      new Set(this.#members.map((endpoint) => endpoint.engineId.toLowerCase())).size !== 2 ||
      new Set(this.#members.map((endpoint) => endpoint.origin)).size !== 2
    )
      invalid('Managed CG availability requires two distinct configured Engines.');
    this.#fetch = options.fetch ?? playoutFetch;
  }

  async owner(endpoint: ManagedCgEndpoint): Promise<AvailabilityOwner> {
    const parsed = availabilityOwnerSchema.safeParse(await this.#request(endpoint, 'owner'));
    if (!parsed.success) invalid('Playout did not confirm an availability-first group.');
    const owner = parsed.data;
    if (
      owner.groupId !== this.#groupId ||
      owner.members.length !== this.#members.length ||
      !this.#members.every((member) =>
        owner.members.some(
          (mapped) =>
            matchesReplica(mapped, member) && new URL(mapped.apiOrigin).origin === member.origin,
        ),
      )
    )
      invalid('The availability-first group no longer matches the configured Engines.');
    return owner;
  }

  async status(endpoint: ManagedCgEndpoint, owner: AvailabilityOwner): Promise<AvailabilityStatus> {
    return this.#parseStatus(await this.#request(endpoint, 'availability'), endpoint, owner);
  }

  async observe(endpoint: ManagedCgEndpoint): Promise<AvailabilityObservation> {
    const owner = await this.owner(endpoint);
    return { endpoint, owner, status: await this.status(endpoint, owner) };
  }

  async state(endpoint: ManagedCgEndpoint, owner: AvailabilityOwner): Promise<AvailabilityState> {
    const parsed = availabilityStateSchema.safeParse(await this.#request(endpoint, 'state'));
    if (
      !parsed.success ||
      !matchesMembership(parsed.data.snapshot, owner) ||
      !matchesReplica(parsed.data.replica, endpoint)
    )
      invalid('Playout returned an invalid availability checkpoint for this Engine.');
    return parsed.data;
  }

  async select(
    endpoint: ManagedCgEndpoint,
    owner: AvailabilityOwner,
    reviewed: AvailabilityStatus,
    selection: AvailabilitySelection,
  ): Promise<AvailabilityStatus> {
    if (
      selection.engineId !== endpoint.engineId ||
      reviewed.engineId !== endpoint.engineId ||
      !reviewed.readyForSelection
    )
      invalid('This availability target was not reviewed for selection.');
    const request = selectSchema.parse({
      selection,
      expectedSequence: reviewed.committedSequence,
      expectedRequestHash: reviewed.committedRequestHash,
    });
    const status = this.#parseStatus(
      await this.#request(endpoint, 'availability/select', request),
      endpoint,
      owner,
    );
    if (!isDeepStrictEqual(status.selection, selection) || !status.canSendCommands)
      invalid('Playout did not confirm this Bridge selection.');
    return status;
  }

  async post(
    endpoint: ManagedCgEndpoint,
    owner: AvailabilityOwner,
    status: AvailabilityStatus,
    intent: AvailabilityIntent,
  ): Promise<ManagedResult> {
    const { requestBody, localFence } = this.#buildSubmission(endpoint, owner, status, intent);
    const result = this.#parseResult(
      await this.#request(endpoint, 'availability/commands', requestBody),
      intent,
    );
    if (!matchesReplica(result.target, endpoint) || !isDeepStrictEqual(result.fence, localFence))
      invalid('Playout returned a command result for a different availability fence.');
    return result;
  }

  validateSubmission(
    endpoint: ManagedCgEndpoint,
    owner: AvailabilityOwner,
    status: AvailabilityStatus,
    intent: AvailabilityIntent,
  ): void {
    this.#buildSubmission(endpoint, owner, status, intent);
  }

  #buildSubmission(
    endpoint: ManagedCgEndpoint,
    owner: AvailabilityOwner,
    status: AvailabilityStatus,
    intent: AvailabilityIntent,
  ): { requestBody: string; localFence: ManagedFence } {
    const { selection, localFence } = this.#permit(endpoint, owner, status, intent);
    const parsed = availabilityIntentSchema.parse(intent);
    const member = owner.members.find((entry) => matchesReplica(entry, endpoint));
    if (
      member === undefined ||
      parsed.layout.some(
        ({ layer, kind }) =>
          layer === member.programmeLayer ||
          member.protectedLayers.includes(layer) ||
          !owner.allowedLayers.some(
            (range) => range.kind === kind && range.first <= layer && layer <= range.last,
          ),
      )
    )
      invalid('The availability layout contains a layer outside its permitted kind or range.');
    if (parsed.layout.some((layer) => layer.kind === 'html' && !layer.template.resumeWithoutReplay))
      invalid(
        'The availability layout contains an HTML graphic without absolute recovery support.',
      );
    return {
      requestBody: serializeRequest({
        ...parsed,
        selection,
        expectedFence: localFence,
        resumeWithoutReplay: intent.originEpoch < selection.epoch,
      }),
      localFence,
    };
  }

  async receipt(
    endpoint: ManagedCgEndpoint,
    intent: AvailabilityIntent,
  ): Promise<AvailabilityReceipt> {
    const query = new URLSearchParams({
      controllerId: uuid.parse(intent.controllerId),
      sequence: String(sequence.positive().parse(intent.sequence)),
    });
    const id = uuid.parse(intent.commandId);
    const parsed = availabilityReceiptSchema.safeParse(
      await this.#request(endpoint, 'availability/commands/' + id + '?' + query.toString()),
    );
    if (
      !parsed.success ||
      parsed.data.commandId !== id ||
      parsed.data.sequence !== intent.sequence ||
      (parsed.data.status === 'retained') !== (parsed.data.result !== null)
    )
      invalid('Playout returned a receipt for a different availability command.');
    if (parsed.data.result !== null) this.#parseResult(parsed.data.result, intent);
    return parsed.data;
  }

  async reconcile(
    endpoint: ManagedCgEndpoint,
    owner: AvailabilityOwner,
    status: AvailabilityStatus,
    intent: AvailabilityIntent,
  ): Promise<ManagedResult> {
    this.#permit(endpoint, owner, status, intent);
    const id = uuid.parse(intent.commandId);
    const result = this.#parseResult(
      await this.#request(endpoint, 'availability/commands/' + id + '/reconcile', {}),
      intent,
    );
    if (!matchesReplica(result.target, endpoint) || !matchesMembership(result.fence, owner))
      invalid('Playout returned a reconciliation result for a different availability target.');
    return result;
  }

  #parseStatus(
    response: unknown,
    endpoint: ManagedCgEndpoint,
    owner: AvailabilityOwner,
  ): AvailabilityStatus {
    const parsed = availabilityStatusSchema.safeParse(response);
    if (!parsed.success) invalid('Playout did not confirm its local availability state.');
    const status = parsed.data;
    const { localFence, selection } = status;
    if (
      status.engineId !== endpoint.engineId ||
      !matchesReplica(status.replica, endpoint) ||
      (selection !== null &&
        !this.#members.some((member) => member.engineId === selection.engineId)) ||
      (localFence !== null &&
        (localFence.ownerEngineId !== endpoint.engineId ||
          !matchesMembership(localFence, owner))) ||
      (status.canSendCommands &&
        (selection?.engineId !== endpoint.engineId ||
          localFence === null ||
          localFence.coreGeneration !== status.replica.coreGeneration))
    )
      invalid('Playout availability status conflicts with the reviewed Engine mapping or fence.');
    return status;
  }

  #permit(
    endpoint: ManagedCgEndpoint,
    owner: AvailabilityOwner,
    status: AvailabilityStatus,
    intent: AvailabilityIntent,
  ): { selection: AvailabilitySelection; localFence: ManagedFence } {
    const { localFence, selection } = status;
    if (
      !status.canSendCommands ||
      status.engineId !== endpoint.engineId ||
      selection === null ||
      selection.engineId !== endpoint.engineId ||
      selection.controllerId !== intent.controllerId ||
      intent.originEpoch > selection.epoch ||
      localFence === null ||
      localFence.ownerEngineId !== endpoint.engineId ||
      localFence.coreGeneration !== status.replica.coreGeneration ||
      !matchesMembership(localFence, owner)
    )
      invalid('Playout did not confirm a writable local permit for this Bridge selection.');
    return { selection, localFence };
  }

  #parseResult(response: unknown, intent: AvailabilityIntent): ManagedResult {
    const parsed = managedResultSchema.safeParse(response);
    if (
      !parsed.success ||
      !parsed.data.admitted ||
      parsed.data.commandId !== intent.commandId ||
      parsed.data.revision !== intent.sequence ||
      parsed.data.fence.groupId !== this.#groupId ||
      parsed.data.fence.ownerEngineId !== parsed.data.target.engineId ||
      !this.#members.some((endpoint) => matchesReplica(parsed.data.target, endpoint))
    )
      invalid('Playout returned an invalid result for the availability command.');
    return parsed.data;
  }

  async #request(
    endpoint: ManagedCgEndpoint,
    route: string,
    body?: object | string,
  ): Promise<unknown> {
    const registered = this.#members.find(
      (member) =>
        matchesReplica(endpoint, member) && new URL(endpoint.origin).origin === member.origin,
    );
    if (registered === undefined) invalid('The availability Engine was not configured.');
    const bearer = registered.operatorBearer();
    if (bearer === undefined || bearer === '' || /\s/.test(bearer))
      throw new ManagedCgAvailabilityApiError(
        'The availability Engine needs an operator session.',
        'refused',
      );
    const url = new URL(
      '/api/v2/channels/' + encodeURIComponent(registered.channelCode) + '/external-cg/' + route,
      registered.origin,
    );
    const request = typeof body === 'object' ? serializeRequest(body) : body;
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: 'Bearer ' + bearer,
          ...(request !== undefined && { 'Content-Type': 'application/json' }),
        },
        ...(request !== undefined && { body: request }),
        signal: AbortSignal.timeout(body === undefined ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS),
        connectTimeoutMs: READ_TIMEOUT_MS,
        maxResponseBytes: MAX_RESPONSE_BYTES,
        redirect: 'error',
      });
    } catch (error) {
      if (error instanceof PlayoutRequestError && error.code === 'FAILED')
        invalid('The availability Engine returned an invalid response.');
      throw new ManagedCgAvailabilityApiError(
        'The availability Engine request could not be confirmed.',
        'unavailable',
      );
    }
    const value: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = errorSchema.safeParse(value);
      throw new ManagedCgAvailabilityApiError(
        'The availability Engine refused the request.',
        'refused',
        error.success ? error.data.error : undefined,
        response.status,
      );
    }
    return value;
  }
}
