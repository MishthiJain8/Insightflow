import React, { useState, useEffect } from 'react'
import { X, Activity } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import StockChart from './StockChart'
import CompanyOverview from './CompanyOverview'
import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export default function TickerModal({ ticker, onClose }) {
    const { token } = useAuth()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [range, setRange] = useState('1Y')

    useEffect(() => {
        if (!ticker) return
        setLoading(true)
        fetch(`${API_BASE}/api/market/${ticker}?range=${range}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(resData => {
            setData(resData)
            setLoading(false)
        })
        .catch(err => {
            console.error("Failed to fetch ticker data", err)
            setLoading(false)
        })
    }, [ticker, range, token])

    if (!ticker) return null

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-9999 flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    onClick={onClose}
                />
                
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-7xl max-h-[90vh] flex flex-col glass rounded-[2.5rem] overflow-hidden border shadow-2xl"
                    style={{ background: 'rgba(10, 15, 25, 0.85)', borderColor: 'rgba(255,255,255,0.1)' }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-xl font-black text-white">
                                {ticker[0]}
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white tracking-wider">{ticker}</h2>
                                <div className="text-xs text-gray-400 font-medium tracking-wide">
                                    {data?.name || 'Loading details...'}
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-transparent hover:border-white/10 cursor-pointer"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-6 hide-scrollbar">
                        {/* Left side: Chart */}
                        <div className="flex-1 min-h-[500px]">
                            <StockChart 
                                data={data} 
                                loading={loading} 
                                activeRange={range} 
                                onRangeChange={setRange} 
                            />
                        </div>
                        
                        {/* Right side: Overview */}
                        <div className="lg:w-[400px]">
                            <CompanyOverview 
                                data={data} 
                                loading={loading} 
                            />
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
