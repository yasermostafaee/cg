import {
  buildListFieldVcg,
  buildNumberFieldVcg,
  buildValidVcg,
  expect,
  test,
} from './fixtures/runtime.js';
import type { RuntimeApp } from './fixtures/runtime.js';

/**
 * R-003 — Inspector edits STAGE locally and reach air only on the explicit
 * Update. These drive the contract against the browser MockRuntime: blur/Enter
 * send nothing, Update applies the whole staged set atomically, Discard reverts,
 * drafts survive selection switches, Take plays applied (not draft) values, the
 * first list-control click always lands, and Update with nothing staged still
 * sends (the B-048 workaround).
 */

/** The applied `anchor` field for a template, read from the stack snapshot. */
function readApplied(app: RuntimeApp, templateId: string): Promise<unknown> {
  return app.page.evaluate(async (tid) => {
    const cg = (
      window as unknown as {
        cg: {
          stack: {
            snapshot(): Promise<{ templateId: string; fields: Record<string, unknown> }[]>;
          };
        };
      }
    ).cg;
    const snap = await cg.stack.snapshot();
    return snap.find((i) => i.templateId === tid)?.fields['anchor'] ?? null;
  }, templateId);
}

test('blur and Enter send NOTHING; the field shows dirty until Update', async ({ app }) => {
  const templateId = 'tpl-r003-stage';
  await app.importVcg('stage.vcg', await buildValidVcg(templateId));
  await app.selectStackRow(templateId);

  const applied = await readApplied(app, templateId);
  const field = app.inspector.getByRole('textbox', { name: 'anchor' });
  await field.fill('مجری تازه');
  await field.blur();
  await field.press('Enter');

  // Nothing reached the bridge: the applied value is unchanged.
  expect(await readApplied(app, templateId)).toEqual(applied);
  // The field shows dirty (per-field marker + the Inspector draft chip).
  await expect(app.inspector.getByLabel('anchor has unapplied edits')).toBeVisible();
  await expect(app.inspector.getByText('● draft')).toBeVisible();

  // Update applies it; the dirty markers clear and the value is on the stack.
  await app.applyEdits();
  await expect.poll(() => readApplied(app, templateId)).toBe('مجری تازه');
  await expect(app.inspector.getByText('● draft')).toHaveCount(0);
});

test('Discard reverts the draft to the applied value', async ({ app }) => {
  const templateId = 'tpl-r003-discard';
  await app.importVcg('discard.vcg', await buildValidVcg(templateId));
  await app.selectStackRow(templateId);

  const field = app.inspector.getByRole('textbox', { name: 'anchor' });
  const original = await field.inputValue();
  await field.fill('تغییر موقت');
  await expect(app.inspector.getByText('● draft')).toBeVisible();

  await app.discardEdits();
  await expect(app.inspector.getByRole('textbox', { name: 'anchor' })).toHaveValue(original);
  await expect(app.inspector.getByText('● draft')).toHaveCount(0);
});

test('the first reorder click lands immediately after editing another item (no remount hazard)', async ({
  app,
}) => {
  const templateId = 'tpl-r003-list';
  await app.importVcg('list.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  const item1 = app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' });
  await expect(item1).toHaveValue('سلام دنیا');
  // Edit item 1's text (stages a draft), then reorder item 2 up with ONE gesture.
  //
  // RE-EXPRESSED, NOT LOOSENED. The ↑/↓ buttons are gone (owner: with a drag
  // handle they only cost space), so the reorder now goes through the handle's
  // KEYBOARD path — focus it and press ArrowUp. The claim under test is unchanged
  // and is the whole point of the spec: the FIRST gesture after editing another
  // item must land, with no remount swallowing it (the recorded R-003 hazard).
  await item1.fill('ویرایش شده');
  const handle = app.inspector.getByRole('button', { name: 'Reorder _tickerTexts item 2' });
  await handle.focus();
  await handle.press('ArrowUp');

  // The single click reordered: item 1 is now the former item 2, item 2 the edit.
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' })).toHaveValue(
    'اخبار فوری',
  );
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 2' })).toHaveValue(
    'ویرایش شده',
  );
});

