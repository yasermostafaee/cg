import { useRef } from 'react';
import { Languages } from 'lucide-react';
import {
  CONTROL_LOCALES,
  languageFile,
  normalizeLocale,
  readLanguageFile,
  resetLanguageFile,
  setLanguage,
  useLanguages,
  useUiText,
  useFeedbackText,
  type Locale,
} from '../../i18n/locale.js';
import { Button } from '../../ui/Button.js';
import { FileInput } from '../../ui/FileInput.js';
import { Icon } from '../../ui/Icon.js';
import type { ModalMessage } from '../../ui/Modal.js';
import { SelectInput } from '../../ui/SelectInput.js';
import { saveFile } from '../../ui/saveFile.js';
import { useState } from 'react';

const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fa: 'فارسی', ar: 'العربية' };

export function LanguageSettings({
  report,
}: {
  report: (message: ModalMessage | null) => void;
}): JSX.Element {
  const t = useUiText();
  const message = useFeedbackText();
  const languages = useLanguages();
  const input = useRef<HTMLInputElement>(null);
  const [fileLocale, setFileLocale] = useState<Locale>('fa');

  const importFile = async (file: File): Promise<void> => {
    try {
      if (file.size > 2_000_000 || !readLanguageFile(await file.text())) {
        report({
          role: 'refusal',
          text: message(
            'The language file is invalid. Keep its keys and placeholders when editing.',
          ),
        });
        return;
      }
      report({ role: 'notice', text: message('Language file applied.') });
    } catch {
      report({ role: 'refusal', text: message('The language file could not be read.') });
    }
  };

  const exportFile = async (): Promise<void> => {
    try {
      const contents = new Blob([languageFile(fileLocale)], { type: 'application/json' });
      const result = await saveFile(
        contents,
        `cg-control-${fileLocale}.json`,
        t('CG Control language file'),
        '.json',
      );
      if (result.kind === 'saved') {
        report({ role: 'notice', text: message('Language file saved.') });
      }
    } catch {
      report({ role: 'refusal', text: message('The language file could not be saved.') });
    }
  };

  return (
    <section className="cg-card" aria-label={t('Language')}>
      <div className="cg-card__head">
        <Icon icon={Languages} size={16} />
        <span className="cg-card__title">{t('Language')}</span>
      </div>
      <div className="cg-card__body">
        <div className="cg-setup-field">
          <label htmlFor="cg-interface-language">{t('Interface language')}</label>
          <SelectInput
            id="cg-interface-language"
            value={languages.interface}
            onChange={(event) => setLanguage('interface', normalizeLocale(event.target.value))}
          >
            {CONTROL_LOCALES.map((locale) => (
              <option key={locale} value={locale} lang={locale}>
                {LOCALE_NAMES[locale]}
              </option>
            ))}
          </SelectInput>
        </div>
        <div className="cg-setup-field">
          <label htmlFor="cg-feedback-language">{t('Action feedback language')}</label>
          <SelectInput
            id="cg-feedback-language"
            value={languages.feedback}
            onChange={(event) => setLanguage('feedback', normalizeLocale(event.target.value))}
          >
            {CONTROL_LOCALES.map((locale) => (
              <option key={locale} value={locale} lang={locale}>
                {LOCALE_NAMES[locale]}
              </option>
            ))}
          </SelectInput>
        </div>
        <div className="cg-setup-field">
          <label htmlFor="cg-language-file">{t('Language file')}</label>
          <SelectInput
            id="cg-language-file"
            value={fileLocale}
            onChange={(event) => setFileLocale(normalizeLocale(event.target.value))}
          >
            {CONTROL_LOCALES.map((locale) => (
              <option key={locale} value={locale} lang={locale}>
                {LOCALE_NAMES[locale]}
              </option>
            ))}
          </SelectInput>
        </div>
        <div className="cg-setup-foot-actions">
          <Button onClick={() => void exportFile()}>{t('Export language file')}</Button>
          <Button onClick={() => input.current?.click()}>{t('Import language file')}</Button>
          <Button
            disabled={languages.overrides[fileLocale] === undefined}
            onClick={() => {
              resetLanguageFile(fileLocale);
              report({ role: 'notice', text: message('Built-in language file restored.') });
            }}
          >
            {t('Restore built-in translations')}
          </Button>
          <FileInput
            ref={input}
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file !== undefined) void importFile(file);
            }}
          />
        </div>
      </div>
    </section>
  );
}
