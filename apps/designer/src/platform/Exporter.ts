import { pack, sha256Hex } from '@cg/vcg-format';
import type { AssetEntry, BindingTransform, DynamicField, Scene } from '@cg/shared-schema';
import type { ExportIssue, ExportProgress } from '@cg/shared-ipc';
import type { AssetStore } from './AssetStore.js';
import { Emitter } from './emitter.js';

export interface ExporterOptions {
  assets: AssetStore;
  /** Bundled @cg/template-runtime JS injected as cg.js. */
  cgJs: string;
  /** Runtime baseline stylesheet injected as cg.css. */
  cgCss: string;
}

/**
 * Browser port of the Electron ExportService (Phase 4 §7 pipeline). The
 * validation + HTML-emit logic is identical; the file output is replaced
 * with a browser download, and crypto/zip run through the isomorphic
 * @cg/vcg-format.
 */
export class Exporter {
  readonly progress = new Emitter<ExportProgress>();
  readonly #assets: AssetStore;
  readonly #cgJs: string;
  readonly #cgCss: string;

  constructor(options: ExporterOptions) {
    this.#assets = options.assets;
    this.#cgJs = options.cgJs;
    this.#cgCss = options.cgCss;
  }

  /** Phase 4 §7 step 1 — validate without producing a file. */
  async preflight(scene: Scene): Promise<ExportIssue[]> {
    const issues: ExportIssue[] = [];

    if (scene.layers.length === 0) {
      issues.push({
        severity: 'info',
        code: 'empty-scene',
        message: 'Scene has no layers — export will render a blank frame.',
      });
    }

    const knownAssetIds = new Set((await this.#assets.list()).map((a) => a.assetId));
    const allElementIds = new Set<string>();
    for (const layer of scene.layers) {
      for (const el of layer.children) {
        allElementIds.add(el.id);
        if (el.type === 'image' && !knownAssetIds.has(el.assetId)) {
          issues.push({
            severity: 'error',
            code: 'missing-asset',
            message: `Image element references unknown asset ${el.assetId}.`,
            elementId: el.id,
          });
        }
      }
    }

    for (const font of scene.fonts) {
      if (font.source === 'bundled' && font.bundledPath === undefined) {
        issues.push({
          severity: 'warning',
          code: 'font-no-path',
          message: `Bundled font ${font.family} is missing its bundled-path resource.`,
        });
      }
    }

    const fieldsById = new Map(scene.fields.map((f) => [f.id, f]));

    for (const field of scene.fields) {
      if (field.required !== true) continue;
      const hasBinding = scene.bindings.some((b) => b.fieldId === field.id);
      if (!fieldHasMeaningfulDefault(field) && !hasBinding) {
        issues.push({
          severity: 'error',
          code: 'unbound-required-field',
          message: `Required field "${field.label}" has no default value and no binding.`,
          fieldId: field.id,
        });
      }
    }

    for (let i = 0; i < scene.bindings.length; i++) {
      const b = scene.bindings[i];
      if (b === undefined) continue;
      const field = fieldsById.get(b.fieldId);
      if (field === undefined) {
        issues.push({
          severity: 'error',
          code: 'unknown-binding-field',
          message: `Binding #${String(i)} references unknown field "${b.fieldId}".`,
        });
        continue;
      }
      if (b.target.kind !== 'scene-background' && !allElementIds.has(b.target.elementId)) {
        issues.push({
          severity: 'error',
          code: 'unknown-binding-element',
          message: `Binding from "${b.fieldId}" targets unknown element "${b.target.elementId}".`,
          fieldId: b.fieldId,
        });
        continue;
      }
      if (b.transform !== undefined && !isFormatterApplicable(b.transform, field)) {
        issues.push({
          severity: 'warning',
          code: 'formatter-mismatch',
          message: `Formatter "${b.transform}" doesn't usefully apply to ${field.type} field "${b.fieldId}".`,
          fieldId: b.fieldId,
        });
      }
    }

    return issues;
  }

  /**
   * Run the full pipeline and trigger a browser download of the `.vcg`.
   * `outputPath`'s basename becomes the download filename. Throws when
   * preflight surfaces an error-severity issue.
   */
  async run(
    scene: Scene,
    outputPath: string,
  ): Promise<{ path: string; sha256: string; bytes: number }> {
    this.progress.emit({ step: 'validate', progress: 0.05 });
    const fatal = (await this.preflight(scene)).filter((i) => i.severity === 'error');
    if (fatal.length > 0) {
      const first = fatal[0];
      throw new Error(
        `export blocked by validation: ${first?.code ?? 'unknown'} — ${first?.message ?? ''}`,
      );
    }

    this.progress.emit({ step: 'manifest', progress: 0.2 });
    this.progress.emit({ step: 'assets', progress: 0.4 });
    const { assetsMap, assetIndex } = await this.#gatherBinaries(scene);

    this.progress.emit({ step: 'template', progress: 0.6 });
    const indexHtml = buildIndexHtml(scene);

    const nowIso = new Date().toISOString();
    this.progress.emit({ step: 'pack', progress: 0.8 });
    const vcg = await pack({
      scene,
      manifestExtras: {
        id: scene.id,
        name: scene.name,
        authoring: {
          designerVersion: '0.0.0',
          createdAt: scene.metadata.createdAt,
          exportedAt: nowIso,
          ...(scene.metadata.author !== undefined ? { author: scene.metadata.author } : {}),
        },
        compatibility: { minRuntimeVersion: '0.0.0', minCasparCGVersion: '2.3.0' },
        fontDeps: scene.fonts,
        assetIndex,
      },
      indexHtml,
      cgJs: this.#cgJs,
      cgCss: this.#cgCss,
      assets: assetsMap,
    });

    this.progress.emit({ step: 'sign', progress: 0.95 });

    const filename = downloadName(outputPath, scene.name);
    triggerDownload(vcg, filename);

    this.progress.emit({ step: 'done', progress: 1 });
    return { path: filename, sha256: sha256Hex(vcg), bytes: vcg.byteLength };
  }

  async #gatherBinaries(
    scene: Scene,
  ): Promise<{ assetsMap: Map<string, Uint8Array>; assetIndex: AssetEntry[] }> {
    const used = new Set<string>();
    for (const layer of scene.layers) {
      for (const el of layer.children) {
        if (el.type === 'image') used.add(el.assetId);
      }
    }
    const assetsMap = new Map<string, Uint8Array>();
    const assetIndex: AssetEntry[] = [];
    for (const assetId of used) {
      const meta = await this.#assets.get(assetId);
      if (meta === null) continue;
      const bytes = await this.#assets.bytes(assetId);
      if (bytes === null) continue;
      const ext = meta.filename.slice(meta.filename.lastIndexOf('.'));
      const relativePath = `assets/${meta.kind}/${meta.sha256}${ext}`;
      assetsMap.set(relativePath, bytes);
      assetIndex.push({
        id: meta.assetId,
        path: relativePath,
        kind: meta.kind,
        bytes: bytes.byteLength,
        sha256: meta.sha256,
        mime: mimeFor(ext),
      });
    }
    return { assetsMap, assetIndex };
  }
}

function downloadName(outputPath: string, sceneName: string): string {
  const base = outputPath.split(/[\\/]/).pop() ?? '';
  const name = base.length > 0 ? base : `${sceneName || 'template'}.vcg`;
  return name.endsWith('.vcg') ? name : `${name}.vcg`;
}

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.slice()], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

