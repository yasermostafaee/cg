import { createBridge, type BridgeHandle } from '@cg/caspar-bridge';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig } from '@cg/shared-ipc';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/runtime.js';

/**
 * 🔴 **ENTER AND THE BUTTON MUST DO THE SAME THING (owner, 2026-09-06, from the plant).**
 *
 * Reported: pressing the dialog's `Lock` BUTTON locks the console and closes the dialog,
 * which is right — but pressing ENTER locked the console and left the dialog OPEN, on top
 * of the lock screen.
 *
 * ── WHY THIS SPEC NEEDS A REAL BRIDGE, WHICH IS THE WHOLE POINT ─────────────
 *
 * It does not reproduce against the offline mock, in either the dev server or the built
 * bundle — all three were tried before this spec was written. The mechanism is a race with
 * socket latency:
 *
 *   1. Enter closes the prompt, so `Modal` unmounts;
 *   2. the focus trap's cleanup restores focus to the control that had it when the trap
 *      armed — the status bar's own `🔒 Lock…` button;
 *   3. the browser then runs the Enter keydown's DEFAULT ACTION, and Enter on a focused
 *      button is a CLICK — re-opening the prompt while the engage already in flight raises
 *      the lock screen behind it.
 *
 * Against the mock, `engage` resolves fast enough that the status bar has already swapped
 * that button for the `🔒 LOCKED` chip, so there is nothing left to click. A real bridge is
 * slower, the button is still mounted, and it fires.
 *
 * ⚠ **A race whose outcome depends on socket latency is exactly the kind that reaches the
 * plant and never the suite** — so this spec pays for a real bridge rather than asserting
 * the mechanism against a mock that cannot exhibit it. The DETERMINISTIC half (the handler
 * calls `preventDefault`) is asserted in `usePrompt.enter.dom.test.ts`, in milliseconds.
 */

let bridge: BridgeHandle | null = null;
let mock: MockHandle | null = null;

test.afterEach(async () => {
  await bridge?.close();
  await mock?.stop();
  bridge = null;
  mock = null;
});

const connection = (amcpPort: number): ConnectionConfig => ({
  servers: { A: { host: '127.0.0.1', amcpPort, oscPort: 0 } },
  strategy: 'mirror-sync',
  autoFailoverEnabled: false,
});

/** Every open dialog, by its accessible name. */
async function openDialogs(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"]')].map(
      (d) => d.getAttribute('aria-label') ?? '(unlabelled)',
    ),
  );
}

test('Enter locks and CLOSES the PIN dialog, exactly as the button does', async ({ page }) => {
  mock = await createMock({ amcpPort: 0, oscPort: 0, oscHost: '127.0.0.1', oscHz: 10 });
  bridge = await createBridge({ port: 0, connection: connection(mock.amcpPort) });
  const url = bridge.url;
  await page.addInitScript(
    ([u]) => {
      (window as unknown as { __CG_BRIDGE_URL__: string }).__CG_BRIDGE_URL__ = u as string;
    },
    [url],
  );
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Bridge link' })).not.toContainText('DISCONNECTED');

  await page.getByRole('button', { name: /Lock/ }).click();
  const field = page.getByLabel(/Lock PIN/);
  await field.fill('1234');
  await field.press('Enter');

  // The lock DID engage — Enter still submits; this is not a fix that disabled it.
  const lockScreen = page.getByRole('dialog', { name: 'Lock screen' });
  await expect(lockScreen).toBeVisible();

  /*
    ── the assertion that goes RED on the reported bug ────────────────────────

    Asserted as the FULL SET of open dialogs rather than "the prompt is hidden": the defect
    left a SECOND dialog stacked on the first, so the claim is about how many surfaces the
    operator is looking at, and naming them makes a failure say which one is the stray.
  */
  await expect.poll(() => openDialogs(page), { timeout: 5000 }).toEqual(['Lock screen']);

  // …and the console is genuinely locked, not merely showing a screen.
  await expect(page.getByText('RUNTIME LOCKED')).toBeVisible();
});
