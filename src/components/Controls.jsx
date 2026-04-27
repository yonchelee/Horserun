import { ChevronLeft, ChevronRight, Flame, Zap, Music } from 'lucide-react';
import {
  MAX_STAMINA,
  MAX_SPEED,
  SWEET_MIN_MS,
  SWEET_MAX_MS,
  FRESH_START_MS,
} from '../game/engine.js';

// Total range the rhythm gauge maps onto. Anything beyond is clipped
// to the right edge so the player still sees they've drifted.
const GAUGE_MAX_MS = 700;

export default function Controls({ player, onTap, disabled, now }) {
  if (!player) return null;

  const overheating = player.overheatUntil > now;
  const staminaPct = Math.max(0, Math.min(100, (player.stamina / MAX_STAMINA) * 100));
  const speedPct = Math.max(0, Math.min(100, (player.speed / MAX_SPEED) * 100));
  const overheatRemaining = Math.max(0, player.overheatUntil - now) / 1000;

  // Quality only "lives" for ~700ms after a tap, so the badge fades
  // instead of sticking forever.
  const qualityFresh = player.qualityUntil > now;
  const qualityKind = qualityFresh ? player.lastQuality : null;
  const lastInterval = player.lastInterval;

  const handlePress = (side) => (e) => {
    e.preventDefault();
    if (disabled || overheating) {
      if (navigator.vibrate) navigator.vibrate([4, 30, 4]);
      return;
    }
    if (navigator.vibrate) navigator.vibrate(12);
    onTap(side);
  };

  const dimmed = disabled || overheating;
  const lastSide = player.lastSide;

  // Pulse the last-tapped button on PERFECT taps so the player gets
  // immediate feedback without having to read the gauge.
  const pulseSide =
    qualityFresh && qualityKind === 'perfect' ? lastSide : null;

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Stamina + rhythm + speed bars */}
      <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white px-3 py-2 shadow-sm">
        <Meter
          icon={<Flame size={14} className={overheating ? 'text-red-500' : 'text-ink-400'} />}
          value={Math.round(staminaPct) + '%'}
          barClass={
            overheating
              ? 'bg-red-500'
              : staminaPct < 30
                ? 'bg-amber-500'
                : 'bg-emerald-500'
          }
          fillPct={staminaPct}
        />

        <RhythmGauge
          intervalMs={lastInterval}
          quality={qualityKind}
        />

        <Meter
          icon={<Zap size={14} className="text-sky-500" />}
          value={player.speed.toFixed(1)}
          barClass="bg-sky-500"
          fillPct={speedPct}
        />

        {overheating && (
          <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
            Overheat {overheatRemaining.toFixed(1)}s
          </span>
        )}
      </div>

      {/* L / R buttons */}
      <div className="grid flex-1 grid-cols-2 gap-2">
        <ControlButton
          side="L"
          icon={<ChevronLeft size={56} strokeWidth={2.5} />}
          onPointerDown={handlePress('L')}
          dimmed={dimmed}
          highlight={lastSide === 'L'}
          pulse={pulseSide === 'L'}
        />
        <ControlButton
          side="R"
          icon={<ChevronRight size={56} strokeWidth={2.5} />}
          onPointerDown={handlePress('R')}
          dimmed={dimmed}
          highlight={lastSide === 'R'}
          pulse={pulseSide === 'R'}
        />
      </div>
    </div>
  );
}

function Meter({ icon, value, barClass, fillPct }) {
  return (
    <div className="flex flex-1 items-center gap-2">
      {icon}
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 ${barClass}`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <span className="w-9 text-right font-mono text-[11px] text-ink-400">
        {value}
      </span>
    </div>
  );
}

function RhythmGauge({ intervalMs, quality }) {
  // Position of the marker (clipped). 0–GAUGE_MAX_MS maps to 0–100%.
  const clipped =
    intervalMs == null
      ? null
      : Math.max(0, Math.min(GAUGE_MAX_MS, intervalMs));
  const markerPct = clipped == null ? null : (clipped / GAUGE_MAX_MS) * 100;
  const sweetLeft = (SWEET_MIN_MS / GAUGE_MAX_MS) * 100;
  const sweetWidth = ((SWEET_MAX_MS - SWEET_MIN_MS) / GAUGE_MAX_MS) * 100;

  const label =
    quality === 'perfect'
      ? 'PERFECT'
      : quality === 'off'
        ? intervalMs != null && intervalMs < SWEET_MIN_MS
          ? 'TOO FAST'
          : 'TOO SLOW'
        : quality === 'same'
          ? 'SAME SIDE'
          : intervalMs == null
            ? 'TAP'
            : intervalMs > FRESH_START_MS
              ? 'READY'
              : '';

  const labelClass =
    quality === 'perfect'
      ? 'text-emerald-600'
      : quality === 'off' || quality === 'same'
        ? 'text-amber-600'
        : 'text-ink-400';

  return (
    <div className="flex flex-1 items-center gap-2">
      <Music size={14} className={quality === 'perfect' ? 'text-emerald-500' : 'text-ink-400'} />
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
        {/* Sweet zone band */}
        <div
          className="absolute inset-y-0 rounded-full bg-emerald-200/80"
          style={{ left: `${sweetLeft}%`, width: `${sweetWidth}%` }}
        />
        {/* Last-tap interval marker */}
        {markerPct != null && (
          <div
            className={[
              'absolute top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-full shadow ring-1 ring-white transition-all duration-100',
              quality === 'perfect'
                ? 'bg-emerald-600'
                : quality === 'off' || quality === 'same'
                  ? 'bg-amber-500'
                  : 'bg-ink-400',
            ].join(' ')}
            style={{ left: `calc(${markerPct}% - 3px)` }}
          />
        )}
      </div>
      <span className={`w-[58px] text-right font-mono text-[10px] font-semibold ${labelClass}`}>
        {label}
      </span>
    </div>
  );
}

function ControlButton({ side, icon, onPointerDown, dimmed, highlight, pulse }) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      className={[
        'group relative flex h-full items-center justify-center rounded-3xl border shadow-sm transition-all',
        'active:scale-[0.98]',
        dimmed
          ? 'border-ink-100 bg-ink-50/70 text-ink-400'
          : pulse
            ? 'border-emerald-300 bg-emerald-50 text-ink-900'
            : highlight
              ? 'border-ink-200 bg-white text-ink-900'
              : 'border-ink-100 bg-white text-ink-900 hover:bg-ink-50',
      ].join(' ')}
      style={{ touchAction: 'manipulation' }}
    >
      <div className="flex flex-col items-center justify-center gap-1">
        <span
          className={[
            'flex h-16 w-16 items-center justify-center rounded-full transition-colors',
            dimmed
              ? 'bg-ink-100 text-ink-400'
              : pulse
                ? 'bg-emerald-500 text-white'
                : highlight
                  ? 'bg-ink-900 text-white'
                  : 'bg-ink-50 text-ink-900 group-active:bg-ink-900 group-active:text-white',
          ].join(' ')}
        >
          {icon}
        </span>
        <span
          className={[
            'text-[11px] font-bold uppercase tracking-[0.2em]',
            pulse ? 'text-emerald-600' : 'text-ink-400',
          ].join(' ')}
        >
          Tap {side}
        </span>
      </div>
    </button>
  );
}
