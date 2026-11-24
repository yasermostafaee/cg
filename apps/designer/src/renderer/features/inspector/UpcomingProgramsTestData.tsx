import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Film, Plus, Trash2 } from 'lucide-react';
import type { UpcomingProgramsSampleItem } from '@cg/shared-schema';
import { uuid } from '../../../platform/uuid.js';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { VideoPoster } from '../assets/VideoPoster.js';
import { hiddenUpcomingPosterAssetIds } from '../assets/upcoming-poster-assets.js';
import { captureUpcomingProgramVideoPoster } from '../assets/upcoming-program-video-poster.js';
import { useAssets, useAssetUrl } from '../assets/useAssets.js';
import { ImageChoicePicker } from '../fields/ImageChoicePicker.js';
import { useImageAssetUrls } from '../fields/useImageAssetUrls.js';
import { SelectField, TextField } from './controls.js';

export function UpcomingProgramsTestData({
  items,
  onChange,
  onChooseMedia,
}: {
  items: readonly UpcomingProgramsSampleItem[];
  onChange: (items: UpcomingProgramsSampleItem[]) => void;
  onChooseMedia: (
    itemId: string,
    assetId: string,
    kind: 'image' | 'video',
    posterAssetId?: string,
  ) => void;
}): JSX.Element {
  const [selectedId, selectItem] = useState<string>();
  const [capturing, setCapturing] = useState<{ itemId: string; assetId: string }>();
  const captureRef = useRef<AbortController | null>(null);
  const assets = useAssets();
  const scene = useDesignerSelector((state) => state.scene);
  const imageUrls = useImageAssetUrls();
  const hiddenPosters = useMemo(() => hiddenUpcomingPosterAssetIds(assets, scene), [assets, scene]);
  const mediaAssets = assets.filter(
    (asset) =>
      (asset.kind === 'image' || asset.kind === 'video') && !hiddenPosters.has(asset.assetId),
  );
  const sounds = assets.filter((asset) => asset.kind === 'audio');
  const item = items.find(({ id }) => id === selectedId) ?? items[0];
  const position = item === undefined ? -1 : items.indexOf(item);
  const sound = item?.audioAssetId;
  const missingSound = sound !== undefined && !sounds.some((asset) => asset.assetId === sound);
  const posters = new Map<string, string>();
  for (const asset of assets) {
    if (asset.upcomingPosterFor !== undefined) posters.set(asset.upcomingPosterFor, asset.assetId);
  }
  for (const { mediaAssetId, posterAssetId } of items) {
    if (mediaAssetId !== undefined && posterAssetId !== undefined && !posters.has(mediaAssetId)) {
      posters.set(mediaAssetId, posterAssetId);
    }
  }

  useEffect(() => () => captureRef.current?.abort(), []);

  const update = (patch: Partial<UpcomingProgramsSampleItem>) =>
    items.map((entry) => (entry.id === item?.id ? { ...entry, ...patch } : entry));

  async function chooseMedia(value: string, itemId: string): Promise<void> {
    if (value === '') {
      onChange(update({ mediaAssetId: undefined, mediaKind: undefined, posterAssetId: undefined }));
      return;
    }
    const asset = mediaAssets.find(({ assetId }) => assetId === value);
    if (asset?.kind === 'image') {
      onChooseMedia(itemId, value, 'image');
      return;
    }
    if (asset?.kind !== 'video') return;
    const posterAssetId = posters.get(value);
    if (posterAssetId !== undefined && assets.some(({ assetId }) => assetId === posterAssetId)) {
      onChooseMedia(itemId, value, 'video', posterAssetId);
      return;
    }

    const request = new AbortController();
    const projectId = designerStore.get().scene?.id;
    const current = () => !request.signal.aborted && designerStore.get().scene?.id === projectId;
    captureRef.current = request;
    setCapturing({ itemId, assetId: value });
    let poster: string | undefined;
    try {
      const file = await captureUpcomingProgramVideoPoster(asset, request.signal);
      if (file !== null) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!current()) return;
        const result = await window.cg.assets.storeBytes({
          bytes,
          filename: file.name,
          kind: 'image',
          upcomingPosterFor: value,
        });
        poster = result.asset.assetId;
      }
    } catch {
      if (current())
        designerStore.showNotice('A poster could not be generated for the test video.');
    } finally {
      if (current()) onChooseMedia(itemId, value, 'video', poster);
      if (!request.signal.aborted) setCapturing(undefined);
      if (captureRef.current === request) captureRef.current = null;
    }
  }

  const add = (): void => {
    const id = uuid();
    onChange([...items, { id, title: '' }]);
    selectItem(id);
  };

  const move = (direction: -1 | 1): void => {
    if (item === undefined) return;
    const next = items.filter(({ id }) => id !== item.id);
    next.splice(position + direction, 0, item);
    onChange(next);
    selectItem(item.id);
  };

  return (
    <>
      {item !== undefined && (
        <>
          <SelectField
            label="Test program"
            options={items.map(({ id }) => id)}
            labels={items.map(({ title }, index) => `${String(index + 1)}. ${title || 'Untitled'}`)}
            value={item.id}
            onCommit={selectItem}
          />
          <TextField
            label="Test title"
            value={item.title}
            resetKey={item.id}
            dir="auto"
            onCommit={(title) => {
              if (title !== item.title) onChange(update({ title }));
            }}
          />
          <TextField
            label="Test airtime"
            value={item.airtime ?? ''}
            resetKey={item.id}
            dir="auto"
            onCommit={(airtime) => {
              if (airtime !== (item.airtime ?? ''))
                onChange(update({ airtime: airtime || undefined }));
            }}
          />
          <ImageChoicePicker
            key={item.id}
            label="Test media"
            dialogTitle="Choose test media"
            emptyLabel="No media selected"
            emptyMessage="Add an image or video in Project Assets to choose it here."
            currentLabel="Missing media"
            disabled={capturing !== undefined}
            value={(capturing?.itemId === item.id ? capturing.assetId : item.mediaAssetId) ?? ''}
            choices={mediaAssets.map((asset) => {
              const poster = posters.get(asset.assetId);
              const kind = asset.kind === 'video' ? 'video' : 'image';
              const thumbnailUrl =
                asset.kind === 'image'
                  ? imageUrls[asset.assetId]
                  : poster === undefined
                    ? undefined
                    : imageUrls[poster];
              return {
                value: asset.assetId,
                label: asset.filename,
                kind,
                ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
                ...(kind === 'video' && thumbnailUrl === undefined
                  ? { thumbnail: <ProjectVideoThumbnail assetId={asset.assetId} /> }
                  : {}),
              };
            })}
            onChange={(id) => void chooseMedia(id, item.id)}
          />
          <SelectField
            label="Test sound"
            options={[
              '',
              ...sounds.map(({ assetId }) => assetId),
              ...(missingSound ? [sound] : []),
            ]}
            labels={[
              'None',
              ...sounds.map(({ filename }) => filename),
              ...(missingSound ? ['Missing asset'] : []),
            ]}
            value={sound ?? ''}
            onCommit={(id) => onChange(update({ audioAssetId: id || undefined }))}
          />
        </>
      )}
      <div style={{ display: 'flex', gap: '0.2rem', padding: '0.25rem 0' }}>
        <Control size="sm" aria-label="Add test program" title="Add test program" onClick={add}>
          <Icon icon={Plus} size={14} />
        </Control>
        {item !== undefined && (
          <>
            <Control
              size="sm"
              aria-label="Move earlier"
              title="Move earlier"
              disabled={position === 0}
              onClick={() => move(-1)}
            >
              <Icon icon={ArrowUp} size={14} />
            </Control>
            <Control
              size="sm"
              aria-label="Move later"
              title="Move later"
              disabled={position === items.length - 1}
              onClick={() => move(1)}
            >
              <Icon icon={ArrowDown} size={14} />
            </Control>
            <Control
              size="sm"
              aria-label="Remove test program"
              title="Remove test program"
              onClick={() => {
                onChange(items.filter(({ id }) => id !== item.id));
                selectItem((items[position + 1] ?? items[position - 1])?.id);
              }}
            >
              <Icon icon={Trash2} size={14} />
            </Control>
          </>
        )}
      </div>
    </>
  );
}

function ProjectVideoThumbnail({ assetId }: { assetId: string }): JSX.Element {
  const url = useAssetUrl(assetId);
  return url === null ? (
    <Icon icon={Film} size={22} />
  ) : (
    <VideoPoster url={url} draggable={false} />
  );
}
