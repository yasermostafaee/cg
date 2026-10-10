import type { KeyboardEvent, ReactNode } from 'react';
import { hostValue } from '../../ui/fieldValue.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { TextInput } from '../../ui/TextInput.js';
import {
  BRIDGE_PORT_DEFAULT,
  PLAYOUT_PORT_DEFAULT,
  hostFieldChange,
  hostFieldError,
  playoutAddressOf,
  playoutHostOf,
  portFieldError,
  type HostPort,
  type StationFields,
} from './stationFields.js';

/**
 * 🔴 `SERVERS-SIMPLIFY-01` (T1, T5) — **THE ONE SET OF ADDRESS FIELDS**: the Playout's `Host` and `Port`, and
 * CG Bridge's `Host` and `Port` for a CG Bridge that is not on the Playout's machine. Rendered by the Set up
 * page (`PlayoutAddressGate`) and by the Connection card (`PlayoutConnection`), so the two ask the same
 * question, the same way, under the same rule (`stationFields.ts`).
 *
 * Every default is a PLACEHOLDER: the Playout's port `8080`, CG Bridge's host (the Playout's own) and port
 * `5280`. An empty field is the default. A whole address pasted into a `Host` fills both of its fields.
 *
 * Pure: it renders what it is handed and reports every change; it reaches no bridge. The Set up page renders it
 * before the console has one (`main.tsx`).
 *
 * ⚠ The element ids are the ones the address fields have always had (`cg-playout-address`,
 * `cg-bridge-address`): the installed apps' acceptance drives them by id, and an id is not an operator's word.
 */

/** `R-080` — the CG Bridge host field while there is no Playout host to show in it: nothing to type, it is found. */
export const BRIDGE_ADDRESS_PLACEHOLDER = 'Found automatically';
/** `R-080` — the CG Bridge fields' one hint line (`CONSOLE-POLISH-01` §5, the owner's words). */
export const BRIDGE_ADDRESS_HINT = 'Leave empty unless CG Bridge runs on a separate server.';

/** One labelled control, its label above it and the sentence it is wrong by under it (Station setup's `.field`). */
function Field({
  label,
  error,
  errorId,
  children,
}: {
  label: string;
  error: string | null;
  errorId: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="cg-setup-field">
      <span className="cg-setup-field__label" aria-hidden="true">
        {label}
      </span>
      {children}
      {error !== null && (
        <p className="cg-setup-field__error" id={errorId} data-field-error="">
          {error}
        </p>
      )}
    </div>
  );
}

/** A `Host` + `Port` pair: one address. */
function HostPortFields({
  name,
  idRoot,
  value,
  onChange,
  hostPlaceholder,
  portPlaceholder,
  disabled,
  onKeyDown,
  describedBy,
  web,
}: {
  /** The address's name in the operator's words — `Playout`, `CG Bridge` — for each control's accessible name. */
  name: string;
  /** A web address (the Playout's): a pasted `http://…` fills both fields. CG Bridge's never has a scheme. */
  web: boolean;
  idRoot: string;
  value: HostPort;
  onChange: (next: HostPort) => void;
  hostPlaceholder?: string | undefined;
  portPlaceholder: string;
  disabled: boolean;
  onKeyDown: ((e: KeyboardEvent<HTMLInputElement>) => void) | undefined;
  describedBy?: string | undefined;
}): JSX.Element {
  const hostBad = hostFieldError(value.host);
  const portBad = portFieldError(value.port);
  const hostErrorId = `${idRoot}-host-error`;
  const portErrorId = `${idRoot}-port-error`;
  const describe = (own: string | null, id: string): string | undefined =>
    [own === null ? null : id, describedBy ?? null].filter((x) => x !== null).join(' ') ||
    undefined;
  return (
    <div className="cg-setup-fields cg-setup-fields--host-port">
      <Field label="Host" error={hostBad} errorId={hostErrorId}>
        {/* An address is not prose: LTR is a statement about the CONTENT (golden rule 4). */}
        <TextInput
          id={`${idRoot}-address`}
          className="cg-field--mono"
          value={value.host}
          onChange={(v) => onChange(hostFieldChange(value, hostValue(v), web))}
          placeholder={hostPlaceholder}
          dir="ltr"
          autoComplete="off"
          aria-label={`${name} host`}
          aria-describedby={describe(hostBad, hostErrorId)}
          invalid={hostBad !== null}
          disabled={disabled}
          onKeyDown={onKeyDown}
        />
      </Field>
      <Field label="Port" error={portBad} errorId={portErrorId}>
        <NumericInput
          id={`${idRoot}-port`}
          className="cg-field cg-field--mono"
          dir="ltr"
          allow="digits"
          autoComplete="off"
          aria-label={`${name} port`}
          aria-describedby={describe(portBad, portErrorId)}
          aria-invalid={portBad !== null ? true : undefined}
          placeholder={portPlaceholder}
          value={value.port}
          onValueChange={(port) => onChange({ ...value, port })}
          disabled={disabled}
          onKeyDown={onKeyDown}
        />
      </Field>
    </div>
  );
}

