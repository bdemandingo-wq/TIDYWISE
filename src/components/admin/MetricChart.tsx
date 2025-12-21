import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface DataPoint {
  date: string;
  value: number;
}

interface MetricChartProps {
  title: string;
  value: string | number;
  data: DataPoint[];
  dateRange: string;
  isCurrency?: boolean;
  color?: string;
}

export function MetricChart({ 
  title, 
  value, 
  data, 
  dateRange,
  isCurrency = false,
  color = 'hsl(var(--primary))'
}: MetricChartProps) {
  const maxValue = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.max(...data.map(d => d.value));
  }, [data]);

  const maxPoint = useMemo(() => {
    if (data.length === 0) return null;
    const max = data.reduce((prev, curr) => curr.value > prev.value ? curr : prev, data[0]);
    const index = data.findIndex(d => d.date === max.date);
    return { ...max, index };
  }, [data]);

  const formatValue = (val: number) => {
    if (isCurrency) {
      if (val >= 1000) {
        return `$${(val / 1000).toFixed(1)}K`;
      }
      return `$${val.toFixed(2)}`;
    }
    return val.toString();
  };

  return (
    <div className="py-6 border-t border-border">
      <h4 className="text-sm text-muted-foreground font-medium">{title}</h4>
      <p className="text-3xl font-bold text-primary mt-1">
        {typeof value === 'number' && isCurrency ? formatValue(value) : value}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{dateRange}</p>
      
      <div className="h-32 mt-4 relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
            <XAxis 
              dataKey="date" 
              hide 
            />
            <YAxis hide domain={[0, maxValue * 1.2]} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              labelFormatter={(label) => {
                try {
                  return format(parseISO(label), 'MMM d, yyyy');
                } catch {
                  return label;
                }
              }}
              formatter={(val: number) => [isCurrency ? `$${val.toFixed(2)}` : val, title]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color }}
            />
          </LineChart>
        </ResponsiveContainer>
        
        {/* Max value label */}
        {maxPoint && maxPoint.value > 0 && (
          <div 
            className="absolute bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded"
            style={{
              left: `${(maxPoint.index / (data.length - 1)) * 100}%`,
              top: '0',
              transform: 'translateX(-50%)',
            }}
          >
            {isCurrency ? formatValue(maxPoint.value) : maxPoint.value}
          </div>
        )}
        
        {/* Min value label */}
        {data.length > 0 && (
          <div 
            className="absolute bg-primary/80 text-primary-foreground text-xs px-2 py-0.5 rounded"
            style={{
              left: '0',
              bottom: '0',
            }}
          >
            {isCurrency ? '$0.00' : '0'}
          </div>
        )}
      </div>
    </div>
  );
}
