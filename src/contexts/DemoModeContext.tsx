import React, { createContext, useContext, ReactNode } from 'react';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';

interface DemoModeContextType {
  isDemoMode: boolean;
  // useOrganizationSettings returns Promise<boolean | undefined> — undefined
  // when there is no settings row yet. The context declared Promise<boolean>,
  // which was simply untrue.
  toggleDemoMode: () => Promise<boolean | undefined>;
  loading: boolean;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const { settings, loading, toggleDemoMode } = useOrganizationSettings();

  return (
    <DemoModeContext.Provider value={{
      isDemoMode: settings?.demo_mode_enabled ?? false,
      toggleDemoMode,
      loading,
    }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (context === undefined) {
    throw new Error('useDemoMode must be used within a DemoModeProvider');
  }
  return context;
}
