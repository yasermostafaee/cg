import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuditEntrySchema, type AuditEntry } from '@cg/shared-schema';

/**
 * NDJSON audit log writer per Phase 2 §6 / Phase 5 §10.
 *
 * Each call to `append()` writes one JSON line to disk. The file handle
 * stays open for the lifetime of the writer; `close()` flushes + closes.
 *
 * Append-only by contract: there is no read / rewrite path. Operator
 * audit is a forensic record, not a queryable database. Downstream tools
 * (audit inspector UI, compliance ingest) read the NDJSON directly.
 *
 * Failure modes:
 *   - Disk full / permission denied → emits `'error'`, counts the failure and
 *     surfaces it through `lastError` / `errorCount`. The writer keeps trying.
 *     ⚠ The append NEVER rejects the operation that produced it — see B-141:
 *     an audit entry is a RECORD OF what happened, not a precondition for it,
 *     so a failed write must degrade to "reported and retried" and never to a
 *     refused take. `CasparRuntime.auditHealth()` is what carries that state to
 *     the operator, and the Audit panel renders it instead of claiming the
 *     session was quiet.
 *
 * 🔴 WHAT THIS WRITER DOES NOT DO, stated because the docstring used to promise
 * it and a warning that outlives its truth is worse than none (B-141,
 * FORENSIC-LITE):
 *
 *   - **No rotation.** The file grows without bound.
 *   - **No UNC fallback.** An unreachable network path fails every append and is
 *     reported; nothing is written to a local file instead.
 *   - **No retention policy.** Nothing is ever pruned or expired.
 *
 * All three are DEFERRED by owner decision, not overlooked. The record's job in
 * this form is to answer, the next day, who did what, to which item, and whether
 * the server accepted it.
 *
 * The writer also rejects entries that fail the Zod schema — it's an
 * append-only forensic record, not a place to silently swallow drift.
 */
export interface AuditWriterOptions {
  /** Absolute path to the NDJSON file. Parent directory will be created. */
  filePath: string;
  /** Override `Date.now` in tests. */
  now?: () => Date;
  /**
   * Fault injection for tests, mirroring `now`. Called with the serialized line
   * immediately BEFORE the real write; throwing from it makes exactly that write
   * fail while every other one still reaches the real file.
   *
   * It exists because the property that matters most about the append chain —
   * that a FAILED link does not silently swallow every append after it — cannot
   * be provoked from the filesystem without also destroying the file the
   * assertion has to read.
   */
  beforeWrite?: (line: string) => void;
}

export interface AuditWriterEvents {
  /** Fired on every successful append. Useful for tests + telemetry. */
  appended: [entry: AuditEntry];
  /** Fired on every failed write. The writer keeps trying. */
  error: [err: Error];
}

export class AuditWriter extends EventEmitter<AuditWriterEvents> {
  private handle: fs.promises.FileHandle | null = null;
  private opening: Promise<fs.promises.FileHandle> | null = null;
  private closing = false;
  private closed = false;
  /**
   * 🔴 THE APPEND CHAIN — the tail every new append queues behind.
   *
   * `append()` is fire-and-forget by contract (B-141: a failed audit write must
   * never refuse the on-air operation that produced it), so without this two
   * appends are in flight at once. Each `write` is atomic under `O_APPEND`, but
   * two concurrent ones dispatch to different threadpool threads and COMPLETE IN
   * EITHER ORDER — so the file's line order stops being the order things
   * happened. That is not hypothetical: CI reordered a refusal ahead of the
   * accepted action that preceded it, on a run where Windows had not.
   *
   * ⚠ **THIS PROMISE CAN NEVER REJECT, AND THAT IS THE WHOLE DESIGN.** A plain
   * `tail = tail.then(write)` short-circuits: the first rejected link poisons the
   * chain and every later append is dropped in silence — a fix that becomes a
   * no-op at exactly the moment the thing it guards starts failing. So the tail
   * is always `link.then(noop, noop)`: the CALLER still sees its own write's
   * rejection, and the chain always continues.
   */
  private tail: Promise<void> = Promise.resolve();
  private writes = 0;
  private writeErrors = 0;
  private _lastError: Error | null = null;
  private readonly now: () => Date;

