import { createContext, useContext, useState, ReactNode } from 'react';
import { fmt } from '@/lib/activeCurrency';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';

interface TestModeContextType {
  isTestMode: boolean;
  toggleTestMode: () => void;
  maskName: (name: string) => string;
  maskEmail: (email: string) => string;
  maskPhone: (phone: string | null) => string;
  maskAddress: (address: string | null) => string;
  maskAmount: (amount: number) => string;
}

const TestModeContext = createContext<TestModeContextType | undefined>(undefined);

// Generate consistent fake names
const fakeFirstNames = ['John', 'Jane', 'Mike', 'Sarah', 'Chris', 'Emily', 'Alex', 'Sam', 'Taylor', 'Jordan'];
const fakeLastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Moore'];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function TestModeProvider({ children }: { children: ReactNode }) {
  // Demo Mode (persisted org-level toggle) drives the same data masking as the
  // local Test Mode flag. Either being on enables masking everywhere.
  const { settings, toggleDemoMode } = useOrganizationSettings();
  const demoModeEnabled = settings?.demo_mode_enabled ?? false;
  const [localTestMode, setLocalTestMode] = useState(false);
  const isTestMode = localTestMode || demoModeEnabled;

  const toggleTestMode = () => {
    // If demo mode is on, turn it off via the persisted toggle. Otherwise flip
    // the local in-memory test mode flag.
    if (demoModeEnabled) {
      void toggleDemoMode();
    } else {
      setLocalTestMode((v) => !v);
    }
  };

  const maskName = (name: string): string => {
    if (!isTestMode || !name) return name;
    const hash = hashString(name);
    const firstName = fakeFirstNames[hash % fakeFirstNames.length];
    const lastName = fakeLastNames[(hash + 1) % fakeLastNames.length];
    return `${firstName} ${lastName}`;
  };

  const maskEmail = (email: string): string => {
    if (!isTestMode || !email) return email;
    const hash = hashString(email);
    return `user${hash % 1000}@example.com`;
  };

  const maskPhone = (phone: string | null): string => {
    if (!isTestMode || !phone) return phone || '';
    return '(555) 123-4567';
  };

  const maskAddress = (address: string | null): string => {
    if (!isTestMode || !address) return address || '';
    const hash = hashString(address);
    return `${(hash % 999) + 100} Demo Street`;
  };

  const maskAmount = (amount: number): string => {
    if (!isTestMode) return `${fmt(amount)}`;
    return '$XXX.XX';
  };

  return (
    <TestModeContext.Provider value={{
      isTestMode,
      toggleTestMode,
      maskName,
      maskEmail,
      maskPhone,
      maskAddress,
      maskAmount,
    }}>
      {children}
    </TestModeContext.Provider>
  );
}

export function useTestMode() {
  const context = useContext(TestModeContext);
  if (!context) {
    throw new Error('useTestMode must be used within TestModeProvider');
  }
  return context;
}
