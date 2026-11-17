// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  LiveInputCheckProvider,
  useInputCheckSurface,
  useLiveInputCheck,
} from '../src/renderer/features/monitors/liveInputCheckContext.js';
import { Modal } from '../src/renderer/ui/Modal.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';

vi.mock('../src/renderer/hooks/useLink.js', () => ({ useLink: () => 'live' }));
vi.mock('../src/renderer/hooks/useCanOperate.js', () => ({ useCanOperate: () => true }));
vi.mock('../src/renderer/hooks/useAuthSession.js', () => ({
  useAuthSession: () => ({ kind: 'signed-in' }),
}));

it('releases only the covered check and requires an explicit check when its modal returns', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const previous = window.cg;
  const start = vi
    .fn<RuntimeBridge['livePreview']['start']>()
    .mockImplementation(() => new Promise(() => undefined));
  const stop = vi.fn<RuntimeBridge['livePreview']['stop']>().mockResolvedValue({ ok: true });
  window.cg = { livePreview: { start, stop } } as unknown as RuntimeBridge;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Surface(): JSX.Element {
    const { inputCheck } = useInputCheckSurface(1);
    const control = useLiveInputCheck();
    return createElement('button', {
      'aria-label': 'Check studio',
      disabled: inputCheck === undefined,
      onClick: () =>
        inputCheck?.start({
          id: 'studio',
          name: 'Studio',
          origin: 'input',
          producer: { kind: 'ndi', source: 'Studio' },
        }),
      children: control?.check?.view.state ?? 'Idle',
    });
  }
  function View({ covered }: { covered: boolean }): JSX.Element {
    return createElement(LiveInputCheckProvider, {
      channel: 1,
      locked: false,
      children: createElement(
        Modal,
        { title: 'Parent', onClose: () => undefined, footer: null },
        createElement(Surface),
        covered
          ? createElement(Modal, {
              title: 'Picker',
              layer: 'sub',
              onClose: () => undefined,
              footer: null,
            })
          : null,
      ),
    });
  }
  const show = async (covered: boolean): Promise<void> => {
    await act(async () =>
      root.render(createElement(StrictMode, null, createElement(View, { covered }))),
    );
  };
  const check = () => document.querySelector<HTMLButtonElement>('[aria-label="Check studio"]')!;
  try {
    await show(false);
    await act(async () => check().click());
    expect(start).toHaveBeenCalledTimes(1);
    expect(check().textContent).toBe('connecting');
    await show(true);
    expect(check().disabled).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith({
      channel: 1,
      previewId: start.mock.calls[0]?.[0].previewId,
    });
    await show(false);
    expect(check().disabled).toBe(false);
    expect(check().textContent).toBe('Idle');
    expect(start).toHaveBeenCalledTimes(1);
    await act(async () => check().click());
    expect(start).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    window.cg = previous;
    vi.unstubAllGlobals();
  }
});
