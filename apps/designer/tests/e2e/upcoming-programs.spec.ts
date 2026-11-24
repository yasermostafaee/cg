import { readFileSync } from 'node:fs';
import { DesignerApp, test, expect } from './fixtures/designer.js';

test.describe('D-219 — Upcoming Programs', () => {
  test('authors its own layouts and previews more than five programme cards', async ({ app }) => {
    await app.newProject('Upcoming lineup');
    await app.addUpcomingPrograms();

    const layout = app.inspector.getByLabel('Layout', { exact: true });
    const capacity = app.inspector.getByLabel('Visible cards', { exact: true });
    const airtime = app.inspector.getByRole('checkbox', { name: 'Show airtime', exact: true });
    const cards = app.canvasFrame.locator('[data-cg-upcoming-card]');

    await expect(layout.locator('option')).toHaveText([
      'Single',
      'Side by side',
      'Sequential',
      'Carousel',
    ]);

    await layout.selectOption('single');
    await expect(cards).toHaveCount(1);
    await expect(capacity).toHaveCount(0);

    await layout.selectOption('grid');
    await capacity.fill('7');
    await capacity.press('Enter');
    await expect(cards).toHaveCount(7);
    await expect(cards.locator('[data-cg-upcoming-title]')).toHaveText([
      'The Night Report',
      'Cities After Dark',
      'Into the Wild',
      'The Long View',
      'Studio Sessions',
      'Coastline Stories',
      'Morning Edition',
    ]);
    await expect(cards.locator('[data-cg-upcoming-airtime]')).toHaveText([
      '20:00',
      '20:30',
      '21:15',
      '22:00',
      '23:30',
      '00:15',
      '06:00',
    ]);
    const sampleArtwork = cards.locator('img[data-cg-asset-id^="upcoming-preview/"]');
    await expect(sampleArtwork).toHaveCount(7);
    await expect
      .poll(() =>
        sampleArtwork.evaluateAll(
          (images: HTMLImageElement[]) =>
            images.filter((image) => image.complete && image.naturalWidth > 0).length,
        ),
      )
      .toBe(7);
    await expect(cards.first().locator('bdi').last()).toHaveAttribute('dir', 'auto');
    expect(
      await cards.evaluateAll((nodes) =>
        nodes.every((node) => {
          const card = node.getBoundingClientRect();
          const grid = node.closest('[data-cg-upcoming-layout]')!.getBoundingClientRect();
          return (
            card.width > 0 &&
            card.height > 0 &&
            card.left >= grid.left - 1 &&
            card.right <= grid.right + 1 &&
            card.top >= grid.top - 1 &&
            card.bottom <= grid.bottom + 1
          );
        }),
      ),
    ).toBe(true);
    await app.inspector.getByRole('button', { name: 'Toggle Card appearance' }).click();
    await app.inspector.getByLabel('Card gap mode', { exact: true }).selectOption('fixed');
    const gap = app.inspector.getByLabel('Card gap', { exact: true });
    await gap.fill('21');
    await gap.press('Enter');
    await expect(app.canvasFrame.locator('[data-cg-upcoming-page]')).toHaveCSS(
      'column-gap',
      '21px',
    );
    const measuredGridGap = await cards.evaluateAll(([first, second]) => {
      if (first === undefined || second === undefined) throw new Error('Expected two cards');
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      return Math.max(a.left, b.left) - Math.min(a.right, b.right);
    });
    expect(measuredGridGap).toBeCloseTo(21, 0);

    await airtime.uncheck();
    await expect(cards).toHaveCount(7);
    await expect(cards.locator('[data-cg-upcoming-airtime]')).toHaveCount(0);

    await app.deselect();
    await app.addSequence({ x: 140, y: 110 });
    await expect(app.inspector.getByRole('textbox', { name: 'Element name' })).toHaveValue(
      'Sequence',
    );
    await expect(app.inspector.getByLabel('Visible cards', { exact: true })).toHaveCount(0);
  });

  test('rehearses manual focus changes without changing the visible card count', async ({
    app,
  }) => {
    await app.newProject('Upcoming carousel');
    await app.addUpcomingPrograms();
    await app.inspector.getByLabel('Layout', { exact: true }).selectOption('carousel');
    await app.inspector.getByLabel('Advance', { exact: true }).selectOption('manual');
    await app.inspector.getByLabel('Next effect', { exact: true }).selectOption('cut');
    await app.inspector.getByRole('button', { name: 'Toggle Card appearance' }).click();
    const focusBackground = app.inspector.getByLabel('Focused background hex value', {
      exact: true,
    });
    await focusBackground.fill('345678');
    await focusBackground.press('Enter');

    await app.openPreviewModal();
    const cards = app.previewFrame.locator('[data-cg-upcoming-card]');
    const focus = app.previewFrame.locator('[data-cg-upcoming-card][aria-current="true"]');
    await expect(cards).toHaveCount(3);
    await app.play();
    await expect(focus).toHaveCount(1);
    await expect(focus).toHaveAttribute('data-cg-upcoming-card', 'program-1');
    await expect(focus).toHaveCSS('background-color', 'rgb(52, 86, 120)');

    await app.previewDialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(focus).toHaveAttribute('data-cg-upcoming-card', 'program-2');
    await expect(focus).toHaveCSS('background-color', 'rgb(52, 86, 120)');
    await expect(cards.first()).toHaveCSS('background-color', 'rgb(16, 28, 44)');
    await expect(cards).toHaveCount(3);

    await app.previewDialog.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(focus).toHaveAttribute('data-cg-upcoming-card', 'program-1');
  });

  test('moves Carousel focus across stationary cards and stacks the enlarged card in front', async ({
    app,
  }) => {
    await app.newProject('Upcoming Carousel across cards');
    await app.addUpcomingPrograms();
    const { inspector } = app;
    await inspector.getByLabel('Layout', { exact: true }).selectOption('carousel');
    await inspector.getByLabel('Advance', { exact: true }).selectOption('manual');
    await inspector.getByLabel('Next effect', { exact: true }).selectOption('cut');
    await inspector.getByRole('button', { name: 'Toggle Card appearance' }).click();
    const verticalAlignment = inspector.getByLabel('Vertical alignment', { exact: true });
    await inspector.getByLabel('Card gap mode', { exact: true }).selectOption('fixed');
    const gap = inspector.getByLabel('Card gap', { exact: true });
    await gap.fill('0');
    await gap.press('Enter');
    await inspector.getByRole('button', { name: 'Toggle Carousel focus' }).click();
    await inspector.getByLabel('Focus behavior', { exact: true }).selectOption('across');
    await inspector.getByRole('checkbox', { name: 'Allow focus overlap', exact: true }).check();
    const duration = inspector.getByLabel('Focus move duration', { exact: true });
    await duration.fill('0.8');
    await duration.press('Enter');
    const focusedScale = inspector.getByLabel('Focused scale', { exact: true });
    await focusedScale.fill('150');
    await focusedScale.press('Enter');
    const unfocusedScale = inspector.getByLabel('Unfocused scale', { exact: true });
    await unfocusedScale.fill('100');
    await unfocusedScale.press('Enter');

    const canvasCards = app.canvasFrame.locator('[data-cg-upcoming-card]');
    await expect(canvasCards).toHaveCount(3);
    for (const alignment of ['top', 'center', 'bottom'] as const) {
      await verticalAlignment.selectOption(alignment);
      await expect
        .poll(() =>
          canvasCards.evaluateAll((nodes, alignment) => {
            const rects = nodes.map((node) => node.getBoundingClientRect());
            const anchors = rects.map((rect) =>
              alignment === 'top'
                ? rect.top
                : alignment === 'bottom'
                  ? rect.bottom
                  : rect.top + rect.height / 2,
            );
            const heights = rects.map((rect) => rect.height);
            return (
              anchors.length === 3 &&
              Math.max(...anchors) - Math.min(...anchors) < 1 &&
              Math.max(...heights) - Math.min(...heights) > 5
            );
          }, alignment),
        )
        .toBe(true);
    }

    await app.openPreviewModal();
    await app.play();
    const cards = app.previewFrame.locator('[data-cg-upcoming-card]');
    const focus = app.previewFrame.locator('[data-cg-upcoming-card][aria-current="true"]');
    const firstTitles = ['The Night Report', 'Cities After Dark', 'Into the Wild'];
    await expect(cards.locator('[data-cg-upcoming-title]')).toHaveText(firstTitles);
    await expect(focus).toHaveAttribute('data-cg-upcoming-card', 'program-1');
    await expect(focus).toHaveCSS('z-index', '1');
    const initialCenters = await cards.evaluateAll((nodes) =>
      nodes.map((node) => {
        node.setAttribute('data-test-first-group', '');
        const rect = node.getBoundingClientRect();
        return rect.left + rect.width / 2;
      }),
    );
    const focusedWidth = await focus.evaluate((node) => node.getBoundingClientRect().width);
    const next = app.previewDialog.getByRole('button', { name: 'Next', exact: true });

    for (const id of ['program-2', 'program-3']) {
      await next.click();
      await expect(focus).toHaveAttribute('data-cg-upcoming-card', id);
      await expect(focus).toHaveCSS('z-index', '1');
      await expect(cards.locator('[data-cg-upcoming-title]')).toHaveText(firstTitles);
      await expect(app.previewFrame.locator('[data-test-first-group]')).toHaveCount(3);
      await expect
        .poll(async () =>
          Math.abs(
            (await focus.evaluate((node) => node.getBoundingClientRect().width)) - focusedWidth,
          ),
        )
        .toBeLessThan(1);
      const geometry = await cards.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            center: rect.left + rect.width / 2,
            zIndex: getComputedStyle(node).zIndex,
          };
        }),
      );
      expect(geometry.map((card) => card.center)).toEqual(
        initialCenters.map((center) => expect.closeTo(center, 0)),
      );
      const focusedIndex = geometry.findIndex((card) => card.zIndex === '1');
      const focusedCard = geometry[focusedIndex];
      const precedingCard = geometry[focusedIndex - 1];
      if (focusedCard === undefined || precedingCard === undefined) {
        throw new Error('Expected a focused card and a preceding card');
      }
      expect(precedingCard.zIndex).toBe('0');
      expect(focusedCard.left).toBeLessThan(precedingCard.right);
    }

    await next.click();
    await expect(focus).toHaveAttribute('data-cg-upcoming-card', 'program-4');
    await expect(cards.locator('[data-cg-upcoming-title]')).toHaveText([
      'The Long View',
      'Studio Sessions',
      'Coastline Stories',
    ]);
    await expect(app.previewFrame.locator('[data-test-first-group]')).toHaveCount(0);
  });

  test('sets title and airtime digits independently for normal and focused cards', async ({
    app,
  }) => {
    await app.newProject('Upcoming independent digits');
    await app.addUpcomingPrograms();
    const { inspector, canvasFrame } = app;
    await inspector.getByLabel('Layout', { exact: true }).selectOption('carousel');
    await inspector.getByLabel('Advance', { exact: true }).selectOption('manual');
    await inspector.getByLabel('Next effect', { exact: true }).selectOption('cut');
    await inspector.getByRole('button', { name: 'Toggle Test data' }).click();
    const testProgramme = inspector.getByLabel('Test programme', { exact: true });
    const testTitle = inspector.getByLabel('Test title', { exact: true });
    const testAirtime = inspector.getByLabel('Test airtime', { exact: true });
    for (const [id, title, airtime] of [
      ['program-1', 'Story ١۲3', '١۲:3۴'],
      ['program-2', 'Chapter ۴5٦', '4۵:٦7'],
    ] as const) {
      await testProgramme.selectOption(id);
      await testTitle.fill(title);
      await testTitle.press('Enter');
      await testAirtime.fill(airtime);
      await testAirtime.press('Enter');
    }
    const controls = [
      ['Card title', 'Title digits', 'persian'],
      ['Card airtime', 'Airtime digits', 'latin'],
      ['Focused card title', 'Focused title digits', 'arabic-indic'],
      ['Focused card airtime', 'Focused airtime digits', 'as-typed'],
    ] as const;
    for (const [section, label, digits] of controls) {
      await inspector.getByRole('button', { name: `Toggle ${section}`, exact: true }).click();
      await inspector.getByLabel(label, { exact: true }).selectOption(digits);
    }

    const first = canvasFrame.locator('[data-cg-upcoming-card="program-1"]');
    const second = canvasFrame.locator('[data-cg-upcoming-card="program-2"]');
    await expect(first.locator('[data-cg-upcoming-title]')).toHaveText('Story ١٢٣');
    await expect(first.locator('[data-cg-upcoming-airtime]')).toHaveText('١۲:3۴');
    await expect(second.locator('[data-cg-upcoming-title]')).toHaveText('Chapter ۴۵۶');
    await expect(second.locator('[data-cg-upcoming-airtime]')).toHaveText('45:67');

    await app.openPreviewModal();
    await app.play();
    await app.previewDialog.getByRole('button', { name: 'Next', exact: true }).click();
    const firstPreview = app.previewFrame.locator('[data-cg-upcoming-card="program-1"]');
    const secondPreview = app.previewFrame.locator('[data-cg-upcoming-card="program-2"]');
    await expect(secondPreview).toHaveAttribute('aria-current', 'true');
    await expect(firstPreview.locator('[data-cg-upcoming-title]')).toHaveText('Story ۱۲۳');
    await expect(firstPreview.locator('[data-cg-upcoming-airtime]')).toHaveText('12:34');
    await expect(secondPreview.locator('[data-cg-upcoming-title]')).toHaveText('Chapter ٤٥٦');
    await expect(secondPreview.locator('[data-cg-upcoming-airtime]')).toHaveText('4۵:٦7');
    await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();

    await inspector.getByLabel('Focused title digits', { exact: true }).selectOption('inherit');
    await inspector.getByLabel('Focused airtime digits', { exact: true }).selectOption('inherit');
    await expect(first.locator('[data-cg-upcoming-title]')).toHaveText('Story ۱۲۳');
    await expect(first.locator('[data-cg-upcoming-airtime]')).toHaveText('12:34');
  });

  test('rehearses a sequence at the authored automatic interval', async ({ app }) => {
    await app.newProject('Upcoming sequence');
    await app.addUpcomingPrograms();
    await app.inspector.getByLabel('Layout', { exact: true }).selectOption('sequence');
    await app.inspector.getByLabel('Advance', { exact: true }).selectOption('auto');
    await app.inspector.getByLabel('Next effect', { exact: true }).selectOption('cut');
    const dwell = app.inspector.getByLabel('Dwell (s)', { exact: true });
    await dwell.fill('1');
    await dwell.press('Enter');

    await app.openPreviewModal();
    const cards = app.previewFrame.locator('[data-cg-upcoming-card]');
    await expect(cards).toHaveCount(1);
    await expect(cards).toHaveAttribute('data-cg-upcoming-card', 'program-1');

    await app.play();
    await expect(cards).toHaveAttribute('data-cg-upcoming-card', 'program-2');
    await expect(cards).toHaveCount(1);
  });

  test('reopens the authored project and runs the exported page without sample cards', async ({
    app,
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
    });
    await app.goto();
    await app.newProject('Saved upcoming carousel');
    await app.addUpcomingPrograms();
    await app.inspector.getByLabel('Layout', { exact: true }).selectOption('carousel');
    await app.inspector.getByLabel('Advance', { exact: true }).selectOption('manual');
    await app.inspector.getByLabel('Repeat', { exact: true }).selectOption('count');
    const passes = app.inspector.getByLabel('Pass count', { exact: true });
    await passes.fill('2');
    await passes.press('Enter');
    await app.inspector.getByLabel('Next effect', { exact: true }).selectOption('crossfade');
    const transition = app.inspector.getByLabel('Next effect duration', { exact: true });
    await transition.fill('1.5');
    await transition.press('Enter');
    const visibleCards = app.inspector.getByLabel('Visible cards', { exact: true });
    await visibleCards.fill('5');
    await visibleCards.press('Enter');
    await app.inspector.getByRole('button', { name: 'Toggle Test data' }).click();
    const testTitle = app.inspector.getByLabel('Test title', { exact: true });
    await testTitle.fill('عنوان مخصوص تمرین');
    await testTitle.press('Enter');
    const testMedia = app.inspector.getByRole('button', { name: 'Test media', exact: true });
    const mediaPicker = page.getByRole('dialog', { name: 'Choose test media', exact: true });
    await testMedia.click();
    await expect(mediaPicker).toContainText('Add an image or video in Project Assets');
    await page.keyboard.press('Escape');
    await expect(mediaPicker).toHaveCount(0);
    const imageId = await page.evaluate(async (encoded) => {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const { asset } = await window.cg.assets.storeBytes({
        bytes,
        filename: 'upcoming-rehearsal.png',
        kind: 'image',
      });
      return asset.assetId;
    }, DesignerApp.PNG_1X1.toString('base64'));
    await testMedia.click();
    await mediaPicker.getByRole('button', { name: 'upcoming-rehearsal.png', exact: true }).click();
    await expect(testMedia).toContainText('upcoming-rehearsal.png');
    await app.inspector.getByRole('button', { name: 'Toggle Focused card title' }).click();
    await app.inspector
      .getByLabel('Focused title font size mode', { exact: true })
      .selectOption('fixed');
    const titleSize = app.inspector.getByLabel('Focused title font size', { exact: true });
    await titleSize.fill('28');
    await titleSize.press('Enter');
    await app.inspector.getByRole('button', { name: 'Toggle Carousel focus' }).click();
    await app.inspector.getByLabel('Focus position', { exact: true }).selectOption('end');
    await app.inspector.getByRole('button', { name: 'Toggle Focused card airtime' }).click();
    await app.inspector
      .getByLabel('Focused airtime direction', { exact: true })
      .selectOption('rtl');
    await app.inspector.getByRole('button', { name: 'Toggle Card appearance' }).click();
    await app.inspector.getByLabel('Card gap mode', { exact: true }).selectOption('fixed');
    const gap = app.inspector.getByLabel('Card gap', { exact: true });
    await gap.fill('24');
    await gap.press('Enter');
    await app.inspector.getByRole('button', { name: 'Toggle Media frame' }).click();
    const frameBorder = app.inspector.getByLabel('Frame border width', { exact: true });
    await frameBorder.fill('8');
    await frameBorder.press('Enter');

    const save = page.waitForEvent('download');
    await page.getByRole('button', { name: 'SAVE', exact: true }).click();
    const project = await save;
    const chunks: Buffer[] = [];
    for await (const chunk of await project.createReadStream()) chunks.push(Buffer.from(chunk));

    await app.goto();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import project', exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: project.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: Buffer.concat(chunks),
    });
    await app.expectStudio();
    await expect(app.canvasFrame.locator('[data-cg-upcoming-layout]')).toHaveAttribute(
      'data-cg-upcoming-layout',
      'carousel',
    );
    await expect(app.canvasFrame.locator('[data-cg-upcoming-card]')).toHaveCount(5);
    const firstCard = app.canvasFrame.locator('[data-cg-upcoming-focus]');
    await expect(firstCard).toContainText('عنوان مخصوص تمرین');
    await expect(app.canvasFrame.locator('[data-cg-upcoming-card]').last()).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(firstCard.locator('[data-cg-upcoming-airtime] bdi')).toHaveAttribute('dir', 'rtl');
    await expect(firstCard.locator('[data-cg-upcoming-title]')).toHaveCSS('font-size', '28px');
    await expect(firstCard.locator('[data-cg-upcoming-media]')).toHaveCSS('border-width', '8px');
    await expect
      .poll(() =>
        firstCard
          .locator('img')
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);

    const { html } = await app.exportHtml();
    expect(html).toContain('"type":"upcomingPrograms"');
    expect(html).toContain('"advance":"manual"');
    expect(html).toContain('"visibleCards":5');
    expect(html).toContain('"repeat":2');
    expect(html).toContain('"transitionMs":1500');
    expect(html).toContain('"fontSize":28');
    expect(html).toContain('"focusPosition":"end"');
    expect(html).toContain('"gap":24');
    expect(html).toContain('"borderWidth":8');
    expect(html).not.toContain(imageId);
    expect(html).not.toContain('عنوان مخصوص تمرین');
    const output = await page.context().newPage();
    try {
      await output.setContent(html);
      await output.waitForFunction(
        () => typeof (window as unknown as { play?: unknown }).play === 'function',
      );
      await output.evaluate(async () => {
        const commands = window as unknown as {
          play: () => void | Promise<void>;
          next: () => void | Promise<void>;
        };
        await commands.play();
        await commands.next();
      });
      await expect(output.locator('[data-cg-upcoming-card]')).toHaveCount(0);
    } finally {
      await output.close();
    }
  });
  test('authors card size and color, text placement and a visible media frame', async ({ app }) => {
    await app.newProject('Upcoming artwork');
    await app.addUpcomingPrograms();
    await app.inspector.getByLabel('Layout', { exact: true }).selectOption('single');

    const { inspector } = app;
    const number = async (label: string, value: string) => {
      const input = inspector.getByLabel(label, { exact: true });
      await input.fill(value);
      await input.press('Enter');
    };

    await inspector.getByRole('button', { name: 'Toggle Card appearance' }).click();
    await inspector.getByLabel('Card width mode', { exact: true }).selectOption('fixed');
    await inspector.getByLabel('Card height mode', { exact: true }).selectOption('fixed');
    await number('Card width', '320');
    await number('Card height', '180');
    await number('Corner radius', '18');
    const background = inspector.getByLabel('Card background hex value', { exact: true });
    await background.fill('234567');
    await background.press('Enter');

    await inspector.getByRole('button', { name: 'Toggle Card title' }).click();
    await inspector.getByLabel('Title font size mode', { exact: true }).selectOption('fixed');
    await number('Title font size', '28');
    await number('Title X', '12');
    const textColor = inspector.getByLabel('Title color hex value', { exact: true });
    await textColor.fill('F6B945');
    await textColor.press('Enter');

    await inspector.getByRole('button', { name: 'Toggle Card airtime' }).click();
    await inspector.getByLabel('Airtime font size mode', { exact: true }).selectOption('fixed');
    await number('Airtime font size', '18');

    await inspector.getByRole('button', { name: 'Toggle Media frame' }).click();
    await inspector.getByRole('checkbox', { name: 'Show media frame', exact: true }).check();
    await number('Media X', '10');
    await number('Media width', '60');
    await inspector.getByLabel('Media fit', { exact: true }).selectOption('contain');
    await number('Frame border width', '6');
    await number('Frame corner radius', '15');
    const frameBorderColor = inspector.getByLabel('Frame border hex value', { exact: true });
    await frameBorderColor.fill('35617D');
    await frameBorderColor.press('Enter');
    const frameBackground = inspector.getByLabel('Frame background hex value', { exact: true });
    await frameBackground.fill('102040');
    await frameBackground.press('Enter');

    const card = app.canvasFrame.locator('[data-cg-upcoming-card]');
    const title = card.locator('[data-cg-upcoming-title]');
    const media = card.locator('[data-cg-upcoming-media]');
    await expect(card).toHaveCSS('width', '320px');
    await expect(card).toHaveCSS('height', '180px');
    await expect(card).toHaveCSS('border-radius', '18px');
    await expect(card).toHaveCSS('background-color', 'rgb(35, 69, 103)');
    await expect(title).toHaveCSS('font-size', '28px');
    await expect(title).toHaveCSS('color', 'rgb(246, 185, 69)');
    await expect(card.locator('[data-cg-upcoming-airtime]')).toHaveCSS('font-size', '18px');
    await expect(media).toBeVisible();
    await expect(media).toHaveAttribute('data-cg-upcoming-media-fit', 'contain');
    await expect(media).toHaveCSS('border-width', '6px');
    await expect(media).toHaveCSS('border-color', 'rgb(53, 97, 125)');
    await expect(media).toHaveCSS('border-radius', '15px');
    await expect(media).toHaveCSS('background-color', 'rgb(16, 32, 64)');
    await expect(media).toHaveCSS('overflow', 'hidden');
    const frameWidth = await media.evaluate((node) => {
      const parent = node.closest('[data-cg-upcoming-card]')!;
      return node.getBoundingClientRect().width / parent.getBoundingClientRect().width;
    });
    expect(frameWidth).toBeCloseTo(0.6, 1);
    await number('Frame border width', '0');
    await expect(media).toHaveCSS('border-width', '0px');
  });

  test('keeps time alignment stable and authors separate focused text and Carousel placement', async ({
    app,
  }) => {
    await app.newProject('Upcoming focus and direction');
    await app.addUpcomingPrograms();
    const { inspector, canvasFrame } = app;
    const cards = canvasFrame.locator('[data-cg-upcoming-card]');
    const media = canvasFrame.locator('[data-cg-upcoming-media]');
    const focus = canvasFrame.locator('[data-cg-upcoming-focus]');
    const normal = canvasFrame.locator('[data-cg-upcoming-card="program-2"]');
    await expect(inspector.getByLabel('Layout', { exact: true })).toHaveValue('carousel');
    await expect(media).toHaveCount(3);
    await expect(focus).toHaveAttribute('data-cg-upcoming-card', 'program-1');
    await expect(normal).toHaveCSS('opacity', '0.86');
    await expect(normal.locator('[data-cg-upcoming-title]')).toHaveCSS('font-size', '28px');
    const defaultFocusedTitle = focus.locator('[data-cg-upcoming-title]');
    await expect(defaultFocusedTitle).toHaveCSS('font-size', '30px');
    await expect(defaultFocusedTitle).toHaveCSS('text-align', 'left');
    const defaultFocusedTime = focus.locator('[data-cg-upcoming-airtime]');
    await expect(defaultFocusedTime).toHaveCSS('font-size', '20px');
    await expect(defaultFocusedTime).toHaveCSS('color', 'rgb(177, 245, 237)');
    await expect(defaultFocusedTime).toHaveCSS('text-align', 'left');
    await expect(inspector.getByLabel('Repeat', { exact: true })).toHaveValue('count');
    await expect(inspector.getByLabel('Next effect', { exact: true })).toHaveValue('push-right');
    const focusedSize = await focus.evaluate((node) => node.getBoundingClientRect().width);
    const normalSize = await normal.evaluate((node) => node.getBoundingClientRect().width);
    expect(focusedSize).toBeGreaterThan(normalSize);
    await inspector.getByRole('button', { name: 'Toggle Card appearance' }).click();
    await inspector.getByLabel('Card gap mode', { exact: true }).selectOption('fixed');
    const carouselGap = inspector.getByLabel('Card gap', { exact: true });
    await carouselGap.fill('28');
    await carouselGap.press('Enter');
    const cardPage = canvasFrame.locator('[data-cg-upcoming-page]');
    await expect(cardPage).toHaveCSS('column-gap', '28px');
    const measuredGaps = await cards.evaluateAll((nodes) => {
      const ordered = nodes
        .map((node) => node.getBoundingClientRect())
        .sort((a, b) => a.left - b.left);
      const [first, middle, last] = ordered;
      if (first === undefined || middle === undefined || last === undefined) {
        throw new Error('Expected three cards');
      }
      return [middle.left - first.right, last.left - middle.right];
    });
    for (const gap of measuredGaps) expect(gap).toBeCloseTo(28, 0);
    await carouselGap.fill('0');
    await carouselGap.press('Enter');
    await expect(cardPage).toHaveCSS('column-gap', '0px');

    await inspector.getByRole('button', { name: 'Toggle Test data' }).click();
    const testProgramme = inspector.getByLabel('Test programme', { exact: true });
    const testTitle = inspector.getByLabel('Test title', { exact: true });
    const testAirtime = inspector.getByLabel('Test airtime', { exact: true });
    for (const [id, title, airtime] of [
      ['program-1', 'مستند ایران از آسمان', 'ساعت ۲'],
      ['program-2', 'گفت‌وگوی شبانه', '۰۲:۴۵'],
    ] as const) {
      await testProgramme.selectOption(id);
      await testTitle.fill(title);
      await testTitle.press('Enter');
      await testAirtime.fill(airtime);
      await testAirtime.press('Enter');
    }
    await inspector.getByRole('button', { name: 'Toggle Card airtime' }).click();
    await inspector.getByLabel('Airtime alignment', { exact: true }).selectOption('start');
    await inspector.getByLabel('Airtime digits', { exact: true }).selectOption('as-typed');
    await inspector.getByRole('button', { name: 'Toggle Focused card airtime' }).click();
    await inspector.getByLabel('Focused airtime alignment', { exact: true }).selectOption('start');
    await inspector.getByLabel('Focused airtime digits', { exact: true }).selectOption('as-typed');
    await expect(defaultFocusedTime).toHaveCSS('text-align', 'start');
    const numeric = normal.locator('[data-cg-upcoming-airtime] bdi');
    const words = defaultFocusedTime.locator('bdi');
    await expect(numeric).toHaveText('۰۲:۴۵');
    await expect(words).toHaveText('ساعت ۲');
    for (const value of [numeric, words]) {
      await expect(value).toHaveAttribute('dir', 'auto');
      const rightGap = await value.evaluate(
        (node) =>
          node.closest('[data-cg-upcoming-airtime]')!.getBoundingClientRect().right -
          node.getBoundingClientRect().right,
      );
      expect(Math.abs(rightGap)).toBeLessThan(2);
    }

    await inspector.getByLabel('Airtime direction', { exact: true }).selectOption('ltr');
    await expect(numeric).toHaveAttribute('dir', 'ltr');
    await inspector.getByLabel('Focused airtime direction', { exact: true }).selectOption('rtl');
    await expect(words).toHaveAttribute('dir', 'rtl');
    await expect(numeric).toHaveAttribute('dir', 'ltr');

    await inspector.getByRole('button', { name: 'Toggle Focused card title' }).click();
    await inspector
      .getByLabel('Focused title font size mode', { exact: true })
      .selectOption('fixed');
    const focusedTitleSize = inspector.getByLabel('Focused title font size', { exact: true });
    await focusedTitleSize.fill('41');
    await focusedTitleSize.press('Enter');
    const focusedTitle = focus.locator('[data-cg-upcoming-title]');
    await expect(focusedTitle).toHaveCSS('font-size', '41px');
    await expect(normal.locator('[data-cg-upcoming-title]')).not.toHaveCSS('font-size', '41px');

    await inspector.getByRole('button', { name: 'Toggle Carousel focus' }).click();
    const position = inspector.getByLabel('Focus position', { exact: true });
    const normalOpacity = inspector.getByLabel('Unfocused opacity', { exact: true });
    await normalOpacity.fill('76');
    await normalOpacity.press('Enter');
    await expect(normal).toHaveCSS('opacity', '0.76');
    const focusOpacity = inspector.getByLabel('Focused opacity', { exact: true });
    await focusOpacity.fill('88');
    await focusOpacity.press('Enter');
    await expect(focus).toHaveCSS('opacity', '0.88');
    for (const [slot, expected] of [
      ['start', 0],
      ['center', 1],
      ['end', 2],
    ] as const) {
      await position.selectOption(slot);
      await expect(cards.nth(expected)).toHaveAttribute('aria-current', 'true');
    }
    await inspector.getByLabel('Advance', { exact: true }).selectOption('manual');
    await inspector.getByLabel('Next effect', { exact: true }).selectOption('cut');
    await app.openPreviewModal();
    await app.play();
    const previewCards = app.previewFrame.locator('[data-cg-upcoming-card]');
    await expect(previewCards.nth(2)).toHaveAttribute('data-cg-upcoming-card', 'program-1');
    await app.next();
    await expect(previewCards.nth(2)).toHaveAttribute('data-cg-upcoming-card', 'program-2');
    await expect(previewCards.nth(2)).toHaveAttribute('aria-current', 'true');
    await expect(previewCards).toHaveCount(3);
    await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();
    const { html } = await app.exportHtml();
    expect(html).toContain('"focusPosition":"end"');
    expect(html).toContain('"focusedOpacity":0.88');
    expect(html).toContain('"direction":"rtl"');
    expect(html).toContain('"fontSize":41');
  });

  test('uses the authored Next effect when turning the page', async ({ app }) => {
    await app.newProject('Upcoming transition');
    await app.addUpcomingPrograms();
    await app.inspector.getByLabel('Layout', { exact: true }).selectOption('sequence');
    await app.inspector.getByLabel('Advance', { exact: true }).selectOption('manual');
    const effect = app.inspector.getByLabel('Next effect', { exact: true });
    await expect(effect).toHaveValue('push-right');
    await effect.selectOption('crossfade');
    const duration = app.inspector.getByLabel('Next effect duration', { exact: true });
    await duration.fill('1.5');
    await duration.press('Enter');

    await app.openPreviewModal();
    await app.play();
    const cards = app.previewFrame.locator('[data-cg-upcoming-card]');
    await expect(cards).toHaveAttribute('data-cg-upcoming-card', 'program-1');
    await app.next();
    await expect(cards).toHaveCount(2);
    await expect(cards).toHaveCount(1);
    await expect(cards).toHaveAttribute('data-cg-upcoming-card', 'program-2');
  });

  test('uses the Next effect in an automatically timed Carousel', async ({ app }) => {
    await app.newProject('Upcoming timed transition');
    await app.addUpcomingPrograms();
    await app.inspector.getByLabel('Layout', { exact: true }).selectOption('carousel');
    await app.inspector.getByLabel('Next effect', { exact: true }).selectOption('crossfade');
    const effectDuration = app.inspector.getByLabel('Next effect duration', { exact: true });
    await effectDuration.fill('0.7');
    await effectDuration.press('Enter');
    const dwell = app.inspector.getByLabel('Dwell (s)', { exact: true });
    await dwell.fill('1.5');
    await dwell.press('Enter');
    await expect(effectDuration).toHaveValue('0.7');

    await app.openPreviewModal();
    await app.play();
    const pages = app.previewFrame.locator('[data-cg-upcoming-page]');
    const focused = app.previewFrame.locator('[data-cg-upcoming-focus]');
    await expect(pages).toHaveCount(1);
    await expect(focused).toHaveAttribute('data-cg-upcoming-card', 'program-1');
    await expect(pages).toHaveCount(2);
    await expect(focused).toHaveAttribute('data-cg-upcoming-card', 'program-2');
    await expect(pages).toHaveCount(1);
  });

  test('rehearses independent group entrance and exit around manual page turns', async ({
    app,
  }) => {
    await app.newProject('Upcoming group effects');
    await app.addUpcomingPrograms();
    const { inspector } = app;
    await inspector.getByLabel('Advance', { exact: true }).selectOption('manual');
    await inspector.getByLabel('Next effect', { exact: true }).selectOption('cut');
    await inspector.getByRole('button', { name: 'Toggle Entrance and exit' }).click();
    const entrance = inspector.getByLabel('Entrance effect', { exact: true });
    const exit = inspector.getByLabel('Exit effect', { exact: true });
    await expect(entrance).toHaveValue('none');
    await expect(exit).toHaveValue('none');
    await entrance.selectOption('fade');
    await exit.selectOption('fade');
    const entranceDuration = inspector.getByLabel('Entrance duration', { exact: true });
    await entranceDuration.fill('0.8');
    await entranceDuration.press('Enter');
    const exitDuration = inspector.getByLabel('Exit duration', { exact: true });
    await exitDuration.fill('1.2');
    await exitDuration.press('Enter');

    await app.openPreviewModal();
    const group = app.previewFrame.locator('[data-cg-upcoming-page]');
    const focus = app.previewFrame.locator('[data-cg-upcoming-focus]');
    const inMotion = () =>
      group.evaluate((node) => {
        const opacity = Number(getComputedStyle(node).opacity);
        return opacity > 0 && opacity < 1;
      });
    await app.play();
    await expect.poll(inMotion).toBe(true);
    await expect(group).toHaveCSS('opacity', '1');
    await app.next();
    await expect(focus).toHaveAttribute('data-cg-upcoming-card', 'program-2');
    await expect(group).toHaveCSS('opacity', '1');

    await app.previewDialog.getByRole('button', { name: 'Out', exact: true }).click();
    await expect.poll(inMotion).toBe(true);
    await expect(group).toBeHidden();
    await app.play();
    await expect.poll(inMotion).toBe(true);
    await expect(group).toHaveCSS('opacity', '1');
    await app.stop();
    await expect(group).toBeHidden();

    await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();
    const { html } = await app.exportHtml();
    expect(html).toContain('"entranceEffect":{"edge":"fade","durationMs":800}');
    expect(html).toContain('"exitEffect":{"edge":"fade","durationMs":1200}');
  });

  test('stops after two full passes and wraps when repeat is infinite', async ({ app }) => {
    await app.newProject('Upcoming passes');
    await app.addUpcomingPrograms();
    await app.inspector.getByLabel('Layout', { exact: true }).selectOption('sequence');
    await app.inspector.getByLabel('Advance', { exact: true }).selectOption('manual');
    await app.inspector.getByLabel('Next effect', { exact: true }).selectOption('cut');
    const repeat = app.inspector.getByLabel('Repeat', { exact: true });
    await expect(repeat).toHaveValue('count');
    const passes = app.inspector.getByLabel('Pass count', { exact: true });
    await passes.fill('2');
    await passes.press('Enter');

    const cards = app.previewFrame.locator('[data-cg-upcoming-card]');
    const turnThrough = async () => {
      await expect(cards).toHaveAttribute('data-cg-upcoming-card', 'program-1');
      for (let item = 2; item <= 7; item += 1) {
        await app.next();
        await expect(cards).toHaveAttribute('data-cg-upcoming-card', 'program-' + String(item));
      }
      await app.next();
    };

    await app.openPreviewModal();
    await app.play();
    await turnThrough();
    await turnThrough();
    await expect(cards.filter({ visible: true })).toHaveCount(0);
    await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();

    await repeat.selectOption('infinite');
    await app.openPreviewModal();
    await app.play();
    await turnThrough();
    await expect(cards).toHaveAttribute('data-cg-upcoming-card', 'program-1');
  });

  test('rehearses edited test titles, airtime and a project video in the media frame', async ({
    app,
    page,
  }) => {
    await app.newProject('Upcoming custom promo');
    const fixture = readFileSync(new URL('./fixtures/seek-safe-64x64.webm', import.meta.url));
    const tone = readFileSync(new URL('./fixtures/tone-44k-mono.wav', import.meta.url));
    const [assetId, soundId] = await page.evaluate(
      async ({ video, audio }) => {
        const store = async (encoded: string, filename: string, kind: 'video' | 'audio') => {
          const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
          const { asset } = await window.cg.assets.storeBytes({ bytes, filename, kind });
          return asset.assetId;
        };
        return [
          await store(video, 'upcoming-rehearsal.webm', 'video'),
          await store(audio, 'upcoming-rehearsal.wav', 'audio'),
        ] as const;
      },
      { video: fixture.toString('base64'), audio: tone.toString('base64') },
    );

    await app.addUpcomingPrograms();
    await app.inspector.getByLabel('Layout', { exact: true }).selectOption('carousel');
    await app.inspector.getByLabel('Advance', { exact: true }).selectOption('manual');
    await app.inspector.getByLabel('Next effect', { exact: true }).selectOption('cut');
    await app.inspector.getByRole('button', { name: 'Toggle Test data' }).click();
    const testProgramme = app.inspector.getByLabel('Test programme', { exact: true });
    const add = app.inspector.getByRole('button', { name: 'Add test programme', exact: true });
    await expect(add.locator('svg')).toHaveCount(1);
    await expect(add).toHaveText('');
    await add.click();
    await expect(testProgramme.locator('option')).toHaveCount(8);
    await app.inspector.getByRole('button', { name: 'Remove test programme', exact: true }).click();
    await expect(testProgramme.locator('option')).toHaveCount(7);
    await testProgramme.selectOption('program-2');
    const title = app.inspector.getByLabel('Test title', { exact: true });
    await title.fill('معرفی آزمایشی');
    await title.press('Enter');
    const airtime = app.inspector.getByLabel('Test airtime', { exact: true });
    await airtime.fill('حدود ساعت ۲');
    await airtime.press('Enter');
    await app.inspector.getByRole('button', { name: 'Toggle Card airtime' }).click();
    await app.inspector.getByLabel('Airtime digits', { exact: true }).selectOption('as-typed');
    const testMedia = app.inspector.getByRole('button', { name: 'Test media', exact: true });
    const mediaPicker = page.getByRole('dialog', { name: 'Choose test media', exact: true });
    await testMedia.click();
    const clipChoice = mediaPicker.getByRole('button', { name: 'upcoming-rehearsal.webm' });
    await expect(clipChoice).toBeVisible();
    await expect
      .poll(() => clipChoice.locator('video').evaluate((node: HTMLVideoElement) => node.videoWidth))
      .toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(testMedia).toContainText('No media selected');
    await testMedia.click();
    await mediaPicker.getByRole('button', { name: 'upcoming-rehearsal.webm', exact: true }).click();
    await expect(testMedia).toBeEnabled();
    await expect(testMedia).toContainText('upcoming-rehearsal.webm');
    await expect(testMedia.locator('img')).toBeVisible();
    await page.getByRole('button', { name: 'Project assets', exact: true }).click();
    const projectAssets = page.getByRole('complementary', { name: 'Project assets' });
    await expect(projectAssets.getByTitle('upcoming-rehearsal.webm')).toHaveCount(1);
    await expect(projectAssets.getByTitle('upcoming-rehearsal — poster.png')).toHaveCount(0);
    await testMedia.click();
    await expect(
      mediaPicker.getByRole('button', { name: 'upcoming-rehearsal — poster.png' }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await app.inspector.getByLabel('Test sound', { exact: true }).selectOption(soundId);
    await app.inspector.getByRole('button', { name: 'Move earlier', exact: true }).click();

    await app.openPreviewModal();
    await app.play();
    const card = app.previewFrame.locator('[data-cg-upcoming-focus]');
    await expect(card.locator('[data-cg-upcoming-title]')).toHaveText('معرفی آزمایشی');
    await expect(card.locator('[data-cg-upcoming-airtime]')).toHaveText('حدود ساعت ۲');
    const video = card.locator('[data-cg-upcoming-media] video');
    await expect(video).toBeVisible();
    await expect
      .poll(() => video.evaluate((node: HTMLVideoElement) => node.currentTime))
      .toBeGreaterThan(0);
    const sound = card.locator('audio');
    const audition = app.previewDialog.getByRole('checkbox', { name: 'Audition focused video' });
    await expect(audition).not.toBeChecked();
    await expect(sound).toHaveJSProperty('paused', true);
    await audition.check();
    await expect(sound).toHaveJSProperty('paused', false);
    await app.pause();
    await expect(sound).toHaveJSProperty('paused', true);
    await app.play();
    await expect(sound).toHaveJSProperty('paused', false);
    await app.next();
    await expect(card).toHaveAttribute('data-cg-upcoming-card', 'program-1');
    await expect(card.locator('video')).toHaveCount(0);
    const neighbor = app.previewFrame.locator('[data-cg-upcoming-card="program-2"]');
    const still = neighbor.locator('img[data-cg-upcoming-video-poster]');
    await expect(still).toBeVisible();
    await expect
      .poll(() => still.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
    await expect(neighbor.locator('video')).toHaveCount(0);
    await expect(app.previewFrame.locator('audio[data-cg-upcoming-sample-audio]')).toHaveCount(0);
    await app.previewDialog.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(sound).toHaveJSProperty('paused', false);
    await app.stop();
    await expect
      .poll(() =>
        app.previewFrame
          .locator('audio[data-cg-upcoming-sample-audio]')
          .evaluateAll((nodes) => nodes.every((node) => (node as HTMLAudioElement).paused)),
      )
      .toBe(true);
    await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await app.inspector.getByLabel('Layout', { exact: true }).selectOption('grid');
    await app.openPreviewModal();
    await app.play();
    await expect(app.previewFrame.locator('[data-cg-upcoming-card]')).toHaveCount(3);
    await expect(app.previewFrame.locator('img[data-cg-upcoming-video-poster]')).toBeVisible();
    await expect(app.previewFrame.locator('[data-cg-upcoming-media] video')).toHaveCount(0);
    await expect(audition).toHaveCount(0);
    await expect(app.previewFrame.locator('audio[data-cg-upcoming-sample-audio]')).toHaveCount(0);
    await app.previewDialog.getByRole('button', { name: 'Close', exact: true }).click();
    const { html } = await app.exportHtml();
    expect(html).not.toContain(assetId);
    expect(html).not.toContain(soundId);
    expect(html).not.toContain('معرفی آزمایشی');
    expect(html).not.toContain('upcoming-preview/');

    await app.inspector.getByLabel('Layout', { exact: true }).selectOption('single');
    const source = app.inspector.getByLabel('On-air data', { exact: true });
    await expect(source).toHaveValue('rehearsal');
    await source.selectOption('prepared');
    const prepared = await app.exportHtml();
    expect(prepared.html).toContain('"dataSource":"prepared"');
    expect(prepared.html).toContain(assetId);
    expect(prepared.html).not.toContain('upcoming-preview/');
    const output = await page.context().newPage();
    try {
      await output.setContent(prepared.html);
      await output.waitForFunction(
        () => typeof (window as unknown as { play?: unknown }).play === 'function',
      );
      await output.evaluate(async () => {
        await (window as unknown as { play: () => void | Promise<void> }).play();
      });
      const aired = output.locator('[data-cg-upcoming-card]');
      await expect(aired.locator('[data-cg-upcoming-title]')).toHaveText('معرفی آزمایشی');
      await expect(aired.locator('[data-cg-upcoming-airtime]')).toHaveText('حدود ساعت ۲');
      const airedVideo = aired.locator('video');
      await expect(airedVideo).toBeVisible();
      await expect
        .poll(() => airedVideo.evaluate((node: HTMLVideoElement) => node.currentTime))
        .toBeGreaterThan(0);
    } finally {
      await output.close();
    }
  });

  test('closes the whole content-driven graphic through its authored Outro', async ({ app }) => {
    await app.newProject('Upcoming content outro');
    await app.setSceneDuration(200);
    await app.addOutPoint();
    await app.setPlayoutTiming('auto-out');
    await app.addRectangle({ x: 215, y: 115 });
    const backgroundId = await app.firstCanvasElement.getAttribute('data-cg-element-id');
    if (backgroundId === null) throw new Error('Rectangle is missing from the scene');
    await app.scrubToFrame(151);
    await app.toggleInspectorKeyframe('opacity');
    await app.scrubToFrame(198);
    await app.setInspectorNumber('Opacity', 0);
    await expect(app.inspectorDiamond('opacity')).toHaveAttribute('data-variant', 'at-frame');
    await app.scrubToFrame(0);

    await app.addUpcomingPrograms();
    await app.inspector.getByLabel('Layout', { exact: true }).selectOption('sequence');
    await app.inspector.getByLabel('Advance', { exact: true }).selectOption('manual');
    await app.inspector.getByLabel('Next effect', { exact: true }).selectOption('cut');
    await app.inspector.getByLabel('Repeat', { exact: true }).selectOption('count');
    await app.inspector.getByRole('checkbox', { name: 'Drive content hold' }).check();
    await app.setHoldSource('content-driven');
    await expect(
      app.inspector.getByRole('checkbox', { name: 'Upcoming Programs drives the hold' }),
    ).toBeChecked();

    await app.openPreviewModal();
    await app.play();
    const cards = app.previewFrame.locator('[data-cg-upcoming-card]');
    const background = app.previewElement(backgroundId);
    await expect(background).toHaveCSS('opacity', '1');
    for (let index = 2; index <= 7; index += 1) {
      await app.next();
      await expect(cards).toHaveAttribute('data-cg-upcoming-card', 'program-' + String(index));
    }
    await expect(background).toHaveCSS('opacity', '1');
    await app.next();
    await expect
      .poll(() => background.evaluate((node) => Number(getComputedStyle(node).opacity)))
      .toBeLessThan(0.9);
    await expect(app.previewDialog.getByRole('status', { name: 'Preview frame' })).toContainText(
      '200 / 200',
    );
  });
});
