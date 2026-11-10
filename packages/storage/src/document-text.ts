export const MAX_TEXT_SOURCE_BYTES = 1024 * 1024;
const MAX_DOCUMENT_XML_BYTES = 4 * MAX_TEXT_SOURCE_BYTES;

export const WORD_TEXT_FILE_TYPES = {
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const WORD_NAMESPACES = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
]);

export async function readTextSourceFile(file: File): Promise<string> {
  if (!/\.docx?$/i.test(file.name)) return file.text();
  if (file.size > MAX_TEXT_SOURCE_BYTES)
    throw new Error('Choose a Word document of 1 MiB or smaller.');
  return decodeTextSource(file.name, new Uint8Array(await file.arrayBuffer()));
}

export async function decodeTextSource(name: string, bytes: Uint8Array): Promise<string> {
  if (!/\.docx?$/i.test(name)) return new TextDecoder('utf-8').decode(bytes);
  if (bytes.byteLength > MAX_TEXT_SOURCE_BYTES)
    throw new Error('Choose a Word document of 1 MiB or smaller.');
  try {
    return /\.docx$/i.test(name) ? await readDocx(bytes) : readDoc(bytes);
  } catch (cause) {
    throw new Error(
      'Cannot read this Word document. Use an unencrypted Word 97–2003 .doc or .docx.',
      { cause },
    );
  }
}

