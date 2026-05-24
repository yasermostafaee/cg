import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SceneSchema, type Scene, type TemplateType } from '@cg/shared-schema';
import type { RecentProject } from '@cg/shared-ipc';
import { getStarter, STARTER_TEMPLATES, type StarterTemplate } from '@cg/starter-templates';

/**
 * ProjectService — owns the in-memory active scene + on-disk persistence.
 *
 * - `new()` constructs an empty Scene for a templateType. Not persisted
 *   until the operator saves; `path` is null until then.
 * - `open(path?)` reads + Zod-parses a scene file. If `path` is omitted,
 *   the caller is expected to have shown a file dialog and supplied one.
 * - `save({ scene, path? })` writes pretty-printed JSON. Save-as semantics
 *   when path is omitted are the caller's responsibility (dialog → path).
 * - Recent-projects list lives at a configurable JSON path; capped at
 *   `recentCap` entries (default 16). Per Phase 6 §11 (Library) the
 *   sidebar reads this on boot.
 *
 * The service does NOT bundle Electron's file dialog — that's wired in
 * the IPC handlers using `electron.dialog.showOpenDialogSync`. This keeps
 * the service itself testable without an Electron runtime.
 */

export interface ProjectServiceOptions {
  /** Path to the recent-projects JSON file. */
  recentFilePath: string;
  /** Max entries kept in the recents list. Default 16. */
  recentCap?: number;
  /** Override for tests. */
  now?: () => Date;
  /** UUID factory override for tests. Defaults to `crypto.randomUUID`. */
  randomId?: () => string;
}

export interface ProjectServiceEvents {
  'active-changed': [info: { scene: Scene | null; path: string | null }];
}

export class ProjectService extends EventEmitter<ProjectServiceEvents> {
  private active: { scene: Scene; path: string | null } | null = null;
  private readonly recentFilePath: string;
  private readonly recentCap: number;
  private readonly now: () => Date;
  private readonly randomId: () => string;

  constructor(options: ProjectServiceOptions) {
    super();
    this.recentFilePath = options.recentFilePath;
    this.recentCap = options.recentCap ?? 16;
    this.now = options.now ?? ((): Date => new Date());
    this.randomId = options.randomId ?? ((): string => crypto.randomUUID());
  }

  /** The currently active scene + on-disk path (null until first save). */
  current(): { scene: Scene; path: string | null } | null {
    return this.active;
  }

  /**
   * Create a blank scene for `templateType`. The result is set as active
   * but NOT persisted; the operator triggers save via the IPC handler.
   */
  newScene(name: string, templateType: TemplateType): { scene: Scene; path: null } {
    const nowIso = this.now().toISOString();
    const scene: Scene = {
      schemaVersion: 1,
      id: this.randomId(),
      name,
      templateType,
      resolution: { width: 1920, height: 1080 },
      frameRate: 50,
      safeAreas: { title: 10, action: 5 },
      background: 'transparent',
      layers: [],
      fields: [],
      bindings: [],
      fonts: [],
      metadata: { createdAt: nowIso, updatedAt: nowIso },
    };
    this.active = { scene, path: null };
    this.emit('active-changed', { scene, path: null });
    return { scene, path: null };
  }

  /** Catalog of built-in starter templates the Designer Library exposes. */
  starters(): readonly StarterTemplate[] {
    return STARTER_TEMPLATES;
  }

  /**
   * Load a starter template as the active project (Phase 8 §11 / M8.0).
   *
   * The returned Scene is a deep clone with a fresh id + name + timestamps —
   * editing it doesn't mutate the shared starter constant, and saving it
   * lands in a new file (no collision with an existing on-disk scene).
   *
   * Returns null if `starterId` isn't recognized.
   */
  loadStarter(starterId: string): { scene: Scene; path: null } | null {
    const starter = getStarter(starterId);
    if (starter === null) return null;
    const nowIso = this.now().toISOString();
    const cloned: Scene = {
      ...(JSON.parse(JSON.stringify(starter.scene)) as Scene),
      id: this.randomId(),
      name: starter.label,
      metadata: {
        ...starter.scene.metadata,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    };
    SceneSchema.parse(cloned);
    this.active = { scene: cloned, path: null };
    this.emit('active-changed', { scene: cloned, path: null });
    return { scene: cloned, path: null };
  }

  /** Parse + activate the scene at `filePath`. Throws on schema mismatch. */
  async open(filePath: string): Promise<{ scene: Scene; path: string }> {
    const text = await fs.promises.readFile(filePath, 'utf-8');
    const scene = SceneSchema.parse(JSON.parse(text));
    this.active = { scene, path: filePath };
    this.emit('active-changed', { scene, path: filePath });
    await this.recordRecent(scene, filePath);
    return { scene, path: filePath };
  }

  /**
   * Persist `scene` to `path`. Updates `metadata.updatedAt` to now. Path
   * is required at this layer — save-as dialog lives in the IPC handler.
   */
  async save(scene: Scene, filePath: string): Promise<{ scene: Scene; path: string }> {
    const updated: Scene = {
      ...scene,
      metadata: { ...scene.metadata, updatedAt: this.now().toISOString() },
    };
    SceneSchema.parse(updated);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
    this.active = { scene: updated, path: filePath };
    this.emit('active-changed', { scene: updated, path: filePath });
    await this.recordRecent(updated, filePath);
    return { scene: updated, path: filePath };
  }

  /** Snapshot of the recent-projects file. Returns `[]` when missing. */
  async recent(): Promise<readonly RecentProject[]> {
    try {
      const raw = await fs.promises.readFile(this.recentFilePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Loose validation — the file is operator-writable, drop malformed rows
      // rather than throwing.
      const entries: RecentProject[] = [];
      for (const item of parsed) {
        if (
          typeof item === 'object' &&
          item !== null &&
          'path' in item &&
          'name' in item &&
          'templateType' in item &&
          'lastOpenedAt' in item &&
          typeof item.path === 'string' &&
          typeof item.name === 'string' &&
          typeof item.templateType === 'string' &&
          typeof item.lastOpenedAt === 'string'
        ) {
          entries.push({
            path: item.path,
            name: item.name,
            templateType: item.templateType,
            lastOpenedAt: item.lastOpenedAt,
          });
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  private async recordRecent(scene: Scene, filePath: string): Promise<void> {
    const existing = await this.recent();
    const filtered = existing.filter((e) => e.path !== filePath);
    const next: RecentProject[] = [
      {
        path: filePath,
        name: scene.name,
        templateType: scene.templateType,
        lastOpenedAt: this.now().toISOString(),
      },
      ...filtered,
    ].slice(0, this.recentCap);
    await fs.promises.mkdir(path.dirname(this.recentFilePath), { recursive: true });
    await fs.promises.writeFile(this.recentFilePath, JSON.stringify(next, null, 2), 'utf-8');
  }
}
