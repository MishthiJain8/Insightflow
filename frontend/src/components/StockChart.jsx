import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries } from 'lightweight-charts'
import { BarChart2, MousePointer2 } from 'lucide-react'

// ─── Range Config ─────────────────────────────────────────────────────────
const RANGES = [
    { label: '5m', range: '5m' },
    { label: '1h', range: '1h' },
    { label: '1D', range: '1D' },
    { label: '1W', range: '1W' },
    { label: '1M', range: '1M' },
    { label: '6M', range: '6M' },
    { label: '1Y', range: '1Y' },
    { label: '5Y', range: '5Y' },
    { label: 'MAX', range: 'MAX' },
]

// ─── Chart Type Config ────────────────────────────────────────────────────────
const CHART_TYPES = [
    { label: 'Candlestick', id: 'candlestick' },
    { label: 'Line', id: 'line' },
    { label: 'Area', id: 'area' },
]

function ChartTypeSelector({ active, onChange }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            padding: '4px 6px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 8,
            border: '1px solid var(--glass-border)',
        }}>
            {CHART_TYPES.map(({ label, id }) => {
                const isActive = active === id
                return (
                    <button
                        key={id}
                        onClick={() => onChange(id)}
                        style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.68rem',
                            fontWeight: isActive ? 700 : 500,
                            background: isActive
                                ? 'rgba(6,182,212,0.15)'
                                : 'transparent',
                            color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
                            transition: 'all 0.2s ease',
                            boxShadow: isActive ? '0 0 10px rgba(6,182,212,0.1)' : 'none',
                        }}
                    >
                        {label}
                    </button>
                )
            })}
        </div>
    )
}

// ─── Range Selector ───────────────────────────────────────────────────────
function RangeSelector({ active, onChange }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            padding: '6px 8px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 8,
            border: '1px solid var(--glass-border)',
        }}>
            {RANGES.map(({ label, range }) => {
                const isActive = active === range
                return (
                    <button
                        key={range}
                        id={`tr-${label.toLowerCase()}`}
                        onClick={() => onChange(range)}
                        style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.70rem',
                            fontWeight: isActive ? 700 : 500,
                            fontFamily: "'JetBrains Mono', monospace",
                            letterSpacing: '0.01em',
                            background: isActive
                                ? 'linear-gradient(135deg, rgba(6,182,212,0.25), rgba(6,182,212,0.1))'
                                : 'transparent',
                            color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
                            transition: 'all 0.15s ease',
                            borderBottom: isActive ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                        }}
                    >
                        {label}
                    </button>
                )
            })}
        </div>
    )
}

// ─── OHLCV Tooltip ────────────────────────────────────────────────────────────
function OHLCVBar({ ohlcv, currency }) {
    if (!ohlcv) return null
    const fmt = (v) => v != null ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v) : '—'
    const fmtVol = (v) => v != null ? (v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : (v / 1e3).toFixed(2) + 'K') : '—'
    const isUp = ohlcv.close >= ohlcv.open
    return (
        <div style={{
            display: 'flex', gap: 14, alignItems: 'center',
            fontSize: '0.72rem', fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap'
        }}>
            {[
                { label: 'O', value: fmt(ohlcv.open) },
                { label: 'H', value: fmt(ohlcv.high) },
                { label: 'L', value: fmt(ohlcv.low) },
                { label: 'C', value: fmt(ohlcv.close), highlight: true, up: isUp },
                { label: 'V', value: fmtVol(ohlcv.volume || ohlcv.value) },
            ].map(({ label, value, highlight, up }) => (
                <span key={label}>
                    <span style={{ color: 'var(--text-muted)' }}>{label} </span>
                    <span style={{ color: highlight ? (up ? 'var(--accent-emerald)' : 'var(--accent-red)') : 'var(--text-primary)', fontWeight: 600 }}>
                        {value}
                    </span>
                </span>
            ))}
        </div>
    )
}

