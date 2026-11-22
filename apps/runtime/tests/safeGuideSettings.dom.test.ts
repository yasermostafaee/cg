// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { DEFAULT_BROADCAST_GUIDE_PROFILE, type BroadcastGuideProfile } from '@cg/ui';
import { afterEach, expect, it, vi } from 'vitest';
import { SafeGuideSettings } from '../src/renderer/features/monitors/SafeGuideSettings.js';

afterEach(() => vi.unstubAllGlobals());

it('edits horizontal/vertical guides, names, percentages, visibility and aspect without accepting invalid positions', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let saved = DEFAULT_BROADCAST_GUIDE_PROFILE;
  function Host(): JSX.Element {
    const [profile, setProfile] = useState<BroadcastGuideProfile>(DEFAULT_BROADCAST_GUIDE_PROFILE);
    return createElement(SafeGuideSettings, {
      profile,
      onReset: () => {
        saved = DEFAULT_BROADCAST_GUIDE_PROFILE;
        setProfile(saved);
      },
      onChange: (next) => {
        saved = next;
        setProfile(next);
      },
    });
  }
  const button = (label: string): HTMLButtonElement => {
    const node = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (entry) => entry.getAttribute('aria-label') === label || entry.textContent === label,
    );
    if (node === undefined) throw new Error(`Missing ${label}`);
    return node;
  };
  const input = (label: string): HTMLInputElement => {
    const node = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    if (node === null) throw new Error(`Missing ${label}`);
    return node;
  };
  try {
    await act(async () => root.render(createElement(Host)));
    await act(async () => button('Safe area settings').click());
    expect(input('Frame color').labels?.item(0)?.textContent?.trim()).toBe('Frame color');
    expect(input('Frame color').labels?.item(0)?.control).toBe(input('Frame color'));
    expect(input('Guide color').labels?.item(0)?.textContent?.trim()).toBe('Named guide color');
    expect(input('Guide color').labels?.item(0)?.control).toBe(input('Guide color'));
    expect(
      [...document.querySelectorAll('[role="radio"]')].map((node) =>
        node.getAttribute('aria-label'),
      ),
    ).toEqual(['Auto', '16:9', '4:3', 'Custom 1 (3:4)']);
    await act(async () => button('4:3').click());
    expect(saved.aspect).toBe('4:3');
    await act(async () => Simulate.keyDown(button('4:3'), { key: 'ArrowLeft' }));
    expect(saved.aspect).toBe('16:9');
    expect(document.activeElement).toBe(button('16:9'));
    await act(async () => Simulate.keyDown(button('16:9'), { key: 'End' }));
    expect(saved.aspect).toBe('custom');
    expect(document.activeElement).toBe(button('Custom 1 (3:4)'));
    expect(saved.customAspect).toEqual({ width: 3, height: 4 });
    await act(async () => {
      const width = input('Custom aspect width');
      width.value = '۹';
      Simulate.change(width);
    });
    await act(async () => Simulate.blur(input('Custom aspect width')));
    await act(async () => {
      const height = input('Custom aspect height');
      height.value = '16';
      Simulate.change(height);
    });
    await act(async () => Simulate.keyDown(input('Custom aspect height'), { key: 'Enter' }));
    expect(saved.customAspect).toEqual({ width: 9, height: 16 });
    await act(async () => {
      const width = input('Custom aspect width');
      width.value = '0';
      Simulate.change(width);
    });
    expect(input('Custom aspect width').getAttribute('aria-invalid')).toBe('true');
    expect(saved.customAspect).toEqual({ width: 9, height: 16 });
    await act(async () => Simulate.blur(input('Custom aspect width')));
    expect(input('Custom aspect width').value).toBe('9');
    await act(async () => button('4:3').click());
    expect(saved.customAspect).toEqual({ width: 9, height: 16 });
    await act(async () => button('Custom 1 (9:16)').click());
    expect(saved.aspect).toBe('custom');
    expect(input('Custom aspect width').value).toBe('9');
    expect(input('Custom aspect height').value).toBe('16');
    await act(async () => button('Add horizontal guide').click());
    await act(async () => button('Add vertical guide').click());
    expect(saved.lines.map((line) => [line.axis, line.position, line.visible])).toEqual([
      ['y', 50, true],
      ['x', 50, true],
    ]);
    expect(input('Guide color').value).toBe('#ffffff');
    await act(async () => {
      const color = input('Guide color');
      color.value = '#22aaee';
      Simulate.change(color);
    });
    expect(saved.color).toBe('#22aaee');
    expect(input('Guide 2 color').value).toBe('#22aaee');
    await act(async () => {
      const color = input('Guide 2 color');
      color.value = '#ff6600';
      Simulate.change(color);
    });
    expect(saved.lines[1]?.color).toBe('#ff6600');
    await act(async () => button('Use guide color for guide 2').click());
    expect(saved.lines[1]).not.toHaveProperty('color');
    expect(input('Guide 2 color').value).toBe('#22aaee');
    await act(async () => {
      const name = input('Guide 1 name');
      name.value = 'زیرنویس';
      Simulate.change(name);
      const position = input('Guide 1 position percent');
      position.value = '۲۵٫۵';
      Simulate.change(position);
    });
    await act(async () => Simulate.blur(input('Guide 1 position percent')));
    expect(saved.lines[0]).toMatchObject({ name: 'زیرنویس', position: 25.5 });
    await act(async () => {
      const position = input('Guide 1 position percent');
      position.value = '101';
      Simulate.change(position);
    });
    expect(input('Guide 1 position percent').getAttribute('aria-invalid')).toBe('true');
    await act(async () => Simulate.blur(input('Guide 1 position percent')));
    expect(saved.lines[0]?.position).toBe(25.5);
    expect(input('Guide 1 position percent').value).toBe('25.5');
    await act(async () => input('Show guide 2').click());
    expect(saved.lines[1]?.visible).toBe(false);
    await act(async () => button('Remove guide 1').click());
    expect(saved.lines).toHaveLength(1);
    expect(saved.lines[0]?.axis).toBe('x');
    await act(async () => button('Close safe area settings').click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('keeps multiple custom frames independent with inherited and overridden border colors', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let saved = DEFAULT_BROADCAST_GUIDE_PROFILE;
  function Host(): JSX.Element {
    const [profile, setProfile] = useState<BroadcastGuideProfile>(DEFAULT_BROADCAST_GUIDE_PROFILE);
    return createElement(SafeGuideSettings, {
      profile,
      onReset: () => {
        saved = DEFAULT_BROADCAST_GUIDE_PROFILE;
        setProfile(saved);
      },
      onChange: (next) => {
        saved = next;
        setProfile(next);
      },
    });
  }
  const button = (label: string): HTMLButtonElement => {
    const node = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (entry) => entry.getAttribute('aria-label') === label,
    );
    if (node === undefined) throw new Error(`Missing ${label}`);
    return node;
  };
  const input = (label: string): HTMLInputElement => {
    const node = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    if (node === null) throw new Error(`Missing ${label}`);
    return node;
  };
  const color = async (label: string, value: string): Promise<void> => {
    await act(async () => {
      const field = input(label);
      field.value = value;
      Simulate.change(field);
    });
  };
  try {
    await act(async () => root.render(createElement(Host)));
    await act(async () => button('Safe area settings').click());
    await act(async () => button('4:3').click());
    // Editing another ratio never hides the already-visible Auto frame.
    expect(saved.frames?.find((frame) => frame.id === 'auto')?.visible).toBe(true);
    expect(saved.frames?.find((frame) => frame.id === '4:3')?.visible).toBe(false);
    await act(async () => document.querySelector<HTMLInputElement>('input[id$="-frame"]')?.click());
    await color('Frame color', '#22aaee');
    await color('90% Graphics color', '#ff6600');
    expect(saved.frames?.find((frame) => frame.id === '4:3')).toMatchObject({
      visible: true,
      color: '#22aaee',
    });
    expect(
      saved.frames
        ?.find((frame) => frame.id === '4:3')
        ?.borders.find((border) => border.percent === 90)?.color,
    ).toBe('#ff6600');
    await act(async () => button('Use frame color for 90% Graphics').click());
    expect(
      saved.frames
        ?.find((frame) => frame.id === '4:3')
        ?.borders.find((border) => border.percent === 90),
    ).not.toHaveProperty('color');
    await act(async () => button('Add custom safe area').click());
    const firstId = saved.activeFrameId;
    expect(firstId).toBeDefined();
    await color('Frame color', '#44dd66');
    await act(async () => {
      const field = input('Custom aspect width');
      field.value = '9';
      Simulate.change(field);
    });
    await act(async () => Simulate.blur(input('Custom aspect width')));
    await act(async () => {
      const field = input('Custom aspect height');
      field.value = '16';
      Simulate.change(field);
    });
    await act(async () => Simulate.blur(input('Custom aspect height')));
    await act(async () => button('Add custom safe area').click());
    const secondId = saved.activeFrameId;
    expect(secondId).not.toBe(firstId);
    expect(saved.frames?.find((frame) => frame.id === firstId)).toMatchObject({
      visible: true,
      color: '#44dd66',
      customAspect: { width: 9, height: 16 },
    });
    expect(saved.frames?.find((frame) => frame.id === secondId)).toMatchObject({
      visible: true,
      customAspect: { width: 3, height: 4 },
    });
    await act(async () => button('Remove custom safe area').click());
    expect(saved.frames?.some((frame) => frame.id === secondId)).toBe(false);
    expect(saved.frames?.some((frame) => frame.id === firstId)).toBe(true);
    expect(saved.aspect).toBe('auto');
    const findText = (text: string): HTMLButtonElement => {
      const match = [...document.querySelectorAll('button')].find(
        (node) => node.textContent?.trim() === text,
      );
      if (match === undefined) throw new Error(`Missing ${text}`);
      return match;
    };
    const beforeReset = saved;
    await act(async () => findText('Restore defaults…').click());
    expect(document.activeElement).toBe(findText('Cancel'));
    await act(async () => findText('Cancel').click());
    expect(saved).toBe(beforeReset);
    expect(document.activeElement).toBe(findText('Restore defaults…'));
    await act(async () => findText('Restore defaults…').click());
    await act(async () => findText('Restore defaults').click());
    expect(saved).toEqual(DEFAULT_BROADCAST_GUIDE_PROFILE);
    expect(button('Auto').getAttribute('aria-checked')).toBe('true');
    expect(button('4:3').getAttribute('aria-description')).toBe('Hidden in preview');
    expect(input('Frame color').value).toBe('#ffffff');
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
