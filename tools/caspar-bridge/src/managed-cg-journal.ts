import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

const pendingSchema = z
  .object({
    ownerOrigin: z.string().refine((value) => {
      try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
      } catch {
        return false;
      }
    }),
    localChannelCode: z.string().min(1),
    commandId: z.string().min(1),
    requestBody: z.string().min(1),
  })
  .strict();

export type ManagedCgPending = Readonly<z.infer<typeof pendingSchema>>;

const entrySchema = z
  .object({ version: z.literal(1), scope: z.string(), command: pendingSchema })
  .strict();
const receiptSchema = z.object({ version: z.literal(1), commandId: z.string().min(1) }).strict();
const fileName = /^([1-9]\d*)-(pending|resolved)\.json$/;
const temporaryName = /^\.[0-9a-f-]{36}\.tmp$/;

interface JournalHead {
  readonly generation: number;
  readonly pending: ManagedCgPending;
  readonly resolved: boolean;
}

/**
 * Keep one unresolved request per logical channel, independently of the current Playout owner.
 * Each generation has an immutable reservation and a separate receipt. A hard link publishes a
 * complete file without replacing a competing write. An older resolver can only write its own
 * receipt, so it cannot release a new command after the channel advances.
 */
export class ManagedCgJournal {
  constructor(private readonly directory: string) {}

  get(channelScope: string): ManagedCgPending | undefined {
    const head = this.readHead(channelScope);
    return head?.resolved === false ? head.pending : undefined;
  }

  reserve(channelScope: string, record: ManagedCgPending): void {
    const command = pendingSchema.parse(record);
    const head = this.readHead(channelScope);
    if (head?.resolved === false) throw new Error('Managed CG command is already pending');
    if (head?.pending.commandId === command.commandId)
      throw new Error('Managed CG command ID has already been reserved');

    const generation = (head?.generation ?? 0) + 1;
    if (!Number.isSafeInteger(generation)) throw new Error('Managed CG journal is full');
    this.publish(this.scopeDirectory(channelScope), `${generation}-pending.json`, {
      version: 1,
      scope: channelScope,
      command,
    });
  }

  /** The caller must verify the terminal response for this exact command before resolving. */
  resolve(channelScope: string, commandId: string): void {
    const head = this.readHead(channelScope);
    if (head?.pending.commandId !== commandId)
      throw new Error('Managed CG journal command ID does not match');
    if (head.resolved) return;

    const directory = this.scopeDirectory(channelScope);
    const file = `${head.generation}-resolved.json`;
    try {
      this.publish(directory, file, { version: 1, commandId });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // A second valid recovery can finish the same command in parallel.
      this.verifyReceipt(path.join(directory, file), head.pending.commandId);
    }
  }

  private scopeDirectory(channelScope: string): string {
    if (!channelScope) throw new Error('Managed CG journal needs a channel scope');
    return path.join(this.directory, createHash('sha256').update(channelScope).digest('hex'));
  }

  private readHead(channelScope: string): JournalHead | undefined {
    const directory = this.scopeDirectory(channelScope);
    let names: string[];
    try {
      names = fs.readdirSync(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }

    let generation = 0;
    for (const name of names) {
      if (temporaryName.test(name)) continue;
      const candidate = Number(fileName.exec(name)?.[1]);
      if (!Number.isSafeInteger(candidate) || candidate < 1)
        throw new Error('Unexpected file in managed CG journal');
      generation = Math.max(generation, candidate);
    }
    if (generation === 0) return undefined;

    const entryPath = path.join(directory, `${generation}-pending.json`);
    const entry = entrySchema.parse(JSON.parse(fs.readFileSync(entryPath, 'utf8')));
    if (entry.scope !== channelScope) throw new Error('Managed CG journal scope does not match');
    const receiptName = `${generation}-resolved.json`;
    const resolved = names.includes(receiptName);
    if (resolved) this.verifyReceipt(path.join(directory, receiptName), entry.command.commandId);
    return { generation, pending: entry.command, resolved };
  }

  private verifyReceipt(file: string, commandId: string): void {
    const receipt = receiptSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (receipt.commandId !== commandId)
      throw new Error('Managed CG journal receipt does not match');
  }

  private publish(directory: string, name: string, body: unknown): void {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `.${randomUUID()}.tmp`);
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(body), 'utf8');
      fs.fsyncSync(fd);
      fs.linkSync(temporary, path.join(directory, name));
      // Node cannot open a directory descriptor on Windows. It has already flushed the file.
      if (process.platform !== 'win32') {
        syncDirectory(directory);
        syncDirectory(this.directory);
        syncDirectory(path.dirname(path.resolve(this.directory)));
      }
    } finally {
      fs.closeSync(fd);
      // A crash may leave an unpublished temporary file, which recovery ignores.
      try {
        fs.unlinkSync(temporary);
      } catch {
        // The published link, when present, owns its own directory entry.
      }
    }
  }
}

function syncDirectory(directory: string): void {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
