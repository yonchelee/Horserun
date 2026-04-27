/// <reference types="@cloudflare/workers-types" />
import type * as Party from 'partykit/server';

// ─── Game constants (mirrored from src/game/engine.js) ─────────────────
const TRACK_LENGTH = 100;
const SWEET_MIN_MS = 220;
const SWEET_MAX_MS = 320;
const FRESH_START_MS = 600;
const SPEED_GAIN_PERFECT = 1.6;
const SPEED_GAIN_OFF = 0.55;
const MAX_SPEED = 16;
const SPEED_DAMPING_PER_SEC = 0.5;
const PROGRESS_PER_SPEED_PER_SEC = 1.1;

const COLORS = ['rose', 'amber', 'emerald', 'sky', 'violet'];
const MAX_PLAYERS = 5;
const COUNTDOWN_MS = 10_000;
const POST_RACE_RESET_MS = 15_000;
const TICK_MS = 1000 / 30; // 30fps server tick is plenty for 5 horses
const STATE_BROADCAST_EVERY_TICKS = 1; // i.e. 30Hz broadcast
const BOT_NAMES = ['Comet', 'Shadow', 'Blitz', 'Vortex', 'Phoenix', 'Storm', 'Echo', 'Nova'];
const BOT_PERSONALITIES = [
  { id: 'sprinter', baseInterval: 235, jitter: 0.12 },
  { id: 'pacer', baseInterval: 305, jitter: 0.08 },
  { id: 'steady', baseInterval: 270, jitter: 0.12 },
  { id: 'erratic', baseInterval: 260, jitter: 0.4 },
  { id: 'closer', baseInterval: 290, jitter: 0.1 },
];

// ─── Types ────────────────────────────────────────────────────────────
type Phase = 'lobby' | 'countdown' | 'racing' | 'finished';
type Quality = 'perfect' | 'off' | 'fresh' | 'same' | null;

interface Horse {
  id: string;
  lane: number;
  name: string;
  color: string;
  isBot: boolean;
  // Connection id for human players, null for bots.
  connId: string | null;
  ready: boolean;
  // Race state
  position: number;
  speed: number;
  lastSide: 'L' | 'R' | null;
  lastTapAt: number;
  tapCount: number;
  finished: boolean;
  finishedAt: number | null;
  lastInterval: number | null;
  lastQuality: Quality;
  qualityUntil: number;
  // Bot internals
  personality: { id: string; baseInterval: number; jitter: number } | null;
  aiNextTapIn: number;
  // Identity (kakao or guest)
  profileImage?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function classifyInterval(intervalMs: number | null): 'perfect' | 'off' | 'fresh' {
  if (intervalMs == null || intervalMs > FRESH_START_MS) return 'fresh';
  if (intervalMs >= SWEET_MIN_MS && intervalMs <= SWEET_MAX_MS) return 'perfect';
  return 'off';
}

function applyTap(horse: Horse, side: 'L' | 'R', now: number) {
  if (horse.finished) return;
  const sameSide = horse.lastSide === side;
  const prevTap = horse.lastTapAt || 0;
  const interval = prevTap > 0 ? now - prevTap : null;

  if (sameSide) {
    horse.lastQuality = 'same';
  } else {
    const q = classifyInterval(interval);
    horse.lastQuality = q;
    const gain = q === 'off' ? SPEED_GAIN_OFF : SPEED_GAIN_PERFECT;
    horse.speed = Math.min(MAX_SPEED, horse.speed + gain);
  }
  horse.lastInterval = interval;
  horse.qualityUntil = now + 700;
  horse.lastSide = side;
  horse.lastTapAt = now;
  horse.tapCount += 1;
}

function tickHorse(horse: Horse, dt: number, now: number) {
  if (horse.finished) return;
  horse.speed *= Math.pow(SPEED_DAMPING_PER_SEC, dt);
  horse.position += horse.speed * PROGRESS_PER_SPEED_PER_SEC * dt;
  if (horse.position >= TRACK_LENGTH) {
    horse.position = TRACK_LENGTH;
    horse.finished = true;
    horse.finishedAt = now;
    horse.speed = 0;
  }
}

function tickBot(horse: Horse, dt: number, now: number) {
  if (!horse.isBot || !horse.personality || horse.finished) return;
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

function rankHorses(horses: Horse[]): Horse[] {
  return [...horses].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishedAt ?? 0) - (b.finishedAt ?? 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.position - a.position;
  });
}

