import {
  SceneSchema,
  type FrameRate,
  type Resolution,
  type Scene,
  type TemplateType,
} from '@cg/shared-schema';
import type { RecentProject, StarterEntry } from '@cg/shared-ipc';
import { getStarter, STARTER_TEMPLATES } from '@cg/starter-templates';
import { forgetFileHandle, type KeyValueStore, type Workspace } from '@cg/storage';
import { Emitter } from './emitter.js';
import { uuid } from './uuid.js';

export interface NewSceneOptions {
  resolution?: Resolution;
  frameRate?: FrameRate;
  /** Total scene duration in frames (timeline length). Defaults to 50. */
  durationFrames?: number;
}

const RECENT_KEY = 'recent';
const RECENT_CAP = 16;

export interface ActiveProject {
  scene: Scene | null;
  path: string | null;
}

/**
 * Browser port of the Electron ProjectService. Owns the in-memory active
 * scene and persists scenes as JSON files in the Workspace (a real folder
 * via File System Access, OPFS, or memory). The recent-projects list lives
 * in the preferences KV.
 */
export class ProjectStore {
  readonly activeChanged = new Emitter<ActiveProject>();
  #active: { scene: Scene; path: string | null } | null = null;
  readonly #ws: Workspace;
  readonly #kv: KeyValueStore;

  constructor(ws: Workspace, kv: KeyValueStore) {
    this.#ws = ws;
    this.#kv = kv;
  }

  current(): ActiveProject {
    return this.#active ?? { scene: null, path: null };
  }

  /** Catalog the Library sidebar renders. */
  starters(): StarterEntry[] {
    return STARTER_TEMPLATES.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      templateType: s.scene.templateType,
      ...(s.preview !== undefined ? { previewUrl: s.preview } : {}),
      ...(s.isNew === true ? { isNew: true } : {}),
    }));
  }

  newScene(
    name: string,
    templateType: TemplateType,
    options: NewSceneOptions = {},
  ): { scene: Scene; path: null } {
    const nowIso = new Date().toISOString();
    const resolution = options.resolution ?? { width: 1920, height: 1080 };
    const frameRate = options.frameRate ?? 50;
    const frameRange = { in: 0, out: Math.max(1, Math.round(options.durationFrames ?? 50)) };
    const scene: Scene = {
      schemaVersion: 1,
      id: uuid(),
      name,
      templateType,
      resolution,
      frameRate,
      safeAreas: { title: 10, action: 5 },
      frameRange,
      background: 'transparent',
      layers: [],
      fields: [],
      bindings: [],
      fonts: [],
      // Seed a new project with one ready-to-edit composition so the operator
      // lands in the editor, not the empty "No Active Compositions" state
      // (which is reserved for a project whose compositions were all deleted).
      compositions: [
        {
          id: uuid(),
          name: 'comp1',
          resolution,
          // D-026 — fps is project-level (`Scene.frameRate`); compositions no longer
          // carry their own.
          frameRange,
          background: 'transparent',
          layers: [],
        },
      ],
      metadata: { createdAt: nowIso, updatedAt: nowIso },
    };
    this.#setActive(scene, null);
    return { scene, path: null };
  }

  loadStarter(starterId: string): { scene: Scene; path: null } | null {
    const starter = getStarter(starterId);
    if (starter === null) return null;
    const nowIso = new Date().toISOString();
    const cloned: Scene = {
      ...structuredClone(starter.scene),
      id: uuid(),
      name: starter.label,
      metadata: { ...starter.scene.metadata, createdAt: nowIso, updatedAt: nowIso },
    };
    SceneSchema.parse(cloned);
    this.#setActive(cloned, null);
    return { scene: cloned, path: null };
  }

  /** Read + activate a scene by workspace-relative path. */
  async open(path: string): Promise<{ scene: Scene | null; path: string | null }> {
    const raw = await this.#ws.readJson<unknown>(path);
    if (raw === null) return { scene: null, path: null };
    const scene = SceneSchema.parse(raw);
    this.#setActive(scene, path);
    this.#recordRecent(scene, path);
    return { scene, path };
  }

  /** Persist `scene` to `path` (workspace-relative). Bumps `updatedAt`. */
  async save(scene: Scene, path: string): Promise<{ path: string }> {
    const normalized = path.endsWith('.json') ? path : `${path}.cg.json`;
    const target = normalized.includes('/') ? normalized : `projects/${normalized}`;
    const updated: Scene = {
      ...scene,
      metadata: { ...scene.metadata, updatedAt: new Date().toISOString() },
    };
    SceneSchema.parse(updated);
    await this.#ws.writeJson(target, updated);
    this.#setActive(updated, target);
    this.#recordRecent(updated, target);
    return { path: target };
  }

  recent(): RecentProject[] {
    return this.#kv.get<RecentProject[]>(RECENT_KEY) ?? [];
  }

  /**
   * D-088 — record a project saved/opened via a native file handle. Keyed by project id;
   * `handleKey` points at the IndexedDB-persisted `FileSystemFileHandle`.
   */
  recordRecentHandle(scene: Scene): void {
    this.#pushRecent({
      projectId: scene.id,
      name: scene.name,
      handleKey: scene.id,
      templateType: scene.templateType,
      lastSavedAt: new Date().toISOString(),
    });
  }

  /**
   * D-093 — remove a Recent entry. NON-DESTRUCTIVE: drops only the list entry and, for a
   * handle-backed entry, forgets the persisted `FileSystemFileHandle` + its granted
   * permission (`forgetFileHandle`). The underlying file (real disk or OPFS
   * `projects/*.cg.json`) is NEVER deleted or modified — re-opening it via Open / the OPFS
   * path works normally. Matched by project id (legacy entries by path).
   */
  async forgetRecent(ref: {
    projectId?: string;
    handleKey?: string;
    path?: string;
  }): Promise<void> {
    const key = ref.projectId ?? ref.path;
    if (key !== undefined) {
      this.#kv.set(
        RECENT_KEY,
        this.recent().filter((e) => (e.projectId ?? e.path) !== key),
      );
    }
    if (ref.handleKey !== undefined) {
      try {
        await forgetFileHandle(ref.handleKey);
      } catch {
        /* best-effort — a stale handle that can't be forgotten is harmless */
      }
    }
  }

  /** D-093 — empty Recent and forget every cached handle. Same non-destructive rules. */
  async clearRecent(): Promise<void> {
    const handleKeys = this.recent()
      .map((e) => e.handleKey)
      .filter((k): k is string => k !== undefined);
    this.#kv.set(RECENT_KEY, []);
    for (const k of handleKeys) {
      try {
        await forgetFileHandle(k);
      } catch {
        /* best-effort */
      }
    }
  }

  #setActive(scene: Scene, path: string | null): void {
    this.#active = { scene, path };
    this.activeChanged.emit({ scene, path });
  }

  /** OPFS-path (fallback / legacy) Recent entry. */
  #recordRecent(scene: Scene, path: string): void {
    this.#pushRecent({
      projectId: scene.id,
      name: scene.name,
      path,
      templateType: scene.templateType,
      lastSavedAt: new Date().toISOString(),
    });
  }

  /** Upsert a Recent entry, deduped by project id (falling back to path for legacy ones). */
  #pushRecent(entry: RecentProject): void {
    const key = entry.projectId ?? entry.path;
    const filtered = this.recent().filter((e) => (e.projectId ?? e.path) !== key);
    this.#kv.set(RECENT_KEY, [entry, ...filtered].slice(0, RECENT_CAP));
  }
}
