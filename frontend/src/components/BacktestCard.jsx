import React, { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function BacktestCard({ ticker, refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [beginnerMode, setBeginnerMode] = useState(window.simpleMode || false);

  useEffect(() => {
    const handleToggle = () => setBeginnerMode(window.simpleMode);
    window.addEventListener('toggle_simple_mode', handleToggle);
    return () => window.removeEventListener('toggle_simple_mode', handleToggle);
  }, []);

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

  const isOutperforming = data.total_return > data.buy_hold_return;
  const finalEquity = (10000 * (1 + data.total_return / 100)).toFixed(2);
  const profitAmt = (finalEquity - 10000).toFixed(2);

  return (
    <div className="mt-6 bg-[#0f1e37]/60 backdrop-blur-md rounded-xl border border-cyan-500/20 p-6 shadow-[0_0_15px_rgba(6,182,212,0.1)] transition-all">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold bg-linear-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-cyan-400" />
          Strategy Lab: 3-Year Walk-Forward Backtest ({ticker})
        </h2>
      </div>

      <AnimatePresence mode="wait">
        {beginnerMode ? (
          <motion.div
            key="simple"
            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}
            className="mb-6 p-4 rounded-lg bg-cyan-900/20 border border-cyan-500/30 shadow-inner"
          >
            <p className="text-sm text-cyan-50 leading-relaxed">
              <strong>What does this mean?</strong> If you had invested <strong className="text-white">$10,000</strong> using our AI three years ago, 
              it would have grown to <strong className="text-emerald-400">${Number(finalEquity).toLocaleString()}</strong> today. 
              That's a profit of <strong className="text-emerald-400">${Number(profitAmt).toLocaleString()}</strong> ({data.total_return}%)!
            </p>
            <p className="text-sm text-cyan-50/70 mt-2">
              {isOutperforming 
                ? `🚀 The AI outsmarted the market! Just buying and holding the stock normally would have only made you ${data.buy_hold_return}%.`
                : `🛡️ In this specific case, the AI played it safe. Buying and holding the stock would have made you ${data.buy_hold_return}%, but the AI strategy actively protected your money during market crashes.`}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Win Rate */}
        <div className="bg-[#0f1e37] p-4 rounded-lg border border-cyan-500/10 text-center shadow-inner flex flex-col justify-center">
          <p className="text-gray-400 text-[10px] mb-1 font-mono uppercase">
            {beginnerMode ? "Success Rate" : "AI Win Rate"}
          </p>
          <p className="text-xl font-bold text-emerald-400">{data.win_rate}%</p>
          <p className="text-gray-500 text-[9px] mt-1 uppercase tracking-wider">
            {beginnerMode ? "Profitable Trades" : "Percentage of winning trades"}
          </p>
        </div>
        
        {/* Return */}
        <div className="bg-[#0f1e37] p-4 rounded-lg border border-cyan-500/10 text-center shadow-inner flex flex-col justify-center">
          <p className="text-gray-400 text-[10px] mb-1 font-mono uppercase">
            {beginnerMode ? "AI vs Normal" : "Return vs B&H"}
          </p>
          <p className={`text-xl font-bold ${isOutperforming ? 'text-emerald-400' : 'text-amber-400'}`}>
            {data.total_return}% vs {data.buy_hold_return}%
          </p>
          <p className="text-gray-500 text-[9px] mt-1 uppercase tracking-wider">
            {beginnerMode ? "How much more the AI made" : "Strategy vs Buy & Hold"}
          </p>
        </div>

        {/* Sharpe Ratio */}
        <div className="bg-[#0f1e37] p-4 rounded-lg border border-cyan-500/10 text-center shadow-inner flex flex-col justify-center" title="A measure of risk-adjusted return. >1.0 is good, >2.0 is excellent.">
          <p className="text-gray-400 text-[10px] mb-1 font-mono uppercase flex justify-center items-center gap-1">
            {beginnerMode ? "Risk Score" : "Sharpe Ratio"}
          </p>
          <p className="text-xl font-bold text-cyan-400">{data.sharpe_ratio}</p>
          <p className="text-gray-500 text-[9px] mt-1 uppercase tracking-wider">
            {beginnerMode ? (data.sharpe_ratio > 1 ? "Safe Returns" : "Risky Returns") : "Risk-adjusted performance"}
          </p>
        </div>

        {/* Max Drawdown */}
        <div className="bg-[#0f1e37] p-4 rounded-lg border border-cyan-500/10 text-center shadow-inner flex flex-col justify-center" title="The maximum observed loss from a peak to a trough before a new peak is attained.">
          <p className="text-gray-400 text-[10px] mb-1 font-mono uppercase">
            {beginnerMode ? "Biggest Drop" : "Max Drawdown"}
          </p>
          <p className="text-xl font-bold text-red-400">-{data.max_drawdown}%</p>
          <p className="text-gray-500 text-[9px] mt-1 uppercase tracking-wider">
            {beginnerMode ? "Worst temporary loss" : "Peak-to-trough decline"}
          </p>
        </div>
      </div>

      <div style={{ width: '100%', height: 256, position: 'relative' }}>
        <ResponsiveContainer width="100%" height={256}>
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
              formatter={(value) => [`$${Number(value).toLocaleString()}`, "Equity Value"]}
              labelStyle={{ color: "#9ca3af", marginBottom: "4px" }}
            />
            <Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 text-center">
        <p className="text-gray-500 text-xs italic">
          {beginnerMode 
            ? "The chart above shows exactly how your $10,000 would have grown day-by-day over the last 3 years."
            : "Backtest simulates $10,000 initial capital using historical predictions."}
        </p>
      </div>
    </div>
  );
}
