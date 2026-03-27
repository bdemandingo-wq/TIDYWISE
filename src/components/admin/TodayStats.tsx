import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTestMode } from '@/contexts/TestModeContext';
import { DollarSign, CreditCard, Users } from 'lucide-react';

interface TodayStatsProps {
  grossVolume: number;
  payments: number;
  customers: number;
}

export function TodayStats({ grossVolume, payments, customers }: TodayStatsProps) {
  const [isPulsing, setIsPulsing] = useState(false);
  const [prevValues, setPrevValues] = useState({ grossVolume, payments, customers });
  const { isTestMode } = useTestMode();

  useEffect(() => {
    if (
      prevValues.grossVolume !== grossVolume ||
      prevValues.payments !== payments ||
      prevValues.customers !== customers
    ) {
      setIsPulsing(true);
      setPrevValues({ grossVolume, payments, customers });
      const timeout = setTimeout(() => setIsPulsing(false), 1000);
      return () => clearTimeout(timeout);
    }
  }, [grossVolume, payments, customers, prevValues]);

  const stats = [
    {
      label: 'Gross Volume',
      value: isTestMode ? '$X,XXX.XX' : `$${grossVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
    },
    {
      label: 'Payments',
      value: isTestMode ? 'XX' : payments,
      icon: CreditCard,
    },
    {
      label: 'Customers',
      value: isTestMode ? 'XX' : customers,
      icon: Users,
    },
  ];

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-foreground mb-3">Today</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              "bg-card border border-border/50 border-l-4 border-l-primary rounded-xl p-4 shadow-sm transition-all duration-200 hover:shadow-md",
              isPulsing && "ring-2 ring-primary/30"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <div className="p-2 rounded-lg bg-primary/10">
                <stat.icon className="w-4 h-4 text-primary" />
              </div>
            </div>
            <p className={cn(
              "text-2xl font-bold text-foreground transition-colors duration-200",
              isPulsing && "text-primary"
            )}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
