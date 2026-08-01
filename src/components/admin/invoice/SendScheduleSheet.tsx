import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Check, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface SendScheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sendImmediately: boolean;
  scheduledDate: string | null;
  scheduledTime: string;
  onChange: (immediately: boolean, date: string | null, time: string) => void;
}

export function SendScheduleSheet({ 
  open, 
  onOpenChange, 
  sendImmediately, 
  scheduledDate,
  scheduledTime,
  onChange 
}: SendScheduleSheetProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    scheduledDate ? new Date(scheduledDate) : undefined
  );
  const [time, setTime] = useState(scheduledTime || '09:00');

  const handleSelectImmediate = () => {
    onChange(true, null, '');
    onOpenChange(false);
  };

  const handleSchedule = () => {
    if (selectedDate) {
      // selectedDate is a picker token — the calendar day the user clicked.
    /* eslint-disable-next-line local/no-device-local-dates */
    onChange(false, format(selectedDate, 'yyyy-MM-dd'), time);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Send Schedule
          </SheetTitle>
        </SheetHeader>

        <div className="py-4 space-y-4">
          <button
            className="flex items-center justify-between w-full py-3 px-4 hover:bg-muted rounded-lg transition-colors border"
            onClick={handleSelectImmediate}
          >
            <div>
              <p className={sendImmediately ? 'font-medium text-primary' : 'font-medium'}>
                Send Immediately
              </p>
              <p className="text-sm text-muted-foreground">
                Invoice will be sent right away
              </p>
            </div>
            {sendImmediately && <Check className="w-5 h-5 text-primary" />}
          </button>

          <button
            className="flex items-center justify-between w-full py-3 px-4 hover:bg-muted rounded-lg transition-colors border"
            onClick={() => setShowCalendar(true)}
          >
            <div>
              <p className={!sendImmediately ? 'font-medium text-primary' : 'font-medium'}>
                Schedule for Later
              </p>
              <p className="text-sm text-muted-foreground">
                {scheduledDate 
                  ? `Scheduled: ${format(new Date(scheduledDate), 'MMM d, yyyy')} at ${scheduledTime}`
                  : 'Choose a date and time'
                }
              </p>
            </div>
            {!sendImmediately && scheduledDate && <Check className="w-5 h-5 text-primary" />}
          </button>

          {showCalendar && (
            <div className="border rounded-lg p-4 space-y-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => date < new Date()}
                className="rounded-md mx-auto"
              />
              
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground">Time:</label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-32"
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowCalendar(false)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleSchedule}
                  disabled={!selectedDate}
                >
                  Schedule
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
