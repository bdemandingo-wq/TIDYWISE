import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Calendar, Users, CreditCard, BarChart3, Bell, Zap, CheckCircle2, ArrowRight,
  Star, Menu, X, Play, ClipboardList, Settings, Home, Send, FileText, UserCircle,
  Clock, MapPin, Sparkles, ArrowRightLeft, ChevronUp,
} from "lucide-react";
import { Seo } from "@/components/Seo";
import { TermsOfServiceDialog } from "@/components/legal/TermsOfServiceDialog";

/* ─── Scroll reveal hook ─── */
function useScrollReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setIsVisible(true); obs.disconnect(); } },
      { threshold, rootMargin: "40px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, isVisible };
}

/* ─── Animated counter ─── */
function AnimatedCounter({ target, suffix = "", prefix = "" }: { target: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const duration = 1500;
        const start = performance.now();
        const step = (now: number) => {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          setCount(Math.floor(eased * target));
          setProgress(eased * 100);
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        obs.disconnect();
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);

  return (
    <span ref={ref} className="relative">
      {prefix}{count}{suffix}
      <span
        className="absolute -bottom-2 left-0 h-0.5 bg-primary rounded-full transition-all duration-100"
        style={{ width: `${progress}%` }}
      />
    </span>
  );
}

/* ─── Floating particles ─── */
function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 10 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 7 + 8,
      delay: Math.random() * -15,
    }))
  ).current;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-emerald-400/30"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size * 2}px`,
            height: `${p.size * 2}px`,
            animation: `floatParticle ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Dashboard Preview ─── */
type PreviewTab = "Dashboard" | "Bookings" | "Reports";

function DashboardPreview() {
  const [activeTab, setActiveTab] = useState<PreviewTab>("Dashboard");

  const sideNavItems = [
    { name: "Dashboard", icon: Home, active: true },
    { name: "Bookings", icon: ClipboardList, active: false },
    { name: "Clients", icon: Users, active: false },
    { name: "Staff", icon: UserCircle, active: false },
    { name: "Reports", icon: BarChart3, active: false },
    { name: "Settings", icon: Settings, active: false },
  ];

  return (
    <div className="mt-16 max-w-5xl mx-auto relative">
      <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-3xl" />

      <div className="relative flex justify-center gap-1 mb-4">
        {(["Dashboard", "Bookings", "Reports"] as PreviewTab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${
              activeTab === tab ? "text-primary border-b-2 border-primary bg-primary/5" : "text-slate-500 hover:text-slate-300"
            }`}>
            {tab}
          </button>
        ))}
      </div>

      <div className="relative bg-slate-900 rounded-2xl border border-slate-700/50 overflow-hidden"
        style={{ boxShadow: "0 0 0 1px rgba(16,185,129,0.2), 0 20px 60px rgba(0,0,0,0.5), 0 0 80px rgba(16,185,129,0.08)" }}>
        <div className="bg-slate-800 px-4 py-3 flex items-center gap-3">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <div className="bg-slate-700 rounded text-slate-400 text-xs px-3 py-1 ml-4 flex-1 max-w-xs">app.tidywise.com/dashboard</div>
        </div>

        <div className="flex min-h-[340px]">
          <div className="hidden sm:block w-48 bg-slate-900 border-r border-slate-700/50 py-4 px-3 space-y-1">
            <div className="flex items-center gap-2 px-3 mb-4">
              <span className="font-bold text-sm text-white">Tidy<span className="text-emerald-400">Wise</span></span>
            </div>
            {sideNavItems.map((item) => (
              <div key={item.name} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                item.active ? "bg-primary/15 text-primary" : "text-slate-400 hover:text-slate-300"
              }`}>
                <item.icon className="w-4 h-4" />
                {item.name}
              </div>
            ))}
          </div>

          <div className="flex-1 p-5 bg-slate-950 transition-opacity duration-200">
            {activeTab === "Dashboard" && (
              <div className="space-y-4 animate-fade-in">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Today's Cleans", value: "12", sub: "+3 vs yesterday", color: "text-primary" },
                    { label: "Revenue", value: "$2,450", sub: "This week", color: "text-green-400" },
                    { label: "Active Clients", value: "87", sub: "+5 new", color: "text-sky-400" },
                    { label: "Team Available", value: "6/8", sub: "2 on job", color: "text-amber-400" },
                  ].map((s, i) => (
                    <div key={i} className="bg-slate-900 rounded-xl p-4 border border-slate-700/30">
                      <p className="text-slate-400 text-xs mb-1">{s.label}</p>
                      <p className="text-xl font-bold text-white">{s.value}</p>
                      <p className={`text-xs mt-1 ${s.color}`}>{s.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => (
                    <div key={d} className="flex-1 bg-slate-900 rounded-lg p-2 text-center border border-slate-700/30">
                      <p className="text-slate-500 text-[10px] mb-1">{d}</p>
                      <p className="text-white text-xs font-medium">{10+i}</p>
                      <div className="flex gap-0.5 justify-center mt-1">
                        {i < 5 && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        {i < 3 && <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-slate-900 rounded-xl border border-slate-700/30 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-700/30"><p className="text-white text-xs font-medium">Upcoming Bookings</p></div>
                  {[
                    { name: "Sarah Johnson", addr: "123 Oak St", status: "Confirmed", badge: "bg-green-500/20 text-green-400" },
                    { name: "Mike Chen", addr: "456 Pine Ave", status: "In Progress", badge: "bg-primary/20 text-primary" },
                    { name: "Lisa Park", addr: "789 Elm Dr", status: "Complete", badge: "bg-slate-600/30 text-slate-400" },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center px-4 py-2.5 border-b border-slate-700/20 last:border-0">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 flex items-center justify-center text-white text-[10px] font-bold mr-3">{r.name[0]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{r.name}</p>
                        <p className="text-slate-500 text-[10px]">{r.addr}</p>
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${r.badge}`}>{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === "Bookings" && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <p className="text-white text-sm font-medium">This Week's Schedule</p>
                  <div className="bg-primary/20 text-primary text-xs px-3 py-1 rounded-full font-medium">+ New Booking</div>
                </div>
                {[
                  { time: "9:00 AM", client: "Sarah Johnson", service: "Deep Clean", duration: "3h", status: "Confirmed" },
                  { time: "10:30 AM", client: "David Wilson", service: "Standard Clean", duration: "2h", status: "In Progress" },
                  { time: "1:00 PM", client: "Emma Davis", service: "Move-Out Clean", duration: "4h", status: "Pending" },
                  { time: "3:00 PM", client: "James Brown", service: "Standard Clean", duration: "2h", status: "Confirmed" },
                ].map((b, i) => (
                  <div key={i} className="bg-slate-900 rounded-xl p-3 border border-slate-700/30 flex items-center gap-3">
                    <div className="text-center min-w-[56px]">
                      <p className="text-primary text-xs font-bold">{b.time}</p>
                      <p className="text-slate-500 text-[10px]">{b.duration}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium">{b.client}</p>
                      <p className="text-slate-400 text-[10px]">{b.service}</p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      b.status === "Confirmed" ? "bg-green-500/20 text-green-400" :
                      b.status === "In Progress" ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-400"
                    }`}>{b.status}</span>
                  </div>
                ))}
              </div>
            )}
            {activeTab === "Reports" && (
              <div className="space-y-4 animate-fade-in">
                <p className="text-white text-sm font-medium">Revenue Overview</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "This Month", value: "$12,450", change: "+12%" },
                    { label: "Avg Job Value", value: "$185", change: "+8%" },
                    { label: "Bookings", value: "67", change: "+15%" },
                  ].map((s, i) => (
                    <div key={i} className="bg-slate-900 rounded-xl p-3 border border-slate-700/30">
                      <p className="text-slate-400 text-[10px]">{s.label}</p>
                      <p className="text-white text-lg font-bold">{s.value}</p>
                      <p className="text-green-400 text-[10px]">{s.change}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-slate-900 rounded-xl p-4 border border-slate-700/30">
                  <p className="text-slate-400 text-xs mb-3">Weekly Revenue</p>
                  <div className="flex items-end gap-2 h-24">
                    {[40, 65, 55, 80, 70, 90, 60].map((h, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full rounded-t bg-gradient-to-t from-primary to-primary/60 transition-all duration-500" style={{ height: `${h}%` }} />
                        <span className="text-slate-500 text-[9px]">{["M","T","W","T","F","S","S"][i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Competitor Comparison ─── */
function CompetitorComparisonSection() {
  const reveal = useScrollReveal();
  const comparisonData = [
    { feature: "60-day free trial", tw: true, jobber: false, housecall: false, bk: false },
    { feature: "Client self-booking portal", tw: true, jobber: true, housecall: true, bk: true },
    { feature: "Automated SMS reminders", tw: true, jobber: true, housecall: true, bk: false },
    { feature: "Drag & drop scheduling", tw: true, jobber: true, housecall: false, bk: true },
    { feature: "Staff GPS check-in", tw: true, jobber: true, housecall: true, bk: false },
    { feature: "AI-powered insights", tw: true, jobber: false, housecall: false, bk: false },
    { feature: "Built-in invoicing", tw: true, jobber: true, housecall: true, bk: true },
    { feature: "Recurring booking automation", tw: true, jobber: true, housecall: true, bk: true },
    { feature: "Cleaner-facing mobile app", tw: true, jobber: true, housecall: true, bk: false },
    { feature: "Starting price", tw: "$49/mo", jobber: "$69/mo", housecall: "$65/mo", bk: "$39/mo" },
  ];

  const renderCell = (val: boolean | string) => {
    if (typeof val === "string") return <span className="text-sm font-semibold text-slate-700">{val}</span>;
    if (val) return (
      <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
        <span className="text-emerald-500 font-bold text-lg">✓</span>
      </div>
    );
    return <span className="text-slate-300 text-lg mx-auto block text-center">✗</span>;
  };

  return (
    <section
      ref={reveal.ref}
      className={`bg-slate-50 py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${
        reveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
    >
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-primary text-xs font-bold tracking-widest mb-3">WHY TIDYWISE</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">The smarter choice for cleaning businesses</h2>
          <p className="text-slate-500 text-lg mt-4">See how TidyWise stacks up against the competition</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left p-4 text-sm font-medium text-slate-500">Feature</th>
                  <th className="p-4 text-center">
                    <div className="bg-emerald-500 text-white font-bold text-sm rounded-lg px-3 py-2 inline-block">
                      TidyWise
                      <div className="text-[10px] font-medium bg-white/20 rounded-full px-2 py-0.5 mt-1">⭐ Best Value</div>
                    </div>
                  </th>
                  <th className="p-4 text-center text-sm font-medium text-slate-500">Jobber</th>
                  <th className="p-4 text-center text-sm font-medium text-slate-500">Housecall Pro</th>
                  <th className="p-4 text-center text-sm font-medium text-slate-500">Booking Koala</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row, i) => (
                  <tr key={i} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                    <td className="p-4 text-sm text-slate-700 font-medium">{row.feature}</td>
                    <td className="p-4 text-center bg-emerald-50/30 border-x border-emerald-100">{renderCell(row.tw)}</td>
                    <td className="p-4 text-center">{renderCell(row.jobber)}</td>
                    <td className="p-4 text-center">{renderCell(row.housecall)}</td>
                    <td className="p-4 text-center">{renderCell(row.bk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Switch-from cards */}
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {["Jobber", "Housecall Pro", "Booking Koala"].map((name) => (
            <div key={name} className="bg-white rounded-xl border border-slate-200 p-5 text-center hover:shadow-md hover:border-slate-300 transition-all duration-200">
              <ArrowRightLeft className="h-6 w-6 text-primary mx-auto" />
              <p className="text-slate-900 font-semibold text-sm mt-3">Switching from {name}?</p>
              <p className="text-slate-500 text-sm mt-1">We'll import your data free</p>
              <button className="text-primary text-sm font-medium mt-2 hover:underline">Learn more →</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Features data ─── */
const features = [
  { icon: Calendar, title: "Smart Scheduling", description: "Drag-and-drop calendar with auto-assignment by location, skills, and availability. Recurring bookings run on autopilot.", large: true },
  { icon: Bell, title: "Automated Reminders", description: "SMS and email reminders sent automatically. Reduce no-shows by 80%.", large: false },
  { icon: Users, title: "Client Portal", description: "Clients book online, view history, manage appointments, and track loyalty rewards — all self-service.", large: true },
  { icon: UserCircle, title: "Staff Management", description: "Track your team's schedule, performance, GPS check-ins, and payroll in one place.", large: false },
  { icon: BarChart3, title: "Revenue Reports", description: "Real-time P&L, revenue forecasting, and AI-powered business intelligence dashboards.", large: false },
  { icon: FileText, title: "One-tap Invoicing", description: "Generate and send professional invoices with one click. Auto-charge saved cards after each job.", large: false },
];

const testimonials = [
  { quote: "This platform transformed how we run our cleaning business. Bookings increased 40% in the first month and we've never looked back.", author: "Sarah M.", role: "Owner, Sparkle Clean Co.", avatar: "SM" },
  { quote: "The staff portal is incredible. My team manages their own schedules and I track everything in real-time. It's like having an extra manager.", author: "Michael R.", role: "Founder, Fresh Start Services", avatar: "MR" },
  { quote: "Finally, software that understands cleaning businesses. The automated invoicing alone saves me 5 hours every single week.", author: "Jennifer L.", role: "CEO, Elite Home Care", avatar: "JL" },
];

/* ─── Mini visuals for large feature cards ─── */
function MiniCalendar() {
  const blocks = [
    { col: 0, row: 0, h: 2, color: "bg-emerald-400" },
    { col: 1, row: 1, h: 1, color: "bg-sky-400" },
    { col: 2, row: 0, h: 3, color: "bg-emerald-400" },
    { col: 3, row: 2, h: 1, color: "bg-violet-400" },
    { col: 4, row: 0, h: 2, color: "bg-sky-400" },
  ];
  return (
    <div className="mt-4 grid grid-cols-5 gap-1 h-20">
      {blocks.map((b, i) => (
        <div key={i} className="relative">
          <div className={`absolute left-0 right-0 rounded ${b.color} opacity-70`}
            style={{ top: `${b.row * 25}%`, height: `${b.h * 25}%` }} />
          <div className="text-[8px] text-slate-400 text-center">{["Mon","Tue","Wed","Thu","Fri"][i]}</div>
        </div>
      ))}
    </div>
  );
}

function MiniClientCard() {
  return (
    <div className="mt-4 bg-slate-50 rounded-lg border border-slate-200 p-3 text-left max-w-[220px]">
      <p className="text-[10px] text-slate-400 font-medium">YOUR UPCOMING CLEANING</p>
      <p className="text-xs font-semibold text-slate-900 mt-1">Deep Clean — Mar 28</p>
      <p className="text-[10px] text-slate-500">Cleaner: Maria S.</p>
      <div className="flex items-center gap-1 mt-1.5">
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
        <span className="text-[10px] font-medium text-emerald-600">Confirmed</span>
      </div>
    </div>
  );
}

/* ─── Back to top button ─── */
function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const handleScroll = () => setShow(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all duration-200 animate-fade-in"
      aria-label="Back to top"
    >
      <ChevronUp className="h-5 w-5" />
    </button>
  );
}

/* ─── Wordmark component ─── */
function Wordmark({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={`font-bold text-xl tracking-tight ${className}`}>
      <span className={dark ? "text-white" : "text-slate-900"}>Tidy</span>
      <span className="text-emerald-500">Wise</span>
    </span>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);

  const featuresReveal = useScrollReveal();
  const stepsReveal = useScrollReveal();
  const testimonialsReveal = useScrollReveal();
  const statsReveal = useScrollReveal();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileMenuOpen]);

  const handleGetStarted = () => {
    sessionStorage.setItem("selectedIndustry", "Home Cleaning");
    navigate("/signup");
  };

  return (
    <div className="min-h-screen overflow-x-hidden scroll-smooth">
      <Seo
        title="Cleaning Business Software | TIDYWISE"
        description="Smart scheduling, automated payroll, CRM, GPS tracking & online booking for cleaning businesses. Start your 60-day free trial today."
        canonicalPath="/"
        ogImage="/images/tidywise-og.png"
        jsonLd={[
          { "@type": "Organization", "name": "TIDYWISE", "url": "https://www.jointidywise.com", "logo": "https://www.jointidywise.com/images/tidywise-logo.png" },
          { "@type": "SoftwareApplication", "name": "TIDYWISE", "applicationCategory": "BusinessApplication", "operatingSystem": "Web, iOS, Android",
            "offers": { "@type": "Offer", "price": "50.00", "priceCurrency": "USD", "priceValidUntil": "2027-12-31" },
            "description": "All-in-one cleaning business management software." }
        ]}
      />

      <BackToTop />

      {/* ────── NAVBAR ────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] transition-all duration-300 ${
        isScrolled ? "bg-white/95 backdrop-blur-md border-b border-slate-200/60 shadow-sm" : "bg-transparent"
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Wordmark dark={!isScrolled} />

            <div className="hidden md:flex items-center gap-8">
              {["Features", "Pricing", "Blog", "Testimonials"].map((item) => (
                <a key={item} href={`#${item.toLowerCase()}`}
                  className={`text-sm font-medium transition-colors ${isScrolled ? "text-slate-600 hover:text-slate-900" : "text-slate-300 hover:text-white"}`}>
                  {item}
                </a>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-4">
              <button onClick={() => navigate("/login")}
                className={`text-sm font-medium transition-colors ${isScrolled ? "text-slate-600 hover:text-slate-900" : "text-slate-300 hover:text-white"}`}>
                Log in
              </button>
              <Button size="sm" onClick={() => navigate("/signup")}>
                Start Free Trial <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            <button className="md:hidden p-2 rounded-lg" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
              {mobileMenuOpen
                ? <X className={`h-6 w-6 ${isScrolled ? "text-slate-900" : "text-white"}`} />
                : <Menu className={`h-6 w-6 ${isScrolled ? "text-slate-900" : "text-white"}`} />
              }
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
              <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} aria-label="Close" />
              <div className="absolute left-3 right-3 top-[calc(4.5rem+env(safe-area-inset-top))]">
                <div className="rounded-2xl bg-white shadow-xl border border-slate-200 p-3 space-y-1">
                  {["Features", "Pricing", "Blog", "Testimonials"].map((item) => (
                    <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setMobileMenuOpen(false)}
                      className="block px-4 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors">
                      {item}
                    </a>
                  ))}
                  <hr className="my-2 border-slate-100" />
                  <button onClick={() => { setMobileMenuOpen(false); navigate("/login"); }}
                    className="block w-full text-left px-4 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg text-sm font-medium">
                    Log in
                  </button>
                  <Button className="w-full mt-1" onClick={() => { setMobileMenuOpen(false); navigate("/signup"); }}>
                    Start Free Trial <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* ────── HERO ────── */}
      <section className="relative bg-slate-950 pt-[calc(7rem+env(safe-area-inset-top))] pb-0 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Animated gradient mesh */}
        <div className="absolute inset-0 overflow-hidden hero-gradient-bg" />
        <FloatingParticles />

        <div className="relative max-w-4xl mx-auto text-center py-16 md:py-24">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 border border-primary/20 text-primary text-xs font-semibold rounded-full mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Built for cleaning businesses
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-6">
            Run your cleaning business{" "}
            <br className="hidden sm:block" />
            like a <span className="text-primary">well-oiled machine</span>
          </h1>

          <p className="text-slate-400 text-lg sm:text-xl max-w-xl mx-auto leading-relaxed mb-10">
            TidyWise gives you scheduling, client management, automated reminders, and real-time reporting — everything your team needs in one place.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="xl" onClick={handleGetStarted} className="shadow-lg shadow-primary/25 hover:shadow-primary/40">
              Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all duration-200 font-medium">
              <Play className="h-4 w-4" /> Watch Demo
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 mt-6 text-slate-500 text-sm">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Free 60 days</span>
            <span>·</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> No credit card</span>
            <span>·</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Cancel anytime</span>
          </div>
        </div>

        <DashboardPreview />
        <div className="h-32 bg-gradient-to-b from-slate-950 to-white" />
      </section>

      {/* ────── STATS BAR ────── */}
      <section
        ref={statsReveal.ref}
        className={`bg-white py-16 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${
          statsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 md:divide-x divide-slate-200">
          {[
            { value: 500, suffix: "+", label: "Cleaning businesses" },
            { value: 98, suffix: "%", label: "Client satisfaction" },
            { value: 3, suffix: "hrs", label: "Saved per week on average" },
            { prefix: "$", value: 12, suffix: "k+", label: "Revenue tracked monthly" },
          ].map((stat, i) => (
            <div key={i} className="text-center px-4">
              <p className="text-4xl font-bold text-slate-900 relative inline-block">
                <AnimatedCounter target={stat.value} suffix={stat.suffix} prefix={stat.prefix || ""} />
              </p>
              <p className="text-slate-500 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ────── FEATURES ────── */}
      <section
        id="features"
        ref={featuresReveal.ref}
        className={`bg-white py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${
          featuresReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-primary text-xs font-bold tracking-widest mb-3">FEATURES</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Everything you need, nothing you don't</h2>
            <p className="text-slate-500 text-lg mt-4">Purpose-built tools for cleaning businesses that actually work the way you do.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className={`group relative bg-white rounded-2xl border border-slate-200 p-8 overflow-hidden transition-all duration-250 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-100/50 ${
                  feature.large ? "md:col-span-2" : ""
                }`}
                style={{
                  transitionDelay: featuresReveal.isVisible ? `${index * 100}ms` : "0ms",
                  opacity: featuresReveal.isVisible ? 1 : 0,
                  transform: featuresReveal.isVisible ? "translateY(0)" : "translateY(24px)",
                }}
              >
                {/* Hover gradient line at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-emerald-300 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                {/* Hover glow */}
                <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div className="relative">
                  <feature.icon className="h-8 w-8 text-primary mb-5 group-hover:scale-110 transition-transform duration-200" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">{feature.title}</h3>
                  <p className="text-slate-500 leading-relaxed">{feature.description}</p>
                  {feature.title === "Smart Scheduling" && feature.large && <MiniCalendar />}
                  {feature.title === "Client Portal" && feature.large && <MiniClientCard />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────── COMPETITOR COMPARISON ────── */}
      <CompetitorComparisonSection />

      {/* ────── HOW IT WORKS ────── */}
      <section
        ref={stepsReveal.ref}
        className={`bg-white py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${
          stepsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-primary text-xs font-bold tracking-widest mb-3">HOW IT WORKS</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Up and running in minutes</h2>
            <p className="text-slate-500 text-lg mt-4">Three simple steps to transform your cleaning business.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting animated dashed line */}
            <div className="hidden md:block absolute top-6 left-[16.67%] right-[16.67%] h-[2px] overflow-hidden">
              <div className="h-full w-full animated-dash-line" />
            </div>

            {[
              { num: "1", title: "Add your clients & team", desc: "Import contacts from a CSV or add them one by one. Set up staff profiles with skills, availability, and pay rates." },
              { num: "2", title: "Schedule & automate", desc: "Drag bookings onto the calendar, set up recurring appointments, and let automated reminders handle the rest." },
              { num: "3", title: "Get paid & grow", desc: "Track revenue, send one-tap invoices, read AI-powered insights, and watch your business scale." },
            ].map((step, i) => (
              <div
                key={i}
                className="text-center relative"
                style={{
                  transitionDelay: stepsReveal.isVisible ? `${i * 150}ms` : "0ms",
                  opacity: stepsReveal.isVisible ? 1 : 0,
                  transform: stepsReveal.isVisible ? "translateY(0)" : "translateY(24px)",
                  transition: "opacity 0.5s ease, transform 0.5s ease",
                }}
              >
                <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto relative step-pulse-ring">
                  {step.num}
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mt-6">{step.title}</h3>
                <p className="text-slate-500 text-base mt-2 max-w-xs mx-auto">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────── TESTIMONIALS ────── */}
      <section
        id="testimonials"
        ref={testimonialsReveal.ref}
        className={`bg-slate-50 py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${
          testimonialsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-primary text-xs font-bold tracking-widest mb-3">TESTIMONIALS</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Loved by cleaning businesses everywhere</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, index) => (
              <div key={index}
                className="relative bg-white rounded-2xl border border-slate-200 p-8 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200"
                style={{
                  transitionDelay: testimonialsReveal.isVisible ? `${index * 100}ms` : "0ms",
                  opacity: testimonialsReveal.isVisible ? 1 : 0,
                  transform: testimonialsReveal.isVisible ? "translateY(0)" : "translateY(24px)",
                  transition: "opacity 0.5s ease, transform 0.5s ease",
                }}
              >
                <span className="absolute top-4 right-6 text-8xl font-serif text-primary/10 leading-none select-none">"</span>
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-700 leading-relaxed italic relative z-10">"{t.quote}"</p>
                <div className="flex items-center gap-3 mt-6">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">{t.avatar}</div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{t.author}</p>
                    <p className="text-slate-400 text-xs">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────── PRICING ────── */}
      <section id="pricing" className="bg-slate-950 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-primary text-xs font-bold tracking-widest mb-3">PRICING</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Simple, transparent pricing</h2>
            <p className="text-slate-400 text-lg mt-4">No hidden fees. No per-user charges. Just one flat price.</p>

            <div className="flex items-center justify-center gap-3 mt-8">
              <span className={`text-sm font-medium ${!isAnnual ? "text-white" : "text-slate-500"}`}>Monthly</span>
              <button onClick={() => setIsAnnual(!isAnnual)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${isAnnual ? "bg-primary" : "bg-slate-700"}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${isAnnual ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
              <span className={`text-sm font-medium ${isAnnual ? "text-white" : "text-slate-500"}`}>Annual</span>
              {isAnnual && <span className="bg-primary/20 text-primary text-xs font-semibold px-2 py-0.5 rounded-full">Save 20%</span>}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-stretch">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8">
              <h3 className="text-white text-xl font-semibold">Starter</h3>
              <p className="text-slate-400 text-sm mt-1">For solo operators</p>
              <div className="mt-6">
                <span className="text-white text-4xl font-bold">${isAnnual ? "39" : "49"}</span>
                <span className="text-slate-400 text-sm">/mo</span>
              </div>
              <ul className="mt-6 space-y-3">
                {["Unlimited bookings", "Client portal", "SMS reminders", "Basic reports", "1 staff member"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-slate-300 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button onClick={handleGetStarted}
                className="w-full mt-8 border border-primary text-primary hover:bg-primary hover:text-white rounded-xl px-6 py-3 font-semibold transition-all duration-150">
                Start Free Trial
              </button>
            </div>

            <div className="relative bg-primary rounded-2xl p-8 shadow-2xl shadow-primary/30 md:scale-105">
              <div className="absolute top-4 right-4 bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">Most Popular</div>
              <h3 className="text-white text-xl font-semibold">Pro</h3>
              <p className="text-white/70 text-sm mt-1">For growing teams</p>
              <div className="mt-6">
                <span className="text-white text-4xl font-bold">${isAnnual ? "79" : "99"}</span>
                <span className="text-white/60 text-sm">/mo</span>
              </div>
              <ul className="mt-6 space-y-3">
                {["Everything in Starter", "Unlimited staff", "AI intelligence", "Advanced reports", "Payroll & expenses", "Priority support"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-white text-sm">
                    <CheckCircle2 className="w-4 h-4 text-white flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button onClick={handleGetStarted}
                className="w-full mt-8 bg-white text-primary hover:bg-slate-100 rounded-xl px-6 py-3 font-bold transition-all duration-150">
                Start Free Trial
              </button>
            </div>
          </div>

          <p className="text-slate-400 text-sm text-center mt-8">All plans include 60-day free trial · No credit card required</p>
        </div>
      </section>

      {/* ────── FINAL CTA ────── */}
      <section className="bg-gradient-to-r from-primary/90 to-primary py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Ready to grow your cleaning business?</h2>
          <p className="text-white/80 text-lg mt-4">Join hundreds of cleaning companies saving time with TidyWise.</p>
          <button onClick={handleGetStarted}
            className="mt-8 inline-flex items-center gap-2 bg-white text-primary font-bold px-10 py-4 rounded-xl hover:bg-slate-50 shadow-xl hover:shadow-2xl transition-all duration-200">
            Start Your Free Trial <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </section>

      {/* ────── FOOTER ────── */}
      <footer className="bg-slate-950 border-t border-slate-800 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="mb-4"><Wordmark dark /></div>
              <p className="text-slate-400 text-sm leading-relaxed">The complete platform to run and grow your cleaning business.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Product</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">Features</a></li>
                <li><a href="#pricing" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">Pricing</a></li>
                <li><a href="#blog" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Company</h4>
              <ul className="space-y-3">
                <li><a href="mailto:support@tidywisecleaning.com" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">Contact</a></li>
                <li><Link to="/privacy-policy" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">Privacy</Link></li>
                <li><TermsOfServiceDialog><button className="text-slate-400 text-sm hover:text-slate-200 transition-colors">Terms</button></TermsOfServiceDialog></li>
                <li><Link to="/delete-account" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">Delete Account</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Compare</h4>
              <ul className="space-y-3">
                <li><Link to="/compare/jobber" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">vs Jobber</Link></li>
                <li><Link to="/compare/booking-koala" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">vs Booking Koala</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-slate-500 text-sm">© {new Date().getFullYear()} TidyWise. All rights reserved.</p>
            <p className="text-slate-600 text-sm">Made for cleaning professionals</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
