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
    try {
      const handle = await this.openHandle();
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

  /** Flush + close the underlying file handle. Idempotent. */
  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    const handle = this.handle;
    this.handle = null;
    if (handle !== null) {
      await handle.close();
    }
  }

  private async openHandle(): Promise<fs.promises.FileHandle> {
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
