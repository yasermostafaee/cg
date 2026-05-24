import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  AmcpTransport,
  CommandQueue,
  LayerManager,
  OscTransport,
  Reconciler,
  RedundancyAdapter,
  type ServerSession,
} from '@cg/caspar-client';
import { AssetService } from '../../../../apps/designer/src/main/services/AssetService.js';
import { ExportService } from '../../../../apps/designer/src/main/services/ExportService.js';
import { ProjectService } from '../../../../apps/designer/src/main/services/ProjectService.js';
import { StackService } from '../../src/main/services/StackService.js';
import { TemplateRegistry } from '../../src/main/services/TemplateRegistry.js';
import { WatchedFolderService } from '../../src/main/services/WatchedFolderService.js';
import type { ConnectionService } from '../../src/main/services/ConnectionService.js';

/**
 * M6.7 — Designer → Runtime end-to-end smoke.
 *
 * The closure: a Designer-side `ExportService.run()` writes a `.vcg`
 * into a folder the Runtime watches; the Runtime's `WatchedFolderService`
 * ingests it; the `StackService` loads + takes it; the operator-facing
 * intent lands "playing".
 *
 * This is the M6 exit criterion ("Designer → Export → drop in Runtime
 * watched folder → operator takes it on air") in test form. The real
 * CasparCG link is mocked via `@cg/amcp-mock`; the wire bytes the
 * runtime would send to CasparCG are observed at the mock.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..', '..', '..', 'apps', 'designer');
const BUNDLED_CG_JS_PATH = path.resolve(APP_ROOT, 'resources/template-runtime/cg.js');

let tmp: string | undefined;
let mock: MockHandle | undefined;
let transport: AmcpTransport | undefined;
let watched: WatchedFolderService | undefined;

afterEach(async () => {
  if (watched) watched.stop();
  watched = undefined;
  if (transport) transport.destroy();
  transport = undefined;
  if (mock) await mock.stop();
  mock = undefined;
  if (tmp) await fs.promises.rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function makeFakeSession(label: 'A' | 'B', queue: CommandQueue): ServerSession {
  const e = new EventEmitter() as unknown as ServerSession;
  Object.defineProperty(e, 'name', { value: label });
  Object.defineProperty(e, 'queue', { value: queue });
  Object.defineProperty(e, 'state', { get: () => 'healthy', configurable: true });
  Object.defineProperty(e, 'osc', { value: new OscTransport() });
  return e;
}

describe('M6.7 — Designer → Runtime end-to-end', () => {
  it('exports a Persian lower-third, watched folder ingests, operator takes it on air', async () => {
    const cgJs = await fs.promises.readFile(BUNDLED_CG_JS_PATH, 'utf-8');
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cg-m67-'));

    // ── Designer side: produce a real .vcg with Persian text ───────────
    const designerProjects = new ProjectService({
      recentFilePath: path.join(tmp, 'recent.json'),
      randomId: () => 'lt-persian',
    });
    const designerAssets = new AssetService({
      workingRoot: path.join(tmp, 'designer-working'),
    });
    const exporter = new ExportService({ cgJs, assets: designerAssets });
    const { scene: blank } = designerProjects.newScene('Persian LT', 'lower-third');
    const sceneWithPersian = {
      ...blank,
      layers: [
        {
          id: 'L1',
          name: 'main',
          visible: true,
          locked: false,
          blendMode: 'normal' as const,
          children: [
            {
              id: 'title',
              type: 'text' as const,
              name: 'title',
              visible: true,
              locked: false,
              opacity: 1,
              zIndex: 0,
              transform: {
                position: { x: 100, y: 880 },
                size: { w: 1200, h: 80 },
                rotation: 0,
                scale: { x: 1, y: 1 },
                anchor: { x: 0, y: 0 },
              },
              text: 'خبر فوری',
              font: {
                family: 'Vazirmatn',
                weight: 700,
                style: 'normal' as const,
                size: 56,
                lineHeight: 1.2,
                letterSpacing: 0,
              },
              color: '#FFFFFF',
              align: 'start' as const,
              direction: 'rtl' as const,
              fitMode: 'fixed' as const,
              overflow: 'clip' as const,
            },
          ],
        },
      ],
    };
    const watchRoot = path.join(tmp, 'watched');
    await fs.promises.mkdir(watchRoot, { recursive: true });
    const vcgPath = path.join(watchRoot, 'persian-lt.vcg');
    await exporter.run(sceneWithPersian, vcgPath);

    // ── Runtime side: watched folder ingests + registers ───────────────
    const templates = new TemplateRegistry();
    watched = new WatchedFolderService({
      watchRoot,
      cacheRoot: path.join(tmp, 'runtime-cache'),
      templates,
    });
    await watched.start();
    const registered = templates.get('lt-persian');
    expect(registered).not.toBeNull();
    expect(registered?.templateType).toBe('lower-third');

    // ── Runtime side: wire a StackService against amcp-mock + take ─────
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    transport = new AmcpTransport();
    await transport.connect(mock.host, mock.amcpPort);
    const queue = new CommandQueue(transport);
    const sessionA = makeFakeSession('A', queue);

    // Backup-session for the adapter, never used in this happy-path test.
    const backupTransport = new AmcpTransport();
    const backupMock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    await backupTransport.connect(backupMock.host, backupMock.amcpPort);
    const backupQueue = new CommandQueue(backupTransport);
    const sessionB = makeFakeSession('B', backupQueue);

    const adapter = new RedundancyAdapter({
      strategy: 'mirror-sync',
      sessions: { A: sessionA, B: sessionB },
      autoFailoverEnabled: false,
    });
    const connections = {
      sessionA,
      sessionB,
      adapter,
      on: vi.fn(),
      off: vi.fn(),
      getHealth: vi.fn(),
      getConfig: vi.fn(),
      failover: vi.fn(),
    } as unknown as ConnectionService;

    const stack = new StackService({
      connections,
      templates,
      reconciler: new Reconciler(),
      layerManager: new LayerManager(),
    });

    let playLine: string | null = null;
    mock.setHandler('PLAY', (req) => {
      playLine = req.raw;
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    backupMock.setHandler('PLAY', () => ({ kind: 'ok', code: 202, verb: 'PLAY' }));

    // Operator-facing flow: load + take.
    const loaded = stack.load({
      itemId: 'i1',
      templateId: 'lt-persian',
      fields: { title: 'خبر فوری' },
    });
    expect(loaded).toBe(true);

    const result = await stack.take('i1');
    expect(result.accepted).toBe(true);
    expect(playLine).not.toBeNull();
    // The PLAY line should reference the file:// URL of the unpacked
    // index.html the watched folder produced.
    expect(playLine).toContain('file:');
    expect(playLine).toContain('index.html');

    // The runtime's Reconciler sees the item as 'playing' (ack-based)
    // because no OSC truth has arrived. Phase 5 §8.4's optimistic UI.
    const item = stack.snapshot()[0];
    expect(item?.status).toBe('playing');

    queue.dispose();
    backupQueue.dispose();
    backupTransport.destroy();
    await backupMock.stop();
  });
});
