import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { useAuthSession } from '../../hooks/useAuthSession.js';

interface LayerShortcutSession {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const LayerShortcutContext = createContext<LayerShortcutSession | null>(null);

export function LayerShortcutSessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const auth = useAuthSession();
  const session = auth.kind === 'signed-in' ? `principal:${auth.principal.sub}` : auth.kind;
  const [enabledFor, setEnabledFor] = useState<string | null>(null);
  useLayoutEffect(() => {
    setEnabledFor((previous) => (previous === session ? previous : null));
  }, [session]);

  return (
    <LayerShortcutContext.Provider
      value={{
        enabled: enabledFor === session,
        setEnabled: (enabled) => setEnabledFor(enabled ? session : null),
      }}
    >
      {children}
    </LayerShortcutContext.Provider>
  );
}

export function useLayerShortcutSession(): LayerShortcutSession | null {
  return useContext(LayerShortcutContext);
}
