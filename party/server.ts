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

// 5 named lane colors are kept for bot/human assignment; the client
// maps them to role-based "1st/2nd/3rd/4th/you" slots so a 150-player
// room only ever needs 5 distinct colors on screen.
const COLORS = ['rose', 'amber', 'emerald', 'sky', 'violet'];
const MAX_PLAYERS = 150;
// Even a solo human gets a 5-horse race; bots fill the rest. Once 5+
// humans are in the room, no bots are added.
const MIN_RACERS = 5;
// First-ready triggers a 30s countdown so 150-person events can start
// without waiting for everyone to hit Ready.
const COUNTDOWN_MS = 30_000;
const POST_RACE_RESET_MS = 15_000;
// 10Hz authoritative tick (down from 30Hz); the client lerps between
// snapshots to keep motion smooth.
const TICK_MS = 100;
// After the Nth horse finishes, allow 30s for stragglers, then force
// the race to end. Keeps a 150-horse race from blocking on tail.
const FINISH_QUORUM = 10;
const FINISH_GRACE_MS = 30_000;
// Per-connection payload includes the visible top 5; client renders
// them around the player in 5 fixed lane slots.
const VISIBLE_TOP_N = 5;
// Guest nickname that grants admin powers (currently: force-reset the
// room mid-race). Hardcoded because there's no separate auth surface;
// anyone who knows the string can claim it. That's intentionally simple
// for now — swap to a wrangler secret if/when this needs to be private.
const ADMIN_NAME = '이영채1657';
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
  isAdmin?: boolean;
}

// State persisted across hibernation. We deliberately omit transient
// per-tick fields (lastTapAt, qualityUntil, aiNextTapIn) — if the DO is
// evicted between ticks they'll be re-derived; if it's evicted between
// phases the saved snapshot is enough to resume.
interface PersistedState {
  phase: Phase;
  horses: Horse[];
  countdownEndsAt: number | null;
  raceStartedAt: number | null;
  finishedAt: number | null;
  resetAt: number | null;
  finishGraceUntil: number | null;
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
    isAdmin: false,
  };
}

function makeHumanSlot(lane: number, color: string, connId: string): Horse {
  return {
    id: `h-${lane}-${connId}`,
    lane,
    name: 'Rider',
    color,
    isBot: false,
    connId,
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
    profileImage: null,
    isAdmin: false,
  };
}

// ─── Server ───────────────────────────────────────────────────────────
//
// Class is named `Main` so the kebab-case party namespace is "main",
// matching PartySocket's default `party` option (so the client doesn't
// need to specify one explicitly).
export class Main extends Server<Env> {
  // Hibernate when no events are firing. During an active race the
  // alarm chain ticks every 100ms so the DO stays warm; during idle
  // lobbies / between events the DO can drop out of memory while
  // WebSockets stay open, eliminating idle billing.
  static options = { hibernate: true };

  phase: Phase = 'lobby';
  horses: Horse[] = [];
  countdownEndsAt: number | null = null;
  raceStartedAt: number | null = null;
  finishedAt: number | null = null;
  resetAt: number | null = null;
  finishGraceUntil: number | null = null;
  lastTickMs: number = 0;
  loaded = false;

  // ── Lifecycle ──
  // Called on first cold start AND after waking from hibernation.
  async onStart() {
    if (this.loaded) return;
    const saved = await this.ctx.storage.get<PersistedState>('race');
    if (saved) {
      this.phase = saved.phase;
      this.horses = saved.horses;
      this.countdownEndsAt = saved.countdownEndsAt;
      this.raceStartedAt = saved.raceStartedAt;
      this.finishedAt = saved.finishedAt;
      this.resetAt = saved.resetAt;
      this.finishGraceUntil = saved.finishGraceUntil;
    } else {
      this.initLobby();
      await this.persist();
    }
    this.loaded = true;
  }

