import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { pack } from '@cg/vcg-format';
import type { AssetEntry, BindingTransform, DynamicField, Scene } from '@cg/shared-schema';
import type { ExportIssue, ExportProgress } from '@cg/shared-ipc';
import type { AssetService } from './AssetService.js';

/**
 * ExportService — the Phase 4 §7 pipeline, wired end-to-end.
 *
 * Steps (mirrors `ExportProgress.step`):
 *   1. validate     — Zod parse + cross-checks (referenced fonts/assets exist)
 *   2. manifest     — assemble the manifest JSON
 *   3. assets       — gather binary assets from the AssetService
 *   4. template     — emit index.html + cg.js + cg.css for the scene
 *   5. pack         — deterministic zip via @cg/vcg-format.pack()
 *   6. sign         — optional Ed25519 (deferred for M6.1 — toggle ignored)
 *   7. done
 *
 * Signing wiring + a per-deployment key vault land in M9; for M6.1 the
 * `sign: true` flag is accepted and silently skipped (returns the unsigned
 * .vcg). The export still produces a real, verifiable file.
 */

export interface ExportServiceOptions {
  /** Pre-bundled `@cg/template-runtime` JS (the `cg.js` payload). */
  cgJs: string;
  /** Optional CSS to inject — defaults to a minimal reset. */
  cgCss?: string;
  /** Asset service for binary lookup. */
  assets: AssetService;
}

export interface ExportServiceEvents {
  progress: [info: ExportProgress];
}

const DEFAULT_CG_CSS = `*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;background:transparent;overflow:hidden;color:#FFF;font-family:Inter,Vazirmatn,"Noto Sans Arabic",system-ui,sans-serif}
.cg-pending{opacity:0}`;

export class ExportService extends EventEmitter<ExportServiceEvents> {
  private readonly cgJs: string;
  private readonly cgCss: string;
  private readonly assets: AssetService;

  constructor(options: ExportServiceOptions) {
    super();
    this.cgJs = options.cgJs;
    this.cgCss = options.cgCss ?? DEFAULT_CG_CSS;
    this.assets = options.assets;
  }

