import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries } from 'lightweight-charts'
import { BarChart2, MousePointer2, RefreshCw } from 'lucide-react'

const API_BASE = 'http://localhost:8000'

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
    { id: 'candlestick', label: 'Candle' },
    { id: 'line', label: 'Line' },
    { id: 'area', label: 'Area' }
]

function ChartTypeSelector({ active, onChange }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '4px',
            border: '1px solid var(--glass-border)',
        }}>
            {CHART_TYPES.map(type => (
                <button
                    key={type.id}
                    onClick={() => onChange(type.id)}
                    style={{
                        padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontSize: '0.7rem', fontWeight: active === type.id ? 700 : 500,
                        background: active === type.id ? 'var(--accent-fuchsia)' : 'transparent',
                        color: active === type.id ? '#fff' : 'var(--text-muted)',
                        transition: 'all 0.2s ease',
                    }}
                >
                    {type.label}
                </button>
            ))}
        </div>
    )
}

function RangeSelector({ active, onChange }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            padding: '6px 8px', background: 'rgba(255,255,255,0.02)',
            borderRadius: 8, border: '1px solid var(--glass-border)',
        }}>
            {RANGES.map(({ label, range }) => {
                const isActive = active === range
                return (
                    <button
                        key={range}
                        onClick={() => onChange(range)}
                        style={{
                            padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            fontSize: '0.70rem', fontWeight: isActive ? 700 : 500,
                            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.01em',
                            background: isActive ? 'linear-gradient(135deg, rgba(6,182,212,0.25), rgba(6,182,212,0.1))' : 'transparent',
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

function OHLCVBar({ ohlcv, currency }) {
    if (!ohlcv) return null
    const base = Number(ohlcv.value || ohlcv.close)
    const fmt = (n) => typeof n === 'number' ? n.toFixed(2) : '—'

    // Format volume into readable string (K, M, B)
    const formatVolume = (v) => {
        if (!v || v === 0) return '—'
        if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
        if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
        if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K'
        return v.toString()
    }

    return (
        <div style={{
            display: 'flex', gap: 14, alignItems: 'center',
            fontSize: '0.72rem', fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--text-secondary)', whiteSpace: 'nowrap'
        }}>
            {[
                { label: 'O', value: fmt(ohlcv.open) },
                { label: 'H', value: fmt(ohlcv.high) },
                { label: 'L', value: fmt(ohlcv.low) },
                { label: 'C', value: fmt(ohlcv.close) },
            ].map((item, i) => (
                item.value !== '—' && (
                    <div key={i} style={{ display: 'flex', gap: 4 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                        <span style={{ color: 'var(--text-primary)' }}>{item.value}</span>
                    </div>
                )
            ))}
            {/* Display Volume */}
            {ohlcv.volume && (
                <div style={{ display: 'flex', gap: 4 }}>
                    <span style={{ color: 'var(--text-muted)' }}>V</span>
                    <span style={{ color: 'var(--text-primary)' }}>{formatVolume(ohlcv.volume)}</span>
                </div>
            )}
        </div>
    )
}

export default function BloombergChart({ ticker, activeHoldings = [] }) {
    const containerRef = useRef(null)
    const chartRef = useRef(null)
    const mainSeriesRef = useRef(null)
    const volumeRef = useRef(null)

    const [chartData, setChartData] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [activeRange, setActiveRange] = useState('1Y')
    const [chartType, setChartType] = useState('candlestick')
    const [hoveredBar, setHoveredBar] = useState(null)

    const fetchChartData = useCallback(async (symbol, range) => {
        if (!symbol) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`${API_BASE}/api/chart/${symbol}?range=${range}`)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            setChartData(data)
        } catch (e) {
            setError(e.message)
            setChartData([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (ticker) {
            fetchChartData(ticker, activeRange)
        }
    }, [ticker, activeRange, fetchChartData])

    useEffect(() => {
        if (!containerRef.current) return

        const chart = createChart(containerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#d1d4dc',
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
                rightOffset: 2, // Gives a tiny breathing room on the right
                fixLeftEdge: false, // Lets the user scroll back into deep history
                lockVisibleTimeRangeOnResize: true,
                shiftVisibleRangeOnNewBar: true,
            },
            // Bloomberg Chart Physics
            handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
            handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
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

    // Update Series when chartType or data changes
    useEffect(() => {
        if (!chartRef.current) return

        if (mainSeriesRef.current) {
            chartRef.current.removeSeries(mainSeriesRef.current)
        }

        let newSeries;
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
                ...options, color: '#06b6d4', lineWidth: 2,
            })
        } else if (chartType === 'area') {
            newSeries = chartRef.current.addSeries(AreaSeries, {
                ...options, lineColor: '#06b6d4',
                topColor: 'rgba(6,182,212,0.3)', bottomColor: 'rgba(6,182,212,0.02)', lineWidth: 2,
            })
        }

        mainSeriesRef.current = newSeries

        if (chartData?.length) {
            const mappedData = chartData.map(d =>
                chartType === 'candlestick'
                    ? { time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }
                    : { time: d.time, value: d.close }
            )
            newSeries.setData(mappedData)

            const volumes = chartData.map(d => ({
                time: d.time,
                value: d.volume,
                color: d.close >= d.open ? 'rgba(0, 255, 127, 0.4)' : 'rgba(255, 69, 0, 0.4)',
            }))
            volumeRef.current.setData(volumes)
            // Calculate how many bars to show based on activeRange
            let barsToShow = mappedData.length;
            switch (activeRange) {
                case '1D': barsToShow = 78; break; // 1 day of 5m bars
                case '1W': barsToShow = 130; break; // 5 days of 15m bars
                case '1M': barsToShow = 22; break; // 1 month of 1d bars
                case '6M': barsToShow = 126; break; // 6 months of 1d bars
                case '1Y': barsToShow = 253; break; // 1 year of 1d bars
                case '5Y': barsToShow = 260; break; // 5 years of 1wk bars
                case '5m': barsToShow = 78; break; // ~1 day of 5m bars
                case '1h': barsToShow = 140; break; // ~1 month of 1h
                case 'MAX': barsToShow = mappedData.length; break;
                default: barsToShow = mappedData.length; break;
            }

            if (barsToShow >= mappedData.length) {
                chartRef.current.timeScale().fitContent();
            } else {
                chartRef.current.timeScale().setVisibleLogicalRange({
                    from: mappedData.length - barsToShow,
                    to: mappedData.length - 1
                });
            }
        }

        const unsubscribe = chartRef.current.subscribeCrosshairMove((param) => {
            if (!param.time || !param.seriesData) {
                setHoveredBar(null)
                return
            }
            const item = param.seriesData.get(newSeries)
            if (item) {
                if (chartType !== 'candlestick') {
                    const original = chartData.find(d => d.time === param.time)
                    if (original) setHoveredBar(original)
                } else {
                    const originalVol = chartData.find(d => d.time === param.time)?.volume
                    setHoveredBar({ ...item, volume: originalVol })
                }
            }
        })

        return () => {
            if (chartRef.current) chartRef.current.unsubscribeCrosshairMove(unsubscribe)
        }
    }, [chartType, chartData])

// paint purchase markers for the current ticker if user holds it
    // only candlestick/bar series support markers; guard accordingly
    useEffect(() => {
        const series = mainSeriesRef.current
        if (!series || typeof series.setMarkers !== 'function') return
        // clear markers when there is no ticker
        if (!ticker) {
            series.setMarkers([])
            return
        }
        const holding = activeHoldings.find(h => h.ticker === ticker)
        if (holding && holding.buy_date) {
            const markers = [
                {
                    time: holding.buy_date.split('T')[0],
                    position: 'belowBar',
                    color: '#00FF7F',
                    shape: 'arrowUp',
                    text: `Bought @ $${holding.buy_price}`
                }
            ]
            series.setMarkers(markers)
        } else {
            series.setMarkers([])
        }
    }, [activeHoldings, ticker, chartType])
    // Loading overlay style (if desired)
    const overlayStyle = {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 10, display: 'flex',
        alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)'
    }

    const displayBar = hoveredBar || (chartData?.length ? chartData[chartData.length - 1] : null)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative' }}>
            {/* Header controls: Two Rows */}
            <div style={{
                display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px',
                borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)'
            }}>
                {/* Row 1: Chart Type */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <BarChart2 size={15} color="var(--accent-cyan)" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                            {ticker ?? 'Bloomberg Terminal Chart'}
                        </span>
                    </div>
                    <ChartTypeSelector active={chartType} onChange={setChartType} />
                </div>

                {/* Row 2: Time Range & Live OHLCV */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ flex: 1, overflowX: 'auto' }} className="hide-scrollbar">
                        {displayBar && <OHLCVBar ohlcv={displayBar} />}
                    </div>
                    <RangeSelector active={activeRange} onChange={setActiveRange} />
                </div>
            </div>

            {/* Chart Body */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                {loading && (
                    <div style={overlayStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                            <RefreshCw size={24} color="var(--accent-cyan)" className="animate-spin" />
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-cyan)', fontFamily: "'JetBrains Mono', monospace" }}>
                                Fetching Bloomberg Data...
                            </span>
                        </div>
                    </div>
                )}
                {error && (
                    <div style={{ ...overlayStyle, background: 'rgba(239, 68, 68, 0.1)', backdropFilter: 'none' }}>
                        <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.8rem' }}>Error: {error}</span>
                    </div>
                )}
                <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            </div>
        </div>
    )
}
