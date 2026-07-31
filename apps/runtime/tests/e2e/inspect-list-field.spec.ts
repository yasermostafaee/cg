import { buildListFieldVcg, expect, test } from './fixtures/runtime.js';

/**
 * B-040 + R-003 — a ticker `list` Data key (`_tickerTexts`) renders in the operator
 * Inspector as a STRUCTURED items editor, never "[object Object]". Edits STAGE
 * locally (R-003) and round-trip as structure only when APPLIED via the Update
 * button (a stringified array would resurface as "[object Object]" on re-read).
 */

test('a ticker list field renders an items editor (not "[object Object]") and edits round-trip as structure when applied', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-list';
  await app.importVcg('list.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  // The list field renders one editable input per item, showing the real text…
  const item1 = app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' });
  const item2 = app.inspector.getByRole('textbox', { name: '_tickerTexts item 2' });
  await expect(item1).toHaveValue('سلام دنیا');
  await expect(item2).toHaveValue('اخبار فوری');
  // …and the corrupted string never appears anywhere in the Inspector.
  await expect(app.inspector.getByText('[object Object]', { exact: false })).toHaveCount(0);

  // Edit item 1 (stages the draft) then APPLY → it must round-trip as STRUCTURE:
  // the field shows the edited text (a stringified array would show "[object Object]").
  await item1.fill('خبر تازه');
  await app.applyEdits();
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' })).toHaveValue(
    'خبر تازه',
  );
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 2' })).toHaveValue(
    'اخبار فوری',
  );
  await expect(app.inspector.getByText('[object Object]', { exact: false })).toHaveCount(0);
});

test('a two-line item keeps its newline: Enter inserts a line break and the \\n survives the applied payload', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-list-ml';
  const twoLines = 'خبر خط یک\nخط دوم';
  await app.importVcg('list-ml.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  // Type line 1, press Enter (must insert a newline — NOT commit/submit), type line 2.
  const item1 = app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' });
  await item1.fill('خبر خط یک');
  await item1.press('Enter');
  await item1.pressSequentially('خط دوم');
  await expect(item1).toHaveValue(twoLines);

  // Apply via Update → the edited item round-trips as structure with the \n intact.
  await app.applyEdits();
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' })).toHaveValue(
    twoLines,
  );
  await expect(app.inspector.getByRole('textbox', { name: '_tickerTexts item 2' })).toHaveValue(
    'اخبار فوری',
  );

  // The applied stack payload (what `stack.update` shipped) carries the newline —
  // a flattening editor would have joined the lines. Look the item up by templateId:
  // the MockRuntime boots with a seeded demo stack, so index 0 is NOT this template.
  const readPayload = (): Promise<string> =>
    app.page.evaluate(async (tid) => {
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
      const item = snap.find((i) => i.templateId === tid);
      return JSON.stringify(item?.fields['_tickerTexts'] ?? null);
    }, templateId);
  await expect.poll(readPayload).toContain('خط دوم');
  const items = JSON.parse(await readPayload()) as { id: string; text: string }[];
  expect(items).toHaveLength(2);
  expect(items[0]?.text).toBe(twoLines);
  expect(items[1]?.text).toBe('اخبار فوری');
});

test('the item controls are a FIXED small square — they never stretch to fill the row', async ({
  app,
}) => {
  // The owner's report: ↑/↓/× came out "خیلی کشیده" (badly stretched). The cause was
  // reusing `variant="verb"`, whose `width: 100%` is geometry for a glyph filling a
  // sized TABLE COLUMN — inside the Inspector's flex tools row that made each button
  // ask for the container's whole width.
  //
  // This pins the fix by MEASURING, because that is the only thing that would have
  // caught the original: every assertion in this file passed while the buttons were
  // unusable, since none of them looked at a box.
  const templateId = 'tpl-e2e-list-size';
  await app.importVcg('list-size.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  const names = [
    'Move _tickerTexts item 1 up',
    'Move _tickerTexts item 1 down',
    'Remove _tickerTexts item 1',
  ];
  const boxes = [];
  for (const name of names) {
    const box = await app.inspector.getByRole('button', { name }).boundingBox();
    expect(box, name).not.toBeNull();
    boxes.push({ name, ...box! });
  }

  for (const b of boxes) {
    // Square and SMALL. The old stretched state was many times wider than tall, so a
    // near-1:1 ratio is the assertion that actually distinguishes the two.
    expect(b.width, `${b.name} width`).toBeLessThanOrEqual(40);
    expect(b.height, `${b.name} height`).toBeLessThanOrEqual(40);
    // …and still a real hit target: above the 24px WCAG 2.5.8 floor, which is the
    // reason not to shrink it further in a future "make it tidier" pass.
    expect(b.width, `${b.name} width floor`).toBeGreaterThanOrEqual(24);
    expect(b.height, `${b.name} height floor`).toBeGreaterThanOrEqual(24);
    expect(Math.abs(b.width - b.height), `${b.name} is square`).toBeLessThanOrEqual(4);
  }

  // All three identical: a fixed size cannot depend on which glyph is inside it.
  const widths = boxes.map((b) => Math.round(b.width));
  expect(new Set(widths).size, `widths ${widths.join(',')}`).toBe(1);

  // The TEXTAREA keeps the width instead — it is the thing that should flex. Well
  // wider than the three controls put together, which is what went wrong originally.
  const textarea = await app.inspector
    .getByRole('textbox', { name: '_tickerTexts item 1' })
    .boundingBox();
  expect(textarea).not.toBeNull();
  expect(textarea!.width).toBeGreaterThan(boxes.reduce((sum, b) => sum + b.width, 0));
});

