import React, { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { RefreshCw, TrendingUp, AlertTriangle } from "lucide-react";

export default function BacktestCard({ ticker, refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    
    // Auth token needed
    const token = localStorage.getItem("token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch(`http://127.0.0.1:8000/api/backtest/${ticker}?years=3`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error("API Error");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setError(true);
        setLoading(false);
      });
  }, [ticker, refreshKey]);

  if (!ticker) return null;
  if (loading) return <div className="mt-6 p-6 rounded-xl border border-cyan-500/20 bg-[#0f1e37]/60 text-cyan-400 font-mono animate-pulse text-center">Running 3-Year Strategy Simulation on {ticker}...</div>;
  if (error || !data || !data.equity_curve) return <div className="mt-6 p-6 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 flex items-center justify-center gap-2"><AlertTriangle /> Backtest failed. Insufficient data.</div>;

  return (
    <div className="mt-6 bg-[#0f1e37]/60 backdrop-blur-md rounded-xl border border-cyan-500/20 p-6 shadow-[0_0_15px_rgba(6,182,212,0.1)] transition-all">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold bg-linear-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-cyan-400" />
          Strategy Lab: 3-Year Walk-Forward Backtest ({ticker})
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#0f1e37] p-4 rounded-lg border border-cyan-500/10 text-center shadow-inner">
          <p className="text-gray-400 text-[10px] mb-1 font-mono uppercase">AI Win Rate</p>
          <p className="text-xl font-bold text-emerald-400">{data.win_rate}%</p>
        </div>
        <div className="bg-[#0f1e37] p-4 rounded-lg border border-cyan-500/10 text-center shadow-inner">
          <p className="text-gray-400 text-[10px] mb-1 font-mono uppercase">Return vs B&H</p>
          <p className={`text-xl font-bold ${data.total_return > data.buy_hold_return ? 'text-emerald-400' : 'text-amber-400'}`}>
            {data.total_return}% vs {data.buy_hold_return}%
          </p>
        </div>
        <div className="bg-[#0f1e37] p-4 rounded-lg border border-cyan-500/10 text-center shadow-inner">
          <p className="text-gray-400 text-[10px] mb-1 font-mono uppercase">Sharpe Ratio</p>
          <p className="text-xl font-bold text-cyan-400">{data.sharpe_ratio}</p>
        </div>
        <div className="bg-[#0f1e37] p-4 rounded-lg border border-cyan-500/10 text-center shadow-inner">
          <p className="text-gray-400 text-[10px] mb-1 font-mono uppercase">Max Drawdown</p>
          <p className="text-xl font-bold text-red-400">-{data.max_drawdown}%</p>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.equity_curve} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.5}/>
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="date" stroke="#4b5563" fontSize={11} minTickGap={30} tickMargin={10} tick={{fill: '#9ca3af'}} />
            <YAxis stroke="#4b5563" fontSize={11} domain={['auto', 'auto']} tickFormatter={(v) => `$${v}`} tick={{fill: '#9ca3af'}} width={60} />
            <Tooltip 
              contentStyle={{ backgroundColor: "#0f1e37", borderColor: "#06b6d4", color: "#fff", borderRadius: "8px" }}
              itemStyle={{ color: "#06b6d4" }}
              formatter={(value) => [`$${value}`, "Equity Value"]}
              labelStyle={{ color: "#9ca3af", marginBottom: "4px" }}
            />
            <Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 text-center">
        <p className="text-gray-500 text-xs italic">Backtest simulates $10,000 initial capital using historical predictions.</p>
      </div>
    </div>
  );
}
