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

// Sweet-spot in engine.js is 220–320ms. AIs are tuned to land mostly
// inside it, with each personality biased to a different part of the
// band so races don't feel uniform. Erratic deliberately leaks outside
// the band — it's the "messy" rival.
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

function tickAI(horse, dt, now) {
  if (horse.finished) return;

  horse.aiNextTapIn -= dt * 1000;
  if (horse.aiNextTapIn > 0) return;

  const p = horse.personality;

  // "Closer" tightens its precision in the final stretch — jitter drops
  // so it's more likely to stay inside the sweet zone when it matters.
  const lateGame = p.id === 'closer' && horse.position > 70;
  const effectiveJitter = lateGame ? p.jitter * 0.4 : p.jitter;

  const newSide = horse.lastSide === 'L' ? 'R' : 'L';
  applyTap(horse, newSide, now);

  const j = 1 - effectiveJitter + Math.random() * effectiveJitter * 2;
  horse.aiNextTapIn = p.baseInterval * j;
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
