import { z } from 'zod';
import { defineChannel, type ChannelRequest, type ChannelResponse } from '../channel.js';
import { probeImage } from '../page-book.js';

export const UPCOMING_MEDIA_MAX_BYTES = 24 * 1024 * 1024;
export const UPCOMING_MEDIA_MAX_BASE64_LENGTH = Math.ceil(UPCOMING_MEDIA_MAX_BYTES / 3) * 4;

export const UpcomingMediaMimeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/webm',
  'video/mp4',
]);
export type UpcomingMediaMime = z.infer<typeof UpcomingMediaMimeSchema>;

const MediaHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const MediaBase64Schema = z.string().min(1).max(UPCOMING_MEDIA_MAX_BASE64_LENGTH);

export const UpcomingMediaPutChannel = defineChannel(
  'upcoming-media.put',
  z.object({
    name: z.string().min(1).max(512),
    mime: UpcomingMediaMimeSchema,
    base64: MediaBase64Schema,
  }),
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), sha256: MediaHashSchema, mime: UpcomingMediaMimeSchema }),
    z.object({
      ok: z.literal(false),
      errorCode: z.enum([
        'media-too-large',
        'media-invalid-base64',
        'media-type-mismatch',
        'media-store-failed',
      ]),
    }),
  ]),
);

export const UpcomingMediaGetChannel = defineChannel(
  'upcoming-media.get',
  z.object({ sha256: MediaHashSchema }),
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('media'),
      mime: UpcomingMediaMimeSchema,
      base64: MediaBase64Schema,
    }),
    z.object({ kind: z.literal('missing') }),
  ]),
);

export type UpcomingMediaPutRequest = ChannelRequest<typeof UpcomingMediaPutChannel>;
export type UpcomingMediaPutResult = ChannelResponse<typeof UpcomingMediaPutChannel>;
export type UpcomingMediaGetRequest = ChannelRequest<typeof UpcomingMediaGetChannel>;
export type UpcomingMediaGetResult = ChannelResponse<typeof UpcomingMediaGetChannel>;

const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'iso7',
  'iso8',
  'iso9',
  'mp41',
  'mp42',
  'avc1',
  'avc3',
  'M4V ',
  'dash',
  'msdh',
  'msix',
]);

/** Identify allowed media from its header in both the Bridge and browser. */
export function probeUpcomingMedia(bytes: Uint8Array): UpcomingMediaMime | null {
  const image = probeImage(bytes);
  if (image !== null) return image.mime;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (isWebm(view)) return 'video/webm';
  if (isMp4(view)) return 'video/mp4';
  return null;
}

function fourCc(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function isMp4(view: DataView): boolean {
  if (view.byteLength < 16 || fourCc(view, 4) !== 'ftyp') return false;
  const end = view.getUint32(0);
  if (end < 16 || end > view.byteLength || end % 4 !== 0) return false;
  if (MP4_BRANDS.has(fourCc(view, 8))) return true;
  for (let offset = 16; offset < end; offset += 4) {
    if (MP4_BRANDS.has(fourCc(view, offset))) return true;
  }
  return false;
}

function isWebm(view: DataView): boolean {
  if (view.byteLength < 5 || view.getUint32(0) !== 0x1a45dfa3) return false;
  const header = ebmlSize(view, 4, view.byteLength);
  if (header === null) return false;
  const end = header.start + header.size;
  if (end > view.byteLength) return false;
  for (let offset = header.start; offset < end; ) {
    const idWidth = ebmlWidth(view.getUint8(offset));
    if (idWidth === 0) return false;
    const element = ebmlSize(view, offset + idWidth, end);
    if (element === null || element.start + element.size > end) return false;
    // DocType is a direct child of the EBML header. Matroska uses the same header magic.
    if (idWidth === 2 && view.getUint16(offset) === 0x4282) {
      return element.size === 4 && fourCc(view, element.start) === 'webm';
    }
    offset = element.start + element.size;
  }
  return false;
}

function ebmlSize(
  view: DataView,
  offset: number,
  end: number,
): { start: number; size: number } | null {
  if (offset >= end) return null;
  const first = view.getUint8(offset);
  const width = ebmlWidth(first);
  if (width === 0 || offset + width > end) return null;
  let size = first & (0xff >> width);
  for (let index = 1; index < width; index += 1) size = size * 256 + view.getUint8(offset + index);
  return { start: offset + width, size };
}

function ebmlWidth(first: number): number {
  for (let width = 1; width <= 4; width += 1) {
    if ((first & (0x80 >> (width - 1))) !== 0) return width;
  }
  return 0;
}
