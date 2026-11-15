import { useEffect, useId, useRef, useState } from 'react';
import { Check, ImagePlus, LayoutGrid, Pencil, Plus, RotateCcw, Trash2, Video } from 'lucide-react';
import {
  CONTROL_LIVE_LAYOUT_MAX_FRAMES,
  ControlLiveLayoutSchema,
  controlLiveLayoutFontFamily,
  controlLiveLayoutRects,
  type ControlLiveLayout,
  type ControlLiveLayoutArrangement,
  type ControlLiveLayoutPreset,
} from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { ColorInput } from '../../ui/ColorInput.js';
import { FileInput } from '../../ui/FileInput.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { TextInput } from '../../ui/TextInput.js';
import { uuid } from '../../lib/uuid.js';
import { liveLayoutArtwork } from '../../theme.js';
import {
  CONTROL_LIVE_LAYOUT_BACKGROUND_ACCEPT,
  readControlLiveLayoutBackgroundFile,
  readControlLiveLayoutFontFile,
} from './controlLiveLayoutCompiler.js';
import { usePvwSourceFrames } from '../monitors/usePvwSourceFrames.js';
import { SourceLabel } from '../sources/SourceLabel.js';
import { SourcePicker } from '../sources/SourcePicker.js';
import { LiveLayoutEditorArrange } from './LiveLayoutEditorArrange.js';
import { LiveLayoutEditorEffects } from './LiveLayoutEditorEffects.js';
import { LiveLayoutEditorFrameOptions } from './LiveLayoutEditorFrameOptions.js';
import { LiveLayoutEditorPreview } from './LiveLayoutEditorPreview.js';
import { LiveLayoutEditorTitleStyle } from './LiveLayoutEditorTitleStyle.js';
import './live-layout-editor.css';

interface LiveLayoutEditorProps {
  channel: number;
  initial: ControlLiveLayout;
  initialBackground?: Blob | undefined;
  initialFonts?: ReadonlyMap<string, Blob> | undefined;
  mode: 'create' | 'edit' | 'duplicate';
  onSave: (
    layout: ControlLiveLayout,
    background: Blob | undefined,
    fonts: ReadonlyMap<string, Blob>,
  ) => Promise<void>;
  onClose: () => void;
}

const titles: Record<LiveLayoutEditorProps['mode'], string> = {
  create: 'New live layout',
  edit: 'Edit live layout',
  duplicate: 'Duplicate live layout',
};

function nextPresetName(presets: readonly ControlLiveLayoutPreset[]): string {
  const names = new Set(presets.map(({ name }) => name));
  let number = presets.length + 1;
  while (names.has(`Preset ${String(number)}`)) number += 1;
  return `Preset ${String(number)}`;
}

function visibleTitle(
  currentlyHidden: readonly string[],
  frameId: string,
  visible: boolean,
): string[] {
  return visible
    ? currentlyHidden.filter((id) => id !== frameId)
    : [...new Set([...currentlyHidden, frameId])];
}

function arrangementForCount(
  arrangement: ControlLiveLayoutArrangement,
  count: number,
): ControlLiveLayoutArrangement {
  if (
    count === 2 &&
    (arrangement === 'grid-top' ||
      arrangement === 'grid-bottom' ||
      arrangement === 'host-and-guests')
  )
    return 'side-by-side';
  if (count > 2 && arrangement === 'top-and-bottom') return 'grid-top';
  if (count === 4 && arrangement === 'grid-bottom') return 'grid-top';
  return arrangement;
}

