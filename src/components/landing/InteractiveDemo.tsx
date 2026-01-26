import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { 
  Calendar, 
  Users, 
  BarChart3, 
  Bell, 
  Settings,
  Home,
  CheckCircle2,
  Clock,
  MapPin,
  DollarSign,
  TrendingUp,
  Sparkles,
  ArrowRight
} from "lucide-react";

const mockBookings = [
  { id: 1, customer: "Sarah Johnson", address: "123 Oak Street", time: "9:00 AM", status: "confirmed", service: "Deep Clean" },
  { id: 2, customer: "Michael Chen", address: "456 Maple Ave", time: "11:30 AM", status: "in_progress", service: "Standard Clean" },
  { id: 3, customer: "Emily Davis", address: "789 Pine Road", time: "2:00 PM", status: "confirmed", service: "Move Out Clean" },
];

const mockStats = {
  todayBookings: 8,
  revenue: "$1,840",
  activeCleaners: 5,
  completionRate: "94%"
};

type TabType = "dashboard" | "bookings" | "staff" | "reports";

export function InteractiveDemo() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  const handleStartFreeTrial = () => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/signup");
  };

  const tabs = [
    { id: "dashboard" as TabType, label: "Dashboard", icon: Home },
    { id: "bookings" as TabType, label: "Bookings", icon: Calendar },
    { id: "staff" as TabType, label: "Staff", icon: Users },
    { id: "reports" as TabType, label: "Reports", icon: BarChart3 },
  ];

  return (
    <section id="demo" className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/30">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Interactive Demo
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            See the Dashboard in Action
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Explore TIDYWISE before you sign up. This is what your cleaning business dashboard looks like.
          </p>
        </div>

        {/* Demo Container */}
        <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden max-w-5xl mx-auto">
          {/* Browser Chrome */}
          <div className="bg-sidebar px-4 py-3 flex items-center gap-3 border-b border-border">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-destructive/60" />
              <div className="w-3 h-3 rounded-full bg-warning/60" />
              <div className="w-3 h-3 rounded-full bg-success/60" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="bg-background/50 rounded-md px-4 py-1 text-sm text-muted-foreground">
                app.tidywise.com/dashboard
              </div>
            </div>
          </div>

          {/* App Layout */}
          <div className="flex">
            {/* Sidebar */}
            <div className="w-16 md:w-56 bg-sidebar border-r border-border p-3 hidden sm:block">
              <div className="font-bold text-lg text-sidebar-foreground mb-6 hidden md:block">
                TIDYWISE
              </div>
              <nav className="space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent"
                    }`}
                  >
                    <tab.icon className="h-5 w-5" />
                    <span className="hidden md:inline">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 md:p-6 min-h-[400px]">
              {/* Mobile Tabs */}
              <div className="sm:hidden flex gap-2 mb-4 overflow-x-auto pb-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap text-sm ${
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Dashboard View */}
              {activeTab === "dashboard" && (
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-foreground">Today's Overview</h3>
                  
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-secondary rounded-lg p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Calendar className="h-4 w-4" />
                        Bookings
                      </div>
                      <div className="text-2xl font-bold text-foreground">{mockStats.todayBookings}</div>
                    </div>
                    <div className="bg-secondary rounded-lg p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <DollarSign className="h-4 w-4" />
                        Revenue
                      </div>
                      <div className="text-2xl font-bold text-foreground">{mockStats.revenue}</div>
                    </div>
                    <div className="bg-secondary rounded-lg p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <Users className="h-4 w-4" />
                        Active Staff
                      </div>
                      <div className="text-2xl font-bold text-foreground">{mockStats.activeCleaners}</div>
                    </div>
                    <div className="bg-secondary rounded-lg p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                        <TrendingUp className="h-4 w-4" />
                        Completion
                      </div>
                      <div className="text-2xl font-bold text-foreground">{mockStats.completionRate}</div>
                    </div>
                  </div>

                  {/* Upcoming Bookings */}
                  <div>
                    <h4 className="font-medium text-foreground mb-3">Upcoming Jobs</h4>
                    <div className="space-y-2">
                      {mockBookings.slice(0, 2).map((booking) => (
                        <div key={booking.id} className="bg-secondary rounded-lg p-3 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Sparkles className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-foreground truncate">{booking.customer}</div>
                            <div className="text-sm text-muted-foreground truncate">{booking.address}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-foreground">{booking.time}</div>
                            <div className={`text-xs px-2 py-0.5 rounded-full ${
                              booking.status === "in_progress" 
                                ? "bg-warning/10 text-warning" 
                                : "bg-success/10 text-success"
                            }`}>
                              {booking.status === "in_progress" ? "In Progress" : "Confirmed"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Bookings View */}
              {activeTab === "bookings" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-foreground">Today's Bookings</h3>
                    <Button size="sm" className="text-xs">+ New Booking</Button>
                  </div>
                  
                  <div className="space-y-3">
                    {mockBookings.map((booking) => (
                      <div key={booking.id} className="bg-secondary rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium text-foreground">{booking.customer}</div>
                            <div className="text-sm text-primary">{booking.service}</div>
                          </div>
                          <div className={`text-xs px-2 py-1 rounded-full ${
                            booking.status === "in_progress" 
                              ? "bg-warning/10 text-warning" 
                              : "bg-success/10 text-success"
                          }`}>
                            {booking.status === "in_progress" ? "In Progress" : "Confirmed"}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {booking.time}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {booking.address}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Staff View */}
              {activeTab === "staff" && (
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-foreground">Active Cleaners</h3>
                  
                  <div className="grid gap-3">
                    {["Maria G.", "James K.", "Ana P.", "David L.", "Sophie R."].map((name, i) => (
                      <div key={name} className="bg-secondary rounded-lg p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">
                          {name.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{name}</div>
                          <div className="text-sm text-muted-foreground">
                            {i === 1 ? "On Job - 456 Maple Ave" : i === 3 ? "On Break" : "Available"}
                          </div>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${
                          i === 1 ? "bg-warning" : i === 3 ? "bg-muted" : "bg-success"
                        }`} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reports View */}
              {activeTab === "reports" && (
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold text-foreground">Weekly Performance</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-secondary rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">This Week Revenue</div>
                      <div className="text-2xl font-bold text-foreground">$8,450</div>
                      <div className="text-sm text-success">+12% vs last week</div>
                    </div>
                    <div className="bg-secondary rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">Jobs Completed</div>
                      <div className="text-2xl font-bold text-foreground">42</div>
                      <div className="text-sm text-success">+8% vs last week</div>
                    </div>
                    <div className="bg-secondary rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">Avg Job Value</div>
                      <div className="text-2xl font-bold text-foreground">$201</div>
                      <div className="text-sm text-success">+$15 vs last week</div>
                    </div>
                    <div className="bg-secondary rounded-lg p-4">
                      <div className="text-sm text-muted-foreground mb-1">Customer Rating</div>
                      <div className="text-2xl font-bold text-foreground">4.9★</div>
                      <div className="text-sm text-muted-foreground">Based on 28 reviews</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-8">
          <Button size="lg" onClick={handleStartFreeTrial}>
            Start Your Free Trial <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-sm text-muted-foreground mt-2">
            No credit card required. 2 months free.
          </p>
        </div>
      </div>
    </section>
  );
}
