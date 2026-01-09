import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, Clock, Users, X, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useBookingForm } from '../BookingFormContext';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useState } from 'react';

// 12-hour time slots with AM/PM labels
const TIME_SLOTS = [
  { value: '00:00', label: '12:00 AM' }, { value: '00:30', label: '12:30 AM' },
  { value: '01:00', label: '1:00 AM' }, { value: '01:30', label: '1:30 AM' },
  { value: '02:00', label: '2:00 AM' }, { value: '02:30', label: '2:30 AM' },
  { value: '03:00', label: '3:00 AM' }, { value: '03:30', label: '3:30 AM' },
  { value: '04:00', label: '4:00 AM' }, { value: '04:30', label: '4:30 AM' },
  { value: '05:00', label: '5:00 AM' }, { value: '05:30', label: '5:30 AM' },
  { value: '06:00', label: '6:00 AM' }, { value: '06:30', label: '6:30 AM' },
  { value: '07:00', label: '7:00 AM' }, { value: '07:30', label: '7:30 AM' },
  { value: '08:00', label: '8:00 AM' }, { value: '08:30', label: '8:30 AM' },
  { value: '09:00', label: '9:00 AM' }, { value: '09:30', label: '9:30 AM' },
  { value: '10:00', label: '10:00 AM' }, { value: '10:30', label: '10:30 AM' },
  { value: '11:00', label: '11:00 AM' }, { value: '11:30', label: '11:30 AM' },
  { value: '12:00', label: '12:00 PM' }, { value: '12:30', label: '12:30 PM' },
  { value: '13:00', label: '1:00 PM' }, { value: '13:30', label: '1:30 PM' },
  { value: '14:00', label: '2:00 PM' }, { value: '14:30', label: '2:30 PM' },
  { value: '15:00', label: '3:00 PM' }, { value: '15:30', label: '3:30 PM' },
  { value: '16:00', label: '4:00 PM' }, { value: '16:30', label: '4:30 PM' },
  { value: '17:00', label: '5:00 PM' }, { value: '17:30', label: '5:30 PM' },
  { value: '18:00', label: '6:00 PM' }, { value: '18:30', label: '6:30 PM' },
  { value: '19:00', label: '7:00 PM' }, { value: '19:30', label: '7:30 PM' },
  { value: '20:00', label: '8:00 PM' }, { value: '20:30', label: '8:30 PM' },
  { value: '21:00', label: '9:00 PM' }, { value: '21:30', label: '9:30 PM' },
  { value: '22:00', label: '10:00 PM' }, { value: '22:30', label: '10:30 PM' },
  { value: '23:00', label: '11:00 PM' }, { value: '23:30', label: '11:30 PM' },
];

// Helper to get display label from 24h value
const getTimeLabel = (value: string) => TIME_SLOTS.find(t => t.value === value)?.label || value;

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

  const [isTeamMode, setIsTeamMode] = useState(false);
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);

  // Handle team member toggle
  const toggleTeamMember = (staffId: string) => {
    setSelectedTeamMembers(prev => 
      prev.includes(staffId) 
        ? prev.filter(id => id !== staffId)
        : [...prev, staffId]
    );
  };

  // Remove team member
  const removeTeamMember = (staffId: string) => {
    setSelectedTeamMembers(prev => prev.filter(id => id !== staffId));
  };

  // Update primary staff when team mode changes
  const handleTeamModeChange = (checked: boolean) => {
    setIsTeamMode(checked);
    if (!checked) {
      // Keep only the first team member as primary when switching back
      if (selectedTeamMembers.length > 0) {
        setSelectedStaffId(selectedTeamMembers[0]);
      }
      setSelectedTeamMembers([]);
    } else {
      // Add current selected staff to team
      if (selectedStaffId) {
        setSelectedTeamMembers([selectedStaffId]);
      }
    }
  };

  const activeStaff = staff?.filter(s => s.is_active) || [];

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
                <SelectValue placeholder="Select time slot">
                  {selectedTime ? getTimeLabel(selectedTime) : 'Select time slot'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-popover border-border max-h-64">
                {TIME_SLOTS.map((slot) => (
                  <SelectItem key={slot.value} value={slot.value}>
                    {slot.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Assign Staff (Optional)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="teamMode"
                checked={isTeamMode}
                onCheckedChange={handleTeamModeChange}
              />
              <Label htmlFor="teamMode" className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1">
                <UserPlus className="h-3 w-3" />
                Team Mode
              </Label>
            </div>
          </div>

          {!isTeamMode ? (
            // Single staff selection
            <Select value={selectedStaffId || "unassigned"} onValueChange={(val) => setSelectedStaffId(val === "unassigned" ? "" : val)}>
              <SelectTrigger className="h-12 bg-secondary/30 border-border/50">
                <SelectValue placeholder="Select a cleaner (optional)" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {activeStaff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            // Team selection mode
            <div className="space-y-4">
              {/* Selected Team Members */}
              {selectedTeamMembers.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  {selectedTeamMembers.map((staffId) => {
                    const member = activeStaff.find(s => s.id === staffId);
                    if (!member) return null;
                    return (
                      <Badge 
                        key={staffId} 
                        variant="secondary" 
                        className="flex items-center gap-1 py-1 px-3"
                      >
                        {member.name}
                        <button
                          type="button"
                          onClick={() => removeTeamMember(staffId)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              {/* Add Team Members */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {activeStaff.map((member) => {
                  const isSelected = selectedTeamMembers.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleTeamMember(member.id)}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border text-left transition-all",
                        isSelected 
                          ? "border-primary bg-primary/10 text-primary" 
                          : "border-border/50 bg-secondary/30 hover:border-primary/50"
                      )}
                    >
                      <Checkbox checked={isSelected} className="pointer-events-none" />
                      <span className="text-sm font-medium truncate">{member.name}</span>
                    </button>
                  );
                })}
              </div>

              {selectedTeamMembers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Select team members for this job
                </p>
              )}
            </div>
          )}

          {isTeamMode && selectedTeamMembers.length > 1 && (
            <p className="text-xs text-muted-foreground mt-3">
              <strong>Note:</strong> The first selected member will be the primary assignee. 
              Team assignments are tracked for scheduling purposes.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