test('a draft survives switching selection away and back — and stays UNAPPLIED', async ({
  app,
}) => {
  const one = 'tpl-r003-a';
  const two = 'tpl-r003-b';
  await app.importVcg('a.vcg', await buildValidVcg(one));
  await app.importVcg('b.vcg', await buildValidVcg(two));

  await app.selectStackRow(one);
  const applied = await readApplied(app, one);
  await app.inspector.getByRole('textbox', { name: 'anchor' }).fill('پیش‌نویس الف');

  // Switch to the other item, then back.
  await app.selectStackRow(two);
  await expect(app.inspector.getByRole('textbox', { name: 'anchor' })).not.toHaveValue(
    'پیش‌نویس الف',
  );
  await app.selectStackRow(one);
  await expect(app.inspector.getByRole('textbox', { name: 'anchor' })).toHaveValue('پیش‌نویس الف');
  // …and it never reached air (it is a draft, not a commit — this is what
  // distinguishes staged from the old blur-commit behavior).
  expect(await readApplied(app, one)).toEqual(applied);
  await expect(app.inspector.getByText('● draft')).toBeVisible();
});

test('Take plays the applied values, not the draft; the item stays dirty', async ({ app }) => {
  const templateId = 'tpl-r003-take';
  await app.importVcg('take.vcg', await buildValidVcg(templateId));
  await app.selectStackRow(templateId);

  const applied = await readApplied(app, templateId);
  await app.inspector.getByRole('textbox', { name: 'anchor' }).fill('نباید پخش شود');

  // R-004 — the row no longer prints its templateId; it carries it as a stable data anchor.
  const row = app.stackRow(templateId).last();
  await row.getByRole('button', { name: 'PLAY' }).click();

  // The draft did not reach air, and the row stays visibly dirty.
  expect(await readApplied(app, templateId)).toEqual(applied);
  await expect(row.getByText('● draft')).toBeVisible();
});

test('a number field accepts continuous multi-digit typing without losing focus (no keystroke remount)', async ({
  app,
}) => {
  const templateId = 'tpl-r003-number';
  await app.importVcg('number.vcg', await buildNumberFieldVcg(templateId));
  await app.selectStackRow(templateId);

  // R-020 — the number control is the shared NumericInput (type="text" +
  // inputMode, so Persian digits are not silently dropped): role is textbox.
  const num = app.inspector.getByRole('textbox', { name: 'fontSize' });
  await expect(num).toHaveValue('5');
  await num.fill(''); // clear the seeded default
  // Type digit-by-digit: a remount on the first keystroke (the old frozen-key
  // bug) would drop focus and lose every digit after the first.
  await num.pressSequentially('128');
  await expect(num).toHaveValue('128');

  // It staged (not applied): the field is dirty and air is unchanged until Update.
  await expect(app.inspector.getByText('● draft')).toBeVisible();
  await app.applyEdits();
  await expect(app.inspector.getByText('● draft')).toHaveCount(0);
  await expect(app.inspector.getByRole('textbox', { name: 'fontSize' })).toHaveValue('128');
});

test('Update with nothing staged still sends (the B-048 recovery workaround)', async ({ app }) => {
  const templateId = 'tpl-r003-nostage';
  await app.importVcg('nostage.vcg', await buildValidVcg(templateId));
  await app.selectStackRow(templateId);

  // No dirty state, yet Update is enabled and a real stack.update is dispatched.
  await expect(app.inspector.getByText('● draft')).toHaveCount(0);
  await app.installUpdateSpy();
  await app.applyEdits();
  await expect.poll(() => app.updateCount()).toBe(1);
  // No command error. (R-006 — name the toast: the connection banner is an alert too now.)
  await expect(app.page.getByRole('alert', { name: 'Command error' })).toHaveCount(0);
});

test('Update applies MULTIPLE staged fields as exactly ONE atomic stack.update', async ({
  app,
}) => {
  const templateId = 'tpl-r003-atomic';
  await app.importVcg('atomic.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  // Stage two distinct fields: the scalar `anchor` and a ticker list item.
  await app.inspector.getByRole('textbox', { name: 'anchor' }).fill('مجری');
  await app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' }).fill('تیتر یک');

  await app.installUpdateSpy();
  await app.applyEdits();
  // Exactly ONE update carried the whole staged set (not one-per-field).
  await expect.poll(() => app.updateCount()).toBe(1);
  await expect(app.inspector.getByRole('textbox', { name: 'anchor' })).toHaveValue('مجری');
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' })).toHaveValue(
    'تیتر یک',
  );
  await expect(app.inspector.getByText('● draft')).toHaveCount(0);
});
