import { Check, X, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface Feature {
  name: string;
  tidywise: boolean | string;
  bookingKoala: boolean | string;
  jobber: boolean | string;
}

const features: Feature[] = [
  { name: "Online Booking Form", tidywise: true, bookingKoala: true, jobber: true },
  { name: "Recurring Bookings", tidywise: true, bookingKoala: true, jobber: true },
  { name: "Staff Portal & App", tidywise: true, bookingKoala: true, jobber: true },
  { name: "GPS Check-ins", tidywise: true, bookingKoala: true, jobber: "Add-on" },
  { name: "Stripe Payments", tidywise: true, bookingKoala: true, jobber: true },
  { name: "SMS Notifications", tidywise: true, bookingKoala: "Add-on", jobber: "Add-on" },
  { name: "Loyalty Programs", tidywise: true, bookingKoala: true, jobber: false },
  { name: "Lead Management", tidywise: true, bookingKoala: true, jobber: true },
  { name: "Quote Generator", tidywise: true, bookingKoala: true, jobber: true },
  { name: "Inventory Tracking", tidywise: true, bookingKoala: false, jobber: false },
  { name: "Photo Documentation", tidywise: true, bookingKoala: true, jobber: true },
  { name: "Review Requests", tidywise: true, bookingKoala: "Premium", jobber: true },
  { name: "Multi-location", tidywise: true, bookingKoala: true, jobber: true },
  { name: "Custom Checklists", tidywise: true, bookingKoala: true, jobber: true },
  { name: "P&L Reports", tidywise: true, bookingKoala: false, jobber: false },
  { name: "Revenue Forecasting", tidywise: true, bookingKoala: false, jobber: false },
  { name: "Coupon Codes", tidywise: true, bookingKoala: true, jobber: true },
  { name: "Sales Tax Automation", tidywise: true, bookingKoala: true, jobber: true },
  { name: "Bed/Bath + SqFt Pricing", tidywise: true, bookingKoala: true, jobber: false },
  { name: "Home Condition Pricing", tidywise: true, bookingKoala: false, jobber: false },
  { name: "Demo/Test Mode", tidywise: true, bookingKoala: false, jobber: false },
  { name: "Offline Mode", tidywise: true, bookingKoala: false, jobber: false },
  { name: "In-App SMS Inbox", tidywise: true, bookingKoala: false, jobber: false },
];

const pricingPlans = [
  {
    name: "TIDYWISE",
    tagline: "Built for cleaning businesses",
    price: "$50",
    priceNote: "/month",
    trial: "2 months free",
    highlight: true,
  },
  {
    name: "Booking Koala",
    tagline: "General service booking",
    price: "$197",
    priceNote: "/month",
    trial: "14-day trial",
    highlight: false,
  },
  {
    name: "Jobber",
    tagline: "Field service management",
    price: "$349",
    priceNote: "/month",
    trial: "14-day trial",
    highlight: false,
  },
];

const renderFeatureValue = (value: boolean | string) => {
  if (value === true) {
    return <Check className="h-5 w-5 text-success mx-auto" />;
  }
  if (value === false) {
    return <X className="h-5 w-5 text-destructive/60 mx-auto" />;
  }
  return <span className="text-xs text-warning font-medium">{value}</span>;
};

export function CompetitorComparison() {
  const navigate = useNavigate();

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/30">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Compare & Save Thousands
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            See how TIDYWISE stacks up against the competition. More features, lower prices, built specifically for cleaning businesses.
          </p>
        </div>

        {/* Pricing Comparison */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {pricingPlans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-6 ${
                plan.highlight
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                  : "bg-card border border-border"
              }`}
            >
              <div className="text-center mb-6">
                <h3 className={`text-xl font-bold ${plan.highlight ? "" : "text-foreground"}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm ${plan.highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {plan.tagline}
                </p>
              </div>

              <div className={`p-6 rounded-lg text-center ${plan.highlight ? "bg-primary-foreground/10" : "bg-muted"}`}>
                <div className="flex items-baseline justify-center gap-1">
                  <span className={`text-4xl font-bold ${plan.highlight ? "" : "text-foreground"}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm ${plan.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {plan.priceNote}
                  </span>
                </div>
                <p className={`text-sm mt-2 font-medium ${plan.highlight ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                  {plan.trial}
                </p>
              </div>

              {plan.highlight && (
                <Button
                  variant="secondary"
                  className="w-full mt-6"
                  onClick={() => navigate("/auth?mode=signup")}
                >
                  Start 2-Month Free Trial
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Feature Comparison Table */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h3 className="text-xl font-semibold text-foreground">Feature Comparison</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Every feature TIDYWISE offers compared to the competition
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-4 font-medium text-foreground">Feature</th>
                  <th className="text-center p-4 font-medium text-primary">TIDYWISE</th>
                  <th className="text-center p-4 font-medium text-foreground">Booking Koala</th>
                  <th className="text-center p-4 font-medium text-foreground">Jobber</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {features.map((feature, index) => (
                  <tr key={feature.name} className={index % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="p-4 text-sm text-foreground">{feature.name}</td>
                    <td className="p-4 text-center">{renderFeatureValue(feature.tidywise)}</td>
                    <td className="p-4 text-center">{renderFeatureValue(feature.bookingKoala)}</td>
                    <td className="p-4 text-center">{renderFeatureValue(feature.jobber)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-center mt-12">
          <Button size="lg" onClick={() => navigate("/auth?mode=signup")}>
            Try TIDYWISE Free — No Credit Card Required
          </Button>
          <p className="text-sm text-muted-foreground mt-3">
            Join 20K+ cleaning businesses already using TIDYWISE
          </p>
        </div>
      </div>
    </section>
  );
}