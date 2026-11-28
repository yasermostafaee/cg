import { feedback, localeDirection, useLanguages, useUiText } from '../../i18n/locale.js';
import { playoutEngineWording, useEngineName } from '../../ui/engineWording.js';
import { useId, useRef, useState } from 'react';
import type { StackItemState } from '@cg/shared-schema';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { errorCodeMessage } from '../../ui/errorCodeMessage.js';
import { OperatorNames } from '../../ui/OperatorNames.js';
import type { OperatorRowName } from '../../ui/operatorNaming.js';
import { Popover } from '../../ui/Popover.js';
import { isRowError } from '../stack/onAir.js';
import { takeRefusalLine } from './takeRefusalLine.js';

interface RowErrorsBadgeProps {
  /** The view's items (already this channel's). */
  items: readonly StackItemState[];
  /** A row's name in the operator's words (`operatorRowName`, from the panel that holds its inputs). */
  nameOf: (item: StackItemState) => OperatorRowName;
}

/**
 * 🔴 `B-301` (`CONSOLE-POLISH-01` §2) — **THE LAYERS BADGE COUNTS CURRENT ROW ERRORS, LISTS THEM, AND
 * EACH CAN BE DISMISSED.**
 *
 * The owner's station read `2 in error` and never cleared, on a station with no error on any row: the
 * badge counted every item in `error` in the view, and the two it counted were what two refused Loads
 * had left behind — layerless, so no row showed them and nothing could settle them. It counts ROWS now
 * ({@link isRowError}: in `error`, with a layer) and drops the moment they are gone; a failed import is
 * said once, in the picker, and is never an item at all.
 *
 * Pressing it lists the rows — each by its name in the operator's words and its LAYER (golden rule 11:
 * the layer number stays where a row is named in a sentence), with the error's reason in words — and
 * each can be DISMISSED: the bridge drops the error ack, the row reads the status it settled to, and
 * every console is told. Nothing is sent to CasparCG.
 */
export function RowErrorsBadge({ items, nameOf }: RowErrorsBadgeProps): JSX.Element | null {
  const errors = items.filter(isRowError);
  // Once the list is empty, unmount the popover state so the next error starts closed.
  return errors.length === 0 ? null : <ErrorsTally items={errors} nameOf={nameOf} />;
}

function ErrorsTally({ items: errors, nameOf }: RowErrorsBadgeProps): JSX.Element {
  const localizeUi = useUiText();
  const feedbackDirection = localeDirection(useLanguages().feedback);
  const engineName = useEngineName();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const id = useId();
  const count = String(errors.length);
  return (
    <>
      <Button
        ref={anchor}
        className="cg-layers-subbar__error"
        data-layers-tally-error=""
        data-error-tally={count}
        aria-label={localizeUi('{count} rows in error', { count: count })}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={localizeUi(
          '{count} in error — rows whose last command was refused. Press to list them.',
          { count: count },
        )}
        onClick={() => setOpen((o) => !o)}
      >
        {count} {localizeUi('in error')}
      </Button>
      {open && (
        <Popover
          anchor={anchor}
          onClose={() => setOpen(false)}
          id={id}
          aria-label={localizeUi('Rows in error')}
          minWidth={380}
          maxHeight={360}
        >
          <ul className="cg-row-errors" data-row-errors="">
            {errors.map((item) => {
              const name = nameOf(item);
              const why = reasonOf(item, name.names.join(' · '), engineName);
              return (
                <li key={item.itemId} className="cg-row-errors__row" data-row-error={item.itemId}>
                  <span className="cg-row-errors__name" title={name.title}>
                    <OperatorNames name={name} />
                    {/* Golden rule 11 — the real coordinate, from the one composition. */}
                    {name.layer !== null && ` · ${name.layer}`}
                  </span>
                  <span className="cg-row-errors__why" data-row-error-why="">
                    <bdi dir={feedbackDirection}>{why}</bdi>
                  </span>
                  <AsyncButton
                    variant="neutral"
                    data-row-error-dismiss=""
                    run={() => window.cg.stack.dismissError({ itemId: item.itemId })}
                  >
                    {localizeUi('Dismiss')}
                  </AsyncButton>
                </li>
              );
            })}
          </ul>
        </Popover>
      )}
    </>
  );
}

/** The error's reason in words: the row's refusal sentence when it has one, else its code's. */
function reasonOf(item: StackItemState, rowName: string, engineName: string): string {
  if (item.takeRefusal !== undefined)
    return takeRefusalLine(rowName, item.takeRefusal, { engineName }).clause;
  return playoutEngineWording(
    errorCodeMessage(item.errorCode, feedback) ?? feedback('The last command was refused.'),
    engineName,
  );
}
