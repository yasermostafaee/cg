/**
 * `@cg/gesture` — B-140.
 *
 * ONE headless pointer-drag gesture, shared by the Runtime's `ShellDivider` and
 * the Designer's `Splitter` — and (`TEXT-DIGITS-01`) the ONE keyboard-language
 * detector both apps' editors ask, (`B-319`) the ONE action-row fit both apps'
 * dialog footers are watched with, and (`D-162` / `R-094`) the JS half of the desktop
 * shells' close guard. Behaviour only: no styles, no tokens, no markup,
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
// `B-319` — the one dialog-footer fit both apps' modal primitives watch their action row with.
export {
  ACTION_ROW_STACKED,
  fitActionRow,
  rowDoesNotFit,
  spillsOut,
  useActionRowFit,
  watchActionRow,
  type Extent,
  type ItemFit,
} from './actionRowFit.js';
// `D-162` / `R-094` — the window's close, held by a desktop shell for the page to answer.
export {
  CLOSE_REQUESTED_EVENT,
  closeGuardDoor,
  type CloseGuardDoor,
  type ShellInvoke,
} from './closeGuard.js';
