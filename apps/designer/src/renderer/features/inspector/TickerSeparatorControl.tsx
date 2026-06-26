import { useEffect, useState } from 'react';
import type { Element, TickerElement } from '@cg/shared-schema';
import { designerStore } from '../../state/store.js';
import { useAssets, useAssetUrl } from '../assets/useAssets.js';
import { useSharedImages, useSharedImageUrl } from '../sharedLibrary/useSharedImages.js';
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
 * The image picker lists BOTH the project's assets and the shared library
 * (each option encoded `source:assetId`) plus a size (w×h) box. Text mode is the
 * prior plain separator field. The committed separator stays schema-valid: the
 * Text/Image toggle is UI state, and an image separator is only written once an
 * asset is picked (its `assetId` must be non-empty).
 */
export function TickerSeparatorControl({ element }: { element: TickerElement }): JSX.Element {
  const id = element.id;
  const sep = element.separator;
  const imageSep = typeof sep === 'object' && sep !== null ? sep : null;
  const hasImage = imageSep !== null;

  const project = useAssets();
  const shared = useSharedImages();
  const projectUrl = useAssetUrl(imageSep?.source === 'project' ? imageSep.assetId : null);
  const sharedUrl = useSharedImageUrl(imageSep?.source === 'shared' ? imageSep.assetId : null);
  const currentUrl =
    imageSep === null ? null : imageSep.source === 'project' ? projectUrl : sharedUrl;

  const [mode, setMode] = useState<'text' | 'image'>(hasImage ? 'image' : 'text');
  // Follow the element if its separator kind changes elsewhere (undo, multi-select).
  useEffect(() => {
    setMode(hasImage ? 'image' : 'text');
  }, [hasImage]);

  const options = [
    '',
    ...project.map((a) => `project:${a.assetId}`),
    ...shared.map((a) => `shared:${a.assetId}`),
  ];
  const labels = [
    '— choose an image —',
    ...project.map((a) => `${stripExt(a.filename)} (project)`),
    ...shared.map((a) => `${stripExt(a.filename)} (shared)`),
  ];
  const currentValue = imageSep === null ? '' : `${imageSep.source}:${imageSep.assetId}`;
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
          onCommit={(s) =>
            designerStore.updateElement(id, {
              separator: s === '' ? undefined : s,
            } as Partial<Element>)
          }
        />
      ) : (
        <>
          <SelectField
            label="image"
            value={currentValue}
            options={options}
            labels={labels}
            onCommit={pickImage}
            trailing={
              currentUrl !== null ? (
                <img
                  src={currentUrl}
                  alt=""
                  aria-hidden
                  style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 3 }}
                />
              ) : undefined
            }
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
