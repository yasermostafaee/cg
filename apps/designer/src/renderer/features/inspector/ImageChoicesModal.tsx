import { useMemo, useState } from 'react';
import type { AssetMeta } from '@cg/shared-ipc';
import type { ImageFieldAssetOption } from '@cg/shared-schema';
import { Modal, ModalButton } from '../shell/Modal.js';
import * as s from './ImageChoicesModal.css.js';

interface Props {
  projectAssets: readonly AssetMeta[];
  sharedAssets: readonly AssetMeta[];
  imageUrls: Readonly<Record<string, string>>;
  selected: readonly ImageFieldAssetOption[];
  onCancel: () => void;
  onSave: (options: ImageFieldAssetOption[]) => void;
}

interface Candidate extends ImageFieldAssetOption {
  source: 'project' | 'shared';
}

function keyOf(option: Pick<Candidate, 'assetId' | 'source'>): string {
  return `${option.source}:${option.assetId}`;
}

function candidatesOf(
  projectAssets: readonly AssetMeta[],
  sharedAssets: readonly AssetMeta[],
  selected: readonly ImageFieldAssetOption[],
): Candidate[] {
  const result: Candidate[] = [];
  const seen = new Set<string>();
  const add = (asset: AssetMeta, source: Candidate['source']): void => {
    if (asset.kind !== 'image') return;
    const candidate = { assetId: asset.assetId, label: asset.filename, source };
    const key = keyOf(candidate);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(candidate);
  };
  projectAssets.forEach((asset) => add(asset, 'project'));
  sharedAssets.forEach((asset) => add(asset, 'shared'));
  // Retain a selected image whose local library entry is currently unavailable.
  for (const option of selected) {
    const candidate = { ...option, source: option.source ?? ('project' as const) };
    const key = keyOf(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

export function ImageChoicesModal({
  projectAssets,
  sharedAssets,
  imageUrls,
  selected,
  onCancel,
  onSave,
}: Props): JSX.Element {
  const candidates = useMemo(
    () => candidatesOf(projectAssets, sharedAssets, selected),
    [projectAssets, sharedAssets, selected],
  );
  const [checked, setChecked] = useState(
    () =>
      new Set(
        selected.map((option) =>
          keyOf({ ...option, source: option.source ?? ('project' as const) }),
        ),
      ),
  );
  const count = candidates.filter((candidate) => checked.has(keyOf(candidate))).length;

  return (
    <Modal
      title="Images available to the operator"
      onClose={onCancel}
      width="min(680px, 94vw)"
      maxHeight="88vh"
      footer={
        <>
          <ModalButton onClick={onCancel}>Cancel</ModalButton>
          <ModalButton
            variant="primary"
            onClick={() => onSave(candidates.filter((candidate) => checked.has(keyOf(candidate))))}
          >
            Apply
          </ModalButton>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className={s.empty}>
          Import images into Project Assets or Shared Library first. PNG, JPG, WebP and SVG are
          supported.
        </p>
      ) : (
        <div className={s.list}>
          {candidates.map((candidate) => {
            const key = keyOf(candidate);
            return (
              <label className={s.row} key={key} title={candidate.label}>
                <input
                  type="checkbox"
                  checked={checked.has(key)}
                  onChange={(event) => {
                    setChecked((current) => {
                      const next = new Set(current);
                      if (event.currentTarget.checked) next.add(key);
                      else next.delete(key);
                      return next;
                    });
                  }}
                />
                <span className={s.thumbFrame} aria-hidden="true">
                  {imageUrls[candidate.assetId] !== undefined ? (
                    <img
                      className={s.thumb}
                      src={imageUrls[candidate.assetId]}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span className={s.thumbMissing}>—</span>
                  )}
                </span>
                <span className={s.name}>{candidate.label}</span>
                <span className={s.source}>
                  {candidate.source === 'shared' ? 'Shared library' : 'Project asset'}
                </span>
              </label>
            );
          })}
        </div>
      )}
      <p className={s.summary}>{count} selected</p>
    </Modal>
  );
}
