/**
 * `PAGE-REBUILD-01` (`C-034`) — a `.vcg`'s bytes as the socket carries them (base64, inside JSON)
 * and back. Chunked, because a package can be tens of megabytes and one `String.fromCharCode(...)`
 * over all of it overflows the call stack. No Node `Buffer` here: this runs in the page.
 */

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
