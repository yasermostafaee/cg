import type { Element, ImageElement } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { useAssets } from '../assets/useAssets.js';
import { ImageChoicePicker } from '../fields/ImageChoicePicker.js';
import { useImageAssetUrls } from '../fields/useImageAssetUrls.js';
import { useSharedImages } from './useSharedImages.js';

/**
 * D-040 — inspector combo that lists the shared image library (names in the
 * dropdown, the current selection's thumbnail beside it) and re-points the
 * selected image element to a library image, setting `source: 'shared'` so it
 * becomes a logo. Uses the shared `Select` primitive via `SelectField`.
 */
export function SharedImagePicker({ element }: { element: ImageElement }): JSX.Element {
  const projectImages = useAssets().filter((asset) => asset.kind === 'image');
  const sharedImages = useSharedImages();
  const imageUrls = useImageAssetUrls();
  const currentSource = element.source === 'shared' ? 'shared' : 'project';
  const currentValue = `${currentSource}:${element.assetId}`;

  return (
    <ImageChoicePicker
      label="picture source"
      value={currentValue}
      allowEmpty={false}
      choices={[
        ...projectImages.map((image) => ({
          value: `project:${image.assetId}`,
          label: `${stripExt(image.filename)} (project)`,
          ...(imageUrls[image.assetId] === undefined
            ? {}
            : { thumbnailUrl: imageUrls[image.assetId] }),
        })),
        ...sharedImages.map((image) => ({
          value: `shared:${image.assetId}`,
          label: `${stripExt(image.filename)} (shared)`,
          ...(imageUrls[image.assetId] === undefined
            ? {}
            : { thumbnailUrl: imageUrls[image.assetId] }),
        })),
      ]}
      currentLabel={`${element.assetId} (missing)`}
      currentThumbnailUrl={imageUrls[element.assetId]}
      onChange={(encoded) => {
        const separator = encoded.indexOf(':');
        if (separator < 1) return;
        designerStore.updateElement(element.id, {
          assetId: encoded.slice(separator + 1),
          source: encoded.slice(0, separator) as 'project' | 'shared',
        } as Partial<Element>);
      }}
    />
  );
}

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}
