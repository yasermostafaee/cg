import { expect, test } from './fixtures/designer.js';

test('B-416: a long timeline has one line per label and reaches numbered single frames', async ({
  app,
}) => {
  await app.newProject('Long timeline');
  const duration = app.page.getByRole('spinbutton', { name: 'Scene duration in frames' });
  await duration.fill('5000');
  await duration.press('Enter');
  const ruler = app.page.getByRole('slider', { name: 'Frame ruler' });
  await expect(ruler).toHaveAttribute('aria-valuemax', '5000');
  const lane = app.page.getByTestId('timeline-lane-body');
  const readTicks = () =>
    app.page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('[data-timeline-tick]'));
      const lines = Array.from(document.querySelectorAll('[data-timeline-grid-frame]'));
      return {
        labelled: labels.map((label) => Number(label.getAttribute('data-timeline-tick'))),
        drawn: lines.map((line) => Number(line.getAttribute('data-timeline-grid-frame'))),
        horizontalOffsets: labels.map((label, index) =>
          Math.abs(
            label.getBoundingClientRect().left - (lines[index]?.getBoundingClientRect().left ?? -1),
          ),
        ),
        labelGaps: labels
          .slice(1)
          .map(
            (label, index) =>
              label.firstElementChild!.getBoundingClientRect().left -
              labels[index]!.firstElementChild!.getBoundingClientRect().right,
          ),
      };
    });

  const fit = await readTicks();
  expect(fit.labelled.length).toBeGreaterThan(2);
  expect(fit.labelled.length).toBeLessThan(30);
  expect(fit.drawn).toEqual(fit.labelled);
  expect(Math.max(...fit.horizontalOffsets)).toBeLessThan(1);
  expect(Math.min(...fit.labelGaps)).toBeGreaterThan(0);

  await app.page.getByRole('slider', { name: 'Timeline zoom' }).press('End');
  await lane.evaluate((node) => {
    node.scrollLeft = node.scrollWidth / 2;
  });
  await expect.poll(async () => (await readTicks()).labelled[0]).toBeGreaterThan(2000);
  const zoomed = await readTicks();
  expect(zoomed.drawn).toEqual(zoomed.labelled);
  expect(Math.max(...zoomed.horizontalOffsets)).toBeLessThan(1);
  expect(
    zoomed.labelled.slice(1).every((frame, index) => frame === zoomed.labelled[index]! + 1),
  ).toBe(true);
});