  async persist() {
    const state: PersistedState = {
      phase: this.phase,
      horses: this.horses,
      countdownEndsAt: this.countdownEndsAt,
      raceStartedAt: this.raceStartedAt,
      finishedAt: this.finishedAt,
      resetAt: this.resetAt,
      finishGraceUntil: this.finishGraceUntil,
    };
    await this.ctx.storage.put('race', state);
  }

  async onConnect(conn: Connection, _ctx: ConnectionContext) {
    await this.onStart();
    const humanCount = this.horses.filter((h) => !h.isBot && h.connId).length;
    if (humanCount >= MAX_PLAYERS) {
      conn.send(JSON.stringify({ type: 'rejected', reason: 'Room is full' }));
      conn.close();
      return;
    }

    // Drop any in-flight race so a fresh joiner doesn't inherit a
    // mid-race position when the previous run was bot-only or stuck.
    const hadHumans = this.horses.some((h) => !h.isBot && h.connId);
    if (!hadHumans && this.phase !== 'lobby') {
      this.initLobby();
    }

    // First, try to claim a vacated bot slot (lane preserved across the
    // current race so colors don't reshuffle while spectators are
    // watching). If none, append a new lane.
    let slot = this.horses.find((h) => h.isBot && h.connId == null);
    if (slot) {
      const color = slot.color;
      const lane = slot.lane;
      Object.assign(slot, makeHumanSlot(lane, color, conn.id));
    } else {
      const lane = this.horses.length;
      const color = COLORS[lane % COLORS.length];
      this.horses.push(makeHumanSlot(lane, color, conn.id));
    }

    this.refillBotsToMin();
    await this.persist();
    conn.send(JSON.stringify({ type: 'welcome', connId: conn.id }));
    this.broadcastState();
  }

