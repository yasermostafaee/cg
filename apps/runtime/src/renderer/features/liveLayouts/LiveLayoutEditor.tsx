import { useFeedbackText, useUiText } from '../../i18n/locale.js';
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
  SquareDashed,
  RotateCcw,
  Trash2,
  Video,
} from 'lucide-react';
import {
  CONTROL_LIVE_LAYOUT_FOCUS_ALIAS_MAX_LENGTH,
  CONTROL_LIVE_LAYOUT_MAX_FRAMES,
  DEFAULT_LIVE_CROP_FOCUS,
  ControlLiveLayoutSchema,
  LiveRevealRectSchema,
  controlLiveLayoutAttachments,
  controlLiveLayoutBorderHidden,
  controlLiveLayoutFontFamily,
  controlLiveLayoutFocusRect,
  controlLiveLayoutFrameAttachments,
  controlLiveLayoutIsFrameInPreset,
  controlLiveLayoutMovePresetFrame,
  controlLiveLayoutPlateCropFocus,
  controlLiveLayoutPlateFit,
  controlLiveLayoutPresetFrameIds,
  controlLiveLayoutRects,
  controlLiveLayoutWithOverlays,
  sameLiveMaskRect,
  type ControlLiveLayout,
  type ControlLiveLayoutBackground,
  type ControlLiveLayoutArrangement,
  type ControlLiveLayoutFrame,
  type ControlLiveLayoutFrameAttachment,
  type ControlLiveLayoutPlateOverride,
  type ControlLiveLayoutPreset,
  type ControlLiveLayoutTitleStyle,
  type LiveCropFocus,
  type LiveRevealRect,
  type LiveSourceRect,
  type Resolution,
} from '@cg/shared-schema';
import { Button } from '../../ui/Button.js';
import { Checkbox } from '../../ui/Checkbox.js';
import { ColorInput } from '../../ui/ColorInput.js';
import { FileInput } from '../../ui/FileInput.js';
import { Icon } from '../../ui/Icon.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { useModalForeground } from '../../ui/modalForeground.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { SelectInput } from '../../ui/SelectInput.js';
import { TabPanel, TabStrip } from '../../ui/Tabs.js';
import { TextInput } from '../../ui/TextInput.js';
import { uuid } from '../../lib/uuid.js';
import { liveLayoutArtwork } from '../../theme.js';
import {
  CONTROL_LIVE_LAYOUT_BACKGROUND_ACCEPT,
  readControlLiveLayoutBackgroundFile,
  readControlLiveLayoutFallbackFile,
  readControlLiveLayoutFontFile,
} from './controlLiveLayoutCompiler.js';
import { usePvwSourceFrames } from '../monitors/usePvwSourceFrames.js';
import { FittedSafeAreaGuides } from '../monitors/SafeAreaGuides.js';
import { SafeGuideSettings } from '../monitors/SafeGuideSettings.js';
import { useSafeGuidePreferences } from '../monitors/useSafeGuidePreferences.js';
import { InputAudioMeter } from '../sources/InputAudioMeter.js';
import { labelledSource, SourceLabel } from '../sources/SourceLabel.js';
import { sourcePresenceDescription } from '../sources/SourcePresenceBadges.js';
import { useSourcePresence } from '../../hooks/useSourcePresence.js';
import { SourcePicker } from '../sources/SourcePicker.js';
import { LiveLayoutAssetThumbnail, useLiveLayoutAssetUrl } from './LiveLayoutAssetThumbnail.js';
import { LiveLayoutEditorArrange } from './LiveLayoutEditorArrange.js';
import { LiveLayoutEditorEffects } from './LiveLayoutEditorEffects.js';
import { LiveLayoutEditorFrameAttachments } from './LiveLayoutEditorFrameAttachments.js';
import { LiveLayoutEditorFrameOptions } from './LiveLayoutEditorFrameOptions.js';
import { LiveLayoutEditorNumber } from './LiveLayoutEditorNumber.js';
import {
  promoteFrameAttachments,
  readControlLiveLayoutFrameAttachment,
  type ControlLiveLayoutFrameAttachmentSource,
} from './controlLiveLayoutFrameAttachments.js';
import { LiveLayoutEditorRectOverlay } from './LiveLayoutEditorRectOverlay.js';
import { LiveLayoutEditorPreview } from './LiveLayoutEditorPreview.js';
import { LiveLayoutGeometryThumbnail } from './LiveLayoutGeometryThumbnail.js';
import { LiveLayoutEditorTexts } from './LiveLayoutEditorTexts.js';
import { LiveLayoutEditorTitleStyle } from './LiveLayoutEditorTitleStyle.js';
import './live-layout-editor.css';

interface LiveLayoutEditorProps {
  channel: number;
  initial: ControlLiveLayout;
  initialBackground?: Blob | undefined;
  initialFonts?: ReadonlyMap<string, Blob> | undefined;
  initialAttachments?: ReadonlyMap<string, ControlLiveLayoutFrameAttachmentSource> | undefined;
  initialFallbackFiles?: ReadonlyMap<string, Blob> | undefined;
  mode: 'create' | 'edit' | 'duplicate';
  onSave: (
    layout: ControlLiveLayout,
    background: Blob | undefined,
    fonts: ReadonlyMap<string, Blob>,
    attachments: ReadonlyMap<string, ControlLiveLayoutFrameAttachmentSource>,
    fallbackFiles: ReadonlyMap<string, Blob>,
  ) => Promise<void>;
  onClose: () => void;
}

const titles: Record<LiveLayoutEditorProps['mode'], string> = {
  create: 'New live layout',
  edit: 'Edit live layout',
  duplicate: 'Duplicate live layout',
};

const settingsTabs = [
  { id: 'plate', label: 'Plate' },
  { id: 'preset', label: 'Preset' },
  { id: 'layout', label: 'Layout' },
];

function nextPresetName(presets: readonly ControlLiveLayoutPreset[], namePattern: string): string {
  const names = new Set(presets.map(({ name }) => name));
  const nameAt = (number: number): string => namePattern.replace('{number}', String(number));
  let number = presets.length + 1;
  while (names.has(nameAt(number))) number += 1;
  return nameAt(number);
}

