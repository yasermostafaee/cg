import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface Capability {
  readonly permissions: readonly unknown[];
}

function declaredCommands(app: 'designer' | 'runtime'): string[] {
  const source = fs.readFileSync(path.join(ROOT, 'apps', app, 'src-tauri', 'build.rs'), 'utf8');
  const body = source.match(/AppManifest::new\(\)\.commands\(&\[(?<body>[\s\S]*?)\]\)/)?.groups
    ?.body;
  if (body === undefined) throw new Error(`${app} build.rs has no Tauri command manifest`);
  return [...body.matchAll(/"([a-z][a-z0-9_]*)"/g)]
    .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
    .sort();
}

function grantedCommands(app: 'designer' | 'runtime', capabilityName: string): string[] {
  const capability = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'apps', app, 'src-tauri', 'capabilities', `${capabilityName}.json`),
      'utf8',
    ),
  ) as Capability;
  return capability.permissions
    .filter(
      (permission): permission is string =>
        typeof permission === 'string' && permission.startsWith('allow-'),
    )
    .map((permission) => permission.slice('allow-'.length).replaceAll('-', '_'))
    .sort();
}

describe.each([
  { app: 'designer' as const, capability: 'designer' },
  { app: 'runtime' as const, capability: 'console' },
])('$app desktop command capability', ({ app, capability }) => {
  it('grants exactly the custom commands declared by its Tauri build manifest', () => {
    expect(grantedCommands(app, capability)).toEqual(declaredCommands(app));
  });
});
