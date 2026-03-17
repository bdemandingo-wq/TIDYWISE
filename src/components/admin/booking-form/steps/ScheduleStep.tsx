import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, Clock, Users, X, UserPlus, DollarSign, AlertCircle, CheckCircle, MapPin, Car } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useBookingForm } from '../BookingFormContext';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useCleanerConflicts } from '@/hooks/useCleanerConflicts';
import { CleanerConflictWarning } from '../CleanerConflictWarning';
import { calculateDistanceMiles, estimateDriveMinutes, formatDistance, formatDriveTime, geocodeAddress } from '@/lib/distanceUtils';

// Module-level geocode cache persists across step navigation
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

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

export function ScheduleStep({ currentBookingId }: { currentBookingId?: string }) {
  const {
    selectedDate,
    setSelectedDate,
    selectedTime,
    setSelectedTime,
    selectedStaffId,
    setSelectedStaffId,
    isTeamMode,
    setIsTeamMode,
    selectedTeamMembers,
    setSelectedTeamMembers,
    teamMemberPay,
    updateTeamMemberPay,
    staff,
    cleanerWage,
    cleanerWageType,
    totalAmount,
    calculatedPrice,
    selectedService,
    conflictOverride,
    setConflictOverride,
    address,
    city,
    state,
    zipCode,
  } = useBookingForm();

  // State for job location coordinates (geocoded from address)
  const [jobCoordinates, setJobCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isGeocodingJob, setIsGeocodingJob] = useState(false);

  // Geocode the job address when it changes - with cache and retry
  useEffect(() => {
    const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');
    if (!fullAddress || fullAddress.length < 10) {
      setJobCoordinates(null);
      return;
    }

    const cacheKey = fullAddress.trim().toLowerCase();

    // Check cache first
    if (geocodeCache.has(cacheKey)) {
      setJobCoordinates(geocodeCache.get(cacheKey) || null);
      return;
    }

    let cancelled = false;

    const geocodeWithRetry = async (retries = 2) => {
      setIsGeocodingJob(true);
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (cancelled) return;
        const coords = await geocodeAddress(fullAddress);
        if (cancelled) return;
        if (coords) {
          geocodeCache.set(cacheKey, coords);
          setJobCoordinates(coords);
          setIsGeocodingJob(false);
          return;
        }
        // Wait before retry (increasing delay)
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      // All retries failed - cache the failure too to avoid hammering
      geocodeCache.set(cacheKey, null);
      setJobCoordinates(null);
      setIsGeocodingJob(false);
    };

    // Debounce geocoding
    const timeout = setTimeout(geocodeWithRetry, 500);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [address, city, state, zipCode]);

  // Calculate distance from staff home to job location
  const getStaffDistance = (staffMember: { home_latitude?: number | null; home_longitude?: number | null }) => {
    if (!jobCoordinates || !staffMember.home_latitude || !staffMember.home_longitude) {
      return null;
    }
    const miles = calculateDistanceMiles(
      staffMember.home_latitude,
      staffMember.home_longitude,
      jobCoordinates.lat,
      jobCoordinates.lng
    );
    return {
      miles,
      driveMinutes: estimateDriveMinutes(miles),
      display: formatDistance(miles),
      driveDisplay: formatDriveTime(estimateDriveMinutes(miles)),
    };
  };

  // Use conflict detection hook
  const { checkConflictsForStaff, getStaffAvailability, isStaffWithinWorkingHours, loading: conflictLoading } = useCleanerConflicts(
    selectedDate,
    selectedTime,
    selectedService?.duration || 120,
    currentBookingId
  );

  // Get availability for all active staff
  const activeStaff = staff?.filter(s => s.is_active) || [];
  const staffAvailability = useMemo(() => {
    return getStaffAvailability(activeStaff.map(s => s.id));
  }, [activeStaff, selectedDate, selectedTime, getStaffAvailability]);

  // Filter staff to only show those outside working hours
  // Staff with booking conflicts are still shown (admin can override)
  // Only staff who are outside their configured working hours are hidden
  const availableStaff = useMemo(() => {
    if (!selectedDate || !selectedTime) {
      // If no date/time selected yet, show all active staff
      return activeStaff;
    }
    // Only hide staff who are outside their working hours
    // Staff with booking conflicts (busy) are still shown so admin can select + override
    return activeStaff.filter(s => {
      const availability = staffAvailability.get(s.id);
      // If no availability data, show the staff (default available)
      if (!availability) return true;
      // Hide only if outside configured working hours
      return !availability.isOutsideWorkingHours;
    });
  }, [activeStaff, selectedDate, selectedTime, staffAvailability]);

  // Get conflicts for currently selected staff (single mode)
  const currentConflicts = useMemo(() => {
    if (!selectedStaffId || isTeamMode) return [];
    return checkConflictsForStaff(selectedStaffId);
  }, [selectedStaffId, isTeamMode, checkConflictsForStaff]);

  // Get conflicts for team mode
  const teamConflicts = useMemo(() => {
    if (!isTeamMode || selectedTeamMembers.length === 0) return new Map();
    const conflicts = new Map<string, ReturnType<typeof checkConflictsForStaff>>();
    for (const staffId of selectedTeamMembers) {
      const staffConflicts = checkConflictsForStaff(staffId);
      if (staffConflicts.length > 0) {
        conflicts.set(staffId, staffConflicts);
      }
    }
    return conflicts;
  }, [isTeamMode, selectedTeamMembers, checkConflictsForStaff]);

  const hasAnyConflict = currentConflicts.length > 0 || teamConflicts.size > 0;

  // Reset conflict override when staff/date/time changes
  useEffect(() => {
    setConflictOverride(false);
  }, [selectedStaffId, selectedDate, selectedTime, selectedTeamMembers.join(',')]);

  // Handle team member toggle
  const toggleTeamMember = (staffId: string) => {
    setSelectedTeamMembers(
      selectedTeamMembers.includes(staffId) 
        ? selectedTeamMembers.filter(id => id !== staffId)
        : [...selectedTeamMembers, staffId]
    );
  };

  // Remove team member
  const removeTeamMember = (staffId: string) => {
    setSelectedTeamMembers(selectedTeamMembers.filter(id => id !== staffId));
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

  // Calculate suggested pay share for team members
  const calculateSuggestedPay = (staffId: string) => {
    const staffMember = staff?.find(s => s.id === staffId);
    if (!staffMember) return 0;

    const jobTotal = totalAmount > 0 ? totalAmount : calculatedPrice;
    const teamSize = selectedTeamMembers.length || 1;

    // Use booking-level wage if set, otherwise use staff's default
    const wageToUse = cleanerWage ? parseFloat(cleanerWage) : null;
    const wageTypeToUse = cleanerWageType;

    if (wageToUse) {
      if (wageTypeToUse === 'flat') {
        return wageToUse / teamSize;
      } else if (wageTypeToUse === 'percentage') {
        return (jobTotal * wageToUse / 100) / teamSize;
      } else {
        return wageToUse * 2; // Hourly - estimate 2 hours per person
      }
    }

    // Fall back to staff's default rates
    if (staffMember.percentage_rate && staffMember.percentage_rate > 0) {
      return (jobTotal * staffMember.percentage_rate / 100) / teamSize;
    }
    if (staffMember.hourly_rate && staffMember.hourly_rate > 0) {
      return staffMember.hourly_rate * 2;
    }

    return 0;
  };

  // Initialize pay ONLY for newly added team members (not pre-loaded ones from DB)
  // We check if the value is strictly undefined AND the amount is > 0 to avoid overwriting DB values
  useEffect(() => {
    selectedTeamMembers.forEach(staffId => {
      // Only auto-calculate if truly missing (undefined), not if it was loaded as 0 from DB
      if (teamMemberPay[staffId] === undefined) {
        const suggestedPay = calculateSuggestedPay(staffId);
        if (suggestedPay > 0) {
          updateTeamMemberPay(staffId, Math.round(suggestedPay * 100) / 100);
        }
        // If suggestedPay is 0, leave as 0 (don't auto-set $1 or any incorrect value)
      }
    });
  }, [selectedTeamMembers]);

  // Helper to render availability badge
  const renderAvailabilityBadge = (staffId: string) => {
    if (!selectedDate || !selectedTime) return null;
    const availability = staffAvailability.get(staffId);
    if (!availability) return null;

    if (availability.isAvailable) {
      return (
        <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
          <CheckCircle className="h-3 w-3 mr-1" />
          Available
        </Badge>
      );
    } else {
      return (
        <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700 border-amber-200 text-xs">
          <AlertCircle className="h-3 w-3 mr-1" />
          Busy
        </Badge>
      );
    }
  };

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
            // Single staff selection - only show staff who are available based on working hours
            <>
              <Select value={selectedStaffId || "unassigned"} onValueChange={(val) => setSelectedStaffId(val === "unassigned" ? "" : val)}>
                <SelectTrigger className="h-12 bg-secondary/30 border-border/50">
                  <SelectValue placeholder="Select a cleaner (optional)">
                    {selectedStaffId && (staff?.find(s => s.id === selectedStaffId)?.name || availableStaff.find(s => s.id === selectedStaffId)?.name)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {availableStaff.length === 0 && selectedDate && selectedTime ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">
                      No staff available for this time slot
                    </div>
                  ) : (
                    availableStaff.map((member) => {
                      const availability = staffAvailability.get(member.id);
                      // Only show busy badge for booking conflicts (not working hours since those are already filtered)
                      const hasConflicts = availability && availability.conflicts.length > 0;
                      const distance = getStaffDistance(member as { home_latitude?: number | null; home_longitude?: number | null });
                      return (
                        <SelectItem key={member.id} value={member.id} className="py-2">
                          <span className="flex items-center gap-2 w-full">
                            <span className="flex-1">{member.name}</span>
                            {/* Distance badge - show if staff has home coordinates */}
                            {distance && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-0.5 shrink-0">
                                <Car className="h-3 w-3" />
                                {distance.display} ({distance.driveDisplay})
                              </span>
                            )}
                            {/* Availability badge */}
                            {selectedDate && selectedTime && (
                              <span className={cn(
                                "text-xs px-1.5 py-0.5 rounded shrink-0",
                                hasConflicts 
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" 
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                              )}>
                                {hasConflicts ? 'Busy' : 'Available'}
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>

              {/* Conflict Warning for Single Staff */}
              {currentConflicts.length > 0 && (
                <div className="mt-4">
                  <CleanerConflictWarning
                    cleanerName={availableStaff.find(s => s.id === selectedStaffId)?.name || 'Selected cleaner'}
                    conflicts={currentConflicts}
                    overrideConflict={conflictOverride}
                    onOverrideChange={setConflictOverride}
                  />
                </div>
              )}
            </>
          ) : (
            // Team selection mode - only show staff who are available based on working hours
            <div className="space-y-4">
              {/* Selected Team Members with Editable Pay */}
              {selectedTeamMembers.length > 0 && (
                <div className="space-y-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Team Members & Pay (Editable)</p>
                  {selectedTeamMembers.map((staffId, idx) => {
                    // For already selected members, look in activeStaff (they might have been selected before time changed)
                    const member = activeStaff.find(s => s.id === staffId);
                    const currentPay = teamMemberPay[staffId] ?? 0;
                    const memberConflicts = teamConflicts.get(staffId);
                    if (!member) return null;
                    return (
                      <div key={staffId}>
                        <div 
                          className={cn(
                            "flex items-center justify-between p-2 bg-background rounded border gap-2",
                            memberConflicts && memberConflicts.length > 0 && "border-amber-300 bg-amber-50/50"
                          )}
                        >
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant={idx === 0 ? "default" : "secondary"} className="text-xs">
                              {idx === 0 ? 'Lead' : `#${idx + 1}`}
                            </Badge>
                            <span className="font-medium">{member.name}</span>
                            {memberConflicts && memberConflicts.length > 0 && (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Conflict
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={currentPay || ''}
                                onChange={(e) => updateTeamMemberPay(staffId, parseFloat(e.target.value) || 0)}
                                className="w-24 h-8 pl-6 text-sm"
                                placeholder="0.00"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeTeamMember(staffId)}
                              className="p-1 hover:text-destructive"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Team Conflict Warnings */}
              {teamConflicts.size > 0 && (
                <div className="space-y-3">
                  {Array.from(teamConflicts.entries()).map(([staffId, conflicts]) => {
                    const member = activeStaff.find(s => s.id === staffId);
                    return (
                      <CleanerConflictWarning
                        key={staffId}
                        cleanerName={member?.name || 'Team member'}
                        conflicts={conflicts}
                        overrideConflict={conflictOverride}
                        onOverrideChange={setConflictOverride}
                      />
                    );
                  })}
                </div>
              )}

              {/* Add Team Members - only show staff who are available based on working hours */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {availableStaff.length === 0 && selectedDate && selectedTime ? (
                  <div className="col-span-full p-3 text-sm text-muted-foreground text-center border border-dashed rounded-lg">
                    No staff available for this time slot
                  </div>
                ) : (
                  availableStaff.map((member) => {
                    const isSelected = selectedTeamMembers.includes(member.id);
                    const availability = staffAvailability.get(member.id);
                    // Only show busy badge for booking conflicts (not working hours since those are already filtered)
                    const hasConflicts = availability && availability.conflicts.length > 0;
                    const distance = getStaffDistance(member);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => toggleTeamMember(member.id)}
                        className={cn(
                          "flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all",
                          isSelected 
                            ? "border-primary bg-primary/10 text-primary" 
                            : "border-border/50 bg-secondary/30 hover:border-primary/50"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox checked={isSelected} className="pointer-events-none" />
                          <span className="text-sm font-medium truncate">{member.name}</span>
                        </div>
                        <div className="flex items-center gap-1 ml-6">
                          {distance && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-0.5">
                              <Car className="h-3 w-3" />
                              {distance.display} ({distance.driveDisplay})
                            </span>
                          )}
                          {selectedDate && selectedTime && (
                            <span className={cn(
                              "text-xs px-1.5 py-0.5 rounded",
                              hasConflicts 
                                ? "bg-amber-100 text-amber-700" 
                                : "bg-emerald-100 text-emerald-700"
                            )}>
                              {hasConflicts ? 'Busy' : 'Available'}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedTeamMembers.length === 0 && availableStaff.length > 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Select team members for this job
                </p>
              )}
            </div>
          )}

          {isTeamMode && selectedTeamMembers.length > 1 && (
            <p className="text-xs text-muted-foreground mt-3">
              <strong>Note:</strong> The first selected member will be the primary assignee. 
              Individual pay is calculated based on wage settings.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
