import { useState } from 'react';
import { parseLocalizedNumber } from '@cg/text-shaping';
import { Button } from '../../ui/Button.js';
import { Notice } from '../../ui/Notice.js';
import { TextInput } from '../../ui/TextInput.js';
import type { RowBook } from '../layers/bookOf.js';

/**
 * `R-100` — **TURN THE ROW'S BOOK**: where the reader is (`12 / 300`), Previous, Next, and a page
 * box that takes the operator's page number in Latin, Persian or Arabic-Indic digits. Every press is
 * one `stack.page`; the bridge owns the number and answers it, so the counter always reads what the
 * bridge holds. On a row with nothing on its layer a turn changes the number only (golden rule 10).
 * One line (`.cg-book-row`): the page box is sized to a page number, so Go stays beside it.
 */

export function BookBar({ itemId, book }: { itemId: string; book: RowBook }): JSX.Element {
  const [typed, setTyped] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function turn(to: 'next' | 'previous' | number): Promise<void> {
    setBusy(true);
    try {
      const r = await window.cg.stack.page({ itemId, field: book.fieldId, to });
      setRefusal(
        r.accepted ? null : (r.message ?? `The page did not turn (${r.errorCode ?? 'refused'}).`),
      );
    } finally {
      setBusy(false);
    }
  }

  const target = parseLocalizedNumber(typed.trim());
  const goable = target !== null && Number.isInteger(target) && target >= 1;
  const none = book.count === 0;

  return (
    <div data-book-bar="">
      <div className="cg-book-row">
        <span className="cg-book-count" data-testid="book-counter">
          {none ? '0 / 0' : `${String(book.page)} / ${String(book.count)}`}
        </span>
        <Button
          variant="neutral"
          aria-label="Previous page"
          disabled={busy || none || (!book.wrap && book.page <= 1)}
          onClick={() => void turn('previous')}
        >
          Previous
        </Button>
        <Button
          variant="neutral"
          aria-label="Next page"
          disabled={busy || none || (!book.wrap && book.page >= book.count)}
          onClick={() => void turn('next')}
        >
          Next
        </Button>
        <TextInput
          className="cg-book-page"
          value={typed}
          onChange={setTyped}
          inputMode="numeric"
          aria-label="Page number"
          placeholder="Page"
          disabled={busy || none}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && goable && target !== null) void turn(target);
          }}
        />
        <Button
          variant="neutral"
          aria-label="Go to page"
          disabled={busy || none || !goable}
          onClick={() => {
            if (target !== null) void turn(target);
          }}
        >
          Go
        </Button>
      </div>
      {refusal !== null && <Notice noticeRole="refusal" text={refusal} />}
    </div>
  );
}
