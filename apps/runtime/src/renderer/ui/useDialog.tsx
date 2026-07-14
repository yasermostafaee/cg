import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button.js';
import { Modal } from './Modal.js';

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
  /** Destructive acts are `danger`; on-air-clearing ones are `caution`. */
  variant?: ButtonVariant;
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
            {/* Cancel is first: it takes the modal's initial focus, and it is the outcome
                of Escape and of a backdrop click. The safe path is the default path. */}
            <Button variant="ghost" onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button variant={request.variant ?? 'danger'} onClick={() => settle(true)}>
              {request.confirmLabel}
            </Button>
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
            <Button variant="ghost" onClick={() => settle(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={tooShort} onClick={() => settle(value)}>
              {request.submitLabel}
            </Button>
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
