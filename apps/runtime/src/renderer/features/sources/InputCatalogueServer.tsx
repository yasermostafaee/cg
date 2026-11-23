import { useUiText } from '../../i18n/locale.js';
import { splitHostPort } from '@cg/shared-ipc';
import { playoutOriginForLoopback } from '../../../platform/bridgeUrl.js';
import { useAuthCapabilities } from '../../hooks/useAuthCapabilities.js';
import './input-catalogue-server.css';

/** The server of the last successful input catalogue read, as reported by CG Bridge. */
export function InputCatalogueServer({ server }: { server: string | undefined }): JSX.Element {
  const localizeUi = useUiText();
  const signInUrl = useAuthCapabilities()?.signInUrl;
  const host = server === undefined ? undefined : splitHostPort(server)?.host;
  // CG Bridge reads inputs from its configured Playout even when another engine is on programme.
  const origin = host === undefined ? null : playoutOriginForLoopback(host, signInUrl);
  const displayed = origin === null ? server : new URL(origin).host;
  return (
    <span
      className="cg-input-catalogue-server"
      data-inputs-server=""
      title={localizeUi(
        'Playout server that supplied the last successful input list. The A/B badges show source availability and preview origin. The Program monitor shows the active PGM server.',
      )}
    >
      {displayed === undefined ? (
        localizeUi('Input catalog server unavailable')
      ) : (
        <>
          {localizeUi('Input catalog server ·')} <bdi dir="ltr">{displayed}</bdi>
        </>
      )}
    </span>
  );
}
