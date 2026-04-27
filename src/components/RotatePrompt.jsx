import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';

export default function RotatePrompt() {
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const check = () => {
      // Only prompt on phones — leave desktop / tablets alone.
      const small = Math.min(window.innerWidth, window.innerHeight) < 500;
      setPortrait(small && window.innerHeight > window.innerWidth);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  if (!portrait) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/95 px-6 text-center text-white">
      <div className="flex flex-col items-center gap-4">
        <Smartphone
          size={48}
          className="text-white"
          style={{ animation: 'rotateHint 1.6s ease-in-out infinite' }}
        />
        <div>
          <div className="text-lg font-semibold">Rotate your phone</div>
          <div className="mt-1 text-sm text-white/60">
            Horserun is built for landscape mode.
          </div>
        </div>
      </div>
      <style>{`
        @keyframes rotateHint {
          0%, 40% { transform: rotate(0deg); }
          60%, 100% { transform: rotate(-90deg); }
        }
      `}</style>
    </div>
  );
}
