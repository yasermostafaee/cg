/**
 * `@cg/gesture` — B-140.
 *
 * ONE headless pointer-drag gesture, shared by the Runtime's `ShellDivider` and
 * the Designer's `Splitter` — and (`TEXT-DIGITS-01`) the ONE keyboard-language
 * detector both apps' editors ask. Behaviour only: no styles, no tokens, no markup,
 * so `@cg/ui` stays tokens-only and components stay app-local.
 */
export { useDragGesture, type DragGesture, type DragGestureOptions } from './useDragGesture.js';
export { mountShield, type Shield } from './shield.js';
// `TEXT-DIGITS-01` — the one keyboard-language detector both apps' editors ask.
export {
  createKeyboardLanguage,
  type KeyboardLanguageDetector,
  type KeyboardLanguageOptions,
} from './keyboardLanguage.js';
// `TEXT-DIGITS-01` — what every editor writes when text is entered: its choice, the caret kept.
export { enteredBy, writeDigitsInto, writeDigitsIntoEditable } from './enteredDigits.js';
