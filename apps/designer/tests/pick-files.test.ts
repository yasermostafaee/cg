/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickFiles } from '../src/platform/pickFiles.js';

/**
 * B-020 — `pickFiles` must deliver a real selection RELIABLY (no intermittent
 * drop). The earlier freeze fix (D-069) added an UNCONDITIONAL 400ms window-focus
 * fallback that resolved `[]`. On a real selection the dialog's close fires `focus`
 * first; when that 400ms timer beat the slightly-later `change`, it resolved `[]`
 * and the picked files were dropped — so "adding an image fails most of the time".
 *
 * The host (Chrome 149) and the whole support matrix (Chromium 113+/Firefox 91+/
 * Safari 16.4+) fire the input `cancel` event, so cancellation is detected by
 * `cancel` ALONE and the racing focus fallback is gone — nothing pre-empts `change`.
 */

const fileNamed = (name: string): File => ({ name }) as unknown as File;

/**
 * Capture the detached `<input>` `pickFiles` creates (it's never appended to the
 * DOM) so the test can drive its `change`/`cancel`, and neutralise `click()` (jsdom
 * has no file dialog).
 */
function captureInputs(): { inputs: HTMLInputElement[]; restore: () => void } {
  const inputs: HTMLInputElement[] = [];
  const real = document.createElement.bind(document);
  const impl = (tag: string): HTMLElement => {
    const el = real(tag);
    if (tag === 'input') {
      const input = el as HTMLInputElement;
      input.click = (): void => undefined;
      inputs.push(input);
    }
    return el;
  };
  const spy = vi.spyOn(document, 'createElement').mockImplementation(impl as typeof real);
  return { inputs, restore: () => spy.mockRestore() };
}

function setFiles(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pickFiles cancel-detection (B-020)', () => {
  it('delivers a real selection even when window-focus fires first and change is late', async () => {
    // Fake timers so we can prove that elapsing well past the OLD 400ms fallback
    // window before `change` no longer drops the selection.
    vi.useFakeTimers();
    const { inputs, restore } = captureInputs();
    const p = pickFiles('image');
    const input = inputs[0]!;

    // The OS dialog closes after a pick: focus returns to the window, the browser
    // populates `input.files`, but `change` only arrives after a delay.
    window.dispatchEvent(new Event('focus'));
    setFiles(input, [fileNamed('photo.png')]);
    await vi.advanceTimersByTimeAsync(1000); // would have fired the old 400ms timer
    input.dispatchEvent(new Event('change'));

    await expect(p).resolves.toEqual([fileNamed('photo.png')]);
    restore();
  });

  it('multi-select delivers every picked file in order', async () => {
    const { inputs, restore } = captureInputs();
    const p = pickFiles('image');
    const input = inputs[0]!;
    setFiles(input, [fileNamed('a.png'), fileNamed('b.png'), fileNamed('c.png')]);
    input.dispatchEvent(new Event('change'));
    await expect(p).resolves.toEqual([fileNamed('a.png'), fileNamed('b.png'), fileNamed('c.png')]);
    restore();
  });

  it('cancelling resolves [] immediately via the cancel event (no hang, no focus timer)', async () => {
    const { inputs, restore } = captureInputs();
    const p = pickFiles('image');
    const input = inputs[0]!;
    input.dispatchEvent(new Event('cancel'));
    await expect(p).resolves.toEqual([]);
    restore();
  });

  it('window-focus alone never settles the promise — the racing focus timer is gone', async () => {
    // The root-cause lock: with no `change`/`cancel`, firing `focus` and elapsing far
    // past the old 400ms window must leave the promise PENDING (the old code resolved
    // [] here, dropping the selection). Catches any partial reintroduction of a timer.
    vi.useFakeTimers();
    const { inputs, restore } = captureInputs();
    const p = pickFiles('image');
    const input = inputs[0]!;
    let settledWith: readonly File[] | 'pending' = 'pending';
    void p.then((files) => {
      settledWith = files;
    });

    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.resolve(); // flush any pending microtask
    expect(settledWith).toBe('pending'); // nothing pre-empted the (never-arriving) change

    // Settle it via cancel so the test leaves no dangling promise.
    input.dispatchEvent(new Event('cancel'));
    await expect(p).resolves.toEqual([]);
    restore();
  });

  it('selecting succeeds on every open across repeated picks (no intermittent drop)', async () => {
    vi.useFakeTimers();
    const { inputs, restore } = captureInputs();
    for (let i = 0; i < 10; i++) {
      const p = pickFiles('image');
      const input = inputs[i]!;
      window.dispatchEvent(new Event('focus'));
      setFiles(input, [fileNamed(`img-${i}.png`)]);
      await vi.advanceTimersByTimeAsync(1000);
      input.dispatchEvent(new Event('change'));
      await expect(p).resolves.toEqual([fileNamed(`img-${i}.png`)]);
    }
    restore();
  });
});