function makeBot(lane: number, color: string): Horse {
  const personality = shuffled(BOT_PERSONALITIES)[0];
  const name = shuffled(BOT_NAMES)[0];
  return {
    id: `bot-${lane}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    lane,
    name,
    color,
    isBot: true,
    connId: null,
    ready: true, // bots are always ready
    position: 0,
    speed: 0,
    lastSide: null,
    lastTapAt: 0,
    tapCount: 0,
    finished: false,
    finishedAt: null,
    lastInterval: null,
    lastQuality: null,
    qualityUntil: 0,
    personality,
    aiNextTapIn: 80 + Math.random() * 220,
  };
}

// ─── Server ───────────────────────────────────────────────────────────
export default class HorseRunServer implements Party.Server {
  phase: Phase = 'lobby';
  horses: Horse[] = [];
  countdownEndsAt: number | null = null;
  raceStartedAt: number | null = null;
  finishedAt: number | null = null;
  resetAt: number | null = null;
  lastTickMs: number = 0;
  loopAlarm: any = null;

  constructor(readonly room: Party.Room) {
    this.initLobby();
  }

  // ── Lifecycle ──
  async onConnect(conn: Party.Connection) {
    // Find an empty (bot) lane to swap in for the human.
    const botSlot = this.horses.find((h) => h.isBot);
    if (!botSlot) {
      // Room is full of humans already — reject politely.
      conn.send(JSON.stringify({ type: 'rejected', reason: 'Room is full' }));
      conn.close();
      return;
    }
    botSlot.isBot = false;
    botSlot.connId = conn.id;
    botSlot.ready = false;
    botSlot.personality = null;
    botSlot.name = 'Rider'; // identify message will replace this
    // Tell the client which horse is theirs so the UI can highlight "you".
    conn.send(JSON.stringify({ type: 'welcome', connId: conn.id }));
    this.broadcastState();
  }

  async onMessage(message: string, sender: Party.Connection) {
    let msg: any;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    const horse = this.horses.find((h) => h.connId === sender.id);
    if (!horse) return;

    switch (msg.type) {
      case 'identify': {
        if (typeof msg.name === 'string' && msg.name.trim()) {
          horse.name = msg.name.trim().slice(0, 16);
        }
        if (typeof msg.profileImage === 'string') {
          horse.profileImage = msg.profileImage;
        }
        this.broadcastState();
        break;
      }
      case 'ready': {
        if (this.phase !== 'lobby') break;
        horse.ready = true;
        this.broadcastState();
        this.maybeStartCountdown();
        break;
      }
      case 'unready': {
        if (this.phase !== 'lobby') break;
        horse.ready = false;
        // Cancel a started countdown if any human becomes unready.
        if (this.countdownEndsAt) {
          this.countdownEndsAt = null;
          this.phase = 'lobby';
        }
        this.broadcastState();
        break;
      }
      case 'tap': {
        if (this.phase !== 'racing') break;
        if (msg.side !== 'L' && msg.side !== 'R') break;
        applyTap(horse, msg.side, Date.now());
        // Don't broadcast yet — the tick loop will roll it up.
        break;
      }
    }
  }

  async onClose(conn: Party.Connection) {
    const horse = this.horses.find((h) => h.connId === conn.id);
    if (!horse) return;
    // Replace the disconnected human with a fresh bot in the same lane.
    const replacement = makeBot(horse.lane, horse.color);
    Object.assign(horse, replacement);
    this.broadcastState();
    this.maybeStartCountdown();
  }

  // ── Game loop driven by storage alarms ──
  async onAlarm() {
    const now = Date.now();
    if (this.phase === 'countdown' && this.countdownEndsAt && now >= this.countdownEndsAt) {
      this.startRace();
    }
    if (this.phase === 'racing') {
      this.tickRace(now);
    }
    if (this.phase === 'finished' && this.resetAt && now >= this.resetAt) {
      this.initLobby();
      this.broadcastState();
    }
    // Keep the alarm chain going until we're idle in lobby.
    if (this.phase !== 'lobby') {
      await this.room.storage.setAlarm(now + TICK_MS);
    }
  }

  // ── State machine helpers ──
  initLobby() {
    this.phase = 'lobby';
    this.countdownEndsAt = null;
    this.raceStartedAt = null;
    this.finishedAt = null;
    this.resetAt = null;
    this.lastTickMs = 0;
    // Preserve human seats (connId), reset everything else, fill bots.
    const humans = this.horses.filter((h) => !h.isBot && h.connId);
    this.horses = [];
    for (let lane = 0; lane < MAX_PLAYERS; lane++) {
      const human = humans.find((h) => h.lane === lane);
      if (human) {
        // Reset race state for the human, keep identity.
        this.horses.push({
          ...human,
          ready: false,
          position: 0,
          speed: 0,
          lastSide: null,
          lastTapAt: 0,
          tapCount: 0,
          finished: false,
          finishedAt: null,
          lastInterval: null,
          lastQuality: null,
          qualityUntil: 0,
          personality: null,
          aiNextTapIn: 0,
        });
      } else {
        this.horses.push(makeBot(lane, COLORS[lane]));
      }
    }
  }

  maybeStartCountdown() {
    if (this.phase !== 'lobby') return;
    if (this.horses.every((h) => h.ready)) {
      this.phase = 'countdown';
      this.countdownEndsAt = Date.now() + COUNTDOWN_MS;
      this.scheduleAlarm();
    }
  }

  startRace() {
    this.phase = 'racing';
    this.raceStartedAt = Date.now();
    this.lastTickMs = this.raceStartedAt;
    this.broadcastState();
    this.scheduleAlarm();
  }

  tickRace(now: number) {
    const dt = Math.min(0.1, (now - (this.lastTickMs || now)) / 1000);
    this.lastTickMs = now;
    for (const h of this.horses) {
      if (h.isBot) tickBot(h, dt, now);
      tickHorse(h, dt, now);
    }
    if (this.horses.every((h) => h.finished)) {
      this.endRace(now);
      return;
    }
    this.broadcastState();
  }

  endRace(now: number) {
    this.phase = 'finished';
    this.finishedAt = now;
    this.resetAt = now + POST_RACE_RESET_MS;
    this.broadcastFinished();
    this.scheduleAlarm();
  }

  async scheduleAlarm() {
    await this.room.storage.setAlarm(Date.now() + TICK_MS);
  }

  // ── Broadcasting ──
  buildSnapshot() {
    return {
      phase: this.phase,
      horses: this.horses.map((h) => this.publicHorse(h)),
      countdownEndsAt: this.countdownEndsAt,
      raceStartedAt: this.raceStartedAt,
      // Server time so clients can compute remaining countdown without
      // suffering from clock skew (subtract serverNow from countdownEndsAt
      // and add the local now to translate).
      serverNow: Date.now(),
    };
  }

  publicHorse(h: Horse) {
    return {
      id: h.id,
      lane: h.lane,
      name: h.name,
      color: h.color,
      isBot: h.isBot,
      connId: h.connId,
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

  broadcastState() {
    this.room.broadcast(JSON.stringify({ type: 'state', state: this.buildSnapshot() }));
  }

  broadcastFinished() {
    const ranking = rankHorses(this.horses).map((h) => this.publicHorse(h));
    this.room.broadcast(
      JSON.stringify({
        type: 'finished',
        ranking,
        startedAt: this.raceStartedAt,
        finishedAt: this.finishedAt,
        state: this.buildSnapshot(),
      }),
    );
  }
}
