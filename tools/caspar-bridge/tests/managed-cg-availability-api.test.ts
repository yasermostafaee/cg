import { describe, expect, it, vi } from 'vitest';
import {
  ManagedCgAvailabilityApi,
  type AvailabilityIntent,
  type AvailabilitySelection,
} from '../src/managed-cg-availability-api.js';
import type { ManagedCgEndpoint } from '../src/managed-cg-commands.js';
import type { ManagedFence, ManagedResult } from '../src/managed-cg-contract.js';
import type { PlayoutFetchInit } from '../src/playout-http.js';

// Match the fields and shapes in the captured .37 vendor responses.
const groupId = 'fixture-availability';
const memberA = {
  engineId: 'A',
  origin: 'http://127.0.0.1:21111',
  channelCode: 'cg-a',
  nativeChannel: 1,
  operatorBearer: () => 'operator-a',
} satisfies ManagedCgEndpoint;
const memberB = {
  engineId: 'B',
  origin: 'http://127.0.0.1:21112',
  channelCode: 'cg-b',
  nativeChannel: 2,
  operatorBearer: () => 'operator-b',
} satisfies ManagedCgEndpoint;
const engines = [memberA, memberB];
const selection: AvailabilitySelection = {
  engineId: 'B',
  controllerId: 'e53fc862-3b3b-4853-8457-a5fb8bf3e16f',
  selectionId: '869c8284-dd92-4338-9a21-0f9fe3796d96',
  epoch: 2,
};
const fence: ManagedFence = {
  groupId,
  membershipRevision: 1,
  membershipHash: 'A'.repeat(64),
  term: 2,
  transferId: '96364c8c-fb85-4421-af01-c6bed85a9019',
  ownerEngineId: 'B',
  localEpoch: 4,
  coreGeneration: 'one-core-generation',
  leaseId: '21702aca-fe8c-46b0-b76a-2dc040a03c02',
};
const intent: AvailabilityIntent = {
  commandId: 'a8cffaff-c9df-848b-a15e-502b72e35521',
  controllerId: selection.controllerId,
  sequence: 1,
  originEpoch: 1,
  operation: 'clear',
  layout: [],
};
const requestHash = 'B'.repeat(64);
const members = engines.map((endpoint, priority) => ({
  engineId: endpoint.engineId,
  apiOrigin: endpoint.origin,
  channelCode: endpoint.channelCode,
  nativeChannel: endpoint.nativeChannel,
  programmeLayer: 5,
  protectedLayers: [99],
  priority,
}));

const ownerView = {
  groupId,
  membershipRevision: fence.membershipRevision,
  membershipHash: fence.membershipHash,
  status: 'availabilityOnly',
  owner: null,
  fence: null,
  leaseExpiresAt: null,
  canSendCommands: false,
  revision: 0,
  members,
  allowedLayers: [{ first: 80, last: 99, kind: 'html' }],
  replicas: [],
  reason: 'cg.useAvailabilityContract',
};
const replica = {
  engineId: memberB.engineId,
  channelCode: memberB.channelCode,
  nativeChannel: memberB.nativeChannel,
  coreGeneration: fence.coreGeneration,
  preparedRevision: 0,
  appliedRevision: 0,
  renderConfirmation: 'notApplied',
  error: 'cg.voterRestartQuarantine',
};
const availability = {
  mode: 'dualReady',
  globallyExclusiveOwner: false,
  engineId: memberB.engineId,
  readyForSelection: true,
  selection,
  localFence: fence,
  canSendCommands: true,
  committedSequence: 0,
  committedRequestHash: '',
  receiptFloor: 0,
  replica,
  reason: null,
  standby: null,
};
const accepted: ManagedResult = {
  commandId: intent.commandId,
  requestHash,
  status: 'applied',
  admitted: true,
  nativeStatus: 'applied',
  renderStatus: 'nativeOnly',
  revision: 1,
  target: { engineId: 'B', channelCode: 'cg-b', nativeChannel: 2, layer: 80 },
  fence,
  replicas: [],
  error: null,
  updatedAt: '2026-11-24T10:27:10.5152151+03:30',
  atomicLayout: true,
};

function endpointPath(input: string | URL | Request): string {
  if (input instanceof URL) return input.pathname + input.search;
  throw new Error('Expected an availability URL');
}

function fixture(routes: Readonly<Record<string, unknown>> = {}) {
  const fetch = vi.fn(async (input: string | URL | Request, _init?: PlayoutFetchInit) => {
    const route = endpointPath(input).split('/external-cg/')[1];
    const fields: Readonly<Record<string, unknown>> = {
      owner: ownerView,
      availability,
      ...routes,
    };
    if (route === undefined || !(route in fields)) throw new Error('Unexpected request');
    const value = fields[route];
    if (value instanceof Response) return value;
    if (value instanceof Error) throw value;
    return Response.json(value);
  });
  const api = new ManagedCgAvailabilityApi({ groupId, members: engines, fetch });
  return { api, fetch };
}

