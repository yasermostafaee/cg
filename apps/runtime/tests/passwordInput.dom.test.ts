// @vitest-environment jsdom
import { StrictMode, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/renderer/i18n/locale.js';
import { PasswordInput } from '../src/renderer/ui/PasswordInput.js';

/**
 * 🔴 `R-082` (`CONSOLE-POLISH-01` §7) — **THE SHARED PASSWORD FIELD.** Every password the console asks
 * for renders through `PasswordInput`: a `TextInput` with a show/hide control named by what it does.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  setLanguage('interface', 'en');
  setLanguage('feedback', 'en');
});

function Harness({ disabled }: { disabled: boolean }): JSX.Element {
  const [value, setValue] = useState('test-only-not-a-secret');
  return createElement(PasswordInput, {
    id: 'pw',
    value,
    onChange: setValue,
    disabled,
    'aria-label': 'Password',
  });
}

async function render(disabled = false): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(Harness, { disabled })));
  });
  return container;
}

const field = (c: HTMLElement): HTMLInputElement => c.querySelector('#pw') as HTMLInputElement;
const toggle = (c: HTMLElement): HTMLButtonElement =>
  c.querySelector('.cg-password__toggle') as HTMLButtonElement;

describe('R-082 — PasswordInput', () => {
  it('hides by default; the control shows it as text, and hides it again — named by what it will do', async () => {
    const c = await render();
    expect(field(c).type).toBe('password');
    expect(toggle(c).getAttribute('aria-label')).toBe('Show password');
    await act(async () => {
      toggle(c).click();
    });
    expect(field(c).type).toBe('text');
    expect(field(c).value, 'the value survives the switch').toBe('test-only-not-a-secret');
    expect(toggle(c).getAttribute('aria-label')).toBe('Hide password');
    await act(async () => {
      toggle(c).click();
    });
    expect(field(c).type).toBe('password');
    expect(toggle(c).getAttribute('aria-label')).toBe('Show password');
  });

  it('a password is a machine token: LTR whatever the page, and the shared field skin', async () => {
    const c = await render();
    expect(field(c).getAttribute('dir')).toBe('ltr');
    expect(field(c).classList.contains('cg-field')).toBe(true);
    // The toggle is a button, never a submit: Enter on it must not send a form.
    expect(toggle(c).getAttribute('type')).toBe('button');
  });

  it('localizes the tooltip and accessible action from the interface without resetting the field', async () => {
    setLanguage('feedback', 'ar');
    const c = await render();
    expect(toggle(c).title).toBe('Show password');
    expect(toggle(c).getAttribute('aria-label')).toBe('Show password');
    await act(async () => {
      setLanguage('interface', 'fa');
    });
    expect(toggle(c).title).toBe('نمایش رمز عبور');
    expect(toggle(c).getAttribute('aria-label')).toBe('نمایش رمز عبور');
    await act(async () => {
      toggle(c).click();
    });
    expect(field(c).type).toBe('text');
    expect(toggle(c).title).toBe('پنهان کردن رمز عبور');
    expect(toggle(c).getAttribute('aria-label')).toBe('پنهان کردن رمز عبور');

    await act(async () => {
      setLanguage('interface', 'ar');
      setLanguage('feedback', 'fa');
    });
    expect(toggle(c).title).toBe('إخفاء كلمة المرور');
    expect(toggle(c).getAttribute('aria-label')).toBe('إخفاء كلمة المرور');
    expect(field(c).value).toBe('test-only-not-a-secret');
    expect(field(c).type).toBe('text');
    expect(field(c).dir).toBe('ltr');
  });

  it('CONTROL — a disabled field disables its control', async () => {
    const c = await render(true);
    expect(field(c).disabled).toBe(true);
    expect(toggle(c).disabled).toBe(true);
  });
});
