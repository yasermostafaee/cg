// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKeyboardLanguage } from '../src/keyboardLanguage.js';

/**
 * `TEXT-DIGITS-01` — the ONE keyboard-language detector, fed from fake sources.
 *
 * The pinned fallback order: the desktop shell's answer (when it has one, `unknown` included) →
 * what the letters typed prove → `unknown`. Each source is driven here with its control beside it.
 */

let teardown: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<input id="box" /><button id="btn">b</button>';
});

afterEach(() => {
  teardown?.();
  teardown = null;
  vi.useRealTimers();
});

const key = (k: string, init: KeyboardEventInit = {}): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
};
const keyUp = (k: string, init: KeyboardEventInit = {}): void => {
  document.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, ...init }));
};
const focusBox = (): void => {
  const box = document.getElementById('box') as HTMLInputElement;
  box.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
};
const blurBox = (to: Element | null = null): void => {
  const box = document.getElementById('box') as HTMLInputElement;
  box.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: to }));
};
/** Let a resolved native answer land. */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe('with no desktop shell (the browser): the letters typed', () => {
  it('is unknown before anything is typed — never a guess', () => {
    const kb = createKeyboardLanguage();
    teardown = kb.attach(document);
    expect(kb.current()).toBe('unknown');
  });

  it('a Persian-only letter proves Persian; a Latin letter proves Latin', () => {
    const kb = createKeyboardLanguage();
    teardown = kb.attach(document);
    key('ک');
    expect(kb.current()).toBe('persian');
    key('q');
    expect(kb.current()).toBe('latin');
  });

  it('a shared Arabic-script letter keeps Persian and forgets Latin; digits change nothing', () => {
    const kb = createKeyboardLanguage();
    teardown = kb.attach(document);
    key('گ');
    key('س');
    key('1');
    expect(kb.current()).toBe('persian');
    key('a');
    key('س');
    expect(kb.current()).toBe('unknown');
  });

  it('Alt+Shift and Ctrl+Shift forget the letters — a switch, so what they proved no longer holds', () => {
    const kb = createKeyboardLanguage();
    teardown = kb.attach(document);
    key('ی');
    key('Alt', { altKey: true });
    key('Shift', { altKey: true, shiftKey: true });
    keyUp('Shift', { altKey: true });
    expect(kb.current()).toBe('unknown');

    key('ی');
    key('Shift', { shiftKey: true });
    key('Control', { ctrlKey: true, shiftKey: true });
    keyUp('Control', { shiftKey: true });
    expect(kb.current()).toBe('unknown');
  });

  it('a shortcut (Ctrl+Shift+Z) is not a switch, and its letter proves nothing (the control)', () => {
    const kb = createKeyboardLanguage();
    teardown = kb.attach(document);
    key('ی');
    key('Control', { ctrlKey: true });
    key('Shift', { ctrlKey: true, shiftKey: true });
    key('Z', { ctrlKey: true, shiftKey: true });
    keyUp('Shift', { ctrlKey: true });
    expect(kb.current()).toBe('persian');
  });

  it('leaving the window forgets the letters', () => {
    const kb = createKeyboardLanguage();
    teardown = kb.attach(document);
    key('پ');
    window.dispatchEvent(new Event('blur'));
    expect(kb.current()).toBe('unknown');
  });
});

