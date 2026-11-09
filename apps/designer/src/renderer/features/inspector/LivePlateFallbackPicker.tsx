import type { VideoPlaceholderElement } from '@cg/shared-schema';
import { useAssets } from '../assets/useAssets.js';
import { ImageChoicePicker } from '../fields/ImageChoicePicker.js';
import { useImageAssetUrls } from '../fields/useImageAssetUrls.js';
import { useSharedImages } from '../sharedLibrary/useSharedImages.js';
import { ColorField } from './controls.js';

const SOLID_COLOUR = '__cg-live-fallback-color__';
const MIXED = '__cg-mixed-live-fallback__';
const BLACK = '#000000';

const svgThumbnail = (body: string): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 80">${body}</svg>`,
  )}`;
const BARS_THUMBNAIL = svgThumbnail(
  ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0']
    .map(
      (color, index) =>
        `<path fill="${color}" d="M${String(index * 20)} 0h20v80H${String(index * 20)}z"/>`,
    )
    .join(''),
);

function choiceOf(plate: VideoPlaceholderElement): string {
  if (plate.fallbackKind === 'color') return SOLID_COLOUR;
  if (plate.fallbackKind === 'bars') return '';
  return plate.posterAssetId ?? '';
}

/** R-105 — one fallback choice for a single plate or an entire selection. */
export function LivePlateFallbackPicker({
  plates,
  onCommit,
}: {
  plates: readonly VideoPlaceholderElement[];
  onCommit: (patch: Partial<VideoPlaceholderElement>) => void;
}): JSX.Element {
  const project = useAssets().filter((asset) => asset.kind === 'image');
  const shared = useSharedImages();
  const imageUrls = useImageAssetUrls();
  const colors = plates.map((plate) => plate.fallbackColor ?? BLACK);
  const firstColor = colors[0] ?? BLACK;
  const sameColor = colors.every((color) => color === firstColor);
  const values = plates.map(choiceOf);
  const first = values[0] ?? '';
  const value = values.every((choice) => choice === first) ? first : MIXED;
  const imageChoices = (
    assets: readonly { assetId: string; filename: string }[],
    source: 'project' | 'shared',
  ) =>
    assets.map(({ assetId, filename }) => ({
      value: assetId,
      label: `${filename.replace(/\.[^.]+$/, '')} (${source})`,
      ...(imageUrls[assetId] === undefined ? {} : { thumbnailUrl: imageUrls[assetId] }),
    }));
  const choices = [
    {
      value: SOLID_COLOUR,
      label: 'Solid colour',
      ...(sameColor
        ? { thumbnailUrl: svgThumbnail(`<rect width="140" height="80" fill="${firstColor}"/>`) }
        : {}),
    },
    ...imageChoices(project, 'project'),
    ...imageChoices(shared, 'shared'),
  ];

  return (
    <>
      <ImageChoicePicker
        label="fallback"
        value={value}
        choices={choices}
        emptyLabel="Bars"
        emptyThumbnailUrl={BARS_THUMBNAIL}
        currentLabel={value === MIXED ? '— mixed —' : `${value} (missing)`}
        currentThumbnailUrl={imageUrls[value]}
        onChange={(choice) => {
          if (choice === MIXED) return;
          if (choice === '') {
            onCommit({ fallbackKind: 'bars', posterAssetId: undefined });
          } else if (choice === SOLID_COLOUR) {
            onCommit({
              fallbackKind: 'color',
              posterAssetId: undefined,
              ...(sameColor ? { fallbackColor: firstColor } : {}),
            });
          } else {
            onCommit({ fallbackKind: 'image', posterAssetId: choice });
          }
        }}
      />
      {value === SOLID_COLOUR && sameColor && (
        <ColorField
          label="fallback"
          value={firstColor}
          onCommit={(fallbackColor) => onCommit({ fallbackColor })}
        />
      )}
    </>
  );
}
