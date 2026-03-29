import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Calendar, Users, CreditCard, BarChart3, Bell, Zap, CheckCircle2, ArrowRight,
  Star, Menu, X, Play, ClipboardList, Settings, Home, Send, FileText, UserCircle,
  Clock, MapPin, Sparkles, ArrowRightLeft, ChevronUp, MessageSquare, PieChart,
  TrendingUp, Phone, DollarSign, GripVertical, ChevronDown, Shield, Wrench,
  Mail, Smartphone, Globe, Lock, Database, Bot, Repeat, Receipt, UserCheck,
  Building2, LayoutDashboard,
} from "lucide-react";
import { Seo } from "@/components/Seo";
import { TermsOfServiceDialog } from "@/components/legal/TermsOfServiceDialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
      <span className="absolute -bottom-2 left-0 h-0.5 bg-primary rounded-full transition-all duration-100" style={{ width: `${progress}%` }} />
    </span>
  );
}

/* ─── Floating particles ─── */
function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 10 }, () => ({
      x: Math.random() * 100, y: Math.random() * 100,
      size: Math.random() * 3 + 1, duration: Math.random() * 7 + 8, delay: Math.random() * -15,
    }))
  ).current;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p, i) => (
        <div key={i} className="absolute rounded-full bg-emerald-400/30"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.size * 2}px`, height: `${p.size * 2}px`,
            animation: `floatParticle ${p.duration}s ease-in-out ${p.delay}s infinite alternate` }} />
      ))}
    </div>
  );
}

/* ─── Wordmark ─── */
function Wordmark({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={`font-bold text-xl tracking-tight ${className}`}>
      <span className={dark ? "text-white" : "text-slate-900"}>Tidy</span>
      <span className="text-emerald-500">Wise</span>
    </span>
  );
}

/* ─── Back to top ─── */
function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const h = () => setShow(window.scrollY > 400);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  if (!show) return null;
  return (
    <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all duration-200 animate-fade-in"
      aria-label="Back to top">
      <ChevronUp className="h-5 w-5" />
    </button>
  );
}

/* ─── Contact Sales Modal ─── */
function ContactSalesModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); setSubmitted(true); }, 1200);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setTimeout(() => setSubmitted(false), 300); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Talk to our team</DialogTitle>
          <DialogDescription>We'll set up your account and get your team onboarded.</DialogDescription>
        </DialogHeader>
        {submitted ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
            <p className="text-lg font-semibold text-foreground">We'll be in touch within 24 hours!</p>
            <p className="text-muted-foreground text-sm mt-2">Check your email for a confirmation.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input placeholder="Full name *" required />
            <Input placeholder="Business name *" required />
            <Input type="email" placeholder="Email *" required />
            <Input type="tel" placeholder="Phone number" />
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Number of staff</option>
              <option>1-5</option>
              <option>6-15</option>
              <option>16-30</option>
              <option>30+</option>
            </select>
            <textarea placeholder="Message (optional)" rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px]" />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Send Message <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ═══ HERO — Split layout ═══ */
function HeroBookingCard() {
  const [status, setStatus] = useState<"unscheduled" | "animating" | "confirmed">("unscheduled");
  useEffect(() => {
    const t1 = setTimeout(() => setStatus("animating"), 2000);
    const t2 = setTimeout(() => setStatus("confirmed"), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-5 w-full max-w-sm"
      style={{ boxShadow: "0 0 0 1px rgba(16,185,129,0.15), 0 20px 60px rgba(0,0,0,0.4), 0 0 60px rgba(16,185,129,0.06)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="h-4 w-4 text-primary" />
        <span className="text-white text-sm font-semibold">Schedule Booking</span>
      </div>
      <div className={`relative bg-slate-800 rounded-xl p-4 border transition-all duration-700 ${status === "confirmed" ? "border-emerald-500/50 shadow-lg shadow-emerald-500/10" : "border-slate-700/50"}`}>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 transition-opacity duration-300 ${status === "animating" ? "opacity-50" : ""}`}>
            <GripVertical className="h-4 w-4 text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium">Maria Chen</p>
            <p className="text-slate-400 text-xs mt-0.5">Deep Clean · 3 hours</p>
            <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1"><MapPin className="h-3 w-3" /> 742 Evergreen Terrace</p>
            <div className="flex items-center gap-2 mt-2"><Clock className="h-3 w-3 text-slate-500" /><span className="text-slate-400 text-xs">Thursday, 9:00 AM</span></div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-all duration-500 ${
            status === "confirmed" ? "bg-emerald-500/20 text-emerald-400" : status === "animating" ? "bg-amber-500/20 text-amber-400" : "bg-slate-700 text-slate-400"
          }`}>{status === "confirmed" ? "✓ Confirmed" : status === "animating" ? "Assigning..." : "Unscheduled"}</span>
          <span className="text-slate-500 text-xs">$280</span>
        </div>
        {status === "confirmed" && <div className="absolute inset-0 rounded-xl bg-emerald-400/10 animate-[ping_0.5s_ease-out_1] pointer-events-none" />}
      </div>
      <div className="mt-4 grid grid-cols-5 gap-1">
        {["Mon","Tue","Wed","Thu","Fri"].map((d, i) => (
          <div key={d} className={`rounded-lg py-1.5 text-center text-[10px] transition-all duration-500 ${
            i === 3 && status === "confirmed" ? "bg-primary/20 text-primary font-bold border border-primary/30" : "bg-slate-800 text-slate-500"
          }`}>{d}{i === 3 && status === "confirmed" && <div className="w-1.5 h-1.5 rounded-full bg-primary mx-auto mt-0.5" />}</div>
        ))}
      </div>
    </div>
  );
}

function HeroResultCard() {
  const [revenue, setRevenue] = useState(0);
  const [showPayment, setShowPayment] = useState(false);
  const targets = [0, 450, 1200, 2800];
  const idx = useRef(0);
  useEffect(() => {
    const interval = setInterval(() => {
      idx.current = (idx.current + 1) % targets.length;
      setRevenue(targets[idx.current]);
      if (idx.current === targets.length - 1) setShowPayment(true);
    }, 1800);
    const t = setTimeout(() => setShowPayment(false), 8000);
    return () => { clearInterval(interval); clearTimeout(t); };
  }, []);
  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4" style={{ boxShadow: "0 0 0 1px rgba(16,185,129,0.15), 0 20px 60px rgba(0,0,0,0.4)" }}>
        <div className="flex items-center gap-2 mb-3"><Phone className="h-4 w-4 text-primary" /><span className="text-white text-xs font-semibold">SMS Sent</span><span className="text-slate-500 text-xs ml-auto">Just now</span></div>
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3"><p className="text-slate-200 text-xs leading-relaxed">Hi Sarah! Your cleaning is confirmed for Friday 10AM. Reply STOP to cancel. 🧹</p></div>
        <div className="flex items-center gap-1.5 mt-2"><CheckCircle2 className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400 text-[10px] font-medium">Delivered</span></div>
      </div>
      <div className="bg-slate-900 rounded-2xl border border-slate-700/50 p-4">
        <p className="text-slate-400 text-xs mb-1">This week's revenue</p>
        <p className="text-3xl font-bold text-white transition-all duration-700">${revenue.toLocaleString()}</p>
        <div className="flex items-center gap-1.5 mt-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-400 text-xs font-medium">+23% vs last week</span></div>
      </div>
      <div className={`bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2 transition-all duration-500 ${showPayment ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
        <DollarSign className="h-4 w-4 text-emerald-400 flex-shrink-0" />
        <div><p className="text-emerald-300 text-xs font-semibold">Payment received</p><p className="text-emerald-400/70 text-[10px]">$280.00 — Maria Chen</p></div>
      </div>
    </div>
  );
}

