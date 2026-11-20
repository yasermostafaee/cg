import { afterEach, expect, it, vi } from 'vitest';
import { decodeNdiPreviewPackets, openNativeNdiStream } from '../src/platform/desktop.js';

function packet(kind: number, bytes: number[] = []): ArrayBuffer {
  const buffer = new ArrayBuffer(5 + bytes.length);
  const header = new DataView(buffer);
  header.setUint8(0, kind);
  header.setUint32(1, bytes.length, true);
  new Uint8Array(buffer, 5).set(bytes);
  return buffer;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('decodes native picture, audio, and status packets and rejects an incomplete packet', () => {
  const photo = new Uint8Array(packet(1, [255, 216, 255, 217]));
  const audio = new Uint8Array(packet(2, [1, 2, 3, 4]));
  const missing = new Uint8Array(packet(3));
  const buffer = new Uint8Array(photo.length + audio.length + missing.length);
  buffer.set(photo);
  buffer.set(audio, photo.length);
  buffer.set(missing, photo.length + audio.length);
  expect(decodeNdiPreviewPackets(buffer.buffer)).toEqual([
    { kind: 'picture', bytes: new Uint8Array([255, 216, 255, 217]) },
    { kind: 'audio', bytes: new Uint8Array([1, 2, 3, 4]) },
    { kind: 'no-signal' },
  ]);
  expect(() => decodeNdiPreviewPackets(buffer.buffer.slice(0, 6))).toThrow('incomplete');
});

it('polls the local receiver and drops an in-flight reply after closing', async () => {
  vi.useFakeTimers();
  const first = packet(1, [255, 216, 255, 217]);
  let resolveNext!: (value: ArrayBuffer) => void;
  const next = new Promise<ArrayBuffer>((resolve) => (resolveNext = resolve));
  const invoke = vi.fn<(_: string, __: unknown) => Promise<unknown>>();
  invoke.mockResolvedValueOnce(10).mockResolvedValueOnce(first).mockReturnValueOnce(next);
  invoke.mockResolvedValue(undefined);
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke });
  const onPacket = vi.fn();

  const close = await openNativeNdiStream('Studio (Camera)', onPacket);
  await vi.advanceTimersByTimeAsync(32);
  expect(onPacket).toHaveBeenCalledOnce();
  expect(invoke).toHaveBeenCalledWith('ndi_preview_start', { sender: 'Studio (Camera)' });
  expect(invoke).toHaveBeenCalledTimes(3);

  close();
  resolveNext(first);
  await vi.advanceTimersByTimeAsync(500);
  expect(invoke).toHaveBeenLastCalledWith('ndi_preview_stop', { id: 10 });
  expect(invoke).toHaveBeenCalledTimes(4);
  expect(onPacket).toHaveBeenCalledOnce();
});

it('serializes a same-sender remount before the previous Start resolves', async () => {
  vi.useFakeTimers();
  let completeStart!: (id: number) => void;
  let completeStop!: () => void;
  const firstStart = new Promise<number>((resolve) => (completeStart = resolve));
  const firstStop = new Promise<void>((resolve) => (completeStop = resolve));
  const invoke = vi.fn<(_: string, __: unknown) => Promise<unknown>>();
  invoke
    .mockReturnValueOnce(firstStart)
    .mockReturnValueOnce(firstStop)
    .mockResolvedValueOnce(11)
    .mockResolvedValue(undefined);
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke });

  const first = openNativeNdiStream('Studio (Camera)', vi.fn());
  const second = openNativeNdiStream('Studio (Camera)', vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  expect(invoke).toHaveBeenCalledTimes(1);

  completeStart(10);
  (await first)();
  await vi.advanceTimersByTimeAsync(0);
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke).toHaveBeenLastCalledWith('ndi_preview_stop', { id: 10 });

  completeStop();
  (await second)();
  await vi.advanceTimersByTimeAsync(0);
  expect(invoke).toHaveBeenNthCalledWith(3, 'ndi_preview_start', { sender: 'Studio (Camera)' });
  expect(invoke).toHaveBeenNthCalledWith(4, 'ndi_preview_stop', { id: 11 });
});
