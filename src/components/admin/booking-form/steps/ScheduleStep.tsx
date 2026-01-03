import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, Clock, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useBookingForm } from '../BookingFormContext';

const TIME_SLOTS = [
  '00:00', '00:30', '01:00', '01:30', '02:00', '02:30',
  '03:00', '03:30', '04:00', '04:30', '05:00', '05:30',
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30',
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00', '22:30', '23:00', '23:30'
];

export function ScheduleStep() {
  const {
    selectedDate,
    setSelectedDate,
    selectedTime,
    setSelectedTime,
    selectedStaffId,
    setSelectedStaffId,
    staff,
  } = useBookingForm();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10">
          <CalendarIcon className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Schedule Appointment</h3>
          <p className="text-sm text-muted-foreground">Choose date, time, and assign staff</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Select Date *</Label>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal h-12 bg-secondary/30 border-border/50",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-3 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Select Time *</Label>
            </div>
            <Select value={selectedTime} onValueChange={setSelectedTime}>
              <SelectTrigger className="h-12 bg-secondary/30 border-border/50">
                <SelectValue placeholder="Select time slot" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border max-h-64">
                {TIME_SLOTS.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Assign Staff (Optional)</Label>
          </div>
          <Select value={selectedStaffId || "unassigned"} onValueChange={(val) => setSelectedStaffId(val === "unassigned" ? "" : val)}>
            <SelectTrigger className="h-12 bg-secondary/30 border-border/50">
              <SelectValue placeholder="Select a cleaner (optional)" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {staff?.filter(s => s.is_active).map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}
