import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTestMode } from '@/contexts/TestModeContext';

interface TodayStatsProps {
  grossVolume: number;
  payments: number;
  customers: number;
}

export function TodayStats({ grossVolume, payments, customers }: TodayStatsProps) {
  const [isPulsing, setIsPulsing] = useState(false);
  const [prevValues, setPrevValues] = useState({ grossVolume, payments, customers });
  const { isTestMode } = useTestMode();

  // Detect changes and trigger pulse animation
  useEffect(() => {
    if (
      prevValues.grossVolume !== grossVolume ||
      prevValues.payments !== payments ||
      prevValues.customers !== customers
    ) {
      setIsPulsing(true);
      setPrevValues({ grossVolume, payments, customers });
      
      const timeout = setTimeout(() => {
        setIsPulsing(false);
      }, 1000);
      
      return () => clearTimeout(timeout);
    }
  }, [grossVolume, payments, customers, prevValues]);

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Today</h2>
      <div 
        className={cn(
          "bg-card border border-border rounded-xl p-4 transition-all duration-300",
          isPulsing && "ring-2 ring-primary/50 animate-pulse"
        )}
      >
        <div className="grid grid-cols-3 divide-x divide-border">
          <div className="text-center px-4">
            <p className="text-sm text-muted-foreground mb-1">Gross Volume</p>
            <p className={cn(
              "text-2xl font-bold transition-colors duration-300",
              isPulsing && "text-primary"
            )}>
              {isTestMode ? '$X,XXX.XX' : `$${grossVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </p>
          </div>
          <div className="text-center px-4">
            <p className="text-sm text-muted-foreground mb-1">Payments</p>
            <p className={cn(
              "text-2xl font-bold transition-colors duration-300",
              isPulsing && "text-primary"
            )}>
              {isTestMode ? 'XX' : payments}
            </p>
          </div>
          <div className="text-center px-4">
            <p className="text-sm text-muted-foreground mb-1">Customers</p>
            <p className={cn(
              "text-2xl font-bold transition-colors duration-300",
              isPulsing && "text-primary"
            )}>
              {isTestMode ? 'XX' : customers}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
