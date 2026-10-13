import { useState } from 'react';
import { normalizeDigits } from '../../ui/NumericInput.js';
import { Notice } from '../../ui/Notice.js';
import { DialogField, RecordDialog } from '../../ui/RecordDialog.js';

/** The floor the bridge and this form agree on. Below it, a PIN is not a PIN. */
export const MIN_LOCK_PIN = 4;

/**
 * 🔴 `STATION-CHROME-01` §7 — **ENGAGING THE LOCK ASKS FOR THE PIN TWICE.**
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 *
 * The lock refuses EVERYTHING while engaged — emergency verbs included, which is the
 * decided carve-out and stays — and the ONLY way out is the PIN. So a mistyped PIN locks the
 * operator out of a live console, and nothing caught the typo: one field, one press, and the
 * value that was typed became the value that must be re-typed. There is no reset, no
 * override and no back door, by design. This is the one form in the app where a single
 * keystroke error is unrecoverable, which is exactly why it is the one form that confirms.
 *
 * So: two fields, and the lock is REFUSED unless they match. It costs one extra field once,
 * and it removes a failure whose remedy is restarting the bridge process.
 *
 * ── WHERE IT LIVES, AND WHY THAT DID NOT CHANGE ─────────────────────────────
 *
 * On the STATUS BAR, not in Station setup. The owner's criterion: a PIN which is set fresh at
 * every engage belongs where the engage is. That was verified against the bridge rather than
 * assumed — `#lockPin` is a private in-memory field on `CasparRuntime`, written on engage,
 * nulled on release, and no store writes it. It is EPHEMERAL, so there is no stored setting
 * for a settings page to hold.
 *
 * ── WHAT THE COPY HAS TO SAY, AND WHY EACH LINE IS THERE ────────────────────
 *
 * The operator is about to disable his own console. He is told, before he does it, that the
 * lock refuses everything including Clear and Stop, that the way out is to unlock, and that
 * the PIN is not stored anywhere — it lives only in this bridge process, so a bridge restart
 * is what happens if it is lost. None of that is discoverable afterwards.
 */
export function EngageLockDialog({
  onCancel,
  onEngage,
}: {
  onCancel: () => void;
  /** The confirmed PIN, already digit-normalised. */
  onEngage: (pin: string) => void;
}): JSX.Element {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');

  return (
    <RecordDialog
      title="Engage lock"
      confirmLabel="Lock"
      layer="base"
      onCancel={onCancel}
      onSubmit={() => {
        /*
          R-020 — digits normalize to Latin BEFORE the two are compared AND before the PIN is
          stored, and `LockOverlay` normalizes the release PIN the same way. Comparing the RAW
          strings would refuse a PIN typed `۱۲۳۴` in one field and `1234` in the other, which
          are the same number to everyone except a byte comparison.
        */
        const first = normalizeDigits(pin);
        const second = normalizeDigits(again);
        if (first.length < MIN_LOCK_PIN) {
          return `The PIN must be at least ${String(MIN_LOCK_PIN)} characters.`;
        }
        if (first !== second) {
          return 'The two PINs are different. Type the same one twice — a PIN you mistype is a PIN you cannot use to get back in.';
        }
        onEngage(first);
        return null;
      }}
    >
      <DialogField label="PIN">
        <input
          className="cg-field"
          type="password"
          value={pin}
          aria-label={`Lock PIN (${String(MIN_LOCK_PIN)}–64 characters)`}
          autoComplete="off"
          data-modal-autofocus=""
          onChange={(e) => setPin(e.target.value)}
        />
      </DialogField>
      <DialogField
        label="PIN again"
        hint="Asked twice on purpose — a PIN you mistype is a PIN you cannot use to get back in."
      >
        <input
          className="cg-field"
          type="password"
          value={again}
          aria-label="Lock PIN again"
          autoComplete="off"
          onChange={(e) => setAgain(e.target.value)}
        />
      </DialogField>
      {/*
        `refusal` role — the AMBER advisory, never the red. Nothing has gone wrong; this is
        what is about to happen, said before it does.
      */}
      <Notice
        noticeRole="refusal"
        aria="note"
        text="While locked the console refuses everything, including Clear and Stop. The way out is to unlock. The PIN is not stored — it lives only in this bridge process."
      />
    </RecordDialog>
  );
}