describe('with the desktop shell: its answer wins', () => {
  it('the shell answer beats the letters, and its unknown is believed', async () => {
    let answer: unknown = 'persian';
    const kb = createKeyboardLanguage({ native: () => Promise.resolve(answer) });
    teardown = kb.attach(document);
    key('q'); // the letters would say latin
    await settle();
    expect(kb.current()).toBe('persian');
    answer = 'unknown';
    key('q');
    await settle();
    expect(kb.current()).toBe('unknown');
  });

  it('a switch is seen on the next key: latin, then persian', async () => {
    let answer = 'latin';
    const kb = createKeyboardLanguage({ native: () => Promise.resolve(answer) });
    teardown = kb.attach(document);
    key('1');
    await settle();
    expect(kb.current()).toBe('latin');
    answer = 'persian';
    key('Shift', { altKey: true }); // the switch's own keys ask again
    await settle();
    expect(kb.current()).toBe('persian');
  });

  it('a stranger answer reads unknown — the reply is data', async () => {
    const kb = createKeyboardLanguage({ native: () => Promise.resolve('fa') });
    await kb.refresh();
    expect(kb.current()).toBe('unknown');
  });

  it('a failing shell (an older install) falls back to the letters and is not asked again', async () => {
    const native = vi.fn(() => Promise.reject(new Error('not allowed')));
    const kb = createKeyboardLanguage({ native });
    teardown = kb.attach(document);
    key('ک');
    await settle();
    expect(kb.current()).toBe('persian');
    const calls = native.mock.calls.length;
    key('ی');
    focusBox();
    await vi.advanceTimersByTimeAsync(1000);
    expect(native.mock.calls.length).toBe(calls);
  });

  it('a slow answer never overwrites a newer one', async () => {
    const pending: ((v: string) => void)[] = [];
    const kb = createKeyboardLanguage({
      native: () => new Promise<string>((resolve) => pending.push(resolve)),
    });
    const first = kb.refresh();
    const second = kb.refresh();
    pending[1]?.('persian');
    await second;
    pending[0]?.('latin');
    await first;
    expect(kb.current()).toBe('persian');
  });

  it('is polled while a text box has focus, and not after it leaves', async () => {
    const native = vi.fn(() => Promise.resolve('latin'));
    const kb = createKeyboardLanguage({ native, pollMs: 100 });
    teardown = kb.attach(document);
    focusBox();
    const atFocus = native.mock.calls.length;
    await vi.advanceTimersByTimeAsync(350);
    expect(native.mock.calls.length).toBeGreaterThanOrEqual(atFocus + 3);
    blurBox(document.getElementById('btn'));
    const atBlur = native.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(native.mock.calls.length).toBe(atBlur);
  });

  it('focus moving between two text boxes keeps the poll going (the control)', async () => {
    document.body.innerHTML = '<input id="box" /><textarea id="area"></textarea>';
    const native = vi.fn(() => Promise.resolve('latin'));
    const kb = createKeyboardLanguage({ native, pollMs: 100 });
    teardown = kb.attach(document);
    focusBox();
    blurBox(document.getElementById('area'));
    const before = native.mock.calls.length;
    await vi.advanceTimersByTimeAsync(250);
    expect(native.mock.calls.length).toBeGreaterThan(before);
  });

  it('a focus that is not a text box starts no poll', async () => {
    const native = vi.fn(() => Promise.resolve('latin'));
    const kb = createKeyboardLanguage({ native, pollMs: 100 });
    teardown = kb.attach(document);
    document.getElementById('btn')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    expect(native).not.toHaveBeenCalled();
  });

  it('returning to the window asks again', async () => {
    const native = vi.fn(() => Promise.resolve('persian'));
    const kb = createKeyboardLanguage({ native });
    teardown = kb.attach(document);
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(native).toHaveBeenCalledTimes(1);
    expect(kb.current()).toBe('persian');
  });

  it('the teardown removes every listener (the control: nothing answers after it)', async () => {
    const native = vi.fn(() => Promise.resolve('persian'));
    const kb = createKeyboardLanguage({ native, pollMs: 100 });
    const stop = kb.attach(document);
    focusBox();
    stop();
    const after = native.mock.calls.length;
    key('ک');
    focusBox();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(500);
    expect(native.mock.calls.length).toBe(after);
  });
});

describe('what counts as a text box', () => {
  it('an input, a textarea and a contenteditable start the poll; a checkbox does not', async () => {
    document.body.innerHTML =
      '<textarea id="a"></textarea><div id="c" contenteditable="true"></div><input id="k" type="checkbox" />';
    const c = document.getElementById('c') as HTMLElement;
    // jsdom does not compute isContentEditable from the attribute.
    Object.defineProperty(c, 'isContentEditable', { value: true });
    for (const id of ['a', 'c']) {
      const native = vi.fn(() => Promise.resolve('latin'));
      const kb = createKeyboardLanguage({ native, pollMs: 100 });
      const stop = kb.attach(document);
      document.getElementById(id)?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
      expect(native.mock.calls.length, id).toBeGreaterThan(1);
      stop();
    }
    const native = vi.fn(() => Promise.resolve('latin'));
    const kb = createKeyboardLanguage({ native, pollMs: 100 });
    teardown = kb.attach(document);
    document.getElementById('k')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    expect(native).not.toHaveBeenCalled();
  });
});
