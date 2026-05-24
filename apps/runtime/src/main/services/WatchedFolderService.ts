import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { unpack, verify } from '@cg/vcg-format';
import type { TemplateRegistry } from './TemplateRegistry.js';

/**
 * WatchedFolderService — ingests `.vcg` archives from a Windows watched
 * folder per Phase 6 §11 and Phase 8 §5 ("drag a .vcg into the watched
 * folder → operator takes it on air").
 *
 * On each new (or updated) .vcg file:
 *   1. Verify Merkle integrity.
 *   2. Unpack into a per-template working directory under `cacheRoot`.
 *   3. Register the unpacked index.html as a `file://` URL in the
 *      `TemplateRegistry` keyed by manifest.id.
 *
 * The watcher is intentionally simple — `fs.watch` polling on the
 * configured directory. A more robust ingest (transactional rename,
 * EDR-aware quarantine) lands in M9.
 */
export interface WatchedFolderServiceOptions {
  /** Absolute path to the operator-facing drop folder. */
  watchRoot: string;
  /** Absolute path to the per-template working-directory root. */
  cacheRoot: string;
  /** Registry to populate. */
  templates: TemplateRegistry;
}

export interface WatchedFolderServiceEvents {
  ingested: [info: { templateId: string; url: string; sourcePath: string }];
  failed: [info: { sourcePath: string; reason: string }];
}

export class WatchedFolderService extends EventEmitter<WatchedFolderServiceEvents> {
  private readonly watchRoot: string;
  private readonly cacheRoot: string;
  private readonly templates: TemplateRegistry;
  private watcher: fs.FSWatcher | null = null;

  constructor(options: WatchedFolderServiceOptions) {
    super();
    this.watchRoot = options.watchRoot;
    this.cacheRoot = options.cacheRoot;
    this.templates = options.templates;
  }

  /** Ingest all .vcg files currently in the watch folder, then start watching. */
  async start(): Promise<void> {
    await fs.promises.mkdir(this.watchRoot, { recursive: true });
    await fs.promises.mkdir(this.cacheRoot, { recursive: true });
    const entries = await fs.promises.readdir(this.watchRoot);
    for (const entry of entries) {
      if (entry.toLowerCase().endsWith('.vcg')) {
        await this.ingest(path.join(this.watchRoot, entry)).catch(() => undefined);
      }
    }
    this.watcher = fs.watch(this.watchRoot, { persistent: false }, (eventType, filename) => {
      if (filename === null || !filename.toLowerCase().endsWith('.vcg')) return;
      if (eventType !== 'rename' && eventType !== 'change') return;
      const fullPath = path.join(this.watchRoot, filename);
      // Small debounce — drop events for files that no longer exist by the
      // time we get the callback. fs.watch fires for renames + writes.
      setTimeout(() => {
        if (!fs.existsSync(fullPath)) return;
        void this.ingest(fullPath).catch(() => undefined);
      }, 50);
    });
  }

  stop(): void {
    if (this.watcher !== null) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Ingest one `.vcg` file. Public so M6.7's integration test can drive
   * the pipeline without waiting for the OS watcher to fire.
   *
   * Returns the registered template URL.
   */
  async ingest(sourcePath: string): Promise<string> {
    const buf = await fs.promises.readFile(sourcePath);
    const verifyResult = await verify(buf);
    if (!verifyResult.ok) {
      this.emit('failed', { sourcePath, reason: verifyResult.errors.join('; ') });
      throw new Error(`vcg integrity check failed: ${verifyResult.errors.join('; ')}`);
    }
    const unpacked = await unpack(buf);
    const templateId = unpacked.manifest.id;
    const workDir = path.join(this.cacheRoot, templateId);
    await fs.promises.rm(workDir, { recursive: true, force: true });
    await fs.promises.mkdir(workDir, { recursive: true });
    for (const [relPath, bytes] of unpacked.files) {
      const target = path.join(workDir, relPath);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, bytes);
    }
    const indexHtml = path.join(workDir, 'index.html');
    const url = pathToFileURL(indexHtml).toString();
    this.templates.register({
      templateId,
      url,
      templateType: unpacked.scene.templateType,
    });
    this.emit('ingested', { templateId, url, sourcePath });
    return url;
  }
}