async function readDocx(bytes: Uint8Array): Promise<string> {
  const [{ Unzip, UnzipInflate }, { SaxesParser }] = await Promise.all([
    import('fflate'),
    import('saxes'),
  ]);
  // Extract only the main XML part, with a bound on the actual inflated bytes.
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parser = new SaxesParser({ xmlns: true });
  const pieces: string[] = [];
  let bodyDepth = 0;
  let textDepth = 0;
  let deletedDepth = 0;
  let foundBody = false;
  parser.on('doctype', () => {
    throw new Error('Document types are not allowed');
  });
  parser.on('opentag', ({ uri, local }) => {
    if (!WORD_NAMESPACES.has(uri)) return;
    if (local === 'body') {
      bodyDepth++;
      foundBody = true;
    }
    if (bodyDepth === 0) return;
    if (local === 'del' || local === 'moveFrom') deletedDepth++;
    if (deletedDepth > 0) return;
    if (local === 't') textDepth++;
    if (local === 'tab') pieces.push('\t');
    if (local === 'br' || local === 'cr') pieces.push('\n');
  });
  parser.on('text', (text) => {
    if (bodyDepth > 0 && deletedDepth === 0 && textDepth > 0) pieces.push(text);
  });
  parser.on('closetag', ({ uri, local }) => {
    if (!WORD_NAMESPACES.has(uri) || bodyDepth === 0) return;
    if (local === 'del' || local === 'moveFrom') deletedDepth--;
    else if (deletedDepth === 0) {
      if (local === 't') textDepth--;
      if (local === 'p') pieces.push('\n');
      if (local === 'body') bodyDepth--;
    }
  });

  let inflated = 0;
  let seen = false;
  let finished = false;
  const zip = new Unzip((entry) => {
    if (entry.name !== 'word/document.xml') return;
    if (seen) throw new Error('Duplicate Word body');
    seen = true;
    if ((entry.originalSize ?? 0) > MAX_DOCUMENT_XML_BYTES) throw new Error('Word body too large');
    entry.ondata = (error, chunk, final) => {
      if (error !== null) throw error;
      inflated += chunk.length;
      if (inflated > MAX_DOCUMENT_XML_BYTES) throw new Error('Word body too large');
      parser.write(decoder.decode(chunk, { stream: !final }));
      if (final) {
        parser.close();
        finished = true;
      }
    };
    entry.start();
  });
  zip.register(UnzipInflate);
  // Bounded chunks limit the bytes one inflate call can create before the callback.
  for (let start = 0; start < bytes.length; start += 4096) {
    zip.push(bytes.subarray(start, start + 4096), start + 4096 >= bytes.length);
  }
  if (!finished || !foundBody) throw new Error('Missing Word body');
  return pieces.join('').replace(/\n$/, '');
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

const END_OF_CHAIN = 0xfffffffe;
const NO_DIRECTORY_ENTRY = 0xffffffff;
const MINI_SECTOR_BYTES = 64;
const MINI_STREAM_CUTOFF = 4096;

interface CompoundDirectoryEntry {
  type: number;
  left: number;
  right: number;
  child: number;
  start: number;
  size: number;
  name: string;
}

/**
 * MS-CFB stream reader for bounded Word files. Validate the visited chains and directory links
 * ourselves so a malformed sector or directory cycle cannot strand a renderer or the Bridge.
 */
function openCompoundStreams(bytes: Uint8Array): (name: string) => Uint8Array {
  const header = view(bytes);
  const sectorShift = header.getUint16(30, true);
  const version = header.getUint16(26, true);
  if (
    header.getUint16(28, true) !== 0xfffe ||
    header.getUint16(32, true) !== 6 ||
    header.getUint32(56, true) !== MINI_STREAM_CUTOFF ||
    !((version === 3 && sectorShift === 9) || (version === 4 && sectorShift === 12))
  )
    throw new Error('Invalid Word compound header');

  const sectorSize = 2 ** sectorShift;
  const sectorCount = bytes.length / sectorSize - 1;
  const fatCount = header.getUint32(44, true);
  // A 1 MiB file needs at most 16 FAT sectors; extended DIFAT is not needed at this size.
  if (
    !Number.isInteger(sectorCount) ||
    sectorCount < 1 ||
    fatCount < 1 ||
    fatCount > 109 ||
    header.getUint32(72, true) !== 0
  )
    throw new Error('Invalid Word sector allocation');

  const sector = (index: number): Uint8Array => {
    if (index >= sectorCount) throw new Error('Word sector is outside the file');
    const offset = (index + 1) * sectorSize;
    return bytes.subarray(offset, offset + sectorSize);
  };
  const fat = Array.from({ length: fatCount }, (_, index) =>
    view(sector(header.getUint32(76 + index * 4, true))),
  );
  const fatLink = (index: number): number => {
    const entry = fat[Math.floor((index * 4) / sectorSize)];
    if (entry === undefined) throw new Error('Missing Word sector link');
    return entry.getUint32((index * 4) % sectorSize, true);
  };
  const readChain = (
    start: number,
    blockSize: number,
    cap: number,
    exactBytes: number | null,
    block: (index: number) => Uint8Array,
    link: (index: number) => number,
  ): Uint8Array => {
    const limit = Math.ceil((exactBytes ?? cap) / blockSize);
    if (limit * blockSize > cap || cap > bytes.length) throw new Error('Word stream too large');
    if (limit === 0) return new Uint8Array();
    const output = new Uint8Array(limit * blockSize);
    const seen = new Set<number>();
    let next = start;
    let offset = 0;
    while (next !== END_OF_CHAIN) {
      if (seen.has(next) || offset >= output.length) throw new Error('Invalid Word stream chain');
      seen.add(next);
      const data = block(next);
      if (data.length !== blockSize) throw new Error('Truncated Word stream');
      output.set(data, offset);
      offset += blockSize;
      next = link(next);
    }
    if (exactBytes !== null && offset < exactBytes) throw new Error('Truncated Word stream');
    return output.subarray(0, exactBytes ?? offset);
  };
  const fatStream = (start: number, size: number | null): Uint8Array =>
    readChain(start, sectorSize, sectorCount * sectorSize, size, sector, fatLink);
  const directory = fatStream(header.getUint32(48, true), null);
  const directoryView = view(directory);
  const utf16 = new TextDecoder('utf-16le', { fatal: true });
  const entry = (index: number): CompoundDirectoryEntry => {
    const base = index * 128;
    if (base + 128 > directory.length) throw new Error('Missing Word directory entry');
    const size = directoryView.getUint32(base + 120, true);
    if (version === 4 && directoryView.getUint32(base + 124, true) !== 0)
      throw new Error('Word stream too large');
    const nameBytes = directoryView.getUint16(base + 64, true);
    if (nameBytes < 2 || nameBytes > 64 || nameBytes % 2 !== 0)
      throw new Error('Invalid Word stream name');
    return {
      name: utf16.decode(directory.subarray(base, base + nameBytes - 2)).toLowerCase(),
      type: directoryView.getUint8(base + 66),
      left: directoryView.getUint32(base + 68, true),
      right: directoryView.getUint32(base + 72, true),
      child: directoryView.getUint32(base + 76, true),
      start: directoryView.getUint32(base + 116, true),
      size,
    };
  };
  const root = entry(0);
  if (root.type !== 5) throw new Error('Missing Word root storage');
  const streams = new Map<string, CompoundDirectoryEntry>();
  const pending = [root.child];
  const seen = new Set([0]);
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next === NO_DIRECTORY_ENTRY) continue;
    if (seen.has(next)) throw new Error('Cyclic Word directory');
    seen.add(next);
    const item = entry(next);
    if (item.type === 2) {
      if (streams.has(item.name)) throw new Error('Duplicate Word stream');
      streams.set(item.name, item);
    }
    pending.push(item.left, item.right);
  }
  let miniStore: Uint8Array | undefined;
  let miniFat: DataView | undefined;
  return (name) => {
    const item = streams.get(name.toLowerCase());
    if (item === undefined || item.size > bytes.length)
      throw new Error('Invalid Word stream: ' + name);
    if (item.size === 0) return new Uint8Array();
    if (item.size >= MINI_STREAM_CUTOFF) return fatStream(item.start, item.size);
    const store = (miniStore ??= fatStream(root.start, root.size));
    const links = (miniFat ??= view(
      fatStream(header.getUint32(60, true), header.getUint32(64, true) * sectorSize),
    ));
    return readChain(
      item.start,
      MINI_SECTOR_BYTES,
      store.length,
      item.size,
      (index) => store.subarray(index * MINI_SECTOR_BYTES, (index + 1) * MINI_SECTOR_BYTES),
      (index) => links.getUint32(index * 4, true),
    );
  };
}

