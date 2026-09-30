import * as fs from 'node:fs';
import * as path from 'node:path';
import { RetainedStackItemSchema, type RetainedStackItem } from '@cg/shared-schema';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (`B-294`) — **THE STACK, KEPT BY THE BRIDGE ITSELF.**
 *
 * Until this the stack lived only in this process's Reconciler, and every console kept its own copy
 * in its browser storage and re-delivered it on every connect (`B-092`). With one bridge per Playout
 * and several consoles, that is a fight: a console with an older copy re-delivers rows another
 * console removed. So the bridge persists the stack — the SAME intent shape the console used to keep
 * (`RetainedStackItem`) — on every change, and restores it at start through the same `restore()` it
 * ran for a console. No console re-delivers anything.
 *
 * Doctrine, as `live-layers-store.ts`'s: ABSENT = a first start, an empty stack. PRESENT but unusable
 * = said loudly and treated as absent — refusing to boot over a bookkeeping file would take every
 * console off the air to avoid a degradation. A single unusable ROW is dropped and named, the rest
 * restored. Writes are atomic (a temp file, then a rename): a crash mid-write leaves the previous
 * file whole.
 */

/** The file's shape: a version and the rows, in stack order. */
interface StackFile {
  readonly version: 1;
  readonly items: readonly RetainedStackItem[];
}

/** What `loadPersistedStack` found, for the boot line. */
export interface PersistedStack {
  readonly items: readonly RetainedStackItem[];
  /** `absent` — no file (a first start); `file` — read; `unusable` — present and not a stack file. */
  readonly source: 'absent' | 'file' | 'unusable';
  /** Rows the file carried that were not usable, each named. */
  readonly dropped: readonly string[];
}

/** Read the persisted stack. Never throws. */
export function loadPersistedStack(file: string): PersistedStack {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { items: [], source: 'absent', dropped: [] };
    }
    warn(`cannot read the stack file ${file}: ${messageOf(err)} - starting with an EMPTY stack`);
    return { items: [], source: 'unusable', dropped: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    warn(`the stack file ${file} is not JSON (${messageOf(err)}) - starting with an EMPTY stack`);
    return { items: [], source: 'unusable', dropped: [] };
  }
  const rows =
    typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as StackFile).items)
      ? (parsed as StackFile).items
      : null;
  if (rows === null) {
    warn(`the stack file ${file} holds no stack - starting with an EMPTY stack`);
    return { items: [], source: 'unusable', dropped: [] };
  }
  const items: RetainedStackItem[] = [];
  const dropped: string[] = [];
  for (const row of rows) {
    const ok = RetainedStackItemSchema.safeParse(row);
    if (ok.success) items.push(ok.data);
    else {
      const id =
        typeof row === 'object' && row !== null && 'itemId' in row
          ? String((row as { itemId: unknown }).itemId)
          : '(no id)';
      dropped.push(id);
      warn(`a row of the stack file ${file} is not usable (${id}) - it is not restored`);
    }
  }
  return { items, source: 'file', dropped };
}

/** Write the stack, atomically. A failure is said and never thrown: the in-memory stack stands. */
export function savePersistedStack(file: string, items: readonly RetainedStackItem[]): void {
  const body: StackFile = { version: 1, items };
  const tmp = `${file}.${String(process.pid)}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`, 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    warn(
      `failed to persist the stack to ${file}: ${messageOf(err)} - it is still live in memory ` +
        'but a restart will not bring it back',
    );
  }
}

function warn(line: string): void {
  process.stderr.write(`[caspar-bridge] ⚠ ${line}\n`);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
