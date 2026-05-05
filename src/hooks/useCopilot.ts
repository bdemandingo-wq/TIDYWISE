import { useContext } from 'react';
import { CopilotContext } from '@/components/copilot/CopilotProvider';

export type { CopilotMessage } from '@/components/copilot/CopilotProvider';

export function useCopilot() {
  const ctx = useContext(CopilotContext);
  if (!ctx) {
    throw new Error('useCopilot must be used within a CopilotProvider');
  }
  return ctx;
}
