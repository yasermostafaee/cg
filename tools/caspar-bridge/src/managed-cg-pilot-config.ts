import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { defaultFixedLayerBank, type FixedLayerBank } from '@cg/shared-ipc';
import { z } from 'zod';
import { loadFixedLayerBanks } from './fixed-layers-store.js';
import { ManagedCgAvailabilityCommands } from './managed-cg-availability-commands.js';
import { ManagedCgAvailabilityStore } from './managed-cg-availability-store.js';
import { ManagedCgCommands } from './managed-cg-commands.js';
import { managedMemberSchema } from './managed-cg-contract.js';
import { ManagedCgJournal } from './managed-cg-journal.js';
import type { ManagedCgPilot } from './managed-cg-pilot.js';

const pilotMember = managedMemberSchema
  .pick({ engineId: true, nativeChannel: true })
  .extend({
    origin: managedMemberSchema.shape.apiOrigin.transform((value) => new URL(value).origin),
    channelCode: managedMemberSchema.shape.channelCode.refine(
      (value) => value !== '.' && value !== '..',
    ),
    operatorTokenEnv: z.string().regex(/^[a-z_][a-z0-9_]{0,127}$/i),
  })
  .strict();

const pilotConfig = z
  .object({
    groupId: z.string().regex(/^[a-z0-9_-][a-z0-9_.-]{0,127}$/i),
    channel: z.number().int().min(1).max(128),
    members: z.array(pilotMember).min(2).max(4),
    authorityMode: z.enum(['quorum', 'dualReady']).default('quorum'),
  })
  .strict()
  .refine(({ authorityMode, members }) => authorityMode !== 'dualReady' || members.length === 2);

export interface LoadedManagedCgPilot {
  readonly stateHome: string;
  readonly pilot: ManagedCgPilot;
  readonly fixedLayers: FixedLayerBank;
}

/** Read the opt-in test profile. Only environment variable names belong in its JSON. */
export function loadManagedCgPilotConfig(
  filePath: string,
  stateHome: string,
  env: NodeJS.ProcessEnv = process.env,
): LoadedManagedCgPilot {
  if (stateHome.trim() === '') throw new Error('Managed CG pilot needs an explicit state home.');
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error('Cannot read the managed CG pilot configuration as JSON.');
  }
  const parsed = pilotConfig.safeParse(input);
  if (!parsed.success) {
    throw new Error('Invalid managed CG pilot group, channel or member configuration.');
  }
  const { groupId, channel, members, authorityMode } = parsed.data;
  if (
    new Set(members.map(({ origin }) => origin)).size !== members.length ||
    new Set(members.map(({ engineId }) => engineId.toLowerCase())).size !== members.length ||
    new Set(members.map(({ operatorTokenEnv }) => operatorTokenEnv.toLowerCase())).size !==
      members.length
  ) {
    throw new Error('Managed CG pilot needs distinct Engine origins, IDs and operator sessions.');
  }
  const capturedTokens = new Set<string>();
  const endpoints = members.map(({ operatorTokenEnv, ...member }) => {
    const token = Object.hasOwn(env, operatorTokenEnv) ? env[operatorTokenEnv] : undefined;
    if (authorityMode === 'dualReady' && token === undefined)
      return { ...member, operatorBearer: () => undefined };
    if (token === undefined || token === '' || /\s/.test(token) || capturedTokens.has(token)) {
      throw new Error(
        'Managed CG pilot needs a separate operator token for each configured Engine.',
      );
    }
    capturedTokens.add(token);
    return { ...member, operatorBearer: () => token };
  });
  if (capturedTokens.size === 0)
    throw new Error('Managed CG pilot needs an operator token for the selected Engine.');

  // A pilot has its own connection, rows and journal even if its parent directory
  // is a regular Bridge state home.
  const isolatedHome = path.resolve(stateHome, 'external-cg-pilot', groupId);
  const runtimeDir = path.join(isolatedHome, '.cg-runtime');
  const banks = loadFixedLayerBanks(path.join(runtimeDir, 'bridge-fixed-layers.json'));
  const fixedLayers = banks === null ? { ...defaultFixedLayerBank(), channel } : banks[0];
  if (fixedLayers?.channel !== channel || (banks !== null && banks.length !== 1)) {
    throw new Error('Managed CG pilot state must declare its single configured channel.');
  }
  const journal = new ManagedCgJournal(path.join(runtimeDir, 'external-cg-journal'));
  if (authorityMode === 'dualReady' && journal.get(groupId) !== undefined)
    throw new Error('Resolve the pending quorum command before using DualReady.');
  const commands =
    authorityMode === 'dualReady'
      ? new ManagedCgAvailabilityCommands({
          groupId,
          members: endpoints,
          store: new ManagedCgAvailabilityStore(path.join(runtimeDir, 'external-cg-availability')),
        })
      : new ManagedCgCommands({ groupId, members: endpoints, journal });
  return { stateHome: isolatedHome, pilot: { channel, commands }, fixedLayers };
}
