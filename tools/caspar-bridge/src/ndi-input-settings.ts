import { PlayoutIdSchema, SourceNdiSenderNameSchema } from '@cg/shared-ipc';
import { z } from 'zod';
import type { LivePreviewTarget } from './live-preview.js';
import { playoutFetch } from './playout-http.js';

const TTL_MS = 10_000;
const CAPACITY = 24;
const SETTINGS_PATH = '/api/v1/settings/live-inputs';
const inputSetting = z.object({ id: PlayoutIdSchema, kind: z.unknown(), address: z.unknown() });
export type NdiInputSetting = z.infer<typeof inputSetting>;

const OTHER_INPUT_KINDS = new Set([
  'aja',
  'bluefish',
  'decklink',
  'directshow',
  'dshow',
  'hdmi',
  'hls',
  'rist',
  'rtmp',
  'rtp',
  'rtsp',
  'sdi',
  'srt',
  'st2110',
  'stream',
  'udp',
  'usb',
  'webrtc',
  'whip',
]);

function senderName(address: unknown): string | null {
  const direct = SourceNdiSenderNameSchema.safeParse(address);
  if (!direct.success) return null;
  if (!direct.data.includes('://')) return /^.+ \(.+\)$/u.test(direct.data) ? direct.data : null;
  const match = /^ndi:\/\/([^/?#@\\]+)\/([^/?#\\]+)$/iu.exec(direct.data);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  try {
    const machine = decodeURIComponent(match[1]);
    const source = decodeURIComponent(match[2].replace(/\+/g, ' '));
    if (machine.trim() === '' || source.trim() === '' || /[/@\\()?#]/u.test(machine)) return null;
    const converted = SourceNdiSenderNameSchema.safeParse(`${machine} (${source})`);
    return converted.success ? converted.data : null;
  } catch {
    return null;
  }
}

/** Configure-holder reads join only by the physical D10 ID of the verified node. */
export function ndiSettingForInput(
  settings: readonly NdiInputSetting[],
  inputId: string,
): { kind: 'ndi'; senderName: string } | { kind: 'other' | 'unknown' } {
  const [entry, duplicate] = settings.filter(({ id }) => id === inputId);
  if (entry === undefined || duplicate !== undefined || typeof entry.kind !== 'string') {
    return { kind: 'unknown' };
  }
  const kind = entry.kind.toLowerCase();
  if (kind !== 'ndi') {
    return { kind: OTHER_INPUT_KINDS.has(kind) ? 'other' : 'unknown' };
  }
  const sender = senderName(entry.address);
  return sender === null ? { kind: 'unknown' } : { kind: 'ndi', senderName: sender };
}

/** One short, bounded metadata read per authenticated node and channel, never a video request. */
export class NdiInputSettings {
  readonly #reads = new Map<string, { until: number; answer: Promise<NdiInputSetting[]> }>();

  read(target: LivePreviewTarget): Promise<NdiInputSetting[]> {
    const key = JSON.stringify([target.origin, target.code, target.bearer]);
    const now = Date.now();
    const held = this.#reads.get(key);
    if (held !== undefined && held.until > now) return held.answer;
    const url = new URL(SETTINGS_PATH, target.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return Promise.resolve([]);
    const answer = playoutFetch(url, {
      headers: { authorization: `Bearer ${target.bearer}` },
      signal: AbortSignal.timeout(3_000),
      maxResponseBytes: 128 * 1024,
    })
      .then(async (response) => {
        if (!response.ok) return [];
        const body: unknown = await response.json();
        if (!Array.isArray(body)) return [];
        return body.flatMap((item: unknown) => {
          const row = inputSetting.safeParse(item);
          return row.success ? [row.data] : [];
        });
      })
      .catch(() => []);
    this.#reads.delete(key);
    this.#reads.set(key, { until: now + TTL_MS, answer });
    if (this.#reads.size > CAPACITY) {
      const first = this.#reads.keys().next().value;
      if (first !== undefined) this.#reads.delete(first);
    }
    return answer;
  }
}
