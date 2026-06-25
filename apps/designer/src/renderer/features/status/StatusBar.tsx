import { useEffect, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import type { Scene } from '@cg/shared-schema';
import type { ExportIssue } from '@cg/shared-ipc';
import { designerStore, useDesignerSelector } from '../../state/store.js';
import * as s from './StatusBar.css.js';
import { Button } from '../../ui/Button.js';
import { Control } from '../../ui/Control.js';
import { Icon } from '../../ui/Icon.js';
import { IssuesPanel } from '../issues/IssuesPanel.js';
import { Modal, ModalButton } from '../shell/Modal.js';

interface Props {
  scene: Scene | null;
  issues: readonly ExportIssue[];
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 20;

/** Bottom-of-window status bar — project chrome + issues badge + a
 *  slider that horizontally zooms the timeline. Save / Export live in
 *  the TopToolbar on the right. */
export function StatusBar({ scene, issues }: Props): JSX.Element {
  const timelineZoom = useDesignerSelector((s) => s.timelineZoom);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const [issuesOpen, setIssuesOpen] = useState(false);

  // Nothing to show once the issues clear — auto-close the modal.
  useEffect(() => {
    if (issues.length === 0) setIssuesOpen(false);
  }, [issues.length]);

  // Replace the (now-unused) template-type chip with the frame rate + total
  // duration of the active document.
  const totalFrames = scene === null ? 0 : scene.frameRange.out - scene.frameRange.in;
  const durationSecs =
    scene === null || scene.frameRate <= 0 ? '0' : (totalFrames / scene.frameRate).toFixed(1);

  return (
    <footer className={s.bar} aria-label="Status bar">
      {scene === null ? (
        <span className={s.pill}>no project</span>
      ) : (
        <>
          <span className={s.pill} title="Frame rate">
            {scene.frameRate} fps
          </span>
          <span className={s.pill} title="Duration">
            {totalFrames}f · {durationSecs}s
          </span>
        </>
      )}
      <span className={s.pill} title="Resolution">
        {scene === null ? '0×0' : `${scene.resolution.width}×${scene.resolution.height}`}
      </span>
      {issues.length > 0 && (
        <Button
          variant="bare"
          onClick={() => setIssuesOpen(true)}
          aria-label="Show issues"
          title="Show issues"
          className={s.pill}
          style={{
            borderColor: errorCount > 0 ? '#fda4af' : '#fcd34d',
            color: errorCount > 0 ? '#fda4af' : '#fcd34d',
          }}
        >
          {errorCount > 0
            ? `${String(errorCount)} error${errorCount === 1 ? '' : 's'}`
            : `${String(issues.length)} issue${issues.length === 1 ? '' : 's'}`}
        </Button>
      )}
      <span className={s.spacer} />
      <div className={s.zoomWrap} aria-label="Timeline zoom">
        <Control
          variant="bare"
          className={s.zoomButton}
          onClick={() => designerStore.setTimelineZoom(timelineZoom - 1)}
          disabled={timelineZoom <= ZOOM_MIN}
          aria-label="Zoom out timeline"
          title="Zoom out timeline"
        >
          <Icon icon={ZoomOut} size={14} />
        </Control>
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={1}
          value={timelineZoom}
          onChange={(e) => designerStore.setTimelineZoom(Number(e.target.value))}
          className={s.zoomSlider}
          aria-label="Timeline zoom"
          title={`Timeline zoom ${String(timelineZoom)}×`}
        />
        <Control
          variant="bare"
          className={s.zoomButton}
          onClick={() => designerStore.setTimelineZoom(timelineZoom + 1)}
          disabled={timelineZoom >= ZOOM_MAX}
          aria-label="Zoom in timeline"
          title="Zoom in timeline"
        >
          <Icon icon={ZoomIn} size={14} />
        </Control>
        <span className={s.zoomReadout}>{timelineZoom}×</span>
      </div>
      {issuesOpen && (
        <Modal
          title="Issues"
          onClose={() => setIssuesOpen(false)}
          width="min(560px, 92vw)"
          minBodyHeight={220}
          footer={<ModalButton onClick={() => setIssuesOpen(false)}>Close</ModalButton>}
        >
          <IssuesPanel issues={issues} embedded onPick={() => setIssuesOpen(false)} />
        </Modal>
      )}
    </footer>
  );
}
