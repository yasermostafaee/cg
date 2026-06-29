/**
 * RFC-4122 v4 UUID generator with a non-secure-context fallback.
 *
 * `crypto.randomUUID()` is only exposed in secure contexts (HTTPS or
 * `localhost`). When the Runtime is served over plain HTTP to a LAN IP
 * (e.g. `http://192.168.x.x:5174`) the method is absent and calling it
 * throws. `crypto.getRandomValues()` has no such restriction, so we build
 * the id from it whenever `randomUUID` is unavailable. Mirrors the Designer's
 * `uuid` helper (kept app-local — the renderer must not import `src/platform`).
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex: string[] = [];
  bytes.forEach((b, i) => {
    // Force the version (4) and variant (RFC 4122) bits.
    const v = i === 6 ? (b & 0x0f) | 0x40 : i === 8 ? (b & 0x3f) | 0x80 : b;
    hex.push(v.toString(16).padStart(2, '0'));
  });
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