function setVisibility(
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

function normalizePlacement(rect: LiveSourceRect, resolution: Resolution): LiveRevealRect {
  const x = rect.x / resolution.width;
  const y = rect.y / resolution.height;
  return {
    x,
    y,
    width: Math.min(1 - x, rect.width / resolution.width),
    height: Math.min(1 - y, rect.height / resolution.height),
  };
}

const DEFAULT_OVERLAY_RECT = { x: 0.6, y: 0.05, width: 0.35, height: 0.35 };

function relativeOverlayRect(
  upper: LiveSourceRect | undefined,
  base: LiveSourceRect | undefined,
): LiveRevealRect {
  if (upper === undefined || base === undefined) return DEFAULT_OVERLAY_RECT;
  const x = upper.x - base.x;
  const y = upper.y - base.y;
  const tolerance = 0.001;
  if (
    x < -tolerance ||
    y < -tolerance ||
    x + upper.width > base.width + tolerance ||
    y + upper.height > base.height + tolerance
  )
    return DEFAULT_OVERLAY_RECT;
  return normalizePlacement({ ...upper, x: Math.max(0, x), y: Math.max(0, y) }, base);
}

function forgetPlacement(
  preset: ControlLiveLayoutPreset,
  plateId: string,
): Pick<ControlLiveLayoutPreset, 'customRects'> {
  if (preset.customRects === undefined || !Object.hasOwn(preset.customRects, plateId)) return {};
  const { [plateId]: _removed, ...remaining } = preset.customRects;
  return { customRects: Object.keys(remaining).length === 0 ? undefined : remaining };
}

function arrangeMembership(
  preset: ControlLiveLayoutPreset,
  frameIds: string[],
  resolution: Resolution,
): ControlLiveLayoutPreset {
  const next = {
    ...preset,
    frameIds,
    arrangement: arrangementForCount(preset.arrangement, frameIds.length),
  };
  if (next.arrangement !== 'custom') return next;
  const placements = Object.fromEntries(
    Object.entries(controlLiveLayoutRects({ resolution }, next)).map(([id, rect]) => [
      id,
      normalizePlacement(rect, resolution),
    ]),
  );
  return { ...next, customRects: { ...placements, ...next.customRects } };
}

export function LiveLayoutEditor({
  channel,
  initial,
  initialBackground,
  initialFonts,
  initialAttachments,
  initialFallbackFiles,
  mode,
  onSave,
  onClose,
}: LiveLayoutEditorProps): JSX.Element | null {
  const localizeUi = useUiText();
  const localizeFeedback = useFeedbackText();
  const [layout, setLayout] = useState<ControlLiveLayout>(() =>
    mode === 'create' ? { ...initial, frames: [], presets: [], defaultPresetId: '' } : initial,
  );
  const [settingsScope, setSettingsScope] = useState('plate');
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
  const [fallbackFiles, setFallbackFiles] = useState<ReadonlyMap<string, Blob>>(
    () => initialFallbackFiles ?? new Map(),
  );
  const [presetId, setPresetId] = useState<string | undefined>(layout.defaultPresetId || undefined);
  const [frameId, setFrameId] = useState(() => {
    const startingPreset = layout.presets.find(({ id }) => id === layout.defaultPresetId);
    return startingPreset === undefined
      ? layout.frames[0]?.id
      : controlLiveLayoutPresetFrameIds(startingPreset)[0];
  });
  const [focusId, setFocusId] = useState<string>();
  const [placementEditing, setPlacementEditing] = useState(
    () => layout.presets.find(({ id }) => id === layout.defaultPresetId)?.arrangement === 'custom',
  );
  const [showPreviewMeters, setShowPreviewMeters] = useState(false);
  const {
    profile: safeGuideProfile,
    setProfile: setSafeGuideProfile,
    resetProfile: resetSafeGuideProfile,
    visible: showSafeGuides,
    setVisible: setShowSafeGuides,
  } = useSafeGuidePreferences();
  const emptyPreview = useRef<HTMLDivElement>(null);
  const [maskSelection, setMaskSelection] = useState<{ frameId: string; index: number }>();
  const [maskEditFrameId, setMaskEditFrameId] = useState<string>();
  const [cropEditFrameId, setCropEditFrameId] = useState<string>();
  const [attachmentId, setAttachmentId] = useState<string>();
  const [attachmentEditing, setAttachmentEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readingMedia, setReadingMedia] = useState(false);
  const [readingFont, setReadingFont] = useState(false);
  const [readingAttachment, setReadingAttachment] = useState(false);
  const [readingFallback, setReadingFallback] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const saveInFlight = useRef(false);
  const mediaRead = useRef(0);
  const fontRead = useRef(0);
  const attachmentRead = useRef(0);
  const fallbackRead = useRef<{ id: string }>();
  const mediaPick = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const presetName = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const focusOrigin = useRef<string>();
  const fieldsId = useId();
  const assetUrl = useLiveLayoutAssetUrl(asset);
  const backgroundMedia =
    layout.background.kind === 'image' || layout.background.kind === 'video'
      ? layout.background
      : undefined;
  const frameSources = layout.frames.flatMap(({ sourceId }) =>
    sourceId === undefined ? [] : [sourceId],
  );
  const foreground = useModalForeground(preview);
  const sourceFrames = usePvwSourceFrames(
    channel,
    frameSources,
    foreground,
    'editor',
    true,
    frameSources,
  );
  const sourcePresence = useSourcePresence(channel, frameSources);

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
      fallbackRead.current = undefined;
    },
    [],
  );

  const preset = layout.presets.find(({ id }) => id === presetId) ?? layout.presets[0];
  const frame = layout.frames.find(({ id }) => id === frameId) ?? layout.frames[0];
  const frameNumber = frame === undefined ? 0 : layout.frames.indexOf(frame) + 1;
  const overlay = frame?.overlay;
  const presetFrameIds = preset === undefined ? [] : controlLiveLayoutPresetFrameIds(preset);
  const framePosition = frame === undefined ? -1 : presetFrameIds.indexOf(frame.id);
  const geometry: ReturnType<typeof controlLiveLayoutRects> =
    preset === undefined ? {} : controlLiveLayoutRects(layout, preset);
  const paintedGeometry = controlLiveLayoutWithOverlays(layout, geometry);
  const hasOverlays =
    frame !== undefined && layout.frames.some(({ overlay }) => overlay?.frameId === frame.id);
  const baseOptions = layout.frames.filter(
    (candidate) => candidate.id !== frame?.id && candidate.overlay === undefined,
  );
  const soleGridFrame =
    frame !== undefined &&
    layout.presets.some(
      (candidate) => candidate.frameIds.length === 1 && candidate.frameIds[0] === frame.id,
    );
  const selectedPlateRect = frame === undefined ? undefined : geometry[frame.id];
  const customPlacement = preset?.arrangement === 'custom';
  const editingPlacement = customPlacement && placementEditing && focusId === undefined && !busy;
  const positionedFrames = presetFrameIds.flatMap((id) => {
    const rect = geometry[id];
    const index = layout.frames.findIndex((candidate) => candidate.id === id);
    return rect === undefined || index < 0
      ? []
      : [
          {
            id,
            label: localizeUi('plate {number}', { number: index + 1 }),
            rect: normalizePlacement(rect, layout.resolution),
          },
        ];
  });
  const frameShown =
    frame !== undefined &&
    (focusId === undefined ? paintedGeometry[frame.id] !== undefined : focusId === frame.id);
  const frameAttachments =
    frame === undefined ? [] : controlLiveLayoutFrameAttachments(layout, preset, frame.id);
  function canCropPlate(candidate: ControlLiveLayoutFrame): boolean {
    return (
      preset !== undefined &&
      controlLiveLayoutIsFrameInPreset(candidate, preset) &&
      controlLiveLayoutPlateFit(preset, candidate) === 'cover' &&
      candidate.liveMask === undefined &&
      !controlLiveLayoutFrameAttachments(layout, preset, candidate.id).some(
        ({ sourceId }) => attachmentAssets.get(sourceId)?.plate !== undefined,
      )
    );
  }

  const canEditPresetCrop = layout.frames.some(canCropPlate);
  const plateCrop =
    preset !== undefined && frame !== undefined && canCropPlate(frame)
      ? (controlLiveLayoutPlateCropFocus(preset, frame.id) ?? DEFAULT_LIVE_CROP_FOCUS)
      : undefined;
  const editingCrop =
    plateCrop !== undefined && frame?.id === cropEditFrameId && focusId === undefined && !busy;
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
        Object.keys(controlLiveLayoutRects(layout, candidate)).length ===
          candidate.frameIds.length &&
        controlLiveLayoutFocusRect(layout, candidate) !== undefined,
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
    if (changes.arrangement !== undefined || !('focusMargins' in changes)) setFocusId(undefined);
    if (changes.arrangement !== undefined && changes.arrangement !== 'custom')
      setPlacementEditing(false);
    updatePreset(changes);
  }

  function setEditingPlacement(editing: boolean): void {
    if (editing) {
      setFocusId(undefined);
      setCropEditFrameId(undefined);
      setMaskEditFrameId(undefined);
      setAttachmentEditing(false);
      if (!presetFrameIds.includes(frame?.id ?? '')) setFrameId(presetFrameIds[0]);
    }
    setPlacementEditing(editing);
  }

  function chooseCustomPlacement(): void {
    if (preset === undefined) return;
    setEditingPlacement(true);
    if (customPlacement) return;
    const customRects = {
      ...Object.fromEntries(positionedFrames.map(({ id, rect }) => [id, rect])),
      ...preset.customRects,
    };
    updatePreset({ arrangement: 'custom', customRects });
  }

  function placeFrame(id: string, rect: LiveRevealRect): void {
    if (!LiveRevealRectSchema.safeParse(rect).success) return;
    setLayout((current) => ({
      ...current,
      presets: current.presets.map((candidate) => {
        if (
          candidate.id !== preset?.id ||
          candidate.arrangement !== 'custom' ||
          !candidate.frameIds.includes(id)
        )
          return candidate;
        const previous = candidate.customRects?.[id];
        return previous !== undefined && sameLiveMaskRect(previous, rect)
          ? candidate
          : { ...candidate, customRects: { ...candidate.customRects, [id]: rect } };
      }),
    }));
  }

  function updatePlateOverride(patch: ControlLiveLayoutPlateOverride): void {
    if (
      preset === undefined ||
      frame === undefined ||
      !controlLiveLayoutIsFrameInPreset(frame, preset)
    )
      return;
    const selection = { ...preset.plateOverrides?.[frame.id], ...patch };
    const changes =
      selection.aspectRatio === undefined &&
      selection.fitMode === undefined &&
      selection.cropFocus === undefined
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

  function setCropEditing(editing: boolean): void {
    if (editing) {
      setPlacementEditing(false);
      setMaskEditFrameId(undefined);
      setAttachmentEditing(false);
      setFocusId(undefined);
    }
    setCropEditFrameId(editing ? frame?.id : undefined);
  }

  function updatePlateCrop(cropFocus: LiveCropFocus | undefined): void {
    setFocusId(undefined);
    updatePlateOverride({ cropFocus });
  }

  function updateDefaultCrop(plateCropFocus: LiveCropFocus | undefined): void {
    setFocusId(undefined);
    updatePreset({ plateCropFocus });
  }

  function choosePreset(next: ControlLiveLayoutPreset): void {
    setCropEditFrameId(undefined);
    setFocusId(undefined);
    setPlacementEditing(next.arrangement === 'custom');
    setAttachmentEditing(false);
    setPresetId(next.id);
    if (frame === undefined || !controlLiveLayoutIsFrameInPreset(frame, next))
      setFrameId(controlLiveLayoutPresetFrameIds(next)[0]);
  }

  function appendPreset(): void {
    const next: ControlLiveLayoutPreset = {
      ...(preset ?? {
        frameIds: layout.frames.flatMap(({ id, overlay }) => (overlay === undefined ? [id] : [])),
        arrangement: 'side-by-side',
        horizontalGap: initial.presets[0]?.horizontalGap ?? 0,
        verticalGap: initial.presets[0]?.verticalGap ?? 0,
        reverse: false,
        hiddenTitles: [],
        hiddenFocusTitles: [],
      }),
      id: `preset-${uuid()}`,
      name: nextPresetName(layout.presets, localizeUi('Preset {number}')),
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
      setCropEditFrameId(undefined);
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
    setCropEditFrameId(undefined);
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
        return arrangeMembership(candidate, [...candidate.frameIds, id], current.resolution);
      }),
    }));
    requestAnimationFrame(() => titleInput.current?.focus());
  }

  function deleteFrame(): void {
    if (frame === undefined || hasOverlays || (mode !== 'create' && layout.frames.length <= 1))
      return;
    const frames = layout.frames.filter(({ id }) => id !== frame.id);
    const next = frames[Math.min(layout.frames.indexOf(frame), frames.length - 1)];
    const nextGridFrame =
      next?.overlay === undefined ? next : frames.find(({ overlay }) => overlay === undefined);
    if (fallbackRead.current?.id === frame.id) {
      fallbackRead.current = undefined;
      setReadingFallback(false);
    }
    removeFallbackFile(frame.id);
    setCropEditFrameId(undefined);
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
          remaining.length === 0 && nextGridFrame !== undefined && mode !== 'create'
            ? [nextGridFrame.id]
            : remaining;
        return {
          ...arrangeMembership(
            { ...candidate, ...forgetPlacement(candidate, frame.id) },
            frameIds,
            current.resolution,
          ),
          ...omitPlateOverride(candidate, frame.id),
          hiddenTitles: candidate.hiddenTitles.filter((id) => id !== frame.id),
          hiddenFocusTitles: candidate.hiddenFocusTitles.filter((id) => id !== frame.id),
          ...(candidate.hiddenBorders !== undefined && {
            hiddenBorders: candidate.hiddenBorders.filter((id) => id !== frame.id),
          }),
          ...(candidate.hiddenFocusBorders !== undefined && {
            hiddenFocusBorders: candidate.hiddenFocusBorders.filter((id) => id !== frame.id),
          }),
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
    if (!included && cropEditFrameId === id) setCropEditFrameId(undefined);
    const frameIds = included
      ? [...preset.frameIds, id]
      : preset.frameIds.filter((value) => value !== id);
    const leaving = new Set([
      id,
      ...layout.frames.flatMap((frame) => (frame.overlay?.frameId === id ? [frame.id] : [])),
    ]);
    const overrides = Object.fromEntries(
      Object.entries(preset.plateOverrides ?? {}).filter(([id]) => !leaving.has(id)),
    );
    rebuildArrangement({
      ...arrangeMembership(preset, frameIds, layout.resolution),
      ...(!included && {
        plateOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      }),
      ...(!included &&
        preset.frameAttachments !== undefined && {
          frameAttachments: preset.frameAttachments.filter(({ frameId }) => !leaving.has(frameId)),
        }),
    });
  }

  function setOverlayBase(baseId: string): void {
    if (frame === undefined) return;
    const priorBase = frame.overlay?.frameId;
    if (baseId === '' && priorBase === undefined) return;
    if (
      baseId !== '' &&
      (hasOverlays || soleGridFrame || !baseOptions.some(({ id }) => id === baseId))
    )
      return;
    const rect = relativeOverlayRect(paintedGeometry[frame.id], geometry[baseId]);
    setLayout((current) => ({
      ...current,
      frames: current.frames.map((candidate) =>
        candidate.id === frame.id
          ? { ...candidate, overlay: baseId === '' ? undefined : { frameId: baseId, rect } }
          : candidate,
      ),
      presets: current.presets.map((candidate) => {
        if (baseId === '') {
          if (priorBase === undefined || !candidate.frameIds.includes(priorBase)) return candidate;
          const positions = controlLiveLayoutWithOverlays(
            current,
            controlLiveLayoutRects(current, candidate),
          );
          const frameIds = [...candidate.frameIds, frame.id];
          const customRects = Object.fromEntries(
            frameIds.flatMap((id) => {
              const position = positions[id];
              return position === undefined
                ? []
                : [[id, normalizePlacement(position, current.resolution)]];
            }),
          );
          return Object.keys(customRects).length === frameIds.length
            ? { ...candidate, frameIds, arrangement: 'custom', customRects }
            : arrangeMembership(candidate, frameIds, current.resolution);
        }
        const next = candidate.frameIds.includes(frame.id)
          ? arrangeMembership(
              { ...candidate, ...forgetPlacement(candidate, frame.id) },
              candidate.frameIds.filter((id) => id !== frame.id),
              current.resolution,
            )
          : candidate;
        if (candidate.frameIds.includes(baseId)) return next;
        return {
          ...next,
          ...omitPlateOverride(candidate, frame.id),
          ...(candidate.frameAttachments !== undefined && {
            frameAttachments: candidate.frameAttachments.filter(
              ({ frameId }) => frameId !== frame.id,
            ),
          }),
        };
      }),
    }));
    setFocusId(undefined);
    setPlacementEditing(false);
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
      if (source.plate !== undefined) setCropEditFrameId(undefined);
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
    setCropEditFrameId(undefined);
    setPlacementEditing(false);
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

  function removeFallbackFile(id: string): void {
    setFallbackFiles((current) => {
      if (!current.has(id)) return current;
      const remaining = new Map(current);
      remaining.delete(id);
      return remaining;
    });
  }

  async function pickFallback(file: File): Promise<void> {
    if (frame === undefined) return;
    const id = frame.id;
    const request = { id };
    fallbackRead.current = request;
    setReadingFallback(true);
    setRefusal(undefined);
    try {
      const fallback = await readControlLiveLayoutFallbackFile(file);
      if (fallbackRead.current !== request) return;
      setFallbackFiles((current) => new Map(current).set(id, file));
      updateFrame((candidate) => ({ ...candidate, fallback }));
    } catch (cause) {
      if (fallbackRead.current === request) {
        setRefusal(
          cause instanceof Error ? cause.message : 'The fallback image could not be read.',
        );
      }
    } finally {
      if (fallbackRead.current === request) {
        fallbackRead.current = undefined;
        setReadingFallback(false);
      }
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
    if (
      !canSave ||
      saveInFlight.current ||
      readingMedia ||
      readingFont ||
      readingAttachment ||
      readingFallback
    )
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
      await onSave(draft.data, asset, fontAssets, attachmentAssets, fallbackFiles);
    } catch (cause) {
      setRefusal(cause instanceof Error ? cause.message : 'The layout could not be saved.');
    } finally {
      saveInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title={localizeUi(titles[mode])}
      subtitle={localizeUi('Channel {channel}', { channel })}
      emblem={LayoutGrid}
      size="library"
      onClose={onClose}
      busy={busy}
      {...(refusal === undefined
        ? {}
        : { message: { role: 'refusal' as const, text: localizeFeedback(refusal) } })}
      footer={
        <>
          <ModalAction actionRole="cancel" onClick={onClose} disabled={busy}>
            {localizeUi('Cancel')}
          </ModalAction>
          <ModalAction
            actionRole="primary"
            onClick={() => void save()}
            disabled={
              !canSave ||
              busy ||
              readingMedia ||
              readingFont ||
              readingAttachment ||
              readingFallback
            }
          >
            <Icon icon={Check} size={15} /> {localizeUi(busy ? 'Saving…' : 'Save layout')}
          </ModalAction>
        </>
      }
    >
      <fieldset
        className="cg-form cg-live-layout-editor"
        disabled={busy}
        aria-label={localizeUi('Live layout editor')}
      >
        <aside className="cg-live-layout-presets" aria-label={localizeUi('Layout presets')}>
          <div className="cg-live-layout-panel-head">
            <h3>
              <Icon icon={Layers3} size={16} /> {localizeUi('Presets')}
            </h3>
          </div>
          <div
            className="cg-live-layout-preset-buttons"
            role="group"
            aria-label={localizeUi('Presets')}
          >
            {layout.presets.map((candidate, index) => {
              const name =
                candidate.name.trim() || localizeUi('Preset {number}', { number: index + 1 });
              return (
                <Button
                  key={candidate.id}
                  className="cg-live-layout-preset-choice"
                  aria-label={name}
                  title={name}
                  aria-pressed={candidate.id === preset?.id}
                  data-layout-preset={candidate.id}
                  onClick={() => choosePreset(candidate)}
                >
                  <LiveLayoutGeometryThumbnail
                    layout={layout}
                    preset={candidate}
                    className="cg-live-layout-preset-thumbnail"
                  />
                  <span className="cg-live-layout-preset-caption">
                    <IsolatedName alignWithInterface>{name}</IsolatedName>
                    {candidate.id === layout.defaultPresetId && (
                      <span
                        className="cg-live-layout-preset-start"
                        title={localizeUi('Starting preset')}
                      >
                        <Icon icon={Flag} size={13} />
                      </span>
                    )}
                  </span>
                </Button>
              );
            })}
          </div>
          <Button variant="neutral" className="cg-live-layout-add-preset" onClick={appendPreset}>
            <Icon icon={Plus} size={15} /> {localizeUi('Add preset')}
          </Button>
        </aside>

        <section
          ref={preview}
          className="cg-live-layout-preview"
          aria-label={localizeUi('Layout preview')}
        >
          <div className="cg-live-layout-preview-names">
            <label className="cg-live-layout-name" htmlFor={`${fieldsId}-layout-name`}>
              {localizeUi('Layout name')}
              <TextInput
                id={`${fieldsId}-layout-name`}
                value={layout.name}
                onChange={(name) => setLayout((current) => ({ ...current, name }))}
                dir="auto"
                maxLength={120}
              />
            </label>
            <div className="cg-form-field cg-live-layout-preset-name">
              <label htmlFor={`${fieldsId}-preset-name`}>{localizeUi('Preset name')}</label>
              <TextInput
                id={`${fieldsId}-preset-name`}
                ref={presetName}
                value={preset?.name ?? ''}
                disabled={preset === undefined}
                dir="auto"
                maxLength={80}
                onChange={(name) => updatePreset({ name })}
              />
            </div>
          </div>
          <div className="cg-live-layout-panel-head">
            <h3>
              <Icon icon={Monitor} size={16} /> {localizeUi('Preview · PVW')}
            </h3>
            <div className="cg-live-layout-preview-actions">
              <div
                className="cg-live-layout-safe-guides"
                role="group"
                aria-label={localizeUi('Layout safe guides')}
              >
                <Button
                  variant="icon"
                  className="cg-live-layout-preview-toggle"
                  aria-label={localizeUi('Safe areas')}
                  aria-pressed={showSafeGuides}
                  title={localizeUi(showSafeGuides ? 'Hide safe guides' : 'Show safe guides')}
                  onClick={() => setShowSafeGuides(!showSafeGuides)}
                >
                  <Icon icon={SquareDashed} size={15} />
                </Button>
                <SafeGuideSettings
                  profile={safeGuideProfile}
                  onChange={setSafeGuideProfile}
                  onReset={resetSafeGuideProfile}
                />
              </div>
              {focusId !== undefined && preset !== undefined && (
                <Button ref={returnButton} variant="neutral" onClick={returnToPreset}>
                  <Icon icon={RotateCcw} size={15} /> {localizeUi('Return to')}{' '}
                  <IsolatedName alignWithInterface>
                    {preset.name || localizeUi('preset')}
                  </IsolatedName>
                </Button>
              )}
              <Button
                variant="icon"
                className="cg-live-layout-preview-toggle"
                aria-label={localizeUi('VU meters')}
                aria-pressed={showPreviewMeters}
                title={localizeUi(
                  showPreviewMeters ? 'Hide preview VU meters' : 'Show preview VU meters',
                )}
                onClick={() => setShowPreviewMeters((visible) => !visible)}
              >
                <Icon icon={AudioLines} size={15} />
              </Button>
            </div>
          </div>
          {preset !== undefined && frame !== undefined && presetFrameIds.length > 0 ? (
            <LiveLayoutEditorPreview
              channel={channel}
              layout={layout}
              preset={preset}
              geometry={paintedGeometry}
              selectedFrameId={frame.id}
              focused={focusId}
              backgroundUrl={assetUrl}
              fallbackFiles={fallbackFiles}
              sourceFrames={sourceFrames}
              showMeters={showPreviewMeters}
              guideProfile={showSafeGuides ? safeGuideProfile : undefined}
              attachmentSources={attachmentAssets}
              onFocus={focusFrame}
              stagePlacementEditor={
                editingPlacement ? (
                  <LiveLayoutEditorRectOverlay
                    key={'placement:' + preset.id}
                    kind="plate"
                    rects={positionedFrames.map(({ rect }) => rect)}
                    labels={positionedFrames.map(({ label }) => label)}
                    selectedIndex={positionedFrames.findIndex(({ id }) => id === frame.id)}
                    onSelect={(index) => setFrameId(positionedFrames[index]?.id)}
                    onChange={(index, rect) => {
                      const placement = positionedFrames[index];
                      if (placement !== undefined) placeFrame(placement.id, rect);
                    }}
                  />
                ) : undefined
              }
              cropEditor={
                editingCrop && plateCrop !== undefined
                  ? { frameId: frame.id, focus: plateCrop, onChange: updatePlateCrop }
                  : undefined
              }
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
              ref={emptyPreview}
              className="cg-live-layout-stage cg-live-layout-empty-preview"
              data-layout-preview=""
              data-transparent-background={layout.background.kind === 'none' ? '' : undefined}
              style={{ aspectRatio: layout.resolution.width / layout.resolution.height }}
            >
              {layout.frames.length === 0
                ? localizeUi('Add a plate to begin.')
                : preset === undefined
                  ? localizeUi('Add a preset to preview these plates.')
                  : localizeUi('Choose plates for this preset.')}
              {showSafeGuides && (
                <FittedSafeAreaGuides
                  width={layout.resolution.width}
                  height={layout.resolution.height}
                  stage={emptyPreview}
                  profile={safeGuideProfile}
                />
              )}
            </div>
          )}
          <div className="cg-live-layout-preview-controls">
            {preset !== undefined && (
              <LiveLayoutEditorArrange
                layout={layout}
                preset={preset}
                onChange={rebuildArrangement}
                onFitChange={(plateFitMode) => updatePreset({ plateFitMode })}
                canEditCrop={canEditPresetCrop}
                onCropChange={updateDefaultCrop}
                editingPlacement={editingPlacement}
                onEditingPlacementChange={setEditingPlacement}
                onCustom={chooseCustomPlacement}
                selectedPlate={
                  frame !== undefined && selectedPlateRect !== undefined
                    ? {
                        id: frame.id,
                        rect: selectedPlateRect,
                        onChange: (rect) =>
                          placeFrame(frame.id, normalizePlacement(rect, layout.resolution)),
                      }
                    : undefined
                }
              />
            )}
          </div>
        </section>

        <aside className="cg-live-layout-settings" aria-label={localizeUi('Layout settings panel')}>
          <TabStrip
            tabs={settingsTabs.map(({ id, label }) => ({ id, label: localizeUi(label) }))}
            activeId={settingsScope}
            ariaLabel={localizeUi('Layout settings')}
            idPrefix={fieldsId}
            onSelect={setSettingsScope}
            keyboardNavigation
          />
          <div className="cg-live-layout-settings-panel" hidden={settingsScope !== 'preset'}>
            <TabPanel activeId="preset" idPrefix={fieldsId}>
              <div className="cg-live-layout-scope">
                <div className="cg-live-layout-panel-head">
                  <h3>{localizeUi('Preset settings')}</h3>
                </div>
                <div className="cg-form-toolbar">
                  <Button
                    variant="neutral"
                    aria-pressed={preset?.id === layout.defaultPresetId}
                    disabled={preset === undefined || preset.id === layout.defaultPresetId}
                    onClick={() => {
                      if (preset !== undefined)
                        setLayout((current) => ({ ...current, defaultPresetId: preset.id }));
                    }}
                  >
                    <Icon icon={Flag} size={13} /> {localizeUi('Start with this preset')}
                  </Button>
                  <Button
                    className="cg-live-layout-delete"
                    variant="danger"
                    disabled={
                      preset === undefined || (mode !== 'create' && layout.presets.length <= 1)
                    }
                    onClick={deletePreset}
                  >
                    <Icon icon={Trash2} size={15} /> {localizeUi('Delete preset')}
                  </Button>
                </div>
              </div>
            </TabPanel>
          </div>
          <div className="cg-live-layout-settings-panel" hidden={settingsScope !== 'layout'}>
            <TabPanel activeId="layout" idPrefix={fieldsId}>
              <div className="cg-live-layout-scope">
                <div className="cg-live-layout-panel-head">
                  <h3>{localizeUi('Layout settings')}</h3>
                </div>
                <div
                  className="cg-live-layout-background"
                  role="group"
                  aria-label={localizeUi('Background')}
                >
                  <span>{localizeUi('Background')}</span>
                  <Button
                    variant="neutral"
                    aria-pressed={layout.background.kind === 'none'}
                    onClick={() => setNonMediaBackground({ kind: 'none' })}
                  >
                    {localizeUi('None')}
                  </Button>
                  <span className="cg-live-layout-solid-color">
                    <Button
                      variant="neutral"
                      aria-pressed={layout.background.kind === 'color'}
                      onClick={() =>
                        setNonMediaBackground({ kind: 'color', color: lastSolidColor.current })
                      }
                    >
                      {localizeUi('Solid color')}
                    </Button>
                    {layout.background.kind === 'color' && (
                      <ColorInput
                        appearance="swatch"
                        value={layout.background.color.slice(0, 7)}
                        onChange={(color) => setNonMediaBackground({ kind: 'color', color })}
                        aria-label={localizeUi('Background color')}
                      />
                    )}
                  </span>
                  <Button
                    variant="neutral"
                    aria-label={localizeUi('Choose background image or video')}
                    aria-pressed={backgroundMedia !== undefined}
                    title={backgroundMedia?.name}
                    onClick={() => mediaPick.current?.click()}
                  >
                    {backgroundMedia === undefined ? (
                      <Icon icon={ImagePlus} size={15} />
                    ) : (
                      <LiveLayoutAssetThumbnail kind={backgroundMedia.kind} src={assetUrl} />
                    )}
                    {localizeUi(readingMedia ? 'Reading…' : 'Image or video')}
                  </Button>
                  <FileInput
                    hidden
                    ref={mediaPick}
                    aria-label={localizeUi('Background media file')}
                    accept={CONTROL_LIVE_LAYOUT_BACKGROUND_ACCEPT}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = '';
                      if (file !== undefined) void pickBackground(file);
                    }}
                  />
                </div>
              </div>
            </TabPanel>
          </div>
          <div className="cg-live-layout-settings-panel" hidden={settingsScope !== 'plate'}>
            <TabPanel activeId="plate" idPrefix={fieldsId}>
              <section className="cg-live-layout-frames" aria-label={localizeUi('Plates')}>
                <div className="cg-live-layout-panel-head">
                  <h3>
                    <Icon icon={LayoutGrid} size={16} /> {localizeUi('Plates')}
                  </h3>
                  <Button
                    variant="neutral"
                    disabled={layout.frames.length >= CONTROL_LIVE_LAYOUT_MAX_FRAMES}
                    onClick={appendFrame}
                  >
                    <Icon icon={Plus} size={15} /> {localizeUi('Add plate')}
                  </Button>
                </div>
                {frame !== undefined && (
                  <div className="cg-live-layout-frame-list">
                    <div
                      className="cg-live-layout-frame-row cg-live-layout-frame-header"
                      aria-hidden="true"
                    >
                      <span>{localizeUi('Plate')}</span>
                      {preset !== undefined && <span>{localizeUi('In preset')}</span>}
                    </div>
                    {layout.frames.map((candidate, index) => {
                      const name =
                        candidate.title.trim() ||
                        localizeUi('Plate {number}', { number: index + 1 });
                      const position = presetFrameIds.indexOf(candidate.id) + 1;
                      const included =
                        preset !== undefined && controlLiveLayoutIsFrameInPreset(candidate, preset);
                      const baseNumber =
                        layout.frames.findIndex(({ id }) => id === candidate.overlay?.frameId) + 1;
                      const positionNote =
                        baseNumber > 0
                          ? localizeUi('Overlay on {plate}', {
                              plate: localizeUi('Plate {number}', { number: baseNumber }),
                            })
                          : position > 0
                            ? localizeUi('Pos {number}', { number: position })
                            : undefined;
                      const positionId = `${fieldsId}-position-${String(index + 1)}`;
                      const picture = sourceFrames.get(candidate.sourceId ?? '')?.jpegBase64;
                      const source = labelledSource(candidate.sourceId);
                      const presenceDescription = sourcePresenceDescription(
                        sourcePresence,
                        candidate.sourceId,
                        undefined,
                        localizeUi,
                      );
                      const presenceId = `${positionId}-source-presence`;
                      const frameDescription = [
                        positionNote === undefined ? undefined : positionId,
                        presenceDescription === undefined ? undefined : presenceId,
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <div
                          className="cg-live-layout-frame-row"
                          key={candidate.id}
                          data-preset-position={position > 0 ? position : undefined}
                        >
                          <Button
                            className="cg-live-layout-frame-choice"
                            aria-label={localizeUi('Edit plate {number}', { number: index + 1 })}
                            aria-describedby={frameDescription || undefined}
                            active={candidate.id === frame.id}
                            aria-pressed={candidate.id === frame.id}
                            onClick={() => {
                              if (candidate.id !== frame.id) setCropEditFrameId(undefined);
                              setFrameId(candidate.id);
                            }}
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
                              <IsolatedName alignWithInterface>{name}</IsolatedName>
                              <SourceLabel
                                sourceId={candidate.sourceId}
                                fallback={localizeUi('Unassigned')}
                                presence={sourcePresence}
                                presenceAccessible={false}
                              />
                              {presenceDescription !== undefined && (
                                <span id={presenceId} hidden>
                                  {presenceDescription}
                                </span>
                              )}
                            </span>
                            {positionNote !== undefined && (
                              <span
                                className="cg-live-layout-frame-position-marker"
                                id={positionId}
                                title={
                                  baseNumber > 0
                                    ? positionNote
                                    : localizeUi('Position {number} in this preset', {
                                        number: position,
                                      })
                                }
                              >
                                {positionNote}
                              </span>
                            )}
                            <span className="cg-live-layout-selection-mark" aria-hidden="true">
                              <Icon icon={Pencil} size={14} />
                            </span>
                          </Button>
                          {preset !== undefined && (
                            <Checkbox
                              checked={included}
                              disabled={
                                candidate.overlay !== undefined ||
                                (mode !== 'create' && included && preset.frameIds.length <= 1)
                              }
                              onChange={(next) => includeFrame(candidate.id, next)}
                              aria-label={localizeUi('Plate {number} in preset', {
                                number: index + 1,
                              })}
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
                      <h3>{localizeUi('Plate {number}', { number: frameNumber })}</h3>
                      <Button
                        className="cg-live-layout-delete"
                        variant="danger"
                        disabled={hasOverlays || (mode !== 'create' && layout.frames.length <= 1)}
                        title={
                          hasOverlays
                            ? localizeUi('Detach overlay plates before deleting this plate.')
                            : undefined
                        }
                        onClick={deleteFrame}
                      >
                        <Icon icon={Trash2} size={15} /> {localizeUi('Delete plate')}
                      </Button>
                    </div>
                    {(baseOptions.length > 0 || frame.overlay !== undefined) && (
                      <label className="cg-form-field cg-form-field--inline cg-live-layout-frame-field">
                        {localizeUi('Overlay on')}
                        <SelectInput
                          value={frame.overlay?.frameId ?? ''}
                          disabled={hasOverlays || soleGridFrame}
                          title={
                            soleGridFrame
                              ? localizeUi('This plate is the only independent plate in a preset.')
                              : undefined
                          }
                          onChange={(event) => setOverlayBase(event.currentTarget.value)}
                        >
                          <option value="">{localizeUi('None')}</option>
                          {baseOptions.map((candidate) => (
                            <option value={candidate.id} key={candidate.id}>
                              {candidate.title.trim() ||
                                localizeUi('Plate {number}', {
                                  number: layout.frames.indexOf(candidate) + 1,
                                })}
                            </option>
                          ))}
                        </SelectInput>
                      </label>
                    )}
                    {overlay !== undefined && (
                      <fieldset className="cg-live-layout-overlay-position">
                        <legend>{localizeUi('Overlay position (%)')}</legend>
                        {(['x', 'y', 'width', 'height'] as const).map((key) => {
                          const value = overlay.rect[key];
                          const companion = {
                            x: 'width',
                            y: 'height',
                            width: 'x',
                            height: 'y',
                          } as const;
                          const label = {
                            x: 'X',
                            y: 'Y',
                            width: 'Width',
                            height: 'Height',
                          } as const;
                          return (
                            <LiveLayoutEditorNumber
                              key={frame.id + ':' + key}
                              label={
                                key === 'x' || key === 'y' ? label[key] : localizeUi(label[key])
                              }
                              value={Math.round(value * 10_000) / 100}
                              min={key === 'width' || key === 'height' ? 0.01 : 0}
                              max={
                                Math.floor((1 - overlay.rect[companion[key]]) * 10_000 + 1e-8) / 100
                              }
                              decimal
                              onChange={(value) =>
                                updateFrame((candidate) => {
                                  if (candidate.overlay === undefined) return candidate;
                                  const rect = LiveRevealRectSchema.safeParse({
                                    ...candidate.overlay.rect,
                                    [key]: value / 100,
                                  });
                                  return rect.success
                                    ? {
                                        ...candidate,
                                        overlay: { ...candidate.overlay, rect: rect.data },
                                      }
                                    : candidate;
                                })
                              }
                            />
                          );
                        })}
                      </fieldset>
                    )}
                    <div className="cg-form-field cg-form-field--inline cg-live-layout-frame-field">
                      <label htmlFor={`${fieldsId}-input`}>{localizeUi('Input')}</label>
                      <SourcePicker
                        id={`${fieldsId}-input`}
                        aria-label={localizeUi('Plate input')}
                        channel={channel}
                        value={frame.sourceId ?? ''}
                        choices={[{ value: '', label: localizeUi('Unassigned') }]}
                        onChange={(sourceId) =>
                          updateFrame(({ sourceId: _old, ...candidate }) =>
                            sourceId === '' ? candidate : { ...candidate, sourceId },
                          )
                        }
                      />
                    </div>
                    <label
                      className="cg-form-field cg-form-field--inline cg-live-layout-frame-field"
                      htmlFor={`${fieldsId}-title`}
                    >
                      {localizeUi('Title')}
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
                      className="cg-form-field cg-form-field--inline cg-live-layout-frame-field cg-live-layout-focus-label"
                      htmlFor={`${fieldsId}-focus-label`}
                      title={localizeUi('Label on Focus buttons')}
                    >
                      {localizeUi('Focus label')}
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
                      <div className="cg-form-field cg-form-field--inline cg-live-layout-position-picker">
                        <span id={`${fieldsId}-position-label`}>
                          {localizeUi('Position in preset')}
                        </span>
                        <div
                          className="cg-live-layout-frame-position"
                          role="group"
                          aria-labelledby={`${fieldsId}-position-label`}
                        >
                          {presetFrameIds.map((_, index) => (
                            <Button
                              key={index}
                              aria-label={localizeUi('Position {number}', { number: index + 1 })}
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
                        <label
                          className="cg-live-layout-toggle"
                          htmlFor={`${fieldsId}-title-preset`}
                        >
                          <Checkbox
                            id={`${fieldsId}-title-preset`}
                            checked={!preset.hiddenTitles.includes(frame.id)}
                            onChange={(show) =>
                              updatePreset({
                                hiddenTitles: setVisibility(preset.hiddenTitles, frame.id, show),
                              })
                            }
                          />
                          {localizeUi('Show title in preset')}
                        </label>
                        <label
                          className="cg-live-layout-toggle"
                          htmlFor={`${fieldsId}-title-focus`}
                        >
                          <Checkbox
                            id={`${fieldsId}-title-focus`}
                            checked={!preset.hiddenFocusTitles.includes(frame.id)}
                            onChange={(show) =>
                              updatePreset({
                                hiddenFocusTitles: setVisibility(
                                  preset.hiddenFocusTitles,
                                  frame.id,
                                  show,
                                ),
                              })
                            }
                          />
                          {localizeUi('Show title in Focus')}
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
                      fallbackImage={{
                        asset: fallbackFiles.get(frame.id),
                        reading: readingFallback,
                        onPick: (file) => void pickFallback(file),
                      }}
                      presetOverrides={
                        preset === undefined || !controlLiveLayoutIsFrameInPreset(frame, preset)
                          ? undefined
                          : {
                              id: preset.id,
                              value: preset.plateOverrides?.[frame.id],
                              inheritedAspect:
                                preset.plateAspectRatio ??
                                layout.resolution.width / layout.resolution.height,
                              inheritedFit: preset.plateFitMode ?? frame.fitMode,
                              geometryControls:
                                overlay === undefined && !customPlacement && preset.fill !== true,
                              onChange: updatePlateOverride,
                            }
                      }
                      borderVisibility={
                        preset === undefined
                          ? undefined
                          : {
                              showInPreset: !controlLiveLayoutBorderHidden(preset, frame.id, false),
                              showInFocus: !controlLiveLayoutBorderHidden(preset, frame.id, true),
                              belongsToPreset: controlLiveLayoutIsFrameInPreset(frame, preset),
                              onPresetChange: (show) =>
                                updatePreset({
                                  hiddenBorders: setVisibility(
                                    preset.hiddenBorders ?? [],
                                    frame.id,
                                    show,
                                  ),
                                }),
                              onFocusChange: (show) =>
                                updatePreset({
                                  hiddenFocusBorders: setVisibility(
                                    preset.hiddenFocusBorders ?? [],
                                    frame.id,
                                    show,
                                  ),
                                }),
                            }
                      }
                      crop={
                        plateCrop === undefined
                          ? undefined
                          : {
                              value: plateCrop,
                              editing: editingCrop,
                              canEditPreview:
                                geometry[frame.id] !== undefined && frame.sourceId !== undefined,
                              canReset: preset?.plateOverrides?.[frame.id]?.cropFocus !== undefined,
                              onChange: updatePlateCrop,
                              onEditChange: setCropEditing,
                              onReset: () => updatePlateCrop(undefined),
                            }
                      }
                      activeIndex={maskIndex}
                      canEditMask={canEditMask}
                      editingMask={editingMask}
                      onSelectMaskWindow={selectMaskWindow}
                      onMaskEditingChange={(editing) => {
                        if (editing) {
                          setPlacementEditing(false);
                          setAttachmentEditing(false);
                          setCropEditFrameId(undefined);
                        }
                        setMaskEditFrameId(editing ? frame.id : undefined);
                      }}
                      onChange={(patch) => {
                        if (patch.fallback !== undefined && patch.fallback.kind !== 'image')
                          removeFallbackFile(frame.id);
                        if (patch.liveMask !== undefined || patch.fitMode === 'contain')
                          setCropEditFrameId(undefined);
                        updateFrame((candidate) => ({ ...candidate, ...patch }));
                      }}
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
                          setPlacementEditing(false);
                          setMaskEditFrameId(undefined);
                          setCropEditFrameId(undefined);
                          setAttachmentId(activeAttachment?.id);
                        }
                        setAttachmentEditing(editing);
                      }}
                      onRectChange={placeAttachment}
                    />
                  </div>
                )}
                <LiveLayoutEditorEffects
                  effects={layout.effects}
                  onChange={(effects) => setLayout((current) => ({ ...current, effects }))}
                />
              </section>
            </TabPanel>
          </div>
        </aside>
      </fieldset>
    </Modal>
  );
}
