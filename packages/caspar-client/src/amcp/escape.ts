/**
 * AMCP escape + quote rules, per Phase 5 §3.2.
 *
 * The transport never sees an unquoted user value. Any unescaped quote
 * inside a token would desync the wire framing and force CasparCG to
 * reset the connection. There is exactly one quote function in this
 * package; every command builder MUST route through it.
 */

/**
 * Escape a raw user string so it can be safely placed inside `"..."` on
 * the AMCP wire.
 *
 *   - `\\` → `\\\\` (literal backslash)
 *   - `"`  → `\\"`  (literal quote)
 *   - `\r` → space  (CasparCG would treat as line terminator)
 *   - `\n` → space  (ditto)
 *
 * Note: this **does not** add the surrounding quotes. Use `quote()` for that.
 */
export function escape(s: string): string {
  let out = '';
  for (const ch of s) {
    switch (ch) {
      case '\\':
        out += '\\\\';
        break;
      case '"':
        out += '\\"';
        break;
      case '\r':
      case '\n':
        out += ' ';
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/** Wrap a raw user string in `"..."` with escapes applied. */
export function quote(s: string): string {
  return `"${escape(s)}"`;
}