test('AT FULLSCREEN the five controls for one item stay ONE cluster — they never split to opposite edges', async ({
  app,
}) => {
  /**
   * The owner's verdict on this panel was «بهم ریخته به نظر میاد», and this is the
   * measurement behind most of it.
   *
   * The controls used to sit on their own full-width line under the textarea with a
   * `flex: 1` spacer between the reorder pair and the delete button. At the panel's
   * narrow default that looked fine — which is exactly why it survived. At
   * FULLSCREEN the spacer expanded and put ↑/↓ at one edge and ✕ at the other,
   * roughly 1800px apart: five controls acting on ONE item, scattered across a
   * monitor.
   *
   * WHY THIS TEST IS AT FULLSCREEN AND MEASURES A SPAN. Every existing assertion in
   * this file passed throughout the defect, including the sibling above that
   * measures each button's own box: a split cluster's buttons are individually the
   * right size. Only the DISTANCE BETWEEN them carries the bug, and only at a width
   * the default panel never reaches. Run against the spacer layout this goes red on
   * the span; run against a per-button assertion it goes green while unusable.
   *
   * It asserts COHESION, not pixel positions, because cohesion is the durable rule:
   * the cluster may wrap onto its own line at a narrow width, it may be reordered,
   * it may change icons. It may not come apart.
   */
  const templateId = 'tpl-e2e-list-cluster';
  await app.importVcg('list-cluster.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  // FULLSCREEN — the operator's request for bigger inputs, and the width at which
  // the old layout failed. The Inspector fills the shell here, so the row is as
  // wide as it will ever be.
  await app.inspector.getByRole('button', { name: 'Show INSPECTOR fullscreen' }).click();

  const names = [
    'Move _tickerTexts item 1 up',
    'Move _tickerTexts item 1 down',
    'Remove _tickerTexts item 1',
  ];
  const boxes = [];
  for (const name of names) {
    const box = await app.inspector.getByRole('button', { name }).boundingBox();
    expect(box, name).not.toBeNull();
    boxes.push({ name, ...box! });
  }

  // THE SPAN: leading edge of the first control to trailing edge of the last. Three
  // ~26px buttons with small gaps come to well under 150px however they are
  // arranged; the split layout measured this in four figures.
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const span = right - left;
  expect(
    span,
    `the item's controls span ${String(Math.round(span))}px — they have come apart`,
  ).toBeLessThanOrEqual(150);

  // …and the panel really is wide, or the span above proves nothing: a cluster is
  // trivially tight inside a 320px column. This is what makes the assertion a
  // FULLSCREEN one rather than an accident of a narrow panel.
  const panel = await app.inspector.boundingBox();
  expect(panel).not.toBeNull();
  expect(panel!.width, 'the Inspector did not actually go fullscreen').toBeGreaterThan(700);

  // Every control on ONE line with its neighbours: same row, so the cluster has not
  // been broken across lines internally either.
  const tops = boxes.map((b) => Math.round(b.y));
  expect(Math.max(...tops) - Math.min(...tops), `tops ${tops.join(',')}`).toBeLessThanOrEqual(2);
});

test('the item row does NOT wrap as the panel narrows — the TEXT shrinks and the cluster holds', async ({
  app,
}) => {
  /**
   * The responsive half of the same rule, and the one an intermediate version of
   * this layout got wrong in a way that looked fine in isolation.
   *
   * The textarea had `flex: 1 1 12rem`, so once the panel could not seat a 12rem
   * basis beside the cluster the ROW wrapped — putting the controls on one line and
   * the text on another. That is the OLD split layout re-created by accident, at
   * exactly the panel width the operator spends most of their time in. It passes
   * any assertion about the cluster being intact, because the cluster IS intact;
   * what it breaks is the relationship between the cluster and its text.
   *
   * So the invariant is not "the cluster is together" — the sibling test covers
   * that — but "the cluster is together WITH ITS TEXT, at every width". The
   * fixed-size-plus-reflow split is what delivers it: the cluster never resizes,
   * the text absorbs every change.
   */
  const templateId = 'tpl-e2e-list-narrow';
  await app.importVcg('list-narrow.vcg', await buildListFieldVcg(templateId));
  await app.selectStackRow(templateId);

  // Docked, at the panel's ordinary width — no fullscreen. This is the case the
  // 12rem basis broke.
  const textarea = app.inspector.getByRole('textbox', { name: '_tickerTexts item 1' });
  const remove = app.inspector.getByRole('button', { name: 'Remove _tickerTexts item 1' });

  for (const width of [1400, 1100, 900]) {
    await app.page.setViewportSize({ width, height: 900 });
    // Settle: the layout is measured, so assert on the box only once it is stable.
    await expect.poll(async () => (await textarea.boundingBox())?.width ?? 0).toBeGreaterThan(0);

    const text = await textarea.boundingBox();
    const del = await remove.boundingBox();
    expect(text, `textarea box at ${String(width)}`).not.toBeNull();
    expect(del, `remove box at ${String(width)}`).not.toBeNull();

    // SAME LINE as its text — the row did not wrap. Compared on vertical overlap
    // rather than equal `y`, because the cluster is nudged 2px down to sit on the
    // text's first line rather than on its border.
    const overlap =
      Math.min(text!.y + text!.height, del!.y + del!.height) - Math.max(text!.y, del!.y);
    expect(
      overlap,
      `at ${String(width)}px the controls dropped off the text's line (overlap ${String(Math.round(overlap))}px)`,
    ).toBeGreaterThan(del!.height / 2);

    // …and the TEXT is what gave up the width, which is the other half of the rule.
    // It stays the widest thing in the row at every one of these widths.
    expect(text!.width, `textarea width at ${String(width)}`).toBeGreaterThan(del!.width * 2);
  }
});
