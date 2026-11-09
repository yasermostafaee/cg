import { buildRepeaterVcg, expect, test } from './fixtures/runtime.js';

test('an unchanged authored direct Repeater file is clean on the first Inspector open', async ({
  app,
}) => {
  const templateId = 'tpl-e2e-direct-repeater-clean-file';
  await app.page.evaluate(() => {
    const target = window as unknown as {
      __directRepeaterFileReads: number;
      cg: {
        textSources: {
          read: (request: { path: string }) => Promise<{ name: string; content: string }>;
        };
      };
    };
    target.__directRepeaterFileReads = 0;
    target.cg.textSources.read = (request) => {
      target.__directRepeaterFileReads += 1;
      return Promise.resolve({ name: request.path, content: 'Name\nیک\nدو' });
    };
  });

  await app.importVcg(
    'direct-repeater-clean-file.vcg',
    await buildRepeaterVcg(templateId, 2, false, { authoredFile: 'weather/rows.csv' }),
  );
  await expect
    .poll(() =>
      app.page.evaluate(
        () =>
          (window as unknown as { __directRepeaterFileReads: number }).__directRepeaterFileReads,
      ),
    )
    .toBe(1);
  await expect(app.inspector.getByLabel('unapplied edits')).toHaveCount(0);
  await expect(app.inspector.getByRole('button', { name: 'Discard staged edits' })).toBeDisabled();
});

test('a delayed authored file read cannot move to the next selected template', async ({ app }) => {
  const weatherId = 'tpl-e2e-weather-delayed-file';
  const footballId = 'tpl-e2e-football-file';
  await app.page.evaluate(() => {
    const target = window as unknown as {
      __weatherReadStarted: boolean;
      __footballReadCompleted: boolean;
      __finishWeatherRead?: (() => void) | undefined;
      cg: {
        textSources: {
          read: (request: { path: string }) => Promise<{ name: string; content: string }>;
        };
      };
    };
    target.__weatherReadStarted = false;
    target.__footballReadCompleted = false;
    target.cg.textSources.read = (request) => {
      if (request.path.includes('weather')) {
        target.__weatherReadStarted = true;
        return new Promise((resolve) => {
          target.__finishWeatherRead = () =>
            resolve({ name: request.path, content: 'Name\nیک\nدو' });
        });
      }
      target.__footballReadCompleted = true;
      return Promise.resolve({ name: request.path, content: 'Name\nسه\nچهار' });
    };
  });

  await app.importVcg(
    'weather-delayed-file.vcg',
    await buildRepeaterVcg(weatherId, 2, false, { authoredFile: 'weather/rows.csv' }),
  );
  await expect
    .poll(() =>
      app.page.evaluate(
        () => (window as unknown as { __weatherReadStarted: boolean }).__weatherReadStarted,
      ),
    )
    .toBe(true);
  await app.importVcg(
    'football-file.vcg',
    await buildRepeaterVcg(footballId, 2, false, {
      authoredFile: 'football/rows.csv',
      rowNames: ['سه', 'چهار'],
    }),
  );
  await expect
    .poll(() =>
      app.page.evaluate(
        () => (window as unknown as { __footballReadCompleted: boolean }).__footballReadCompleted,
      ),
    )
    .toBe(true);
  await expect(app.inspector.getByLabel('unapplied edits')).toHaveCount(0);
  expect(
    await app.page.evaluate(() => {
      const finish = (window as unknown as { __finishWeatherRead?: (() => void) | undefined })
        .__finishWeatherRead;
      finish?.();
      return finish !== undefined;
    }),
  ).toBe(true);

  await expect(app.inspector.getByLabel('unapplied edits')).toHaveCount(0);
  await expect(app.stackRow(footballId).getByLabel(/has unapplied edits/u)).toHaveCount(0);
  await app.selectStackRow(weatherId);
  await expect(app.inspector.getByLabel('unapplied edits')).toHaveCount(0);
  await expect(app.stackRow(weatherId).getByLabel(/has unapplied edits/u)).toHaveCount(0);
});