// ─── Main Chart Component ─────────────────────────────────────────────────────
export default function StockChart({ data, activeRange, onRangeChange, loading }) {
    const containerRef = useRef(null)
    const chartRef = useRef(null)
    const mainSeriesRef = useRef(null)
    const volumeRef = useRef(null)
    const [hoveredBar, setHoveredBar] = useState(null)
    const [chartType, setChartType] = useState('candlestick')

    // Create chart once
    useEffect(() => {
        if (!containerRef.current) return

        const chart = createChart(containerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#64748b',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
            },
            grid: {
                vertLines: { color: 'rgba(255,255,255,0.04)' },
                horzLines: { color: 'rgba(255,255,255,0.04)' },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { color: 'rgba(6,182,212,0.4)', width: 1, style: 1 },
                horzLine: { color: 'rgba(6,182,212,0.4)', width: 1, style: 1 },
            },
            rightPriceScale: {
                borderColor: 'rgba(255,255,255,0.06)',
                scaleMargins: { top: 0.05, bottom: 0.25 },
                minimumWidth: 70, // Prevent 4-digit prices from cracking Y-axis
            },
            timeScale: {
                borderColor: 'rgba(255,255,255,0.06)',
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 0,
                fixRightEdge: true,
                fixLeftEdge: false,
                lockVisibleTimeRangeOnResize: true,
                shiftVisibleRangeOnNewBar: true,
            },
            handleScroll: true,
            handleScale: true,
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
        })

        // Volume series
        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: '',
        })
        chart.priceScale('').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        })

        // Resize observer
        const ro = new ResizeObserver(() => {
            if (containerRef.current) {
                chart.applyOptions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                })
            }
        })
        ro.observe(containerRef.current)

        chartRef.current = chart
        volumeRef.current = volumeSeries

        return () => {
            ro.disconnect()
            chart.remove()
            chartRef.current = null
            mainSeriesRef.current = null
            volumeRef.current = null
        }
    }, [])

    // Update Series when chartType changes
    useEffect(() => {
        if (!chartRef.current) return

        // Remove old main series if exists
        if (mainSeriesRef.current) {
            chartRef.current.removeSeries(mainSeriesRef.current)
        }

        let newSeries
        const options = { priceScaleId: 'right' }

        if (chartType === 'candlestick') {
            newSeries = chartRef.current.addSeries(CandlestickSeries, {
                ...options,
                upColor: '#10b981', downColor: '#ef4444',
                borderUpColor: '#10b981', borderDownColor: '#ef4444',
                wickUpColor: '#10b981', wickDownColor: '#ef4444',
            })
        } else if (chartType === 'line') {
            newSeries = chartRef.current.addSeries(LineSeries, {
                ...options,
                color: 'var(--accent-cyan)',
                lineWidth: 2,
            })
        } else if (chartType === 'area') {
            newSeries = chartRef.current.addSeries(AreaSeries, {
                ...options,
                lineColor: 'var(--accent-cyan)',
                topColor: 'rgba(6,182,212,0.3)',
                bottomColor: 'rgba(6,182,212,0.02)',
                lineWidth: 2,
            })
        }

        mainSeriesRef.current = newSeries

        // Update data for the new series
        if (data?.chart_data?.length) {
            const chartData = data.chart_data.map(d =>
                chartType === 'candlestick'
                    ? { time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }
                    : { time: d.time, value: d.close }
            )
            newSeries.setData(chartData)
            chartRef.current.timeScale().fitContent()
        }

        // Subscibe to crosshair
        const unsubscribe = chartRef.current.subscribeCrosshairMove((param) => {
            if (!param.time || !param.seriesData) {
                setHoveredBar(null)
                return
            }
            const item = param.seriesData.get(newSeries)
            if (item) {
                // If line/area, convert back to displayable object
                if (chartType !== 'candlestick') {
                    const original = data.chart_data.find(d => d.time === param.time)
                    if (original) setHoveredBar(original)
                } else {
                    setHoveredBar(item)
                }
            }
        })

        return () => {
            if (chartRef.current) {
                chartRef.current.unsubscribeCrosshairMove(unsubscribe)
            }
        }
    }, [chartType, data]) // Re-run when chartType or data changes

    // Update volume whenever data changes
    useEffect(() => {
        if (!volumeRef.current || !data?.chart_data?.length) return

        const volumes = data.chart_data.map(d => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? 'rgba(0, 255, 127, 0.4)' : 'rgba(255, 69, 0, 0.4)',
        }))

        volumeRef.current.setData(volumes)
        chartRef.current?.timeScale().fitContent()
        setHoveredBar(null)
    }, [data])

    // Derive stable default bar to show when not hovering
    const latestBar = data?.chart_data?.length ? data.chart_data[data.chart_data.length - 1] : null
    const displayBar = hoveredBar || latestBar

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', bounce: 0.4 }}
            className="glass flex flex-col"
            style={{ borderRadius: 14, overflow: 'hidden', height: '100%' }}
        >
            {/* Header controls: Two Rows as requested */}
            <div style={{
                display: 'flex', flexDirection: 'column', gap: 12,
                padding: '12px 16px',
                borderBottom: '1px solid var(--glass-border)',
            }}>
                {/* Row 1: Chart Type */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <BarChart2 size={15} color="var(--accent-cyan)" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                            {data?.symbol ?? 'Chart Overview'}
                        </span>
                    </div>
                    <ChartTypeSelector active={chartType} onChange={setChartType} />
                </div>

                {/* Row 2: Time Range & Live OHLCV */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ flex: 1, overflowX: 'auto' }} className="hide-scrollbar">
                        {displayBar && <OHLCVBar ohlcv={displayBar} currency={data?.currency} />}
                    </div>
                    <RangeSelector active={activeRange} onChange={onRangeChange} />
                </div>
            </div>

            {/* Chart canvas */}
            <div className="hex-grid" style={{ position: 'relative', flex: 1, minHeight: 350 }}>
                <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

                {/* Legend Tip */}
                <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.6, pointerEvents: 'none' }}>
                    <MousePointer2 size={12} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Drag to pan · Scroll to zoom</span>
                </div>

                {/* Loading overlay */}
                {loading && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(2,8,23,0.7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(4px)',
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 32, height: 32, border: '2px solid var(--glass-border)', borderTop: '2px solid var(--accent-cyan)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fetching chart data…</span>
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {!loading && !data && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                        <BarChart2 size={32} color="var(--text-muted)" />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Search a ticker to load the chart</span>
                    </div>
                )}
            </div>
        </motion.div>
    )
}
