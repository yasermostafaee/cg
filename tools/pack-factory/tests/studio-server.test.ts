import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startStudioServer, type RunningStudioServer } from '../src/studio-server.js';
import { createFactoryFixture, type FactoryFixture } from './fixtures.js';

const fixtures: FactoryFixture[] = [];
const servers: RunningStudioServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe('Brand Pack Studio server', () => {
  it('serves the browser app on loopback and persists a customer through the JSON API', async () => {
    const fixture = await createFactoryFixture();
    fixtures.push(fixture);
    const server = await startStudioServer({
      port: 0,
      workspace: path.join(fixture.root, 'studio'),
      staticRoot: path.resolve('dist/studio'),
    });
    servers.push(server);

    const page = await fetch(server.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('APASAI Brand Pack Studio');

    const brandKit = JSON.parse(await fs.readFile(fixture.brandKitPath, 'utf8')) as unknown;
    const recipe = JSON.parse(await fs.readFile(fixture.recipePath, 'utf8')) as unknown;
    const saved = await fetch(`${server.url}/api/customers/example-station`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandKit, recipe }),
    });
    expect(saved.status).toBe(200);

    const state = (await (await fetch(`${server.url}/api/state`)).json()) as {
      customers: { id: string }[];
    };
    expect(state.customers).toEqual([expect.objectContaining({ id: 'example-station' })]);
  });

  it('refuses a non-loopback Host header before serving workspace data', async () => {
    const fixture = await createFactoryFixture();
    fixtures.push(fixture);
    const server = await startStudioServer({
      port: 0,
      workspace: path.join(fixture.root, 'studio'),
      staticRoot: path.resolve('dist/studio'),
    });
    servers.push(server);

    const result = await requestWithHost(server.port, 'studio.example.test');
    expect(result.status).toBe(403);
    expect(result.body).toContain('local-only');
  });
});

async function requestWithHost(
  port: number,
  host: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: '127.0.0.1', port, path: '/api/state', headers: { Host: host } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });
}
