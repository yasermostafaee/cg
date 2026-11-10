import type { MouseEvent } from 'react';

export const COMPANY_SITE = 'https://apasai.com/';

export function followCompanySite(event: MouseEvent<HTMLAnchorElement>): void {
  if (window.cg?.openCompanySite?.()) event.preventDefault();
}

export function openCompanySite(): void {
  if (!window.cg?.openCompanySite?.()) window.open(COMPANY_SITE, '_blank', 'noopener,noreferrer');
}
