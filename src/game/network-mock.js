// Local-only fallback that mirrors the PartyKit server's state machine.
// Emits the same compact per-tick payload the real server does (you +
// top + summary counts) so client components don't need a separate
// code path for offline play.

import { applyTap, tickHorse, rankHorses, makeHorse } from './engine.js';

const MIN_RACERS = 5;
const COUNTDOWN_MS = 30_000;
const POST_RACE_RESET_MS = 15_000;
const FINISH_QUORUM = 10;
const FINISH_GRACE_MS = 30_000;
const VISIBLE_TOP_N = 5;
const COLORS = ['rose', 'amber', 'emerald', 'sky', 'violet'];
const ADMIN_NAME = '이영채1657';
const BOT_NAMES = ['Comet', 'Shadow', 'Blitz', 'Vortex', 'Phoenix', 'Storm', 'Echo', 'Nova'];
const PERSONALITIES = [
  { id: 'sprinter', baseInterval: 235, jitter: 0.12 },
  { id: 'pacer', baseInterval: 305, jitter: 0.08 },
  { id: 'steady', baseInterval: 270, jitter: 0.12 },
  { id: 'erratic', baseInterval: 260, jitter: 0.4 },
  { id: 'closer', baseInterval: 290, jitter: 0.1 },
];

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeBot(lane) {
  const personality = shuffled(PERSONALITIES)[0];
  const horse = makeHorse({
    id: `bot-${lane}-${Math.floor(Math.random() * 1e6)}`,
    lane,
    isPlayer: false,
    name: shuffled(BOT_NAMES)[0],
    color: COLORS[lane % COLORS.length],
    personality,
  });
  horse.isBot = true;
  horse.ready = true; // bots are always ready
  return horse;
}

function makeHumanSlot(lane, identity) {
  const horse = makeHorse({
    id: 'player',
    lane,
    isPlayer: true,
    name: identity?.name || 'Rider',
    color: COLORS[lane % COLORS.length],
  });
  horse.isBot = false;
  horse.ready = false;
  horse.profileImage = identity?.profileImage ?? null;
  horse.isAdmin = (identity?.name || '') === ADMIN_NAME;
  return horse;
}

function tickBot(horse, dt, now) {
  if (!horse.isBot || horse.finished) return;
  horse.aiNextTapIn -= dt * 1000;
  if (horse.aiNextTapIn > 0) return;
  const p = horse.personality;
  const lateGame = p.id === 'closer' && horse.position > 70;
  const j = lateGame ? p.jitter * 0.4 : p.jitter;
  const newSide = horse.lastSide === 'L' ? 'R' : 'L';
  applyTap(horse, newSide, now);
  const jitterMul = 1 - j + Math.random() * j * 2;
  horse.aiNextTapIn = p.baseInterval * jitterMul;
}

