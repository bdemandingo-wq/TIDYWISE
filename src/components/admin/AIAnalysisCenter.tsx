import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Brain, TrendingUp, AlertTriangle, Flame, Target,
  Send, Sparkles, Calendar, Users, ArrowUpRight,
  RefreshCw, MessageSquare, BarChart3, ShieldAlert,
  BookOpen, Zap, Phone
} from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { useQuery as useRQ } from '@tanstack/react-query';

// ─── Call Stats Sub-Component ───
function CallStatsContent({ orgId, cardStyle }: { orgId: string | undefined; cardStyle: React.CSSProperties }) {
  const { data: callStats } = useRQ({
    queryKey: ['call-stats', orgId],
    queryFn: async () => {
      if (!orgId) return { total: 0, missed: 0, avgDuration: 0, incoming: 0, outgoing: 0, voicemails: 0, busiestHours: {} as Record<string, number>, topCallers: [] as { name: string; count: number }[] };
      const { data } = await supabase.from('openphone_calls').select('*').eq('organization_id', orgId).order('started_at', { ascending: false }).limit(500);
      const calls = data || [];
      const total = calls.length;
      const missed = calls.filter(c => c.status === 'missed' || c.status === 'no-answer').length;
      const incoming = calls.filter(c => c.direction === 'inbound').length;
      const outgoing = calls.filter(c => c.direction === 'outbound').length;
      const voicemails = calls.filter(c => c.has_voicemail).length;
      const avgDuration = total > 0 ? Math.round(calls.reduce((s, c) => s + (c.duration || 0), 0) / total) : 0;
      const hourCounts: Record<string, number> = {};
      const callerCounts: Record<string, number> = {};
      calls.forEach(c => {
        if (c.started_at) {
          const h = new Date(c.started_at).getHours();
          const label = h < 12 ? `${h || 12}AM` : `${h === 12 ? 12 : h - 12}PM`;
          hourCounts[label] = (hourCounts[label] || 0) + 1;
        }
        const name = c.caller_name || c.caller_phone || 'Unknown';
        callerCounts[name] = (callerCounts[name] || 0) + 1;
      });
      const topCallers = Object.entries(callerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
      return { total, missed, avgDuration, incoming, outgoing, voicemails, busiestHours: hourCounts, topCallers };
    },
    enabled: !!orgId,
  });

  const s = callStats || { total: 0, missed: 0, avgDuration: 0, incoming: 0, outgoing: 0, voicemails: 0, busiestHours: {}, topCallers: [] };
  const missedPct = s.total > 0 ? Math.round((s.missed / s.total) * 100) : 0;
  const TEAL = '#00E5C3'; const AMBER = '#FFB547'; const RED = '#FF4B6E'; const BLUE = '#4A9EFF';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Calls', value: s.total, color: TEAL },
          { label: 'Missed Calls', value: `${s.missed} (${missedPct}%)`, color: RED },
          { label: 'Avg Duration', value: `${Math.floor(s.avgDuration / 60)}:${(s.avgDuration % 60).toString().padStart(2, '0')}`, color: BLUE },
          { label: 'Voicemails', value: s.voicemails, color: AMBER },
        ].map((k, i) => (
          <div key={i} style={cardStyle} className="p-4">
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{k.label}</p>
            <p style={{ fontSize: 24, fontWeight: 600, color: k.color, marginTop: 4 }}>{k.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div style={cardStyle} className="p-4">
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Busiest Hours</p>
          {Object.entries(s.busiestHours).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([hour, count]) => (
            <div key={hour} className="flex items-center gap-2 mb-2">
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', width: 40 }}>{hour}</span>
              <div className="flex-1 h-4 rounded" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded" style={{ width: `${(count / Math.max(...Object.values(s.busiestHours), 1)) * 100}%`, background: TEAL }} />
              </div>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', width: 24, textAlign: 'right' }}>{count}</span>
            </div>
          ))}
          {Object.keys(s.busiestHours).length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No call data yet. Sync calls from Messages → Calls tab.</p>}
        </div>
        <div style={cardStyle} className="p-4">
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Most Frequent Callers</p>
          {s.topCallers.map((c, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{c.name}</span>
              <span style={{ fontSize: 12, color: TEAL }}>{c.count} calls</span>
            </div>
          ))}
          {s.topCallers.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No call data yet.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Count-up hook ───
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    let start = 0;
    const step = Math.max(1, Math.ceil(target / (duration / 30)));
    const id = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(id); }
      else setValue(start);
    }, 30);
    return () => clearInterval(id);
  }, [target, duration]);
  return value;
}

