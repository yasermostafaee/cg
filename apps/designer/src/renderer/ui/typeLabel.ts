/** Public wording only; project/schema kinds retain their original identifiers. */
export function typeLabel(kind: string): string {
  return kind === 'ticker' ? 'Crawl' : kind;
}