function buildIndexHtml(scene: Scene): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=${String(scene.resolution.width)}, initial-scale=1" />
    <title>${escapeHtml(scene.name)}</title>
    <link rel="stylesheet" href="./cg.css" />
  </head>
  <body class="cg-pending">
    <script type="module">
      import { createRuntime, installCasparGlobals } from './cg.js';
      (async () => {
        const res = await fetch('./template.json');
        const scene = await res.json();
        const runtime = createRuntime(scene);
        installCasparGlobals(runtime);
        await runtime.ready;
      })();
    </script>
  </body>
</html>
`;
}

function fieldHasMeaningfulDefault(field: DynamicField): boolean {
  switch (field.type) {
    case 'text':
    case 'multiline':
    case 'color':
      return field.default !== '';
    case 'image':
      return field.defaultAssetId !== undefined && field.defaultAssetId !== '';
    case 'select':
      return field.default !== '' && field.options.some((o) => o.value === field.default);
    case 'number':
    case 'boolean':
      return true;
  }
}

function isFormatterApplicable(transform: BindingTransform, field: DynamicField): boolean {
  if (transform === 'identity') return true;
  switch (field.type) {
    case 'text':
    case 'multiline':
    case 'number':
      return true;
    case 'select':
      return transform === 'uppercase' || transform === 'lowercase' || transform === 'truncate';
    case 'color':
    case 'boolean':
    case 'image':
      return false;
  }
}

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}
