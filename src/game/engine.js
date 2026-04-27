// Pure simulation. No React, no DOM.
// Designed so the same logic can run on a Socket.io server later.

export const TRACK_LENGTH = 100;
export const MAX_STAMINA = 100;
export const OVERHEAT_MS = 3000;

export const STAMINA_COST_PER_TAP = 5;
export const STAMINA_RECOVERY_PER_SEC = 18;

// Rhythm windows (ms between alternating taps).
// Inside the sweet zone we award the full speed gain; outside we award
// only a fraction. A "fresh start" gap (e.g. after rest or overheat)
// is treated as sweet so players aren't penalised for pacing.
export const SWEET_MIN_MS = 220;
export const SWEET_MAX_MS = 320;
export const FRESH_START_MS = 600;

export const SPEED_GAIN_PERFECT = 1.6;
export const SPEED_GAIN_OFF = 0.55;

// Kept as the legacy alias so older imports still resolve.
export const SPEED_GAIN_PER_TAP = SPEED_GAIN_PERFECT;

export const MAX_SPEED = 16;
// Multiplicative damping toward 0 per second: speed *= damping^dt
export const SPEED_DAMPING_PER_SEC = 0.5;
// Position units gained per (speed * second). Doubled from 0.55 so a
// full race finishes in roughly half the time — the prior pace felt
// too long for the L/R rhythm tension to sustain.
export const PROGRESS_PER_SPEED_PER_SEC = 1.1;

export function makeHorse({ id, lane, isPlayer, name, color, personality = null }) {
  return {
    id,
    lane,
    isPlayer,
    name,
    color,
    personality,
    position: 0,
    speed: 0,
    stamina: MAX_STAMINA,
    lastSide: null,
    lastTapAt: 0,
    tapCount: 0,
    overheatUntil: 0,
    finished: false,
    finishedAt: null,
    // Last tap interval + quality, populated by applyTap. The UI reads
    // these to render the rhythm gauge / feedback for the player.
    lastInterval: null,
    lastQuality: null, // 'perfect' | 'off' | 'fresh' | 'same'
    qualityUntil: 0,
    aiNextTapIn: 80 + Math.random() * 220,
  };
}

// Returns one of: 'perfect' | 'off' | 'fresh'
export function classifyInterval(intervalMs) {
  if (intervalMs == null || intervalMs > FRESH_START_MS) return 'fresh';
  if (intervalMs >= SWEET_MIN_MS && intervalMs <= SWEET_MAX_MS) return 'perfect';
  return 'off';
}

export function applyTap(horse, side, now) {
  if (horse.finished) return;
  if (now < horse.overheatUntil) return;

  const sameSide = horse.lastSide === side;
  const prevTap = horse.lastTapAt || 0;
  const interval = prevTap > 0 ? now - prevTap : null;

  if (sameSide) {
    horse.lastQuality = 'same';
  } else {
    const quality = classifyInterval(interval);
    horse.lastQuality = quality;
    const gain = quality === 'off' ? SPEED_GAIN_OFF : SPEED_GAIN_PERFECT;
    horse.speed = Math.min(MAX_SPEED, horse.speed + gain);
  }
  horse.lastInterval = interval;
  horse.qualityUntil = now + 700; // hold the badge briefly for the UI

  horse.lastSide = side;
  horse.lastTapAt = now;
  horse.tapCount += 1;

  horse.stamina -= STAMINA_COST_PER_TAP;
  if (horse.stamina <= 0) {
    horse.stamina = 0;
    horse.overheatUntil = now + OVERHEAT_MS;
    horse.lastSide = null;
    horse.speed *= 0.35;
  }
}

export function tickHorse(horse, dt, now) {
  if (horse.finished) return;

  const overheating = now < horse.overheatUntil;
  const sinceTap = now - (horse.lastTapAt || 0);

  // Stamina recovers when resting or while overheated.
  if (sinceTap > 220 || overheating) {
    const rate = overheating
      ? STAMINA_RECOVERY_PER_SEC * 1.7
      : STAMINA_RECOVERY_PER_SEC;
    horse.stamina = Math.min(MAX_STAMINA, horse.stamina + rate * dt);
  }

  // Speed decays toward 0; much faster while overheating.
  const damping = overheating ? 0.12 : SPEED_DAMPING_PER_SEC;
  horse.speed *= Math.pow(damping, dt);

  const effectiveSpeed = overheating ? horse.speed * 0.25 : horse.speed;
  horse.position += effectiveSpeed * PROGRESS_PER_SPEED_PER_SEC * dt;

  if (horse.position >= TRACK_LENGTH) {
    horse.position = TRACK_LENGTH;
    horse.finished = true;
    horse.finishedAt = now;
    horse.speed = 0;
  }
}

export function rankHorses(horses) {
  return [...horses].sort((a, b) => {
    if (a.finished && b.finished) return a.finishedAt - b.finishedAt;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.position - a.position;
  });
}
