// Local-only fallback that mirrors the PartyKit server's state machine
// 1:1, so the rest of the app doesn't need to know whether it's talking
// to a real server or this in-browser stub.
//
// Surface:
//   const net = createMockNetwork({ identity, onState, onFinished });
//   net.identify(identity); net.setReady(true);
//   net.sendTap('L'); net.serverNow(); net.destroy();

import { applyTap, tickHorse, rankHorses, makeHorse } from './engine.js';

const MAX_PLAYERS = 5;
const COUNTDOWN_MS = 10_000;
const POST_RACE_RESET_MS = 15_000;
const COLORS = ['rose', 'amber', 'emerald', 'sky', 'violet'];
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
    color: COLORS[lane],
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
    color: COLORS[lane],
  });
  horse.isBot = false;
  horse.ready = false;
  horse.profileImage = identity?.profileImage ?? null;
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

  function publicHorse(h) {
    return {
      id: h.id,
      lane: h.lane,
      name: h.name,
      color: h.color,
      isBot: h.isBot,
      // Distinguish "you" from other humans (only one human in mock).
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
    };
  }

  function snapshot() {
    return {
      phase,
      horses: horses.map(publicHorse),
      countdownEndsAt,
      raceStartedAt: startedAt,
      serverNow: Date.now(),
    };
  }

  function emit() {
    onState && onState(snapshot());
  }

  function initLobby() {
    const playerLane = Math.floor(Math.random() * 5);
    horses = [];
    for (let lane = 0; lane < MAX_PLAYERS; lane++) {
      horses.push(
        lane === playerLane ? makeHumanSlot(lane, identity) : makeBot(lane),
      );
    }
    phase = 'lobby';
    countdownEndsAt = null;
    startedAt = null;
    finishedAt = null;
    emit();
  }

  function maybeStartCountdown() {
    if (phase !== 'lobby') return;
    if (horses.every((h) => h.ready)) {
      phase = 'countdown';
      countdownEndsAt = Date.now() + COUNTDOWN_MS;
      emit();
      setT(() => {
        if (phase === 'countdown') startRace();
      }, COUNTDOWN_MS);
    }
  }

  function startRace() {
    phase = 'racing';
    startedAt = Date.now();
    last = performance.now();
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
    if (horses.every((h) => h.finished)) {
      finishRace();
      return;
    }
    emit();
    raf = requestAnimationFrame(loop);
  }

  function finishRace() {
    phase = 'finished';
    finishedAt = Date.now();
    raf = null;
    const ranking = rankHorses(horses).map(publicHorse);
    emit();
    onFinished && onFinished({ ranking, startedAt, finishedAt });
    setT(() => {
      initLobby();
    }, POST_RACE_RESET_MS);
  }

  // ── Public API ──
  function identifyFn(next) {
    const human = horses.find((h) => !h.isBot);
    if (!human) return;
    if (next?.name) human.name = next.name;
    if (next?.profileImage !== undefined) human.profileImage = next.profileImage;
    emit();
  }

  function setReady(ready) {
    const human = horses.find((h) => !h.isBot);
    if (!human) return;
    if (phase !== 'lobby') return;
    human.ready = !!ready;
    emit();
    if (ready) {
      // Bots stay ready (they always are), but stagger visible "ready"
      // toggles for the UX of seeing rivals click in.
      maybeStartCountdown();
    } else if (phase === 'countdown') {
      phase = 'lobby';
      countdownEndsAt = null;
      emit();
    }
  }

  function sendTap(side) {
    if (phase !== 'racing') return;
    const human = horses.find((h) => !h.isBot);
    if (!human) return;
    applyTap(human, side, Date.now());
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
    serverNow: () => Date.now(),
    myConnId: () => 'self',
    destroy,
  };
}
