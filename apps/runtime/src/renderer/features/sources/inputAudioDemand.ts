import {
  MAX_SOURCE_AUDIO_BATCH,
  MAX_SOURCE_AUDIO_CHANNELS,
  type SourceAudioReading,
} from '@cg/shared-ipc';

interface Demand {
  channel: number;
  sourceId: string;
  publish: (reading: SourceAudioReading | undefined) => void;
}

const visible = new Set<Demand>();
const POLL_MS = 250;
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;

function schedule(delay: number): void {
  if (timer !== undefined || inFlight || visible.size === 0) return;
  timer = setTimeout(() => void read(), delay);
}

async function read(): Promise<void> {
  timer = undefined;
  const api = window.cg?.sourcePreviews;
  const first = visible.values().next().value;
  if (api?.audioLevels === undefined || first === undefined) return;
  const { channel } = first;
  const ids = new Set<string>();
  const batch = [...visible].filter((demand) => {
    if (
      demand.channel !== channel ||
      (ids.size === MAX_SOURCE_AUDIO_BATCH && !ids.has(demand.sourceId))
    )
      return false;
    ids.add(demand.sourceId);
    visible.delete(demand);
    visible.add(demand);
    return true;
  });
  inFlight = true;
  try {
    const { readings } = await api.audioLevels({
      channel,
      sourceIds: [...ids],
      maxChannels: MAX_SOURCE_AUDIO_CHANNELS,
    });
    if (window.cg?.sourcePreviews !== api) return;
    const byId = new Map(readings.map((reading) => [reading.sourceId, reading]));
    for (const demand of batch) if (visible.has(demand)) demand.publish(byId.get(demand.sourceId));
  } catch {
    for (const demand of batch) if (visible.has(demand)) demand.publish(undefined);
  } finally {
    inFlight = false;
    schedule(POLL_MS);
  }
}

export function subscribeInputAudio(demand: Demand): () => void {
  visible.add(demand);
  schedule(0);
  return () => {
    visible.delete(demand);
    if (visible.size > 0 || timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };
}
