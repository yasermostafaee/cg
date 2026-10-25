import { compositionPackageId } from '@cg/vcg-format';

export function templateIdFor(brandId: string, templateKey: string): string {
  return compositionPackageId(`brand-pack:${brandId}`, `template:${templateKey}`);
}

export function brandAssetIdFor(brandId: string, kind: 'asset' | 'font', role: string): string {
  return compositionPackageId(`brand-pack:${brandId}`, `${kind}:${role}`);
}
