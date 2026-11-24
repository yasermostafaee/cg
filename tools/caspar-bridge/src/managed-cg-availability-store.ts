import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  availabilityIntentSchema,
  availabilitySelectionSchema,
} from './managed-cg-availability-api.js';

const sequence = z.number().int().safe().nonnegative();
const requestHash = z.string().regex(/^[a-f0-9]{64}$/i);
const selectionRequest = z
  .object({
    selection: availabilitySelectionSchema,
    expectedSequence: sequence,
    expectedRequestHash: z.union([requestHash, z.literal('')]),
  })
  .strict()
  .refine(
    ({ expectedSequence, expectedRequestHash }) =>
      expectedSequence === 0 || expectedRequestHash !== '',
    'A positive reviewed sequence requires a request hash',
  );

const committed = z.object({ intent: availabilityIntentSchema, requestHash }).strict();
const persistedState = z
  .object({
    revision: sequence,
    controllerId: z.string().uuid(),
    lastSequence: sequence,
    selected: selectionRequest.nullable(),
    committed: committed.nullable(),
    pending: availabilityIntentSchema.nullable(),
  })
  .strict()
  .superRefine((state, ctx) => {
    const { selected, pending, committed } = state;
    if (selected !== null && selected.selection.controllerId !== state.controllerId)
      ctx.addIssue({ code: 'custom', path: ['selected'], message: 'Unexpected controller' });
    if (pending !== null && pending.sequence !== state.lastSequence)
      ctx.addIssue({ code: 'custom', path: ['pending'], message: 'Unexpected pending sequence' });
    if (
      pending !== null &&
      committed !== null &&
      (pending.sequence < committed.intent.sequence ||
        (pending.sequence === committed.intent.sequence &&
          !isDeepStrictEqual(pending, committed.intent)))
    ) {
      ctx.addIssue({ code: 'custom', path: ['pending'], message: 'Conflicting pending intent' });
    }
    for (const [key, intent] of [
      ['pending', pending],
      ['committed', committed?.intent ?? null],
    ] as const) {
      if (intent === null) continue;
      if (
        intent.controllerId !== state.controllerId ||
        intent.commandId !== availabilityCommandId(intent.controllerId, intent.sequence) ||
        intent.sequence > state.lastSequence ||
        selected === null ||
        intent.originEpoch > selected.selection.epoch
      ) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Inconsistent durable intent' });
      }
    }
  });

export type ManagedCgAvailabilityIntent = z.infer<typeof availabilityIntentSchema>;
export type ManagedCgAvailabilityState = Readonly<z.infer<typeof persistedState>>;
type NextState = Omit<ManagedCgAvailabilityState, 'revision' | 'controllerId'>;

const journalEntry = z.object({ version: z.literal(1), state: persistedState }).strict();
const journalFile = /^(0|[1-9]\d*)\.json$/;
const temporaryFile = /^\.[0-9a-f-]{36}\.tmp$/i;

/** The .37 controller-scoped command identity uses RFC network-order bytes. */
export function availabilityCommandId(controllerId: string, sequence: number): string {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(controllerId)) {
    throw new Error('Invalid managed CG availability controller ID.');
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('Invalid managed CG availability command sequence.');
  }
  const sequenceBytes = Buffer.alloc(8);
  sequenceBytes.writeBigInt64BE(BigInt(sequence));
  const bytes = createHash('sha256')
    .update('apasai-cg-availability-v1:', 'ascii')
    .update(Buffer.from(controllerId.replaceAll('-', ''), 'hex'))
    .update(sequenceBytes)
    .digest()
    .subarray(0, 16);
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x80, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);
  const uuid = bytes.toString('hex');
  return [
    uuid.slice(0, 8),
    uuid.slice(8, 12),
    uuid.slice(12, 16),
    uuid.slice(16, 20),
    uuid.slice(20),
  ].join('-');
}

/**
 * The one Bridge controller's write-ahead state. A flushed immutable file is linked
 * into the next revision's exclusive slot. The newest complete record owns the
 * state. Keep the latest two revisions to bound storage across long-running shows.
 */
export class ManagedCgAvailabilityStore {
  constructor(private readonly directory: string) {}

