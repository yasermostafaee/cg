/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { readCgControl, withCgControl, type FieldValues, type Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { isSoundMuted, setSoundMuted } from '../src/audio-graph.js';

/**
 * 🔴 `RUN-NEXT-VERSION-02` Q9 — **A ROW'S TEMPLATE-SOUND MUTE REACHES THE PAGE'S HOST MUTE**, on both
 * doors a payload arrives through (`update` for an on-air row, `play` for a take's ADD). The page's
 * one switch is `setSoundMuted` — the master gain PVW and the Designer's preview already use — so a
 * sound already playing is silenced too. Absent means unchanged.
 */

afterEach(() => {
  setSoundMuted(false, document);
  document.body.innerHTML = '';
});

function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 'Azan',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children: [] },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z' },
  } as unknown as Scene;
}

const none = {} as FieldValues;

function runtime(): ReturnType<typeof createRuntime> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return createRuntime(scene(), { root: host, skipFontLoad: true });
}

describe('🔴 Q9 — __cg.sound', () => {
  it('reads defensively: a boolean muted, else nothing', () => {
    expect(readCgControl({ __cg: { sound: { muted: true } } })?.sound).toEqual({ muted: true });
    expect(readCgControl({ __cg: { sound: { muted: 'yes' } } })?.sound).toBeUndefined();
    expect(readCgControl({ __cg: { sound: true, take: 'abc' } })).toEqual({ take: 'abc' });
  });

  it('update() mutes and unmutes the page, an ordinary update leaves it as it is', async () => {
    const rt = runtime();
    await rt.play(none);
    expect(isSoundMuted(document)).toBe(false);
    await rt.update(withCgControl(none, { sound: { muted: true } }));
    expect(isSoundMuted(document)).toBe(true);
    await rt.update({ headline: 'x' } as unknown as FieldValues);
    expect(isSoundMuted(document), 'a payload with no sound member changed the mute').toBe(true);
    await rt.update(withCgControl(none, { sound: { muted: false } }));
    expect(isSoundMuted(document)).toBe(false);
  });

  it('play() — a take’s ADD payload — mutes before the entrance sounds start', async () => {
    const rt = runtime();
    await rt.play(withCgControl(none, { sound: { muted: true } }));
    expect(isSoundMuted(document)).toBe(true);
  });
});
