import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Calendar as CalendarIcon, Clock, Loader2, MapPin, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Seo } from "@/components/Seo";
import { useClientPortal } from "@/contexts/ClientPortalContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { selectedDateTimeToUTCISO } from "@/lib/timezoneUtils";

interface Service {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  address: string | null;
  apt_suite: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  is_primary: boolean | null;
}

const TIME_SLOTS = [
  { value: "08:00", label: "8:00 AM" },
  { value: "08:30", label: "8:30 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "09:30", label: "9:30 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "10:30", label: "10:30 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "11:30", label: "11:30 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "12:30", label: "12:30 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "13:30", label: "1:30 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "14:30", label: "2:30 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "15:30", label: "3:30 PM" },
  { value: "16:00", label: "4:00 PM" },
  { value: "16:30", label: "4:30 PM" },
  { value: "17:00", label: "5:00 PM" },
];

export default function PortalRequestPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, customer, loading } = useClientPortal();
  const [services, setServices] = useState<Service[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedService, setSelectedService] = useState<string>(searchParams.get("service") || "");
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [notes, setNotes] = useState(searchParams.get("notes") || "");
  const [isTurnover, setIsTurnover] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orgTimezone, setOrgTimezone] = useState<string>("America/New_York");
  const isReschedule = searchParams.get("reschedule") === "true";

  const isAirbnb = customer?.property_type === 'airbnb';

  useEffect(() => {
    if (!loading && !user) {
      navigate("/portal", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user?.organization_id) return;

    const fetchServices = async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name")
        .eq("organization_id", user.organization_id)
        .eq("is_active", true)
        .order("name");

      setServices(data || []);
    };

    const fetchLocations = async () => {
      const { data } = await supabase.rpc("get_client_portal_locations", {
        p_customer_id: user.customer_id,
      });
      const locs = (data || []) as Location[];
      setLocations(locs);
      // Auto-select primary location
      const primary = locs.find((l) => l.is_primary);
      if (primary) setSelectedLocation(primary.id);
      else if (locs.length === 1) setSelectedLocation(locs[0].id);
    };

    const fetchTimezone = async () => {
      const { data } = await supabase
        .from("business_settings")
        .select("timezone")
        .eq("organization_id", user.organization_id)
        .maybeSingle();

      if (data?.timezone) setOrgTimezone(data.timezone);
    };

    fetchServices();
    fetchLocations();
    fetchTimezone();
  }, [user]);

  const handleSubmit = async () => {
    if (!selectedDate) {
      toast.error("Please select a preferred date");
      return;
    }

    if (!selectedTime) {
      toast.error("Please select a preferred time");
      return;
    }

    if (!user || !customer) {
      toast.error("Session expired. Please log in again.");
      navigate("/portal");
      return;
    }

    setSubmitting(true);

    // Interpret the selected date/time in the organization's timezone
    const requestedDateISO = selectedDateTimeToUTCISO(selectedDate, selectedTime, orgTimezone);
    const dateWithTime = new Date(requestedDateISO);

    try {
      // Build notes with address info
      const selectedLoc = locations.find((l) => l.id === selectedLocation);
      const addressLine = selectedLoc
        ? `Address: ${[selectedLoc.name, selectedLoc.address, selectedLoc.apt_suite, selectedLoc.city, selectedLoc.state, selectedLoc.zip_code].filter(Boolean).join(", ")}`
        : null;
      const turnoverLine = isAirbnb && isTurnover ? "⚡ TURNOVER CLEAN — Time-sensitive, must be cleaned at scheduled time" : null;
      const combinedNotes = [addressLine, turnoverLine, notes.trim()].filter(Boolean).join("\n") || null;

      // Use security definer RPC to bypass RLS (client portal users aren't authenticated via Supabase Auth)
      const { data, error } = await supabase.rpc("submit_client_booking_request", {
        p_client_user_id: user.id,
        p_customer_id: user.customer_id,
        p_organization_id: user.organization_id,
        p_requested_date: requestedDateISO,
        p_service_id: selectedService || null,
        p_notes: combinedNotes,
      });

      if (error) throw error;

      // Send SMS notification to organization (fire and forget)
      const serviceName = services.find((s) => s.id === selectedService)?.name;
      supabase.functions.invoke("notify-booking-request", {
        body: {
          organizationId: user.organization_id,
          customerName: `${customer.first_name} ${customer.last_name}`,
          requestedDate: requestedDateISO,
          serviceName,
          notes: notes.trim() || undefined,
        },
      }).catch((err) => console.error("SMS notification error:", err));

      toast.success("Booking request submitted! We'll get back to you soon.");
      navigate("/portal/dashboard");
    } catch (err: unknown) {
      console.error("Submit error:", err);
      toast.error("Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user || !customer) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <Seo
        title="Request a Booking | Client Portal"
        description="Submit a booking request for your preferred date and service."
        canonicalPath="/portal/request"
      />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/portal/dashboard")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">{isReschedule ? "Reschedule Booking" : "Request a Booking"}</h1>
            <p className="text-sm text-muted-foreground">
              {isReschedule ? "Pick a new date and time" : "Choose your preferred date"}
            </p>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>{isReschedule ? "Reschedule Request" : "New Booking Request"}</CardTitle>
            <CardDescription>
              {isReschedule ? "Submit a reschedule request and we'll confirm within 24 hours." : "Submit a request and we'll confirm your appointment within 24 hours."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Date Picker */}
            <div className="space-y-2">
              <Label>Preferred Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate
                      ? format(selectedDate, "EEEE, MMMM d, yyyy")
                      : "Select a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time Picker */}
            <div className="space-y-2">
              <Label>Preferred Time *</Label>
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger>
                  <div className="flex items-center">
                    <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Select a time" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot.value} value={slot.value}>
                      {slot.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Address Selection */}
            {locations.length > 1 && (
              <div className="space-y-2">
                <Label>Address *</Label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger>
                    <div className="flex items-center">
                      <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder="Select an address" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{loc.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {[loc.address, loc.city, loc.state, loc.zip_code].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Service Selection */}
            {services.length > 0 && (
              <div className="space-y-2">
                <Label>Service (Optional)</Label>
                <Select value={selectedService} onValueChange={setSelectedService}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Turnover Clean Option for Airbnb */}
            {isAirbnb && (
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="turnover"
                    checked={isTurnover}
                    onCheckedChange={(checked) => setIsTurnover(checked === true)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="turnover"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      This is a turnover clean
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Turnover cleans must be completed at a specific time between guests
                    </p>
                  </div>
                </div>
                {isTurnover && (
                  <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Please ensure the selected time is accurate — turnover cleans are time-sensitive and must be completed before the next guest arrives.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special requests or preferences..."
                rows={4}
              />
            </div>

            {/* Submit Button */}
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleSubmit}
              disabled={!selectedDate || !selectedTime || submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit Request
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
