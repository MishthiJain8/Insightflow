import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function PortfolioHistoryChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500 font-mono text-xs italic">
        Initializing Portfolio Analytics...
      </div>
    );
  }

  // Format timestamps for display
  const chartData = data.map(item => ({
    ...item,
    displayDate: new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
  }));

  return (
    <div className="h-full w-full" style={{ padding: '10px', minHeight: 300, position: 'relative' }}>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-fuchsia)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--accent-fuchsia)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis 
            dataKey="displayDate" 
            stroke="var(--text-muted)" 
            fontSize={10} 
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          <YAxis 
            stroke="var(--text-muted)" 
            fontSize={10} 
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v.toLocaleString()}`}
            domain={['dataMin - 500', 'dataMax + 500']}
          />
          <Tooltip
            contentStyle={{ 
              backgroundColor: 'rgba(15, 30, 55, 0.95)', 
              borderColor: 'var(--glass-border)',
              borderRadius: '12px',
              fontSize: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
            }}
            itemStyle={{ color: 'var(--accent-fuchsia)' }}
            formatter={(value) => [`$${parseFloat(value).toLocaleString()}`, 'Portfolio Value']}
          />
          <Area 
            type="monotone" 
            dataKey="total_value" 
            stroke="var(--accent-fuchsia)" 
            strokeWidth={4}
            fillOpacity={1} 
            fill="url(#colorValue)" 
            connectNulls={true}
            animationDuration={1500}
            style={{ filter: 'drop-shadow(0 0 6px rgba(217, 70, 239, 0.4))' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
