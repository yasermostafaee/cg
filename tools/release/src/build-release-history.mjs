import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function requiredText(value, at) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(at + ' must be a non-empty string');
  }
  return value.trim();
}

function stringList(value, at) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(at + ' must be an array of strings');
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

export function releaseAssetNames(version) {
  return {
    guide: 'APASAI-CG-' + version + '-install-guide-fa.pdf',
    bridge: 'CG-Bridge_' + version + '_x64-setup.exe',
    control: 'CG-Control_' + version + '_x64-setup.exe',
    designer: 'CG-Designer_' + version + '_x64-setup.exe',
    sums: 'SHA256SUMS.txt',
  };
}

export function parseReleaseHistory(source) {
  const data = JSON.parse(source);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('release history must be an object');
  }
  if (data.schemaVersion !== 1) throw new Error('release history schemaVersion must be 1');
  const product = requiredText(data.product, 'product');
  if (!Array.isArray(data.releases) || data.releases.length === 0) {
    throw new Error('releases must contain at least one entry');
  }
  const seen = new Set();
  const releases = data.releases.map((raw, index) => {
    const at = 'releases[' + String(index) + ']';
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(at + ' must be an object');
    }
    const version = requiredText(raw.version, at + '.version');
    if (seen.has(version)) throw new Error('duplicate release version ' + version);
    seen.add(version);
    const status = requiredText(raw.status, at + '.status');
    if (!['development', 'prepared', 'published'].includes(status)) {
      throw new Error(at + '.status must be development, prepared or published');
    }
    return {
      version,
      title: requiredText(raw.title, at + '.title'),
      date: requiredText(raw.date, at + '.date'),
      status,
      summary: requiredText(raw.summary, at + '.summary'),
      changes: stringList(raw.changes, at + '.changes'),
      planned: raw.planned === undefined ? [] : stringList(raw.planned, at + '.planned'),
      downloadBaseUrl:
        typeof raw.downloadBaseUrl === 'string' && raw.downloadBaseUrl.trim() !== ''
          ? raw.downloadBaseUrl.trim().replace(/\/+$/u, '')
          : null,
    };
  });
  return { product, releases };
}

function statusLabel(status) {
  if (status === 'published') return 'منتشرشده';
  if (status === 'prepared') return 'آمادهٔ تحویل';
  return 'در حال توسعه';
}

function downloadsFor(release) {
  if (release.version === 'next') return '';
  const names = releaseAssetNames(release.version);
  const assets = [
    ['راهنمای نصب', names.guide],
    ['نصب CG Bridge', names.bridge],
    ['نصب CG Control', names.control],
    ['نصب CG Designer', names.designer],
    ['Checksum', names.sums],
  ];
  const items = assets
    .map(([label, file]) => {
      if (release.downloadBaseUrl === null) {
        return (
          '<span class="download disabled" aria-disabled="true" data-download-file="' +
          escapeHtml(file) +
          '"><strong>' +
          escapeHtml(label) +
          '</strong><small>' +
          escapeHtml(file) +
          '</small><em>لینک بعداً متصل می‌شود</em></span>'
        );
      }
      const href = release.downloadBaseUrl + '/' + encodeURIComponent(file);
      return (
        '<a class="download" href="' +
        escapeHtml(href) +
        '" download><strong>' +
        escapeHtml(label) +
        '</strong><small>' +
        escapeHtml(file) +
        '</small></a>'
      );
    })
    .join('');
  return '<section class="downloads"><h3>دانلودهای این نسخه</h3><div class="download-grid">' + items + '</div></section>';
}

function list(title, items, className) {
  if (items.length === 0) return '';
  return (
    '<section class="' +
    className +
    '"><h3>' +
    escapeHtml(title) +
    '</h3><ul>' +
    items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') +
    '</ul></section>'
  );
}

function releaseCard(release, open) {
  return (
    '<details class="release" id="version-' +
    escapeHtml(release.version) +
    '"' +
    (open ? ' open' : '') +
    '><summary><span><bdi>v' +
    escapeHtml(release.version) +
    '</bdi><strong>' +
    escapeHtml(release.title) +
    '</strong></span><span class="meta"><time datetime="' +
    escapeHtml(release.date) +
    '">' +
    escapeHtml(release.date) +
    '</time><em data-status="' +
    escapeHtml(release.status) +
    '">' +
    escapeHtml(statusLabel(release.status)) +
    '</em></span></summary><div class="release-body"><p class="summary">' +
    escapeHtml(release.summary) +
    '</p>' +
    list('تغییرات این نسخه', release.changes, 'changes') +
    list('در دست پیگیری', release.planned, 'planned') +
    downloadsFor(release) +
    '</div></details>'
  );
}