export function createMockNetwork({ identity, onState, onFinished }) {
  let horses = [];
  let phase = 'lobby';
  let countdownEndsAt = null;
  let startedAt = null;
  let finishedAt = null;
  let resetAt = null;
  let finishGraceUntil = null;
  let raf = null;
  let last = 0;
  const timers = new Set();
  let destroyed = false;

  function setT(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!destroyed) fn();
    }, ms);
    timers.add(id);
    return id;
  }

  // Compact projection used for top-5 slots.
  function shortHorse(h, rank) {
    return {
      id: h.id,
      name: h.name,
      color: h.color,
      isBot: h.isBot,
      profileImage: h.profileImage ?? null,
      position: h.position,
      finished: h.finished,
      rank,
    };
  }

  // Full projection used for the player's "you" slot.
  function fullHorse(h, rank) {
    return {
      id: h.id,
      lane: h.lane,
      name: h.name,
      color: h.color,
      isBot: h.isBot,
      connId: h.isBot ? null : 'self',
      ready: h.ready,
      position: h.position,
      speed: h.speed,
      lastSide: h.lastSide,
      lastInterval: h.lastInterval,
      lastQuality: h.lastQuality,
      qualityUntil: h.qualityUntil,
      tapCount: h.tapCount,
      finished: h.finished,
      finishedAt: h.finishedAt,
      profileImage: h.profileImage ?? null,
      isAdmin: !!h.isAdmin,
      rank,
    };
  }

  function snapshot() {
    const ranked = rankHorses(horses);
    const rankOf = new Map();
    ranked.forEach((h, i) => rankOf.set(h.id, i + 1));
    const human = horses.find((h) => !h.isBot);
    const top = ranked
      .slice(0, VISIBLE_TOP_N)
      .map((h) => shortHorse(h, rankOf.get(h.id)));

    let humans = 0;
    let ready = 0;
    let finished = 0;
    for (const h of horses) {
      if (!h.isBot) humans += 1;
      if (h.ready) ready += 1;
      if (h.finished) finished += 1;
    }

    return {
      phase,
      serverNow: Date.now(),
      countdownEndsAt,
      raceStartedAt: startedAt,
      finishedAt,
      resetAt,
      finishGraceUntil,
      totalCount: horses.length,
      humanCount: humans,
      readyCount: ready,
      finishedCount: finished,
      you: human ? fullHorse(human, rankOf.get(human.id)) : null,
      top,
    };
  }

  function emit() {
    onState && onState(snapshot());
  }

  function refillBotsToMin() {
    while (horses.length < MIN_RACERS) {
      horses.push(makeBot(horses.length));
    }
  }

  function initLobby() {
    horses = [makeHumanSlot(0, identity)];
    refillBotsToMin();
    phase = 'lobby';
    countdownEndsAt = null;
    startedAt = null;
    finishedAt = null;
    resetAt = null;
    finishGraceUntil = null;
    emit();
  }

  function maybeStartCountdown() {
    if (phase !== 'lobby') return;
    // First human ready triggers the countdown; bot-ready doesn't count.
    if (!horses.some((h) => !h.isBot && h.ready)) return;
    phase = 'countdown';
    countdownEndsAt = Date.now() + COUNTDOWN_MS;
    emit();
    setT(() => {
      if (phase === 'countdown') startRace();
    }, COUNTDOWN_MS);
  }

  function startRace() {
    phase = 'racing';
    startedAt = Date.now();
    last = performance.now();
    finishGraceUntil = null;
    raf = requestAnimationFrame(loop);
    emit();
  }

  function loop(t) {
    if (destroyed) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    const now = Date.now();
    for (const h of horses) {
      if (h.isBot) tickBot(h, dt, now);
      tickHorse(h, dt, now);
    }
    const finishedCount = horses.filter((h) => h.finished).length;
    if (finishGraceUntil == null && finishedCount >= FINISH_QUORUM) {
      finishGraceUntil = now + FINISH_GRACE_MS;
    }
    const allDone = horses.every((h) => h.finished);
    const graceExpired = finishGraceUntil != null && now >= finishGraceUntil;
    if (allDone || graceExpired) {
      finishRace();
      return;
    }
    emit();
    raf = requestAnimationFrame(loop);
  }

  function finishRace() {
    phase = 'finished';
    finishedAt = Date.now();
    resetAt = finishedAt + POST_RACE_RESET_MS;
    finishGraceUntil = null;
    raf = null;
    const ranked = rankHorses(horses);
    const rankOf = new Map();
    ranked.forEach((h, i) => rankOf.set(h.id, i + 1));
    const top = ranked
      .slice(0, VISIBLE_TOP_N)
      .map((h) => shortHorse(h, rankOf.get(h.id)));
    const human = horses.find((h) => !h.isBot);
    emit();
    onFinished &&
      onFinished({
        top,
        you: human ? fullHorse(human, rankOf.get(human.id)) : null,
        startedAt,
        finishedAt,
      });
    setT(() => {
      initLobby();
    }, POST_RACE_RESET_MS);
  }

  // ── Public API ──
  function identifyFn(next) {
    const human = horses.find((h) => !h.isBot);
    if (!human) return;
    if (next?.name) {
      human.name = next.name;
      human.isAdmin = next.name === ADMIN_NAME;
    }
    if (next?.profileImage !== undefined) human.profileImage = next.profileImage;
    emit();
  }

  function setReady(ready) {
    const human = horses.find((h) => !h.isBot);
    if (!human) return;
    if (phase !== 'lobby' && phase !== 'countdown') return;
    human.ready = !!ready;
    emit();
    if (ready) {
      maybeStartCountdown();
    } else if (phase === 'countdown') {
      // Solo human in mock — if they unready, kill the countdown.
      const anyReady = horses.some((h) => !h.isBot && h.ready);
      if (!anyReady) {
        phase = 'lobby';
        countdownEndsAt = null;
        emit();
      }
    }
  }

  function sendTap(side) {
    if (phase !== 'racing') return;
    const human = horses.find((h) => !h.isBot);
    if (!human) return;
    applyTap(human, side, Date.now());
  }

  function sendReset() {
    const human = horses.find((h) => !h.isBot);
    if (!human?.isAdmin) return;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    initLobby();
  }

  function destroy() {
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  }

  initLobby();

  return {
    identify: identifyFn,
    setReady,
    sendTap,
    sendReset,
    serverNow: () => Date.now(),
    myConnId: () => 'self',
    destroy,
  };
}
