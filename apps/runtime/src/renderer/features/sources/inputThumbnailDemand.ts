import type { SourcePreviewFrame } from '@cg/shared-ipc';

const MAX_BATCH_SIZE = 8;
const BATCH_INTERVAL_MS = 1_000;

interface Demand {
  channel: number;
  sourceId: string;
  publish: (frame: SourcePreviewFrame | undefined) => void;
}

const visible = new Set<Demand>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let nextBatchAt = 0;

/** Pickers and Settings share the console's snapshot budget. Only visible rows subscribe. */
export function subscribeInputThumbnail(demand: Demand): () => void {
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
  if (timer !== undefined || inFlight || visible.size === 0) return;
  timer = setTimeout(read, Math.max(0, Math.ceil(nextBatchAt - performance.now())));
}

function read(): void {
  timer = undefined;
  const api = window.cg?.sourcePreviews;
  const first = visible.values().next().value;
  if (api === undefined || first === undefined) return;

  const { channel } = first;
  const sourceIds = new Set<string>();
  const subscribers: Demand[] = [];
  for (const demand of visible) {
    if (demand.channel !== channel) continue;
    if (sourceIds.size === MAX_BATCH_SIZE && !sourceIds.has(demand.sourceId)) continue;
    sourceIds.add(demand.sourceId);
    subscribers.push(demand);
  }
  // Move this batch to the back so visible rows beyond the limit get their turn too.
  for (const demand of subscribers) {
    visible.delete(demand);
    visible.add(demand);
  }

  inFlight = true;
  nextBatchAt = performance.now() + BATCH_INTERVAL_MS;
  const publish = (frames: readonly SourcePreviewFrame[]): void => {
    if (window.cg?.sourcePreviews !== api) return;
    for (const demand of subscribers) {
      if (visible.has(demand)) {
        demand.publish(frames.find((frame) => frame.sourceId === demand.sourceId));
      }
    }
  };
  void Promise.resolve()
    .then(() => api.thumbnails({ channel, sourceIds: [...sourceIds] }))
    .then(
      ({ frames }) => publish(frames),
      () => publish([]),
    )
    .finally(() => {
      inFlight = false;
      schedule();
    });
}
