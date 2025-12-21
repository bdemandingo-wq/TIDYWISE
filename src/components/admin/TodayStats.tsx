import { DollarSign, CreditCard, Users } from 'lucide-react';

interface TodayStatsProps {
  grossVolume: number;
  payments: number;
  customers: number;
}

export function TodayStats({ grossVolume, payments, customers }: TodayStatsProps) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Today</h2>
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="grid grid-cols-3 divide-x divide-border">
          <div className="text-center px-4">
            <p className="text-sm text-muted-foreground mb-1">Gross Volume</p>
            <p className="text-2xl font-bold">${grossVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center px-4">
            <p className="text-sm text-muted-foreground mb-1">Payments</p>
            <p className="text-2xl font-bold">{payments}</p>
          </div>
          <div className="text-center px-4">
            <p className="text-sm text-muted-foreground mb-1">Customers</p>
            <p className="text-2xl font-bold">{customers}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
