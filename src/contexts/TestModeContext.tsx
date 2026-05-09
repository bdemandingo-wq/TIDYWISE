import { createContext, useContext, useState, ReactNode } from 'react';
import { fmt } from '@/lib/activeCurrency';

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
  const [isTestMode, setIsTestMode] = useState(false);

  const toggleTestMode = () => setIsTestMode(!isTestMode);

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
