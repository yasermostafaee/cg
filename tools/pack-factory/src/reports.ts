import * as path from 'node:path';
import type { PreparedPack } from './build.js';
import type { TemplateQcResult } from './qc.js';

export interface PackReport {
  schemaVersion: 1;
  status: 'complete' | 'incomplete';
  exportedAt: string;
  brand: { id: string; name: string; motion: string };
  family: string;
  visualQc: 'passed' | 'skipped';
  templates: {
    key: string;
    name: string;
    output: string;
    sourceProject: string;
    compositionId: string;
    target: string;
    manifestId: string;
    sha256: string;
    bytes: number;
    colors: PreparedPack['templates'][number]['bindings']['colors'];
    assets: PreparedPack['templates'][number]['bindings']['assets'];
    fonts: PreparedPack['templates'][number]['bindings']['fonts'];
    masterAssets: PreparedPack['templates'][number]['masterAssets'];
    packageAssets: { id: string; kind: string; sha256: string; bytes: number }[];
    qc: TemplateQcResult | null;
  }[];
}

export function buildPackReport(
  pack: PreparedPack,
  qc: readonly TemplateQcResult[] | null,
): PackReport {
  const qcByKey = new Map((qc ?? []).map((result) => [result.key, result]));
  return {
    schemaVersion: 1,
    status: qc === null ? 'incomplete' : 'complete',
    exportedAt: pack.exportedAt,
    brand: {
      id: pack.inputs.brandKit.id,
      name: pack.inputs.brandKit.name,
      motion: pack.inputs.brandKit.motion,
    },
    family: pack.inputs.recipe.family,
    visualQc: qc === null ? 'skipped' : 'passed',
    templates: pack.templates.map((template) => ({
      key: template.key,
      name: template.displayName,
      output: `templates/${template.outputName}`,
      sourceProject: template.sourceProject,
      compositionId: template.compositionId,
      target: template.target,
      manifestId: template.manifest.id,
      sha256: template.sha256,
      bytes: template.vcg.byteLength,
      colors: template.bindings.colors,
      assets: template.bindings.assets,
      fonts: template.bindings.fonts,
      masterAssets: template.masterAssets,
      packageAssets: template.manifest.assetIndex.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        sha256: asset.sha256,
        bytes: asset.bytes,
      })),
      qc: qcByKey.get(template.key) ?? null,
    })),
  };
}

export function packSheetMarkdown(pack: PreparedPack, report: PackReport): string {
  const brand = pack.inputs.brandKit;
  const colorRows = Object.entries(brand.colors)
    .map(([role, color]) => {
      const origin =
        color.source === 'brand'
          ? 'brand exact'
          : `derived from ${color.derivedFrom} — ${color.note}`;
      return `| ${md(role)} | \`${color.value}\` | ${md(origin)} |`;
    })
    .join('\n');
  const fontRows = [...pack.inputs.fonts.values()]
    .map(
      (font) =>
        `| ${md(font.role)} | ${md(font.definition.family)} | ${String(font.definition.weight)} ${font.definition.style} | ${md(path.basename(font.path))} | ${md(font.definition.licenseNote)} |`,
    )
    .join('\n');
  const templateRows = report.templates
    .map(
      (template) =>
        `| ${md(template.key)} | ${md(template.name)} | ${md(template.target)} | \`${template.manifestId}\` | \`${template.sha256.slice(0, 16)}…\` | ${template.qc === null ? 'skipped' : 'passed'} |`,
    )
    .join('\n');
  const notes =
    brand.brandbookNotes.length === 0
      ? '_No additional brandbook notes._'
      : brand.brandbookNotes.map((note) => `- ${note}`).join('\n');

  return `# ${brand.name} — ${pack.inputs.recipe.family}

Status: **${report.status === 'complete' ? 'complete' : 'incomplete — visual QC skipped'}**

Built: ${pack.exportedAt}

Motion: ${brand.motion}

## Templates

| Key | Name | Target | Stable manifest id | SHA-256 | Visual QC |
| --- | --- | --- | --- | --- | --- |
${templateRows}

## Colours

| Role | Value | Source |
| --- | --- | --- |
${colorRows}

## Fonts and embedding evidence

| Role | Family | Face | File | Licence note |
| --- | --- | --- | --- | --- |
${fontRows || '| — | — | — | — | No fonts declared |'}

Every listed font was built only after \`licenseConfirmed: true\` passed validation.

## Brand assets

${[...pack.inputs.assets.values()]
  .map(
    (asset) =>
      `- **${asset.role}** — source \`${path.basename(asset.sourcePath)}\`, render \`${path.basename(asset.renderPath)}\`, ${asset.definition.kind}`,
  )
  .join('\n')}

