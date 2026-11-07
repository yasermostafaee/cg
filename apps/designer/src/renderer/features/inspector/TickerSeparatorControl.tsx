import { useEffect, useState } from 'react';
import type { Element, FieldDigits, TickerElement } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { useAssets } from '../assets/useAssets.js';
import { ImageChoicePicker } from '../fields/ImageChoicePicker.js';
import { useImageAssetUrls } from '../fields/useImageAssetUrls.js';
import { useSharedImages } from '../sharedLibrary/useSharedImages.js';
import { NumberField, SelectField, TextField } from './controls.js';
import * as dds from './DynamicDataSection.css.js';

/** D-039ext — a fresh image separator's default box (px). */
const DEFAULT_SEP_SIZE = { w: 48, h: 48 } as const;

function stripExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? filename : filename.slice(0, dot);
}

/**
 * D-039ext — the ticker separator control: choose a Text glyph or an Image/logo.
 * The image picker lists BOTH the project's pictures and the shared library
 * (each option encoded `source:assetId`) plus a size (w×h) box. Text mode is the
 * prior plain separator field. The committed separator stays schema-valid: the
 * Text/Image toggle is UI state, and an image separator is only written once an
 * asset is picked (its `assetId` must be non-empty).
 */
export function TickerSeparatorControl({
  element,
  digits,
}: {
  element: TickerElement;
  /** `TEXT-DIGITS-01` — the ticker's Digits: a text separator is typed in them. */
  digits: FieldDigits;
}): JSX.Element {
  const id = element.id;
  const sep = element.separator;
  const imageSep = typeof sep === 'object' && sep !== null ? sep : null;
  const hasImage = imageSep !== null;

  // 🔴 `B-128` — PICTURES ONLY. The project store also holds fonts, videos and animations, and a
  // separator is drawn as `<img>`: a font or video there paints a broken-image icon on air. The
  // shared library holds pictures only. A saved separator that is not one is repaired on open
  // (`state/separator-repair.ts`).
  const project = useAssets().filter((a) => a.kind === 'image');
  const shared = useSharedImages();
  const imageUrls = useImageAssetUrls();

  const [mode, setMode] = useState<'text' | 'image'>(hasImage ? 'image' : 'text');
  // Follow the element if its separator kind changes elsewhere (undo, multi-select).
  useEffect(() => {
    setMode(hasImage ? 'image' : 'text');
  }, [hasImage]);

  const currentValue = imageSep === null ? '' : `${imageSep.source}:${imageSep.assetId}`;
  const imageChoices = [
    ...project.map((asset) => ({
      value: `project:${asset.assetId}`,
      label: `${stripExt(asset.filename)} (project)`,
      ...(imageUrls[asset.assetId] === undefined ? {} : { thumbnailUrl: imageUrls[asset.assetId] }),
    })),
    ...shared.map((asset) => ({
      value: `shared:${asset.assetId}`,
      label: `${stripExt(asset.filename)} (shared)`,
      ...(imageUrls[asset.assetId] === undefined ? {} : { thumbnailUrl: imageUrls[asset.assetId] }),
    })),
  ];
  const noAssets = project.length === 0 && shared.length === 0;

  const pickImage = (encoded: string): void => {
    if (encoded === '') return; // the placeholder
    const i = encoded.indexOf(':');
    const source = encoded.slice(0, i) as 'project' | 'shared';
    const assetId = encoded.slice(i + 1);
    designerStore.updateElement(id, {
      separator: {
        kind: 'image',
        assetId,
        source,
        size: imageSep?.size ?? { ...DEFAULT_SEP_SIZE },
      },
    } as Partial<Element>);
  };

  const setSize = (next: { w: number; h: number }): void => {
    if (imageSep === null) return;
    designerStore.updateElement(id, {
      separator: { ...imageSep, size: next },
    } as Partial<Element>);
  };

  return (
    <>
      <SelectField
        label="separator"
        value={mode}
        options={['text', 'image'] as const}
        onCommit={(m) => {
          setMode(m);
          // Leaving image mode clears the separator (operator re-types text if wanted);
          // entering image mode waits for an asset pick before committing anything.
          if (m === 'text' && imageSep !== null) {
            designerStore.updateElement(id, { separator: undefined } as Partial<Element>);
          }
        }}
      />
      {mode === 'text' ? (
        <TextField
          label="text"
          value={typeof sep === 'string' ? sep : ''}
          resetKey={id}
          digits={digits}
          onCommit={(s) =>
            designerStore.updateElement(id, {
              separator: s === '' ? undefined : s,
            } as Partial<Element>)
          }
        />
      ) : (
        <>
          <ImageChoicePicker
            label="image"
            value={currentValue}
            allowEmpty={false}
            choices={imageChoices}
            currentThumbnailUrl={imageSep === null ? undefined : imageUrls[imageSep.assetId]}
            onChange={pickImage}
          />
          {noAssets && imageSep === null && (
            <p className={dds.hint}>
              Import an image first (the Assets panel or the shared library).
            </p>
          )}
          {imageSep !== null && (
            <>
              <NumberField
                label="width"
                value={imageSep.size.w}
                step={2}
                min={1}
                suffix="px"
                onCommit={(w) => setSize({ w: Math.max(1, Math.round(w)), h: imageSep.size.h })}
              />
              <NumberField
                label="height"
                value={imageSep.size.h}
                step={2}
                min={1}
                suffix="px"
                onCommit={(h) => setSize({ w: imageSep.size.w, h: Math.max(1, Math.round(h)) })}
              />
            </>
          )}
        </>
      )}
    </>
  );
}
