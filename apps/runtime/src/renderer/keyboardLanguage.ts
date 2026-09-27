import { createKeyboardLanguage, type KeyboardLanguageDetector } from '@cg/gesture';
import type { KeyboardLanguage } from '@cg/text-shaping';

/**
 * `TEXT-DIGITS-01` — CG Control's ONE keyboard-language detector (`@cg/gesture`), started once at
 * boot. Every field that writes a Keyboard digit asks {@link keyboardLanguage} at that moment and
 * reads the keyboard nowhere else.
 */
let detector: KeyboardLanguageDetector | null = null;

/** Start the detector on `doc`, with the shell's report when there is a shell. Returns the teardown. */
export function startKeyboardLanguage(
  doc: Document,
  native: (() => Promise<unknown>) | null,
): () => void {
  detector = createKeyboardLanguage(native === null ? {} : { native });
  return detector.attach(doc);
}

/** The keyboard language a digit typed now is written in; `unknown` before the detector starts. */
export function keyboardLanguage(): KeyboardLanguage {
  return detector?.current() ?? 'unknown';
}
