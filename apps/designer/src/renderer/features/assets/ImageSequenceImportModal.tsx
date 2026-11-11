/**
 * 🔴 `D-164` — **the image-sequence step, before the video import modal.** A pick of files or a
 * folder becomes ONE numbered sequence the author has seen: the sequences found (one is chosen when
 * there are several), every problem NAMED by file — a missing number, a frame of another size, an
 * unreadable header, a second file carrying a number — plus frame size and rate choices.
 * Continue hands the frame plan to `VideoImportModal`.
 *
 * Nothing is converted, hashed or stored here — the only reads are each frame's first 24 bytes.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal, ModalActions, ModalButton } from '../shell/Modal.js';
import { Callout } from '../../ui/Callout.js';
import { Select } from '../../ui/Select.js';
import { RealtimeNumberInput } from '../inspector/controls.js';
import { useDesignerSelector } from '../../state/store.js';
import {
  findImageSequences,
  framesToConvert,
  MAX_NORMALIZATION_DIMENSION,
  MAX_NORMALIZATION_FRAME_PIXELS,
  missingFrameName,
  overBudgetSentence,
  overConvertBudget,
  readFrameSize,
  sequenceAssetName,
  sequenceLabel,
  sizeMismatches,
  validNormalizationSize,
} from './image-sequence.js';
import type { ImageSequenceSource } from './video-convert-args.js';
import * as s from './VideoImportModal.css.js';

/** How many names a problem line lists before it counts the rest. */
const NAMES_SHOWN = 8;

interface FrameSize {
  width: number;
  height: number;
}

