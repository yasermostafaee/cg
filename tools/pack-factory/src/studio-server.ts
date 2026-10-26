import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePack, type PreparedPack } from './build.js';
import { writeDelivery, type DeliveryOptions } from './delivery.js';
import { PackFactoryError } from './errors.js';
import { inspectStudioMaster } from './studio-inspect.js';
import {
  defaultStudioWorkspace,
  listStudioCustomers,
  listStudioDeliveries,
  nextStudioDeliveryPath,
  openStudioWorkspace,
  readStudioCustomer,
  resolveStudioDeliveryFile,
  saveStudioCustomer,
  type StudioWorkspace,
} from './studio-workspace.js';

const DEFAULT_PORT = 4319;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_STATIC_ROOT = fileURLToPath(new URL('./studio', import.meta.url));

type PreparePack = typeof preparePack;
type WriteDelivery = (
  pack: PreparedPack,
  options: DeliveryOptions,
) => ReturnType<typeof writeDelivery>;

export interface StudioServerOptions {
  port?: number;
  workspace?: string;
  staticRoot?: string;
  repositoryRoot?: string;
  preparePackImpl?: PreparePack;
  writeDeliveryImpl?: WriteDelivery;
}

export interface RunningStudioServer {
  url: string;
  port: number;
  workspace: StudioWorkspace;
  close: () => Promise<void>;
}

