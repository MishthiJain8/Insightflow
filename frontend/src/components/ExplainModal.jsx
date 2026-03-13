import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, AlertCircle, BarChart2, Mic, Newspaper, ShieldAlert, Ear } from 'lucide-react';

const ProgressBar = ({ label, value, color }) => (
    <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </span>
            <span className="text-sm font-bold mono" style={{ color }}>
                {value}%
            </span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: color, boxShadow: `0 0 8px ${color}` }}
            />
        </div>
    </div>
);

const EvidenceItem = ({ icon: Icon, text, beginnerMode, color }) => {
    // Determine the active string from the backend's dual-explanation dict.
    const technicalText = typeof text === 'string' ? text : text.technical;
    const beginnerText = typeof text === 'string' ? text : text.beginner;
    const currentText = beginnerMode ? beginnerText : technicalText;

    // Extract the label part (e.g., "[Bullish]") for styling if present
    const isBull = currentText.includes('[Bullish]') || currentText.includes('Optimistic');
    const isBear = currentText.includes('[Bearish]') || currentText.includes('Pessimistic');

    let baseColor = color?.includes('cyan') ? '#00F2FF' :
        color?.includes('amber') ? '#f59e0b' :
            color?.includes('emerald') ? '#10b981' : '#00F2FF';

    if (isBull) baseColor = '#10b981'; // Emerald
    else if (isBear) baseColor = '#ef4444'; // Red

    return (
        <div className="flex items-start gap-4 p-3.5 mb-3 rounded-xl border relative overflow-hidden"
            style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.2))',
                borderColor: 'var(--glass-border)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}>
            {/* Subtle background glow behind icon */}
            <div className="absolute -left-4 -top-4 w-16 h-16 rounded-full blur-xl opacity-20" style={{ background: baseColor }} />

            <div className="shrink-0 flex items-center justify-center p-2 rounded-xl relative z-10"
                style={{
                    background: `linear-gradient(135deg, rgba(255,255,255,0.15), rgba(0,0,0,0.3))`,
                    boxShadow: `inset 0 1px 1px rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.8), 0 0 12px ${baseColor}40`,
                    border: `1px solid rgba(255,255,255,0.1)`
                }}>
                <Icon size={18} color={baseColor} style={{ filter: `drop-shadow(0 0 8px ${baseColor})` }} />
            </div>

            <div className="text-sm leading-relaxed mt-0.5 relative z-10" style={{ color: 'var(--text-primary)', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                <AnimatePresence mode="wait">
                    <motion.p
                        key={beginnerMode ? 'simple' : 'tech'}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.2 }}
                        style={{ margin: 0 }}
                    >
                        {currentText}
                    </motion.p>
                </AnimatePresence>
            </div>
        </div>
    );
};

export default function ExplainModal({ isOpen, onClose, data, beginnerMode }) {
    if (!data) return null;

    const evidence = data.evidence || [];

    // Split evidence by type, handling both plain strings and dual-explanation objects from the backend
    const techEvidence = evidence.filter(e => {
        const textStr = typeof e === 'string' ? e : e.technical;
        return textStr.includes('Technical Trigger') || textStr.includes('Market Signal');
    });
    const newsEvidence = evidence.filter(e => {
        const textStr = typeof e === 'string' ? e : e.technical;
        return textStr.includes('News');
    });
    const audioEvidence = evidence.filter(e => {
        const textStr = typeof e === 'string' ? e : e.technical;
        return textStr.includes('Acoustic Shift') || textStr.includes('Vocal Tone Analysis');
    });

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-99999 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0"
                        style={{ background: 'rgba(5, 7, 10, 0.8)', backdropFilter: 'blur(8px)' }}
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-2xl rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
                        style={{
                            background: 'var(--bg-surface)',
                            borderColor: 'var(--glass-border)',
                            maxHeight: '85vh'
                        }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                            <div className="flex items-center gap-3">
                                <BookOpen size={20} color="var(--accent-violet)" />
                                <div>
                                    <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                                        Why this suggestion?
                                    </h3>
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                        Transparent breakdown of the AI prediction engine
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Scrolling Body */}
                        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">

                            {/* False Breakout Alert */}
                            {data.false_breakout_risk && (
                                <div className="p-4 rounded-xl border flex gap-3" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }}>
                                    <ShieldAlert size={24} color="var(--accent-red)" className="shrink-0" />
                                    <div>
                                        <h4 className="text-sm font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--accent-red)' }}>
                                            {beginnerMode ? 'False Breakout Risk' : 'False Breakout Risk'}
                                        </h4>
                                        <p className="text-sm line-clamp-3" style={{ color: 'var(--text-primary)' }}>
                                            {beginnerMode ? 'The stock price broke a level, but the volume or sentiment doesn\'t support it. It might be a trap.' : data.false_breakout_notes}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Conviction Score Section */}
                            <div>
                                <h4 className="flex items-center gap-2 text-sm font-bold uppercase mb-4" style={{ color: 'var(--accent-violet)' }}>
                                    <AlertCircle size={16} /> The Conviction Equation
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                                    <ProgressBar
                                        label={beginnerMode ? "Overall Confidence" : "Composite Score"}
                                        value={data.conviction_score || Math.max(data.probability, 100 - data.probability)}
                                        color="var(--accent-violet)"
                                    />
                                    <ProgressBar
                                        label={beginnerMode ? "Price Momentum" : "Technical Momentum"}
                                        value={data.probability}
                                        color="var(--accent-cyan)"
                                    />
                                    <ProgressBar
                                        label={beginnerMode ? "Text Sentiment" : "Text Sentiment"}
                                        value={(data.sentiment?.score || 0) * 100}
                                        color="var(--accent-amber)"
                                    />
                                    <ProgressBar
                                        label={beginnerMode ? "Audio Tone" : "Audio Emotion"}
                                        value={(data.audio_emotion?.score || 0) * 100}
                                        color="var(--accent-emerald)"
                                    />
                                </div>
                            </div>

                            {/* Evidence Log */}
                            <div>
                                <h4 className="flex items-center gap-2 text-sm font-bold uppercase mb-4" style={{ color: 'var(--accent-cyan)' }}>
                                    <BookOpen size={16} /> Primary Evidence Log
                                </h4>

                                <div className="mb-4">
                                    <h5 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>MARKET SIGNALS</h5>
                                    {techEvidence.length > 0 ? (
                                        techEvidence.map((e, idx) => <EvidenceItem key={idx} icon={BarChart2} text={e} beginnerMode={beginnerMode} color="var(--accent-cyan)" />)
                                    ) : (
                                        <div className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No strong technical signals detected.</div>
                                    )}
                                </div>

                                <div className="mb-4">
                                    <h5 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>NEWS SENTIMENT</h5>
                                    {newsEvidence.length > 0 ? (
                                        newsEvidence.map((e, idx) => <EvidenceItem key={idx} icon={Newspaper} text={e} beginnerMode={beginnerMode} color="var(--accent-amber)" />)
                                    ) : (
                                        <div className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No recent impactful news found.</div>
                                    )}
                                </div>

                                <div>
                                    <h5 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>AUDIO EMOTION</h5>
                                    {audioEvidence.length > 0 ? (
                                        audioEvidence.map((e, idx) => <EvidenceItem key={idx} icon={Ear} text={e} beginnerMode={beginnerMode} color="var(--accent-emerald)" />)
                                    ) : (
                                        <div className="text-xs italic" style={{ color: 'var(--text-muted)' }}>No audio transcript variations detected.</div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
