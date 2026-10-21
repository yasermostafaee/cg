import { describe, expect, it } from 'vitest';
import { compositionPackageId } from '../src/index.js';

/** 🔴 `B-352` — one package id per composition, the same on every re-export. */

const PROJECT = '5c3c6424-3208-44e9-b235-2e9b4a23ef1b';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('🔴 B-352 — compositionPackageId', () => {
  it('two compositions of one project get two ids, neither the project’s', () => {
    const a = compositionPackageId(PROJECT, 'comp-1');
    const b = compositionPackageId(PROJECT, 'comp-2');
    expect(a).not.toBe(b);
    expect(a).not.toBe(PROJECT);
  });

  it('the same composition gets the same id every time', () => {
    expect(compositionPackageId(PROJECT, 'comp-1')).toBe(compositionPackageId(PROJECT, 'comp-1'));
  });

  it('a copy of the project (another project id) gets another id for the same composition', () => {
    expect(compositionPackageId('another-project', 'comp-1')).not.toBe(
      compositionPackageId(PROJECT, 'comp-1'),
    );
  });

  it('is shaped like a UUID — safe in a URL, a file name and an AMCP argument', () => {
    expect(compositionPackageId(PROJECT, 'comp-1')).toMatch(UUID);
    expect(compositionPackageId('a', 'b"c\\d')).toMatch(UUID);
  });

  it('cannot be confused by ids that share a joining character', () => {
    expect(compositionPackageId('a-b', 'c')).not.toBe(compositionPackageId('a', 'b-c'));
  });
});
