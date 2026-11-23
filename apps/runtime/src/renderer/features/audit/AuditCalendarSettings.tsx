import { CalendarDays } from 'lucide-react';
import { CALENDAR_LABELS, CALENDAR_SYSTEMS, isCalendarSystem } from '@cg/text-shaping';
import { useUiText } from '../../i18n/locale.js';
import { Icon } from '../../ui/Icon.js';
import { SelectInput } from '../../ui/SelectInput.js';
import { setAuditCalendar, useAuditCalendar } from './auditCalendarChoice.js';

export function AuditCalendarSettings(): JSX.Element {
  const t = useUiText();
  const calendar = useAuditCalendar();
  return (
    <section className="cg-card" aria-label={t('Audit log calendar')}>
      <div className="cg-card__head">
        <Icon icon={CalendarDays} size={16} />
        <span className="cg-card__title">{t('Audit log calendar')}</span>
      </div>
      <div className="cg-card__body">
        <div className="cg-setup-field">
          <label htmlFor="cg-audit-calendar">{t('Date calendar')}</label>
          <SelectInput
            id="cg-audit-calendar"
            value={calendar}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (isCalendarSystem(next)) setAuditCalendar(next);
            }}
          >
            {CALENDAR_SYSTEMS.map((system) => (
              <option key={system} value={system}>
                {t(CALENDAR_LABELS[system])}
              </option>
            ))}
          </SelectInput>
        </div>
      </div>
    </section>
  );
}