// ─── Styles ───
const DARK_BG = '#0D0F14';
const CARD_BG = '#141720';
const BORDER = 'rgba(255,255,255,0.06)';
const TEAL = '#00E5C3';
const AMBER = '#FFB547';
const RED = '#FF4B6E';
const BLUE = '#4A9EFF';

const cardStyle: React.CSSProperties = { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12 };
const monoFont = "'DM Mono', monospace";
const labelFont = "'Outfit', sans-serif";

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Proactive Insight type ───
interface ProactiveInsight {
  type: 'critical' | 'warning' | 'positive' | 'tip';
  icon: string;
  title: string;
  body: string;
  action: string;
}

export function AIAnalysisCenter() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [activeTab, setActiveTab] = useState('overview');

  // ─── Data queries ───
  const now = new Date();
  const monthStart = startOfMonth(now).toISOString();
  const monthEnd = endOfMonth(now).toISOString();
  const prevMonthStart = startOfMonth(subMonths(now, 1)).toISOString();
  const prevMonthEnd = endOfMonth(subMonths(now, 1)).toISOString();

  const { data: revenueData } = useQuery({
    queryKey: ['ai-revenue', orgId],
    queryFn: async () => {
      if (!orgId) return { current: 0, previous: 0 };
      const [cur, prev] = await Promise.all([
        supabase.from('bookings').select('total_amount').eq('organization_id', orgId).in('status', ['confirmed', 'completed']).gte('scheduled_at', monthStart).lte('scheduled_at', monthEnd),
        supabase.from('bookings').select('total_amount').eq('organization_id', orgId).in('status', ['confirmed', 'completed']).gte('scheduled_at', prevMonthStart).lte('scheduled_at', prevMonthEnd),
      ]);
      const current = (cur.data || []).reduce((s, b) => s + (b.total_amount || 0), 0);
      const previous = (prev.data || []).reduce((s, b) => s + (b.total_amount || 0), 0);
      return { current, previous };
    },
    enabled: !!orgId,
  });

  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data: hotLeads = [] } = useQuery({
    queryKey: ['ai-hot-leads', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from('leads').select('*').eq('organization_id', orgId).or(`status.eq.hot,updated_at.lt.${threeDaysAgo}`).order('updated_at', { ascending: true });
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: churnCustomers = [] } = useQuery({
    queryKey: ['ai-churn', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data: customers } = await supabase.from('customers').select('id, first_name, last_name, email').eq('organization_id', orgId);
      if (!customers?.length) return [];
      const results: any[] = [];
      for (const c of customers) {
        const { data: lastBooking } = await supabase.from('bookings').select('scheduled_at, service_id').eq('customer_id', c.id).eq('organization_id', orgId).order('scheduled_at', { ascending: false }).limit(1);
        if (lastBooking?.length) {
          const days = differenceInDays(now, new Date(lastBooking[0].scheduled_at));
          if (days > 30) {
            const { data: svc } = lastBooking[0].service_id ? await supabase.from('services').select('name').eq('id', lastBooking[0].service_id).single() : { data: null };
            results.push({ ...c, daysSince: days, serviceName: svc?.name || 'General Cleaning' });
          }
        }
      }
      return results.sort((a, b) => b.daysSince - a.daysSince).slice(0, 10);
    },
    enabled: !!orgId,
  });

  const { data: conversionData } = useQuery({
    queryKey: ['ai-conversion', orgId],
    queryFn: async () => {
      if (!orgId) return { rate: 0, total: 0, converted: 0 };
      const { data: allLeads } = await supabase.from('leads').select('status, created_at').eq('organization_id', orgId).gte('created_at', monthStart);
      const total = allLeads?.length || 0;
      const converted = allLeads?.filter(l => l.status === 'converted' || l.status === 'won').length || 0;
      return { rate: total > 0 ? Math.round((converted / total) * 100) : 0, total, converted };
    },
    enabled: !!orgId,
  });

  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString();

  const { data: weeklyData = {} as Record<string, number> } = useQuery({
    queryKey: ['ai-weekly', orgId, weekStart],
    queryFn: async () => {
      if (!orgId) return {};
      const { data } = await supabase.from('bookings').select('scheduled_at').eq('organization_id', orgId).in('status', ['confirmed', 'completed']).gte('scheduled_at', weekStart).lte('scheduled_at', weekEnd);
      const counts: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
      (data || []).forEach(b => {
        const day = format(new Date(b.scheduled_at), 'EEE') as string;
        if (day in counts) counts[day]++;
      });
      return counts;
    },
    enabled: !!orgId,
  });

  const bestDay = useMemo(() => {
    const entries = Object.entries(weeklyData);
    if (!entries.length) return 'N/A';
    return entries.reduce((a, b) => (b[1] > a[1] ? b : a), entries[0])[0];
  }, [weeklyData]);

  const revenue = revenueData?.current || 0;
  const prevRevenue = revenueData?.previous || 0;
  const revenueChange = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : 0;
  const hotLeadsCount = hotLeads.length;
  const churnCount = churnCustomers.length;
  const conversionRate = conversionData?.rate || 0;

  const animRevenue = useCountUp(Math.round(revenue));
  const animHotLeads = useCountUp(hotLeadsCount);
  const animChurn = useCountUp(churnCount);
  const animConversion = useCountUp(conversionRate);

  const businessSnapshot = useMemo(() => ({
    revenue: Math.round(revenue),
    hotLeads: hotLeadsCount,
    churnCount,
    conversionRate,
    bestDay,
    weeklyData,
  }), [revenue, hotLeadsCount, churnCount, conversionRate, bestDay, weeklyData]);

  // ─── Proactive Insights Feed ───
  const [proactiveInsights, setProactiveInsights] = useState<ProactiveInsight[]>([]);
  const [proactiveLoading, setProactiveLoading] = useState(false);

  const fetchProactiveInsights = useCallback(async () => {
    if (!orgId) return;
    setProactiveLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-analysis-center', {
        body: { type: 'proactive-insights', organizationId: orgId },
      });
      if (error) throw error;
      setProactiveInsights(data?.insights || []);
    } catch (e: any) {
      console.error('Proactive insights error:', e);
    } finally {
      setProactiveLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) fetchProactiveInsights();
  }, [orgId]);

  // ─── Dynamic Chips ───
  const [dynamicChips, setDynamicChips] = useState<string[]>([]);

  const fetchDynamicChips = useCallback(async () => {
    if (!orgId) return;
    try {
      const { data, error } = await supabase.functions.invoke('ai-analysis-center', {
        body: { type: 'dynamic-chips', organizationId: orgId },
      });
      if (error) throw error;
      setDynamicChips(data?.chips || []);
    } catch {
      // Fallback chips
      setDynamicChips([
        'Why did revenue change this month?',
        'Which 5 clients should I call today?',
        "What's my most profitable day?",
        'Draft me a win-back text',
      ]);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) fetchDynamicChips();
  }, [orgId]);

  // ─── AI Insights (structured) ───
  const [insights, setInsights] = useState<any[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!orgId) return;
    setInsightsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-analysis-center', {
        body: { type: 'insights', organizationId: orgId, businessSnapshot },
      });
      if (error) throw error;
      setInsights(data?.insights || []);
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate insights');
    } finally {
      setInsightsLoading(false);
    }
  }, [orgId, businessSnapshot]);

  useEffect(() => {
    if (revenue > 0 || hotLeadsCount > 0) fetchInsights();
  }, [orgId]);

  // ─── Scheduling recommendation ───
  const [schedRec, setSchedRec] = useState('');
  const [schedLoading, setSchedLoading] = useState(false);
  const fetchScheduleRec = useCallback(async () => {
    if (!orgId) return;
    setSchedLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-analysis-center', {
        body: { type: 'scheduling', organizationId: orgId, businessSnapshot: { ...businessSnapshot, staffCount: 'unknown' } },
      });
      if (error) throw error;
      setSchedRec(data?.recommendation || '');
    } catch { setSchedRec('Unable to generate recommendation.'); }
    finally { setSchedLoading(false); }
  }, [orgId, businessSnapshot]);

  useEffect(() => {
    if (activeTab === 'scheduling' && !schedRec) fetchScheduleRec();
  }, [activeTab]);

  // ─── Growth Playbook ───
  const [playbook, setPlaybook] = useState('');
  const [playbookLoading, setPlaybookLoading] = useState(false);

  const fetchPlaybook = useCallback(async () => {
    if (!orgId) return;
    setPlaybookLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-analysis-center', {
        body: { type: 'growth-playbook', organizationId: orgId },
      });
      if (error) throw error;
      setPlaybook(data?.playbook || '');
    } catch (e: any) {
      toast.error('Failed to generate playbook');
    } finally {
      setPlaybookLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (activeTab === 'playbook' && !playbook) fetchPlaybook();
  }, [activeTab]);

  // ─── Ask AI chat ───
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef(chatMessages);
  chatMessagesRef.current = chatMessages;

  const sendChat = useCallback(async (input: string) => {
    if (!input.trim() || !orgId) return;
    const userMsg = { role: 'user' as const, content: input };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-analysis-center`;
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          type: 'chat',
          messages: [...chatMessagesRef.current, userMsg],
          organizationId: orgId,
          businessSnapshot,
        }),
      });

      if (resp.status === 429) { toast.error('Rate limit exceeded. Try again later.'); setChatLoading(false); return; }
      if (resp.status === 402) { toast.error('AI credits exhausted. Please add credits.'); setChatLoading(false); return; }
      if (!resp.ok || !resp.body) {
        const errorText = await resp.text().catch(() => '');
        console.error('AI chat error:', resp.status, errorText);
        throw new Error(`AI request failed (${resp.status})`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let assistantSoFar = '';

      const upsert = (chunk: string) => {
        assistantSoFar += chunk;
        const content = assistantSoFar;
        setChatMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') return prev.map((m, i) => i === prev.length - 1 ? { ...m, content } : m);
          return [...prev, { role: 'assistant', content }];
        });
      };

      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsert(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }
    } catch (e: any) {
      console.error('Chat error:', e);
      toast.error(e.message || 'Chat error');
    } finally {
      setChatLoading(false);
    }
  }, [orgId, businessSnapshot]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  const priorityStyles: Record<string, { bg: string; text: string; border: string }> = {
    Urgent: { bg: `${RED}18`, text: RED, border: `${RED}40` },
    Watch: { bg: `${AMBER}18`, text: AMBER, border: `${AMBER}40` },
    Opportunity: { bg: `${TEAL}18`, text: TEAL, border: `${TEAL}40` },
    Pricing: { bg: `${BLUE}18`, text: BLUE, border: `${BLUE}40` },
  };

  const insightTypeStyles: Record<string, { bg: string; border: string }> = {
    critical: { bg: `${RED}12`, border: `${RED}30` },
    warning: { bg: `${AMBER}12`, border: `${AMBER}30` },
    positive: { bg: `${TEAL}12`, border: `${TEAL}30` },
    tip: { bg: `${BLUE}12`, border: `${BLUE}30` },
  };

  const maxBookings = Math.max(...Object.values(weeklyData), 1);

  return (
    <div style={{ background: DARK_BG, minHeight: '100vh', color: '#fff', fontFamily: labelFont }} className="-m-6 p-6">
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ─── Proactive Insights Feed ─── */}
      {proactiveInsights.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={16} style={{ color: AMBER }} />
              <h3 style={{ fontFamily: labelFont, fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Smart Insights</h3>
              <Badge style={{ background: `${TEAL}20`, color: TEAL, fontSize: 10, border: 'none' }}>Live</Badge>
            </div>
            <Button size="sm" variant="ghost" onClick={fetchProactiveInsights} disabled={proactiveLoading} className="text-white/40 hover:text-white gap-1.5" style={{ fontSize: 11 }}>
              <RefreshCw size={12} className={proactiveLoading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {proactiveInsights.map((ins, i) => {
              const s = insightTypeStyles[ins.type] || insightTypeStyles.tip;
              return (
                <div key={i} style={{ ...cardStyle, borderColor: s.border, background: s.bg }} className="p-4">
                  <div className="flex items-start gap-3">
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{ins.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4, lineHeight: 1.3 }}>{ins.title}</p>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{ins.body}</p>
                      <button
                        onClick={() => { setActiveTab('ask-ai'); setChatInput(ins.action); }}
                        style={{ fontSize: 11, color: TEAL, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: labelFont }}
                        className="hover:opacity-80"
                      >
                        {ins.action} <ArrowUpRight size={10} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── KPI Strip ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        {[
          { label: 'Monthly Revenue', value: `$${animRevenue.toLocaleString()}`, sub: revenueChange >= 0 ? `+${revenueChange}% vs last month` : `${revenueChange}% vs last month`, color: TEAL, icon: TrendingUp },
          { label: 'Hot Leads', value: animHotLeads.toString(), sub: `${hotLeads.filter(l => differenceInDays(now, new Date(l.updated_at)) > 5).length} need follow-up today`, color: AMBER, icon: Flame },
          { label: 'Churn Risk', value: animChurn.toString(), sub: churnCount > 0 ? `${churnCustomers.filter(c => c.daysSince > 45).length} critical (45+ days)` : 'All customers active', color: RED, icon: ShieldAlert },
          { label: 'Conversion Rate', value: `${animConversion}%`, sub: `${conversionData?.converted || 0} of ${conversionData?.total || 0} leads this month`, color: BLUE, icon: Target },
        ].map((kpi, i) => (
          <div key={i} style={cardStyle} className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div style={{ background: `${kpi.color}18`, borderRadius: 8, padding: 6 }}>
                <kpi.icon size={18} style={{ color: kpi.color }} />
              </div>
              <span style={{ fontFamily: labelFont, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{kpi.label}</span>
            </div>
            <p style={{ fontFamily: monoFont, fontSize: 28, fontWeight: 500, color: '#fff', lineHeight: 1 }}>{kpi.value}</p>
            <p style={{ fontFamily: labelFont, fontSize: 12, color: kpi.color, marginTop: 6 }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ─── Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-transparent border-b border-white/5 rounded-none w-full justify-start gap-1 px-0 mb-6 flex-wrap">
          {[
            { value: 'overview', label: 'Overview', icon: Brain },
            { value: 'leads', label: 'Leads', icon: Flame },
            { value: 'retention', label: 'Retention', icon: Users },
            { value: 'scheduling', label: 'Scheduling', icon: Calendar },
            { value: 'calls', label: 'Call Stats', icon: Phone },
            { value: 'playbook', label: 'Growth Playbook', icon: BookOpen },
            { value: 'ask-ai', label: 'Ask AI', icon: MessageSquare },
          ].map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="data-[state=active]:bg-white/5 data-[state=active]:text-white text-white/40 rounded-lg px-4 py-2 gap-2 border-0"
              style={{ fontFamily: labelFont }}
            >
              <tab.icon size={15} />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ─── Tab 1: Overview ─── */}
        <TabsContent value="overview">
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontFamily: labelFont, fontSize: 16, fontWeight: 600 }}>AI-Generated Insights</h3>
            <Button size="sm" variant="ghost" onClick={fetchInsights} disabled={insightsLoading} className="text-white/50 hover:text-white gap-2">
              <RefreshCw size={14} className={insightsLoading ? 'animate-spin' : ''} />
              {insightsLoading ? 'Analyzing...' : 'Refresh'}
            </Button>
          </div>
          {insights.length === 0 && !insightsLoading && (
            <div style={cardStyle} className="p-8 text-center">
              <Sparkles size={32} style={{ color: TEAL, margin: '0 auto 12px' }} />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Click Refresh to generate AI insights from your business data</p>
            </div>
          )}
          <div className="space-y-3">
            {insights.map((ins, i) => {
              const s = priorityStyles[ins.priority] || priorityStyles.Watch;
              return (
                <div key={i} style={{ ...cardStyle, borderColor: s.border }} className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ background: s.bg, color: s.text, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, fontFamily: labelFont }}>{ins.priority}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: labelFont }}>{ins.confidence}</span>
                    </div>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>{ins.insight}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => { setActiveTab('ask-ai'); setChatInput(ins.promptText || ''); }}
                    style={{ background: `${s.text}20`, color: s.text, border: `1px solid ${s.border}`, fontSize: 12, fontFamily: labelFont }}
                    className="shrink-0 hover:opacity-80"
                  >
                    {ins.action} <ArrowUpRight size={12} className="ml-1" />
                  </Button>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ─── Tab 2: Leads ─── */}
        <TabsContent value="leads">
          <h3 style={{ fontFamily: labelFont, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Hot & Stale Leads</h3>
          {hotLeads.length === 0 ? (
            <div style={cardStyle} className="p-8 text-center">
              <Flame size={32} style={{ color: AMBER, margin: '0 auto 12px' }} />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>No hot or stale leads found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {hotLeads.slice(0, 15).map(lead => {
                const daysSince = differenceInDays(now, new Date(lead.updated_at));
                const typeLabel = lead.service_interest || 'Residential';
                return (
                  <div key={lead.id} style={cardStyle} className="p-4 flex items-center justify-between">
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500 }}>{lead.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: labelFont }}>{typeLabel}</span>
                        <span style={{ fontSize: 11, fontFamily: monoFont, color: daysSince > 5 ? RED : AMBER }}>{daysSince}d since contact</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setActiveTab('ask-ai');
                        setChatInput(`Draft a follow-up message for ${lead.name}, a ${typeLabel} lead who hasn't been contacted in ${daysSince} days. Make it personal and include a scheduling CTA.`);
                      }}
                      style={{ background: `${TEAL}18`, color: TEAL, border: `1px solid ${TEAL}30`, fontSize: 12, fontFamily: labelFont }}
                      className="hover:opacity-80"
                    >
                      Draft message <ArrowUpRight size={12} className="ml-1" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 3: Retention ─── */}
        <TabsContent value="retention">
          <h3 style={{ fontFamily: labelFont, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Churn Risk Customers</h3>
          {churnCustomers.length === 0 ? (
            <div style={cardStyle} className="p-8 text-center">
              <Users size={32} style={{ color: TEAL, margin: '0 auto 12px' }} />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>All customers are active — no churn risk detected</p>
            </div>
          ) : (
            <div className="space-y-2">
              {churnCustomers.slice(0, 5).map(c => {
                const barColor = c.daysSince >= 45 ? RED : c.daysSince >= 30 ? AMBER : TEAL;
                const barWidth = Math.min((c.daysSince / 90) * 100, 100);
                return (
                  <div key={c.id} style={cardStyle} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 500 }}>{c.first_name} {c.last_name}</p>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{c.serviceName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span style={{ fontFamily: monoFont, fontSize: 13, color: barColor }}>{c.daysSince}d</span>
                        <Button
                          size="sm"
                          onClick={() => {
                            setActiveTab('ask-ai');
                            setChatInput(`Draft a re-engagement message for ${c.first_name} ${c.last_name}, who last booked ${c.daysSince} days ago for ${c.serviceName}. Make it warm and offer a small incentive to rebook.`);
                          }}
                          style={{ background: `${TEAL}18`, color: TEAL, border: `1px solid ${TEAL}30`, fontSize: 12, fontFamily: labelFont }}
                          className="hover:opacity-80"
                        >
                          Draft re-engagement <ArrowUpRight size={12} className="ml-1" />
                        </Button>
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ background: barColor, width: `${barWidth}%`, height: '100%', borderRadius: 4, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 4: Scheduling ─── */}
        <TabsContent value="scheduling">
          <h3 style={{ fontFamily: labelFont, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            This Week's Bookings
            <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>
              {format(startOfWeek(now, { weekStartsOn: 1 }), 'MMM d')} – {format(endOfWeek(now, { weekStartsOn: 1 }), 'MMM d')}
            </span>
          </h3>
          <div style={cardStyle} className="p-5 mb-4">
            <div className="grid grid-cols-7 gap-3" style={{ height: 200 }}>
              {DAYS.map(day => {
                const count = weeklyData[day] || 0;
                const barHeight = count > 0 && maxBookings > 0 ? Math.max((count / maxBookings) * 100, 12) : 0;
                return (
                  <div key={day} className="flex flex-col items-center justify-end h-full gap-0">
                    <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      {count > 0 ? (
                        <div style={{
                          width: '55%',
                          height: `${barHeight}%`,
                          background: `linear-gradient(180deg, ${TEAL}, ${TEAL}88)`,
                          borderRadius: '6px 6px 2px 2px',
                          transition: 'height 0.6s ease',
                          minHeight: 16,
                        }} />
                      ) : (
                        <div style={{ width: '55%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }} />
                      )}
                    </div>
                    <span style={{ fontFamily: monoFont, fontSize: 14, fontWeight: 500, color: count > 0 ? '#fff' : 'rgba(255,255,255,0.25)', marginTop: 8 }}>{count}</span>
                    <span style={{ fontFamily: labelFont, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{day}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={cardStyle} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} style={{ color: TEAL }} />
              <span style={{ fontFamily: labelFont, fontSize: 13, fontWeight: 600 }}>AI Recommendation</span>
            </div>
            {schedLoading ? (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Generating recommendation...</p>
            ) : (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{schedRec || 'Click refresh to generate a scheduling recommendation.'}</p>
            )}
          </div>
        </TabsContent>

        {/* ─── Tab 5: Growth Playbook ─── */}
        <TabsContent value="playbook">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen size={18} style={{ color: AMBER }} />
              <h3 style={{ fontFamily: labelFont, fontSize: 16, fontWeight: 600 }}>Growth Playbook</h3>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Non-obvious strategies for your business</span>
            </div>
            <Button size="sm" variant="ghost" onClick={fetchPlaybook} disabled={playbookLoading} className="text-white/50 hover:text-white gap-2">
              <RefreshCw size={14} className={playbookLoading ? 'animate-spin' : ''} />
              {playbookLoading ? 'Generating...' : 'Regenerate'}
            </Button>
          </div>
          {playbookLoading && !playbook ? (
            <div style={cardStyle} className="p-8 text-center">
              <RefreshCw size={32} style={{ color: TEAL, margin: '0 auto 12px' }} className="animate-spin" />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Analyzing your data and generating personalized growth strategies...</p>
            </div>
          ) : playbook ? (
            <div style={cardStyle} className="p-6">
              <div
                style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.7 }}
                className="prose prose-invert prose-sm max-w-none [&_h2]:text-white [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:text-white [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_strong]:text-white [&_ul]:space-y-1 [&_ol]:space-y-1 [&_li]:text-white/70 [&_p]:text-white/70"
              >
                <ReactMarkdown>{playbook}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div style={cardStyle} className="p-8 text-center">
              <BookOpen size={32} style={{ color: AMBER, margin: '0 auto 12px' }} />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Click Regenerate to get personalized growth strategies based on your data</p>
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 6: Ask AI ─── */}
        <TabsContent value="ask-ai">
          <h3 style={{ fontFamily: labelFont, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Ask TidyWise AI</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {dynamicChips.map((q, i) => (
              <button
                key={i}
                onClick={() => sendChat(q)}
                style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 20, padding: '8px 16px', fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: labelFont, cursor: 'pointer', minHeight: 44 }}
                className="hover:bg-white/10 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
          <div style={{ ...cardStyle, maxHeight: 450, overflowY: 'auto', marginBottom: 16 }} className="p-4">
            {chatMessages.length === 0 ? (
              <div className="text-center py-8">
                <Brain size={32} style={{ color: TEAL, margin: '0 auto 12px' }} />
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Ask a question or tap a chip above to start</p>
                <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 4 }}>AI has access to your real business data for specific advice</p>
              </div>
            ) : (
              <div className="space-y-4">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      style={{
                        maxWidth: '80%',
                        padding: '10px 14px',
                        borderRadius: 12,
                        fontSize: 13,
                        lineHeight: 1.6,
                        background: msg.role === 'user' ? `${BLUE}20` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${msg.role === 'user' ? `${BLUE}30` : BORDER}`,
                        color: 'rgba(255,255,255,0.85)',
                      }}
                      className={msg.role === 'assistant' ? 'prose prose-invert prose-sm max-w-none [&_strong]:text-white [&_ul]:space-y-0.5 [&_ol]:space-y-0.5 [&_li]:text-white/80 [&_p]:text-white/80 [&_p]:mb-2 [&_h3]:text-white [&_h3]:text-sm [&_h3]:font-semibold' : ''}
                    >
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>
          <div className="flex gap-2 sticky bottom-0 pt-2" style={{ background: DARK_BG }}>
            <Input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat(chatInput)}
              placeholder="Ask about your business..."
              style={{ background: CARD_BG, border: `1px solid ${BORDER}`, color: '#fff', fontFamily: labelFont, fontSize: 15, minHeight: 44 }}
              className="flex-1"
            />
            <Button
              onClick={() => sendChat(chatInput)}
              disabled={chatLoading || !chatInput.trim()}
              style={{ background: TEAL, color: DARK_BG, minHeight: 44, minWidth: 44 }}
              className="hover:opacity-90"
            >
              {chatLoading ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>
        </TabsContent>

        {/* ─── Tab: Call Stats ─── */}
        <TabsContent value="calls">
          <CallStatsContent orgId={orgId} cardStyle={cardStyle} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
