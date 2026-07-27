/**
 * A promise-shaped file picker over a hidden `<input type="file">` — so a
 * one-ACTION chain that begins with "pick a file" can be ONE `RowAction`
 * (`run: () => Promise<AsyncResult>`) instead of a button that fires and a
 * `change` handler that finishes the work somewhere else.
 *
 * That matters beyond tidiness: the row's declaration point (`rowAction.ts`)
 * makes a button and its context-menu twin share gate, handler and wording by
 * construction. An affordance whose real work lived in an `onChange` would be a
 * second, undeclared path — exactly the drift that pattern exists to prevent.
 *
 * Cancellation rides the input's own `cancel` event (baseline since 2023 in
 * every browser this SPA supports). It is what keeps the caller's button from
 * sitting BUSY forever when the operator dismisses the OS dialog: without it
 * the promise would simply never settle. A cancel resolves `null`, which the
 * caller reports as the operator's own "no" — never as a failure.
 */
export function pickFile(input: HTMLInputElement): Promise<File | null> {
  return new Promise<File | null>((resolve) => {
    const settle = (file: File | null): void => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      // Reset so re-picking the SAME file fires `change` again.
      input.value = '';
      resolve(file);
    };
    function onChange(): void {
      settle(input.files?.[0] ?? null);
    }
    function onCancel(): void {
      settle(null);
    }
    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    input.click();
  });
}
