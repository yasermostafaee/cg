import { afterEach, describe, expect, it } from 'vitest';
import { designerStore } from '../src/renderer/state/store.js';

afterEach(() => {
  designerStore._reset();
});

describe('designerStore', () => {
  it('starts with a null scene and the cursor tool', () => {
    expect(designerStore.get()).toMatchObject({
      scene: null,
      projectPath: null,
      tool: 'cursor',
    });
  });

  it('setScene + setTool update state and notify subscribers', () => {
    const events: { tool: string; scene: unknown }[] = [];
    const unsubscribe = designerStore.subscribe((s) => {
      events.push({ tool: s.tool, scene: s.scene });
    });
    designerStore.setTool('text');
    designerStore.setScene({ id: 'x' } as never, '/p.json');
    expect(designerStore.get().tool).toBe('text');
    expect(designerStore.get().scene).toMatchObject({ id: 'x' });
    expect(designerStore.get().projectPath).toBe('/p.json');
    expect(events).toHaveLength(2);
    unsubscribe();
  });

  it('subscribe returns an unsubscribe that stops further notifications', () => {
    let calls = 0;
    const unsubscribe = designerStore.subscribe(() => calls++);
    designerStore.setTool('text');
    expect(calls).toBe(1);
    unsubscribe();
    designerStore.setTool('shape');
    expect(calls).toBe(1);
  });
});