// MS-DOC §2.4.1: the FIB points to the CLX, whose piece table maps main-body
// character positions to compressed ANSI or UTF-16 in the WordDocument stream.
function readDoc(bytes: Uint8Array): string {
  const header = view(bytes);
  if (header.getUint32(0) !== 0xd0cf11e0 || header.getUint32(4) !== 0xa1b11ae1)
    throw new Error('Missing compound file signature');
  const stream = openCompoundStreams(bytes);
  const wordBytes = stream('WordDocument');
  const fib = view(wordBytes);
  if (fib.getUint16(0, true) !== 0xa5ec || fib.getUint16(2, true) < 0x00c1)
    throw new Error('Unsupported Word format');
  const flags = fib.getUint16(10, true);
  if ((flags & 0x8100) !== 0) throw new Error('Encrypted Word document');
  const longsCountOffset = 34 + fib.getUint16(32, true) * 2;
  const longsOffset = longsCountOffset + 2;
  const longsCount = fib.getUint16(longsCountOffset, true);
  if (longsCount < 4) throw new Error('Missing Word character count');
  const bodyLength = fib.getInt32(longsOffset + 12, true);
  if (bodyLength < 0 || bodyLength > MAX_TEXT_SOURCE_BYTES)
    throw new Error('Invalid Word body size');
  if (bodyLength === 0) return '';
  const offsetsCountOffset = longsOffset + longsCount * 4;
  const clxPair = offsetsCountOffset + 2 + 33 * 8;
  if (fib.getUint16(offsetsCountOffset, true) < 34) throw new Error('Missing Word piece table');
  const start = fib.getUint32(clxPair, true);
  const end = start + fib.getUint32(clxPair + 4, true);
  const tableBytes = stream((flags & 0x0200) === 0 ? '0Table' : '1Table');
  if (end > tableBytes.length || start >= end) throw new Error('Invalid Word CLX');
  const clx = view(tableBytes.subarray(start, end));
  let offset = 0;
  while (clx.getUint8(offset) === 1) offset += 3 + clx.getUint16(offset + 1, true);
  if (clx.getUint8(offset) !== 2) throw new Error('Missing Word text pieces');
  const tableLength = clx.getUint32(offset + 1, true);
  const table = offset + 5;
  if (tableLength < 16 || (tableLength - 4) % 12 !== 0 || table + tableLength > clx.byteLength)
    throw new Error('Invalid Word piece table');
  const count = (tableLength - 4) / 12;
  if (clx.getUint32(table, true) !== 0 || clx.getUint32(table + count * 4, true) < bodyLength)
    throw new Error('Word pieces do not cover the body');
  const pieces: string[] = [];
  const ansi = new TextDecoder('windows-1252');
  // MS-DOC's FcCompressed is byte identity with a limited set of ANSI overrides.
  const compressedChars = Array.from({ length: 256 }, (_, byte) =>
    byte === 0x80 || byte === 0x8e || byte === 0x9e
      ? String.fromCharCode(byte)
      : ansi.decode(Uint8Array.of(byte)),
  );
  const unicode = new TextDecoder('utf-16le', { ignoreBOM: true });
  for (let index = 0; index < count; index++) {
    const cp = clx.getUint32(table + index * 4, true);
    if (cp >= bodyLength) break;
    const next = Math.min(bodyLength, clx.getUint32(table + (index + 1) * 4, true));
    const packed = clx.getUint32(table + (count + 1) * 4 + index * 8 + 2, true);
    const compressed = (packed & 0x40000000) !== 0;
    const dataOffset = (packed & 0x3fffffff) / (compressed ? 2 : 1);
    const dataEnd = dataOffset + (next - cp) * (compressed ? 1 : 2);
    if (next <= cp || dataOffset % 1 !== 0 || dataEnd > wordBytes.length)
      throw new Error('Invalid Word text range');
    const data = wordBytes.subarray(dataOffset, dataEnd);
    pieces.push(
      compressed
        ? Array.from(data, (byte) => compressedChars[byte] ?? '').join('')
        : unicode.decode(data),
    );
  }
  return visibleDocText(pieces.join(''));
}

function visibleDocText(text: string): string {
  // Drop field instructions; keep their displayed result. Nested fields inherit the parent's state.
  const fields: boolean[] = [];
  const result: string[] = [];
  let hiddenFields = 0;
  for (const character of text) {
    if (character === '\x13') {
      fields.push(false);
      hiddenFields++;
    } else if (character === '\x14' && fields.at(-1) === false) {
      fields[fields.length - 1] = true;
      hiddenFields--;
    } else if (character === '\x15') {
      if (fields.pop() === false) hiddenFields--;
    } else if (hiddenFields === 0) {
      if (character === '\r' || character === '\v' || character === '\f') result.push('\n');
      else if (character === '\x07' || character === '\t') result.push('\t');
      else if (character >= ' ') result.push(character);
    }
  }
  return result.join('').replace(/\n$/, '');
}
