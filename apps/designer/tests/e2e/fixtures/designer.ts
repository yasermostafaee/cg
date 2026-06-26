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

  /** Select a canvas tool by its toolbar label (Select / Text / Ticker / Clock / Sequence / …). */
  async selectTool(
    label:
      | 'Select'
      | 'Text'
      | 'Ticker'
      | 'Clock'
      | 'Sequence'
      | 'Repeater'
      | 'Rectangle'
      | 'Ellipse'
      | 'Image (logo)'
      | 'Hand (pan)',
  ): Promise<void> {
    await this.page.getByRole('button', { name: label, exact: true }).click();
  }

  // ── shared image library (D-040) ───────────────────────────────────────────

  /** A 1×1 transparent PNG — a valid image the browser can decode + render. */
  static readonly PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  /** Show the Shared Library panel in the left rail. */
  async showSharedLibrary(): Promise<void> {
    await this.page.getByRole('button', { name: 'Shared library', exact: true }).click();
  }

  /** The Shared Library panel's thumbnail grid (or empty-state wrapper). */
  get sharedLibraryGrid(): Locator {
    return this.page.locator('[data-role="shared-library-grid"]');
  }

  /**
   * Add an image to the shared library via the panel's "+" (drives the real
   * file-chooser the bridge opens). Defaults to a 1×1 PNG with the filename
   * appended (trailing bytes after IEND still decode) so distinct filenames get
   * distinct sha256s and don't collapse under the store's dedupe.
   */
  async addSharedImage(filename = 'logo.png', bytes?: Buffer): Promise<void> {
    const data = bytes ?? Buffer.concat([DesignerApp.PNG_1X1, Buffer.from(filename)]);
    await this.showSharedLibrary();
    const chooser = this.page.waitForEvent('filechooser');
    await this.page.getByRole('button', { name: 'Add library image', exact: true }).click();
    await (await chooser).setFiles({ name: filename, mimeType: 'image/png', buffer: data });
    // The new thumbnail (button with the file's display name) appears once imported.
    await expect(
      this.sharedLibraryGrid.getByRole('button', {
        name: new RegExp(filename.replace(/\.[^.]+$/, '')),
      }),
    ).toBeVisible();
  }

  /** Click a shared-library thumbnail to make it the logo tool's active image. */
  async selectSharedImage(displayName: string): Promise<void> {
    await this.sharedLibraryGrid.getByRole('button', { name: new RegExp(displayName) }).click();
  }

  /** Place the logo tool on the canvas (stamps the active/first library image). */
  async placeLogo(pos: { x: number; y: number } = { x: 240, y: 200 }): Promise<void> {
    await this.selectTool('Image (logo)');
    await this.canvas.click({ position: pos });
  }

  /** Count image elements rendered in the canvas preview iframe. */
  async canvasImageCount(): Promise<number> {
    return this.canvasFrame.locator('img[data-cg-element-id]').count();
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

  /** Add an ellipse by placing the Ellipse tool on the canvas (auto-selected). */
  async addEllipse(pos: { x: number; y: number } = { x: 240, y: 200 }): Promise<void> {
    await this.selectTool('Ellipse');
    await this.canvas.click({ position: pos });
  }

  /** D-028 — add a ticker band by placing the Ticker tool (auto-selected). */
  async addTicker(pos: { x: number; y: number } = { x: 120, y: 260 }): Promise<void> {
    await this.selectTool('Ticker');
    await this.canvas.click({ position: pos });
  }

  /** D-027 — add a clock by placing the Clock tool (auto-selected). */
  async addClock(pos: { x: number; y: number } = { x: 240, y: 160 }): Promise<void> {
    await this.selectTool('Clock');
    await this.canvas.click({ position: pos });
  }

  /** D-029 — add a now/next sequence by placing the Sequence tool (auto-selected). */
  async addSequence(pos: { x: number; y: number } = { x: 160, y: 200 }): Promise<void> {
    await this.selectTool('Sequence');
    await this.canvas.click({ position: pos });
  }

  /** D-029 — set the SELECTED sequence's default dwell (seconds) via the inspector. */
  async setSequenceDwell(seconds: number): Promise<void> {
    const dwell = this.page.getByLabel('default dwell', { exact: true });
    await dwell.fill(String(seconds));
    await dwell.press('Enter');
  }

  /** D-030 — add a repeater by placing the Repeater tool (guard-gated insert). */
  async addRepeater(pos: { x: number; y: number } = { x: 200, y: 120 }): Promise<void> {
    await this.selectTool('Repeater');
    await this.canvas.click({ position: pos });
  }

  /** D-020 — add the default out point via the COMPOSITION inspector link. */
  async addOutPoint(): Promise<void> {
    await this.deselect();
    await this.page.getByRole('button', { name: 'Add an out point' }).click();
  }

  /**
   * D-027 — switch the SELECTED clock to a duration countdown via the inspector
   * (the mode switch seeds a default target; the duration field is in seconds).
   */
  async setClockCountdown(seconds: number): Promise<void> {
    await this.inspector.getByRole('combobox', { name: 'mode' }).selectOption('countdown');
    const duration = this.page.getByLabel('duration', { exact: true });
    await duration.fill(String(seconds));
    await duration.press('Enter');
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

  // ── multi-select (D-041) ──────────────────────────────────────────────────

  /** The canvas's live preview iframe (same-origin srcDoc — readable). */
  get canvasFrame(): FrameLocator {
    return this.page.frameLocator('iframe[title="cgpreview"]');
  }

  /** Shift-click the canvas at a position — toggles that element in the multi-selection. */
  async shiftClickCanvas(pos: { x: number; y: number }): Promise<void> {
    await this.selectTool('Select');
    await this.canvas.click({ position: pos, modifiers: ['Shift'] });
  }

  /** Drag a group: press over a selected element at `from` and move by (dx,dy). */
  async groupDrag(from: { x: number; y: number }, by: { x: number; y: number }): Promise<void> {
    await this.selectTool('Select');
    await this.dragShape(from, by);
  }

  /** The multi-selection inspector (shown when more than one element is selected). */
  get multiInspector(): Locator {
    return this.page.getByTestId('multi-select-inspector');
  }

  /** D-049 — the per-shape selection boxes (one per selected shape). */
  get multiBoxes(): Locator {
    return this.page.getByTestId('multi-select-box');
  }

  /** D-049 — the (removed) single union bounding box; should never be present. */
  get multiBbox(): Locator {
    return this.page.getByTestId('multi-select-bbox');
  }

  /** Set the multi-selection's shared Fill via the inspector's FillField popover. */
  async setMultiFill(hex: string): Promise<void> {
    await this.multiInspector.getByRole('button', { name: 'fill fill' }).click();
    const hexInput = this.page.getByRole('textbox', { name: 'Hex colour value' });
    await hexInput.fill(hex);
    await hexInput.press('Enter');
  }

  /** Count canvas-preview elements whose computed background equals `rgb`. */
  async canvasElementsWithBackground(rgb: string): Promise<number> {
    return this.canvasFrame
      .locator('[data-cg-element-id]')
      .evaluateAll(
        (els, want) =>
          els.filter((e) => getComputedStyle(e as HTMLElement).backgroundColor === want).length,
        rgb,
      );
  }

  /** Count canvas-preview elements with a non-zero top-left border radius (D-042). */
  async canvasElementsWithRoundedCorner(): Promise<number> {
    return this.canvasFrame.locator('[data-cg-element-id]').evaluateAll(
      (els) =>
        els.filter((e) => {
          const r = getComputedStyle(e as HTMLElement).borderTopLeftRadius;
          return r !== '' && r !== '0px';
        }).length,
    );
  }

  /** Count canvas-preview elements that render a border (non-`0px` border width) (D-042). */
  async canvasElementsWithBorder(): Promise<number> {
    return this.canvasFrame.locator('[data-cg-element-id]').evaluateAll(
      (els) =>
        els.filter((e) => {
          const w = getComputedStyle(e as HTMLElement).borderTopWidth;
          return w !== '' && w !== '0px';
        }).length,
    );
  }

  /** Count canvas-preview elements whose computed opacity is below 1 (D-053). */
  async canvasElementsWithOpacityBelow1(): Promise<number> {
    return this.canvasFrame
      .locator('[data-cg-element-id]')
      .evaluateAll(
        (els) => els.filter((e) => Number(getComputedStyle(e as HTMLElement).opacity) < 1).length,
      );
  }

  /**
   * D-053 — press-drag a number field (spinbutton) horizontally by `dx` px,
   * pausing mid-gesture (before pointerup) to run `midDrag` so a test can assert
   * the LIVE update, then release. Drives the field's own drag-scrub surface.
   */
  async scrubField(field: Locator, dx: number, midDrag?: () => Promise<void>): Promise<void> {
    const box = await field.boundingBox();
    if (box === null) throw new Error('field not laid out');
    const cy = box.y + box.height / 2;
    const startX = box.x + box.width / 2;
    await this.page.mouse.move(startX, cy);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + dx, cy, { steps: 12 });
    if (midDrag !== undefined) await midDrag();
    await this.page.mouse.up();
  }

  /** Ctrl/Cmd+Z undo (the app skips this while a text input is focused). */
  async undo(): Promise<void> {
    await this.page.keyboard.press('Control+z');
  }

  // ── timeline layer rows (D-047 reorder) ──────────────────────────────────────

  /** The timeline names-column element rows, in displayed top→bottom order (ids). */
  async timelineRowIds(): Promise<string[]> {
    return this.page
      .locator('.cg-tl-row[data-element-id]')
      .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-element-id') ?? ''));
  }

  /** The drop indicator shown while a layer-reorder drag is active. */
  get reorderIndicator(): Locator {
    return this.page.getByTestId('reorder-drop-indicator');
  }

  /**
   * D-047 — pointer-drag the layer row `srcId` so it drops just above row `destId`,
   * reordering the z-stack. Presses over the row's name (past the chevron/icon, clear
   * of the visibility/lock toggles) and moves in steps so the drag threshold is
   * crossed; an optional `midDrag` runs before release (e.g. to assert the indicator).
   */
  async dragRowAboveRow(
    srcId: string,
    destId: string,
    midDrag?: () => Promise<void>,
  ): Promise<void> {
    const src = this.page.locator(`.cg-tl-row[data-element-id="${srcId}"]`);
    const dest = this.page.locator(`.cg-tl-row[data-element-id="${destId}"]`);
    const sb = await src.boundingBox();
    const db = await dest.boundingBox();
    if (sb === null || db === null) throw new Error('timeline rows not laid out');
    const x = sb.x + Math.min(sb.width - 40, 60);
    await this.page.mouse.move(x, sb.y + sb.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(x, db.y + 2, { steps: 12 });
    if (midDrag !== undefined) await midDrag();
    await this.page.mouse.up();
  }

  /**
   * B-029 — trim an element's START edge on the timeline by dragging its lifespan
   * resize-left gripper right by `dxPx` screen pixels, giving it `lifespan.in > 0`.
   * Any positive drag is enough to reproduce the start-trim; the exact frame count
   * depends on the lane width.
   */
  async trimElementStart(elementId: string, dxPx = 60): Promise<void> {
    const handle = this.page.getByTestId(`lifespan-trim-start-${elementId}`);
    const box = await handle.boundingBox();
    if (box === null) throw new Error('lifespan trim handle not laid out');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await this.page.mouse.move(cx, cy);
    await this.page.mouse.down();
    await this.page.mouse.move(cx + dxPx, cy, { steps: 10 });
    await this.page.mouse.up();
  }

  // ── layer rows / context menu (D-076 / D-077) ───────────────────────────────

  /** Count of timeline element ("layer") rows currently shown. */
  async rowCount(): Promise<number> {
    return this.page.locator('.cg-tl-row[data-element-id]').count();
  }

  /** Count of selected (highlighted) timeline rows. */
  async selectedRowCount(): Promise<number> {
    return this.page.locator('.cg-tl-row.cg-tl-selected').count();
  }

  /** The layer right-click menu (D-076). */
  get layerMenu(): Locator {
    return this.page.getByRole('menu', { name: 'Layer actions' });
  }

  /** A layer-menu item by its visible label (Copy / Cut / Paste / Duplicate / Delete / Fit workspace / Color).
   *  Non-exact: items may carry a trailing shortcut hint, e.g. "Copy (Ctrl+C)". */
  layerMenuItem(name: string): Locator {
    return this.layerMenu.getByRole('menuitem', { name });
  }

  /** Right-click the first SELECTED layer row to open the layer menu (keeps the whole selection). */
  async openMenuOnSelectedRow(): Promise<void> {
    await this.page.locator('.cg-tl-row.cg-tl-selected').first().click({ button: 'right' });
    await expect(this.layerMenu).toBeVisible();
  }

  /** Right-click the (single) UNSELECTED layer row — D-076 retargets the menu to just it. */
  async openMenuOnUnselectedRow(): Promise<void> {
    await this.page.locator('.cg-tl-row:not(.cg-tl-selected)').first().click({ button: 'right' });
    await expect(this.layerMenu).toBeVisible();
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
   * Set a numeric inspector field by its aria-label (e.g. 'Scale X', 'Scale Y',
   * 'Rotation', 'Width'). Scale/opacity fields display as a percentage (200 = 2×);
   * rotation in degrees. Commits with Enter.
   */
  async setInspectorNumber(label: string, value: number): Promise<void> {
    const field = this.inspector.getByRole('spinbutton', { name: label, exact: true });
    await field.fill(String(value));
    await field.press('Enter');
  }

  /** B-022 — the single-selection gizmo frame outline (the projected parallelogram). */
  get gizmoFrame(): Locator {
    return this.page.getByTestId('gizmo-frame');
  }

  /** The first rendered element box inside the canvas preview iframe (its screen rect). */
  get firstCanvasElement(): Locator {
    return this.canvasFrame.locator('[data-cg-element-id]').first();
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

  /**
   * The right-inspector keyframe diamond for an animatable `property` (e.g.
   * `position.x`), scoped to whichever inspector aside is shown (single or
   * multi-select). Its `data-variant` is `empty` / `at-frame` / `partial` (D-054).
   */
  inspectorDiamond(property: string): Locator {
    return this.page
      .getByRole('complementary', { name: 'Inspector' })
      .getByRole('button', { name: new RegExp(`Toggle keyframe for ${property}\\b`, 'i') })
      .first();
  }

  /** Click the inspector keyframe diamond for `property` (single or multi). */
  async toggleInspectorKeyframe(property: string): Promise<void> {
    await this.inspectorDiamond(property).click();
  }

  // ── preview modal ─────────────────────────────────────────────────────────────

  /** The per-composition action bar above the canvas (D-086 Phase B). */
  get compositionActionBar(): Locator {
    return this.page.getByTestId('composition-action-bar');
  }

  /** Open the Preview modal from the per-composition action bar. */
  async openPreviewModal(): Promise<void> {
    await this.compositionActionBar.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(this.previewDialog).toBeVisible();
  }

  get previewDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Composition preview' });
  }

  /** The preview's runtime iframe (same-origin srcDoc — readable), scoped to the
   *  preview dialog so it's robust to the iframe's title attribute. */
  get previewFrame(): FrameLocator {
    return this.previewDialog.frameLocator('iframe');
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

  /** Click "Export HTML" (per-composition bar) and capture the single-file HTML download. */
  async exportHtml(): Promise<{ filename: string; html: string }> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.compositionActionBar
      .getByRole('button', { name: 'Export HTML', exact: true })
      .click();
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
