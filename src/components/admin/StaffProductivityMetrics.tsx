import { useMemo } from 'react';
import { BookingWithDetails } from '@/hooks/useBookings';
import { useTestMode } from '@/contexts/TestModeContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { Clock, TrendingUp, Target, Award, Users, DollarSign, CheckCircle } from 'lucide-react';
import { differenceInMinutes, format, startOfWeek, eachWeekOfInterval, subMonths, isSameWeek } from 'date-fns';

interface StaffProductivityMetricsProps {
  bookings: BookingWithDetails[];
  staff: { id: string; name: string; hourly_rate?: number | null; percentage_rate?: number | null }[];
}

interface StaffMetrics {
  id: string;
  name: string;
  completedJobs: number;
  totalRevenue: number;
  totalEarnings: number;
  avgJobDuration: number;
  onTimeRate: number;
  avgRating: number;
  efficiency: number; // Revenue per hour
  jobsPerWeek: number;
  cancellationRate: number;
  productivityScore: number;
}

export function StaffProductivityMetrics({ bookings, staff }: StaffProductivityMetricsProps) {
  const { isTestMode, maskName } = useTestMode();

  const staffMetrics = useMemo(() => {
    const metricsMap = new Map<string, StaffMetrics>();

    staff.forEach(s => {
      metricsMap.set(s.id, {
        id: s.id,
        name: s.name,
        completedJobs: 0,
        totalRevenue: 0,
        totalEarnings: 0,
        avgJobDuration: 0,
        onTimeRate: 100,
        avgRating: 0,
        efficiency: 0,
        jobsPerWeek: 0,
        cancellationRate: 0,
        productivityScore: 0
      });
    });

    // Group bookings by staff
    const staffBookings = new Map<string, BookingWithDetails[]>();
    bookings.forEach(b => {
      if (b.staff?.id) {
        const existing = staffBookings.get(b.staff.id) || [];
        existing.push(b);
        staffBookings.set(b.staff.id, existing);
      }
    });

    // Calculate metrics for each staff member
    staffBookings.forEach((staffJobs, staffId) => {
      const metrics = metricsMap.get(staffId);
      if (!metrics) return;

      const completedJobs = staffJobs.filter(b => b.status === 'completed');
      const cancelledJobs = staffJobs.filter(b => b.status === 'cancelled');
      
      metrics.completedJobs = completedJobs.length;
      metrics.totalRevenue = completedJobs.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
      metrics.totalEarnings = completedJobs.reduce((sum, b) => sum + Number((b as any).cleaner_actual_payment || 0), 0);
      
      // Calculate average job duration (from check-in to check-out if available)
      const jobsWithTime = completedJobs.filter(b => (b as any).cleaner_checkin_at && (b as any).cleaner_checkout_at);
      if (jobsWithTime.length > 0) {
        const totalMinutes = jobsWithTime.reduce((sum, b) => {
          const checkin = new Date((b as any).cleaner_checkin_at);
          const checkout = new Date((b as any).cleaner_checkout_at);
          return sum + differenceInMinutes(checkout, checkin);
        }, 0);
        metrics.avgJobDuration = totalMinutes / jobsWithTime.length;
      } else {
        metrics.avgJobDuration = completedJobs.reduce((sum, b) => sum + b.duration, 0) / Math.max(completedJobs.length, 1);
      }

      // Calculate efficiency (revenue per hour)
      const totalHours = (metrics.avgJobDuration * metrics.completedJobs) / 60;
      metrics.efficiency = totalHours > 0 ? metrics.totalRevenue / totalHours : 0;

      // Calculate jobs per week (last 12 weeks)
      const twelveWeeksAgo = subMonths(new Date(), 3);
      const recentJobs = completedJobs.filter(b => new Date(b.scheduled_at) > twelveWeeksAgo);
      metrics.jobsPerWeek = recentJobs.length / 12;

      // Cancellation rate
      const totalJobs = staffJobs.length;
      metrics.cancellationRate = totalJobs > 0 ? (cancelledJobs.length / totalJobs) * 100 : 0;

      // On-time rate (jobs started within 15 min of scheduled time)
      const jobsWithCheckin = completedJobs.filter(b => (b as any).cleaner_checkin_at);
      if (jobsWithCheckin.length > 0) {
        const onTimeJobs = jobsWithCheckin.filter(b => {
          const scheduled = new Date(b.scheduled_at);
          const checkin = new Date((b as any).cleaner_checkin_at);
          return Math.abs(differenceInMinutes(checkin, scheduled)) <= 15;
        });
        metrics.onTimeRate = (onTimeJobs.length / jobsWithCheckin.length) * 100;
      }

      // Calculate productivity score (weighted average)
      const completionWeight = 0.25;
      const efficiencyWeight = 0.25;
      const onTimeWeight = 0.2;
      const cancellationWeight = 0.15;
      const frequencyWeight = 0.15;

      const completionScore = Math.min(100, metrics.completedJobs * 2);
      const efficiencyScore = Math.min(100, metrics.efficiency);
      const onTimeScore = metrics.onTimeRate;
      const cancellationScore = 100 - metrics.cancellationRate;
      const frequencyScore = Math.min(100, metrics.jobsPerWeek * 20);

      metrics.productivityScore = Math.round(
        (completionScore * completionWeight) +
        (efficiencyScore * efficiencyWeight) +
        (onTimeScore * onTimeWeight) +
        (cancellationScore * cancellationWeight) +
        (frequencyScore * frequencyWeight)
      );
    });

    return Array.from(metricsMap.values())
      .filter(m => m.completedJobs > 0)
      .sort((a, b) => b.productivityScore - a.productivityScore);
  }, [bookings, staff]);

  const weeklyTrends = useMemo(() => {
    const startDate = subMonths(new Date(), 3);
    const weeks = eachWeekOfInterval({ start: startDate, end: new Date() });
    
    return weeks.map(weekStart => {
      const weekBookings = bookings.filter(b => 
        b.status === 'completed' && 
        isSameWeek(new Date(b.scheduled_at), weekStart)
      );
      
      return {
        week: format(weekStart, 'MMM d'),
        jobs: weekBookings.length,
        revenue: weekBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
        avgDuration: weekBookings.length > 0 
          ? weekBookings.reduce((sum, b) => sum + b.duration, 0) / weekBookings.length 
          : 0
      };
    });
  }, [bookings]);

  const teamAverages = useMemo(() => {
    if (staffMetrics.length === 0) return {
      avgJobs: 0, avgRevenue: 0, avgEfficiency: 0, avgOnTime: 0, avgScore: 0
    };

    return {
      avgJobs: staffMetrics.reduce((sum, s) => sum + s.completedJobs, 0) / staffMetrics.length,
      avgRevenue: staffMetrics.reduce((sum, s) => sum + s.totalRevenue, 0) / staffMetrics.length,
      avgEfficiency: staffMetrics.reduce((sum, s) => sum + s.efficiency, 0) / staffMetrics.length,
      avgOnTime: staffMetrics.reduce((sum, s) => sum + s.onTimeRate, 0) / staffMetrics.length,
      avgScore: staffMetrics.reduce((sum, s) => sum + s.productivityScore, 0) / staffMetrics.length
    };
  }, [staffMetrics]);

  const topPerformer = staffMetrics[0];
  
  const radarData = topPerformer ? [
    { metric: 'Jobs', value: Math.min(100, topPerformer.completedJobs * 2) },
    { metric: 'Efficiency', value: Math.min(100, topPerformer.efficiency) },
    { metric: 'On-Time', value: topPerformer.onTimeRate },
    { metric: 'Consistency', value: 100 - topPerformer.cancellationRate },
    { metric: 'Frequency', value: Math.min(100, topPerformer.jobsPerWeek * 20) },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Staff</p>
              <p className="text-2xl font-bold">{isTestMode ? 'X' : staffMetrics.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Jobs/Staff</p>
              <p className="text-2xl font-bold">{isTestMode ? 'XX' : teamAverages.avgJobs.toFixed(0)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-info/10">
              <DollarSign className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Efficiency</p>
              <p className="text-2xl font-bold">{isTestMode ? '$XX' : `$${teamAverages.avgEfficiency.toFixed(0)}/hr`}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">On-Time Rate</p>
              <p className="text-2xl font-bold">{isTestMode ? 'XX%' : `${teamAverages.avgOnTime.toFixed(0)}%`}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Target className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Team Score</p>
              <p className="text-2xl font-bold">{isTestMode ? 'XX' : teamAverages.avgScore.toFixed(0)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Trends */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Weekly Team Performance</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" fontSize={12} />
                <YAxis yAxisId="left" tickFormatter={(v) => `$${v/1000}k`} />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" name="Revenue" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="jobs" stroke="hsl(var(--success))" name="Jobs" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Top Performer Radar */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4">
            Top Performer: {topPerformer ? maskName(topPerformer.name) : 'N/A'}
          </h3>
          <div className="h-[300px]">
            {radarData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No performance data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="metric" fontSize={12} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} />
                  <Radar
                    name="Performance"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Staff Productivity Table */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Staff Productivity Rankings</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="pb-3 font-medium text-muted-foreground">Rank</th>
                <th className="pb-3 font-medium text-muted-foreground">Staff Member</th>
                <th className="pb-3 font-medium text-muted-foreground text-right">Jobs</th>
                <th className="pb-3 font-medium text-muted-foreground text-right">Revenue</th>
                <th className="pb-3 font-medium text-muted-foreground text-right">Efficiency</th>
                <th className="pb-3 font-medium text-muted-foreground text-right">On-Time</th>
                <th className="pb-3 font-medium text-muted-foreground text-right">Jobs/Week</th>
                <th className="pb-3 font-medium text-muted-foreground text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {staffMetrics.map((staff, index) => (
                <tr key={staff.id} className="border-b border-border/50 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {index === 0 && <Award className="w-4 h-4 text-amber-500" />}
                      {index === 1 && <Award className="w-4 h-4 text-slate-400" />}
                      {index === 2 && <Award className="w-4 h-4 text-orange-600" />}
                      <span className="font-medium">#{index + 1}</span>
                    </div>
                  </td>
                  <td className="py-3 font-medium">{maskName(staff.name)}</td>
                  <td className="py-3 text-right">{isTestMode ? 'XX' : staff.completedJobs}</td>
                  <td className="py-3 text-right font-semibold text-success">
                    {isTestMode ? '$X,XXX' : `$${staff.totalRevenue.toLocaleString()}`}
                  </td>
                  <td className="py-3 text-right">
                    {isTestMode ? '$XX' : `$${staff.efficiency.toFixed(0)}/hr`}
                  </td>
                  <td className="py-3 text-right">
                    <Badge variant={staff.onTimeRate >= 90 ? 'default' : staff.onTimeRate >= 75 ? 'secondary' : 'destructive'}>
                      {isTestMode ? 'XX%' : `${staff.onTimeRate.toFixed(0)}%`}
                    </Badge>
                  </td>
                  <td className="py-3 text-right">{isTestMode ? 'X.X' : staff.jobsPerWeek.toFixed(1)}</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Progress value={staff.productivityScore} className="w-16 h-2" />
                      <span className="font-bold w-8">{isTestMode ? 'XX' : staff.productivityScore}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
