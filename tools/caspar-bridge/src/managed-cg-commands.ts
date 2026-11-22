import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  managedLayoutCommandSchema,
  managedOwnerSchema,
  managedPreparedTemplateSchema,
  managedResultSchema,
  managedTemplateSchema,
  type ManagedLayoutCommand,
  type ManagedLayoutLayer,
  type ManagedMember,
  type ManagedOwner,
  type ManagedResult,
  type ManagedTemplate,
} from './managed-cg-contract.js';
import type { ManagedCgJournal, ManagedCgPending } from './managed-cg-journal.js';
import { playoutFetch } from './playout-http.js';

/** The verified station mapping and the operator's session on this particular Engine. */
export interface ManagedCgEndpoint {
  readonly origin: string;
  readonly engineId: string;
  readonly channelCode: string;
  readonly nativeChannel: number;
  readonly operatorBearer: () => string | undefined;
}

export interface ManagedCgCommandsOptions {
  readonly groupId: string;
  readonly members: readonly ManagedCgEndpoint[];
  readonly journal: ManagedCgJournal;
  readonly fetch?: typeof playoutFetch;
  readonly now?: () => number;
}

export type ManagedCgOutcome =
  | { readonly status: 'applied' | 'rolledBack'; readonly result: ManagedResult }
  | { readonly status: 'pending'; readonly commandId: string };

const OWNER_READ_TIMEOUT_MS = 5_000;
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_WIRE_BYTES = 262_144;

function configuredOrigin(value: string): string {
  const url = new URL(value);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Managed CG requires a configured Playout API origin.');
  }
  return url.origin;
}

function isMappedMember(member: ManagedMember, endpoint: ManagedCgEndpoint): boolean {
  return (
    member.engineId === endpoint.engineId &&
    member.channelCode === endpoint.channelCode &&
    member.nativeChannel === endpoint.nativeChannel &&
    configuredOrigin(member.apiOrigin) === endpoint.origin
  );
}

/**
 * Executes complete, prepared external-CG layouts on an opted-in Playout group.
 * The caller supplies the whole external layer set and verified channel mappings.
 * No CasparCG socket or replica write route is available to the executor.
 */
export class ManagedCgCommands {
  readonly #groupId: string;
  readonly #members: readonly ManagedCgEndpoint[];
  readonly #journal: ManagedCgJournal;
  readonly #fetch: typeof playoutFetch;
  readonly #now: () => number;
  #busy = false;

