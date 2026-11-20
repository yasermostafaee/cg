import { useEffect, useState } from 'react';
import { Film, ImagePlus } from 'lucide-react';
import { Icon } from '../../ui/Icon.js';
import './live-layout-asset-thumbnail.css';

export function useLiveLayoutAssetUrl(asset: Blob | undefined): string | undefined {
  const [preview, setPreview] = useState<{ asset: Blob; url: string }>();
  useEffect(() => {
    if (asset === undefined) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(asset);
    setPreview({ asset, url });
    return () => URL.revokeObjectURL(url);
  }, [asset]);
  return preview?.asset === asset ? preview?.url : undefined;
}

export function LiveLayoutAssetThumbnail({
  kind,
  src,
}: {
  kind: 'image' | 'video';
  src: string | undefined;
}): JSX.Element {
  return <Thumbnail key={src} kind={kind} src={src} />;
}

function Thumbnail({
  kind,
  src,
}: {
  kind: 'image' | 'video';
  src: string | undefined;
}): JSX.Element {
  const [ready, setReady] = useState(false);
  return (
    <span className="cg-live-layout-asset-thumbnail" aria-hidden="true">
      {!ready && <Icon icon={kind === 'video' ? Film : ImagePlus} size={14} />}
      {src !== undefined &&
        (kind === 'video' ? (
          <video
            src={src}
            muted
            preload="auto"
            playsInline
            hidden={!ready}
            onLoadedData={() => setReady(true)}
            onError={() => setReady(false)}
          />
        ) : (
          <img
            src={src}
            alt=""
            hidden={!ready}
            onLoad={() => setReady(true)}
            onError={() => setReady(false)}
          />
        ))}
    </span>
  );
}
