// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BROADCAST_GUIDE_PROFILE } from '@cg/ui';
import {
  createRuntimeSafeGuideStore,
  parseRuntimeSafeGuides,
  portableRuntimeSafeGuides,
  RUNTIME_SAFE_GUIDES_KEY,
} from '../src/renderer/features/monitors/safeGuidePreferences.js';

const profile = {
  ...DEFAULT_BROADCAST_GUIDE_PROFILE,
  color: '#22aaee',
  lines: [{ id: 'line', name: 'عنوان', axis: 'y' as const, position: 25, visible: true }],
};

describe('shared Runtime safe guide preferences', () => {
  it('reads existing v1 guide profiles with the same data and hidden visibility', () => {
    const storage = { getItem: () => JSON.stringify(profile), setItem: vi.fn() };
    const store = createRuntimeSafeGuideStore(() => storage);
    expect(store.getSnapshot()).toEqual({ profile, visible: false });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('publishes edits and visibility together to both consumers and restores saved preferences', () => {
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    const store = createRuntimeSafeGuideStore(() => storage);
    const pvw = vi.fn();
    const modal = vi.fn();
    const unsub = store.subscribe(pvw);
    store.subscribe(modal);
    store.setProfile(profile);
    expect(store.getSnapshot()).toEqual({ profile, visible: true });
    expect(pvw).toHaveBeenCalledTimes(1);
    expect(modal).toHaveBeenCalledTimes(1);
    const saved = portableRuntimeSafeGuides(store.getSnapshot());
    expect(JSON.parse(raw!)).toEqual({ ...profile, visible: true });
    store.setVisible(false);
    expect(modal).toHaveBeenCalledTimes(2);
    const parsed = parseRuntimeSafeGuides(saved);
    expect(parsed).not.toBeNull();
    store.restore(parsed!);
    expect(store.getSnapshot()).toEqual({ profile, visible: true });
    store.restore(parsed!);
    expect(modal).toHaveBeenCalledTimes(3);
    unsub();
    store.setVisible(false);
    expect(pvw).toHaveBeenCalledTimes(3);
    expect(createRuntimeSafeGuideStore(() => storage).getSnapshot()).toEqual({
      profile,
      visible: false,
    });
  });

  it('refreshes the same key across windows and remains editable if storage is denied', () => {
    let raw = JSON.stringify({ ...profile, visible: true });
    const store = createRuntimeSafeGuideStore(() => ({
      getItem: () => raw,
      setItem: () => {
        throw new Error('denied');
      },
    }));
    expect(store.getSnapshot().visible).toBe(true);
    raw = JSON.stringify({ ...profile, visible: false });
    store.refresh();
    expect(store.getSnapshot().visible).toBe(false);
    store.setVisible(true);
    expect(store.getSnapshot().visible).toBe(true);
    expect(RUNTIME_SAFE_GUIDES_KEY).toBe('cg.runtime.safe-guides.v1');
  });

  it('rejects malformed optional data without accepting a future profile version', () => {
    expect(parseRuntimeSafeGuides({ ...profile, visible: 'yes' })).toBeNull();
    expect(parseRuntimeSafeGuides({ ...profile, version: 2, visible: true })).toBeNull();
    const store = createRuntimeSafeGuideStore(() => ({ getItem: () => '{bad', setItem: vi.fn() }));
    expect(store.getSnapshot()).toEqual({
      profile: DEFAULT_BROADCAST_GUIDE_PROFILE,
      visible: false,
    });
  });
});
