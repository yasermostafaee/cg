import { expect, test } from './fixtures/runtime.js';

test('R-110 · operate the original Playlist gain without an on-air frame', async ({ app }) => {
  const page = app.page;
  await page.evaluate(() => {
    const state = {
      gain: -6,
      unavailable: false,
      writes: [] as { channel: number; gainDb: number; editToken: string }[],
    };
    Object.assign(window, { playlistGainFixture: state });
    const editToken = '00000000-0000-4000-8000-000000000001';
    window.cg.playlistGain = {
      get: () =>
        Promise.resolve(
          state.unavailable
            ? { ok: false, reason: 'backup-sign-in' }
            : {
                ok: true,
                state: { gainDb: state.gain, application: 'applied', usage: 'unused', editToken },
              },
        ),
      set: (request) => {
        state.writes.push(request);
        state.gain = request.gainDb;
        return Promise.resolve({
          ok: true,
          state: { gainDb: state.gain, application: 'pending', usage: 'unused', editToken },
        });
      },
    };
  });
  const writes = () =>
    page.evaluate(
      () =>
        (window as unknown as { playlistGainFixture: { writes: unknown[] } }).playlistGainFixture
          .writes,
    );

  await page.getByRole('tab', { name: 'Live plates' }).click();
  const button = page.getByRole('button', { name: 'Playlist gain' });
  await button.click();
  const modal = page.getByRole('dialog', { name: 'Playlist gain' });
  await expect(modal.getByText('No live frame uses this output')).toBeVisible();
  await expect(modal.getByText('-6 dB · Applied')).toBeVisible();
  const field = modal.getByRole('textbox', { name: 'Programme gain (dB)' });
  const apply = modal.getByRole('button', { name: 'Apply' });
  await expect(field).toHaveValue('-6');
  await expect(apply).toBeDisabled();
  await field.fill('13');
  await expect(apply).toBeDisabled();
  await modal.getByRole('button', { name: '0 dB', exact: true }).click();
  await expect(field).toHaveValue('0');
  expect(await writes()).toEqual([]);

  await apply.click();
  await expect(modal.getByText('0 dB · Saved · waiting for Playout')).toBeVisible();
  await expect(modal.getByText('0 dB · Applied')).toBeVisible();
  expect(await writes()).toEqual([
    { channel: 1, gainDb: 0, editToken: '00000000-0000-4000-8000-000000000001' },
  ]);

  await modal.locator('[data-modal-role="cancel"]').click();
  await page.evaluate(() => {
    (
      window as unknown as { playlistGainFixture: { unavailable: boolean } }
    ).playlistGainFixture.unavailable = true;
  });
  await button.click();
  await expect(
    modal.getByText('Server B owns this channel and needs its own authorized operator session.'),
  ).toBeVisible();
  await expect(apply).toBeDisabled();
  await expect(field).toHaveCount(0);
});
