import { useEffect, useId, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  Flag,
  ImagePlus,
  Layers3,
  LayoutGrid,
  Monitor,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Video,
} from 'lucide-react';
import {
  CONTROL_LIVE_LAYOUT_FOCUS_ALIAS_MAX_LENGTH,
  CONTROL_LIVE_LAYOUT_MAX_FRAMES,
  ControlLiveLayoutSchema,
  LiveRevealRectSchema,
  controlLiveLayoutAttachments,
  controlLiveLayoutFontFamily,
  controlLiveLayoutFrameAttachments,
  controlLiveLayoutMovePresetFrame,
  controlLiveLayoutPresetFrameIds,
  controlLiveLayoutRects,
  sameLiveMaskRect,
  type ControlLiveLayout,
  type ControlLiveLayoutBackground,
  type ControlLiveLayoutArrangement,
  type ControlLiveLayoutFrameAttachment,
  type ControlLiveLayoutPlateOverride,
  type ControlLiveLayoutPreset,
  type ControlLiveLayoutTitleStyle,
  type LiveRevealRect,
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
import { InputAudioMeter } from '../sources/InputAudioMeter.js';
import { labelledSource, SourceLabel } from '../sources/SourceLabel.js';
import { SourcePicker } from '../sources/SourcePicker.js';
import { LiveLayoutEditorArrange } from './LiveLayoutEditorArrange.js';
import { LiveLayoutEditorEffects } from './LiveLayoutEditorEffects.js';
import { LiveLayoutEditorFrameAttachments } from './LiveLayoutEditorFrameAttachments.js';
import { LiveLayoutEditorFrameOptions } from './LiveLayoutEditorFrameOptions.js';
import {
  promoteFrameAttachments,
  readControlLiveLayoutFrameAttachment,
  type ControlLiveLayoutFrameAttachmentSource,
} from './controlLiveLayoutFrameAttachments.js';
import { LiveLayoutEditorRectOverlay } from './LiveLayoutEditorRectOverlay.js';
import { LiveLayoutEditorPreview } from './LiveLayoutEditorPreview.js';
import { LiveLayoutEditorTexts } from './LiveLayoutEditorTexts.js';
import { LiveLayoutEditorTitleStyle } from './LiveLayoutEditorTitleStyle.js';
import './live-layout-editor.css';

interface LiveLayoutEditorProps {
  channel: number;
  initial: ControlLiveLayout;
  initialBackground?: Blob | undefined;
  initialFonts?: ReadonlyMap<string, Blob> | undefined;
  initialAttachments?: ReadonlyMap<string, ControlLiveLayoutFrameAttachmentSource> | undefined;
  mode: 'create' | 'edit' | 'duplicate';
  onSave: (
    layout: ControlLiveLayout,
    background: Blob | undefined,
    fonts: ReadonlyMap<string, Blob>,
    attachments: ReadonlyMap<string, ControlLiveLayoutFrameAttachmentSource>,
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

function withAdditionalTextStyle(
  layout: ControlLiveLayout,
  index: number,
  patch: ControlLiveLayoutTitleStyle,
): ControlLiveLayout {
  const styles = layout.additionalTextStyles ?? [];
  return {
    ...layout,
    additionalTextStyles: Array.from({ length: Math.max(styles.length, index + 1) }, (_, slot) =>
      slot === index ? { ...styles[slot], ...patch } : (styles[slot] ?? null),
    ),
  };
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

function omitPlateOverride(
  preset: ControlLiveLayoutPreset,
  plateId: string,
): Pick<ControlLiveLayoutPreset, 'plateOverrides'> {
  const overrides = preset.plateOverrides;
  if (overrides === undefined || !Object.hasOwn(overrides, plateId)) return {};
  const { [plateId]: _removed, ...remaining } = overrides;
  return { plateOverrides: Object.keys(remaining).length > 0 ? remaining : undefined };
}

export function LiveLayoutEditor({
  channel,
  initial,
  initialBackground,
  initialFonts,
  initialAttachments,
  mode,
  onSave,
  onClose,
}: LiveLayoutEditorProps): JSX.Element | null {
  const [layout, setLayout] = useState<ControlLiveLayout>(() =>
    mode === 'create' ? { ...initial, frames: [], presets: [], defaultPresetId: '' } : initial,
  );
  const [asset, setAsset] = useState(initialBackground);
  const lastSolidColor = useRef(
    initial.background.kind === 'color' ? initial.background.color : liveLayoutArtwork.background,
  );
  const [fontAssets, setFontAssets] = useState<ReadonlyMap<string, Blob>>(
    () => initialFonts ?? new Map(),
  );
  const [attachmentAssets, setAttachmentAssets] = useState(
    () => initialAttachments ?? new Map<string, ControlLiveLayoutFrameAttachmentSource>(),
  );
  const [presetId, setPresetId] = useState<string | undefined>(layout.defaultPresetId || undefined);
  const [frameId, setFrameId] = useState(() => {
    const startingPreset = layout.presets.find(({ id }) => id === layout.defaultPresetId);
    return startingPreset === undefined
      ? layout.frames[0]?.id
      : controlLiveLayoutPresetFrameIds(startingPreset)[0];
  });
  const [focusId, setFocusId] = useState<string>();
  const [showPreviewMeters, setShowPreviewMeters] = useState(false);
  const [maskSelection, setMaskSelection] = useState<{ frameId: string; index: number }>();
  const [maskEditFrameId, setMaskEditFrameId] = useState<string>();
  const [attachmentId, setAttachmentId] = useState<string>();
  const [attachmentEditing, setAttachmentEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readingMedia, setReadingMedia] = useState(false);
  const [readingFont, setReadingFont] = useState(false);
  const [readingAttachment, setReadingAttachment] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const saveInFlight = useRef(false);
  const mediaRead = useRef(0);
  const fontRead = useRef(0);
  const attachmentRead = useRef(0);
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
    true,
    'editor',
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
      attachmentRead.current += 1;
    },
    [],
  );

  const preset = layout.presets.find(({ id }) => id === presetId) ?? layout.presets[0];
  const frame = layout.frames.find(({ id }) => id === frameId) ?? layout.frames[0];
  const frameNumber = frame === undefined ? 0 : layout.frames.indexOf(frame) + 1;
  const presetFrameIds = preset === undefined ? [] : controlLiveLayoutPresetFrameIds(preset);
  const framePosition = frame === undefined ? -1 : presetFrameIds.indexOf(frame.id);
  const geometry: ReturnType<typeof controlLiveLayoutRects> =
    preset === undefined ? {} : controlLiveLayoutRects(layout, preset);
  const frameShown =
    frame !== undefined &&
    (focusId === undefined ? geometry[frame.id] !== undefined : focusId === frame.id);
  const frameAttachments =
    frame === undefined ? [] : controlLiveLayoutFrameAttachments(layout, preset, frame.id);
  const activeAttachment =
    frameAttachments.find(({ id }) => id === attachmentId) ?? frameAttachments[0];
  const editingAttachment =
    frameShown &&
    !busy &&
    attachmentEditing &&
    activeAttachment !== undefined &&
    activeAttachment.id === attachmentId;
  const maskWindows = frame?.liveMask?.rects ?? [];
  const maskIndex = Math.min(
    maskSelection !== undefined && maskSelection.frameId === frame?.id ? maskSelection.index : 0,
    maskWindows.length - 1,
  );
  const canEditMask = maskWindows.length > 0 && frameShown;
  const editingMask = canEditMask && maskEditFrameId === frame?.id && !busy;
  const canSave =
    layout.name.trim() !== '' &&
    layout.frames.length > 0 &&
    layout.presets.length > 0 &&
    layout.presets.every(
      (candidate) =>
        candidate.name.trim() !== '' &&
        candidate.frameIds.length > 0 &&
        Object.keys(controlLiveLayoutRects(layout, candidate)).length === candidate.frameIds.length,
    );

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

  function updatePlateOverride(patch: ControlLiveLayoutPlateOverride): void {
    if (preset === undefined || frame === undefined || !preset.frameIds.includes(frame.id)) return;
    const selection = { ...preset.plateOverrides?.[frame.id], ...patch };
    const changes =
      selection.aspectRatio === undefined && selection.fitMode === undefined
        ? omitPlateOverride(preset, frame.id)
        : { plateOverrides: { ...preset.plateOverrides, [frame.id]: selection } };
    if (
      Object.keys(controlLiveLayoutRects(layout, { ...preset, ...changes })).length !==
      preset.frameIds.length
    )
      return;
    if ('aspectRatio' in patch) rebuildArrangement(changes);
    else updatePreset(changes);
  }

  function choosePreset(next: ControlLiveLayoutPreset): void {
    setFocusId(undefined);
    setAttachmentEditing(false);
    setPresetId(next.id);
    if (frameId === undefined || !next.frameIds.includes(frameId))
      setFrameId(controlLiveLayoutPresetFrameIds(next)[0]);
  }

  function appendPreset(): void {
    const next: ControlLiveLayoutPreset = {
      ...(preset ?? {
        frameIds: layout.frames.map(({ id }) => id),
        arrangement: 'side-by-side',
        horizontalGap: initial.presets[0]?.horizontalGap ?? 0,
        verticalGap: initial.presets[0]?.verticalGap ?? 0,
        reverse: false,
        hiddenTitles: [],
        hiddenFocusTitles: [],
      }),
      id: `preset-${uuid()}`,
      name: nextPresetName(layout.presets),
      ...(preset?.frameAttachments !== undefined && {
        frameAttachments: preset.frameAttachments.map((attachment) => ({
          ...attachment,
          id: uuid(),
        })),
      }),
    };
    setLayout((current) => ({
      ...current,
      presets: [...current.presets, next],
      defaultPresetId: current.defaultPresetId || next.id,
    }));
    choosePreset(next);
    requestAnimationFrame(() => {
      presetName.current?.focus();
      presetName.current?.select();
    });
  }

  function deletePreset(): void {
    if (preset === undefined || (mode !== 'create' && layout.presets.length <= 1)) return;
    const presets = layout.presets.filter(({ id }) => id !== preset.id);
    const next = presets[Math.min(layout.presets.indexOf(preset), presets.length - 1)];
    setLayout((current) => ({
      ...current,
      presets,
      defaultPresetId:
        current.defaultPresetId === preset.id ? (next?.id ?? '') : current.defaultPresetId,
    }));
    if (next === undefined) {
      setPresetId(undefined);
      setFocusId(undefined);
      setAttachmentEditing(false);
    } else {
      choosePreset(next);
    }
  }

  function appendFrame(): void {
    if (layout.frames.length >= CONTROL_LIVE_LAYOUT_MAX_FRAMES) return;
    const id = `frame-${uuid()}`;
    setFocusId(undefined);
    setFrameId(id);
    setLayout((current) => ({
      ...current,
      frames: [
        ...current.frames,
        { id, title: '', operatorMove: false, operatorPlacement: 'locked' },
      ],
      presets: current.presets.map((candidate) => {
        if (candidate.id !== preset?.id) return candidate;
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
    if (frame === undefined || (mode !== 'create' && layout.frames.length <= 1)) return;
    const frames = layout.frames.filter(({ id }) => id !== frame.id);
    const next = frames[Math.min(layout.frames.indexOf(frame), frames.length - 1)];
    setFocusId(undefined);
    setFrameId(next?.id);
    setLayout((current) => ({
      ...current,
      frames,
      ...(current.frameAttachments !== undefined && {
        frameAttachments: current.frameAttachments.filter(({ frameId }) => frameId !== frame.id),
      }),
      presets: current.presets.map((candidate) => {
        const remaining = candidate.frameIds.filter((id) => id !== frame.id);
        const frameIds =
          remaining.length === 0 && next !== undefined && mode !== 'create' ? [next.id] : remaining;
        return {
          ...candidate,
          frameIds,
          ...omitPlateOverride(candidate, frame.id),
          arrangement: arrangementForCount(candidate.arrangement, frameIds.length),
          hiddenTitles: candidate.hiddenTitles.filter((id) => id !== frame.id),
          hiddenFocusTitles: candidate.hiddenFocusTitles.filter((id) => id !== frame.id),
          ...(candidate.frameAttachments !== undefined && {
            frameAttachments: candidate.frameAttachments.filter(
              ({ frameId }) => frameId !== frame.id,
            ),
          }),
        };
      }),
    }));
  }

  function includeFrame(id: string, included: boolean): void {
    if (preset === undefined || (mode !== 'create' && !included && preset.frameIds.length === 1))
      return;
    const frameIds = included
      ? [...preset.frameIds, id]
      : preset.frameIds.filter((value) => value !== id);
    rebuildArrangement({
      frameIds,
      ...(!included && omitPlateOverride(preset, id)),
      arrangement: arrangementForCount(preset.arrangement, frameIds.length),
      ...(!included &&
        preset.frameAttachments !== undefined && {
          frameAttachments: preset.frameAttachments.filter(({ frameId }) => frameId !== id),
        }),
    });
  }

  function changeAttachments(
    id: string,
    change: (
      attachments: readonly ControlLiveLayoutFrameAttachment[],
    ) => ControlLiveLayoutFrameAttachment[],
  ): void {
    if (frame === undefined) return;
    const currentPresetId = preset?.id;
    const currentFrameId = frame.id;
    setLayout((current) => {
      const promoted = promoteFrameAttachments(current, currentFrameId, attachmentAssets, id);
      if (promoted.frameAttachments?.some((attachment) => attachment.id === id) === true)
        return { ...promoted, frameAttachments: change(promoted.frameAttachments) };
      const changed = {
        ...promoted,
        presets: promoted.presets.map((candidate) =>
          candidate.id === currentPresetId
            ? { ...candidate, frameAttachments: change(candidate.frameAttachments ?? []) }
            : candidate,
        ),
      };
      return promoteFrameAttachments(changed, currentFrameId, attachmentAssets);
    });
  }

  async function importAttachment(file: File): Promise<void> {
    if (frame === undefined) return;
    const { id: frameId } = frame;
    const request = ++attachmentRead.current;
    setReadingAttachment(true);
    setRefusal(undefined);
    try {
      const source = await readControlLiveLayoutFrameAttachment(file);
      if (request !== attachmentRead.current) return;
      if (
        source.plate !== undefined &&
        controlLiveLayoutAttachments(layout).some(
          (attachment) =>
            attachment.frameId === frameId &&
            attachmentAssets.get(attachment.sourceId)?.plate !== undefined,
        )
      )
        throw new Error('This plate already has a graphic with a live input.');
      const attachment: ControlLiveLayoutFrameAttachment = {
        id: uuid(),
        frameId,
        sourceId: source.id,
        name: (
          source.name.trim() ||
          file.name.replace(/\.vcg$/i, '').trim() ||
          'Plate graphic'
        ).slice(0, 255),
        rect: { x: 0.125, y: 0.125, width: 0.75, height: 0.75 },
      };
      setAttachmentAssets((current) => new Map(current).set(source.id, source));
      setLayout((current) => {
        if (!current.frames.some(({ id }) => id === frameId)) return current;
        const promoted = promoteFrameAttachments(current, frameId, attachmentAssets);
        return {
          ...promoted,
          frameAttachments: [...(promoted.frameAttachments ?? []), attachment],
        };
      });
      setAttachmentEditing(false);
      setAttachmentId(attachment.id);
    } catch (cause) {
      if (request === attachmentRead.current)
        setRefusal(cause instanceof Error ? cause.message : 'The plate graphic could not be read.');
    } finally {
      if (request === attachmentRead.current) setReadingAttachment(false);
    }
  }

  function placeAttachment(id: string, rect: LiveRevealRect): void {
    if (!LiveRevealRectSchema.safeParse(rect).success) return;
    changeAttachments(id, (attachments) =>
      attachments.map((attachment) =>
        attachment.id === id && !sameLiveMaskRect(attachment.rect, rect)
          ? { ...attachment, rect }
          : attachment,
      ),
    );
  }

  function reorderAttachment(id: string, direction: -1 | 1): void {
    changeAttachments(id, (attachments) => {
      const next = [...attachments];
      const slots = attachments.flatMap((attachment, index) =>
        attachment.frameId === frame?.id ? [{ attachment, index }] : [],
      );
      const position = slots.findIndex(({ attachment }) => attachment.id === id);
      const from = slots[position];
      const to = slots[position + direction];
      if (from !== undefined && to !== undefined) {
        next[from.index] = to.attachment;
        next[to.index] = from.attachment;
      }
      return next;
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

  function selectMaskWindow(index: number): void {
    if (frame !== undefined) setMaskSelection({ frameId: frame.id, index });
  }

  function updateMaskWindow(index: number, rect: LiveRevealRect): void {
    updateFrame((candidate) => {
      const mask = candidate.liveMask;
      const existing = mask?.rects[index];
      if (mask === undefined || existing === undefined || sameLiveMaskRect(existing, rect))
        return candidate;
      const rects = mask.rects.map((window, current) => (current === index ? rect : window));
      return { ...candidate, liveMask: { ...mask, rects } };
    });
  }

  function setNonMediaBackground(
    background: Extract<ControlLiveLayoutBackground, { kind: 'color' | 'none' }>,
  ): void {
    mediaRead.current += 1;
    setReadingMedia(false);
    setAsset(undefined);
    setRefusal(undefined);
    if (background.kind === 'color') lastSolidColor.current = background.color;
    setLayout((current) => ({ ...current, background }));
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

  async function addFont(
    file: File,
    scope: 'shared' | 'frame',
    extra?: { id: string; index: number },
  ): Promise<void> {
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
        if (scope === 'shared') {
          return extra === undefined
            ? { ...current, fonts, titleStyle: { ...current.titleStyle, fontFamily } }
            : withAdditionalTextStyle({ ...current, fonts }, extra.index, { fontFamily });
        }
        return {
          ...current,
          fonts,
          frames: current.frames.map((candidate) => {
            if (candidate.id !== target) return candidate;
            if (extra === undefined) {
              return { ...candidate, titleStyle: { ...candidate.titleStyle, fontFamily } };
            }
            return {
              ...candidate,
              additionalTexts: candidate.additionalTexts?.map((item) =>
                item.id === extra.id ? { ...item, style: { ...item.style, fontFamily } } : item,
              ),
            };
          }),
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
    if (!canSave || saveInFlight.current || readingMedia || readingFont || readingAttachment)
      return;
    const draft = ControlLiveLayoutSchema.safeParse({
      ...layout,
      name: layout.name.trim(),
      presets: layout.presets.map((candidate) => ({ ...candidate, name: candidate.name.trim() })),
    });
    if (!draft.success) {
      setRefusal('Check that every preset has a name and a valid plate arrangement.');
      return;
    }
    setRefusal(undefined);
    saveInFlight.current = true;
    setBusy(true);
    try {
      await onSave(draft.data, asset, fontAssets, attachmentAssets);
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
            disabled={!canSave || busy || readingMedia || readingFont || readingAttachment}
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
            <Button
              variant="neutral"
              aria-pressed={layout.background.kind === 'none'}
              onClick={() => setNonMediaBackground({ kind: 'none' })}
            >
              None
            </Button>
            <Button
              variant="neutral"
              aria-pressed={layout.background.kind === 'color'}
              onClick={() =>
                setNonMediaBackground({ kind: 'color', color: lastSolidColor.current })
              }
            >
              Solid color
            </Button>
            <Button
              variant="neutral"
              aria-label="Choose background image or video"
              aria-pressed={
                layout.background.kind === 'image' || layout.background.kind === 'video'
              }
              onClick={() => mediaPick.current?.click()}
            >
              <Icon icon={ImagePlus} size={15} />
              {readingMedia ? 'Reading…' : 'Image or video'}
            </Button>
            {layout.background.kind === 'color' && (
              <ColorInput
                value={layout.background.color.slice(0, 7)}
                onChange={(color) => setNonMediaBackground({ kind: 'color', color })}
                aria-label="Background color"
              />
            )}
            {(layout.background.kind === 'image' || layout.background.kind === 'video') && (
              <IsolatedName className="cg-live-layout-file" title={layout.background.name}>
                {layout.background.name}
              </IsolatedName>
            )}
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
          <span className="cg-live-layout-tool-label">
            <Icon icon={Layers3} size={14} /> Presets
          </span>
          <div className="cg-live-layout-preset-buttons" role="group" aria-label="Presets">
            {layout.presets.map((candidate, index) => (
              <Button
                key={candidate.id}
                className="cg-live-layout-preset-choice"
                active={candidate.id === preset?.id}
                aria-pressed={candidate.id === preset?.id}
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
            <Button variant="neutral" onClick={appendPreset}>
              <Icon icon={Plus} size={15} /> Add preset
            </Button>
            <Button
              className="cg-list-remove"
              variant="icon"
              title="Delete preset"
              aria-label="Delete preset"
              disabled={preset === undefined || (mode !== 'create' && layout.presets.length <= 1)}
              onClick={deletePreset}
            >
              <Icon icon={Trash2} size={15} />
            </Button>
          </div>
          <div className="cg-live-layout-preset-settings">
            <label htmlFor={`${fieldsId}-preset-name`}>Preset name</label>
            <TextInput
              id={`${fieldsId}-preset-name`}
              ref={presetName}
              value={preset?.name ?? ''}
              disabled={preset === undefined}
              dir="auto"
              maxLength={80}
              onChange={(name) => updatePreset({ name })}
            />
            <Button
              variant="neutral"
              aria-pressed={preset?.id === layout.defaultPresetId}
              disabled={preset === undefined || preset.id === layout.defaultPresetId}
              onClick={() => {
                if (preset !== undefined)
                  setLayout((current) => ({ ...current, defaultPresetId: preset.id }));
              }}
            >
              <Icon icon={Flag} size={13} /> Start with this preset
            </Button>
          </div>
        </div>

        <div className="cg-live-layout-workspace">
          <section ref={preview} className="cg-live-layout-preview" aria-label="Layout preview">
            <div className="cg-live-layout-panel-head">
              <h3>
                <Icon icon={Monitor} size={16} /> Preview · PVW
              </h3>
              <div className="cg-live-layout-preview-actions">
                {focusId !== undefined && preset !== undefined && (
                  <Button ref={returnButton} variant="neutral" onClick={returnToPreset}>
                    <Icon icon={RotateCcw} size={15} /> Return to{' '}
                    <IsolatedName>{preset.name || 'preset'}</IsolatedName>
                  </Button>
                )}
                <Button
                  variant="neutral"
                  aria-pressed={showPreviewMeters}
                  active={showPreviewMeters}
                  title={showPreviewMeters ? 'Hide preview VU meters' : 'Show preview VU meters'}
                  onClick={() => setShowPreviewMeters((visible) => !visible)}
                >
                  <Icon icon={AudioLines} size={15} /> VU meters
                </Button>
              </div>
            </div>
            {preset !== undefined && frame !== undefined && presetFrameIds.length > 0 ? (
              <LiveLayoutEditorPreview
                channel={channel}
                layout={layout}
                preset={preset}
                geometry={geometry}
                selectedFrameId={frame.id}
                focused={focusId}
                backgroundUrl={assetUrl}
                sourceFrames={sourceFrames}
                showMeters={showPreviewMeters}
                attachmentSources={attachmentAssets}
                onFocus={focusFrame}
                placementEditor={
                  editingMask ? (
                    <LiveLayoutEditorRectOverlay
                      key={'mask:' + frame.id}
                      kind="mask"
                      rects={maskWindows}
                      selectedIndex={maskIndex}
                      onSelect={selectMaskWindow}
                      onChange={updateMaskWindow}
                    />
                  ) : editingAttachment ? (
                    <LiveLayoutEditorRectOverlay
                      key={'graphic:' + activeAttachment.id}
                      kind="graphic"
                      rects={[activeAttachment.rect]}
                      selectedIndex={0}
                      onSelect={() => setAttachmentId(activeAttachment.id)}
                      onChange={(_, rect) => placeAttachment(activeAttachment.id, rect)}
                    />
                  ) : undefined
                }
              />
            ) : (
              <div
                className="cg-live-layout-stage cg-live-layout-empty-preview"
                data-layout-preview=""
                data-transparent-background={layout.background.kind === 'none' ? '' : undefined}
                style={{ aspectRatio: layout.resolution.width / layout.resolution.height }}
              >
                {layout.frames.length === 0
                  ? 'Add a plate to begin.'
                  : preset === undefined
                    ? 'Add a preset to preview these plates.'
                    : 'Choose plates for this preset.'}
              </div>
            )}
            <div className="cg-live-layout-preview-controls">
              {preset !== undefined && (
                <LiveLayoutEditorArrange
                  layout={layout}
                  preset={preset}
                  onChange={rebuildArrangement}
                  onFitChange={(plateFitMode) => updatePreset({ plateFitMode })}
                />
              )}
              <LiveLayoutEditorEffects
                effects={layout.effects}
                onChange={(effects) => setLayout((current) => ({ ...current, effects }))}
              />
            </div>
          </section>

          <aside className="cg-live-layout-frames" aria-label="Plates">
            <div className="cg-live-layout-panel-head">
              <h3>
                <Icon icon={LayoutGrid} size={16} /> Plates
              </h3>
              <Button
                variant="neutral"
                disabled={layout.frames.length >= CONTROL_LIVE_LAYOUT_MAX_FRAMES}
                onClick={appendFrame}
              >
                <Icon icon={Plus} size={15} /> Add plate
              </Button>
            </div>
            {frame !== undefined && (
              <div className="cg-live-layout-frame-list">
                <div
                  className="cg-live-layout-frame-row cg-live-layout-frame-header"
                  aria-hidden="true"
                >
                  <span>Plate</span>
                  {preset !== undefined && <span>In preset</span>}
                </div>
                {layout.frames.map((candidate, index) => {
                  const name = candidate.title.trim() || `Plate ${String(index + 1)}`;
                  const position = presetFrameIds.indexOf(candidate.id) + 1;
                  const included = position > 0;
                  const positionId = `${fieldsId}-position-${String(index + 1)}`;
                  const picture = sourceFrames.get(candidate.sourceId ?? '')?.jpegBase64;
                  const source = labelledSource(candidate.sourceId);
                  return (
                    <div
                      className="cg-live-layout-frame-row"
                      key={candidate.id}
                      data-preset-position={included ? position : undefined}
                    >
                      <Button
                        className="cg-live-layout-frame-choice"
                        aria-label={`Edit plate ${String(index + 1)}`}
                        aria-describedby={included ? positionId : undefined}
                        active={candidate.id === frame.id}
                        aria-pressed={candidate.id === frame.id}
                        onClick={() => setFrameId(candidate.id)}
                      >
                        <span className="cg-input-picture-meter">
                          <span className="cg-live-layout-frame-thumbnail" aria-hidden="true">
                            {picture === undefined ? (
                              <Icon icon={Video} size={16} />
                            ) : (
                              <img src={`data:image/jpeg;base64,${picture}`} alt="" />
                            )}
                          </span>
                          {candidate.sourceId !== undefined && (
                            <InputAudioMeter
                              sourceId={candidate.sourceId}
                              channel={channel}
                              name={source?.name ?? name}
                            />
                          )}
                        </span>
                        <span className="cg-live-layout-frame-label">
                          <IsolatedName>{name}</IsolatedName>
                          <SourceLabel sourceId={candidate.sourceId} fallback="Unassigned" />
                        </span>
                        {included && (
                          <span
                            className="cg-live-layout-frame-position-marker"
                            id={positionId}
                            title={`Position ${String(position)} in this preset`}
                          >
                            Pos {position}
                          </span>
                        )}
                        <span className="cg-live-layout-selection-mark" aria-hidden="true">
                          <Icon icon={Pencil} size={14} />
                        </span>
                      </Button>
                      {preset !== undefined && (
                        <Checkbox
                          checked={included}
                          disabled={mode !== 'create' && included && preset.frameIds.length <= 1}
                          onChange={(next) => includeFrame(candidate.id, next)}
                          aria-label={`Plate ${String(index + 1)} in preset`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {frame !== undefined && (
              <div className="cg-live-layout-fields">
                <div className="cg-live-layout-panel-head">
                  <h3>Plate {frameNumber}</h3>
                  <Button
                    className="cg-list-remove"
                    variant="icon"
                    aria-label="Delete plate"
                    title="Delete plate"
                    disabled={mode !== 'create' && layout.frames.length <= 1}
                    onClick={deleteFrame}
                  >
                    <Icon icon={Trash2} size={15} />
                  </Button>
                </div>
                <div className="cg-live-layout-frame-field">
                  <label htmlFor={`${fieldsId}-input`}>Input</label>
                  <SourcePicker
                    id={`${fieldsId}-input`}
                    aria-label="Plate input"
                    channel={channel}
                    value={frame.sourceId ?? ''}
                    choices={[{ value: '', label: 'Unassigned' }]}
                    onChange={(sourceId) =>
                      updateFrame(({ sourceId: _old, ...candidate }) =>
                        sourceId === '' ? candidate : { ...candidate, sourceId },
                      )
                    }
                  />
                </div>
                <label className="cg-live-layout-frame-field" htmlFor={`${fieldsId}-title`}>
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
                <label
                  className="cg-live-layout-frame-field cg-live-layout-focus-label"
                  htmlFor={`${fieldsId}-focus-label`}
                  title="Label on Focus buttons"
                >
                  Focus label
                  <TextInput
                    id={`${fieldsId}-focus-label`}
                    value={frame.focusAlias ?? ''}
                    placeholder={String(frameNumber)}
                    dir="auto"
                    maxLength={CONTROL_LIVE_LAYOUT_FOCUS_ALIAS_MAX_LENGTH}
                    onChange={(focusAlias) =>
                      updateFrame((candidate) => ({ ...candidate, focusAlias }))
                    }
                  />
                </label>
                {preset !== undefined && framePosition >= 0 && presetFrameIds.length > 1 && (
                  <div className="cg-live-layout-position-picker">
                    <span id={`${fieldsId}-position-label`}>Position in preset</span>
                    <div
                      className="cg-live-layout-frame-position"
                      role="group"
                      aria-labelledby={`${fieldsId}-position-label`}
                    >
                      {presetFrameIds.map((_, index) => (
                        <Button
                          key={index}
                          aria-label={`Position ${String(index + 1)}`}
                          aria-pressed={framePosition === index}
                          onClick={() => {
                            if (index === framePosition) return;
                            const frameIds = controlLiveLayoutMovePresetFrame(
                              preset,
                              frame.id,
                              index,
                            );
                            if (frameIds !== undefined) rebuildArrangement({ frameIds });
                          }}
                        >
                          {index + 1}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
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
                {preset !== undefined && (
                  <div className="cg-live-layout-title-visibility">
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
                            hiddenFocusTitles: visibleTitle(
                              preset.hiddenFocusTitles,
                              frame.id,
                              show,
                            ),
                          })
                        }
                      />
                      Show title in Focus
                    </label>
                  </div>
                )}
                <LiveLayoutEditorTexts
                  key={frame.id}
                  layout={layout}
                  frame={frame}
                  frameNumber={frameNumber}
                  readingFont={readingFont}
                  onChange={(additionalTexts) =>
                    updateFrame((candidate) => ({ ...candidate, additionalTexts }))
                  }
                  onSharedStyle={(index, patch) =>
                    setLayout((current) => withAdditionalTextStyle(current, index, patch))
                  }
                  onAddFont={(file, scope, extra) => void addFont(file, scope, extra)}
                />
                <LiveLayoutEditorFrameOptions
                  frame={frame}
                  presetOverrides={
                    preset === undefined || !preset.frameIds.includes(frame.id)
                      ? undefined
                      : {
                          id: preset.id,
                          value: preset.plateOverrides?.[frame.id],
                          inheritedAspect:
                            preset.plateAspectRatio ??
                            layout.resolution.width / layout.resolution.height,
                          inheritedFit: preset.plateFitMode ?? frame.fitMode,
                          onChange: updatePlateOverride,
                        }
                  }
                  activeIndex={maskIndex}
                  canEditMask={canEditMask}
                  editingMask={editingMask}
                  onSelectMaskWindow={selectMaskWindow}
                  onMaskEditingChange={(editing) => {
                    if (editing) setAttachmentEditing(false);
                    setMaskEditFrameId(editing ? frame.id : undefined);
                  }}
                  onChange={(patch) => updateFrame((candidate) => ({ ...candidate, ...patch }))}
                />
                <LiveLayoutEditorFrameAttachments
                  attachments={frameAttachments}
                  legacyIds={preset?.frameAttachments?.map(({ id }) => id)}
                  selectedId={activeAttachment?.id}
                  selectedMask={maskWindows[maskIndex]}
                  importing={readingAttachment}
                  canEdit={frameShown}
                  editing={editingAttachment}
                  onImport={importAttachment}
                  onSelect={setAttachmentId}
                  onReorder={reorderAttachment}
                  onRemove={(id) => {
                    if (id === attachmentId) setAttachmentEditing(false);
                    changeAttachments(id, (current) =>
                      current.filter((attachment) => attachment.id !== id),
                    );
                  }}
                  onEditChange={(editing) => {
                    if (editing) {
                      setMaskEditFrameId(undefined);
                      setAttachmentId(activeAttachment?.id);
                    }
                    setAttachmentEditing(editing);
                  }}
                  onRectChange={placeAttachment}
                />
              </div>
            )}
          </aside>
        </div>
      </fieldset>
    </Modal>
  );
}
