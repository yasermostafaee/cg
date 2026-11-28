// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controlLiveLayoutFocusLookId, type ControlLiveLayout } from '@cg/shared-schema';
import { ControlLayoutFocus } from '../src/renderer/features/liveLayouts/ControlLayoutFocus.js';
import { createControlLiveLayout } from '../src/renderer/features/liveLayouts/controlLiveLayoutCompiler.js';

function linkedLayout(): ControlLiveLayout {
  const original = createControlLiveLayout();
  const [first, second] = original.frames;
  const preset = original.presets[0]!;
  const base = { ...first!, id: 'camera' };
  const overlay = {
    ...second!,
    id: 'inset',
    overlay: { frameId: base.id, rect: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } },
  };
  const guest = { ...second!, id: 'guest' };
  return {
    ...original,
    frames: [base, overlay, guest],
    presets: [
      { ...preset, id: 'panel', name: 'Panel', frameIds: [base.id, guest.id] },
      { ...preset, id: 'camera-preset', name: 'Camera inset', frameIds: [base.id] },
      { ...preset, id: 'guest-preset', name: 'Guest', frameIds: [guest.id] },
    ],
    defaultPresetId: 'panel',
  };
}

describe.each(['Preview', 'Programme'] as const)('%s linked plate focus', (target) => {
  let container: HTMLDivElement;
  let root: Root;
  const layout = linkedLayout();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    container.remove();
  });

  const button = (name: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

  const plate = (number: number) => button(`Focus plate ${number} in ${target}`);

  async function render(current: string) {
    const onSelect = vi.fn();
    await act(() =>
      root.render(createElement(ControlLayoutFocus, { layout, current, target, onSelect })),
    );
    return onSelect;
  }

  it('offers only independent plates without changing their authored numbers', async () => {
    const onSelect = await render('panel');
    expect(plate(2)).toBeNull();
    expect(plate(1)?.disabled).toBe(false);
    expect(plate(3)?.disabled).toBe(false);
    plate(3)?.click();
    expect(onSelect).toHaveBeenCalledWith(controlLiveLayoutFocusLookId('panel', 'guest'));
  });

  it('allows Focus from a preset with only a base and its overlay', async () => {
    const onSelect = await render('camera-preset');
    expect(plate(1)?.disabled).toBe(false);
    expect(plate(2)).toBeNull();
    expect(plate(3)).toBeNull();
    plate(1)?.click();
    expect(onSelect).toHaveBeenCalledWith(controlLiveLayoutFocusLookId('camera-preset', 'camera'));
  });

  it('still offers Return when an older version left the overlay in Focus', async () => {
    const onSelect = await render(controlLiveLayoutFocusLookId('camera-preset', 'inset'));
    expect(plate(2)).toBeNull();
    expect(plate(1)?.disabled).toBe(false);
    expect(plate(3)?.disabled).toBe(false);
    button('Return to Camera inset')?.click();
    expect(onSelect).toHaveBeenCalledWith('camera-preset');
  });
});