const STYLE = [
  ':root{color-scheme:dark;--bg:#071018;--panel:#0d1a24;--line:#244052;--text:#eef7fb;--muted:#9bb1bf;--accent:#36c5b7;--warm:#f4bd63}',
  '*{box-sizing:border-box}html{font-family:Vazirmatn,Tahoma,Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.8}',
  'body{margin:0;background:radial-gradient(circle at 85% 0,#123847 0,transparent 34rem),var(--bg)}',
  'main{width:min(1080px,calc(100% - 32px));margin:auto;padding:56px 0 80px}',
  'header{margin-bottom:30px}h1{font-size:clamp(2rem,6vw,4rem);line-height:1.2;margin:0 0 10px}header p{color:var(--muted);max-width:760px;margin:0}',
  '.release{background:color-mix(in srgb,var(--panel) 92%,transparent);border:1px solid var(--line);border-radius:18px;margin:14px 0;overflow:hidden;box-shadow:0 18px 50px #0005}',
  'summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:20px;align-items:center;padding:22px 24px}summary::-webkit-details-marker{display:none}',
  'summary>span:first-child{display:flex;align-items:center;gap:14px}summary bdi{font:700 1rem ui-monospace,monospace;color:#061519;background:var(--accent);border-radius:999px;padding:5px 12px}',
  'summary strong{font-size:1.15rem}.meta{display:flex;align-items:center;gap:10px;color:var(--muted)}.meta em{font-style:normal;border:1px solid var(--line);border-radius:999px;padding:2px 10px}',
  '.meta em[data-status=development]{color:var(--warm)}.meta em[data-status=published]{color:var(--accent)}',
  '.release-body{border-top:1px solid var(--line);padding:22px 24px 28px}.summary{font-size:1.06rem;margin:0 0 18px}',
  'h3{font-size:1rem;margin:22px 0 8px;color:#d9f8f4}ul{margin:0;padding-inline-start:24px}li{margin:5px 0}.planned{color:var(--muted)}',
  '.download-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.download{display:flex;flex-direction:column;text-decoration:none;color:var(--text);background:#102632;border:1px solid #2d5869;border-radius:12px;padding:12px 14px;min-height:92px}',
  'a.download:hover{border-color:var(--accent);transform:translateY(-1px)}.download small{direction:ltr;text-align:left;color:var(--muted);overflow-wrap:anywhere}.download em{font-size:.78rem;color:var(--warm);font-style:normal;margin-top:auto}.disabled{opacity:.72}',
  'footer{color:var(--muted);margin-top:28px;font-size:.9rem}@media(max-width:680px){main{width:min(100% - 20px,1080px);padding-top:30px}summary{align-items:flex-start;flex-direction:column}.meta{width:100%;justify-content:space-between}.release-body{padding:18px}}',
].join('');

export function releaseHistoryHtml(data, options = {}) {
  const currentVersion = options.currentVersion;
  if (
    currentVersion !== undefined &&
    !data.releases.some((release) => release.version === currentVersion)
  ) {
    throw new Error(
      'release history has no entry for build version ' +
        currentVersion +
        '; add its changes before building installers',
    );
  }
  const cards = data.releases
    .map((release, index) => releaseCard(release, index === 0))
    .join('\n');
  return [
    '<!doctype html>',
    '<html lang="fa" dir="rtl"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="description" content="تغییرات و دانلود نسخه‌های ' + escapeHtml(data.product) + '">',
    '<title>نسخه‌ها و تغییرات ' + escapeHtml(data.product) + '</title>',
    '<style>' + STYLE + '</style></head><body><main>',
    '<header><h1>نسخه‌ها و تغییرات</h1><p>تاریخچهٔ قابل جست‌وجوی ' +
      escapeHtml(data.product) +
      '؛ هر نسخه را باز کنید تا تغییرات، راهنما و فایل‌های نصب همان نسخه را ببینید.</p></header>',
    cards,
    '<footer>لینک‌های غیرفعال پس از انتقال فایل‌ها به هاست، فقط با تعیین آدرس پایهٔ همان نسخه فعال می‌شوند.</footer>',
    '</main></body></html>',
  ].join('\n');
}

export function buildReleaseHistory({ sourceFile, outFile, currentVersion }) {
  const data = parseReleaseHistory(fs.readFileSync(sourceFile, 'utf8'));
  const html = releaseHistoryHtml(data, { currentVersion });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  return html;
}

const invokedAsScript =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const sourceAt = process.argv.indexOf('--source');
  const outAt = process.argv.indexOf('--out');
  const currentAt = process.argv.indexOf('--current-version');
  const sourceFile = sourceAt < 0 ? undefined : process.argv[sourceAt + 1];
  const outFile = outAt < 0 ? undefined : process.argv[outAt + 1];
  const currentVersion = currentAt < 0 ? undefined : process.argv[currentAt + 1];
  if (sourceFile === undefined || outFile === undefined) {
    console.error(
      'usage: node tools/release/src/build-release-history.mjs --source <history.json> --out <index.html> [--current-version <version>]',
    );
    process.exit(2);
  }
  try {
    const html = buildReleaseHistory({
      sourceFile: path.resolve(sourceFile),
      outFile: path.resolve(outFile),
      currentVersion,
    });
    process.stdout.write(path.resolve(outFile) + ': ' + String(Buffer.byteLength(html)) + ' bytes\n');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
