import type { MediaPreviewFrame, SourcePreviewFrame } from '@cg/shared-ipc';

const MAX_BATCH_SIZE = 8;
const BATCH_INTERVAL_MS = 1_000;

interface Demand {
  channel: number;
  sourceId: string;
  publish: (frame: SourcePreviewFrame | undefined) => void;
}

interface MediaDemand {
  channel: number;
  sourceId: string;
  position: () => number;
  publish: (frame: MediaPreviewFrame | undefined) => void;
}

const visible = new Set<Demand | MediaDemand>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inputInFlight = false;
let mediaInFlight = false;
let nextBatchAt = 0;

/** Pickers and Settings share the console's snapshot budget. Only visible rows subscribe. */
export function subscribeInputThumbnail(demand: Demand): () => void {
  return subscribe(demand);
}

/** Seek reads share the snapshot rate limit without blocking the passive thumbnail batch. */
export function subscribeMediaPreviewFrame(demand: MediaDemand): () => void {
  return subscribe(demand);
}

function subscribe(demand: Demand | MediaDemand): () => void {
  visible.add(demand);
  schedule();
  return () => {
    visible.delete(demand);
    if (visible.size === 0 && timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
}

function schedule(): void {
  if (timer !== undefined || ![...visible].some(isReady)) return;
  timer = setTimeout(read, Math.max(0, Math.ceil(nextBatchAt - performance.now())));
}

function isReady(demand: Demand | MediaDemand): boolean {
  return 'position' in demand ? !mediaInFlight : !inputInFlight;
}

function read(): void {
  timer = undefined;
  const api = window.cg?.sourcePreviews;
  const first = [...visible].find(isReady);
  if (api === undefined || first === undefined) return;

  const { channel } = first;
  const sourceIds = new Set<string>();
  const subscribers: Demand[] = [];
  const media = 'position' in first ? first : undefined;
  const position =
    media === undefined ? undefined : { sourceId: media.sourceId, atMs: media.position() };
  if (media === undefined) {
    for (const demand of visible) {
      if (demand.channel !== channel || 'position' in demand) continue;
      if (sourceIds.size === MAX_BATCH_SIZE && !sourceIds.has(demand.sourceId)) continue;
      sourceIds.add(demand.sourceId);
      subscribers.push(demand);
    }
    // Move this batch to the back so visible rows beyond the limit get their turn too.
    for (const demand of subscribers) {
      visible.delete(demand);
      visible.add(demand);
    }
    inputInFlight = true;
  } else {
    visible.delete(media);
    visible.add(media);
    mediaInFlight = true;
  }

  nextBatchAt = performance.now() + BATCH_INTERVAL_MS;
  const publish = (frames: readonly SourcePreviewFrame[], mediaFrame?: MediaPreviewFrame): void => {
    if (window.cg?.sourcePreviews !== api) return;
    for (const demand of subscribers) {
      if (visible.has(demand)) {
        demand.publish(frames.find((frame) => frame.sourceId === demand.sourceId));
      }
    }
    if (media !== undefined && visible.has(media)) {
      const matches =
        mediaFrame !== undefined &&
        mediaFrame.sourceId === position?.sourceId &&
        mediaFrame.previewPositionMs === position.atMs;
      media.publish(matches ? mediaFrame : undefined);
    }
  };
  void Promise.resolve()
    .then(() =>
      api.thumbnails({
        channel,
        sourceIds: [...sourceIds],
        ...(position === undefined ? {} : { mediaPosition: position }),
      }),
    )
    .then(
      ({ frames, mediaFrame }) => publish(frames, mediaFrame),
      () => publish([]),
    )
    .finally(() => {
      if (media === undefined) inputInFlight = false;
      else mediaInFlight = false;
      schedule();
    });
  schedule();
}
