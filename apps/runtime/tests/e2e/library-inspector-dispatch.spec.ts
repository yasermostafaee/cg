import { buildListFieldVcg, expect, test } from './fixtures/runtime.js';

/**
 * R-007 guard (rollout) — the Library and Inspector controls newly wrapped in the
 * Button / AsyncButton primitives must still DISPATCH on click (the StrictMode
 * severing bug came from that shared primitive, so it could recur anywhere it is
 * applied). Import, Load, Update, Discard, and the list add / remove / reorder
 * buttons each cause their effect.
 */

test('Library + Inspector controls each dispatch on click', async ({ app }) => {
  const templateId = 'tpl-r007-li';

  // IMPORT — clicking Import opens the file chooser; a successful import registers
  // the template (proves the Import button → chooser → templates.import round-trip).
  await app.importVcg('li.vcg', await buildListFieldVcg(templateId));
  await expect(
    app.library.getByRole('button', { name: `Load ${templateId}`, exact: true }),
  ).toBeVisible();

  // LOAD — clicking Load puts the item on the stack.
  await app.loadTemplate(templateId);
  await app.selectStackRow(templateId);

  // UPDATE (Inspector header AsyncButton) — dispatches one stack.update (nothing
  // staged still sends — B-048).
  await app.installUpdateSpy();
  await app.inspector.getByRole('button', { name: 'Apply staged edits' }).click();
  await expect.poll(() => app.updateCount()).toBe(1);

  // DISCARD — stage an edit, then Discard reverts it (dirty clears).
  await app.inspector.getByRole('textbox', { name: 'anchor' }).fill('پیش‌نویس');
  await expect(app.inspector.getByText('● draft')).toBeVisible();
  await app.inspector.getByRole('button', { name: 'Discard staged edits' }).click();
  await expect(app.inspector.getByText('● draft')).toHaveCount(0);

  // LIST ADD — the item count grows by one.
  const items = () => app.inspector.getByRole('textbox', { name: /^_tickerTexts item / });
  await expect(items()).toHaveCount(2);
  await app.inspector.getByRole('button', { name: 'Add _tickerTexts item' }).click();
  await expect(items()).toHaveCount(3);

  // LIST REORDER — moving item 2 up swaps it with item 1.
  await app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' }).fill('یک');
  await app.inspector.getByRole('textbox', { name: '_tickerTexts item 2' }).fill('دو');
  await app.inspector.getByRole('button', { name: 'Move _tickerTexts item 2 up' }).click();
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' })).toHaveValue(
    'دو',
  );

  // LIST REMOVE — the item count shrinks by one.
  await app.inspector.getByRole('button', { name: 'Remove _tickerTexts item 3' }).click();
  await expect(items()).toHaveCount(2);
});
