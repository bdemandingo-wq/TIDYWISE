import React, { createContext, useContext, ReactNode } from 'react';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';

interface DemoModeContextType {
  isDemoMode: boolean;
  toggleDemoMode: () => Promise<boolean>;
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
