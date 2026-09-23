import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  CONSOLE_ACTOR,
  parseWsFrame,
  serializeWsFrame,
  UNATTRIBUTED_ACTOR,
  type ConnectionConfig,
  type WsFrame,
} from '@cg/shared-ipc';
import type { AuditEntry } from '@cg/shared-schema';
import { createBridge, type BridgeHandle } from '../src/index.js';
import { track } from './support/harness.js';

/**
 * ⭐ **`BRIDGE-TRUTH-01` §4 — WHO THE RECORD SAYS ACTED, on a station with auth OFF, END TO END.**
 *
 * Two values, because they are two facts the bridge can tell apart: a request that arrived on a
 * control socket is a CONSOLE's act (`console` — a console did it, nobody proved who), and an
 * append no request caused is the machine's own (`unattributed`). Until this change both read
 * `unattributed`, so the record could not tell a person at a console from the station acting by
 * itself.
 *
 * ⚠ **What this suite pinned before, and why it is REWRITTEN rather than kept.** It asserted
 * that a console's self-declared `actor` field ("Gallery 2") reached the row — the typed label
 * `OPERATOR-NAME-SWEEP-01` retired from the console. The bridge went on honouring the wire field,
 * so any client could still write any name into the record. §4 stops the bridge reading it at
 * all; the first case below is that claim, and it sends the very name the old case asserted.
 *
 * 🔴 **Read back from the FILE**, for the reason `B-141` paid for: `auditRecent()` falls back to
 * the in-memory tail when the file cannot be read, so asserting through it would pass
 * identically on a build whose writes never land. The file is the claim.
 */

let handle: BridgeHandle | null = null;
let auditDir: string | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  if (auditDir !== null && fs.existsSync(auditDir))
    fs.rmSync(auditDir, { recursive: true, force: true });
  auditDir = null;
});

/** Unreachable AMCP + ephemeral OSC bind — no server, no fixed ports. */
function deadConnection(): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort: 1, oscPort: 0 } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

function auditPath(): string {
  auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-audit-actor-'));
  return path.join(auditDir, 'bridge-audit.ndjson');
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = track(new WebSocket(url), (w) => {
      w.close();
    });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

/**
 * Send one lock request carrying `actor` exactly as given, and wait for its response.
 *
 * `actor` is passed through `undefined` untouched rather than defaulted here: "a client that
 * says nothing" is one of the cases under test, and a helper that filled it in would test the
 * helper.
 */
async function lockRequest(
  ws: WebSocket,
  id: string,
  actor: string | undefined,
  channel: 'lock.engage' | 'lock.release' = 'lock.engage',
): Promise<void> {
  const frames: WsFrame[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = parseWsFrame(data.toString());
    if (frame !== null) frames.push(frame);
  });
  ws.send(
    serializeWsFrame({
      type: 'request',
      id,
      channel,
      payload: { pin: '0000' },
      ...(actor !== undefined ? { actor } : {}),
    }),
  );
  const deadline = Date.now() + 4000;
  while (!frames.some((f) => f.type === 'response' && f.id === id)) {
    if (Date.now() > deadline) throw new Error(`no response for request ${id}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/**
 * The rows ON DISK, oldest first. Polled rather than slept on: appends are fire-and-forget by
 * contract, so the bytes arrive shortly after the response.
 */
async function rowsOnDisk(file: string, atLeast: number): Promise<AuditEntry[]> {
  const deadline = Date.now() + 4000;
  for (;;) {
    const rows = fs.existsSync(file)
      ? fs
          .readFileSync(file, 'utf-8')
          .split('\n')
          .filter((l) => l.length > 0)
          .map((l) => JSON.parse(l) as AuditEntry)
      : [];
    if (rows.length >= atLeast || Date.now() > deadline) return rows;
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('BRIDGE-TRUTH-01 §4 — a console’s act and the machine’s act are two values', () => {
  it(
    'a console’s press records `console`, and the machine’s own act keeps `unattributed`',
    { timeout: 30_000 },
    async () => {
      const file = auditPath();
      handle = await createBridge({ port: 0, connection: deadConnection(), auditLogPath: file });
      const ws = await connect(handle.url);

      // A console's press — carrying the very name the retired feature used to record.
      await lockRequest(ws, '1', 'Gallery 2', 'lock.engage');
      // The machine's own act: the same verb's sibling, called on the runtime OUTSIDE any
      // request, which is exactly what a bridge-initiated append is.
      handle.runtime.release('0000');

      const rows = await rowsOnDisk(file, 2);
      const actorOf = (action: string): string | undefined =>
        rows.find((r) => r.action === action)?.actor;
      expect(actorOf('lock-engage')).toBe(CONSOLE_ACTOR);
      // Positive control, in the SAME file — the two values really are distinguishable, so the
      // first assertion is not `console` everywhere.
      expect(actorOf('lock-release')).toBe(UNATTRIBUTED_ACTOR);
      // The self-declared name never reaches the record, in any row.
      expect(rows.map((r) => r.actor)).not.toContain('Gallery 2');
    },
  );

  it.each([
    ['no actor at all', undefined],
    ['a blank string', '   '],
    ['an empty string', ''],
    ['the reserved template actor', 'template'],
  ])('%s from a console is still `console`', async (_label, actor) => {
    const file = auditPath();
    handle = await createBridge({ port: 0, connection: deadConnection(), auditLogPath: file });
    const ws = await connect(handle.url);

    await lockRequest(ws, '1', actor);

    const rows = await rowsOnDisk(file, 1);
    expect(rows.filter((r) => r.action === 'lock-engage')[0]?.actor).toBe(CONSOLE_ACTOR);
  });

  it(
    'two consoles on an auth-OFF station are NOT told apart — the record claims no identity',
    { timeout: 30_000 },
    async () => {
      /*
        What the retired feature used to assert here — that the gallery and the studio land on
        rows naming each — was a claim about labels anybody could type. With nothing verified,
        the honest record says a console did each, and no more. Telling two PEOPLE apart is
        what signing in is for.
      */
      const file = auditPath();
      handle = await createBridge({ port: 0, connection: deadConnection(), auditLogPath: file });
      const gallery = await connect(handle.url);
      const studio = await connect(handle.url);

      await lockRequest(gallery, 'g1', 'Gallery 2', 'lock.engage');
      await lockRequest(studio, 's1', 'Studio A', 'lock.release');

      const rows = await rowsOnDisk(file, 2);
      expect(rows.map((r) => [r.action, r.actor])).toEqual([
        ['lock-engage', CONSOLE_ACTOR],
        ['lock-release', CONSOLE_ACTOR],
      ]);
    },
  );
});
