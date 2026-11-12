import { createHash } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { ManifestSchema, SceneSchema, repeaterRowLimit, type Layer } from '@cg/shared-schema';
import {
  SHARED_TEMPLATE_IMAGES_MAX_BYTES,
  SHARED_TEMPLATE_MAX_PREVIEW_IMAGES,
  SHARED_TEMPLATE_THUMBNAIL_MAX_BYTES,
  type SharedTemplateThumbnail,
} from '@cg/shared-ipc';

const ZIP_END = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;
const ZIP_END_SIZE = 22;
const ZIP_CENTRAL_SIZE = 46;
const ZIP_LOCAL_SIZE = 30;
const MAX_ZIP_COMMENT = 0xffff;
const MAX_CENTRAL_BYTES = 1024 * 1024;
const MAX_SCENE_BYTES = 384 * 1024;
const MAX_MANIFEST_BYTES = 192 * 1024;
const MAX_RENDER_NODES = 320;
const SCENE_ENTRY = 'template.json';
const MANIFEST_ENTRY = 'manifest.json';
const PNG_ASSET = /^assets\/image\/[0-9a-f]{64}\.png$/i;
const THUMBNAIL_ENTRY = 'thumbnails/320.png';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ ((value & 1) === 0 ? 0 : 0xedb88320);
  }
  return value;
});

function crc32(bytes: Buffer): number {
  let checksum = 0xffffffff;
  for (const byte of bytes)
    checksum = (checksum >>> 8) ^ (CRC_TABLE[(checksum ^ byte) & 0xff] ?? 0);
  return (checksum ^ 0xffffffff) >>> 0;
}

interface ZipMember {
  name: string;
  flags: number;
  method: number;
  checksum: number;
  compressedBytes: number;
  contentBytes: number;
  offset: number;
}

async function readAt(file: FileHandle, offset: number, size: number): Promise<Buffer | undefined> {
  const bytes = Buffer.alloc(size);
  let read = 0;
  while (read < size) {
    const { bytesRead } = await file.read(bytes, read, size - read, offset + read);
    if (bytesRead === 0) return undefined;
    read += bytesRead;
  }
  return bytes;
}

/** A VCG is ZIP32. Read its bounded directory instead of transferring the media in the archive. */
async function readDirectory(file: FileHandle, size: number) {
  const tailSize = Math.min(size, ZIP_END_SIZE + MAX_ZIP_COMMENT);
  const tailOffset = size - tailSize;
  const tail = await readAt(file, tailOffset, tailSize);
  if (tail === undefined) return undefined;
  for (let end = tail.length - ZIP_END_SIZE; end >= 0; end -= 1) {
    if (tail.readUInt32LE(end) !== ZIP_END) continue;
    if (end + ZIP_END_SIZE + tail.readUInt16LE(end + 20) !== tail.length) continue;
    const count = tail.readUInt16LE(end + 10);
    const length = tail.readUInt32LE(end + 12);
    const offset = tail.readUInt32LE(end + 16);
    if (
      tail.readUInt32LE(end + 4) !== 0 ||
      tail.readUInt16LE(end + 8) !== count ||
      length > MAX_CENTRAL_BYTES ||
      count * ZIP_CENTRAL_SIZE > length ||
      offset + length !== tailOffset + end
    ) {
      return undefined;
    }
    const bytes = await readAt(file, offset, length);
    return bytes === undefined ? undefined : { bytes, count, offset };
  }
  return undefined;
}

