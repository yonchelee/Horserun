import {
  Server,
  routePartykitRequest,
  type Connection,
  type ConnectionContext,
} from 'partyserver';

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
const COUNTDOWN_MS = 5_000;
const POST_RACE_RESET_MS = 15_000;
const TICK_MS = 1000 / 30; // 30Hz authoritative tick
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
  connId: string | null;
  ready: boolean;
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
  personality: { id: string; baseInterval: number; jitter: number } | null;
  aiNextTapIn: number;
  profileImage?: string | null;
}

export interface Env {
  Main: DurableObjectNamespace<Main>;
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
    ready: true,
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
//
// Class is named `Main` so the kebab-case party namespace is "main",
// matching PartySocket's default `party` option (so the client doesn't
// need to specify one explicitly).
export class Main extends Server<Env> {
  phase: Phase = 'lobby';
  horses: Horse[] = [];
  countdownEndsAt: number | null = null;
  raceStartedAt: number | null = null;
  finishedAt: number | null = null;
  resetAt: number | null = null;
  lastTickMs: number = 0;
  initialised = false;

  // Lazy init so we don't re-initialise on every request the DO wakes up
  // for. Hibernation can drop instance state, so each onConnect /
  // onMessage entry checks this guard.
  ensureInit() {
    if (this.initialised) return;
    this.initLobby();
    this.initialised = true;
  }

  // ── Lifecycle ──
  async onConnect(conn: Connection, _ctx: ConnectionContext) {
    this.ensureInit();
    // If we're somehow mid-cycle with nobody human in the room (e.g. an
    // alarm-driven race kept ticking after the last player left), reset
    // before letting the joiner take a slot — otherwise they'd inherit a
    // bot's mid-race position and skip straight past the ready screen.
    const hasHumans = this.horses.some((h) => !h.isBot);
    if (!hasHumans && this.phase !== 'lobby') {
      this.initLobby();
    }
    const botSlot = this.horses.find((h) => h.isBot);
    if (!botSlot) {
      conn.send(JSON.stringify({ type: 'rejected', reason: 'Room is full' }));
      conn.close();
      return;
    }
    botSlot.isBot = false;
    botSlot.connId = conn.id;
    botSlot.ready = false;
    botSlot.personality = null;
    botSlot.name = 'Rider';
    conn.send(JSON.stringify({ type: 'welcome', connId: conn.id }));
    this.broadcastState();
  }

  // PartyServer's signature is `onMessage(connection, message)` — note
  // the order, which differs from the legacy PartyKit `Party.Server`
  // signature of `(message, sender)`. Getting this wrong silently drops
  // every message because the `message` arg is actually the connection
  // object and the early-return on `typeof message !== 'string'` fires.
  async onMessage(sender: Connection, message: string | ArrayBuffer) {
    this.ensureInit();
    if (typeof message !== 'string') return;
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
        if (this.phase !== 'lobby' && this.phase !== 'countdown') break;
        horse.ready = false;
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
        break;
      }
    }
  }

  async onClose(conn: Connection) {
    this.ensureInit();
    const horse = this.horses.find((h) => h.connId === conn.id);
    if (!horse) return;
    const replacement = makeBot(horse.lane, horse.color);
    Object.assign(horse, replacement);
    // If that was the last human, drop any in-flight countdown/race and
    // park the room in lobby. Otherwise the alarm loop keeps cycling
    // through bot-only races and the next human to connect lands in the
    // middle of one.
    const hasHumans = this.horses.some((h) => !h.isBot);
    if (!hasHumans) {
      this.initLobby();
      this.broadcastState();
      return;
    }
    this.broadcastState();
    this.maybeStartCountdown();
  }

  // ── Game loop driven by Durable Object alarms ──
  async alarm() {
    this.ensureInit();
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
    if (this.phase !== 'lobby') {
      await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
    }
  }

  initLobby() {
    this.phase = 'lobby';
    this.countdownEndsAt = null;
    this.raceStartedAt = null;
    this.finishedAt = null;
    this.resetAt = null;
    this.lastTickMs = 0;
    const humans = this.horses.filter((h) => !h.isBot && h.connId);
    this.horses = [];
    for (let lane = 0; lane < MAX_PLAYERS; lane++) {
      const human = humans.find((h) => h.lane === lane);
      if (human) {
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
    // Don't auto-start if the room is bots-only — bots are always
    // marked ready, so without this guard an empty room would loop
    // through countdown → race → reset forever.
    if (!this.horses.some((h) => !h.isBot)) return;
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
    await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }

  // ── Broadcasting ──
  buildSnapshot() {
    return {
      phase: this.phase,
      horses: this.horses.map((h) => this.publicHorse(h)),
      countdownEndsAt: this.countdownEndsAt,
      raceStartedAt: this.raceStartedAt,
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
    this.broadcast(JSON.stringify({ type: 'state', state: this.buildSnapshot() }));
  }

  broadcastFinished() {
    const ranking = rankHorses(this.horses).map((h) => this.publicHorse(h));
    this.broadcast(
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

// ─── Worker entry point ──────────────────────────────────────────────
//
// PartySocket clients connect to /parties/main/<room>. routePartykitRequest
// matches the kebab-cased class name "main" against our `Main` Durable
// Object and dispatches the WebSocket upgrade.
//
// We tag both connect + plain-request paths with x-partykit-room so the
// PartyServer base class can populate its internal name even when
// ctx.id.name isn't auto-exposed by the runtime (some workerd builds
// leave it undefined for SQLite-backed DOs created via idFromName).
function tagRoom(req: Request, lobby: { name: string }) {
  const tagged = new Request(req);
  tagged.headers.set('x-partykit-room', lobby.name);
  return tagged;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(
        request,
        env as unknown as Record<string, unknown>,
        {
          onBeforeConnect: (req, lobby) => tagRoom(req, lobby),
          onBeforeRequest: (req, lobby) => tagRoom(req, lobby),
        },
      )) || new Response('Not Found', { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
