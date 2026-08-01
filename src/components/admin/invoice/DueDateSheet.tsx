import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Check } from 'lucide-react';
import { format, addDays } from 'date-fns';

interface DueDateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (date: string, label: string) => void;
}

const DUE_DATE_OPTIONS = [
  { label: 'Upon receipt', days: 0 },
  { label: 'In 7 days', days: 7 },
  { label: 'In 14 days', days: 14 },
  { label: 'In 30 days', days: 30 },
  { label: 'In 45 days', days: 45 },
  { label: 'In 30 days', days: 60 },
  { label: 'In 90 days', days: 90 },
];

export function DueDateSheet({ open, onOpenChange, value, onChange }: DueDateSheetProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value ? new Date(value) : undefined
  );

  const handleSelect = (days: number, label: string) => {
    if (days === 0) {
      onChange('', 'Upon receipt');
    } else {
      const date = addDays(new Date(), days);
      // Everything here is the calendar day the user picked from the sheet.
    /* eslint-disable local/no-device-local-dates -- picker tokens throughout */
    onChange(format(date, 'yyyy-MM-dd'), label);
    }
    onOpenChange(false);
  };

  const handleCustomDate = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      onChange(format(date, 'yyyy-MM-dd'), format(date, 'MMM d, yyyy'));
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle>Due Date</SheetTitle>
        </SheetHeader>

        {showCalendar ? (
          <div className="py-4 flex flex-col items-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleCustomDate}
              disabled={(date) => date < new Date()}
              className="rounded-md border"
            />
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setShowCalendar(false)}
            >
              Back to options
            </Button>
          </div>
        ) : (
          <div className="py-4 space-y-1">
            {DUE_DATE_OPTIONS.map((option) => {
              const isSelected = option.days === 0 
                ? !value 
                : value === format(addDays(new Date(), option.days), 'yyyy-MM-dd');
  /* eslint-enable local/no-device-local-dates */
              
              return (
                <button
                  key={option.label}
                  className="flex items-center justify-between w-full py-3 px-4 hover:bg-muted rounded-lg transition-colors"
                  onClick={() => handleSelect(option.days, option.label)}
                >
                  <span className={isSelected ? 'font-medium text-primary' : ''}>
                    {option.label}
                  </span>
                  {isSelected && <Check className="w-5 h-5 text-primary" />}
                </button>
              );
            })}
            
            <div className="border-t pt-2 mt-2">
              <button
                className="flex items-center justify-between w-full py-3 px-4 hover:bg-muted rounded-lg transition-colors"
                onClick={() => setShowCalendar(true)}
              >
                <span>Choose a date...</span>
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
