import { splitHostPort } from '@cg/shared-ipc';
import { playoutOriginForLoopback } from '../../../platform/bridgeUrl.js';
import { useAuthCapabilities } from '../../hooks/useAuthCapabilities.js';
import './input-catalogue-server.css';

/** The server of the last successful input catalogue read, as reported by CG Bridge. */
export function InputCatalogueServer({ server }: { server: string | undefined }): JSX.Element {
  const signInUrl = useAuthCapabilities()?.signInUrl;
  const host = server === undefined ? undefined : splitHostPort(server)?.host;
  // CG Bridge reads inputs from its configured Playout even when another engine is on programme.
  const origin = host === undefined ? null : playoutOriginForLoopback(host, signInUrl);
  const displayed = origin === null ? server : new URL(origin).host;
  return (
    <span className="cg-input-catalogue-server" data-inputs-server="">
      {displayed === undefined ? (
        'Input server unavailable'
      ) : (
        <>
          Input server · <bdi dir="ltr">{displayed}</bdi>
        </>
      )}
    </span>
  );
}
