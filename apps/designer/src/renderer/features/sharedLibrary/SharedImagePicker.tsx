import type { Element, ImageElement } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { SelectField } from '../inspector/controls.js';
import { useSharedImages, useSharedImageUrl } from './useSharedImages.js';

/**
 * D-040 — inspector combo that lists the shared image library (names in the
 * dropdown, the current selection's thumbnail beside it) and re-points the
 * selected image element to a library image, setting `source: 'shared'` so it
 * becomes a logo. Uses the shared `Select` primitive via `SelectField`.
 */
export function SharedImagePicker({ element }: { element: ImageElement }): JSX.Element {
  const images = useSharedImages();
  const currentId = element.source === 'shared' ? element.assetId : '';
  const url = useSharedImageUrl(element.source === 'shared' ? element.assetId : null);

  const options = ['', ...images.map((i) => i.assetId)];
  const labels = ['— choose a library image —', ...images.map((i) => stripExt(i.filename))];

  return (
    <SelectField
      label="library image"
      value={currentId}
      options={options}
      labels={labels}
      onCommit={(assetId) => {
        if (assetId === '') return; // the placeholder — leave the element unchanged
        designerStore.updateElement(element.id, {
          assetId,
          source: 'shared',
        } as Partial<Element>);
      }}
      trailing={
        url !== null ? (
          <img
            src={url}
            alt=""
            aria-hidden
            style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 3 }}
          />
        ) : undefined
      }
    />
  );
}

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}
