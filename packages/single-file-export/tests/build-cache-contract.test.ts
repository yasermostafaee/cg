import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface TurboBuildTask {
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
}

interface TurboConfig {
  readonly tasks?: Readonly<Record<string, TurboBuildTask>>;
}

const turboConfig = JSON.parse(
  readFileSync(path.resolve(process.cwd(), '../../turbo.json'), 'utf8'),
) as TurboConfig;

describe('B-354 — generated build inputs survive a Turbo cache hit', () => {
  const build = turboConfig.tasks?.build;

  it('restores generated source files used by downstream TypeScript builds', () => {
    expect(build?.outputs).toContain('src/generated/**');
  });

  it('invalidates a cached build when its generator changes', () => {
    expect(build?.inputs).toContain('scripts/**');
  });
});