export function StationAddressFields({
  value,
  onChange,
  show = { playout: true, bridge: true },
  disabled = false,
  onEnter,
  hint = false,
  statusId,
}: {
  value: StationFields;
  onChange: (next: StationFields) => void;
  /** Which of the two addresses are being asked: both, or CG Bridge's alone (the card's CG Bridge `Change`). */
  show?: { readonly playout: boolean; readonly bridge: boolean } | undefined;
  disabled?: boolean | undefined;
  /** Enter in any field. */
  onEnter?: (() => void) | undefined;
  /** `R-080` — the one hint line under CG Bridge's fields (the Set up page; the card states it as a tag). */
  hint?: boolean | undefined;
  /** The id of the surface's own status line, which describes every field (the Set up page's). */
  statusId?: string | undefined;
}): JSX.Element {
  // CG Bridge is on the Playout's host unless a person says otherwise: so that host IS its placeholder.
  const playoutHost = playoutHostOf(playoutAddressOf(value.playout));
  const onKeyDown =
    onEnter === undefined
      ? undefined
      : (e: KeyboardEvent<HTMLInputElement>): void => {
          if (e.key === 'Enter') onEnter();
        };
  return (
    <div className="cg-station-fields" data-station-fields="">
      {show.playout && (
        <div className="cg-station-fields__group" role="group" aria-label="Playout address">
          <span className="cg-station-fields__name" aria-hidden="true">
            Playout address
          </span>
          <HostPortFields
            name="Playout"
            web
            idRoot="cg-playout"
            value={value.playout}
            onChange={(playout) => onChange({ ...value, playout })}
            portPlaceholder={PLAYOUT_PORT_DEFAULT}
            disabled={disabled}
            onKeyDown={onKeyDown}
            describedBy={statusId}
          />
        </div>
      )}
      {show.bridge && (
        <div className="cg-station-fields__group" role="group" aria-label="CG Bridge address">
          <span className="cg-station-fields__name" aria-hidden="true">
            CG Bridge address
          </span>
          <HostPortFields
            name="CG Bridge"
            web={false}
            idRoot="cg-bridge"
            value={value.bridge}
            onChange={(bridge) => onChange({ ...value, bridge })}
            hostPlaceholder={playoutHost ?? BRIDGE_ADDRESS_PLACEHOLDER}
            portPlaceholder={BRIDGE_PORT_DEFAULT}
            disabled={disabled}
            onKeyDown={onKeyDown}
            describedBy={
              [hint ? 'cg-bridge-address-hint' : null, statusId ?? null]
                .filter((x) => x !== null)
                .join(' ') || undefined
            }
          />
          {hint && (
            <div
              id="cg-bridge-address-hint"
              className="cg-setup-field__hint"
              data-bridge-address-hint=""
            >
              {BRIDGE_ADDRESS_HINT}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