describe('Playout .37 availability wire protocol', () => {
  it('reads an availability-only group using the destination member session', async () => {
    const { api, fetch } = fixture();
    await expect(api.observe(memberB)).resolves.toMatchObject({
      owner: { status: 'availabilityOnly', owner: null },
      status: { canSendCommands: true, replica: { renderConfirmation: 'notApplied' } },
    });
    for (const [url, options] of fetch.mock.calls) {
      expect(url).toMatchObject({ origin: memberB.origin });
      expect(new Headers(options?.headers).get('authorization')).toBe('Bearer operator-b');
      expect(endpointPath(url)).toMatch(/^\/api\/v2\/channels\/cg-b\/external-cg\//);
    }
  });

  it('requires both mappings and refuses a writable permit from a different Core generation', async () => {
    const invalidGroup = fixture({ owner: { ...ownerView, members: [members[0]] } });
    await expect(invalidGroup.api.observe(memberB)).rejects.toMatchObject({ kind: 'invalid' });
    expect(invalidGroup.fetch).toHaveBeenCalledTimes(1);
    const invalidStatus = fixture({
      availability: { ...availability, replica: { ...replica, coreGeneration: 'another-core' } },
    }).api;
    await expect(invalidStatus.observe(memberB)).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('pins selection to the reviewed sequence and hash and sends the same intent with a fresh fence', async () => {
    const { api, fetch } = fixture({
      'availability/select': availability,
      'availability/commands': accepted,
    });
    const observed = await api.observe(memberB);
    const selected = await api.select(memberB, observed.owner, observed.status, selection);
    const selectOptions = fetch.mock.calls.at(-1)?.[1];
    expect(JSON.parse(String(selectOptions?.body))).toEqual({
      selection,
      expectedSequence: 0,
      expectedRequestHash: '',
    });
    await expect(api.post(memberB, observed.owner, selected, intent)).resolves.toEqual(accepted);
    const writeOptions = fetch.mock.calls.at(-1)?.[1];
    expect(writeOptions).toMatchObject({ method: 'POST', maxResponseBytes: 524_288 });
    expect(JSON.parse(String(writeOptions?.body))).toEqual({
      ...intent,
      selection,
      expectedFence: fence,
      resumeWithoutReplay: true,
    });
  });

  it('validates blocked layers, unsupported recovery and encoded size before a command is reserved', async () => {
    const { api, fetch } = fixture();
    const { owner, status } = await api.observe(memberB);
    const graphic = {
      kind: 'html' as const,
      layer: 80,
      graphicInstanceId: 'graphic',
      template: {
        entryPath: 'index.html',
        version: 'fixture-v1',
        resumeWithoutReplay: true,
        assets: [
          {
            path: 'index.html',
            uri: 'http://127.0.0.1:21110/index.html',
            sha256: requestHash,
            contentType: 'text/html',
          },
        ],
      },
    };
    for (const layer of [
      { ...graphic, layer: 99 },
      { ...graphic, template: { ...graphic.template, resumeWithoutReplay: false } },
      { ...graphic, data: { text: 'لیست'.repeat(40_000) } },
    ]) {
      expect(() =>
        api.validateSubmission(memberB, owner, status, { ...intent, layout: [layer] }),
      ).toThrow();
    }
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves an explicit Playout denial and distinguishes a lost request', async () => {
    const denial = fixture({
      'availability/commands': Response.json({ error: 'cg.staleOwner' }, { status: 409 }),
    }).api;
    const denied = await denial.observe(memberB);
    await expect(denial.post(memberB, denied.owner, denied.status, intent)).rejects.toMatchObject({
      kind: 'refused',
      code: 'cg.staleOwner',
      status: 409,
    });
    const lost = fixture({ availability: new Error('test request disconnected') }).api;
    await expect(lost.observe(memberB)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('reads absence as local only and rejects any false proof of global non-admission', async () => {
    const path =
      'availability/commands/' +
      intent.commandId +
      '?controllerId=' +
      selection.controllerId +
      '&sequence=1';
    const absent = {
      commandId: intent.commandId,
      sequence: 1,
      status: 'notKnownLocally',
      result: null,
      committedSequence: 0,
      receiptFloor: 0,
      globalNonAcceptanceProven: false,
      next: 'retry-same-full-request-on-selected-target',
    };
    const { api } = fixture({ [path]: absent });
    await expect(api.receipt(memberA, intent)).resolves.toEqual(absent);
    const invalidReceipt = fixture({ [path]: { ...absent, globalNonAcceptanceProven: true } }).api;
    await expect(invalidReceipt.receipt(memberA, intent)).rejects.toMatchObject({
      kind: 'invalid',
    });
  });
});
