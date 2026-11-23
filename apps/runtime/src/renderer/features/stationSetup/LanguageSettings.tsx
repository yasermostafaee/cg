import { Languages } from 'lucide-react';
import {
  CONTROL_LOCALES,
  normalizeLocale,
  setLanguage,
  useLanguages,
  useUiText,
  type Locale,
} from '../../i18n/locale.js';
import { Icon } from '../../ui/Icon.js';
import { SelectInput } from '../../ui/SelectInput.js';

const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fa: 'فارسی', ar: 'العربية' };
const LANGUAGE_FIELDS = [
  { scope: 'interface', id: 'cg-interface-language', label: 'Interface language' },
  { scope: 'feedback', id: 'cg-feedback-language', label: 'Action feedback language' },
] as const;

export function LanguageSettings(): JSX.Element {
  const t = useUiText();
  const languages = useLanguages();

  return (
    <section className="cg-card" aria-label={t('Language')}>
      <div className="cg-card__head">
        <Icon icon={Languages} size={16} />
        <span className="cg-card__title">{t('Language')}</span>
      </div>
      <div className="cg-card__body">
        {LANGUAGE_FIELDS.map(({ scope, id, label }) => (
          <div className="cg-setup-field" key={scope}>
            <label htmlFor={id}>{t(label)}</label>
            <SelectInput
              id={id}
              value={languages[scope]}
              onChange={(event) => setLanguage(scope, normalizeLocale(event.target.value))}
            >
              {CONTROL_LOCALES.map((locale) => (
                <option key={locale} value={locale} lang={locale}>
                  {LOCALE_NAMES[locale]}
                </option>
              ))}
            </SelectInput>
          </div>
        ))}
      </div>
    </section>
  );
}
