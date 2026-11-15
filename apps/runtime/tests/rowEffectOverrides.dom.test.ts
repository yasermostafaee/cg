// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ControlLiveLayoutSchema, type StackItemState } from '@cg/shared-schema';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { FrameEffectControls } from '../src/renderer/features/inspector/FrameEffectControls.js';
import { InputEffectControls } from '../src/renderer/features/inspector/InputEffectControls.js';
import { applyDraft } from '../src/renderer/features/inspector/applyDraft.js';
import {
  __resetDraftsForTest,
  stageLookBinding,
} from '../src/renderer/features/inspector/draftStore.js';
import { effectiveLayoutEffects } from '../src/renderer/features/inspector/frameTransitionPreference.js';
import { setRowEffectOverrides } from '../src/renderer/features/inspector/rowEffectOverrides.js';

const layout = ControlLiveLayoutSchema.parse({
  id: 'layout-1',
  name: 'Interview',
  resolution: { width: 1920, height: 1080 },
  frameRate: 25,
  frames: [{ id: 'guest-1', sourceId: 'src-a', title: 'Host' }],
  presets: [
    {
      id: 'solo',
      name: 'Solo',
      frameIds: ['guest-1'],
      arrangement: 'side-by-side',
      horizontalGap: 0,
      verticalGap: 0,
      reverse: false,
      hiddenTitles: [],
      hiddenFocusTitles: [],
    },
  ],
  defaultPresetId: 'solo',
  background: { kind: 'color', color: '#123456' },
  effects: {
    focus: { motion: 'ease-in-out', fade: false, durationMs: 400 },
    switch: { mode: 'fade', durationMs: 600, direction: 'left' },
  },
});

const item: StackItemState = {
  itemId: 'item-1',
  templateId: layout.id,
  status: 'on-air',
  pending: false,
  fields: {},
};

afterEach(() => {
  __resetDraftsForTest();
  setRowEffectOverrides(item.itemId, { input: undefined, preset: undefined });
  vi.unstubAllGlobals();
});

it('applies the Inspector input and preset choices to one row while retaining its layout defaults', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const update = vi.fn<RuntimeBridge['stack']['update']>().mockResolvedValue({ accepted: true });
  Object.assign(window, { cg: { stack: { update } } });
  const template = { fields: [], controlLiveLayout: layout };
  const applySource = async (source: string) => {
    stageLookBinding(item.itemId, 'solo', 'guest-1', source);
    await expect(applyDraft(item, undefined, template)).resolves.toMatchObject({ accepted: true });
    return update.mock.lastCall?.[0];
  };

  function select(element: HTMLSelectElement, value: string): void {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  try {
    await act(() =>
      root.render(
        createElement(
          'div',
          null,
          createElement(InputEffectControls, { itemId: item.itemId, layout }),
          createElement(FrameEffectControls, {
            label: 'Preset effect',
            disabled: false,
            preset: { itemId: item.itemId, value: layout.effects.focus },
          }),
        ),
      ),
    );
    const input = host.querySelector<HTMLSelectElement>('[aria-label="Input transition"]')!;
    const preset = host.querySelector<HTMLSelectElement>('fieldset:nth-child(2) select')!;
    expect(input.selectedOptions[0]?.text).toBe('Layout default (Fade)');
    expect(preset.selectedOptions[0]?.text).toBe('Layout default (Ease in/out)');
    expect(await applySource('src-b')).toMatchObject({
      lookBindings: { solo: { 'guest-1': 'src-b' } },
      inputTransition: { mode: 'fade', durationMs: 600 },
    });

    await act(() => {
      select(input, 'cut');
      select(preset, 'linear');
    });
    expect(await applySource('src-c')).toMatchObject({
      inputTransition: { mode: 'cut', durationMs: 600 },
    });
    expect(effectiveLayoutEffects(item.itemId, layout)).toMatchObject({
      focus: { motion: 'linear', durationMs: 400 },
      switch: { mode: 'cut', durationMs: 600 },
    });
    expect(effectiveLayoutEffects('another-row', layout)).toEqual(layout.effects);
    expect(window.localStorage.getItem('cg.runtime.row-effects.v1')).toContain(
      '"input":{"mode":"cut"',
    );

    await act(() => {
      select(input, 'default');
      select(preset, 'default');
    });
    expect(effectiveLayoutEffects(item.itemId, layout)).toEqual(layout.effects);
    expect(await applySource('src-d')).toMatchObject({ inputTransition: { mode: 'fade' } });
  } finally {
    await act(() => root.unmount());
  }
});
