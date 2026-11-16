import './input-catalogue-server.css';

/** The server of the last successful input catalogue read, as reported by CG Bridge. */
export function InputCatalogueServer({ server }: { server: string | undefined }): JSX.Element {
  return (
    <span className="cg-input-catalogue-server" data-inputs-server="">
      {server === undefined ? (
        'Input server unavailable'
      ) : (
        <>
          Input server · <bdi dir="ltr">{server}</bdi>
        </>
      )}
    </span>
  );
}