function previewMembers(bytes: Buffer, count: number): Map<string, ZipMember> | undefined {
  const members = new Map<string, ZipMember>();
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const nameStart = cursor + ZIP_CENTRAL_SIZE;
    if (nameStart > bytes.length || bytes.readUInt32LE(cursor) !== ZIP_CENTRAL) return undefined;
    const nameEnd = nameStart + bytes.readUInt16LE(cursor + 28);
    const next = nameEnd + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
    if (next > bytes.length) return undefined;
    const name = bytes.toString('utf8', nameStart, nameEnd);
    if (
      name === THUMBNAIL_ENTRY ||
      name === SCENE_ENTRY ||
      name === MANIFEST_ENTRY ||
      PNG_ASSET.test(name)
    ) {
      if (members.has(name) || bytes.readUInt16LE(cursor + 34) !== 0) return undefined;
      members.set(name, {
        name,
        flags: bytes.readUInt16LE(cursor + 8),
        method: bytes.readUInt16LE(cursor + 10),
        checksum: bytes.readUInt32LE(cursor + 16),
        compressedBytes: bytes.readUInt32LE(cursor + 20),
        contentBytes: bytes.readUInt32LE(cursor + 24),
        offset: bytes.readUInt32LE(cursor + 42),
      });
    }
    cursor = next;
  }
  return cursor === bytes.length ? members : undefined;
}

async function readMember(
  file: FileHandle,
  member: ZipMember | undefined,
  directoryOffset: number,
  maxBytes: number,
): Promise<Buffer | undefined> {
  if (
    member === undefined ||
    member.compressedBytes > maxBytes ||
    member.contentBytes > maxBytes ||
    member.contentBytes === 0 ||
    (member.method !== 0 && member.method !== 8) ||
    (member.flags & ~0x080e) !== 0 ||
    member.offset + ZIP_LOCAL_SIZE > directoryOffset
  ) {
    return undefined;
  }
  const nameLength = Buffer.byteLength(member.name);
  const header = await readAt(file, member.offset, ZIP_LOCAL_SIZE);
  if (
    header === undefined ||
    header.readUInt32LE(0) !== ZIP_LOCAL ||
    header.readUInt16LE(6) !== member.flags ||
    header.readUInt16LE(8) !== member.method ||
    header.readUInt16LE(26) !== nameLength
  ) {
    return undefined;
  }
  const nameStart = member.offset + ZIP_LOCAL_SIZE;
  const dataStart = nameStart + nameLength + header.readUInt16LE(28);
  if (dataStart + member.compressedBytes > directoryOffset) return undefined;
  const name = await readAt(file, nameStart, nameLength);
  if (name?.toString('utf8') !== member.name) return undefined;
  const encoded = await readAt(file, dataStart, member.compressedBytes);
  if (encoded === undefined) return undefined;
  try {
    const decoded =
      member.method === 0 ? encoded : inflateRawSync(encoded, { maxOutputLength: maxBytes });
    return decoded.length === member.contentBytes && crc32(decoded) === member.checksum
      ? decoded
      : undefined;
  } catch {
    return undefined;
  }
}

function isPreviewPng(bytes: Buffer): boolean {
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(PNG_SIGNATURE) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return false;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || width > 1024 || height === 0 || height > 1024) return false;
  let offset = PNG_SIGNATURE.length;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    const chunk = bytes.toString('ascii', offset + 4, offset + 8);
    offset += size + 12;
    if (offset > bytes.length) return false;
    if (chunk === 'IDAT' && size > 0) hasImageData = true;
    if (chunk === 'IEND') return hasImageData && size === 0 && offset === bytes.length;
    if (['acTL', 'fcTL', 'fdAT', 'iCCP', 'iTXt', 'zTXt'].includes(chunk)) return false;
  }
  return false;
}

