// Mock multiplayer "server" running locally inside the client.
// Same surface as a Socket.io client wrapper would have:
//   const net = createNetwork({ playerName, onState, onFinish });
//   net.start(); net.sendTap('L'); net.reset(); net.destroy();
//
// To swap in real Socket.io later, replace this file's exported
// createNetwork with one that emits 'tap' events to the server and
// listens for 'state' / 'finish' broadcasts.

import { applyTap, tickHorse, rankHorses, makeHorse } from './engine.js';

const HORSE_NAMES = [
  'Comet',
  'Shadow',
  'Blitz',
  'Vortex',
  'Phoenix',
  'Storm',
  'Echo',
  'Nova',
];

const COLORS = ['rose', 'amber', 'emerald', 'sky', 'violet'];

const PERSONALITIES = [
  { id: 'sprinter', baseInterval: 130, jitter: 0.25, restThreshold: 22, restProb: 0.4 },
  { id: 'pacer', baseInterval: 205, jitter: 0.18, restThreshold: 55, restProb: 0.6 },
  { id: 'steady', baseInterval: 165, jitter: 0.3, restThreshold: 38, restProb: 0.5 },
  { id: 'erratic', baseInterval: 150, jitter: 0.55, restThreshold: 30, restProb: 0.4 },
  { id: 'closer', baseInterval: 220, jitter: 0.25, restThreshold: 45, restProb: 0.7 },
];

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tickAI(horse, dt, now) {
  if (horse.finished) return;
  if (now < horse.overheatUntil) return;

  horse.aiNextTapIn -= dt * 1000;
  if (horse.aiNextTapIn > 0) return;

  const p = horse.personality;
  const lowStamina = horse.stamina < p.restThreshold;

  // "Closer" personality pushes harder near the finish line.
  const lateGameBoost =
    p.id === 'closer' && horse.position > 70 ? 0.7 : 1;

  if (lowStamina && Math.random() < p.restProb) {
    horse.aiNextTapIn = (320 + Math.random() * 280) * lateGameBoost;
    return;
  }

  const newSide = horse.lastSide === 'L' ? 'R' : 'L';
  applyTap(horse, newSide, now);

  const j = 1 - p.jitter + Math.random() * p.jitter * 2;
  horse.aiNextTapIn = p.baseInterval * j * (lowStamina ? 1.45 : 1) * lateGameBoost;
}

export function createMockNetwork({ playerName = 'YOU', onState, onFinish }) {
  let horses = [];
  let raf = null;
  let last = 0;
  let phase = 'idle'; // idle | racing | finished
  let startedAt = 0;

  function init() {
    const personalities = shuffled(PERSONALITIES).slice(0, 4);
    const aiNames = shuffled(HORSE_NAMES).slice(0, 4);
    const playerLane = Math.floor(Math.random() * 5);

    horses = [];
    let aiIdx = 0;
    for (let lane = 0; lane < 5; lane++) {
      if (lane === playerLane) {
        horses.push(
          makeHorse({
            id: `player`,
            lane,
            isPlayer: true,
            name: playerName,
            color: COLORS[lane],
          }),
        );
      } else {
        horses.push(
          makeHorse({
            id: `ai-${lane}`,
            lane,
            isPlayer: false,
            name: aiNames[aiIdx],
            color: COLORS[lane],
            personality: personalities[aiIdx],
          }),
        );
        aiIdx++;
      }
    }
    emit();
  }

  function emit() {
    if (!onState) return;
    onState({
      horses: horses.map((h) => ({ ...h })),
      phase,
      elapsed: phase === 'racing' ? performance.now() - startedAt : 0,
    });
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    for (const h of horses) {
      if (!h.isPlayer) tickAI(h, dt, now);
      tickHorse(h, dt, now);
    }

    if (horses.every((h) => h.finished)) {
      phase = 'finished';
      emit();
      onFinish && onFinish(rankHorses(horses));
      raf = null;
      return;
    }

    emit();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (phase === 'racing') return;
    phase = 'racing';
    startedAt = performance.now();
    last = performance.now();
    raf = requestAnimationFrame(loop);
    emit();
  }

  function sendTap(side) {
    if (phase !== 'racing') return;
    const player = horses.find((h) => h.isPlayer);
    if (player) applyTap(player, side, performance.now());
  }

  function reset() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    phase = 'idle';
    init();
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  init();

  return { start, sendTap, reset, destroy };
}
