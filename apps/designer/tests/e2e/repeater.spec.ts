import { test, expect } from './fixtures/designer.js';

/**
 * D-030 — the repeater scenarios driven through the real UI. Stamp/layout/
 * liveness math lives in @cg/template-runtime unit tests; this guards the
 * integrated path: child composition with data keys → guard-gated tool →
 * static rows on canvas → columned items editing (inspector + preview) →
 * rows running the child lifecycle → the deferred-growth semantics →
 * export with the child-derived GDD item schema.
 */

/** Build a child composition "Row" with two text data keys (name/role). */
async function buildRowChild(app: Parameters<Parameters<typeof test>[2]>[0]['app']): Promise<void> {
  await app.newComposition('Row');
  await app.openComposition('Row');
  await app.addTextElement({ x: 100, y: 60 });
  await app.setDataKey('name');
  await app.addTextElement({ x: 100, y: 140 });
  await app.setDataKey('role');
  // The child's own out-point: rows hold at it and play their own outro.
  await app.addOutPoint();
  await app.openComposition('comp1');
}

test.describe('Repeater / data-driven layout (D-030)', () => {
  test('the tool refuses without a valid composition, then inserts 3 columned rows', async ({
    app,
  }) => {
    await app.newProject('Repeater');

    // Guard: no other composition exists yet — no insert, a hint explains.
    await app.addRepeater();
    await expect(app.page.getByText(/repeater stamps another composition/i)).toBeVisible();
    const canvasFrame = app.page.frameLocator('iframe[title="cgpreview"]');
    await expect(canvasFrame.locator('[data-cg-element-id="rep"]')).toHaveCount(0);

    // With a valid child the tool inserts, preselecting it, with 3 seeded rows.
    await buildRowChild(app);
    await app.addRepeater();
    await expect(canvasFrame.locator('[data-cg-repeater-row]')).toHaveCount(3);

    // The inspector items editor is COLUMNED by the child's fields; a cell
    // edit updates that row on the canvas.
    const cell = app.page.getByRole('textbox', { name: 'Repeater item 1 name', exact: true });
    await expect(cell).toBeVisible();
    await cell.fill('تیم آلفا');
    await expect(canvasFrame.getByText('تیم آلفا')).toBeVisible();
  });

  test('data key → columned preview editor live-updates a row; growth defers to re-play', async ({
    app,
  }) => {
    await app.newProject('RepeaterData');
    await buildRowChild(app);
    await app.addRepeater();
    await app.setDataKey('standings');
    await expect(app.dataKeyInput).toHaveValue('standings');

    await app.openPreviewModal();
    // The bound list renders the columned editor (child fields as columns).
    const nameCell = app.page.getByRole('textbox', {
      name: 'standings item 1 name',
      exact: true,
    });
    await expect(nameCell.first()).toBeVisible();
    await nameCell.first().fill('تیم نخست');
    await expect(app.previewFrame.getByText('تیم نخست').first()).toBeVisible();

    // Rows run the child lifecycle: play holds at the child's out-point;
    // stop exits and the stage settles hidden.
    await app.play();
    await expect(app.previewFrame.locator('[data-cg-repeater-row]')).toHaveCount(3);
    // Mid-run GROWTH defers: adding a 4th row leaves 3 stamped…
    await app.previewDialog.getByRole('button', { name: 'Add item' }).first().click();
    await expect(
      app.previewFrame.locator('[data-cg-repeater-row]:not([style*="display: none"])'),
    ).toHaveCount(3);
    // …until a fresh play stamps the new count.
    await app.stop();
    await expect(app.previewFrame.locator('body')).toHaveClass(/cg-pending/, {
      timeout: 10_000,
    });
    await app.play();
    await expect(app.previewFrame.locator('[data-cg-repeater-row]')).toHaveCount(4);
    await app.stop();
  });

  test('the export carries the repeater and the GDD derives the item schema from the child', async ({
    app,
  }) => {
    await app.newProject('RepeaterExport');
    await buildRowChild(app);
    await app.addRepeater();
    await app.setDataKey('standings');
    const { html } = await app.exportHtml();
    expect(html).toContain('"type":"repeater"');
    const m = /<script name="graphics-data-definition"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    const gdd = JSON.parse((m?.[1] ?? '').trim()) as {
      properties: Record<
        string,
        { type: string; items?: { properties?: Record<string, unknown> } }
      >;
    };
    // The item schema is DERIVED from the child's fields — not {id, text}.
    const items = gdd.properties['standings']?.items;
    expect(items?.properties?.['name']).toBeDefined();
    expect(items?.properties?.['role']).toBeDefined();
    expect(items?.properties?.['text']).toBeUndefined();
  });
});
