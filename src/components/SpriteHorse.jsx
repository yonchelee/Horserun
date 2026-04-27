import { useEffect, useRef, useState } from 'react';

// Drop a 8-frame horizontal sprite sheet at /public/horse-sprite.png
// (each frame square, e.g. 2048x256 = 8 x 256x256). When the file is
// missing we fall back to an emoji so the build still works.
const SPRITE_URL = '/horse-sprite.png';
const FRAMES = 8;

let cachedAvailability = null;
function checkSprite() {
  if (cachedAvailability) return cachedAvailability;
  cachedAvailability = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = SPRITE_URL;
  });
  return cachedAvailability;
}

// Lane index → CSS filter that recolors the brown horse for that lane.
// Tuned to read as: red / orange / green / blue / purple while still
// looking like a horse.
const LANE_FILTERS = [
  'hue-rotate(-10deg) saturate(1.1)',           // rose
  'hue-rotate(20deg) saturate(1.2) brightness(1.05)', // amber
  'hue-rotate(95deg) saturate(0.9)',            // emerald
  'hue-rotate(170deg) saturate(0.95)',          // sky
  'hue-rotate(240deg) saturate(0.95)',          // violet
];

// Cap the gallop cadence so we don't ask the browser for frame rates
// faster than it can render.
const MAX_CYCLES_PER_SEC = 7;

export default function SpriteHorse({ lane = 0, speed = 0, size = 56, paused = false, dimmed = false }) {
  const [available, setAvailable] = useState(null);

  // Phase ∈ [0, 1) — fraction of one full gallop cycle. We integrate it
  // by hand instead of using CSS @keyframes, because the CSS animation
  // would restart every time React reapplies the inline `animation`
  // property (which happens on every render since `speed` changes
  // continuously), and the restart pins the visible frame at index 0 —
  // exactly the "flicker on frame 1" symptom.
  //
  // Parent re-renders ~60fps during racing (Track receives a fresh
  // snapshot from the network each RAF tick), so render-time integration
  // is enough; no local RAF needed.
  const phaseRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    let cancelled = false;
    checkSprite().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cyclesPerSec = Math.min(
    MAX_CYCLES_PER_SEC,
    Math.max(2.0, 2.0 + speed * 0.45),
  );
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTimeRef.current) / 1000);
  lastTimeRef.current = now;
  if (!paused && dt > 0) {
    phaseRef.current = (phaseRef.current + cyclesPerSec * dt) % 1;
    if (phaseRef.current < 0) phaseRef.current += 1;
  }
  const frameIdx = Math.floor(phaseRef.current * FRAMES) % FRAMES;

  if (available === false) {
    return (
      <span
        style={{
          fontSize: size * 0.55,
          lineHeight: 1,
          filter: dimmed ? 'grayscale(0.6)' : 'none',
        }}
      >
        🐎
      </span>
    );
  }

  const visible = available === true;
  const offsetX = -frameIdx * size;

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        overflow: 'hidden',
        filter: [
          LANE_FILTERS[lane % LANE_FILTERS.length],
          dimmed ? 'grayscale(0.5) brightness(0.9)' : '',
          'drop-shadow(0 4px 4px rgba(0,0,0,0.18))',
        ]
          .filter(Boolean)
          .join(' '),
      }}
    >
      <div
        style={{
          width: FRAMES * size,
          height: size,
          backgroundImage: visible ? `url(${SPRITE_URL})` : 'none',
          backgroundSize: `${FRAMES * size}px ${size}px`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: '0 0',
          imageRendering: 'auto',
          transform: `translate3d(${offsetX}px, 0, 0)`,
          willChange: 'transform',
        }}
      />
    </div>
  );
}
