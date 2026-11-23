import type { Page } from '@playwright/test';

function catalogue(page: Page) {
  return page.getByRole('dialog', { name: /^Templates/ });
}

export async function openNewLiveLayout(page: Page): Promise<void> {
  if (!(await catalogue(page).isVisible())) {
    await page.getByRole('button', { name: 'Open templates', exact: true }).click();
  }
  await catalogue(page).getByRole('button', { name: 'New live layout', exact: true }).click();
}

export async function closeLiveLayoutCatalogue(page: Page): Promise<void> {
  await catalogue(page).getByRole('button', { name: 'Close', exact: true }).first().click();
}
