import { describe, expect, it } from 'vitest';
import {
  managedLayoutCommandSchema,
  managedLayoutLayerSchema,
  managedOwnerSchema,
  managedResultSchema,
  managedTemplateSchema,
} from '../src/managed-cg-contract.js';

const hash = 'a'.repeat(64);
const commandId = '965e3c3c-3fb8-4749-9618-ec72a848dc00';
const member = {
  engineId: 'A',
  channelCode: 'cg-a',
  apiOrigin: 'http://127.0.0.1:8080',
  nativeChannel: 1,
  programmeLayer: 5,
  priority: 0,
  protectedLayers: [5, 90],
};
const fence = {
  groupId: 'isolated-cg',
  membershipRevision: 1,
  membershipHash: hash,
  term: 1,
  transferId: 'ed686f96-18d7-46b8-bd7f-85563810131c',
  ownerEngineId: 'A',
  localEpoch: 2,
  coreGeneration: '4658c27a-7ddf-4b9b-8ac7-bf1661283f67',
  leaseId: 'b69fbb30-b041-48ba-8af4-4b4fd6cb3f4c',
  futureFenceField: { epoch: 7, labels: ['keep', null] },
};
const replica = {
  engineId: 'B',
  channelCode: 'cg-b',
  nativeChannel: 2,
  coreGeneration: null,
  preparedRevision: 3,
  appliedRevision: -1,
  renderConfirmation: 'notApplied',
  error: null,
};
const owner = {
  groupId: fence.groupId,
  membershipRevision: fence.membershipRevision,
  membershipHash: hash,
  status: 'active',
  owner: member,
  fence,
  leaseExpiresAt: '2026-11-22T12:00:00.1234567+00:00',
  canSendCommands: true,
  revision: 3,
  members: [member],
  allowedLayers: [{ first: 60, last: 89, kind: 'media' }],
  replicas: [replica],
  reason: null,
};
const target = { engineId: 'A', channelCode: 'cg-a', nativeChannel: 1, layer: 60 };
const result = {
  commandId,
  requestHash: hash,
  status: 'rolledBack',
  admitted: true,
  nativeStatus: 'rolledBack',
  renderStatus: 'previousLayoutPreserved',
  revision: 3,
  target,
  fence,
  replicas: [],
  error: null,
  updatedAt: '2026-11-22T12:00:00.1234567+00:00',
  atomicLayout: true,
  retainedState: { revision: 0, requestHash: '' },
};
const mediaLayer = {
  layer: 60,
  kind: 'media',
  graphicInstanceId: 'clip-1',
  media: {
    fingerprint: hash,
    startFrame: 0,
    lengthFrames: 100,
    framesPerSecond: 25,
    loop: true,
    audio: { muted: false, gain: 1, channels: [0, 1] },
  },
};
const layoutCommand = {
  commandId,
  target,
  expectedFence: fence,
  expectedRevision: 2,
  operation: 'layout',
  layout: [mediaLayer],
};

describe('Playout managed CG wire contract', () => {
  it('preserves the original fence and treats unknown replica revision as an observation', () => {
    expect(managedOwnerSchema.parse(owner)).toEqual(owner);
  });

  it('keeps a rollback decision and its retained layout on separate revisions', () => {
    expect(managedResultSchema.parse(result)).toEqual(result);
    expect(
      managedResultSchema.safeParse({
        ...result,
        retainedState: { revision: 2, requestHash: '' },
      }).success,
    ).toBe(false);
  });

  it('accepts media layers and a complete empty layout without adding wire fields', () => {
    expect(managedLayoutCommandSchema.parse(layoutCommand)).toEqual(layoutCommand);
    const empty = { ...layoutCommand, layout: [] };
    expect(managedLayoutCommandSchema.parse(empty)).toEqual(empty);
    expect(managedLayoutLayerSchema.safeParse({ ...mediaLayer, kind: 'video' }).success).toBe(
      false,
    );
  });

  it('rejects invalid command coordinates, duplicate layers, and payload limits', () => {
    expect(
      managedLayoutCommandSchema.safeParse({
        ...layoutCommand,
        target: { ...target, engineId: 'B' },
      }).success,
    ).toBe(false);
    expect(
      managedLayoutCommandSchema.safeParse({
        ...layoutCommand,
        layout: [mediaLayer, mediaLayer],
      }).success,
    ).toBe(false);
    expect(
      managedLayoutCommandSchema.safeParse({
        ...layoutCommand,
        layout: Array.from({ length: 65 }, (_, layer) => ({ ...mediaLayer, layer })),
      }).success,
    ).toBe(false);
    expect(
      managedLayoutCommandSchema.safeParse({
        ...layoutCommand,
        layout: [{ ...mediaLayer, data: { title: 'الف'.repeat(132_000) } }],
      }).success,
    ).toBe(false);
  });

  it('accepts nested JSON data and refuses values that a journal cannot round trip', () => {
    const data = { a: null, b: ['word', { count: 1, available: false }] };
    expect(managedLayoutLayerSchema.parse({ ...mediaLayer, data })).toEqual({
      ...mediaLayer,
      data,
    });
    expect(
      managedLayoutLayerSchema.safeParse({ ...mediaLayer, data: { count: NaN } }).success,
    ).toBe(false);
    expect(
      managedLayoutLayerSchema.safeParse({ ...mediaLayer, data: { count: undefined } }).success,
    ).toBe(false);
  });

  it('requires the hash-verified bundle to include a valid HTML entry', () => {
    const template = {
      entryPath: 'index.html',
      version: 'test-v1',
      resumeWithoutReplay: true,
      assets: [
        {
          path: 'index.html',
          uri: 'http://127.0.0.1:5281/index.html',
          sha256: hash,
          contentType: 'text/html',
        },
      ],
    };
    expect(managedTemplateSchema.parse(template)).toEqual(template);
    expect(
      managedTemplateSchema.safeParse({ ...template, entryPath: 'missing.html' }).success,
    ).toBe(false);
    expect(
      managedTemplateSchema.safeParse({
        ...template,
        assets: [...template.assets, { ...template.assets[0], path: 'Index.HTML' }],
      }).success,
    ).toBe(false);
  });
});