  // PartyServer's signature is `onMessage(connection, message)` — note
  // the order, which differs from the legacy PartyKit `Party.Server`
  // signature of `(message, sender)`. Getting this wrong silently drops
  // every message because the `message` arg is actually the connection
  // object and the early-return on `typeof message !== 'string'` fires.
  async onMessage(sender: Connection, message: string | ArrayBuffer) {
    await this.onStart();
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
          const trimmed = msg.name.trim().slice(0, 16);
          horse.name = trimmed;
          horse.isAdmin = trimmed === ADMIN_NAME;
        }
        if (typeof msg.profileImage === 'string') {
          horse.profileImage = msg.profileImage;
        }
        await this.persist();
        this.broadcastState();
        break;
      }
      case 'reset': {
        if (!horse.isAdmin) break;
        // initLobby preserves connected humans (resets their state to
        // ready=false / position=0) and refills the rest with bots up
        // to MIN_RACERS — everyone in the room jumps back to the ready
        // screen on the next broadcast.
        this.initLobby();
        await this.persist();
        this.broadcastState();
        break;
      }
      case 'ready': {
        if (this.phase !== 'lobby' && this.phase !== 'countdown') break;
        horse.ready = true;
        await this.persist();
        // First ready in lobby starts the countdown. Additional readys
        // during countdown just update individual ready flags.
        if (this.phase === 'lobby') this.maybeStartCountdown();
        this.broadcastState();
        break;
      }
      case 'unready': {
        if (this.phase !== 'lobby' && this.phase !== 'countdown') break;
        horse.ready = false;
        // Cancel countdown only if NOBODY is ready anymore. With 150
        // players we don't want a single un-ready to cancel the start.
        const anyReady = this.horses.some((h) => !h.isBot && h.ready);
        if (!anyReady && this.phase === 'countdown') {
          this.countdownEndsAt = null;
          this.phase = 'lobby';
        }
        await this.persist();
        this.broadcastState();
        break;
      }
      case 'tap': {
        if (this.phase !== 'racing') break;
        if (msg.side !== 'L' && msg.side !== 'R') break;
        applyTap(horse, msg.side, Date.now());
        // Don't persist or broadcast on every tap — the next 10Hz tick
        // will pick up the speed change.
        break;
      }
    }
  }

  async onClose(conn: Connection) {
    await this.onStart();
    const horse = this.horses.find((h) => h.connId === conn.id);
    if (!horse) return;
    // Drop the human; refill bots only if we're below MIN_RACERS so
    // bots don't reappear in a heavily-populated room mid-race.
    horse.connId = null;
    horse.isBot = true;
    horse.ready = true;
    horse.profileImage = null;
    horse.isAdmin = false;
    horse.name = shuffled(BOT_NAMES)[0];
    horse.personality = shuffled(BOT_PERSONALITIES)[0];
    horse.aiNextTapIn = 80 + Math.random() * 220;

    const stillHasHumans = this.horses.some((h) => !h.isBot && h.connId);
    if (!stillHasHumans) {
      // Empty room — park back in lobby + collapse to MIN_RACERS so
      // we're not paying to tick a 150-bot race nobody's watching.
      this.initLobby();
    } else if (this.phase === 'lobby') {
      this.refillBotsToMin();
    }

    await this.persist();
    this.broadcastState();
  }

  // ── Game loop driven by Durable Object alarms ──
  // PartyServer overrides `alarm()` for hibernation routing — we use
  // `onAlarm()` instead, which it forwards to.
  async onAlarm() {
    await this.onStart();
    const now = Date.now();
    if (this.phase === 'countdown' && this.countdownEndsAt && now >= this.countdownEndsAt) {
      this.startRace();
    }
    if (this.phase === 'racing') {
      this.tickRace(now);
    }
    if (this.phase === 'finished' && this.resetAt && now >= this.resetAt) {
      this.initLobby();
      await this.persist();
      this.broadcastState();
    }
    if (this.phase !== 'lobby') {
      await this.scheduleAlarm();
    }
  }

  // ── Game state transitions ──
  initLobby() {
    this.phase = 'lobby';
    this.countdownEndsAt = null;
    this.raceStartedAt = null;
    this.finishedAt = null;
    this.resetAt = null;
    this.finishGraceUntil = null;
    this.lastTickMs = 0;
    // Preserve human identity (name/profile/admin/lane/color); reset
    // race-state fields. Drop disconnected humans entirely.
    const humans = this.horses.filter((h) => !h.isBot && h.connId);
    this.horses = humans.map((h) => ({
      ...h,
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
    }));
    this.refillBotsToMin();
  }

  // Pad with fresh bots so total horses ≥ MIN_RACERS. Never adds bots
  // beyond MIN_RACERS — once humanCount ≥ MIN_RACERS, bots are 0.
  refillBotsToMin() {
    while (this.horses.length < MIN_RACERS) {
      const lane = this.horses.length;
      const color = COLORS[lane % COLORS.length];
      this.horses.push(makeBot(lane, color));
    }
  }

  maybeStartCountdown() {
    if (this.phase !== 'lobby') return;
    // Need at least one human ready to start. Bots are auto-ready so
    // we ignore them here.
    if (!this.horses.some((h) => !h.isBot && h.ready)) return;
    this.phase = 'countdown';
    this.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    void this.scheduleAlarm();
  }

  startRace() {
    this.phase = 'racing';
    this.raceStartedAt = Date.now();
    this.lastTickMs = this.raceStartedAt;
    this.finishGraceUntil = null;
    void this.persist();
    this.broadcastState();
  }

  tickRace(now: number) {
    const dt = Math.min(0.2, (now - (this.lastTickMs || now)) / 1000);
    this.lastTickMs = now;
    for (const h of this.horses) {
      if (h.isBot) tickBot(h, dt, now);
      tickHorse(h, dt, now);
    }
    const finishedCount = this.horses.filter((h) => h.finished).length;
    // Once FINISH_QUORUM horses cross the line, start a 30s grace
    // window for stragglers — then force-end whether they finished or
    // not. Saves us from a single slow tail blocking a 150-horse race.
    if (this.finishGraceUntil == null && finishedCount >= FINISH_QUORUM) {
      this.finishGraceUntil = now + FINISH_GRACE_MS;
    }
    const allDone = this.horses.every((h) => h.finished);
    const graceExpired =
      this.finishGraceUntil != null && now >= this.finishGraceUntil;
    if (allDone || graceExpired) {
      this.endRace(now);
      return;
    }
    this.broadcastState();
  }

  endRace(now: number) {
    this.phase = 'finished';
    this.finishedAt = now;
    this.resetAt = now + POST_RACE_RESET_MS;
    this.finishGraceUntil = null;
    void this.persist();
    this.broadcastFinished();
  }

  async scheduleAlarm() {
    await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }

  // ── Broadcasting (per-connection unicast) ──
  //
  // For 150-player rooms we can't broadcast a 50KB full-snapshot every
  // tick. Instead each connected player gets a compact payload with:
  //   - their own horse fully expanded ("you" projection w/ rank)
  //   - the top-N visible horses (just enough to render 5 lane slots)
  //   - aggregate counts (totalCount, humanCount, readyCount)
  // Total per-tick bandwidth: 150 × ~3KB = ~450KB at 10Hz vs the old
  // single 75KB × 150 fan-out at 30Hz (~340MB/s → ~4.5MB/s).
  buildSummary(): {
    totalCount: number;
    humanCount: number;
    readyCount: number;
    finishedCount: number;
  } {
    const total = this.horses.length;
    let humans = 0;
    let ready = 0;
    let finished = 0;
    for (const h of this.horses) {
      if (!h.isBot && h.connId) humans += 1;
      if (h.ready) ready += 1;
      if (h.finished) finished += 1;
    }
    return {
      totalCount: total,
      humanCount: humans,
      readyCount: ready,
      finishedCount: finished,
    };
  }

  // Compact horse projection for the top-5 slots — only fields the
  // client actually renders.
  shortHorse(h: Horse, rank: number) {
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

  // Full projection used for "you" — the player needs every per-horse
  // field to render their own controls / rhythm UI.
  fullHorse(h: Horse, rank: number) {
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
      isAdmin: !!h.isAdmin,
      rank,
    };
  }

  buildSnapshotForConn(connId: string) {
    const ranked = rankHorses(this.horses);
    const rankOf = new Map<string, number>();
    ranked.forEach((h, i) => rankOf.set(h.id, i + 1));

    const youHorse = this.horses.find((h) => h.connId === connId) ?? null;
    const top = ranked.slice(0, VISIBLE_TOP_N).map((h) => this.shortHorse(h, rankOf.get(h.id)!));
    const summary = this.buildSummary();

    return {
      phase: this.phase,
      serverNow: Date.now(),
      countdownEndsAt: this.countdownEndsAt,
      raceStartedAt: this.raceStartedAt,
      finishedAt: this.finishedAt,
      resetAt: this.resetAt,
      finishGraceUntil: this.finishGraceUntil,
      ...summary,
      you: youHorse ? this.fullHorse(youHorse, rankOf.get(youHorse.id)!) : null,
      top,
    };
  }

  broadcastState() {
    for (const conn of this.getConnections()) {
      const snap = this.buildSnapshotForConn(conn.id);
      try {
        conn.send(JSON.stringify({ type: 'state', state: snap }));
      } catch {
        // Connection may have closed mid-iteration; ignore.
      }
    }
  }

  broadcastFinished() {
    const ranked = rankHorses(this.horses);
    const rankOf = new Map<string, number>();
    ranked.forEach((h, i) => rankOf.set(h.id, i + 1));
    const top = ranked.slice(0, VISIBLE_TOP_N).map((h) => this.shortHorse(h, rankOf.get(h.id)!));
    for (const conn of this.getConnections()) {
      const youHorse = this.horses.find((h) => h.connId === conn.id) ?? null;
      const state = this.buildSnapshotForConn(conn.id);
      try {
        conn.send(
          JSON.stringify({
            type: 'finished',
            top,
            you: youHorse ? this.fullHorse(youHorse, rankOf.get(youHorse.id)!) : null,
            startedAt: this.raceStartedAt,
            finishedAt: this.finishedAt,
            state,
          }),
        );
      } catch {
        // ignore
      }
    }
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
// leave it undefined for SQLite-backed DOs created via idFromName()).
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
