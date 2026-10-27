/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SHIPPED_DELIMITERS } from '@cg/shared-ipc';
import {
  __resetDesignerDelimitersForTest,
  addDesignerDelimiter,
  DESIGNER_DELIMITERS_STORAGE_KEY,
  listDesignerDelimiters,
  removeDesignerDelimiter,
  resetDesignerDelimiters,
  updateDesignerDelimiter,
} from '../src/renderer/features/settings/designerDelimiterStore.js';

let memory = new Map<string, string>();

beforeEach(() => {
  memory = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
  });
});

afterEach(() => __resetDesignerDelimitersForTest());

describe('R-102 — Designer delimiter catalogue', () => {
  it('starts from the shared shipped list and persists custom choices locally', () => {
    expect(listDesignerDelimiters()).toEqual(SHIPPED_DELIMITERS);
    expect(addDesignerDelimiter('double colon', '::')).toBeNull();
    expect(listDesignerDelimiters()).toContainEqual(
      expect.objectContaining({ label: 'double colon', value: '::' }),
    );

    __resetDesignerDelimitersForTest(false);
    expect(listDesignerDelimiters()).toContainEqual(
      expect.objectContaining({ label: 'double colon', value: '::' }),
    );
  });

  it('adds, edits and removes by stable id while refusing duplicate values', () => {
    expect(addDesignerDelimiter('tab', '\\t')).toBeNull();
    expect(addDesignerDelimiter('another tab', '\\t')).toContain('already');
    const custom = listDesignerDelimiters().find((option) => option.value === '\\t');
    if (custom === undefined) throw new Error('custom delimiter missing');

    expect(updateDesignerDelimiter(custom.id, 'three stars', '***')).toBeNull();
    expect(listDesignerDelimiters()).toContainEqual({
      id: custom.id,
      label: 'three stars',
      value: '***',
    });
    expect(removeDesignerDelimiter(custom.id)).toBeNull();
    expect(listDesignerDelimiters().some((option) => option.id === custom.id)).toBe(false);
  });

  it('recovers from damaged storage and reset restores current shipped defaults', () => {
    window.localStorage.setItem(DESIGNER_DELIMITERS_STORAGE_KEY, '{broken');
    __resetDesignerDelimitersForTest(false);
    expect(listDesignerDelimiters()).toEqual(SHIPPED_DELIMITERS);

    expect(addDesignerDelimiter('slash', '/')).toBeNull();
    resetDesignerDelimiters();
    expect(listDesignerDelimiters()).toEqual(SHIPPED_DELIMITERS);
  });
});
