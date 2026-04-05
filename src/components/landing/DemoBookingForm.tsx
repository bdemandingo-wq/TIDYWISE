import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2, Calendar, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const teamSizeOptions = ["Just me", "2-5 cleaners", "6-10 cleaners", "10+ cleaners"];
const challengeOptions = [
  "Scheduling & bookings",
  "Client communication",
  "Payments & invoicing",
  "Managing my team",
  "All of the above",
];
const dayOptions = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const timeOptions = ["Morning 9-12pm", "Afternoon 12-4pm", "Evening 4-6pm EST"];

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  teamSize: string;
  biggestChallenge: string;
  preferredDays: string[];
  preferredTime: string;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  businessName?: string;
}

export function DemoBookingForm() {
  const [form, setForm] = useState<FormData>({
    fullName: "",
    email: "",
    phone: "",
    businessName: "",
    teamSize: "",
    biggestChallenge: "",
    preferredDays: [],
    preferredTime: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!form.fullName.trim()) newErrors.fullName = "Full name is required";
    if (!form.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Please enter a valid email";
    }
    if (!form.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (form.phone.replace(/\D/g, "").length < 10) {
      newErrors.phone = "Phone must be at least 10 digits";
    }
    if (!form.businessName.trim()) newErrors.businessName = "Business name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      // Save to Supabase
      const { error: dbError } = await supabase.from("demo_requests" as any).insert({
        full_name: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        business_name: form.businessName.trim(),
        team_size: form.teamSize || null,
        biggest_challenge: form.biggestChallenge || null,
        preferred_days: form.preferredDays.length > 0 ? form.preferredDays : null,
        preferred_time: form.preferredTime || null,
        status: "pending",
      } as any);

      if (dbError) throw dbError;

      // Notify via edge function (SMS + email)
      try {
        await supabase.functions.invoke("notify-demo-request", {
          body: {
            fullName: form.fullName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            businessName: form.businessName.trim(),
            teamSize: form.teamSize,
            biggestChallenge: form.biggestChallenge,
            preferredDays: form.preferredDays,
            preferredTime: form.preferredTime,
          },
        });
      } catch {
        // Non-blocking — form still submitted
      }

      setSubmitted(true);
    } catch (err: any) {
      console.error("Demo request error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const firstName = form.fullName.split(" ")[0];

  if (submitted) {
    return (
      <Card className="p-8 text-center bg-card border border-border">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-bounce">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-2xl font-bold text-foreground mb-2">
          🎉 You're on the list{firstName ? `, ${firstName}` : ""}!
        </h3>
        <p className="text-muted-foreground mb-6">
          Emmanuel will text or call you within 2 hours to confirm your demo time.
        </p>
        <div className="space-y-3 text-left max-w-xs mx-auto">
          <a href="/blog" className="flex items-center gap-2 text-primary hover:underline text-sm">
            <ArrowRight className="h-4 w-4" /> Read how it works
          </a>
          <a href="/#features" className="flex items-center gap-2 text-primary hover:underline text-sm">
            <ArrowRight className="h-4 w-4" /> Explore features
          </a>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 md:p-8 bg-card border border-border shadow-lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Full Name */}
        <div>
          <Label htmlFor="demo-name" className="text-foreground">Full Name *</Label>
          <Input
            id="demo-name"
            value={form.fullName}
            onChange={(e) => { setForm(prev => ({ ...prev, fullName: e.target.value })); setErrors(prev => ({ ...prev, fullName: undefined })); }}
            placeholder="John Smith"
            className={`mt-1.5 h-12 ${errors.fullName ? "border-destructive" : ""}`}
          />
          {errors.fullName && <p className="text-destructive text-xs mt-1">{errors.fullName}</p>}
        </div>

        {/* Email */}
        <div>
          <Label htmlFor="demo-email" className="text-foreground">Email Address *</Label>
          <Input
            id="demo-email"
            type="email"
            value={form.email}
            onChange={(e) => { setForm(prev => ({ ...prev, email: e.target.value })); setErrors(prev => ({ ...prev, email: undefined })); }}
            placeholder="john@cleaningco.com"
            className={`mt-1.5 h-12 ${errors.email ? "border-destructive" : ""}`}
          />
          {errors.email && <p className="text-destructive text-xs mt-1">{errors.email}</p>}
        </div>

        {/* Phone */}
        <div>
          <Label htmlFor="demo-phone" className="text-foreground">Phone Number *</Label>
          <Input
            id="demo-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => { setForm(prev => ({ ...prev, phone: e.target.value })); setErrors(prev => ({ ...prev, phone: undefined })); }}
            placeholder="(555) 123-4567"
            className={`mt-1.5 h-12 ${errors.phone ? "border-destructive" : ""}`}
          />
          {errors.phone && <p className="text-destructive text-xs mt-1">{errors.phone}</p>}
        </div>

        {/* Business Name */}
        <div>
          <Label htmlFor="demo-biz" className="text-foreground">Business Name *</Label>
          <Input
            id="demo-biz"
            value={form.businessName}
            onChange={(e) => { setForm(prev => ({ ...prev, businessName: e.target.value })); setErrors(prev => ({ ...prev, businessName: undefined })); }}
            placeholder="Sparkle Clean Co."
            className={`mt-1.5 h-12 ${errors.businessName ? "border-destructive" : ""}`}
          />
          {errors.businessName && <p className="text-destructive text-xs mt-1">{errors.businessName}</p>}
        </div>

        {/* Team Size */}
        <div>
          <Label className="text-foreground mb-2 block">How many cleaners on your team?</Label>
          <div className="grid grid-cols-2 gap-2">
            {teamSizeOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, teamSize: opt }))}
                className={`px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  form.teamSize === opt
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-foreground hover:border-primary/50"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Biggest Challenge */}
        <div>
          <Label className="text-foreground mb-2 block">What's your biggest challenge?</Label>
          <div className="space-y-2">
            {challengeOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, biggestChallenge: opt }))}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  form.biggestChallenge === opt
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-foreground hover:border-primary/50"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Preferred Days */}
        <div>
          <Label className="text-foreground mb-2 block">Preferred day to meet</Label>
          <div className="flex flex-wrap gap-2">
            {dayOptions.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() =>
                  setForm(prev => ({
                    ...prev,
                    preferredDays: prev.preferredDays.includes(day)
                      ? prev.preferredDays.filter(d => d !== day)
                      : [...prev.preferredDays, day],
                  }))
                }
                className={`px-4 py-2.5 rounded-full border text-sm font-medium transition-all ${
                  form.preferredDays.includes(day)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-foreground hover:border-primary/50"
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* Preferred Time */}
        <div>
          <Label className="text-foreground mb-2 block">Preferred time</Label>
          <div className="flex flex-wrap gap-2">
            {timeOptions.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, preferredTime: time }))}
                className={`px-4 py-2.5 rounded-full border text-sm font-medium transition-all ${
                  form.preferredTime === time
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-foreground hover:border-primary/50"
                }`}
              >
                {time}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="w-full h-14 text-lg font-semibold"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Submitting...
            </>
          ) : (
            <>
              <Calendar className="mr-2 h-5 w-5" /> Book My Free Demo <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Usually responds within 2 hours during business hours
        </p>
      </form>
    </Card>
  );
}
