import { buildSoundVcg, expect, test } from './fixtures/runtime.js';

/**
 * 🔴 `RUN-NEXT-VERSION-02` Q9 — a per-row mute for a template's own sound: a toggle beside the row's
 * speaker mark. The mark states the fact; the toggle names the action; the bridge records it (and,
 * on air, tells the page).
 */
test('🔴 the row’s template sound mutes and unmutes from the toggle beside its mark', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-sound';
  await app.importVcg('chime.vcg', await buildSoundVcg(templateId));
  const row = app.stackRow(templateId).first();
  const mark = row.locator('[data-template-sound]');
  const toggle = row.locator('[data-template-sound-toggle]');

  await expect(mark).toHaveAttribute('data-template-sound', 'on');
  await expect(toggle).toHaveAttribute('data-template-sound-toggle', 'mute');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(mark).toHaveAttribute('data-template-sound', 'muted');
  await expect(toggle).toHaveAttribute('data-template-sound-toggle', 'unmute');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await toggle.click();
  await expect(mark).toHaveAttribute('data-template-sound', 'on');
  await expect(toggle).toHaveAttribute('data-template-sound-toggle', 'mute');
});
