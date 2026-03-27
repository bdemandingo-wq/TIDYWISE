import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscription, useMonthlyBookingCount } from '@/hooks/useSubscription';
import { usePlatform } from '@/hooks/usePlatform';

export function BookingLimitBanner() {
  const { tier, limits } = useSubscription();
  const { data: bookingCount = 0 } = useMonthlyBookingCount();
  const navigate = useNavigate();
  const { isNative, billingUrl } = usePlatform();

  if (limits.maxBookingsPerMonth === -1) return null;
  if (bookingCount < limits.maxBookingsPerMonth - 5) return null;

  const atLimit = bookingCount >= limits.maxBookingsPerMonth;
  const nearLimit = !atLimit && bookingCount >= limits.maxBookingsPerMonth - 5;

  const handleUpgrade = () => {
    if (isNative) {
      window.open(billingUrl, '_blank');
    } else {
      navigate('/dashboard/subscription');
    }
  };

  if (atLimit) {
    return (
      <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>You've reached your {limits.maxBookingsPerMonth} booking limit this month.</span>
        <button onClick={handleUpgrade} className="underline font-semibold cursor-pointer ml-1">
          Upgrade for unlimited
        </button>
      </div>
    );
  }

  if (nearLimit) {
    return (
      <div className="bg-warning/10 border border-warning/30 text-warning rounded-xl px-4 py-3 flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>You've used {bookingCount} of {limits.maxBookingsPerMonth} bookings this month.</span>
        <button onClick={handleUpgrade} className="underline font-semibold cursor-pointer ml-1">
          Upgrade for unlimited
        </button>
      </div>
    );
  }

  return null;
}
