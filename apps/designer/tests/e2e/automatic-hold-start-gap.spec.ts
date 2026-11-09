import { expect, test } from './fixtures/designer.js';

test.describe('Set hold start seed', () => {
  test('authors a one-frame default while an explicit crossing may make the markers coincide', async ({
    app,
  }) => {
    await app.newProject('AutomaticHoldGap');
    await app.addOutPoint();

    const rangeStart = app.page.getByTestId('loop-range-start');
    const rangeEnd = app.page.getByTestId('loop-range-end');
    await expect(rangeStart).toHaveCount(0);
    await expect(rangeEnd).toBeAttached();

    // Set authors a Hold start one frame before Outro start when no earlier settle exists.
    await app.page.getByRole('button', { name: 'Set hold start' }).click();
    await expect(rangeStart).toBeAttached();
    const seededFrames = await Promise.all(
      [rangeStart, rangeEnd].map(async (marker) => {
        const left = await marker.evaluate((node) => Number.parseFloat(node.style.left));
        return (left / 100) * 50;
      }),
    );
    expect(seededFrames[1]! - seededFrames[0]!).toBeCloseTo(1, 1);

    const hold = app.page.getByRole('separator', { name: 'Hold start marker' });
    const outro = app.page.getByRole('separator', { name: 'Outro start marker' });
    const lane = app.page.getByTestId('scene-row-lane');
    const holdBefore = await hold.boundingBox();
    const outroBefore = await outro.boundingBox();
    const laneBox = await lane.boundingBox();
    if (holdBefore === null || outroBefore === null || laneBox === null) {
      throw new Error('timeline markers are not laid out');
    }

    const fiveFrames = (laneBox.width / 50) * 5;
    await app.page.mouse.move(
      holdBefore.x + holdBefore.width / 2,
      holdBefore.y + holdBefore.height / 2,
    );
    await app.page.mouse.down();
    await app.page.mouse.move(
      holdBefore.x + holdBefore.width / 2 + fiveFrames,
      holdBefore.y + holdBefore.height / 2,
      { steps: 8 },
    );
    await app.page.mouse.up();

    const holdAfter = await hold.boundingBox();
    const outroAfter = await outro.boundingBox();
    if (holdAfter === null || outroAfter === null) throw new Error('timeline markers disappeared');
    expect(holdAfter.x).toBeGreaterThan(holdBefore.x);
    expect(outroAfter.x).toBeGreaterThan(outroBefore.x);
    const markerStyles = await Promise.all(
      [rangeStart, rangeEnd].map((marker) =>
        marker.evaluate((node) => ({ left: node.style.left, transform: node.style.transform })),
      ),
    );
    expect(markerStyles[0]!.left).toBe(markerStyles[1]!.left);
    // Same logical frame, but separate visual offsets keep both authored boundaries grabbable.
    expect(markerStyles[0]!.transform).not.toBe(markerStyles[1]!.transform);
  });
});
