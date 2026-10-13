import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/bridge.js';
import { registryRecordFileName } from '../src/template-registry.js';

/**
 * `C-031` — the boot line says how many templates the registry holds.
 *
 * The bridge prints the bank, the sources, the assignments, the ledger, the mixer hold
 * and the consumer setting at boot, and did not print the one number every take depends
 * on. On 2026-09-04 every take was refused and the first question — "does the bridge
 * hold the templates at all?" — had nothing on screen to answer it. The handle now
 * carries what hydration found, and the CLI prints it beside its siblings.
 *
 * No CasparCG: the connection points at a port nothing listens on, because this is a
 * boot-time read of a directory and the wire is not involved.
 */

let bridge: BridgeHandle | null = null;
const dirs: string[] = [];

afterEach(async () => {
  await bridge?.close();
  bridge = null;
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-templates-boot-'));
  dirs.push(dir);
  return dir;
}

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

/** A TCP port that was free a moment ago — nothing will be listening on it. */
function freeTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function nobody(): Promise<ConnectionConfig> {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort: await freeTcpPort(), oscPort: await freeUdpPort() },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: false,
  };
}

/**
 * One persisted registry record, the shape `TemplateRegistry.#persist` writes — and the NAME
 * it writes (`B-116`: the loader admits only files named the way the registry names them, so
 * a sibling store's config beside the templates is never mistaken for a corrupt template).
 */
function persisted(dir: string, templateId: string): void {
  fs.writeFileSync(
    path.join(dir, registryRecordFileName(templateId)),
    `${JSON.stringify({
      info: { templateId, templateType: 'lower-third', fields: [] },
      html: '<!doctype html><html><body>persisted</body></html>',
      importedAt: '2026-09-04T00:00:00.000Z',
    })}\n`,
    'utf8',
  );
}

it('the handle reports how many templates hydrated, how many files were refused, and the directory', async () => {
  const dir = tmpDir();
  persisted(dir, 'tpl-one');
  persisted(dir, 'tpl-two');
  // A record NAMED as the registry names them whose body is not a template — refused,
  // counted, named by the registry's own warning as it is skipped. (A `broken.json` with a
  // name of its own would not be a record at all since `B-116`, and would be ignored.)
  fs.writeFileSync(path.join(dir, registryRecordFileName('broken')), '{"nope":true}\n', 'utf8');
  bridge = await createBridge({
    host: '127.0.0.1',
    port: 0,
    connection: await nobody(),
    templatesDir: dir,
  });

  expect(bridge.templates).toEqual({ loaded: 2, skipped: 1, dir });
  // The same reading the runtime holds — one source, two readers.
  expect(bridge.runtime.templateProvenance).toEqual({ loaded: 2, skipped: 1, dir });
  // And the registry really does hold the two.
  expect(
    bridge.runtime
      .templateList()
      .map((t) => t.templateId)
      .sort(),
  ).toEqual(['tpl-one', 'tpl-two']);
});

it('an absent directory is ZERO loaded, nothing skipped — a first boot, not a fault', async () => {
  const dir = path.join(tmpDir(), 'never-created');
  bridge = await createBridge({
    host: '127.0.0.1',
    port: 0,
    connection: await nobody(),
    templatesDir: dir,
  });
  expect(bridge.templates).toEqual({ loaded: 0, skipped: 0, dir });
});

it('an embedder with no templates directory reports that there is none', async () => {
  bridge = await createBridge({ host: '127.0.0.1', port: 0, connection: await nobody() });
  expect(bridge.templates).toEqual({ loaded: 0, skipped: 0, dir: null });
});