export function LiveLayoutEditor({
  channel,
  initial,
  initialBackground,
  initialFonts,
  mode,
  onSave,
  onClose,
}: LiveLayoutEditorProps): JSX.Element | null {
  const [layout, setLayout] = useState(initial);
  const [asset, setAsset] = useState(initialBackground);
  const [fontAssets, setFontAssets] = useState<ReadonlyMap<string, Blob>>(
    () => initialFonts ?? new Map(),
  );
  const [presetId, setPresetId] = useState(initial.defaultPresetId);
  const [frameId, setFrameId] = useState(initial.frames[0]?.id);
  const [focusId, setFocusId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [readingMedia, setReadingMedia] = useState(false);
  const [readingFont, setReadingFont] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const saveInFlight = useRef(false);
  const mediaRead = useRef(0);
  const fontRead = useRef(0);
  const mediaPick = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const presetName = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const focusOrigin = useRef<string>();
  const fieldsId = useId();
  const [assetUrl, setAssetUrl] = useState<string>();
  const sourceFrames = usePvwSourceFrames(
    channel,
    layout.frames.flatMap(({ sourceId }) => (sourceId === undefined ? [] : [sourceId])),
  );

  useEffect(() => {
    setAssetUrl(undefined);
    if (asset === undefined) return;
    const url = URL.createObjectURL(asset);
    setAssetUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [asset]);

  useEffect(() => {
    let disposed = false;
    const faces = new Set<FontFace>();
    for (const [id, blob] of fontAssets) {
      void blob
        .arrayBuffer()
        .then((buffer) => new FontFace(controlLiveLayoutFontFamily(id), buffer).load())
        .then((face) => {
          if (disposed) return;
          document.fonts.add(face);
          faces.add(face);
        })
        .catch(() => {
          if (!disposed) setRefusal('A title font could not be loaded for preview.');
        });
    }
    return () => {
      disposed = true;
      for (const face of faces) document.fonts.delete(face);
    };
  }, [fontAssets]);

  useEffect(
    () => () => {
      mediaRead.current += 1;
      fontRead.current += 1;
    },
    [],
  );

  const preset = layout.presets.find(({ id }) => id === presetId) ?? layout.presets[0];
  const frame = layout.frames.find(({ id }) => id === frameId) ?? layout.frames[0];
  if (preset === undefined || frame === undefined) return null;
  const frameNumber = layout.frames.indexOf(frame) + 1;
  const geometry = controlLiveLayoutRects(layout, preset);
  const canSave =
    layout.name.trim() !== '' &&
    layout.presets.every(({ name }) => name.trim() !== '') &&
    Object.keys(geometry).length === preset.frameIds.length;

  function updatePreset(changes: Partial<ControlLiveLayoutPreset>): void {
    setLayout((current) => ({
      ...current,
      presets: current.presets.map((candidate) =>
        candidate.id === preset?.id ? { ...candidate, ...changes } : candidate,
      ),
    }));
  }

  function rebuildArrangement(changes: Partial<ControlLiveLayoutPreset>): void {
    setFocusId(undefined);
    updatePreset(changes);
  }

  function choosePreset(next: ControlLiveLayoutPreset): void {
    setFocusId(undefined);
    setPresetId(next.id);
    if (frameId === undefined || !next.frameIds.includes(frameId)) setFrameId(next.frameIds[0]);
  }

  function appendPreset(): void {
    if (preset === undefined) return;
    const next = {
      ...preset,
      id: `preset-${uuid()}`,
      name: nextPresetName(layout.presets),
    };
    setLayout((current) => ({ ...current, presets: [...current.presets, next] }));
    choosePreset(next);
    requestAnimationFrame(() => {
      presetName.current?.focus();
      presetName.current?.select();
    });
  }

  function deletePreset(): void {
    if (preset === undefined || layout.presets.length <= 1) return;
    const presets = layout.presets.filter(({ id }) => id !== preset.id);
    const next = presets[Math.min(layout.presets.indexOf(preset), presets.length - 1)];
    if (next === undefined) return;
    setLayout((current) => ({
      ...current,
      presets,
      defaultPresetId: current.defaultPresetId === preset.id ? next.id : current.defaultPresetId,
    }));
    choosePreset(next);
  }

  function appendFrame(): void {
    if (preset === undefined || layout.frames.length >= CONTROL_LIVE_LAYOUT_MAX_FRAMES) return;
    const id = `frame-${uuid()}`;
    setFocusId(undefined);
    setFrameId(id);
    setLayout((current) => ({
      ...current,
      frames: [...current.frames, { id, title: '' }],
      presets: current.presets.map((candidate) => {
        if (candidate.id !== preset.id) return candidate;
        const frameIds = [...candidate.frameIds, id];
        return {
          ...candidate,
          frameIds,
          arrangement: arrangementForCount(candidate.arrangement, frameIds.length),
        };
      }),
    }));
    requestAnimationFrame(() => titleInput.current?.focus());
  }

  function deleteFrame(): void {
    if (frame === undefined || layout.frames.length <= 1) return;
    const frames = layout.frames.filter(({ id }) => id !== frame.id);
    const next = frames[Math.min(layout.frames.indexOf(frame), frames.length - 1)];
    if (next === undefined) return;
    setFocusId(undefined);
    setFrameId(next.id);
    setLayout((current) => ({
      ...current,
      frames,
      presets: current.presets.map((candidate) => {
        const remaining = candidate.frameIds.filter((id) => id !== frame.id);
        const frameIds = remaining.length === 0 ? [next.id] : remaining;
        return {
          ...candidate,
          frameIds,
          arrangement: arrangementForCount(candidate.arrangement, frameIds.length),
          hiddenTitles: candidate.hiddenTitles.filter((id) => id !== frame.id),
          hiddenFocusTitles: candidate.hiddenFocusTitles.filter((id) => id !== frame.id),
        };
      }),
    }));
  }

  function includeFrame(id: string, included: boolean): void {
    if (preset === undefined || (!included && preset.frameIds.length === 1)) return;
    const frameIds = included
      ? [...preset.frameIds, id]
      : preset.frameIds.filter((value) => value !== id);
    rebuildArrangement({
      frameIds,
      arrangement: arrangementForCount(preset.arrangement, frameIds.length),
    });
  }

  function updateFrame(
    update: (candidate: ControlLiveLayout['frames'][number]) => ControlLiveLayout['frames'][number],
  ): void {
    setLayout((current) => ({
      ...current,
      frames: current.frames.map((candidate) =>
        candidate.id === frame?.id ? update(candidate) : candidate,
      ),
    }));
  }

  function setBackgroundColor(color: string): void {
    mediaRead.current += 1;
    setReadingMedia(false);
    setAsset(undefined);
    setRefusal(undefined);
    setLayout((current) => ({ ...current, background: { kind: 'color', color } }));
  }

  function focusFrame(id: string): void {
    if (focusId === undefined) {
      focusOrigin.current = id;
      requestAnimationFrame(() => returnButton.current?.focus());
    }
    setFocusId(id);
    setFrameId(id);
  }

  function returnToPreset(): void {
    setFocusId(undefined);
    requestAnimationFrame(() => {
      const buttons = [
        ...(preview.current?.querySelectorAll<HTMLButtonElement>('[data-layout-focus]') ?? []),
      ];
      buttons.find((button) => button.dataset['layoutFocus'] === focusOrigin.current)?.focus();
    });
  }

  async function pickBackground(file: File): Promise<void> {
    const revision = ++mediaRead.current;
    setReadingMedia(true);
    setRefusal(undefined);
    try {
      const background = await readControlLiveLayoutBackgroundFile(file);
      if (revision !== mediaRead.current) return;
      setLayout((current) => ({ ...current, background }));
      setAsset(file);
    } catch (cause) {
      if (revision === mediaRead.current) {
        setRefusal(cause instanceof Error ? cause.message : 'The background could not be read.');
      }
    } finally {
      if (revision === mediaRead.current) setReadingMedia(false);
    }
  }

  async function addFont(file: File, scope: 'shared' | 'frame'): Promise<void> {
    const revision = ++fontRead.current;
    const target = frame?.id;
    setReadingFont(true);
    setRefusal(undefined);
    try {
      const font = await readControlLiveLayoutFontFile(file);
      if (revision !== fontRead.current) return;
      const fontFamily = controlLiveLayoutFontFamily(font.id);
      setFontAssets((current) => new Map(current).set(font.id, file));
      setLayout((current) => {
        const previousFonts = current.fonts ?? [];
        const fonts = previousFonts.some(({ id }) => id === font.id)
          ? previousFonts
          : [...previousFonts, font];
        return scope === 'shared'
          ? { ...current, fonts, titleStyle: { ...current.titleStyle, fontFamily } }
          : {
              ...current,
              fonts,
              frames: current.frames.map((candidate) =>
                candidate.id === target
                  ? { ...candidate, titleStyle: { ...candidate.titleStyle, fontFamily } }
                  : candidate,
              ),
            };
      });
    } catch (cause) {
      if (revision === fontRead.current) {
        setRefusal(cause instanceof Error ? cause.message : 'The font could not be read.');
      }
    } finally {
      if (revision === fontRead.current) setReadingFont(false);
    }
  }

  async function save(): Promise<void> {
    if (!canSave || saveInFlight.current || readingMedia || readingFont) return;
    const draft = ControlLiveLayoutSchema.safeParse({
      ...layout,
      name: layout.name.trim(),
      presets: layout.presets.map((candidate) => ({ ...candidate, name: candidate.name.trim() })),
    });
    if (!draft.success) {
      setRefusal('Check that every preset has a name and a valid frame arrangement.');
      return;
    }
    setRefusal(undefined);
    saveInFlight.current = true;
    setBusy(true);
    try {
      await onSave(draft.data, asset, fontAssets);
    } catch (cause) {
      setRefusal(cause instanceof Error ? cause.message : 'The layout could not be saved.');
    } finally {
      saveInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={titles[mode]}
      subtitle={`Channel ${String(channel)}`}
      emblem={LayoutGrid}
      size="library"
      onClose={onClose}
      busy={busy}
      {...(refusal === undefined ? {} : { message: { role: 'refusal' as const, text: refusal } })}
      footer={
        <>
          <ModalAction actionRole="cancel" onClick={onClose} disabled={busy}>
            Cancel
          </ModalAction>
          <ModalAction
            actionRole="primary"
            onClick={() => void save()}
            disabled={!canSave || busy || readingMedia || readingFont}
          >
            <Icon icon={Check} size={15} /> {busy ? 'Saving…' : 'Save layout'}
          </ModalAction>
        </>
      }
    >
      <fieldset className="cg-live-layout-editor" disabled={busy} aria-label="Live layout editor">
        <div className="cg-live-layout-metadata">
          <label className="cg-live-layout-name" htmlFor={`${fieldsId}-layout-name`}>
            Layout name
            <TextInput
              id={`${fieldsId}-layout-name`}
              value={layout.name}
              onChange={(name) => setLayout((current) => ({ ...current, name }))}
              dir="auto"
              maxLength={120}
            />
          </label>
          <div className="cg-live-layout-background" role="group" aria-label="Background">
            <span>Background</span>
            {layout.background.kind === 'color' ? (
              <ColorInput
                value={layout.background.color.slice(0, 7)}
                onChange={setBackgroundColor}
                aria-label="Background color"
              />
            ) : (
              <>
                <IsolatedName className="cg-live-layout-file">
                  {layout.background.name}
                </IsolatedName>
                <Button
                  className="cg-list-remove"
                  variant="icon"
                  title="Remove background media"
                  aria-label="Remove background media"
                  onClick={() => setBackgroundColor(liveLayoutArtwork.background)}
                >
                  <Icon icon={Trash2} size={14} />
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              aria-label="Choose background image or video"
              onClick={() => mediaPick.current?.click()}
            >
              <Icon icon={ImagePlus} size={15} />
              {readingMedia ? 'Reading…' : 'Image or video'}
            </Button>
            <FileInput
              hidden
              ref={mediaPick}
              aria-label="Background media file"
              accept={CONTROL_LIVE_LAYOUT_BACKGROUND_ACCEPT}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file !== undefined) void pickBackground(file);
              }}
            />
          </div>
        </div>

        <div className="cg-live-layout-presets">
          <span>Presets</span>
          <div className="cg-live-layout-preset-buttons" role="group" aria-label="Presets">
            {layout.presets.map((candidate, index) => (
              <Button
                key={candidate.id}
                className="cg-live-layout-preset-choice"
                active={candidate.id === preset.id}
                aria-pressed={candidate.id === preset.id}
                onClick={() => choosePreset(candidate)}
              >
                <span className="cg-live-layout-selection-mark" aria-hidden="true">
                  <Icon icon={Check} size={15} />
                </span>
                <IsolatedName>
                  {candidate.name.trim() || `Preset ${String(index + 1)}`}
                </IsolatedName>
              </Button>
            ))}
            <Button variant="add" onClick={appendPreset}>
              <Icon icon={Plus} size={15} /> Add preset
            </Button>
            <Button
              className="cg-list-remove"
              variant="icon"
              title="Delete preset"
              aria-label="Delete preset"
              disabled={layout.presets.length <= 1}
              onClick={deletePreset}
            >
              <Icon icon={Trash2} size={15} />
            </Button>
          </div>
        </div>

        <div className="cg-live-layout-workspace">
          <section ref={preview} className="cg-live-layout-preview" aria-label="Layout preview">
            <LiveLayoutEditorArrange
              layout={layout}
              preset={preset}
              onChange={rebuildArrangement}
            />
            <div className="cg-live-layout-panel-head">
              <h3>Preview · PVW</h3>
              {focusId !== undefined && (
                <Button ref={returnButton} variant="secondary" onClick={returnToPreset}>
                  <Icon icon={RotateCcw} size={15} /> Return to{' '}
                  <IsolatedName>{preset.name || 'preset'}</IsolatedName>
                </Button>
              )}
            </div>
            <LiveLayoutEditorPreview
              layout={layout}
              preset={preset}
              geometry={geometry}
              selectedFrameId={frame.id}
              focused={focusId}
              backgroundUrl={assetUrl}
              sourceFrames={sourceFrames}
              onFocus={focusFrame}
            />
            <LiveLayoutEditorEffects
              effects={layout.effects}
              onChange={(effects) => setLayout((current) => ({ ...current, effects }))}
            />
          </section>

          <aside className="cg-live-layout-frames" aria-label="Frames">
            <div className="cg-live-layout-panel-head">
              <h3>Frames</h3>
              <Button
                variant="add"
                disabled={layout.frames.length >= CONTROL_LIVE_LAYOUT_MAX_FRAMES}
                onClick={appendFrame}
              >
                <Icon icon={Plus} size={15} /> Add frame
              </Button>
            </div>
            <div className="cg-live-layout-frame-list">
              <div
                className="cg-live-layout-frame-row cg-live-layout-frame-header"
                aria-hidden="true"
              >
                <span>Frame</span>
                <span>In preset</span>
              </div>
              {layout.frames.map((candidate, index) => {
                const name = candidate.title.trim() || `Frame ${String(index + 1)}`;
                const included = preset.frameIds.includes(candidate.id);
                const picture = sourceFrames.get(candidate.sourceId ?? '')?.jpegBase64;
                return (
                  <div className="cg-live-layout-frame-row" key={candidate.id}>
                    <Button
                      className="cg-live-layout-frame-choice"
                      aria-label={`Edit frame ${String(index + 1)}`}
                      active={candidate.id === frame.id}
                      aria-pressed={candidate.id === frame.id}
                      onClick={() => setFrameId(candidate.id)}
                    >
                      <span className="cg-live-layout-frame-thumbnail" aria-hidden="true">
                        {picture === undefined ? (
                          <Icon icon={Video} size={16} />
                        ) : (
                          <img src={`data:image/jpeg;base64,${picture}`} alt="" />
                        )}
                      </span>
                      <span className="cg-live-layout-frame-label">
                        <IsolatedName>{name}</IsolatedName>
                        <SourceLabel sourceId={candidate.sourceId ?? ''} fallback="Unassigned" />
                      </span>
                      <span className="cg-live-layout-selection-mark" aria-hidden="true">
                        <Icon icon={Pencil} size={14} />
                      </span>
                    </Button>
                    <Checkbox
                      checked={included}
                      disabled={included && preset.frameIds.length <= 1}
                      onChange={(next) => includeFrame(candidate.id, next)}
                      aria-label={`Frame ${String(index + 1)} in preset`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="cg-live-layout-fields">
              <div className="cg-live-layout-panel-head">
                <h3>Frame {frameNumber}</h3>
                <Button
                  className="cg-list-remove"
                  variant="icon"
                  aria-label="Delete frame"
                  title="Delete frame"
                  disabled={layout.frames.length <= 1}
                  onClick={deleteFrame}
                >
                  <Icon icon={Trash2} size={15} />
                </Button>
              </div>
              <label htmlFor={`${fieldsId}-input`}>Input</label>
              <SourcePicker
                id={`${fieldsId}-input`}
                aria-label="Frame input"
                channel={channel}
                value={frame.sourceId ?? ''}
                choices={[{ value: '', label: 'Unassigned' }]}
                onChange={(sourceId) =>
                  updateFrame(({ sourceId: _old, ...candidate }) =>
                    sourceId === '' ? candidate : { ...candidate, sourceId },
                  )
                }
              />
              <label htmlFor={`${fieldsId}-title`}>
                Title
                <TextInput
                  id={`${fieldsId}-title`}
                  ref={titleInput}
                  value={frame.title}
                  dir="auto"
                  maxLength={120}
                  onChange={(title) => updateFrame((candidate) => ({ ...candidate, title }))}
                />
              </label>
              <LiveLayoutEditorTitleStyle
                raster={layout.resolution}
                frameId={frame.id}
                frameNumber={frameNumber}
                shared={layout.titleStyle}
                override={frame.titleStyle}
                fonts={layout.fonts ?? []}
                readingFont={readingFont}
                onSharedChange={(patch) =>
                  setLayout((current) => ({
                    ...current,
                    titleStyle: { ...current.titleStyle, ...patch },
                  }))
                }
                onOverrideChange={(patch) =>
                  updateFrame((candidate) => ({
                    ...candidate,
                    titleStyle: { ...candidate.titleStyle, ...patch },
                  }))
                }
                onResetOverride={() =>
                  updateFrame(({ titleStyle: _override, ...candidate }) => candidate)
                }
                onAddFont={(file, scope) => void addFont(file, scope)}
              />
              <label className="cg-live-layout-toggle" htmlFor={`${fieldsId}-title-preset`}>
                <Checkbox
                  id={`${fieldsId}-title-preset`}
                  checked={!preset.hiddenTitles.includes(frame.id)}
                  onChange={(show) =>
                    updatePreset({
                      hiddenTitles: visibleTitle(preset.hiddenTitles, frame.id, show),
                    })
                  }
                />
                Show title in preset
              </label>
              <label className="cg-live-layout-toggle" htmlFor={`${fieldsId}-title-focus`}>
                <Checkbox
                  id={`${fieldsId}-title-focus`}
                  checked={!preset.hiddenFocusTitles.includes(frame.id)}
                  onChange={(show) =>
                    updatePreset({
                      hiddenFocusTitles: visibleTitle(preset.hiddenFocusTitles, frame.id, show),
                    })
                  }
                />
                Show title in Focus
              </label>
              <LiveLayoutEditorFrameOptions
                frame={frame}
                onChange={(patch) => updateFrame((candidate) => ({ ...candidate, ...patch }))}
              />
            </div>
            <div className="cg-live-layout-fields">
              <label htmlFor={`${fieldsId}-preset-name`}>
                Preset name
                <TextInput
                  id={`${fieldsId}-preset-name`}
                  ref={presetName}
                  value={preset.name}
                  dir="auto"
                  maxLength={80}
                  onChange={(name) => updatePreset({ name })}
                />
              </label>
              {preset.id === layout.defaultPresetId ? (
                <span>Starting preset</span>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setLayout((current) => ({ ...current, defaultPresetId: preset.id }))
                  }
                >
                  Start with this preset
                </Button>
              )}
            </div>
          </aside>
        </div>
      </fieldset>
    </Modal>
  );
}