## Brandbook notes

${notes}

## Delivery rule

The stable ids above are the update contract. Changing the brand id, template key or semantic role
creates a new identity. Customer source files and this delivery stay outside the product repository.
`;
}

export function contactSheetHtml(pack: PreparedPack, report: PackReport): string {
  const cards = report.templates
    .map((template) => {
      const built = pack.templates.find((candidate) => candidate.key === template.key);
      const aspectRatio = `${String(built?.scene.resolution.width ?? 16)} / ${String(built?.scene.resolution.height ?? 9)}`;
      const captures = template.qc?.captures ?? [];
      const phases = captures
        .map(
          (capture) => `<figure>
              <div class="frame" style="aspect-ratio:${aspectRatio}"><img src="${html(capture.path)}" alt="${html(template.name)} — ${html(capture.phase)}" /></div>
              <figcaption>${html(capture.phase)}</figcaption>
            </figure>`,
        )
        .join('');
      return `<article class="card">
          <header><div><span>${html(template.key)}</span><h2 dir="auto">${html(template.name)}</h2></div><code>${html(template.target)}</code></header>
          ${phases === '' ? '<p class="skipped">Visual QC was skipped. This is not a completed delivery.</p>' : `<div class="phases">${phases}</div>`}
          <footer><code>${html(template.manifestId)}</code></footer>
        </article>`;
    })
    .join('\n');
  const complete = report.status === 'complete';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${html(pack.inputs.brandKit.name)} — pack contact sheet</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; background:#0b0e13; color:#f4f6fb; }
      * { box-sizing:border-box; }
      body { margin:0; padding:clamp(20px,4vw,64px); background:radial-gradient(circle at 85% 0,#18263a 0,transparent 34%),#0b0e13; }
      .top { display:flex; align-items:end; justify-content:space-between; gap:20px; margin-bottom:32px; }
      .eyebrow { color:#8fa4be; letter-spacing:.14em; text-transform:uppercase; font-size:12px; }
      h1 { margin:8px 0 0; font-size:clamp(28px,4vw,52px); }
      .status { padding:8px 12px; border:1px solid ${complete ? '#3bd18a' : '#f0ad4e'}; color:${complete ? '#78efb2' : '#ffd184'}; border-radius:999px; white-space:nowrap; }
      main { display:grid; gap:24px; }
      .card { border:1px solid #293342; border-radius:16px; overflow:hidden; background:#111720; box-shadow:0 18px 48px #0006; }
      .card>header,.card>footer { display:flex; justify-content:space-between; gap:16px; padding:16px 18px; align-items:center; }
      .card>header { border-bottom:1px solid #293342; }
      .card>footer { border-top:1px solid #293342; color:#8fa4be; overflow-wrap:anywhere; }
      h2 { margin:3px 0 0; font-size:20px; }
      header span { color:#65aef7; font-size:12px; letter-spacing:.09em; text-transform:uppercase; }
      code { color:#aebed2; font-size:12px; }
      .phases { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1px; background:#293342; }
      figure { margin:0; min-width:0; background:#0b0e13; }
      .frame { aspect-ratio:16/9; display:grid; place-items:center; overflow:hidden; background:repeating-conic-gradient(#1b222d 0 25%,#161c25 0 50%) 0/24px 24px; }
      img { display:block; width:100%; height:100%; object-fit:contain; }
      figcaption { padding:10px 14px; color:#9cadc1; text-transform:uppercase; letter-spacing:.1em; font-size:11px; }
      .skipped { margin:0; padding:36px 18px; color:#ffd184; }
      @media (max-width:760px) { .top{align-items:start;flex-direction:column}.phases{grid-template-columns:1fr}.card>header{align-items:start;flex-direction:column}.card>footer code{font-size:10px} }
    </style>
  </head>
  <body>
    <div class="top"><div><div class="eyebrow">${html(pack.inputs.recipe.family)} · ${html(pack.exportedAt)}</div><h1 dir="auto">${html(pack.inputs.brandKit.name)}</h1></div><div class="status">${complete ? 'QC PASSED' : 'QC SKIPPED'}</div></div>
    <main>${cards}</main>
  </body>
</html>
`;
}

function md(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function html(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}
