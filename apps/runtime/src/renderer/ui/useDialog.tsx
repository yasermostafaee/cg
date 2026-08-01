import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { VerbTone } from './rowAction.js';
import { Modal, ModalAction } from './Modal.js';

/**
 * Promise-shaped replacements for `window.confirm` and `window.prompt`, so a caller keeps
 * reading like the native call it replaces (`if (await confirm({…}))`) and the modal state
 * does not have to be hand-rolled at every site.
 *
 * Each hook returns the dialog element to render. It is `null` until asked for, so a panel
 * that never asks renders nothing.
 */

interface ConfirmRequest {
  title: string;
  body: ReactNode;
  /** The label on the button that DOES the thing — name the act, never "OK". */
  confirmLabel: string;
  /*
    §2 — THERE IS NO `variant` HERE ANY MORE, and its absence is the point.
    Callers used to choose between `danger` and `caution` per dialog ("destructive
    acts are danger; on-air-clearing ones are caution"), which is one distinction
    too many for the operator to read and the reason two confirm dialogs guarding
    comparable acts wore different colours. A confirm dialog's committing button is
    DESTRUCTIVE by definition — this hook exists to gate acts that remove something
    or take it off air — so the role is fixed and the treatment comes from it.
  */
  /**
   * The VERB this dialog is confirming, so its confirm button hovers to the same
   * colour as the button that opened it (`--r-verb-*`).
   *
   * The resting `variant` is untouched and stays the safety signal — a confirm
   * dialog is the one place a destructive control SHOULD read destructive at
   * rest. This only makes the hover match the palette, so the operator's eye
   * follows one colour from the row verb, through the bulk verb, to the button
   * that actually commits.
   */
  tone?: VerbTone;
}

export function useConfirm(): {
  confirm: (req: ConfirmRequest) => Promise<boolean>;
  confirmDialog: JSX.Element | null;
} {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (req: ConfirmRequest): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setRequest(req);
      }),
    [],
  );

  const settle = useCallback((ok: boolean): void => {
    setRequest(null);
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(ok);
  }, []);

  const confirmDialog =
    request === null ? null : (
      <Modal
        title={request.title}
        onClose={() => settle(false)}
        footer={
          <>
            {/* Cancel is first in DOM order, and it is the outcome of Escape, of the
                backdrop and of the header's close X. The safe path is the default path.
                The `cancel` ROLE resolves to `neutral`, never `ghost`: on a confirm
                dialog Cancel is a genuine peer of the destructive action, so it must
                look like a control of the same kind rather than a link beside one. */}
            <ModalAction actionRole="cancel" onClick={() => settle(false)}>
              Cancel
            </ModalAction>
            {/*
              §2 — THE ROLE DECIDES THE TREATMENT, and a confirm dialog's committing
              button is `destructive` by definition: this hook exists to gate acts
              that remove something or take it off air. `Clear all` and `Remove…`
              therefore resolve to ONE treatment instead of the two hues they wore —
              `Clear all` is unchanged (it already had the solid amber) and `Remove`
              moves up to it from the quieter red outline.

              The confirm dialog is the ONE place a destructive control should read
              destructive AT REST, so this is where the signal earns its keep and it
              is deliberately not neutralised.
            */}
            <ModalAction
              actionRole="destructive"
              {...(request.tone !== undefined ? { 'data-verb-tone': request.tone } : {})}
              onClick={() => settle(true)}
            >
              {request.confirmLabel}
            </ModalAction>
          </>
        }
      >
        {request.body}
      </Modal>
    );

  return { confirm, confirmDialog };
}

interface PromptRequest {
  title: string;
  body?: ReactNode;
  label: string;
  submitLabel: string;
  type?: 'text' | 'password';
  /** Submit stays disabled until the value is this long — the rule is shown, not silent. */
  minLength?: number;
}

export function usePrompt(): {
  prompt: (req: PromptRequest) => Promise<string | null>;
  promptDialog: JSX.Element | null;
} {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<((value: string | null) => void) | null>(null);

  const prompt = useCallback(
    (req: PromptRequest): Promise<string | null> =>
      new Promise<string | null>((resolve) => {
        resolver.current = resolve;
        setValue('');
        setRequest(req);
      }),
    [],
  );

  const settle = useCallback((result: string | null): void => {
    setRequest(null);
    setValue('');
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(result);
  }, []);

  const tooShort = request !== null && value.length < (request.minLength ?? 1);

  const promptDialog =
    request === null ? null : (
      <Modal
        title={request.title}
        onClose={() => settle(null)}
        footer={
          <>
            {/* The same two roles as the confirm dialog — Cancel is a peer of Submit,
                and Submit is the action this dialog exists to perform. */}
            <ModalAction actionRole="cancel" onClick={() => settle(null)}>
              Cancel
            </ModalAction>
            <ModalAction actionRole="primary" disabled={tooShort} onClick={() => settle(value)}>
              {request.submitLabel}
            </ModalAction>
          </>
        }
      >
        {request.body}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {request.label}
          <input
            className="cg-field"
            type={request.type ?? 'text'}
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // Enter submits, but never past the length rule — the native prompt let a
              // too-short PIN through and the caller silently dropped it.
              if (e.key === 'Enter' && !tooShort) settle(value);
            }}
          />
        </label>
      </Modal>
    );

  return { prompt, promptDialog };
}
