import {
  controlLiveLayoutPaintFrames,
  controlLiveLayoutRects,
  controlLiveLayoutWithOverlays,
  type ControlLiveLayout,
  type ControlLiveLayoutPreset,
} from '@cg/shared-schema';
import './live-layout-geometry-thumbnail.css';

export function LiveLayoutGeometryThumbnail({
  layout,
  preset,
  className,
}: {
  layout: ControlLiveLayout;
  preset: ControlLiveLayoutPreset;
  className?: string | undefined;
}): JSX.Element {
  const { width, height } = layout.resolution;
  const rects = controlLiveLayoutWithOverlays(layout, controlLiveLayoutRects(layout, preset));
  return (
    <span
      className={['cg-live-layout-geometry-thumbnail', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      style={{ aspectRatio: width / height }}
    >
      {controlLiveLayoutPaintFrames(layout).map(({ id }) => {
        const rect = rects[id];
        if (rect === undefined) return null;
        return (
          <span
            key={id}
            data-layout-thumbnail-plate={id}
            style={{
              left: `${(100 * rect.x) / width}%`,
              top: `${(100 * rect.y) / height}%`,
              width: `${(100 * rect.width) / width}%`,
              height: `${(100 * rect.height) / height}%`,
            }}
          />
        );
      })}
    </span>
  );
}
