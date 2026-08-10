import { test, expect } from './fixtures/runtime.js';

/**
 * D-137 / C-015 phase 4 — the CG Control surface that binds a symbolic Live
 * Source id to a concrete producer.
 *
 * THE SURFACE NAMED AS THE BLOCKER for the whole feature: a template declares
 * `guest-1` and the scene deliberately never says what that is, so until an
 * operator says it here, nothing reaches air. Driven against the offline
 * MockRuntime, which shares the bridge's own validator (`checkSourceMappings`),
 * so the refusals below are the ones a real station gives.
 *
 * Maps the `#### Scenario`s of "The installation maps a source id to a concrete
 * producer, and an absent mapping fails CLOSED":
 *
 *   - "An absent mapping file reaches nothing to air"  → the empty state says so
 *   - "The operator edits the mapping and the change is durable" → add + bind
 *   - "One id can resolve to a fill/key device pair"   → the DECKLINK arm
 *
 * and, from "Live Source layers are a DECLARED, bridge-owned ownership class":
 *
 *   - "Overlapping range config is refused at load and at change" → the band
 */

test('sources: empty says nothing reaches air, an id binds to a producer, and an overlapping band is refused', async ({
  app,
}) => {
  const page = app.page;
  const dialog = page.getByRole('dialog', { name: 'Live sources' });

  await page.getByRole('button', { name: 'Open live source mapping' }).click();
  await expect(dialog).toBeVisible();

  // NOTHING MAPPED is a real, common and important state, and it is said
  // plainly: an operator whose take refuses must be able to find out why here.
  await expect(dialog.getByText(/Nothing is mapped yet/)).toBeVisible();

  // Bind an id. The bridge is authoritative; the modal adopts only what it
  // accepts, so seeing the row appear IS the round-trip.
  await dialog.getByLabel('New source id').fill('guest-1');
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(dialog.getByText(/Nothing is mapped yet/)).toHaveCount(0);
  // A fresh entry starts as a route, and the resolved form is shown in the
  // words the bridge will send.
  await expect(dialog.getByText('route://1')).toBeVisible();

  await dialog.getByLabel('Route channel for guest-1').fill('3');
  await expect(dialog.getByText('route://3')).toBeVisible();

  // The FORMAT is a picker and the aspect DERIVES from it — a hand-entered
  // aspect is a number that can be wrong on air while looking reasonable.
  await dialog.getByLabel('Signal format for guest-1').selectOption('1080i5000');
  await expect(dialog.getByText('aspect: 16:9 (from the format)')).toBeVisible();

  // ONE id, a fill/key DEVICE PAIR: the pair is a property of the MAPPING, and
  // the template that names the id is unchanged (design.md §1a).
  await dialog.getByLabel('Producer kind for guest-1').selectOption('decklink');
  await dialog.getByLabel('Decklink key device for guest-1').fill('2');
  await expect(dialog.getByText('DECKLINK DEVICE 1 + KEY 2')).toBeVisible();

  // The band must be disjoint from the operator's candidate bank. The mock's
  // seeded bank starts at 70, so 50–75 reaches into it and the refusal names
  // BOTH ranges rather than merely saying no.
  await dialog.getByLabel('Live source band start layer').fill('50');
  await dialog.getByLabel('Live source band end layer').fill('75');
  await dialog.getByRole('button', { name: 'Apply band' }).click();
  await expect(dialog.getByText(/overlaps the operator's candidate layer bank/)).toBeVisible();
  await expect(dialog.getByText(/Currently/)).toHaveCount(0);

  // A band clear of the bank is accepted, and the hint states what is in force.
  await dialog.getByLabel('Live source band start layer').fill('10');
  await dialog.getByLabel('Live source band end layer').fill('59');
  await dialog.getByRole('button', { name: 'Apply band' }).click();
  await expect(dialog.getByText(/Currently 10–59/)).toBeVisible();

  // Durable: the mapping survives closing and reopening the surface, because
  // the value lives on the bridge (here, the mock's store) and not in the
  // modal's own state.
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Open live source mapping' }).click();
  await expect(dialog.getByText('DECKLINK DEVICE 1 + KEY 2')).toBeVisible();
  await expect(dialog.getByText(/Currently 10–59/)).toBeVisible();
});
