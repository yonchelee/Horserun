import { useEffect, useState } from 'react';

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

export default function SpriteHorse({ lane = 0, speed = 0, size = 56, paused = false, dimmed = false }) {
  const [available, setAvailable] = useState(null);

  useEffect(() => {
    let cancelled = false;
    checkSprite().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cycles per second scales with speed. At rest we still walk slowly
  // so the horse never looks frozen.
  const cyclesPerSec = Math.max(1.5, 1.5 + speed * 0.6);
  const duration = 1 / cyclesPerSec;

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

  // While we're checking, render an invisible spacer so layout doesn't
  // jump. Once available we show the sprite.
  const visible = available === true;

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        backgroundImage: visible ? `url(${SPRITE_URL})` : 'none',
        backgroundSize: `${FRAMES * 100}% 100%`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: '0% 50%',
        imageRendering: 'auto',
        animation: paused ? 'none' : `horseGallop ${duration}s steps(${FRAMES}) infinite`,
        filter: [
          LANE_FILTERS[lane % LANE_FILTERS.length],
          dimmed ? 'grayscale(0.5) brightness(0.9)' : '',
          'drop-shadow(0 4px 4px rgba(0,0,0,0.18))',
        ]
          .filter(Boolean)
          .join(' '),
        // Sprite faces right by default in the reference frames.
        transform: 'translateZ(0)',
        willChange: 'background-position',
      }}
    />
  );
}