  read(): ManagedCgAvailabilityState {
    const existing = this.readHead();
    if (existing !== undefined) return existing;
    const initial = persistedState.parse({
      revision: 0,
      controllerId: randomUUID(),
      lastSequence: 0,
      selected: null,
      committed: null,
      pending: null,
    });
    try {
      this.publish(initial);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const created = this.readHead();
    if (created === undefined) throw new Error('Missing managed CG availability state.');
    return created;
  }

  write(expected: ManagedCgAvailabilityState, next: NextState): ManagedCgAvailabilityState {
    const current = this.readHead();
    if (!isDeepStrictEqual(current, expected)) {
      throw new Error('Managed CG availability state changed before the write.');
    }
    const state = persistedState.parse({
      ...next,
      controllerId: expected.controllerId,
      revision: expected.revision + 1,
    });
    this.assertProgress(expected, state);
    try {
      this.publish(state);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      throw new Error('Managed CG availability state changed before the write.');
    }
    // If faster writers already retired this slot, a stale link cannot become
    // the head: pruning only follows publication of a newer revision.
    if (!isDeepStrictEqual(this.readHead(), state)) {
      throw new Error('Managed CG availability state advanced during the write.');
    }
    this.prune(state.revision);
    return state;
  }

  private assertProgress(
    previous: ManagedCgAvailabilityState,
    next: ManagedCgAvailabilityState,
  ): void {
    const previousSelection = previous.selected?.selection;
    const nextSelection = next.selected?.selection;
    if (
      next.lastSequence < previous.lastSequence ||
      (previousSelection !== undefined &&
        (nextSelection === undefined ||
          nextSelection.epoch < previousSelection.epoch ||
          (nextSelection.epoch === previousSelection.epoch &&
            !isDeepStrictEqual(previousSelection, nextSelection))))
    ) {
      throw new Error('Managed CG availability sequence or selection regressed.');
    }
    if (
      !isDeepStrictEqual(previous.committed, next.committed) &&
      (next.committed === null || !isDeepStrictEqual(previous.pending, next.committed.intent))
    ) {
      throw new Error('The settled managed CG checkpoint must match the reserved intent.');
    }
    if (
      next.pending !== null &&
      previous.pending !== null &&
      !isDeepStrictEqual(previous.pending, next.pending)
    ) {
      throw new Error('Resolve the outstanding managed CG intent before reserving another.');
    }
  }

  private readHead(): ManagedCgAvailabilityState | undefined {
    // A concurrent publisher may prune the file identified by readdir before
    // this reader opens it. Retry the lookup in that case, never on bad data.
    for (let attempt = 0; attempt < 3; attempt++) {
      const revisions = this.revisions();
      const revision = revisions.at(-1);
      if (revision === undefined) return undefined;
      let body: string;
      try {
        body = fs.readFileSync(this.file(revision), 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new Error('The durable DualReady state is unreadable.');
      }
      const entry = journalEntry.safeParse(parsed);
      if (!entry.success) throw new Error('The durable DualReady state is unreadable.');
      const { state } = entry.data;
      if (state.revision !== revision)
        throw new Error('Managed CG availability revision mismatch.');
      if (this.revisions().at(-1) !== revision) continue;
      return state;
    }
    throw new Error('Managed CG availability state could not be read consistently.');
  }

  private revisions(): number[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return names
      .filter((name) => !temporaryFile.test(name))
      .map((name) => {
        const revision = Number(journalFile.exec(name)?.[1]);
        if (!Number.isSafeInteger(revision))
          throw new Error('Unexpected file in managed CG availability state.');
        return revision;
      })
      .sort((a, b) => a - b);
  }

  private file(revision: number): string {
    return path.join(this.directory, `${revision}.json`);
  }

  private publish(state: ManagedCgAvailabilityState): void {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(this.directory, `.${randomUUID()}.tmp`);
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify({ version: 1, state }), 'utf8');
      fs.fsyncSync(fd);
      fs.linkSync(temporary, this.file(state.revision));
      // Node's Windows file handles cannot fsync directories; the file is already flushed.
      if (process.platform !== 'win32') {
        for (const directory of [this.directory, path.dirname(path.resolve(this.directory))]) {
          const directoryFd = fs.openSync(directory, 'r');
          try {
            fs.fsyncSync(directoryFd);
          } finally {
            fs.closeSync(directoryFd);
          }
        }
      }
    } finally {
      fs.closeSync(fd);
      try {
        fs.unlinkSync(temporary);
      } catch {
        // A crash or cleanup failure leaves an unpublished file the reader ignores.
      }
    }
  }

  private prune(head: number): void {
    for (const revision of this.revisions()) {
      if (revision >= head - 1) break;
      try {
        fs.unlinkSync(this.file(revision));
      } catch {
        // An old revision may be in use by a reader or already pruned.
      }
    }
  }
}
