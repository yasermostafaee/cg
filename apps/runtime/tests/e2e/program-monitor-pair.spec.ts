import { expect, test, type Page } from '@playwright/test';
import type { PgmMeterReading, PgmReturnStatus } from '@cg/shared-ipc';

/**
 * `R-104` — the shipped PROGRAM UI with a paired station: independent A/B pictures, one explicit
 * sound/meter source, and the honest reserve placeholder when the channel has no backup mapping.
 */

interface ProgramMonitorSeed {
  readonly backupChannel: number | null;
  readonly currentPrimary?: 'A' | 'B';
  readonly statuses?: readonly PgmReturnStatus[];
  readonly readings?: readonly PgmMeterReading[];
}

async function open(page: Page, seed: ProgramMonitorSeed): Promise<void> {
  await page.addInitScript((value: ProgramMonitorSeed) => {
    const w = window as unknown as {
      CG_E2E: boolean;
      CG_E2E_FIXED_BANK: boolean;
      CG_E2E_PROGRAM_MONITOR: ProgramMonitorSeed;
      __CG_SPLASH_DISABLED__: boolean;
      __CG_BRIDGE_URL__: string;
    };
    w.CG_E2E = true;
    w.CG_E2E_FIXED_BANK = true;
    w.CG_E2E_PROGRAM_MONITOR = value;
    w.__CG_SPLASH_DISABLED__ = true;
    w.__CG_BRIDGE_URL__ = 'ws://127.0.0.1:1';
  }, seed);
  await page.goto('/');
  const show = page.getByRole('button', { name: 'Show monitors' });
  if (await show.count()) await show.click();
}

test('A+B keeps physical labels through a B-primary state, shows one stalled feed, and binds one meter source', async ({
  page,
}) => {
  await open(page, {
    backupChannel: 2,
    currentPrimary: 'B',
    statuses: [
      { engine: 'A', channel: 1, state: 'stalled' },
      { engine: 'B', channel: 1, state: 'live' },
    ],
    readings: [
      { kind: 'audio', engine: 'A', channel: 1, dbfs: [-30, -30] },
      { kind: 'audio', engine: 'B', channel: 1, dbfs: [-12, -9] },
      {
        kind: 'loudness',
        engine: 'B',
        channel: 1,
        momentary: -22.8,
        shortterm: -23.1,
        limiterGrDb: 0,
      },
    ],
  });

  await page.getByRole('button', { name: 'A+B', exact: true }).click();
  const pictures = page.locator('[data-pgm-picture-count]');
  await expect(pictures).toHaveAttribute('data-pgm-picture-count', '2');
  await expect(pictures).toHaveAttribute('data-pgm-layout', 'horizontal');
  await expect(page.locator('[data-pgm-screen="A"]')).toContainText('A · CH 1');
  await expect(page.locator('[data-pgm-screen="A"]')).toContainText('Return feed stalled');
  await expect(page.locator('[data-pgm-screen="B"]')).toContainText('B · CH 2');
  await expect(page.locator('[data-pgm-screen="B"]')).not.toContainText('Return feed stalled');

  const soundSource = page.getByLabel('Programme sound source');
  await expect(soundSource).toHaveValue('follow');
  await expect(page.locator('[data-vu-meter]')).toHaveCount(1);
  await expect(page.locator('[data-vu-meter]')).toHaveAttribute('data-vu-engine', 'B');
  await expect(page.locator('[data-loudness-badge]')).toHaveAttribute('data-loudness-engine', 'B');
  await expect(page.getByRole('button', { name: 'Programme sound' })).toHaveAttribute(
    'title',
    /from B/,
  );

  const horizontalA = await page.locator('[data-pgm-screen="A"]').boundingBox();
  const horizontalB = await page.locator('[data-pgm-screen="B"]').boundingBox();
  expect(horizontalA).not.toBeNull();
  expect(horizontalB).not.toBeNull();
  expect(horizontalB?.x ?? 0).toBeGreaterThan((horizontalA?.x ?? 0) + 20);

  await page.getByRole('button', { name: 'Vertical programme layout' }).click();
  await expect(pictures).toHaveAttribute('data-pgm-layout', 'vertical');
  const verticalA = await page.locator('[data-pgm-screen="A"]').boundingBox();
  const verticalB = await page.locator('[data-pgm-screen="B"]').boundingBox();
  expect(verticalA).not.toBeNull();
  expect(verticalB).not.toBeNull();
  expect(verticalB?.y ?? 0).toBeGreaterThan((verticalA?.y ?? 0) + 20);
  await expect
    .poll(() => page.evaluate(() => globalThis.localStorage.getItem('cg.runtime.pgm-monitor.v1')))
    .toContain('"layout":"vertical"');

  await soundSource.selectOption('A');
  await expect(page.locator('[data-vu-meter]')).toHaveCount(1);
  await expect(page.locator('[data-vu-meter]')).toHaveAttribute('data-vu-engine', 'A');
  await expect(page.locator('[data-loudness-badge]')).toHaveAttribute('data-loudness-engine', 'A');
  await expect(page.locator('[data-pgm-screen="A"]')).toContainText('A · CH 1');
  await expect(page.locator('[data-pgm-screen="B"]')).toContainText('B · CH 2');
});

test('without a channel mapping, reserve controls stay visible and B is a black no-signal tile', async ({
  page,
}) => {
  await open(page, {
    backupChannel: null,
    statuses: [{ engine: 'A', channel: 1, state: 'live' }],
  });

  await expect(page.getByRole('button', { name: 'A+B', exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Programme sound source')).toHaveCount(1);
  await page.getByRole('button', { name: 'A+B', exact: true }).click();
  await expect(page.locator('[data-pgm-picture-count]')).toHaveAttribute(
    'data-pgm-picture-count',
    '2',
  );
  await expect(page.locator('[data-pgm-screen="A"]')).toContainText('A · CH 1');
  await expect(page.locator('[data-pgm-screen="B"]')).toContainText('B · CH —');
  await expect(page.locator('[data-pgm-screen="B"]')).toContainText('No return signal');
  await expect(page.locator('[data-pgm-screen="B"] [data-pgm-picture]')).toHaveCount(0);
  await expect(page.locator('[data-backup-channel-line="not-mapped"]')).toContainText(
    'Backup: not mapped',
  );
});