  constructor(private readonly options: AuditWriterOptions) {
    super();
    this.now = options.now ?? ((): Date => new Date());
    this.on('error', noop);
  }

  /**
   * Append one entry. Validates against `AuditEntrySchema` first. Returns
   * the parsed entry. The actual disk write resolves asynchronously; the
   * promise resolves once the bytes have hit the OS write buffer.
   *
   * `ts` may be omitted — the writer fills it from `now()`.
   */
  async append(partial: Omit<AuditEntry, 'ts'> & { ts?: string }): Promise<AuditEntry> {
    const ts = partial.ts ?? this.now().toISOString();
    const entry = AuditEntrySchema.parse({ ...partial, ts });
    const line = `${JSON.stringify(entry)}\n`;
    /*
      The line is serialized HERE, synchronously, and the write is QUEUED — so the
      bytes are fixed at the moment the caller appended even though they reach the
      disk in turn. `ts` is therefore still the outcome's time, and the file's
      ORDER is now the order `append()` was called: the two agree instead of
      racing.
    */
    const link = this.tail.then(() => this.writeLine(line, entry));
    // The chain continues whatever this link did. `link` itself still rejects to
    // the caller — `#recordAudit` swallows that, which is how a full disk stays
    // off the air path.
    this.tail = link.then(noop, noop);
    return link;
  }

  /** One queued write, with its bookkeeping. Never called concurrently with itself. */
  private async writeLine(line: string, entry: AuditEntry): Promise<AuditEntry> {
    try {
      const handle = await this.openHandle();
      this.options.beforeWrite?.(line);
      await handle.write(line);
      this.writes++;
      this.emit('appended', entry);
      return entry;
    } catch (err) {
      this.writeErrors++;
      const error = err instanceof Error ? err : new Error(String(err));
      this._lastError = error;
      this.emit('error', error);
      throw error;
    }
  }

  /** Number of successful appends. */
  get writeCount(): number {
    return this.writes;
  }

  /** Number of failed writes. */
  get errorCount(): number {
    return this.writeErrors;
  }

  /** Most recent write error, or null. */
  get lastError(): Error | null {
    return this._lastError;
  }

  /**
   * Flush the queued appends, then close the underlying file handle. Idempotent.
   *
   * ⚠ **The flush comes FIRST, and the closed latch after it.** Appends already
   * queued must still land — the rows immediately before a shutdown are the ones
   * a forensic reader most wants, and latching first would fail exactly those. A
   * write queued AFTER the flush cannot reopen the file (see `openHandle`), which
   * is what stops a late append leaking a fresh descriptor at exit.
   */
  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    // Cannot reject — the tail is `link.then(noop, noop)` by construction — so a
    // failed write never blocks a shutdown.
    await this.tail;
    this.closed = true;
    const handle = this.handle;
    this.handle = null;
    if (handle !== null) {
      await handle.close();
    }
  }

  private async openHandle(): Promise<fs.promises.FileHandle> {
    // A write that arrives after `close()` has flushed must NOT reopen the file:
    // that is how the descriptor this class exists to release gets leaked again,
    // one shutdown later. It rejects; `#recordAudit` swallows it.
    if (this.closed) throw new Error('audit writer is closed');
    if (this.handle !== null) return this.handle;
    if (this.opening !== null) return this.opening;
    this.opening = (async (): Promise<fs.promises.FileHandle> => {
      await fs.promises.mkdir(path.dirname(this.options.filePath), { recursive: true });
      const h = await fs.promises.open(this.options.filePath, 'a');
      this.handle = h;
      this.opening = null;
      return h;
    })();
    return this.opening;
  }
}

function noop(): void {
  /* baseline error listener */
}
