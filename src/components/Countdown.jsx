import { useEffect, useState } from 'react';

export default function Countdown({ onDone }) {
  const [n, setN] = useState(3);

  useEffect(() => {
    if (n <= 0) {
      const t = setTimeout(onDone, 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(20);
      setN((x) => x - 1);
    }, 800);
    return () => clearTimeout(t);
  }, [n, onDone]);

  const label = n > 0 ? String(n) : 'GO';

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div
        key={label}
        className="flex h-32 w-32 items-center justify-center rounded-full bg-ink-900/90 text-5xl font-bold tracking-tight text-white shadow-2xl"
        style={{ animation: 'countdownPop 0.7s ease-out' }}
      >
        {label}
      </div>
      <style>{`
        @keyframes countdownPop {
          0% { transform: scale(0.4); opacity: 0; }
          25% { transform: scale(1.1); opacity: 1; }
          70% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
