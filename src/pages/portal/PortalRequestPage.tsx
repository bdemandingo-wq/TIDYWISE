import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Calendar as CalendarIcon, Clock, Loader2, MapPin, Send, AlertTriangle, Plus, Home } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { SEOHead } from '@/components/SEOHead';
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

const LABEL_EMOJIS: Record<string, string> = {
  home: "🏠",
  office: "🏢",
  airbnb: "🏡",
  rental: "🔑",
  other: "📍",
  "primary address": "🏠",
};

function getAddressEmoji(label: string) {
  return LABEL_EMOJIS[label.toLowerCase()] || "📍";
}

function formatLocationLine(loc: Location) {
  return [loc.address, loc.city, loc.state, loc.zip_code].filter(Boolean).join(", ");
}

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

  // Inline add address state
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddr, setNewAddr] = useState({ name: "Home", address: "", city: "", state: "", zip_code: "" });
  const [savingAddr, setSavingAddr] = useState(false);

  const isAirbnb = customer?.property_type === 'airbnb';

  useEffect(() => {
    if (!loading && !user) {
      navigate("/portal", { replace: true });
    }
  }, [user, loading, navigate]);

  const refreshLocations = async () => {
    if (!user) return;
    const { data } = await supabase.rpc("get_client_portal_locations", {
      p_customer_id: user.customer_id,
    });
    const locs = (data || []) as Location[];
    setLocations(locs);
    return locs;
  };

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
      const locs = await refreshLocations();
      if (!locs) return;
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

  const handleAddAddress = async () => {
    if (!user || !newAddr.address.trim()) {
      toast.error("Street address is required");
      return;
    }
    setSavingAddr(true);
    try {
      const { error } = await supabase.rpc("add_client_portal_location", {
        p_client_user_id: user.id,
        p_name: newAddr.name.trim(),
        p_address: newAddr.address.trim(),
        p_city: newAddr.city.trim() || null,
        p_state: newAddr.state.trim() || null,
        p_zip_code: newAddr.zip_code.trim() || null,
        p_is_primary: locations.length === 0,
      });
      if (error) throw error;

      const updatedLocs = await refreshLocations();
      if (updatedLocs) {
        const newLoc = updatedLocs.find(l => l.address === newAddr.address.trim());
        if (newLoc) setSelectedLocation(newLoc.id);
      }
      toast.success("Address added!");
      setNewAddr({ name: "Home", address: "", city: "", state: "", zip_code: "" });
      setShowAddAddress(false);
    } catch {
      toast.error("Failed to add address");
    } finally {
      setSavingAddr(false);
    }
  };

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

    const requestedDateISO = selectedDateTimeToUTCISO(selectedDate, selectedTime, orgTimezone);

    try {
      const turnoverLine = isAirbnb && isTurnover ? "⚡ TURNOVER CLEAN — Time-sensitive, must be cleaned at scheduled time" : null;
      const combinedNotes = [turnoverLine, notes.trim()].filter(Boolean).join("\n") || null;

      const { data, error } = await supabase.rpc("submit_client_booking_request", {
        p_client_user_id: user.id,
        p_customer_id: user.customer_id,
        p_organization_id: user.organization_id,
        p_requested_date: requestedDateISO,
        p_service_id: selectedService || null,
        p_notes: combinedNotes,
        p_location_id: selectedLocation || null,
      });

      if (error) throw error;

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
      <SEOHead
        title="Request a Booking | Client Portal"
        description="Submit a booking request for your preferred date and service."
        canonical="/portal/request"
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
            <div className="space-y-2">
              <Label>Address *</Label>
              <Select value={selectedLocation} onValueChange={(val) => {
                if (val === '__add_new__') {
                  setShowAddAddress(true);
                } else {
                  setSelectedLocation(val);
                  setShowAddAddress(false);
                }
              }}>
                <SelectTrigger>
                  <div className="flex items-center">
                    <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Select an address" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      <span className="flex items-center gap-2">
                        <span>{getAddressEmoji(loc.name)}</span>
                        <span className="font-medium">{loc.name}</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {formatLocationLine(loc)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                  <Separator className="my-1" />
                  <SelectItem value="__add_new__">
                    <span className="flex items-center gap-2 text-primary">
                      <Plus className="h-4 w-4" />
                      Add New Address
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Inline Add Address Form */}
              {showAddAddress && (
                <Card className="border-dashed mt-2">
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Label</Label>
                        <Select value={newAddr.name} onValueChange={(v) => setNewAddr(prev => ({ ...prev, name: v }))}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["Home", "Office", "Airbnb", "Rental", "Other"].map(l => (
                              <SelectItem key={l} value={l}>{getAddressEmoji(l)} {l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">ZIP</Label>
                        <Input
                          placeholder="12345"
                          value={newAddr.zip_code}
                          onChange={(e) => setNewAddr(prev => ({ ...prev, zip_code: e.target.value }))}
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Street Address *</Label>
                      <Input
                        placeholder="123 Main St"
                        value={newAddr.address}
                        onChange={(e) => setNewAddr(prev => ({ ...prev, address: e.target.value }))}
                        className="h-9"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">City</Label>
                        <Input
                          placeholder="City"
                          value={newAddr.city}
                          onChange={(e) => setNewAddr(prev => ({ ...prev, city: e.target.value }))}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">State</Label>
                        <Input
                          placeholder="State"
                          value={newAddr.state}
                          onChange={(e) => setNewAddr(prev => ({ ...prev, state: e.target.value }))}
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleAddAddress} disabled={savingAddr} size="sm">
                        {savingAddr && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        Save & Select
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowAddAddress(false)}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

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
