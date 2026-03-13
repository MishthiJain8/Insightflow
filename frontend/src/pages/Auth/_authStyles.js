// Shared Glassmorphism styles for all Auth pages
export const styles = {
    page: {
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', background: 'var(--bg-primary)',
    },
    card: {
        width: '100%', maxWidth: 420,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--glass-border)',
        borderRadius: 20, padding: '36px 32px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
    },
    logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 },
    logoIcon: {
        width: 40, height: 40, borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.15))',
        border: '1px solid rgba(6,182,212,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    logoText: { fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' },
    title: { fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 },
    subtitle: { fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 28 },
    form: { display: 'flex', flexDirection: 'column' },
    label: {
        fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 6,
    },
    inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
    ico: { position: 'absolute', left: 12 },
    input: {
        width: '100%', padding: '10px 12px 10px 34px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.88rem',
        outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
    },
    eyeBtn: {
        position: 'absolute', right: 10, background: 'none', border: 'none',
        color: 'var(--text-muted)', cursor: 'pointer', padding: 4,
    },
    error: {
        marginTop: 12, padding: '9px 12px', borderRadius: 8,
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
        color: 'var(--accent-red)', fontSize: '0.78rem',
    },
    success: {
        marginTop: 12, padding: '9px 12px', borderRadius: 8,
        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
        color: 'var(--accent-emerald)', fontSize: '0.78rem',
    },
    btn: {
        marginTop: 20, padding: '12px', borderRadius: 12, fontWeight: 700,
        fontSize: '0.9rem', cursor: 'pointer', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-violet))',
        color: '#fff', boxShadow: '0 0 20px rgba(6,182,212,0.3)', transition: 'opacity 0.2s',
    },
    btnSecondary: {
        marginTop: 10, padding: '11px', borderRadius: 12, fontWeight: 600,
        fontSize: '0.88rem', cursor: 'pointer',
        border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.04)',
        color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    },
    spinner: {
        width: 16, height: 16, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTop: '2px solid #fff',
        animation: 'spin 0.7s linear infinite', display: 'inline-block',
    },
    link: {
        background: 'none', border: 'none', color: 'var(--accent-cyan)',
        cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
    },
    foot: { marginTop: 22, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' },
}