export function ImageSequenceImportModal(props: {
  files: readonly File[];
  onClose: () => void;
  onContinue: (source: ImageSequenceSource) => void;
}): JSX.Element {
  const projectFps = useDesignerSelector((st) => st.scene?.frameRate) ?? 50;
  const found = useMemo(() => findImageSequences(props.files), [props.files]);
  const [chosen, setChosen] = useState(0);
  // Any positive rate the author types — not only the channel rates a project may have.
  const [fps, setFps] = useState<number>(projectFps);
  const [read, setRead] = useState<{ index: number; sizes: (FrameSize | null)[] } | null>(null);
  const [resize, setResize] = useState(false);
  const [outputSize, setOutputSize] = useState<FrameSize | null>(null);
  const seq = found.sequences[chosen];

  // Every frame's header, read once per chosen sequence (24 bytes each).
  useEffect(() => {
    if (seq === undefined) return;
    let alive = true;
    void Promise.all(seq.frames.map((f) => readFrameSize(f.file, seq.ext).catch(() => null))).then(
      (sizes) => {
        if (alive) setRead({ index: chosen, sizes });
      },
    );
    return () => {
      alive = false;
    };
  }, [seq, chosen]);

  const sizes = read !== null && read.index === chosen ? read.sizes : null;
  const check = useMemo(
    () =>
      seq === undefined || sizes === null
        ? null
        : sizeMismatches(
            seq.frames.map((f) => f.file),
            sizes,
          ),
    [seq, sizes],
  );
  const plan = useMemo(
    () =>
      seq === undefined || check === null
        ? null
        : framesToConvert(
            seq,
            new Set(check.mismatches.filter((m) => !resize || m.width === 0).map((m) => m.file)),
          ),
    [seq, check, resize],
  );
  const matchingSize = check?.size ?? null;
  const firstReadable = sizes?.find((size) => size !== null) ?? null;
  const targetSize = resize ? (outputSize ?? firstReadable) : null;
  const size = targetSize ?? matchingSize;
  const unreadable = check?.mismatches.filter((m) => m.width === 0) ?? [];
  const otherSize = check?.mismatches.filter((m) => m.width !== 0) ?? [];
  const readableCount = (seq?.frames.length ?? 0) - unreadable.length;
  const matchingCount = readableCount - otherSize.length;
  const oversizedSource = useMemo(() => {
    if (!resize || seq === undefined || sizes === null) return null;
    const index = sizes.findIndex(
      (size) => size !== null && size.width * size.height > MAX_NORMALIZATION_FRAME_PIXELS,
    );
    return seq.frames[index]?.file.name ?? null;
  }, [resize, seq, sizes]);
  const invalidTarget =
    targetSize !== null && !validNormalizationSize(targetSize.width, targetSize.height);
  // DELTA-RUN-NEXT-VERSION-01-G — a sequence is two frames or more; one is a picture.
  const single = seq !== undefined && seq.frames.length < 2;
  // DELTA-RUN-NEXT-VERSION-01-I — a job too large is refused here, before it starts.
  const tooLarge =
    plan !== null &&
    size !== null &&
    overConvertBudget(plan.frames.length, size.width, size.height);
  const sizeIssue =
    oversizedSource !== null ? (
      <>
        <bdi>{oversizedSource}</bdi> exceeds the 8K UHD frame pixel limit. Pick smaller source
        frames.
      </>
    ) : invalidTarget ? (
      <>
        Use whole-pixel dimensions up to {String(MAX_NORMALIZATION_DIMENSION)} px per side and
        within the 8K UHD frame pixel limit.
      </>
    ) : tooLarge && size !== null && plan !== null ? (
      overBudgetSentence(plan.frames.length, size.width, size.height, fps)
    ) : null;
  const ready = plan !== null && plan.frames.length > 0 && fps > 0 && !single && sizeIssue === null;

  function continueImport(): void {
    if (seq === undefined || plan === null || !ready) return;
    const first = seq.frames[0];
    const last = seq.frames[seq.frames.length - 1];
    if (first === undefined || last === undefined) return;
    props.onContinue({
      kind: 'image-sequence',
      frames: plan.frames,
      ext: seq.ext,
      fps,
      label: sequenceLabel(seq),
      assetName: sequenceAssetName(seq),
      firstFile: first.file.name,
      lastFile: last.file.name,
      ...(targetSize !== null ? { normalization: { ...targetSize, fit: 'contain' } } : {}),
    });
  }

  const footer = (
    <ModalActions>
      <ModalButton variant="secondary" onClick={props.onClose}>
        Cancel
      </ModalButton>
      <ModalButton variant="primary" onClick={continueImport} disabled={!ready}>
        Continue
      </ModalButton>
    </ModalActions>
  );

  return (
    <Modal title="Image sequence" onClose={props.onClose} footer={footer} width="min(560px, 94vw)">
      <div className={s.body}>
        {seq === undefined ? (
          <Callout variant="danger">No numbered PNG or TGA frames in the selection.</Callout>
        ) : (
          <>
            {found.sequences.length > 1 && (
              <div className={s.fieldsRow}>
                <span className={s.fieldLabel}>Sequence</span>
                <Select
                  aria-label="Sequence"
                  data-testid="sequence-choice"
                  value={String(chosen)}
                  onChange={(e) => {
                    setChosen(Number(e.target.value));
                    setResize(false);
                    setOutputSize(null);
                  }}
                >
                  {found.sequences.map((q, i) => (
                    <option key={`${q.folder}/${q.prefix}/${q.suffix}.${q.ext}`} value={String(i)}>
                      {q.folder !== '' ? `${q.folder}/ ` : ''}
                      {sequenceLabel(q)}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className={s.meta} data-testid="sequence-summary">
              <bdi>{sequenceLabel(seq)}</bdi>
              {size !== null ? ` — ${String(size.width)}×${String(size.height)}` : ''}
              {plan !== null && plan.frames.length > 0
                ? ` · ${String(plan.frames.length)} frames · ${(plan.frames.length / Math.max(fps, 1)).toFixed(2)} s`
                : ''}
            </div>

            {check === null && (
              <div className={s.meta} role="status">
                <span className={s.spinner} aria-hidden />
                Reading {String(seq.frames.length)} frames…
              </div>
            )}

            {(seq.missing.length > 0 ||
              otherSize.length > 0 ||
              unreadable.length > 0 ||
              seq.duplicates.length > 0) && (
              <Callout variant="caution">
                <div data-testid="sequence-problems">
                  {seq.missing.length > 0 && (
                    <div data-testid="sequence-missing">
                      Missing — the frame before is held:{' '}
                      <NameList names={seq.missing.map((n) => missingFrameName(seq, n))} />
                    </div>
                  )}
                  {otherSize.length > 0 && matchingSize !== null && (
                    <div data-testid="sequence-size">
                      {String(matchingCount)} of {String(readableCount)} readable frames match{' '}
                      {String(matchingSize.width)}×{String(matchingSize.height)}. Different sizes (
                      {String(otherSize.length)}) —{' '}
                      <NameList
                        names={otherSize.map(
                          (m) => `${m.file.name} (${String(m.width)}×${String(m.height)})`,
                        )}
                      />
                    </div>
                  )}
                  {unreadable.length > 0 && (
                    <div data-testid="sequence-unreadable">
                      Unreadable — the frame before is held:{' '}
                      <NameList names={unreadable.map((m) => m.file.name)} />
                    </div>
                  )}
                  {seq.duplicates.length > 0 && (
                    <div data-testid="sequence-duplicates">
                      Same number as another frame — not used:{' '}
                      <NameList names={seq.duplicates.map((f) => f.name)} />
                    </div>
                  )}
                </div>
              </Callout>
            )}

            {otherSize.length > 0 && matchingSize !== null && (
              <>
                <div className={s.fieldsRow}>
                  <span className={s.fieldLabel}>Frame sizes</span>
                  <Select
                    aria-label="Frame sizes"
                    value={resize ? 'resize' : 'matching'}
                    onChange={(e) => setResize(e.target.value === 'resize')}
                  >
                    <option value="matching">
                      Keep {String(matchingCount)} matching{' '}
                      {matchingCount === 1 ? 'frame' : 'frames'}
                    </option>
                    <option value="resize">Resize all readable frames</option>
                  </Select>
                </div>
                {targetSize === null ? (
                  <div className={s.meta}>Different-size slots repeat a matching frame.</div>
                ) : (
                  <>
                    <div className={s.fieldsRow}>
                      <span className={s.fieldLabel}>Output width</span>
                      <RealtimeNumberInput
                        className={s.numInput}
                        value={targetSize.width}
                        min={1}
                        step={1}
                        ariaLabel="Output width"
                        onCommit={(width) => setOutputSize({ ...targetSize, width })}
                      />
                      <span className={s.fieldLabel}>Output height</span>
                      <RealtimeNumberInput
                        className={s.numInput}
                        value={targetSize.height}
                        min={1}
                        step={1}
                        ariaLabel="Output height"
                        onCommit={(height) => setOutputSize({ ...targetSize, height })}
                      />
                      <span className={s.fieldLabel}>px</span>
                    </div>
                    <div className={s.meta}>Fit with transparent padding.</div>
                  </>
                )}
              </>
            )}

            {plan !== null && plan.frames.length === 0 && (
              <Callout variant="danger">No frame of this sequence can be read.</Callout>
            )}

            {sizeIssue !== null && (
              <Callout variant="danger">
                <span data-testid="sequence-too-large">{sizeIssue}</span>
              </Callout>
            )}

            {single && (
              <Callout variant="caution">
                <span data-testid="sequence-single">
                  One frame is a picture, not a sequence — choose a sequence of two or more.
                </span>
              </Callout>
            )}

            {found.ignored.length > 0 && (
              <div className={s.meta} data-testid="sequence-ignored">
                Left out: {String(found.ignored.length)}{' '}
                {found.ignored.length === 1 ? 'file' : 'files'} that{' '}
                {found.ignored.length === 1 ? 'is' : 'are'} not a numbered PNG or TGA frame.
              </div>
            )}

            <div className={s.fieldsRow}>
              <span className={s.fieldLabel}>Frame rate</span>
              <RealtimeNumberInput
                className={s.numInput}
                value={fps}
                min={1}
                max={240}
                step={1}
                ariaLabel="Frame rate"
                onCommit={(v) => setFps(v)}
              />
              <span className={s.fieldLabel}>fps</span>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Names, each isolated (a Persian name beside a Latin one), the rest counted. */
function NameList({ names }: { names: readonly string[] }): JSX.Element {
  const shown = names.slice(0, NAMES_SHOWN);
  const more = names.length - shown.length;
  return (
    <>
      {shown.map((name, i) => (
        <span key={`${String(i)}-${name}`}>
          {i > 0 ? ', ' : ''}
          <bdi>{name}</bdi>
        </span>
      ))}
      {more > 0 ? `, +${String(more)} more` : ''}
    </>
  );
}