  /**
   * Phase 4 §7 step 1: validate without producing a file. Cheap to call
   * on every Inspector edit (debounced by the renderer).
   *
   * Severity policy (Phase 8 M7.3):
   *   - error    → blocks `run()`. Reserved for outcomes that would
   *                produce a broken .vcg or surprise the operator on air
   *                (unknown asset, unbound required field, dangling
   *                binding).
   *   - warning  → ships, but should be addressed (formatter applied to
   *                an inappropriate field type, font missing bundled path).
   *   - info     → advisory (empty scene).
   */
  preflight(scene: Scene): readonly ExportIssue[] {
    const issues: ExportIssue[] = [];

    if (scene.layers.length === 0) {
      issues.push({
        severity: 'info',
        code: 'empty-scene',
        message: 'Scene has no layers — export will render a blank frame.',
      });
    }

    const knownAssetIds = new Set(this.assets.list().map((a) => a.assetId));
    const allElementIds = new Set<string>();
    for (const layer of scene.layers) {
      for (const el of layer.children) {
        allElementIds.add(el.id);
        if (el.type === 'image') {
          if (!knownAssetIds.has(el.assetId)) {
            issues.push({
              severity: 'error',
              code: 'missing-asset',
              message: `Image element references unknown asset ${el.assetId}.`,
              elementId: el.id,
            });
          }
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
      const hasDefault = fieldHasMeaningfulDefault(field);
      if (!hasDefault && !hasBinding) {
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
      if (b.target.kind !== 'scene-background') {
        if (!allElementIds.has(b.target.elementId)) {
          issues.push({
            severity: 'error',
            code: 'unknown-binding-element',
            message: `Binding from "${b.fieldId}" targets unknown element "${b.target.elementId}".`,
            fieldId: b.fieldId,
          });
          continue;
        }
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
   * Run the full pipeline. Emits `progress` at each step boundary. Throws
   * if validation surfaces an `error`-severity issue. The signed-package
   * path (`sign: true`) accepts the flag for forward-compat but is a
   * no-op in M6.1 — the returned file is unsigned.
   */
  async run(
    scene: Scene,
    outputPath: string,
    _signRequested = false,
  ): Promise<{ path: string; sha256: string; bytes: number }> {
    this.emit('progress', { step: 'validate', progress: 0.05 });
    const issues = this.preflight(scene);
    const fatal = issues.filter((i) => i.severity === 'error');
    if (fatal.length > 0) {
      const first = fatal[0];
      throw new Error(
        `export blocked by validation: ${first?.code ?? 'unknown'} — ${first?.message ?? ''}`,
      );
    }

    this.emit('progress', { step: 'manifest', progress: 0.2 });

    this.emit('progress', { step: 'assets', progress: 0.4 });
    const { assetsMap, assetIndex } = await this.gatherBinaries(scene);

    this.emit('progress', { step: 'template', progress: 0.6 });
    const indexHtml = this.buildIndexHtml(scene);

    const nowIso = new Date().toISOString();
    this.emit('progress', { step: 'pack', progress: 0.8 });
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
        compatibility: {
          minRuntimeVersion: '0.0.0',
          minCasparCGVersion: '2.3.0',
        },
        fontDeps: scene.fonts,
        assetIndex,
      },
      indexHtml,
      cgJs: this.cgJs,
      cgCss: this.cgCss,
      assets: assetsMap,
    });

    this.emit('progress', { step: 'sign', progress: 0.95 });
    // sign path deferred to M9 — flag accepted but ignored

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, vcg);
    const sha256 = sha256Hex(vcg);
    this.emit('progress', { step: 'done', progress: 1 });
    return { path: outputPath, sha256, bytes: vcg.byteLength };
  }

  private async gatherBinaries(
    scene: Scene,
  ): Promise<{ assetsMap: Map<string, Buffer>; assetIndex: AssetEntry[] }> {
    const used = new Set<string>();
    for (const layer of scene.layers) {
      for (const el of layer.children) {
        if (el.type === 'image') {
          used.add(el.assetId);
        }
      }
    }
    const assetsMap = new Map<string, Buffer>();
    const assetIndex: AssetEntry[] = [];
    for (const assetId of used) {
      const meta = this.assets.get(assetId);
      if (meta === null) continue;
      const bytes = await fs.promises.readFile(meta.workingPath);
      const ext = path.extname(meta.filename);
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

  private buildIndexHtml(scene: Scene): string {
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
}

function sha256Hex(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * A required field is "satisfied" when its default would produce a
 * non-empty payload at runtime. For most types this means the user set
 * a non-empty value; image fields are satisfied if `defaultAssetId` is
 * set (an empty asset id is meaningless to the runtime).
 */
function fieldHasMeaningfulDefault(field: DynamicField): boolean {
  switch (field.type) {
    case 'text':
    case 'multiline':
      return field.default !== '';
    case 'image':
      return field.defaultAssetId !== undefined && field.defaultAssetId !== '';
    case 'color':
      return field.default !== '';
    case 'select':
      return field.default !== '' && field.options.some((o) => o.value === field.default);
    case 'number':
    case 'boolean':
      // Numbers and booleans always carry a defined default.
      return true;
  }
}

/**
 * Decides whether a `BindingTransform` is "useful" against a given
 * field type. Identity is always applicable. Digit/date transforms
 * imply a numeric or text payload — applying them to a `boolean` or
 * `image` field is almost certainly a mistake.
 */
function isFormatterApplicable(transform: BindingTransform, field: DynamicField): boolean {
  if (transform === 'identity') return true;
  switch (field.type) {
    case 'text':
    case 'multiline':
    case 'number':
      return true;
    case 'select':
      // select values are usually short codes — uppercase/lowercase is OK,
      // digit transforms aren't useful but aren't *wrong*.
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
