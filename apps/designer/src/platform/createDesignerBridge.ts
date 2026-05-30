import { SceneSchema } from '@cg/shared-schema';
import type { AppInfo, DesignerBridge } from '../shared/designer-bridge.js';
import { cgCss, cgJs } from './cg-runtime.js';
import { initWorkspace, prefs } from './workspace.js';
import { ProjectStore } from './ProjectStore.js';
import { AssetStore } from './AssetStore.js';
import { Exporter } from './Exporter.js';
import { Preview } from './preview.js';

const APP_INFO: AppInfo = { name: 'cg Designer', version: '0.0.0', platform: 'browser' };

/**
 * Build the browser `DesignerBridge` — the in-process replacement for the
 * Electron preload's `window.cg`. The renderer is unchanged; only the
 * implementation behind the contract differs (browser storage + Blob URLs
 * instead of Electron IPC + a custom protocol).
 */
export async function initDesignerPlatform(): Promise<DesignerBridge> {
  const ws = await initWorkspace();
  const projects = new ProjectStore(ws, prefs);
  const assets = new AssetStore(ws);
  const exporter = new Exporter({ assets, cgJs, cgCss });
  const preview = new Preview({ cgJs, cgCss });

  return {
    getAppInfo: () => Promise.resolve(APP_INFO),

    projects: {
      create: (req) => Promise.resolve(projects.newScene(req.name, req.templateType)),
      open: async (req) => {
        if (req.path !== undefined) return projects.open(req.path);
        const picked = await pickJsonFile();
        if (picked === null) return { scene: null, path: null };
        const scene = SceneSchema.parse(JSON.parse(picked.text));
        const { path } = await projects.save(scene, picked.name);
        return { scene, path };
      },
      save: (req) => projects.save(req.scene, req.path ?? req.scene.name),
      recent: () => Promise.resolve(projects.recent()),
      starters: () => Promise.resolve(projects.starters()),
      starter: (req) => {
        const result = projects.loadStarter(req.starterId);
        if (result === null) return Promise.reject(new Error(`Unknown starter: ${req.starterId}`));
        return Promise.resolve(result);
      },
      onActiveChanged: (handler) => projects.activeChanged.subscribe(handler),
    },

    assets: {
      import: async (req) => {
        const file = await pickFile();
        if (file === null) throw new Error('No file selected');
        return { asset: await assets.importFile(file, req.kind) };
      },
      list: () => assets.list(),
      remove: async (req) => ({ ok: await assets.remove(req.assetId) }),
      onImported: (handler) => assets.imported.subscribe(handler),
    },

    export: {
      preflight: async (req) => ({ issues: await exporter.preflight(req.scene) }),
      run: (req) => exporter.run(req.scene, req.outputPath),
      onProgress: (handler) => exporter.progress.subscribe(handler),
    },

    preview: {
      load: (req) => Promise.resolve(preview.load(req.scene)),
      update: (req) => Promise.resolve(preview.update(req.fields)),
      reload: () => Promise.resolve(preview.reload()),
    },
  };
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}

async function pickJsonFile(): Promise<{ text: string; name: string } | null> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
  if (file === null) return null;
  return { text: await file.text(), name: file.name };
}
