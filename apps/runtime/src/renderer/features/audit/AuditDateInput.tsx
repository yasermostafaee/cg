import { useEffect, useState } from 'react';
import type { CalendarDay } from '@cg/text-shaping';
import { useLanguages, useUiText } from '../../i18n/locale.js';
import { DatePickerButton } from '../../ui/DateTimeInput.js';
import { TextInput } from '../../ui/TextInput.js';
import {
  auditCalendarDate,
  auditCalendarDay,
  auditFilterDate,
  type AuditCalendarFormat,
} from './auditFormat.js';

interface Props {
  id: string;
  label: string;
  pickerLabel: string;
  value: string;
  format: AuditCalendarFormat;
  invalid: boolean;
  onChange: (value: string) => void;
  onInvalidChange: (invalid: boolean) => void;
}

export function AuditDateInput({
  id,
  label,
  pickerLabel,
  value,
  format,
  invalid,
  onChange,
  onInvalidChange,
}: Props): JSX.Element {
  const t = useUiText();
  const { interface: locale } = useLanguages();
  const [draft, setDraft] = useState<string | null>(null);
  const { calendar, lunarAdjust, digits } = format;
  const shown = auditCalendarDate(value, format).replaceAll('-', '/');
  const text = draft ?? shown;

  useEffect(() => {
    setDraft(null);
    onInvalidChange(false);
  }, [calendar, lunarAdjust, value, onInvalidChange]);

  const read = (next: string): void => {
    const empty = next.trim() === '';
    const parsed = empty ? '' : auditFilterDate(next, format);
    setDraft(parsed === null ? next : null);
    onInvalidChange(parsed === null);
    if (parsed !== null) onChange(parsed);
  };

  const pick = ({ year, month, day }: CalendarDay): void => {
    read(
      [
        String(year).padStart(4, '0'),
        String(month).padStart(2, '0'),
        String(day).padStart(2, '0'),
      ].join('/'),
    );
  };

  return (
    <div className="cg-datetime__entry" data-audit-date-calendar={calendar}>
      <TextInput
        id={id}
        value={text}
        onChange={read}
        placeholder={t('YYYY/MM/DD')}
        aria-label={label}
        invalid={invalid}
        autoComplete="off"
        maxLength={10}
        dir="ltr"
      />
      <DatePickerButton
        key={calendar}
        calendar={calendar}
        parts={auditCalendarDay(value, format) ?? {}}
        lunarAdjust={lunarAdjust}
        shown={digits}
        now={Date.now}
        label={pickerLabel}
        locale={locale}
        onPick={pick}
      />
    </div>
  );
}
