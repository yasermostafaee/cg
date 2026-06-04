import {
  SceneSchema,
  type FrameRate,
  type Resolution,
  type Scene,
  type TemplateType,
} from '@cg/shared-schema';
import type { RecentProject, StarterEntry } from '@cg/shared-ipc';
import { getStarter, STARTER_TEMPLATES } from '@cg/starter-templates';
import type { KeyValueStore, Workspace } from '@cg/storage';
import { Emitter } from './emitter.js';

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
      id: crypto.randomUUID(),
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
          id: crypto.randomUUID(),
          name: 'comp1',
          resolution,
          frameRate,
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
      id: crypto.randomUUID(),
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

  #setActive(scene: Scene, path: string | null): void {
    this.#active = { scene, path };
    this.activeChanged.emit({ scene, path });
  }

  #recordRecent(scene: Scene, path: string): void {
    const filtered = this.recent().filter((e) => e.path !== path);
    const next: RecentProject[] = [
      {
        path,
        name: scene.name,
        templateType: scene.templateType,
        lastOpenedAt: new Date().toISOString(),
      },
      ...filtered,
    ].slice(0, RECENT_CAP);
    this.#kv.set(RECENT_KEY, next);
  }
}
