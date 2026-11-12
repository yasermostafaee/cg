import { expect, test, type DesignerApp } from './fixtures/designer.js';

/** Read the editor's rendered boxes in composition pixels, independent of canvas zoom. */
async function readLayout(app: DesignerApp) {
  return app.canvasFrame
    .locator('.cg-stage > .cg-layer > [data-cg-element-id]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        const transform = getComputedStyle(element).transform;
        const matrix = transform === 'none' ? new DOMMatrix() : new DOMMatrix(transform);
        const artwork = element.querySelector('.cg-comp-inner [data-cg-element-id]');
        const relativeBox = (child: Element) => {
          const rect = child.getBoundingClientRect();
          return [
            (rect.x - x) / width,
            (rect.y - y) / height,
            rect.width / width,
            rect.height / height,
          ];
        };
        return {
          id: element.getAttribute('data-cg-element-id'),
          x,
          y,
          width,
          height,
          angle: Math.atan2(matrix.b, matrix.a),
          artwork: artwork === null ? [] : relativeBox(artwork),
          rows: Array.from(element.querySelectorAll('[data-cg-repeater-row]'), relativeBox).flat(),
        };
      }),
    );
}

type Layout = Awaited<ReturnType<typeof readLayout>>;

function spatialOrder(layout: Layout) {
  return [...layout].sort((a, b) => Math.round(a.y) - Math.round(b.y) || a.x - b.x);
}

function roundedPositions(layout: Layout) {
  return layout.map(({ id, x, y, width, height }) => [
    id,
    ...[x, y, width, height].map(Math.round),
  ]);
}

async function addedLayer(app: DesignerApp, prior: readonly string[]): Promise<string> {
  const [added] = (await app.timelineRowIds()).filter((id) => !prior.includes(id));
  if (added === undefined) throw new Error('The new element needs a timeline row');
  return added;
}

test('Auto layout arranges and undoes a mixed selection including a Repeater', async ({ app }) => {
  await app.newProject('Mixed Auto layout');
  await app.newComposition('Artwork');
  await app.openComposition('Artwork');
  await app.addRectangle({ x: 140, y: 100 });
  await app.openComposition('comp1');
  await app.nestCompositionInstance('Artwork');
  const compositionId = await addedLayer(app, []);
  await app.addLiveSource({ x: 180, y: 130 });
  const plateId = await addedLayer(app, [compositionId]);
  await app.addRectangle({ x: 230, y: 180 });
  const rectangleId = await addedLayer(app, [compositionId, plateId]);
  await app.setInspectorNumber('Width', 400);
  await app.setInspectorNumber('Height', 220);
  await app.setInspectorNumber('Rotation', 22);
  await app.addRepeater({ x: 100, y: 200 });
  const repeaterId = await addedLayer(app, [compositionId, plateId, rectangleId]);
  const layerOrder = await app.timelineRowIds();

  const repeater = app.canvasFrame.locator(`[data-cg-element-id="${repeaterId}"]`);
  await expect(repeater.locator('[data-cg-repeater-row]')).toHaveCount(3);
  const before = await readLayout(app);
  expect(before).toHaveLength(4);
  expect(before.find(({ id }) => id === rectangleId)?.angle).toBeCloseTo((22 * Math.PI) / 180);
  expect(before.find(({ id }) => id === compositionId)?.artwork).toHaveLength(4);

  await app.selectElementById(repeaterId);
  for (const id of [compositionId, plateId, rectangleId]) {
    await app.page.locator(`.cg-tl-row[data-element-id="${id}"]`).click({ modifiers: ['Shift'] });
  }
  await expect.poll(() => app.selectedRowCount()).toBe(4);
  await app.multiInspector.getByRole('button', { name: 'Arrange evenly' }).click();

  await expect
    .poll(async () => {
      const heights = (await readLayout(app)).map(({ height }) => height);
      return heights.length === 4 ? Math.max(...heights) - Math.min(...heights) : Infinity;
    })
    .toBeLessThan(0.1);
  const arranged = await readLayout(app);
  const [topLeft, topRight, bottomLeft, bottomRight] = spatialOrder(arranged);
  if (!topLeft || !topRight || !bottomLeft || !bottomRight) {
    throw new Error('Auto layout must render all four selected elements');
  }
  expect(topLeft.y).toBeCloseTo(topRight.y, 1);
  expect(bottomLeft.y).toBeCloseTo(bottomRight.y, 1);
  expect(topRight.x).toBeGreaterThan(topLeft.x + topLeft.width);
  expect(bottomRight.x).toBeGreaterThan(bottomLeft.x + bottomLeft.width);
  expect(bottomLeft.y).toBeGreaterThan(topLeft.y + topLeft.height);
  expect(topLeft.x + topRight.x + topRight.width).toBeCloseTo(
    bottomLeft.x + bottomRight.x + bottomRight.width,
    1,
  );

  const assertArtwork = (layout: Layout): void => {
    expect(layout.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
    for (const original of before) {
      const current = layout.find(({ id }) => id === original.id);
      if (current === undefined) throw new Error(`Missing rendered element ${String(original.id)}`);
      expect(current.width / current.height).toBeCloseTo(original.width / original.height, 2);
      expect(current.angle).toBeCloseTo(original.angle);
      expect(current.artwork).toHaveLength(original.artwork.length);
      expect(current.rows).toHaveLength(original.rows.length);
      current.artwork.forEach((value, i) => expect(value).toBeCloseTo(original.artwork[i]!, 2));
      current.rows.forEach((value, i) => expect(value).toBeCloseTo(original.rows[i]!, 2));
    }
  };
  assertArtwork(arranged);
  expect(await app.timelineRowIds()).toEqual(layerOrder);

  const reversedIds = spatialOrder(arranged)
    .map(({ id }) => id)
    .reverse();
  await app.multiInspector.getByRole('button', { name: 'Swap frame order' }).click();
  await expect
    .poll(async () => spatialOrder(await readLayout(app)).map(({ id }) => id))
    .toEqual(reversedIds);
  assertArtwork(await readLayout(app));
  expect(await app.timelineRowIds()).toEqual(layerOrder);

  await app.undo();
  await expect
    .poll(async () => roundedPositions(await readLayout(app)))
    .toEqual(roundedPositions(arranged));
  await app.undo();
  await expect
    .poll(async () => roundedPositions(await readLayout(app)))
    .toEqual(roundedPositions(before));
});
