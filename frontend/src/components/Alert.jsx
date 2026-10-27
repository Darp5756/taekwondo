export default function Alert({ children, tone = 'error' }) {
  if (!children) return null;
  const styles =
    tone === 'error' ? 'border-tkd-red/50 bg-tkd-red/15 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}
