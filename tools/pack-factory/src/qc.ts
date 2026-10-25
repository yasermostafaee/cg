import * as http from 'node:http';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from '@playwright/test';
import type { BuiltTemplate } from './build.js';
import { PackFactoryError } from './errors.js';

export interface QcCapture {
  phase: 'intro' | 'hold' | 'out';
  path: string;
}

export interface TemplateQcResult {
  key: string;
  status: 'passed';
  captures: QcCapture[];
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
}

export async function runVisualQc(
  templates: readonly BuiltTemplate[],
  outputDirectory: string,
): Promise<TemplateQcResult[]> {
  const server = await startPackageServer(templates);
  const browser = await launchBrowser();
  const results: TemplateQcResult[] = [];
  try {
    for (const template of templates) {
      const context = await browser.newContext({
        viewport: {
          width: template.scene.resolution.width,
          height: template.scene.resolution.height,
        },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const errors = collectPageErrors(page);
      const captures: QcCapture[] = [];
      try {
        await page.goto(`${server.origin}/${template.key}/index.html`, {
          waitUntil: 'networkidle',
          timeout: 15_000,
        });
        await page.waitForFunction(
          () =>
            typeof (window as Window & { play?: unknown }).play === 'function' &&
            typeof (window as Window & { stop?: unknown }).stop === 'function',
          undefined,
          { timeout: 10_000 },
        );
        await page.evaluate((data) => {
          const target = window as unknown as Window & { play: (payload: string) => void };
          target.play(JSON.stringify(data));
        }, template.preview.data);
        await page.waitForFunction(
          () => !document.body.classList.contains('cg-pending'),
          undefined,
          {
            timeout: 5_000,
          },
        );

        await page.waitForTimeout(template.preview.introMs);
        captures.push(await capture(page, outputDirectory, template.key, 'intro'));
        await page.waitForTimeout(Math.max(0, template.preview.holdMs - template.preview.introMs));
        captures.push(await capture(page, outputDirectory, template.key, 'hold'));
        await page.evaluate(() => {
          (window as Window & { stop: () => void }).stop();
        });
        await page.waitForTimeout(template.preview.outMs);
        captures.push(await capture(page, outputDirectory, template.key, 'out'));
      } catch (error) {
        errors.pageErrors.push(error instanceof Error ? error.message : String(error));
      } finally {
        await context.close();
      }

      const allErrors = [...errors.consoleErrors, ...errors.pageErrors, ...errors.requestFailures];
      if (allErrors.length > 0) {
        throw new PackFactoryError(
          'visual-qc-failed',
          `Template "${template.key}" failed visual QC:\n${allErrors.join('\n')}`,
        );
      }
      results.push({ key: template.key, status: 'passed', captures, ...errors });
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return results;
}

async function launchBrowser(): Promise<Browser> {
  const requested = process.env['CG_PACK_FACTORY_BROWSER_CHANNEL'];
  if (requested !== undefined && requested !== '') {
    return chromium.launch({ headless: true, channel: requested });
  }
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Executable doesn't exist")) {
      throw error;
    }
    const localChannels = process.platform === 'win32' ? ['chrome', 'msedge'] : ['chrome'];
    for (const channel of localChannels) {
      try {
        return await chromium.launch({ headless: true, channel });
      } catch {
        // Try the next installed system channel. The original error is clearer
        // if none exists, so it is rethrown below.
      }
    }
    throw error;
  }
}

async function capture(
  page: Page,
  outputDirectory: string,
  key: string,
  phase: QcCapture['phase'],
): Promise<QcCapture> {
  const relativePath = `previews/${key}-${phase}.png`;
  await page.screenshot({
    path: path.join(outputDirectory, ...relativePath.split('/')),
    type: 'png',
    omitBackground: true,
    fullPage: false,
  });
  return { phase, path: relativePath };
}

function collectPageErrors(page: Page): Omit<TemplateQcResult, 'key' | 'status' | 'captures'> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    requestFailures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      requestFailures.push(`${String(response.status())} ${response.url()}`);
    }
  });
  return { consoleErrors, pageErrors, requestFailures };
}

async function startPackageServer(templates: readonly BuiltTemplate[]): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  const byKey = new Map(templates.map((template) => [template.key, template.files]));
  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/favicon.ico') {
        response.writeHead(204);
        response.end();
        return;
      }
      const segments = url.pathname
        .split('/')
        .filter(Boolean)
        .map((segment) => decodeURIComponent(segment));
      const key = segments.shift();
      const file = segments.join('/');
      const bytes = key === undefined ? undefined : byKey.get(key)?.get(file);
      if (bytes === undefined || file.includes('..')) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('not found');
        return;
      }
      response.writeHead(200, {
        'content-type': contentType(file),
        'cache-control': 'no-store',
      });
      response.end(Buffer.from(bytes));
    } catch {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('bad request');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}

function contentType(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.webm':
      return 'video/webm';
    case '.mp4':
      return 'video/mp4';
    case '.wav':
      return 'audio/wav';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}
