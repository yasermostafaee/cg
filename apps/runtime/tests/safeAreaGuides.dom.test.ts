// @vitest-environment jsdom
import { act, createElement, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FittedSafeAreaGuides } from '../src/renderer/features/monitors/SafeAreaGuides.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('reattaches guides after their ancestor picture remounts while visible and observes subsequent resize', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let width = 800;
  const observers: {
    callback: () => void;
    target: Element | null;
    disconnected: boolean;
  }[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly record;
      constructor(callback: () => void) {
        this.record = { callback, target: null as Element | null, disconnected: false };
        observers.push(this.record);
      }
      observe(target: Element): void {
        this.record.target = target;
      }
      disconnect(): void {
        this.record.disconnected = true;
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-picture') ? width : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-picture') ? 600 : 0;
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Host(): JSX.Element {
    const stage = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    const [populated, setPopulated] = useState(false);
    return createElement(
      'section',
      null,
      createElement('button', { onClick: () => setVisible(true) }, 'Show'),
      createElement('button', { onClick: () => setPopulated(true) }, 'Populate'),
      createElement(
        'div',
        { key: populated ? 'populated' : 'empty', ref: stage, 'data-picture': '' },
        visible && createElement(FittedSafeAreaGuides, { width: 1920, height: 1080, stage }),
      ),
    );
  }
  const click = async (name: string): Promise<void> => {
    const button = [...container.querySelectorAll('button')].find(
      (node) => node.textContent === name,
    );
    if (button === undefined) throw new Error(`Missing ${name}`);
    await act(async () => button.click());
  };
  const guide = (): SVGSVGElement | null => container.querySelector('[data-safe-area-guides]');
  try {
    await act(async () => root.render(createElement(Host)));
    await click('Show');
    expect(guide()?.getAttribute('width')).toBe('800');
    const first = observers[0];
    expect(first?.target).toBe(container.querySelector('[data-picture]'));
    await click('Populate');
    expect(guide()?.getAttribute('width')).toBe('800');
    expect(first?.disconnected).toBe(true);
    const latest = observers.at(-1);
    expect(latest).not.toBe(first);
    expect(latest?.target).toBe(container.querySelector('[data-picture]'));
    width = 400;
    await act(async () => latest?.callback());
    expect(guide()?.getAttribute('width')).toBe('400');
    expect(guide()?.getAttribute('height')).toBe('225');
  } finally {
    act(() => root.unmount());
    container.remove();
  }
  expect(observers.every((entry) => entry.disconnected)).toBe(true);
});
