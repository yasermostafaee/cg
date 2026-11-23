import { useState } from 'react';
import { useShellLayoutContext } from '../../hooks/shellLayoutContext.js';
import { WORKSPACE_PROFILE_NAME_MAX, type WorkspacePositions } from '../../hooks/useShellLayout.js';
import { useUiText } from '../../i18n/locale.js';
import { Button } from '../../ui/Button.js';
import { SelectInput } from '../../ui/SelectInput.js';
import { TextInput } from '../../ui/TextInput.js';

const placementFields = [
  {
    key: 'monitorOrder',
    label: 'Monitor order',
    options: [
      ['pvw-first', 'PVW on the left'],
      ['pgm-first', 'PGM on the left'],
    ],
  },
  {
    key: 'layerPosition',
    label: 'Layers position',
    options: [
      ['below', 'Below monitors'],
      ['above', 'Above monitors'],
    ],
  },
  {
    key: 'inspectorSide',
    label: 'Inspector position',
    options: [
      ['right', 'Right'],
      ['left', 'Left'],
    ],
  },
] as const satisfies readonly {
  key: keyof WorkspacePositions;
  label: string;
  options: readonly [WorkspacePositions[keyof WorkspacePositions], string][];
}[];

export function WorkspaceSettings(): JSX.Element {
  const t = useUiText();
  const { positions, setPositions, uiProfiles, saveProfile, loadProfile, deleteProfile } =
    useShellLayoutContext();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const trimmed = name.trim();
  const replacing = uiProfiles.some((profile) => profile.name === trimmed);
  const active = uiProfiles.find((profile) => profile.name === selected);

  const save = (): void => {
    if (trimmed === '') return;
    saveProfile(trimmed);
    setSelected(trimmed);
  };

  return (
    <>
      <section className="cg-card" aria-label={t('Workspace')}>
        <div className="cg-card__head">
          <span className="cg-card__title">{t('Workspace')}</span>
        </div>
        <div className="cg-card__body">
          <div className="cg-setup-fields cg-setup-fields--three">
            {placementFields.map(({ key, label, options }) => (
              <label className="cg-setup-field" key={key}>
                <span className="cg-setup-field__label">{t(label)}</span>
                <SelectInput
                  value={positions[key]}
                  onChange={(event) => {
                    const choice = options.find(([value]) => value === event.currentTarget.value);
                    if (choice !== undefined) setPositions({ [key]: choice[0] });
                  }}
                >
                  {options.map(([value, text]) => (
                    <option key={value} value={value}>
                      {t(text)}
                    </option>
                  ))}
                </SelectInput>
              </label>
            ))}
          </div>
        </div>
      </section>
      <section className="cg-card" aria-label={t('UI profiles')}>
        <div className="cg-card__head">
          <span className="cg-card__title">{t('UI profiles')}</span>
        </div>
        <div className="cg-card__body">
          <div className="cg-setup-fields">
            <label className="cg-setup-field">
              <span className="cg-setup-field__label">{t('Profile name')}</span>
              <TextInput
                value={name}
                onChange={setName}
                maxLength={WORKSPACE_PROFILE_NAME_MAX}
                dir="auto"
              />
            </label>
            <label className="cg-setup-field">
              <span className="cg-setup-field__label">{t('Saved UI profile')}</span>
              <SelectInput
                value={active?.name ?? ''}
                onChange={(event) => setSelected(event.currentTarget.value)}
              >
                <option value="">{t('Choose a profile')}</option>
                {uiProfiles.map((profile) => (
                  <option key={profile.name} value={profile.name} dir="auto">
                    {profile.name}
                  </option>
                ))}
              </SelectInput>
            </label>
            <div className="cg-setup-foot-actions cg-setup-field--full cg-workspace-profile-actions">
              <Button variant="neutral" disabled={trimmed === ''} onClick={save}>
                {t(replacing ? 'Update profile' : 'Save profile')}
              </Button>
              <Button
                variant="neutral"
                disabled={active === undefined}
                onClick={() => {
                  if (active === undefined) return;
                  loadProfile(active.name);
                  setName(active.name);
                }}
              >
                {t('Load profile')}
              </Button>
              <Button
                variant="neutral"
                disabled={active === undefined}
                onClick={() => {
                  if (active === undefined) return;
                  deleteProfile(active.name);
                  setSelected('');
                }}
              >
                {t('Delete profile')}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