/* ═══ INTERACTIVE FEATURE DEMOS ═══ */
type FeatureTab = "Scheduling" | "Reminders" | "Client Portal" | "Reports" | "Invoicing";

function SchedulingDemo() {
  const [assigned, setAssigned] = useState(false);
  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-700/50 p-5 h-full min-h-[320px]">
      <div className="grid grid-cols-7 gap-1 mb-4">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
          <div key={d} className="text-center text-[10px] text-slate-500 font-medium py-1">{d}</div>
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-slate-900 rounded-lg p-1.5 min-h-[60px] border border-slate-800">
            {i === 0 && <div className="bg-emerald-500/20 text-emerald-400 text-[8px] rounded px-1 py-0.5 font-medium">9AM Kim L.</div>}
            {i === 2 && <div className="bg-sky-500/20 text-sky-400 text-[8px] rounded px-1 py-0.5 font-medium">10AM Davis</div>}
            {i === 4 && <div className="bg-violet-500/20 text-violet-400 text-[8px] rounded px-1 py-0.5 font-medium">2PM Park</div>}
            {i === 3 && assigned && <div className="bg-emerald-500/20 text-emerald-400 text-[8px] rounded px-1 py-0.5 font-medium animate-fade-in">9AM Maria C. ✓</div>}
          </div>
        ))}
      </div>
      <div className={`bg-slate-900 rounded-xl p-3 border transition-all duration-500 ${assigned ? "border-emerald-500/30 opacity-50" : "border-slate-700/50"}`}>
        <div className="flex items-center justify-between">
          <div><p className="text-white text-xs font-medium">Maria Chen — Deep Clean</p><p className="text-slate-500 text-[10px]">3h · $280</p></div>
          <button onClick={() => setAssigned(true)} disabled={assigned}
            className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all ${assigned ? "bg-emerald-500/20 text-emerald-400" : "bg-primary text-white hover:bg-primary/90"}`}>
            {assigned ? "✓ Assigned" : "Auto-assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RemindersDemo() {
  const [sent, setSent] = useState(false);
  const [typing, setTyping] = useState(false);
  const handleSend = () => { setTyping(true); setTimeout(() => { setTyping(false); setSent(true); }, 1500); };
  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-700/50 p-5 h-full min-h-[320px] flex flex-col">
      <div className="bg-slate-900 rounded-xl border border-slate-800 flex-1 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center"><MessageSquare className="h-3 w-3 text-primary" /></div>
          <span className="text-white text-xs font-medium">Sarah Johnson</span>
        </div>
        <div className="flex-1 space-y-2">
          <div className="bg-slate-800 rounded-xl rounded-tl-sm p-2.5 max-w-[75%]"><p className="text-slate-300 text-[11px]">Can you confirm my Friday appointment?</p></div>
          <div className="bg-primary/20 rounded-xl rounded-tr-sm p-2.5 max-w-[75%] ml-auto"><p className="text-slate-200 text-[11px]">Of course! You're confirmed for Friday 10 AM. 🧹</p></div>
          {typing && <div className="bg-primary/10 rounded-xl rounded-tr-sm p-2.5 max-w-[50%] ml-auto animate-pulse"><p className="text-slate-400 text-[11px]">...</p></div>}
          {sent && <div className="bg-primary/20 rounded-xl rounded-tr-sm p-2.5 max-w-[80%] ml-auto animate-fade-in"><p className="text-slate-200 text-[11px]">Hi! Just a reminder your cleaning is tomorrow at 10AM 🧹</p></div>}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <button onClick={handleSend} disabled={sent} className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all ${sent ? "bg-emerald-500/20 text-emerald-400" : "bg-primary text-white hover:bg-primary/90"}`}>
          {sent ? "✓ Reminder Sent" : "Send Reminder"}
        </button>
        <span className="text-emerald-400 text-[10px] font-medium">✓ 98% open rate vs 22% email</span>
      </div>
    </div>
  );
}

function ClientPortalDemo() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState(false);
  const handleSubmit = () => { setLoading(true); setTimeout(() => { setLoading(false); setSubmitted(true); setNotif(true); }, 1500); };
  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-700/50 p-5 h-full min-h-[320px]">
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
        <p className="text-white text-sm font-semibold mb-3">Book a Cleaning</p>
        <div className="space-y-2.5">
          <div className="bg-slate-800 rounded-lg p-2 text-slate-300 text-xs">Sarah Morrison</div>
          <div className="bg-slate-800 rounded-lg p-2 text-slate-300 text-xs flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-500" /> 123 Oak Street, Apt 4B</div>
          <div className="bg-slate-800 rounded-lg p-2 text-slate-300 text-xs flex items-center justify-between"><span>Deep Clean</span><ChevronDown className="h-3 w-3 text-slate-500" /></div>
          <div className="bg-slate-800 rounded-lg p-2 text-slate-300 text-xs flex items-center gap-1"><Calendar className="h-3 w-3 text-slate-500" /> Friday, March 28 · 10:00 AM</div>
        </div>
        {!submitted ? (
          <button onClick={handleSubmit} disabled={loading}
            className="w-full mt-4 bg-primary text-white text-xs font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2">
            {loading ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Book Now"}
          </button>
        ) : (
          <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center animate-fade-in">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-emerald-300 text-xs font-semibold">Booking confirmed!</p>
            <p className="text-emerald-400/60 text-[10px]">See you Friday.</p>
          </div>
        )}
      </div>
      {notif && (
        <div className="mt-3 bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center gap-2 animate-fade-in">
          <Bell className="h-4 w-4 text-primary flex-shrink-0" />
          <p className="text-slate-300 text-xs">New booking from <strong className="text-white">Sarah M.</strong></p>
        </div>
      )}
    </div>
  );
}

