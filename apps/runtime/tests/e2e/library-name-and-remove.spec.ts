import { test, expect } from './fixtures/runtime.js';

/**
 * R-004 + R-005 — the Library names its templates, and lets the operator remove one
 * without ever leaving a silently-broken stack row behind. Driven against the offline
 * MockRuntime, which mirrors the bridge's refuse-while-referenced predicate.
 *
 * The seeded stack references `irib-news`, `ticker` and `logo-bug`; `title` and `sequence`
 * are seeded into the library but unreferenced — which is exactly the two cases R-005 has
 * to tell apart.
 *
 * The starter labels are Persian/Latin mixed, so this also pins that a shaped RTL name
 * survives the whole import→registry→row path (the raw UUID never could have shown it).
 */

const REFERENCED = 'میان‌برنامهٔ خبر — News Composite'; // irib-news — a seeded stack item uses it
const UNREFERENCED = 'زیرنویس معرفی — Guest Title'; // title — in the library, on no stack row

test('library shows display names, refuses removing a referenced template, and removes an unreferenced one', async ({
  app,
}) => {
  const page = app.page;
  const library = page.getByRole('navigation', { name: 'Library' });

  // ── R-004: rows are named, not UUIDs ──
  await expect(library.getByText(REFERENCED)).toBeVisible();
  await expect(library.getByText(UNREFERENCED)).toBeVisible();
  // The id stays discoverable — as the row's tooltip, not as its heading.
  await expect(library.getByTitle('title')).toHaveText(UNREFERENCED);

  // ── R-005: removing a REFERENCED template is refused ──
  // The confirm gate is deliberate (removal is destructive + not undoable); the fixture's
  // default handler dismisses dialogs, so accept them for this path.
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => void d.accept());

  await library.getByRole('button', { name: `Remove ${REFERENCED}` }).click();

  // The bridge's message, verbatim — the panel does not pre-judge the outcome.
  await expect(library.getByRole('alert')).toContainText(/1 stack item\(s\) still use this/);
  // Nothing was removed: the row is still there and still loadable.
  await expect(library.getByText(REFERENCED)).toBeVisible();
  await expect(library.getByRole('button', { name: `Load ${REFERENCED}` })).toBeVisible();

  // ── R-005: removing an UNREFERENCED template goes through ──
  await library.getByRole('button', { name: `Remove ${UNREFERENCED}` }).click();

  await expect(library.getByText(`Removed “${UNREFERENCED}”`)).toBeVisible();
  await expect(library.getByRole('button', { name: `Load ${UNREFERENCED}` })).toHaveCount(0);
  // The referenced one is untouched by its neighbour's removal.
  await expect(library.getByText(REFERENCED)).toBeVisible();
});