export async function startStudioServer(
  options: StudioServerOptions = {},
): Promise<RunningStudioServer> {
  const port = options.port ?? DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new PackFactoryError('invalid-port', 'Studio port must be an integer from 1 to 65535');
  }
  const workspace = await openStudioWorkspace(
    options.workspace ?? defaultStudioWorkspace(),
    options.repositoryRoot,
  );
  const context: StudioContext = {
    workspace,
    staticRoot: options.staticRoot ?? DEFAULT_STATIC_ROOT,
    prepare: options.preparePackImpl ?? preparePack,
    deliver: options.writeDeliveryImpl ?? writeDelivery,
    building: new Set<string>(),
  };
  const server = http.createServer((request, response) => {
    void handleRequest(context, request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new PackFactoryError('studio-listen-failed', 'Studio did not receive a TCP port');
  }
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    port: address.port,
    workspace,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}

export async function runStudioUntilSignal(options: StudioServerOptions = {}): Promise<void> {
  const studio = await startStudioServer(options);
  process.stdout.write(`Brand Pack Studio: ${studio.url}\n`);
  process.stdout.write(`Workspace: ${studio.workspace.root}\n`);
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      void studio.close().finally(resolve);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

interface StudioContext {
  workspace: StudioWorkspace;
  staticRoot: string;
  prepare: PreparePack;
  deliver: WriteDelivery;
  building: Set<string>;
}

async function handleRequest(
  context: StudioContext,
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  setSecurityHeaders(response);
  try {
    if (!isLoopbackHost(request.headers.host)) {
      sendJson(response, 403, { error: { code: 'local-only', message: 'Local access only' } });
      return;
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      await handleApi(context, request, response, url.pathname);
      return;
    }
    if (url.pathname.startsWith('/delivery/')) {
      await serveDelivery(context, response, url.pathname);
      return;
    }
    await serveStudioAsset(context.staticRoot, response, url.pathname);
  } catch (error) {
    sendError(response, error);
  }
}

async function handleApi(
  context: StudioContext,
  request: http.IncomingMessage,
  response: http.ServerResponse,
  pathname: string,
): Promise<void> {
  if (request.method === 'GET' && pathname === '/api/state') {
    sendJson(response, 200, {
      workspace: context.workspace.root,
      customers: await listStudioCustomers(context.workspace),
    });
    return;
  }

  const match = /^\/api\/customers\/([^/]+)(?:\/(inspect|validate|build|deliveries))?$/.exec(
    pathname,
  );
  if (match === null) {
    sendJson(response, 404, { error: { code: 'not-found', message: 'API route not found' } });
    return;
  }
  const customerId = decodeURIComponent(match[1] ?? '');
  const action = match[2];

  if (request.method === 'GET' && action === undefined) {
    const customer = await readStudioCustomer(context.workspace, customerId);
    sendJson(response, 200, {
      brandKit: customer.brandKit,
      recipe: customer.recipe,
      deliveries: await listStudioDeliveries(context.workspace, customerId),
    });
    return;
  }
  if (request.method === 'PUT' && action === undefined) {
    const body = asRecord(await readJsonBody(request));
    const customer = await saveStudioCustomer(context.workspace, customerId, {
      brandKit: body['brandKit'],
      recipe: body['recipe'],
    });
    sendJson(response, 200, {
      brandKit: customer.brandKit,
      recipe: customer.recipe,
      deliveries: await listStudioDeliveries(context.workspace, customerId),
    });
    return;
  }
  if (request.method === 'GET' && action === 'deliveries') {
    sendJson(response, 200, {
      deliveries: await listStudioDeliveries(context.workspace, customerId),
    });
    return;
  }
  if (request.method === 'POST' && action === 'inspect') {
    const customer = await readStudioCustomer(context.workspace, customerId);
    const body = asRecord(await readJsonBody(request));
    const declared = body['sourceProject'];
    if (typeof declared !== 'string' || declared.trim() === '') {
      throw new PackFactoryError('invalid-master', 'sourceProject is required');
    }
    const source = path.isAbsolute(declared)
      ? declared
      : path.resolve(path.dirname(customer.recipePath), declared);
    sendJson(response, 200, { inspection: await inspectStudioMaster(source) });
    return;
  }
  if (request.method === 'POST' && action === 'validate') {
    const customer = await readStudioCustomer(context.workspace, customerId);
    const pack = await context.prepare({
      brandKitPath: customer.brandKitPath,
      recipePath: customer.recipePath,
    });
    sendJson(response, 200, {
      status: 'valid',
      templates: pack.templates.map((template) => ({
        key: template.key,
        id: template.manifest.id,
        sha256: template.sha256,
        outputName: template.outputName,
      })),
    });
    return;
  }
  if (request.method === 'POST' && action === 'build') {
    if (context.building.has(customerId)) {
      throw new PackFactoryError(
        'build-in-progress',
        'A build is already running for this customer',
      );
    }
    context.building.add(customerId);
    try {
      const customer = await readStudioCustomer(context.workspace, customerId);
      const pack = await context.prepare({
        brandKitPath: customer.brandKitPath,
        recipePath: customer.recipePath,
      });
      const outputDirectory = await nextStudioDeliveryPath(context.workspace, customerId);
      const delivery = await context.deliver(pack, {
        outputDirectory,
        preview: true,
        force: false,
      });
      sendJson(response, 200, {
        status: delivery.report.status,
        delivery: path.basename(delivery.outputDirectory),
        deliveries: await listStudioDeliveries(context.workspace, customerId),
      });
    } finally {
      context.building.delete(customerId);
    }
    return;
  }

  sendJson(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed' } });
}

async function serveDelivery(
  context: StudioContext,
  response: http.ServerResponse,
  pathname: string,
): Promise<void> {
  const match = /^\/delivery\/([^/]+)\/([^/]+)\/(.+)$/.exec(pathname);
  if (match === null) {
    sendJson(response, 404, { error: { code: 'not-found', message: 'Delivery file not found' } });
    return;
  }
  const file = await resolveStudioDeliveryFile(
    context.workspace,
    decodeURIComponent(match[1] ?? ''),
    decodeURIComponent(match[2] ?? ''),
    decodeURIComponent(match[3] ?? ''),
  );
  await sendFile(response, file, false);
}

async function serveStudioAsset(
  staticRoot: string,
  response: http.ServerResponse,
  pathname: string,
): Promise<void> {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const candidate = path.resolve(staticRoot, relative);
  if (!isChildPath(staticRoot, candidate)) {
    sendJson(response, 404, { error: { code: 'not-found', message: 'Asset not found' } });
    return;
  }
  await sendFile(response, candidate, relative !== 'index.html');
}

async function sendFile(
  response: http.ServerResponse,
  file: string,
  cache: boolean,
): Promise<void> {
  let bytes;
  try {
    bytes = await fs.readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      sendJson(response, 404, { error: { code: 'not-found', message: 'File not found' } });
      return;
    }
    throw error;
  }
  response.statusCode = 200;
  response.setHeader('Content-Type', contentType(file));
  response.setHeader('Cache-Control', cache ? 'public, max-age=31536000, immutable' : 'no-store');
  response.end(bytes);
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) {
      throw new PackFactoryError('body-too-large', 'Request body exceeds 2 MiB');
    }
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new PackFactoryError('invalid-json', 'Request body must be valid JSON');
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PackFactoryError('invalid-request', 'Request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) return;
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(`${JSON.stringify(body)}\n`);
}

function sendError(response: http.ServerResponse, error: unknown): void {
  const code = error instanceof PackFactoryError ? error.code : 'unexpected-error';
  const status =
    code === 'unexpected-error'
      ? 500
      : code === 'build-in-progress'
        ? 409
        : code.includes('missing') || code === 'not-found'
          ? 404
          : 400;
  sendJson(response, status, {
    error: { code, message: error instanceof Error ? error.message : String(error) },
  });
}

function setSecurityHeaders(response: http.ServerResponse): void {
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
}

function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (hostHeader === undefined) return false;
  try {
    const hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

function isChildPath(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
  );
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
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.md':
      return 'text/markdown; charset=utf-8';
    case '.vcg':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}
