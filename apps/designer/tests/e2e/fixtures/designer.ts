import {
  test as base,
  expect,
  type Download,
  type FrameLocator,
  type Locator,
  type Page,
} from '@playwright/test';

/**
 * Designer E2E fixtures (P-005) — the SCALING seam.
 *
 * `DesignerApp` is a page object wrapping the Designer's common actions as
 * documented, stable methods. New E2E tests COMPOSE these helpers instead of
 * rewriting selectors; new features add a helper here once and reuse it. Selectors
 * prefer accessible roles/labels (the app has ~109 aria-labels); the only
 * `data-testid` is the bespoke canvas surface.
 *
 * Every test boots through the `app` fixture, which sets `window.CG_E2E` BEFORE app
 * JS (→ MemoryWorkspace + MemoryKv, isolated per page) and neutralizes the native
 * file pickers so nothing blocks on a dialog.
 */
export class DesignerApp {
  constructor(readonly page: Page) {}

  // ── boot ──────────────────────────────────────────────────────────────────

  /** Load the app at `/` (test mode is armed by the fixture's init script). */
  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.page.getByRole('button', { name: 'New project' })).toBeVisible();
  }

  /** Wait until the studio (canvas) is showing — a composition is open. */
  async expectStudio(): Promise<void> {
    await expect(this.canvas).toBeVisible();
  }

  /**
   * From the landing screen: create a fresh project (which opens one composition).
   * Leaves the studio ready with `comp1` open.
   */
  async newProject(name = 'E2E'): Promise<void> {
    await this.page.getByRole('button', { name: 'New project' }).click();
    const dialog = this.page.getByRole('dialog', { name: 'New project' });
    await dialog.getByLabel('Project name').fill(name);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await this.expectStudio();
  }

  // ── compositions ────────────────────────────────────────────────────────────

  /** Show the Compositions panel in the left rail. */
  async showCompositions(): Promise<void> {
    await this.page.getByRole('button', { name: 'Compositions' }).click();
  }

  /**
   * Create a new (empty) composition via the panel's "+", commit the inline rename
   * (optionally to `name`), and open it.
   */
  async newComposition(name?: string): Promise<void> {
    await this.showCompositions();
    await this.page.getByRole('button', { name: 'New composition' }).click();
    // The "+" starts an inline rename on the new row (an <input> in the row).
    const renameInput = this.page.locator('.cg-comp-row input').first();
    if (await renameInput.count()) {
      if (name !== undefined) await renameInput.fill(name);
      await renameInput.press('Enter');
    }
  }

  /** Open an existing composition by its (visible) name. */
  async openComposition(name: string): Promise<void> {
    await this.showCompositions();
    await this.page.locator('.cg-comp-row', { hasText: name }).first().dblclick();
    await this.expectStudio();
  }

  /**
   * Nest a composition (by name) as an instance inside the currently-open one, via
   * the panel row's "Add to composition" context-menu item.
   */
  async nestCompositionInstance(childName: string): Promise<void> {
    await this.showCompositions();
    await this.page
      .locator('.cg-comp-row', { hasText: childName })
      .first()
      .click({ button: 'right' });
    await this.page.getByRole('menuitem', { name: 'Add to composition' }).click();
  }

  // ── canvas / elements ────────────────────────────────────────────────────────

  get canvas(): Locator {
    return this.page.getByTestId('canvas-surface');
  }

  /** Select a canvas tool by its toolbar label (Select / Text / Ticker / Rectangle / Ellipse). */
  async selectTool(
    label: 'Select' | 'Text' | 'Ticker' | 'Rectangle' | 'Ellipse' | 'Hand (pan)',
  ): Promise<void> {
    await this.page.getByRole('button', { name: label, exact: true }).click();
  }

  /**
   * Add a text element by placing the Text tool on the canvas. The new element is
   * auto-selected (inspector shows it). Returns nothing — assert via the inspector
   * or the preview.
   */
  async addTextElement(pos: { x: number; y: number } = { x: 240, y: 140 }): Promise<void> {
    await this.selectTool('Text');
    await this.canvas.click({ position: pos });
  }

  /** Add a rectangle by placing the Rectangle tool on the canvas (auto-selected). */
  async addRectangle(pos: { x: number; y: number } = { x: 240, y: 200 }): Promise<void> {
    await this.selectTool('Rectangle');
    await this.canvas.click({ position: pos });
  }

  /** D-028 — add a ticker band by placing the Ticker tool (auto-selected). */
  async addTicker(pos: { x: number; y: number } = { x: 120, y: 260 }): Promise<void> {
    await this.selectTool('Ticker');
    await this.canvas.click({ position: pos });
  }

  /**
   * D-028 — an items-editor row input by its accessible name: the editor labels
   * rows "<label> item <n>" (1-based). In the inspector the label is the element
   * name ("Ticker"); in the preview form it's the field label / data key.
   */
  tickerItemInput(label: string, n: number, scope?: Locator): Locator {
    return (scope ?? this.page).getByRole('textbox', {
      name: `${label} item ${String(n)}`,
      exact: true,
    });
  }

  /** D-028 — append an empty item via the items editor's "Add item" button. */
  async addTickerItem(scope?: Locator): Promise<void> {
    await (scope ?? this.page).getByRole('button', { name: 'Add item' }).click();
  }

  /** Drag the currently-selected shape on the canvas by (dx, dy) screen pixels. */
  async dragShape(from: { x: number; y: number }, by: { x: number; y: number }): Promise<void> {
    const box = await this.canvas.boundingBox();
    if (box === null) throw new Error('canvas not laid out');
    await this.page.mouse.move(box.x + from.x, box.y + from.y);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + from.x + by.x, box.y + from.y + by.y, { steps: 8 });
    await this.page.mouse.up();
  }

  /** Click the canvas at a position (e.g. to select an element or place a binding). */
  async clickCanvas(pos: { x: number; y: number }): Promise<void> {
    await this.selectTool('Select');
    await this.canvas.click({ position: pos });
  }

  /** Deselect everything (Escape on the canvas) → the inspector shows COMPOSITION. */
  async deselect(): Promise<void> {
    await this.canvas.click({ position: { x: 6, y: 6 } });
  }

  // ── inspector ────────────────────────────────────────────────────────────────

  get inspector(): Locator {
    return this.page.getByRole('complementary', { name: 'Inspector' });
  }

  get dataKeyInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Data key' });
  }

  get elementNameInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Element name' });
  }

  /** Expand the inspector's "Dynamic / Data" section (collapsed for keyless text). */
  async expandDynamicData(): Promise<void> {
    if (await this.dataKeyInput.isVisible().catch(() => false)) return;
    await this.page.getByRole('button', { name: 'Toggle Dynamic / Data' }).click();
  }

  /** Set the selected text element's data key (creates the backing field + binding). */
  async setDataKey(key: string): Promise<void> {
    await this.expandDynamicData();
    await this.dataKeyInput.fill(key);
    await this.dataKeyInput.press('Enter');
  }

  /** Set the selected element's name. */
  async setElementName(name: string): Promise<void> {
    await this.elementNameInput.fill(name);
    await this.elementNameInput.press('Enter');
  }

  /**
   * Set the open composition's playout mode in the inspector (non-preview). The
   * Playout section lives in the COMPOSITION inspector, so deselect first.
   */
  async setPlayoutTiming(mode: 'manual' | 'auto-out' | 'loop-cycle'): Promise<void> {
    await this.deselect();
    await this.page.getByRole('combobox', { name: 'Playout mode' }).selectOption(mode);
  }

  /**
   * D-028 — set the composition's hold source (the select only renders when the
   * composition contains a ticker and the mode isn't manual). Deselects first.
   */
  async setHoldSource(source: 'timed' | 'content-driven'): Promise<void> {
    await this.deselect();
    await this.page.getByRole('combobox', { name: 'Hold source' }).selectOption(source);
  }

  /**
   * Bind a field (by data key) to a canvas element: deselect → open the field card
   * in the COMPOSITION inspector → "Bind from canvas" → click the element on canvas.
   */
  async bindFromCanvas(fieldId: string, canvasPos: { x: number; y: number }): Promise<void> {
    await this.deselect();
    const card = this.fieldCard(fieldId);
    await card.getByRole('button', { name: /Bind from canvas|Click a canvas element/ }).click();
    await this.canvas.click({ position: canvasPos });
  }

  /** A field card in the COMPOSITION inspector's FIELDS panel, by its data key. */
  fieldCard(fieldId: string): Locator {
    return this.page.getByTestId(`field-card-${fieldId}`);
  }

  // ── keyframes ────────────────────────────────────────────────────────────────

  /**
   * Add (or toggle) a keyframe at the current playhead via the timeline track-row
   * diamond for a property label (e.g. "Opacity", "Position X"). The element must be
   * selected so its tracks show.
   */
  async addKeyframeViaDiamond(propertyLabel: string): Promise<void> {
    await this.page
      .getByRole('button', { name: new RegExp(`Toggle keyframe for ${propertyLabel}`, 'i') })
      .first()
      .click();
  }

  /** A timeline lane keyframe diamond at a given frame. */
  keyframeAtFrame(frame: number): Locator {
    return this.page.getByRole('button', { name: `Keyframe at frame ${String(frame)}` });
  }

  // ── preview modal ─────────────────────────────────────────────────────────────

  /** Open the Preview modal from the toolbar. */
  async openPreviewModal(): Promise<void> {
    await this.page.getByRole('button', { name: 'PREVIEW', exact: true }).click();
    await expect(this.previewDialog).toBeVisible();
  }

  get previewDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Composition preview' });
  }

  /** The preview's runtime iframe (same-origin srcDoc — readable). */
  get previewFrame(): FrameLocator {
    return this.page.frameLocator('iframe[title="cgpreview-modal"]');
  }

  /** A rendered element inside the preview, by the runtime's `data-cg-element-id`. */
  previewElement(elementId: string): Locator {
    return this.previewFrame.locator(`[data-cg-element-id="${elementId}"]`);
  }

  /** Set a preview field value live (the form posts an update to the runtime). */
  async setPreviewField(label: string, value: string): Promise<void> {
    const input = this.previewDialog.getByLabel(label, { exact: true });
    await input.fill(value);
    await input.blur();
  }

  // preview transport
  async play(): Promise<void> {
    await this.previewDialog.getByRole('button', { name: /Play|Resume/ }).click();
  }
  async pause(): Promise<void> {
    await this.previewDialog.getByRole('button', { name: /Pause/ }).click();
  }
  async stop(): Promise<void> {
    await this.previewDialog.getByRole('button', { name: /Stop/ }).click();
  }
  async next(): Promise<void> {
    await this.previewDialog.getByRole('button', { name: /Next/ }).click();
  }

  /**
   * Set a preview scope's session-only timing. `scope` is the group title shown in
   * the modal ("Timing (session)" for the root, "Timing — <instance>" for a child).
   */
  async setPreviewTiming(
    scope: string,
    opts: {
      mode?: 'manual' | 'auto-out' | 'loop-cycle' | 'content-driven';
      holdMs?: number;
      repeat?: number;
    },
  ): Promise<void> {
    if (opts.mode !== undefined) {
      await this.previewDialog
        .getByRole('combobox', { name: 'Preview playout mode' })
        .first()
        .selectOption(opts.mode);
    }
    if (opts.holdMs !== undefined) {
      await this.previewDialog
        .getByRole('spinbutton', { name: 'Preview hold duration in milliseconds' })
        .first()
        .fill(String(opts.holdMs));
    }
    if (opts.repeat !== undefined) {
      await this.previewDialog
        .getByRole('spinbutton', { name: 'Preview repeat count' })
        .first()
        .fill(String(opts.repeat));
    }
    void scope; // reserved: per-group scoping when multiple timing groups are shown
  }

  // ── export ─────────────────────────────────────────────────────────────────

  /** Click "HTML" and capture the single-file HTML download. Returns the file text. */
  async exportHtml(): Promise<{ filename: string; html: string }> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.page.getByRole('button', { name: 'HTML', exact: true }).click();
    const download: Download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return { filename: download.suggestedFilename(), html: Buffer.concat(chunks).toString('utf8') };
  }
}

/** The extended `test` every spec imports: provides a booted `app`, dialog-free. */
export const test = base.extend<{ app: DesignerApp }>({
  app: async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as unknown as { CG_E2E: boolean }).CG_E2E = true;
      // Neutralize native pickers so disk save / export fall back to a capturable
      // <a download> and nothing blocks on a dialog.
      for (const k of ['showSaveFilePicker', 'showOpenFilePicker', 'showDirectoryPicker']) {
        try {
          Object.defineProperty(window, k, { configurable: true, value: undefined });
        } catch {
          /* ignore */
        }
      }
    });
    // Any stray alert/confirm (e.g. export-blocked) must never hang the run.
    page.on('dialog', (d) => void d.dismiss());
    const app = new DesignerApp(page);
    await app.goto();
    await use(app);
  },
});

export { expect };
