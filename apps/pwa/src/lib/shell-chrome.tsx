import { type Dispatch, type SetStateAction, createContext, useContext, useEffect } from 'react';

export interface ShellChromeConfig {
  title?: string;
  activeTab?: string;
  showBackButton?: boolean;
  onBack?: (() => void) | undefined;
}

export const ShellChromeContext = createContext<Dispatch<
  SetStateAction<ShellChromeConfig | null>
> | null>(null);

export const useShellChrome = (config: ShellChromeConfig | null) => {
  const setConfig = useContext(ShellChromeContext);

  useEffect(() => {
    if (!setConfig) {
      return;
    }

    setConfig(config);

    return () => setConfig(null);
  }, [config, setConfig]);
};
