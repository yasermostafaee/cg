/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '@cg/shared-schema';

const { designerStore } = await import('../src/renderer/state/store.js');
const { TransportBar } = await import('../src/renderer/features/shell/TransportBar.js');
const { registerCanvasPlayoutCommandReceiver } =
  await import('../src/renderer/features/canvas/canvasPlayoutCommands.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function scene(withNext = false): Scene {
  const sequence = {
    id: 'sequence-1',
    name: 'pages',
    type: 'sequence',
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 100, h: 100 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    operatorSteps: true,
    items: [{ id: 'item-1', kind: 'text', text: 'one' }],
  };
  return {
    schemaVersion: 1,
    id: withNext ? 'scene-with-next' : 'scene-linear',
    name: 'Preview transport',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'layer-1',
        name: 'Layer',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: withNext ? [sequence] : [],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z' },
  } as unknown as Scene;
}

let host: HTMLDivElement;
let root: Root;
let commands: string[];
let unregister: () => void;

const button = (name: string): HTMLButtonElement | null =>
  Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.getAttribute('aria-label') === name,
  ) ?? null;

function click(name: string): void {
  const target = button(name);
  expect(target, `${name} button`).not.toBeNull();
  act(() => target!.click());
}

function mount(nextScene: Scene): void {
  designerStore.setScene(nextScene, null);
  act(() => root.render(createElement(TransportBar, { scene: nextScene })));
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  commands = [];
  unregister = registerCanvasPlayoutCommandReceiver((command) => {
    commands.push(command);
    return true;
  });
});

afterEach(() => {
  act(() => root.unmount());
  unregister();
  host.remove();
  designerStore._reset();
  vi.unstubAllGlobals();
});

describe('D-199 — Canvas transport separates timeline and Rehearse preview', () => {
  it('keeps ordinary Play linear and uses the short authoring-loop tooltips', () => {
    mount(scene());
    const projectBefore = designerStore.get().scene;
    act(() => designerStore.setCurrentFrame(24));

    expect(button('Preview loop')?.title).toBe('Preview loop');
    expect(button('Ping-pong')?.title).toBe('Ping-pong');
    click('Play');

    expect(designerStore.get().timelinePlaybackMode).toBe('playhead');
    expect(designerStore.get().timelinePlaying).toBe(true);
    expect(designerStore.get().currentFrame).toBe(0);
    expect(designerStore.get().scene).toBe(projectBefore);
  });

  it('swaps authoring controls for Play / Next / Stop and routes lifecycle commands', () => {
    mount(scene(true));
    const projectBefore = designerStore.get().scene;
    click('Rehearse preview');
    commands = [];

    for (const hidden of [
      'Go to start',
      'Step back',
      'Step forward',
      'Preview loop',
      'Ping-pong',
    ]) {
      expect(button(hidden), hidden).toBeNull();
    }
    expect(button('Play')).not.toBeNull();
    expect(button('Next')?.disabled).toBe(false);
    expect(button('Stop')).not.toBeNull();

    click('Play');
    expect(designerStore.get().timelinePlaybackMode).toBe('lifecycle');
    expect(designerStore.get().timelinePlaying).toBe(true);
    expect(button('Play')?.disabled).toBe(true);
    act(() => designerStore.setCurrentFrame(24));

    click('Next');
    click('Stop');
    expect(commands).toEqual(['next', 'stop']);
    // Stop requests the coordinated Outro. Lifecycle mode stays selected while the synthetic
    // clock pauses; Canvas reflects real runtime frames until stop.end instead of snapping to zero.
    expect(designerStore.get().timelinePlaybackMode).toBe('lifecycle');
    expect(designerStore.get().timelinePlaying).toBe(false);
    // This fixture has no authored Out point, so its zero-length Outro settles at frameOut. The
    // important invariant is that Stop never resets the cursor to frameIn before stop.end.
    expect(designerStore.get().currentFrame).toBe(100);
    expect(button('Play')?.disabled).toBe(true);
    expect(designerStore.get().scene).toBe(projectBefore);

    act(() => designerStore.setTimelinePlayback(null, false));
    expect(designerStore.get().timelinePlaybackMode).toBeNull();
    expect(designerStore.get().timelinePlaying).toBe(false);

    click('Rehearse preview');
    expect(commands).toEqual(['next', 'stop', 'restore-authoring']);
    expect(button('Preview loop')).not.toBeNull();
    expect(designerStore.get().scene).toBe(projectBefore);
  });

  it('disables Next when the composition has no operator-step content', () => {
    mount(scene());
    click('Rehearse preview');
    expect(button('Next')?.disabled).toBe(true);
  });
});
