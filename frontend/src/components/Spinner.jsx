export default function Spinner({ fullScreen = false }) {
  const spinner = <div className="size-8 animate-spin rounded-full border-4 border-white/15 border-t-tkd-gold" />;
  if (!fullScreen) return <div className="flex justify-center p-8">{spinner}</div>;
  return <div className="flex min-h-screen items-center justify-center">{spinner}</div>;
}