  constructor(options: ManagedCgCommandsOptions) {
    if (options.groupId.trim() === '' || options.members.length === 0) {
      throw new Error('Managed CG requires a configured Playout group and its member mappings.');
    }
    this.#groupId = options.groupId;
    this.#members = options.members.map((member) => ({
      ...member,
      origin: configuredOrigin(member.origin),
    }));
    if (
      new Set(this.#members.map(({ engineId }) => engineId)).size !== this.#members.length ||
      new Set(this.#members.map(({ origin }) => origin)).size !== this.#members.length
    ) {
      throw new Error('Managed CG requires a distinct Engine and API origin for each member.');
    }
    this.#journal = options.journal;
    this.#fetch = options.fetch ?? playoutFetch;
    this.#now = options.now ?? Date.now;
  }

  /** Caches and verifies the same bundle on every configured Engine without applying it. */
  async prepareTemplate(template: ManagedTemplate): Promise<string> {
    const manifest = managedTemplateSchema.parse(template);
    const body = JSON.stringify(manifest);
    const prepared = await Promise.all(
      this.#members.map(async (member) => {
        const response = await this.#request(member, 'templates:prepare', body);
        const result = managedPreparedTemplateSchema.safeParse(response);
        if (
          !result.success ||
          !result.data.available ||
          result.data.engineId !== member.engineId ||
          result.data.version !== manifest.version
        ) {
          throw new Error(
            'Playout did not confirm the template on Engine ' + member.engineId + '.',
          );
        }
        return result.data.bundleHash.toLowerCase();
      }),
    );
    const bundleHash = prepared[0];
    if (bundleHash === undefined || prepared.some((hash) => hash !== bundleHash)) {
      throw new Error('Playout members prepared different copies of the managed template.');
    }
    return bundleHash;
  }

  /**
   * Replaces every external layer in the group. Callers must deliberately supply the full layout,
   * including any layers they want to retain. A pending command must be reconciled first.
   */
  async submitLayout(layout: readonly ManagedLayoutLayer[]): Promise<ManagedCgOutcome> {
    if (this.#busy) throw new Error('A managed CG operation is already in progress.');
    this.#busy = true;
    try {
      const unresolved = this.#journal.get(this.#groupId);
      if (unresolved !== undefined) return { status: 'pending', commandId: unresolved.commandId };

      // Capture the caller's complete draft before the ownership round trip.
      const layers = structuredClone(layout);
      const { endpoint, owner } = await this.#readOwner();
      const anchor = Math.min(...owner.allowedLayers.map(({ first }) => first));
      if (!Number.isFinite(anchor)) throw new Error('Playout has no allowed managed CG layers.');
      for (const layer of layers) {
        if (
          !owner.allowedLayers.some(
            ({ first, last, kind }) =>
              layer.layer >= first && layer.layer <= last && layer.kind === kind,
          )
        ) {
          throw new Error('The managed layout contains a layer outside its allowed kind or range.');
        }
      }
      const command = managedLayoutCommandSchema.parse({
        commandId: randomUUID(),
        target: {
          engineId: endpoint.engineId,
          channelCode: endpoint.channelCode,
          nativeChannel: endpoint.nativeChannel,
          layer: anchor,
        },
        expectedFence: owner.fence,
        expectedRevision: owner.revision,
        operation: 'layout',
        layout: layers,
      });
      const requestBody = JSON.stringify(command);
      if (Buffer.byteLength(requestBody, 'utf8') > MAX_WIRE_BYTES) {
        throw new Error('The managed layout exceeds the Playout command size limit.');
      }
      const pending = {
        ownerOrigin: endpoint.origin,
        localChannelCode: endpoint.channelCode,
        commandId: command.commandId,
        requestBody,
      };
      this.#journal.reserve(this.#groupId, pending);
      const result = await this.#readResult(endpoint, command, 'commands', requestBody);
      return this.#settle(pending, result);
    } finally {
      this.#busy = false;
    }
  }

  /** Consult the original Engine and receipt. Recovery never submits a second layout. */
  async reconcilePending(): Promise<ManagedCgOutcome | undefined> {
    if (this.#busy) throw new Error('A managed CG operation is already in progress.');
    this.#busy = true;
    try {
      const pending = this.#journal.get(this.#groupId);
      if (pending === undefined) return undefined;

      const command = managedLayoutCommandSchema.parse(JSON.parse(pending.requestBody));
      const endpoint = this.#members.find(
        ({ origin, channelCode, engineId, nativeChannel }) =>
          origin === pending.ownerOrigin &&
          channelCode === pending.localChannelCode &&
          channelCode === command.target.channelCode &&
          engineId === command.target.engineId &&
          nativeChannel === command.target.nativeChannel,
      );
      if (
        endpoint === undefined ||
        command.commandId !== pending.commandId ||
        command.expectedFence.groupId !== this.#groupId
      ) {
        throw new Error('The pending managed CG command no longer matches its station mapping.');
      }

      const receipt = 'commands/' + pending.commandId;
      const observed = await Promise.all(
        this.#members.map(async (member) => ({
          member,
          result: await this.#readResult(member, command, receipt),
        })),
      );
      const decisive = observed.flatMap(({ result }) =>
        result?.status === 'applied' || result?.status === 'rolledBack' ? [result] : [],
      );
      if (decisive.length > 0) {
        const first = decisive[0];
        return this.#settle(
          pending,
          first !== undefined &&
            decisive.every(
              (result) =>
                result.status === first.status && result.requestHash === first.requestHash,
            )
            ? first
            : undefined,
        );
      }
      const original = observed.find(({ member }) => member === endpoint)?.result;
      const result =
        original === undefined
          ? undefined
          : await this.#readResult(endpoint, command, receipt + '/reconcile', null);
      return this.#settle(pending, result);
    } finally {
      this.#busy = false;
    }
  }

  async #readOwner(): Promise<{ endpoint: ManagedCgEndpoint; owner: ManagedOwner }> {
    const observations = await Promise.all(
      this.#members.map(async (endpoint) => ({
        endpoint,
        owner: managedOwnerSchema.safeParse(await this.#request(endpoint, 'owner')),
      })),
    );
    const active = observations.flatMap(({ endpoint, owner }) =>
      owner.success && owner.data.status === 'active' ? [{ endpoint, owner: owner.data }] : [],
    );
    for (const { owner } of active) {
      if (
        owner.groupId !== this.#groupId ||
        owner.members.length !== this.#members.length ||
        !this.#members.every((endpoint) =>
          owner.members.some((member) => isMappedMember(member, endpoint)),
        )
      ) {
        throw new Error('The managed Playout group no longer matches the station mapping.');
      }
    }
    const writable = active.filter(({ endpoint, owner }) => {
      const { fence, leaseExpiresAt } = owner;
      return (
        owner.canSendCommands &&
        owner.owner !== null &&
        isMappedMember(owner.owner, endpoint) &&
        fence !== null &&
        fence.ownerEngineId === endpoint.engineId &&
        fence.groupId === owner.groupId &&
        fence.membershipRevision === owner.membershipRevision &&
        fence.membershipHash === owner.membershipHash &&
        leaseExpiresAt !== null &&
        Date.parse(leaseExpiresAt) > this.#now()
      );
    });
    const selected = writable.length === 1 ? writable[0] : undefined;
    if (
      selected === undefined ||
      active.some(
        ({ owner }) =>
          owner.owner?.engineId !== selected.endpoint.engineId ||
          owner.membershipRevision !== selected.owner.membershipRevision ||
          owner.membershipHash !== selected.owner.membershipHash ||
          (owner.fence !== null &&
            (owner.fence.transferId !== selected.owner.fence?.transferId ||
              owner.fence.term !== selected.owner.fence?.term)),
      )
    ) {
      throw new Error('Playout has not confirmed a unique managed CG owner.');
    }
    return selected;
  }

  async #readResult(
    endpoint: ManagedCgEndpoint,
    command: ManagedLayoutCommand,
    suffix: string,
    postBody?: string | null,
  ): Promise<ManagedResult | undefined> {
    const receipt = managedResultSchema.safeParse(await this.#request(endpoint, suffix, postBody));
    if (!receipt.success) return undefined;
    const result = receipt.data;
    if (
      !result.admitted ||
      result.commandId !== command.commandId ||
      !isDeepStrictEqual(result.target, command.target) ||
      !isDeepStrictEqual(result.fence, command.expectedFence) ||
      result.revision !== command.expectedRevision + 1
    ) {
      return undefined;
    }
    return result;
  }

  #settle(pending: ManagedCgPending, result: ManagedResult | undefined): ManagedCgOutcome {
    if (result?.status !== 'applied' && result?.status !== 'rolledBack') {
      return { status: 'pending', commandId: pending.commandId };
    }
    this.#journal.resolve(this.#groupId, pending.commandId);
    return { status: result.status, result };
  }

  async #request(
    endpoint: ManagedCgEndpoint,
    suffix: string,
    postBody?: string | null,
  ): Promise<unknown> {
    const bearer = endpoint.operatorBearer();
    if (bearer === undefined || bearer === '') return undefined;
    const url = new URL(
      '/api/v2/channels/' + encodeURIComponent(endpoint.channelCode) + '/external-cg/' + suffix,
      endpoint.origin,
    );
    try {
      const response = await this.#fetch(url, {
        method: postBody === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: 'Bearer ' + bearer,
          ...(typeof postBody === 'string' && { 'Content-Type': 'application/json' }),
        },
        ...(typeof postBody === 'string' && { body: postBody }),
        signal: AbortSignal.timeout(
          postBody === undefined ? OWNER_READ_TIMEOUT_MS : COMMAND_TIMEOUT_MS,
        ),
        maxResponseBytes: MAX_WIRE_BYTES,
        redirect: 'error',
      });
      return response.ok ? ((await response.json()) as unknown) : undefined;
    } catch {
      // No transport failure is evidence that an admitted command did not execute.
      return undefined;
    }
  }
}
