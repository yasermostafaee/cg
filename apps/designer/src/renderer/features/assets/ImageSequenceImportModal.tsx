/**
 * 🔴 `D-164` — **the image-sequence step, before the video import modal.** A pick of files or a
 * folder becomes ONE numbered sequence the author has seen: the sequences found (one is chosen when
 * there are several), every problem NAMED by file — a missing number, a frame of another size, an
 * unreadable header, a second file carrying a number — and the rate the frames play at, which a
 * sequence does not carry (default: the project's channel rate). Continue hands the frames to
 * `VideoImportModal` as a source like any clip; Cancel imports nothing.
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
  missingFrameName,
  overBudgetSentence,
  overConvertBudget,
  readFrameSize,
  sequenceAssetName,
  sequenceLabel,
  sizeMismatches,
} from './image-sequence.js';
import type { ImageSequenceSource } from './video-convert-args.js';
import * as s from './VideoImportModal.css.js';

/** How many names a problem line lists before it counts the rest. */
const NAMES_SHOWN = 8;

type FrameSize = { width: number; height: number } | null;

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
  const [read, setRead] = useState<{ index: number; sizes: FrameSize[] } | null>(null);
  const seq = found.sequences[chosen];

  // Every frame's header, read once per chosen sequence (24 bytes each).
  useEffect(() => {
    if (seq === undefined) return;
    let alive = true;
    void Promise.all(
      seq.frames.map((f) => readFrameSize(f.file, seq.ext).catch((): FrameSize => null)),
    ).then((sizes) => {
      if (alive) setRead({ index: chosen, sizes });
    });
    return () => {
      alive = false;
    };
  }, [seq, chosen]);

  const sizes = read !== null && read.index === chosen ? read.sizes : null;
  const check =
    seq !== undefined && sizes !== null
      ? sizeMismatches(
          seq.frames.map((f) => f.file),
          sizes,
        )
      : null;
  const plan =
    seq !== undefined && check !== null
      ? framesToConvert(seq, new Set(check.mismatches.map((m) => m.file)))
      : null;
  const size = check?.size ?? null;
  const unreadable = check?.mismatches.filter((m) => m.width === 0) ?? [];
  const otherSize = check?.mismatches.filter((m) => m.width !== 0) ?? [];
  // DELTA-RUN-NEXT-VERSION-01-G — a sequence is two frames or more; one is a picture.
  const single = seq !== undefined && seq.frames.length < 2;
  // DELTA-RUN-NEXT-VERSION-01-I — a job too large is refused here, before it starts.
  const tooLarge =
    plan !== null &&
    size !== null &&
    overConvertBudget(plan.frames.length, size.width, size.height);
  const ready = plan !== null && plan.frames.length > 0 && fps > 0 && !single && !tooLarge;

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
                  onChange={(e) => setChosen(Number(e.target.value))}
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
                  {otherSize.length > 0 && size !== null && (
                    <div data-testid="sequence-size">
                      Not {String(size.width)}×{String(size.height)} — the frame before is held:{' '}
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

            {plan !== null && plan.frames.length === 0 && (
              <Callout variant="danger">No frame of this sequence can be read.</Callout>
            )}

            {tooLarge && size !== null && plan !== null && (
              <Callout variant="danger">
                <span data-testid="sequence-too-large">
                  {overBudgetSentence(plan.frames.length, size.width, size.height, fps)}
                </span>
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
