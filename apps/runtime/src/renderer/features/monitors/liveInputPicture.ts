import { LIVE_PREVIEW_MAX_JPEG_BYTES } from '@cg/shared-ipc';

/** Bridge frames each JPEG with its four-byte big-endian length. Fetch chunk boundaries can fall anywhere. */
export async function* liveInputPictures(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const reader = body.getReader();
  const header = new Uint8Array(4);
  const size = new DataView(header.buffer);
  let frame: Uint8Array<ArrayBuffer> | null = null;
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      let cursor = 0;
      while (cursor < value.length) {
        const target = frame ?? header;
        const bytes = Math.min(target.length - offset, value.length - cursor);
        target.set(value.subarray(cursor, cursor + bytes), offset);
        offset += bytes;
        cursor += bytes;
        if (offset < target.length) continue;
        offset = 0;
        if (frame === null) {
          const length = size.getUint32(0);
          if (length === 0 || length > LIVE_PREVIEW_MAX_JPEG_BYTES) return;
          frame = new Uint8Array(length);
        } else {
          const picture = frame;
          frame = null;
          yield picture;
        }
      }
    }
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
