import { utils, write } from 'cfb';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodeTextSource } from '../src/document-text.js';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const docx = (xml: string): Uint8Array => zipSync({ 'word/document.xml': strToU8(xml) });

function legacyDoc(text: string): Uint8Array {
  // One UTF-16 main-story piece, referenced by a real Word 97 FIB and CFB table stream.
  const main = new Uint8Array(1024);
  const fib = new DataView(main.buffer);
  fib.setUint16(0, 0xa5ec, true);
  fib.setUint16(2, 0xc1, true);
  fib.setUint16(32, 14, true);
  fib.setUint16(62, 22, true);
  fib.setUint32(76, text.length, true);
  fib.setUint16(152, 93, true);
  fib.setUint32(422, 21, true);
  for (let i = 0; i < text.length; i++) fib.setUint16(768 + i * 2, text.charCodeAt(i), true);
  const table = new Uint8Array(21);
  table[0] = 2;
  const clx = new DataView(table.buffer);
  clx.setUint32(1, 16, true);
  clx.setUint32(9, text.length, true);
  clx.setUint32(15, 768, true);
  const cfb = utils.cfb_new();
  utils.cfb_add(cfb, 'WordDocument', main);
  utils.cfb_add(cfb, '0Table', table);
  const output: unknown = write(cfb, { type: 'array' });
  if (!(output instanceof Uint8Array) && !Array.isArray(output)) throw new Error('No CFB fixture');
  return Uint8Array.from(output);
}

describe('Word text file sources', () => {
  it('extracts Persian paragraphs and leaves revision deletions and field instructions out', async () => {
    const xml = `<w:document xmlns:w="${WORD_NS}"><w:body>
       <w:p><w:r><w:t>سلام &amp; خبر</w:t></w:r><w:del><w:r><w:delText>حذف</w:delText></w:r></w:del></w:p>
       <w:p><w:r><w:instrText>CODE</w:instrText><w:t>متن دوم</w:t></w:r></w:p>
       </w:body></w:document>`;
    await expect(decodeTextSource('ticker.DOCX', docx(xml))).resolves.toBe('سلام & خبر\nمتن دوم');
  });

  it('extracts Unicode from a legacy DOC and keeps the field result instead of its code', async () => {
    const bytes = legacyDoc('سلام\rخبر \x13LINK\x14مهم\x15\r');
    await expect(decodeTextSource('ticker.doc', bytes)).resolves.toBe('سلام\nخبر مهم');
  });

  it('rejects legacy compound-file sector and directory cycles', async () => {
    const bytes = legacyDoc('سلام\r');
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sectorSize = 2 ** header.getUint16(30, true);
    const fatSector = header.getUint32(76, true);
    const directorySector = header.getUint32(48, true);

    const fatCycle = bytes.slice();
    new DataView(fatCycle.buffer).setUint32(
      (fatSector + 1) * sectorSize + directorySector * 4,
      directorySector,
      true,
    );
    await expect(decodeTextSource('fat-cycle.doc', fatCycle)).rejects.toThrow('Cannot read');

    const treeCycle = bytes.slice();
    new DataView(treeCycle.buffer).setUint32((directorySector + 1) * sectorSize + 76, 0, true);
    await expect(decodeTextSource('tree-cycle.doc', treeCycle)).rejects.toThrow('Cannot read');
  });

  it('refuses malformed, oversized and XML-entity documents while keeping legacy JSON reads', async () => {
    await expect(decodeTextSource('broken.doc', new Uint8Array(12))).rejects.toThrow('Cannot read');
    const xml = `<w:document xmlns:w="${WORD_NS}"><w:body><w:p><w:r><w:t>${'x'.repeat(4_200_000)}</w:t></w:r></w:p></w:body></w:document>`;
    await expect(decodeTextSource('big.docx', docx(xml))).rejects.toThrow('Cannot read');
    await expect(
      decodeTextSource('entity.docx', docx('<!DOCTYPE document SYSTEM "file:///test"><document/>')),
    ).rejects.toThrow('Cannot read');
    await expect(decodeTextSource('legacy.json', strToU8('{"old":true}'))).resolves.toBe(
      '{"old":true}',
    );
  });
});