function ReportsDemo() {
  const [period, setPeriod] = useState<"week" | "month" | "year">("week");
  const barData: Record<string, number[]> = { week: [40, 65, 55, 80, 70, 90, 60], month: [55, 70, 80, 65, 90, 75, 85], year: [30, 45, 60, 55, 70, 85, 95] };
  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-700/50 p-5 h-full min-h-[320px]">
      <div className="flex items-center gap-2 mb-4">
        {(["week", "month", "year"] as const).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all ${period === p ? "bg-primary text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}>This {p}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Revenue", value: period === "week" ? "$2,450" : period === "month" ? "$12,450" : "$148k", change: "+12%" },
          { label: "Bookings", value: period === "week" ? "18" : period === "month" ? "67" : "812", change: "+15%" },
          { label: "Avg Job", value: "$185", change: "+8%" },
        ].map((s, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-2.5 border border-slate-800">
            <p className="text-slate-500 text-[9px]">{s.label}</p><p className="text-white text-sm font-bold">{s.value}</p><p className="text-emerald-400 text-[9px]">{s.change}</p>
          </div>
        ))}
      </div>
      <div className="bg-slate-900 rounded-xl p-3 border border-slate-800">
        <p className="text-slate-500 text-[10px] mb-2">Revenue trend</p>
        <div className="flex items-end gap-1.5 h-20">
          {barData[period].map((h, i) => (
            <div key={`${period}-${i}`} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t bg-gradient-to-t from-primary to-primary/60 transition-all duration-500" style={{ height: `${h}%` }} />
              <span className="text-slate-600 text-[8px]">{["M","T","W","T","F","S","S"][i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[{ label: "Regular", pct: 55, color: "bg-primary" }, { label: "Deep", pct: 30, color: "bg-sky-400" }, { label: "Move-out", pct: 15, color: "bg-violet-400" }].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${s.color}`} /><span className="text-slate-400 text-[9px]">{s.label} {s.pct}%</span></div>
        ))}
      </div>
    </div>
  );
}

function InvoicingDemo() {
  const [sent, setSent] = useState(false);
  const [paid, setPaid] = useState(false);
  const handleSend = () => { setSent(true); setTimeout(() => setPaid(true), 2000); };
  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-700/50 p-5 h-full min-h-[320px] flex flex-col">
      <div className={`bg-slate-900 rounded-xl border border-slate-800 p-4 flex-1 transition-all duration-500 ${sent ? "opacity-70 scale-95" : ""}`}>
        <div className="flex items-center justify-between mb-3"><span className="text-white text-sm font-semibold">Invoice #1047</span><span className="text-slate-400 text-xs">Mar 28, 2026</span></div>
        <div className="border-t border-slate-800 pt-3 space-y-2">
          <div className="flex justify-between text-xs"><span className="text-slate-400">Deep Clean (3hrs)</span><span className="text-white">$280.00</span></div>
          <div className="flex justify-between text-xs"><span className="text-slate-400">Inside oven</span><span className="text-white">$45.00</span></div>
          <div className="flex justify-between text-xs"><span className="text-slate-400">Inside fridge</span><span className="text-white">$25.00</span></div>
        </div>
        <div className="border-t border-slate-700 mt-3 pt-3 flex justify-between"><span className="text-white text-sm font-bold">Total</span><span className="text-white text-sm font-bold">$350.00</span></div>
        <p className="text-slate-500 text-[10px] mt-2">To: Johnson Family · johnson@email.com</p>
      </div>
      {!sent ? (
        <button onClick={handleSend} className="mt-3 w-full bg-primary text-white text-xs font-semibold py-2.5 rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2"><Send className="h-3.5 w-3.5" /> Send Invoice</button>
      ) : (
        <div className="mt-3 space-y-2 animate-fade-in">
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 text-center"><p className="text-primary text-xs font-semibold">✓ Invoice sent · $350.00</p></div>
          {paid && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5 flex items-center gap-2 animate-fade-in">
              <DollarSign className="h-4 w-4 text-emerald-400" /><p className="text-emerald-300 text-xs font-medium">Payment received from Johnson Family</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const featureTabsData: { tab: FeatureTab; icon: typeof Calendar; title: string; desc: string; bullets: string[] }[] = [
  { tab: "Scheduling", icon: Calendar, title: "Smart Scheduling", desc: "Drag-and-drop calendar with auto-assignment by location, skills, and availability. Recurring bookings run on autopilot.", bullets: ["Auto-assign by cleaner availability", "Recurring & one-time bookings", "Conflict detection & alerts"] },
  { tab: "Reminders", icon: Bell, title: "Automated Reminders", desc: "SMS and email reminders sent automatically before every appointment. Reduce no-shows by 80% without lifting a finger.", bullets: ["Customizable reminder intervals", "SMS + email delivery", "98% open rate on SMS reminders"] },
  { tab: "Client Portal", icon: Users, title: "Client Self-Booking", desc: "Clients book online, view history, and manage appointments. Your booking page, your brand — zero phone calls.", bullets: ["Branded booking page", "Instant confirmation & notifications", "Client login with booking history"] },
  { tab: "Reports", icon: BarChart3, title: "Revenue Reports", desc: "Real-time P&L, revenue forecasting, and AI-powered business intelligence dashboards that show you what's working.", bullets: ["Revenue trends & forecasting", "Per-service profitability", "Weekly automated reports"] },
  { tab: "Invoicing", icon: FileText, title: "One-Tap Invoicing", desc: "Generate and send professional invoices with one click. Auto-charge saved cards after each job for instant payment.", bullets: ["Auto-generate from bookings", "Stripe payment collection", "Payment tracking & reminders"] },
];

function FeatureDemoSection() {
  const [activeTab, setActiveTab] = useState<FeatureTab>("Scheduling");
  const reveal = useScrollReveal();
  const current = featureTabsData.find((f) => f.tab === activeTab)!;
  const demos: Record<FeatureTab, JSX.Element> = {
    Scheduling: <SchedulingDemo />, Reminders: <RemindersDemo />, "Client Portal": <ClientPortalDemo />, Reports: <ReportsDemo />, Invoicing: <InvoicingDemo />,
  };
  return (
    <section id="features" ref={reveal.ref}
      className={`bg-white py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${reveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-primary text-xs font-bold tracking-widest mb-3">FEATURES</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Everything you need, nothing you don't</h2>
          <p className="text-slate-500 text-lg mt-4">Purpose-built tools for cleaning businesses that actually work the way you do.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mb-10 overflow-x-auto pb-2 scrollbar-none">
          {featureTabsData.map((f) => (
            <button key={f.tab} onClick={() => setActiveTab(f.tab)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                activeTab === f.tab ? "bg-primary text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}><f.icon className="h-4 w-4" /> {f.tab}</button>
          ))}
        </div>
        <div className="grid md:grid-cols-5 gap-8 items-start">
          <div className="md:col-span-2 space-y-5">
            <current.icon className="h-8 w-8 text-primary" />
            <h3 className="text-2xl font-bold text-slate-900">{current.title}</h3>
            <p className="text-slate-600 leading-relaxed">{current.desc}</p>
            <ul className="space-y-2">
              {current.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-slate-600"><CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" /> {b}</li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-3" key={activeTab}><div className="animate-fade-in">{demos[activeTab]}</div></div>
        </div>
      </div>
    </section>
  );
}

/* ═══ COMPETITOR COMPARISON ═══ */
function CompetitorComparisonSection() {
  const reveal = useScrollReveal();
  const navigate = useNavigate();
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
    { feature: "Unlimited bookings (all plans)", tw: true, jobber: false, housecall: false, bk: true },
  ];
  const renderCell = (val: boolean | string) => {
    if (typeof val === "string") return <span className="text-sm font-semibold text-slate-700">{val}</span>;
    if (val) return <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center mx-auto"><span className="text-emerald-500 font-bold text-lg">✓</span></div>;
    return <span className="text-slate-300 text-lg mx-auto block text-center">✗</span>;
  };
  const compareLinks: Record<string, string> = { "Jobber": "/compare/jobber", "Housecall Pro": "/compare/housecall-pro", "Booking Koala": "/compare/booking-koala" };
  return (
    <section ref={reveal.ref} className={`bg-slate-50 py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${reveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
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
                  <th className="p-4 text-center"><div className="bg-emerald-500 text-white font-bold text-sm rounded-lg px-3 py-2 inline-block">TidyWise<div className="text-[10px] font-medium bg-white/20 rounded-full px-2 py-0.5 mt-1">⭐ Best Value</div></div></th>
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
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {["Jobber", "Housecall Pro", "Booking Koala"].map((name) => (
            <div key={name} className="bg-white rounded-xl border border-slate-200 p-5 text-center hover:shadow-md hover:border-slate-300 transition-all duration-200">
              <ArrowRightLeft className="h-6 w-6 text-primary mx-auto" />
              <p className="text-slate-900 font-semibold text-sm mt-3">Switching from {name}?</p>
              <p className="text-slate-500 text-sm mt-1">We'll import your data free</p>
              <button onClick={() => navigate(compareLinks[name])} className="text-primary text-sm font-medium mt-2 hover:underline cursor-pointer">Learn more →</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══ USE CASES — alternating full-width ═══ */
function UseCasesSection({ onContactSales }: { onContactSales: () => void }) {
  const reveal = useScrollReveal();
  const navigate = useNavigate();

  const scenarios = [
    {
      headline: "Stop losing 3 hours a week to admin",
      body: "Every Sunday you're texting reminders, updating your calendar, and chasing payments. TidyWise does all of it automatically the moment you confirm a booking.",
      outcomes: ["Reminders sent automatically to all 15 clients", "Payments collected before you even arrive", "Your week planned in 5 minutes, not 3 hours"],
      ctaLabel: "Start free — no credit card",
      ctaAction: () => navigate("/signup"),
      mockup: (
        <div className="space-y-2">
          {["Sarah J. — Fri 10AM", "Mike C. — Fri 1PM", "Lisa P. — Sat 9AM", "David W. — Sat 2PM"].map((m, i) => (
            <div key={m} className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 flex items-center gap-2" style={{ animationDelay: `${i * 200}ms` }}>
              <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />
              <p className="text-slate-200 text-[11px]">📱 Reminder sent: {m}</p>
            </div>
          ))}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5 mt-2">
            <p className="text-emerald-300 text-[11px] font-medium">💳 $1,120 collected automatically</p>
          </div>
        </div>
      ),
    },
    {
      headline: "Know where your team is without the constant check-ins",
      body: "Dispatching 6 cleaners across 12 jobs means constant calls and texts. TidyWise shows you real-time GPS check-ins, auto-assigns the right cleaner to each job, and alerts you the moment something's off.",
      outcomes: ["All 6 cleaners dispatched in 2 minutes", "GPS check-in confirms arrival at every job", "Schedule conflicts caught automatically"],
      ctaLabel: "See team features",
      ctaAction: () => { document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }); },
      mockup: (
        <div className="space-y-2">
          {[
            { name: "Maria C.", zone: "Downtown", status: "On job", color: "bg-primary" },
            { name: "Alex T.", zone: "East Side", status: "En route", color: "bg-sky-400" },
            { name: "James W.", zone: "North", status: "Checked in", color: "bg-violet-400" },
            { name: "Sofia R.", zone: "West End", status: "On job", color: "bg-amber-400" },
          ].map((c) => (
            <div key={c.name} className="flex items-center gap-2 bg-slate-800 rounded-lg p-2.5">
              <div className={`w-2.5 h-2.5 rounded-full ${c.color}`} />
              <span className="text-white text-[11px] font-medium flex-1">{c.name}</span>
              <span className="text-slate-500 text-[10px]">{c.zone}</span>
              <span className="text-emerald-400 text-[10px] font-medium">{c.status}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      headline: "Make decisions with real data, not gut feeling",
      body: "You need to know which services are most profitable, which clients are worth keeping, and where your team is losing time. TidyWise gives you the reports to act on.",
      outcomes: ["P&L by service type, updated in real time", "Top 10 clients ranked by lifetime value", "AI suggestions to increase monthly revenue"],
      ctaLabel: "Talk to our team",
      ctaAction: onContactSales,
      mockup: (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800 rounded-lg p-2.5"><p className="text-slate-500 text-[9px]">Revenue</p><p className="text-white text-sm font-bold">$14.2k</p><p className="text-emerald-400 text-[9px]">+18% ↑</p></div>
            <div className="bg-slate-800 rounded-lg p-2.5"><p className="text-slate-500 text-[9px]">Profit margin</p><p className="text-white text-sm font-bold">61%</p><p className="text-emerald-400 text-[9px]">+4% ↑</p></div>
          </div>
          <div className="bg-slate-800 rounded-lg p-2.5">
            <p className="text-slate-500 text-[9px] mb-1">Top client</p>
            <p className="text-white text-[11px] font-medium">Anderson Corp — $2,400/mo</p>
          </div>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5">
            <p className="text-primary text-[11px] font-medium flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI: "Add deep clean upsell — projected +$800/mo"</p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section id="use-cases" ref={reveal.ref}
      className={`bg-white py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${reveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-primary text-xs font-bold tracking-widest mb-3">USE CASES</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">See TidyWise in action</h2>
          <p className="text-slate-500 text-lg mt-4">Pick your situation and see exactly how it works.</p>
        </div>
        <div className="space-y-8">
          {scenarios.map((s, i) => {
            const isReversed = i % 2 === 1;
            return (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 hover:border-emerald-200 hover:shadow-md transition-all duration-200"
                style={{ transitionDelay: reveal.isVisible ? `${i * 100}ms` : "0ms", opacity: reveal.isVisible ? 1 : 0, transform: reveal.isVisible ? "translateY(0)" : "translateY(24px)", transition: "all 0.5s ease" }}>
                <div className={`grid md:grid-cols-2 gap-8 items-center ${isReversed ? "md:[direction:rtl]" : ""}`}>
                  <div className={isReversed ? "md:[direction:ltr]" : ""}>
                    <p className="text-xs font-bold text-primary tracking-widest mb-2">
                      {i === 0 ? "SOLO CLEANER" : i === 1 ? "GROWING TEAM (2–10 STAFF)" : "ESTABLISHED COMPANY (10+)"}
                    </p>
                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-3">{s.headline}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed mb-5">{s.body}</p>
                    <ul className="space-y-2 mb-6">
                      {s.outcomes.map((o) => (
                        <li key={o} className="flex items-start gap-2 text-sm text-slate-700">
                          <ArrowRight className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" /> {o}
                        </li>
                      ))}
                    </ul>
                    <button onClick={s.ctaAction} className="inline-flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-primary/90 transition-all cursor-pointer">
                      {s.ctaLabel} <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className={`bg-slate-950 rounded-xl p-4 min-h-[240px] ${isReversed ? "md:[direction:ltr]" : ""}`}>
                    {s.mockup}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══ FULL FEATURES SECTION ═══ */
type FeatureCategory = "Scheduling" | "Clients" | "Staff" | "Payments" | "Automation" | "Reports" | "Settings";
const fullFeaturesData: Record<FeatureCategory, { name: string; badge?: "Pro" | "Business"; star?: boolean }[]> = {
  Scheduling: [
    { name: "Drag-and-drop visual calendar" },
    { name: "Day, week, and month calendar views" },
    { name: "One-time and recurring bookings (daily, weekly, monthly, custom)" },
    { name: "Multi-day booking support with per-day pricing" },
    { name: "Auto-assign bookings to available staff by skill/location", badge: "Pro" },
    { name: "Booking status tracking (Pending, Confirmed, In Progress, Complete, Cancelled)" },
    { name: "Hold/capture payment flows" },
    { name: "Preferred date anchoring for recurring jobs" },
    { name: "Color-coded bookings by staff or service type" },
    { name: "Booking notes and special instructions" },
  ],
  Clients: [
    { name: "Full CRM with client profiles" },
    { name: "Contact history and booking history per client" },
    { name: "Client tags and segments", badge: "Pro" },
    { name: "Lead tracking and pipeline", badge: "Pro" },
    { name: "Client portal — self-service booking and account management" },
    { name: "Loyalty tracking", badge: "Pro" },
    { name: "Import clients from CSV" },
    { name: "Client communication log" },
    { name: "Google Review link integration" },
  ],
  Staff: [
    { name: "Staff profiles with skills, availability, and pay rates" },
    { name: "GPS check-in and check-out tracking", star: true },
    { name: "Staff scheduling and shift management" },
    { name: "Performance tracking per cleaner", badge: "Pro" },
    { name: "Payroll overview and labor cost tracking" },
    { name: "Staff-facing mobile app", star: true },
    { name: "Availability and time-off management" },
    { name: "Re-clean tracking (labor billed at $0)" },
  ],
  Payments: [
    { name: "Stripe payment processing (built-in)" },
    { name: "One-tap invoice generation and sending" },
    { name: "Auto-charge saved cards after each job" },
    { name: "Partial refunds and refund management" },
    { name: "Payment status tracking (Paid, Partial, Pending, Refunded)" },
    { name: "Revenue tracking per booking" },
    { name: "Cancellation fee handling" },
    { name: "Multi-day job pricing (per-day rates)" },
  ],
  Automation: [
    { name: "Automated SMS appointment reminders" },
    { name: "Automated email reminders" },
    { name: "Custom automation builder (multi-step workflows)", badge: "Pro", star: true },
    { name: "8 pre-built automation templates", badge: "Pro" },
    { name: "Trigger-based automations (booking created, completed, etc.)", badge: "Pro" },
    { name: "Tag-based automation filters", badge: "Pro" },
    { name: "Delay steps and condition steps in automations", badge: "Pro" },
    { name: "OpenPhone integration for SMS" },
  ],
  Reports: [
    { name: "Real-time revenue dashboard" },
    { name: "Revenue by service type breakdown" },
    { name: "Monthly and weekly revenue trends" },
    { name: "Staff performance reports", badge: "Pro" },
    { name: "AI-powered business insights and suggestions", badge: "Pro", star: true },
    { name: "CRM suggestions panel", badge: "Pro" },
    { name: "Export reports", badge: "Pro" },
  ],
  Settings: [
    { name: "Business profile and branding settings" },
    { name: "Service types and pricing configuration" },
    { name: "Custom business hours" },
    { name: "Notification preferences" },
    { name: "Google Review URL configuration" },
    { name: "Team permissions and roles", badge: "Business" },
    { name: "Subscription and billing management" },
  ],
};

const categoryIcons: Record<FeatureCategory, typeof Calendar> = {
  Scheduling: Calendar, Clients: Users, Staff: UserCheck, Payments: CreditCard,
  Automation: Zap, Reports: BarChart3, Settings: Settings,
};

function FullFeaturesSection() {
  const [activeCategory, setActiveCategory] = useState<FeatureCategory>("Scheduling");
  const reveal = useScrollReveal();
  const features = fullFeaturesData[activeCategory];
  const Icon = categoryIcons[activeCategory];

  return (
    <section id="all-features" ref={reveal.ref}
      className={`bg-slate-50 py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${reveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-primary text-xs font-bold tracking-widest mb-3">FULL FEATURE LIST</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Everything under the hood</h2>
          <p className="text-slate-500 text-lg mt-4">A comprehensive breakdown of every feature by category.</p>
        </div>
        {/* Category tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-10 overflow-x-auto pb-2 scrollbar-none">
          {(Object.keys(fullFeaturesData) as FeatureCategory[]).map((cat) => {
            const CatIcon = categoryIcons[cat];
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  activeCategory === cat ? "bg-primary text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}><CatIcon className="h-4 w-4" /> {cat}</button>
            );
          })}
        </div>
        {/* Feature list */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" key={activeCategory}>
          <div className="p-6 sm:p-8 animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="text-xl font-bold text-slate-900">{activeCategory === "Clients" ? "Client Management" : activeCategory === "Staff" ? "Staff Management" : activeCategory === "Payments" ? "Payments & Invoicing" : activeCategory === "Automation" ? "Automation & Reminders" : activeCategory === "Reports" ? "Reports & Analytics" : activeCategory === "Settings" ? "Settings & Customization" : "Scheduling & Bookings"}</h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
              {features.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5 py-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700 flex-1">{f.name}</span>
                  {f.star && <span className="text-amber-500 text-xs">⭐</span>}
                  {f.badge && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      f.badge === "Business" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"
                    }`}>{f.badge}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══ SOCIAL PROOF ═══ */
function SocialProofSection() {
  const reveal = useScrollReveal();
  const stories = [
    { name: "Sarah K.", company: "Sparkle Clean Co.", avatar: "SK", headline: "Sarah cut no-shows by 80%", quote: "Before TidyWise, I was losing $400/month to no-shows. Now automated reminders handle it." },
    { name: "Marcus T.", company: "Fresh Start Services", avatar: "MT", headline: "Marcus went from 8 to 23 clients in 4 months", quote: "The client portal lets new customers book without calling me." },
    { name: "Priya R.", company: "Elite Home Care", avatar: "PR", headline: "Priya's team saves 12 hours/week on admin", quote: "Scheduling 9 cleaners used to take my whole Monday morning." },
  ];
  return (
    <section ref={reveal.ref}
      className={`bg-slate-50 py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${reveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-primary text-xs font-bold tracking-widest mb-3">RESULTS</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Real results from real cleaning businesses</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {stories.map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-8 hover:shadow-md hover:border-slate-300 transition-all duration-200"
              style={{ transitionDelay: reveal.isVisible ? `${i * 100}ms` : "0ms", opacity: reveal.isVisible ? 1 : 0, transform: reveal.isVisible ? "translateY(0)" : "translateY(24px)", transition: "all 0.5s ease" }}>
              <p className="text-primary text-sm font-bold mb-3">{s.headline}</p>
              <p className="text-slate-600 text-sm leading-relaxed italic">"{s.quote}"</p>
              <div className="flex items-center gap-3 mt-6">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">{s.avatar}</div>
                <div><p className="font-semibold text-slate-900 text-sm">{s.name}</p><p className="text-slate-400 text-xs">{s.company}</p></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
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
  const [contactOpen, setContactOpen] = useState(false);

  const stepsReveal = useScrollReveal();
  const testimonialsReveal = useScrollReveal();
  const statsReveal = useScrollReveal();

  useEffect(() => {
    const h = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
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

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const navItems = [
    { label: "Features", target: "features" },
    { label: "Pricing", target: "pricing" },
    { label: "Blog", target: "blog", isRoute: true },
    { label: "Testimonials", target: "testimonials" },
  ];

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
      <ContactSalesModal open={contactOpen} onOpenChange={setContactOpen} />

      {/* ────── NAVBAR ────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] transition-all duration-300 ${
        isScrolled ? "bg-white/95 backdrop-blur-md border-b border-slate-200/60 shadow-sm" : "bg-transparent"
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="cursor-pointer"><Wordmark dark={!isScrolled} /></button>
            <div className="hidden md:flex items-center gap-8">
              {navItems.map((item) => (
                <button key={item.label}
                  onClick={() => item.isRoute ? navigate("/blog") : scrollTo(item.target)}
                  className={`text-sm font-medium transition-colors cursor-pointer ${isScrolled ? "text-slate-600 hover:text-slate-900" : "text-slate-300 hover:text-white"}`}>
                  {item.label}
                </button>
              ))}
              <button onClick={() => scrollTo("all-features")}
                className={`text-sm font-medium transition-colors cursor-pointer ${isScrolled ? "text-slate-600 hover:text-slate-900" : "text-slate-300 hover:text-white"}`}>
                All Features
              </button>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <button onClick={() => navigate("/login")}
                className={`text-sm font-medium transition-colors cursor-pointer ${isScrolled ? "text-slate-600 hover:text-slate-900" : "text-slate-300 hover:text-white"}`}>
                Log in
              </button>
              <Button size="sm" onClick={() => navigate("/signup")}>
                Start Free Trial <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <button className="md:hidden p-2 rounded-lg" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
              {mobileMenuOpen
                ? <X className={`h-6 w-6 ${isScrolled ? "text-slate-900" : "text-white"}`} />
                : <Menu className={`h-6 w-6 ${isScrolled ? "text-slate-900" : "text-white"}`} />}
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
              <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} aria-label="Close" />
              <div className="absolute left-3 right-3 top-[calc(4.5rem+env(safe-area-inset-top))]">
                <div className="rounded-2xl bg-white shadow-xl border border-slate-200 p-3 space-y-1">
                  {navItems.map((item) => (
                    <button key={item.label}
                      onClick={() => { setMobileMenuOpen(false); item.isRoute ? navigate("/blog") : scrollTo(item.target); }}
                      className="block w-full text-left px-4 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors">
                      {item.label}
                    </button>
                  ))}
                  <button onClick={() => { setMobileMenuOpen(false); scrollTo("all-features"); }}
                    className="block w-full text-left px-4 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors">
                    All Features
                  </button>
                  <hr className="my-2 border-slate-100" />
                  <button onClick={() => { setMobileMenuOpen(false); navigate("/login"); }}
                    className="block w-full text-left px-4 py-3 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg text-sm font-medium">Log in</button>
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
      <section className="relative bg-slate-950 min-h-screen flex flex-col justify-center pt-[calc(5rem+env(safe-area-inset-top))] pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden hero-gradient-bg" />
        <FloatingParticles />
        <div className="relative max-w-6xl mx-auto w-full">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 border border-primary/20 text-primary text-xs font-semibold rounded-full mb-6">
              <Sparkles className="h-3.5 w-3.5" /> Built for cleaning businesses
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-white tracking-tight leading-[1.1] mb-5">
              Your cleaning business, on <span className="text-primary">autopilot</span>.
            </h1>
            <p className="text-slate-400 text-lg sm:text-xl max-w-xl mx-auto leading-relaxed mb-8">
              Schedule, remind, get paid — all without lifting a finger. TidyWise handles the busywork so you can focus on growing.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
              <Button size="xl" onClick={handleGetStarted} className="shadow-lg shadow-primary/25 hover:shadow-primary/40 cursor-pointer">
                Start Free Trial <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <button onClick={() => scrollTo("features")}
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 transition-all duration-200 font-medium cursor-pointer">
                <Play className="h-4 w-4" /> Watch Demo
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-slate-500 text-sm">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Free 60 days</span>
              <span>·</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> No credit card</span>
              <span>·</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> Cancel anytime</span>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6 items-start max-w-4xl mx-auto">
            <div className="flex flex-col items-center">
              <p className="text-slate-500 text-xs font-semibold tracking-widest mb-3">WHAT YOU DO</p>
              <HeroBookingCard />
            </div>
            <div className="flex flex-col items-center">
              <p className="text-slate-500 text-xs font-semibold tracking-widest mb-3">WHAT HAPPENS</p>
              <HeroResultCard />
            </div>
          </div>
        </div>
      </section>

      {/* ────── TRUSTED BY / STATS BAR ────── */}
      <section ref={statsReveal.ref}
        className={`bg-white py-16 px-4 sm:px-6 lg:px-8 border-b border-slate-100 transition-all duration-700 ${statsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-slate-400 text-xs font-semibold tracking-widest mb-8">TRUSTED BY CLEANING BUSINESSES ACROSS THE US, UK & AUSTRALIA</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:divide-x divide-slate-200">
            {[
              { value: 500, suffix: "+", label: "Active businesses" },
              { value: 98, suffix: "%", label: "Client satisfaction" },
              { value: 12, suffix: "hrs", label: "Saved per week avg." },
              { prefix: "$", value: 2, suffix: "M+", label: "Revenue tracked monthly" },
            ].map((stat, i) => (
              <div key={i} className="text-center px-4">
                <p className="text-4xl font-bold text-slate-900 relative inline-block">
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} prefix={stat.prefix || ""} />
                </p>
                <p className="text-slate-500 text-sm mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────── INTERACTIVE FEATURES ────── */}
      <FeatureDemoSection />

      {/* ────── COMPETITOR COMPARISON ────── */}
      <CompetitorComparisonSection />

      {/* ────── FULL FEATURES ────── */}
      <FullFeaturesSection />

      {/* ────── USE CASES ────── */}
      <UseCasesSection onContactSales={() => setContactOpen(true)} />

      {/* ────── HOW IT WORKS ────── */}
      <section ref={stepsReveal.ref}
        className={`bg-slate-50 py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${stepsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-primary text-xs font-bold tracking-widest mb-3">HOW IT WORKS</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Up and running in minutes</h2>
            <p className="text-slate-500 text-lg mt-4">Three simple steps to transform your cleaning business.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-6 left-[16.67%] right-[16.67%] h-[2px] overflow-hidden">
              <div className="h-full w-full animated-dash-line" />
            </div>
            {[
              { num: "1", title: "Add your clients & team", desc: "Import contacts from a CSV or add them one by one. Set up staff profiles with skills, availability, and pay rates." },
              { num: "2", title: "Schedule & automate", desc: "Drag bookings onto the calendar, set up recurring appointments, and let automated reminders handle the rest." },
              { num: "3", title: "Get paid & grow", desc: "Track revenue, send one-tap invoices, read AI-powered insights, and watch your business scale." },
            ].map((step, i) => (
              <div key={i} className="text-center relative"
                style={{ transitionDelay: stepsReveal.isVisible ? `${i * 150}ms` : "0ms", opacity: stepsReveal.isVisible ? 1 : 0, transform: stepsReveal.isVisible ? "translateY(0)" : "translateY(24px)", transition: "opacity 0.5s ease, transform 0.5s ease" }}>
                <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto relative step-pulse-ring">{step.num}</div>
                <h3 className="text-xl font-semibold text-slate-900 mt-6">{step.title}</h3>
                <p className="text-slate-500 text-base mt-2 max-w-xs mx-auto">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────── TESTIMONIALS ────── */}
      <section id="testimonials" ref={testimonialsReveal.ref}
        className={`bg-white py-24 px-4 sm:px-6 lg:px-8 transition-all duration-700 ${testimonialsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-primary text-xs font-bold tracking-widest mb-3">TESTIMONIALS</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Loved by cleaning businesses everywhere</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { headline: "Cut no-shows by 80%", quote: "Before TidyWise, I was losing $400/month to no-shows. Automated reminders changed everything — now clients actually show up.", author: "Sarah K.", role: "Owner, Sparkle Clean Co.", avatar: "SK" },
              { headline: "Went from 8 to 23 clients in 4 months", quote: "The client portal lets new customers book without calling me. I wake up to bookings instead of voicemails.", author: "Marcus T.", role: "Founder, Fresh Start Services", avatar: "MT" },
              { headline: "Saves 12 hours/week on admin", quote: "Scheduling 9 cleaners used to take my whole Monday morning. Now it's done in 5 minutes with auto-assign.", author: "Priya R.", role: "CEO, Elite Home Care", avatar: "PR" },
            ].map((t, i) => (
              <div key={i} className="relative bg-white rounded-2xl border border-slate-200 p-8 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200"
                style={{ transitionDelay: testimonialsReveal.isVisible ? `${i * 100}ms` : "0ms", opacity: testimonialsReveal.isVisible ? 1 : 0, transform: testimonialsReveal.isVisible ? "translateY(0)" : "translateY(24px)", transition: "opacity 0.5s ease, transform 0.5s ease" }}>
                <span className="absolute top-4 right-6 text-8xl font-serif text-primary/10 leading-none select-none">"</span>
                <p className="text-primary text-sm font-bold mb-3">{t.headline}</p>
                <div className="flex gap-1 mb-3">
                  {Array.from({ length: 5 }).map((_, j) => <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-slate-600 text-sm leading-relaxed italic relative z-10">"{t.quote}"</p>
                <div className="flex items-center gap-3 mt-6">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">{t.avatar}</div>
                  <div><p className="font-semibold text-slate-900 text-sm">{t.author}</p><p className="text-slate-400 text-xs">{t.role}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────── PRICING ────── */}
      <section id="pricing" className="bg-slate-950 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-primary text-xs font-bold tracking-widest mb-3">PRICING</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Simple, transparent pricing</h2>
            <p className="text-slate-400 text-lg mt-4">No hidden fees. No per-user charges. Unlimited bookings on every plan.</p>
            <div className="flex items-center justify-center gap-3 mt-8">
              <span className={`text-sm font-medium ${!isAnnual ? "text-white" : "text-slate-500"}`}>Monthly</span>
              <button onClick={() => setIsAnnual(!isAnnual)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer ${isAnnual ? "bg-primary" : "bg-slate-700"}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${isAnnual ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
              <span className={`text-sm font-medium ${isAnnual ? "text-white" : "text-slate-500"}`}>Annual</span>
              {isAnnual && <span className="bg-primary/20 text-primary text-xs font-semibold px-2 py-0.5 rounded-full">Save 20%</span>}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8">
              <h3 className="text-white text-xl font-semibold">Starter</h3>
              <p className="text-slate-400 text-sm mt-1">Solo operators & small teams</p>
              <div className="mt-6"><span className="text-white text-4xl font-bold">${isAnnual ? "39" : "49"}</span><span className="text-slate-400 text-sm">/mo</span></div>
              <ul className="mt-6 space-y-3">
                {["Up to 5 staff members", "Unlimited bookings", "SMS reminders", "Client portal", "Basic reports"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-slate-300 text-sm"><CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" /> {f}</li>
                ))}
              </ul>
              <button onClick={handleGetStarted} className="w-full mt-8 border border-primary text-primary hover:bg-primary hover:text-white rounded-xl px-6 py-3 font-semibold transition-all duration-150 cursor-pointer">Start Free Trial</button>
            </div>

            <div className="relative bg-primary rounded-2xl p-8 shadow-2xl shadow-primary/30 md:scale-105">
              <div className="absolute top-4 right-4 bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">Most Popular</div>
              <h3 className="text-white text-xl font-semibold">Pro</h3>
              <p className="text-white/70 text-sm mt-1">Growing teams</p>
              <div className="mt-6"><span className="text-white text-4xl font-bold">${isAnnual ? "79" : "99"}</span><span className="text-white/60 text-sm">/mo</span></div>
              <ul className="mt-6 space-y-3">
                {["Up to 15 staff members", "Unlimited bookings", "Everything in Starter", "AI insights", "Revenue reports", "Priority support"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-white text-sm"><CheckCircle2 className="w-4 h-4 text-white flex-shrink-0" /> {f}</li>
                ))}
              </ul>
              <button onClick={handleGetStarted} className="w-full mt-8 bg-white text-primary hover:bg-slate-100 rounded-xl px-6 py-3 font-bold transition-all duration-150 cursor-pointer">Start Free Trial</button>
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8">
              <h3 className="text-white text-xl font-semibold">Business</h3>
              <p className="text-slate-400 text-sm mt-1">Established companies</p>
              <div className="mt-6"><span className="text-white text-4xl font-bold">${isAnnual ? "159" : "199"}</span><span className="text-slate-400 text-sm">/mo</span></div>
              <ul className="mt-6 space-y-3">
                {["Unlimited staff", "Unlimited bookings", "Everything in Pro", "Custom branding", "API access", "Dedicated account manager"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-slate-300 text-sm"><CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" /> {f}</li>
                ))}
              </ul>
              <button onClick={() => setContactOpen(true)} className="w-full mt-8 border border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl px-6 py-3 font-semibold transition-all duration-150 cursor-pointer">Contact Sales</button>
            </div>
          </div>

          <div className="text-center mt-8 space-y-2">
            <p className="text-slate-400 text-sm">No contracts. Cancel anytime. 60-day free trial on all plans.</p>
            <button onClick={() => scrollTo("all-features")} className="text-primary text-sm font-medium hover:underline cursor-pointer">See all features →</button>
          </div>
        </div>
      </section>

      {/* ────── FINAL CTA ────── */}
      <section className="bg-gradient-to-r from-primary/90 to-primary py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Ready to grow your cleaning business?</h2>
          <p className="text-white/80 text-lg mt-4">Join hundreds of cleaning companies saving time with TidyWise.</p>
          <button onClick={handleGetStarted}
            className="mt-8 inline-flex items-center gap-2 bg-white text-primary font-bold px-10 py-4 rounded-xl hover:bg-slate-50 shadow-xl hover:shadow-2xl transition-all duration-200 cursor-pointer">
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
                <li><button onClick={() => scrollTo("features")} className="text-slate-400 text-sm hover:text-slate-200 transition-colors cursor-pointer">Features</button></li>
                <li><button onClick={() => scrollTo("pricing")} className="text-slate-400 text-sm hover:text-slate-200 transition-colors cursor-pointer">Pricing</button></li>
                <li><Link to="/blog" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">Blog</Link></li>
                <li><button onClick={() => scrollTo("all-features")} className="text-slate-400 text-sm hover:text-slate-200 transition-colors cursor-pointer">All Features</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Company</h4>
              <ul className="space-y-3">
                <li><button onClick={() => setContactOpen(true)} className="text-slate-400 text-sm hover:text-slate-200 transition-colors cursor-pointer">Contact</button></li>
                <li><Link to="/privacy-policy" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">Privacy</Link></li>
                <li><TermsOfServiceDialog><button className="text-slate-400 text-sm hover:text-slate-200 transition-colors cursor-pointer">Terms</button></TermsOfServiceDialog></li>
                <li><Link to="/delete-account" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">Delete Account</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Compare</h4>
              <ul className="space-y-3">
                <li><Link to="/compare/jobber" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">vs Jobber</Link></li>
                <li><Link to="/compare/housecall-pro" className="text-slate-400 text-sm hover:text-slate-200 transition-colors">vs Housecall Pro</Link></li>
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