/** Bound expanded work, including repeated rows and each repeated composition instance. */
function staticPreviewImageIds(
  scene: ReturnType<typeof SceneSchema.parse>,
): Set<string> | undefined {
  const compositions = new Map(scene.compositions?.map((comp) => [comp.id, comp]));
  const imageIds = new Set<string>();
  let nodes = 0;
  function count(layers: readonly Layer[], depth: number, copies: number): boolean {
    for (const layer of layers) {
      nodes += copies;
      for (const element of layer.children) {
        nodes += copies;
        if (element.type === 'ticker') nodes += copies * element.items.length;
        if (element.type === 'image') imageIds.add(element.assetId);
        if (nodes > MAX_RENDER_NODES) return false;
        if (depth >= 8) continue;
        if (element.type === 'composition') {
          const child = compositions.get(element.compositionId);
          if (child !== undefined && !count(child.layers, depth + 1, copies)) return false;
        }
        if (element.type === 'sequence') {
          const first = element.items[0];
          if (first?.kind === 'image' && first.assetId !== undefined) imageIds.add(first.assetId);
          const child =
            first?.kind === 'composition' ? compositions.get(first.compositionId) : undefined;
          if (child !== undefined && !count(child.layers, depth + 1, copies)) return false;
        }
        if (element.type === 'repeater') {
          const child = compositions.get(element.compositionId);
          const rows = Math.min(
            element.items.length,
            repeaterRowLimit(element) ?? element.items.length,
          );
          nodes += rows * copies;
          if (nodes > MAX_RENDER_NODES) return false;
          if (child !== undefined && rows > 0 && !count(child.layers, depth + 1, rows * copies))
            return false;
        }
      }
      if (nodes > MAX_RENDER_NODES) return false;
    }
    return true;
  }
  const { width, height } = scene.resolution;
  return width <= 8192 && height <= 8192 && count(scene.layers, 0, 1) ? imageIds : undefined;
}

async function previewImages(
  file: FileHandle,
  members: ReadonlyMap<string, ZipMember>,
  offset: number,
  imageIds: ReadonlySet<string>,
): Promise<Record<string, string> | undefined> {
  if (imageIds.size === 0) return undefined;
  const manifestJson = await readMember(
    file,
    members.get(MANIFEST_ENTRY),
    offset,
    MAX_MANIFEST_BYTES,
  );
  if (manifestJson === undefined) return undefined;
  let assets;
  try {
    const manifest = ManifestSchema.safeParse(JSON.parse(manifestJson.toString('utf8')));
    if (!manifest.success) return undefined;
    assets = manifest.data.assetIndex;
  } catch {
    return undefined;
  }
  let remaining = SHARED_TEMPLATE_IMAGES_MAX_BYTES;
  let attempts = 0;
  const images = new Map<string, string>();
  for (const asset of assets) {
    if (attempts >= SHARED_TEMPLATE_MAX_PREVIEW_IMAGES || remaining === 0) break;
    if (
      asset.kind !== 'image' ||
      asset.mime !== 'image/png' ||
      !PNG_ASSET.test(asset.path) ||
      !imageIds.has(asset.id) ||
      images.has(asset.id) ||
      asset.bytes > remaining
    ) {
      continue;
    }
    attempts += 1;
    const bytes = await readMember(file, members.get(asset.path), offset, remaining);
    if (
      bytes === undefined ||
      bytes.length !== asset.bytes ||
      !isPreviewPng(bytes) ||
      createHash('sha256').update(bytes).digest('hex') !== asset.sha256.toLowerCase()
    ) {
      continue;
    }
    images.set(asset.id, bytes.toString('base64'));
    remaining -= bytes.length;
  }
  return images.size > 0 ? Object.fromEntries(images) : undefined;
}

export async function readSharedVcgThumbnail(
  file: FileHandle,
  size: number,
): Promise<SharedTemplateThumbnail | null> {
  const directory = await readDirectory(file, size);
  if (directory === undefined) return null;
  const members = previewMembers(directory.bytes, directory.count);
  if (members === undefined) return null;
  const png = await readMember(
    file,
    members.get(THUMBNAIL_ENTRY),
    directory.offset,
    SHARED_TEMPLATE_THUMBNAIL_MAX_BYTES,
  );
  if (png !== undefined && isPreviewPng(png)) {
    return { kind: 'image', mime: 'image/png', base64: png.toString('base64') };
  }
  const json = await readMember(file, members.get(SCENE_ENTRY), directory.offset, MAX_SCENE_BYTES);
  if (json === undefined) return null;
  try {
    const parsed = SceneSchema.safeParse(JSON.parse(json.toString('utf8')));
    if (!parsed.success) return null;
    const imageIds = staticPreviewImageIds(parsed.data);
    if (imageIds === undefined) return null;
    const images = await previewImages(file, members, directory.offset, imageIds);
    return { kind: 'scene', scene: parsed.data, ...(images === undefined ? {} : { images }) };
  } catch {
    return null;
  }
}
