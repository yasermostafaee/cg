import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
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
 * ⭐ **B-141 follow-up — the per-console operator name, END TO END.**
 *
 * The claim under test is deliberately narrow and deliberately whole-path: a name typed
 * at ONE console reaches the NDJSON row for the action THAT console took. Everything
 * between is real — a real WS frame, the real bridge dispatch, the real audit writer,
 * and the row read back off DISK rather than out of the in-memory tail.
 *
 * 🔴 **Read back from the FILE, for the reason B-141 already paid for.** `auditRecent()`
 * falls back to the in-memory tail when the file cannot be read, so asserting through it
 * would pass identically on a build whose writes never land. The file is the claim.
 *
 * The verb used throughout is `lock.engage`: it is audited, it always succeeds, and it
 * touches no CasparCG server — so the test measures attribution and nothing else. The
 * connection is deliberately dead for the same reason.
 *
 * ⚠ **What this does NOT test, because it is not true:** that the name identifies a
 * PERSON. It is self-declared over an unauthenticated loopback socket, and the third
 * case below pins the consequence that matters — two consoles, two names, no way for
 * either to be checked. See `../src/actor-context.ts`.
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
 * Send one `lock.engage` carrying `actor` exactly as given, and resolve when the bridge
 * has answered it.
 *
 * `actor` is passed through `undefined` untouched rather than defaulted here: "a client
 * that says nothing" is one of the cases under test, and a helper that quietly filled it
 * in would test the helper.
 */
async function engageLock(ws: WebSocket, id: string, actor: string | undefined): Promise<void> {
  const frames: WsFrame[] = [];
  ws.on('message', (data: Buffer) => {
    const frame = parseWsFrame(data.toString());
    if (frame !== null) frames.push(frame);
  });
  ws.send(
    serializeWsFrame({
      type: 'request',
      id,
      channel: 'lock.engage',
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
 * The rows ON DISK, oldest first.
 *
 * Polled rather than slept on: appends are fire-and-forget by contract (an on-air path
 * must never await one), so the bytes arrive shortly after the response. A slow box must
 * fail on the assertion, never on the wait.
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

describe('the audit actor is the acting console, as it labelled itself', () => {
  it('a configured name reaches the NDJSON row', { timeout: 30_000 }, async () => {
    const file = auditPath();
    handle = await createBridge({ port: 0, connection: deadConnection(), auditLogPath: file });
    const ws = await connect(handle.url);

    await engageLock(ws, '1', 'Gallery 2');

    const rows = await rowsOnDisk(file, 1);
    const engage = rows.filter((r) => r.action === 'lock-engage');
    expect(engage, 'one lock-engage row').toHaveLength(1);
    expect(engage[0]?.actor).toBe('Gallery 2');
  });

  it(
    `an unconfigured console records ${UNATTRIBUTED_ACTOR}, never a name-shaped value`,
    { timeout: 30_000 },
    async () => {
      /*
        The decision this pins: an unset name must not become a LIE. The previous
        constant was `operator`, which was honest while it was the only value any row
        could carry -- but once some rows name a console, `operator` is ambiguous
        between "never configured" and "somebody typed operator". `unattributed` is a
        word for a STATE, so an unconfigured console is legible as one.
      */
      const file = auditPath();
      handle = await createBridge({ port: 0, connection: deadConnection(), auditLogPath: file });
      const ws = await connect(handle.url);

      await engageLock(ws, '1', undefined);

      const rows = await rowsOnDisk(file, 1);
      const engage = rows.filter((r) => r.action === 'lock-engage');
      expect(engage, 'one lock-engage row').toHaveLength(1);
      expect(engage[0]?.actor).toBe(UNATTRIBUTED_ACTOR);
      // The value it must never silently be: the old constant reads as a role and
      // would put unattributed rows and named rows in the same visual class.
      expect(engage[0]?.actor).not.toBe('operator');
    },
  );

  it.each([
    ['a blank string', '   '],
    ['an empty string', ''],
  ])('%s is unattributed, not an actor that names nobody', async (_label, actor) => {
    // The bridge does not trust the wire. `actor` is the one field a client controls
    // outright, and a whitespace name would otherwise satisfy the schema's `min(1)`
    // while attributing the action to nothing at all.
    const file = auditPath();
    handle = await createBridge({ port: 0, connection: deadConnection(), auditLogPath: file });
    const ws = await connect(handle.url);

    await engageLock(ws, '1', actor);

    const rows = await rowsOnDisk(file, 1);
    expect(rows.filter((r) => r.action === 'lock-engage')[0]?.actor).toBe(UNATTRIBUTED_ACTOR);
  });

  it(
    'two consoles on one bridge are told apart, each on its own row',
    { timeout: 30_000 },
    async () => {
      /*
        THE WHOLE POINT OF THE ITEM, and the thing the constant could not do: the
        record distinguishes the gallery from the studio. It still does NOT
        distinguish two PEOPLE at the same console, and nothing here should ever be
        read as claiming that -- the value is self-declared and unverified.
      */
      const file = auditPath();
      handle = await createBridge({ port: 0, connection: deadConnection(), auditLogPath: file });
      const gallery = await connect(handle.url);
      const studio = await connect(handle.url);

      await engageLock(gallery, 'g1', 'Gallery 2');
      await engageLock(studio, 's1', 'Studio A');

      const rows = await rowsOnDisk(file, 2);
      const actors = rows.filter((r) => r.action === 'lock-engage').map((r) => r.actor);
      expect(actors).toContain('Gallery 2');
      expect(actors).toContain('Studio A');
    },
  );
});
