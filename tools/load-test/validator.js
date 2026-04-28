// Horserun load-test / validator agent.
//
// Spawns N PartySocket clients against the live worker, runs them through
// a full game cycle (identify → ready → countdown → race → finished →
// auto-back-to-lobby), and emits a markdown report of pass/fail metrics.
//
// Usage:
//   node validator.js --n 50 --room validator-001 --host horserun.yonchelee.workers.dev
//
// Defaults: n=50, room=validator-<timestamp>, host=horserun.yonchelee.workers.dev
//
// Each client identifies as a guest "bot-001"…"bot-NNN" so it never
// matches the admin secret. bot-001 is the "starter" — it readys first
// to trigger the 30s server countdown.

import { PartySocket } from 'partysocket';

// ── Args ─────────────────────────────────────────────────────────────
const args = (() => {
  const o = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) o[a.slice(2)] = process.argv[++i];
  }
  return o;
})();

const N = parseInt(args.n || '50', 10);
const HOST = args.host || 'horserun.yonchelee.workers.dev';
const ROOM = args.room || `validator-${Date.now()}`;

// PartySocket creates a default _connectionId; we want our own logical id
// for reporting so use an index. Server-assigned connId comes via welcome.
console.log(`▶ horserun validator: N=${N} host=${HOST} room=${ROOM}`);
console.log();

// ── Per-client state ────────────────────────────────────────────────
function makeClient(idx) {
  const me = {
    idx,
    label: `bot-${String(idx + 1).padStart(3, '0')}`,
    sock: null,
    serverConnId: null,
    events: [],     // event log: [{t, kind, ...}]
    // metrics
    connectedAt: null,
    welcomeAt: null,
    firstStateAt: null,
    racingPhaseAt: null,
    finishedMsgAt: null,
    finishedRank: null,
    finishedFlag: false,
    tapsSent: 0,
    statesReceived: 0,
    payloadBytes: 0,
    closeReason: null,
    rejected: null,
  };

  const log = (kind, extra) => {
    me.events.push({ t: Date.now(), kind, ...(extra || {}) });
  };

  const sock = new PartySocket({ host: HOST, room: ROOM });
  me.sock = sock;

  sock.addEventListener('open', () => {
    me.connectedAt = Date.now();
    log('open');
    sock.send(JSON.stringify({
      type: 'identify',
      name: me.label,
      profileImage: null,
      provider: 'guest',
    }));
  });
  sock.addEventListener('message', (ev) => {
    me.payloadBytes += ev.data.length;
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'welcome') {
      me.welcomeAt = Date.now();
      me.serverConnId = m.connId;
      log('welcome', { connId: m.connId });
    } else if (m.type === 'state') {
      me.statesReceived += 1;
      if (!me.firstStateAt) me.firstStateAt = Date.now();
      const s = m.state;
      // Record phase transitions only.
      const last = me.events[me.events.length - 1];
      const lastPhase = last?.phase;
      if (s.phase !== lastPhase) log('phase', { phase: s.phase, totalCount: s.totalCount, humanCount: s.humanCount, readyCount: s.readyCount });
      if (s.phase === 'racing' && !me.racingPhaseAt) me.racingPhaseAt = Date.now();
      // Capture finished flag for me
      if (s.you?.finished && !me.finishedFlag) {
        me.finishedFlag = true;
        log('you-finished', { rank: s.you.rank });
      }
    } else if (m.type === 'finished') {
      me.finishedMsgAt = Date.now();
      me.finishedRank = m.you?.rank;
      log('finished-msg', { rank: m.you?.rank, top: (m.top || []).map(h => `${h.name}#${h.rank}`).slice(0, 3).join(',') });
    } else if (m.type === 'rejected') {
      me.rejected = m.reason;
      log('rejected', { reason: m.reason });
    } else if (m.type === 'kicked') {
      log('kicked', { reason: m.reason });
    }
  });
  sock.addEventListener('close', (ev) => {
    me.closeReason = `${ev.code} ${ev.reason || ''}`.trim();
    log('close', { code: ev.code, reason: ev.reason });
  });
  sock.addEventListener('error', () => log('error'));

  return me;
}

// ── Pacing helpers ──────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function staggeredConnect(n, totalMs) {
  const clients = [];
  for (let i = 0; i < n; i++) {
    clients.push(makeClient(i));
    await sleep(totalMs / n);
  }
  return clients;
}

// Sweet-spot tap pattern: alternate L/R every ~270ms (within 220-320 range)
// + small jitter to look human-ish. Each client gets its own pace.
function startTapping(client) {
  let side = 'L';
  let cancelled = false;
  const baseInterval = 220 + Math.random() * 100;  // 220–320ms
  const tick = () => {
    if (cancelled) return;
    if (client.sock.readyState !== 1) { cancelled = true; return; }
    client.sock.send(JSON.stringify({ type: 'tap', side }));
    client.tapsSent += 1;
    side = side === 'L' ? 'R' : 'L';
    const jitter = (Math.random() - 0.5) * 60;
    setTimeout(tick, baseInterval + jitter);
  };
  setTimeout(tick, Math.random() * 200);  // small initial offset per client
  return () => { cancelled = true; };
}

// ── Main lifecycle ──────────────────────────────────────────────────
const t0 = Date.now();
const stamp = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

console.log(`[${stamp()}] connecting ${N} clients staggered over 3s…`);
const clients = await staggeredConnect(N, 3000);

// Wait until every client received its first state (or 8s timeout).
const allConnected = await Promise.race([
  (async () => {
    while (clients.some(c => !c.firstStateAt)) await sleep(100);
    return true;
  })(),
  sleep(8000).then(() => false),
]);
const connectedCount = clients.filter(c => c.firstStateAt).length;
console.log(`[${stamp()}] firstState received: ${connectedCount}/${N}${allConnected ? '' : ' (timeout)'}`);

// Bot-001 readys first to trigger 30s server countdown.
console.log(`[${stamp()}] bot-001 sends ready → expect 30s countdown to start`);
clients[0].sock.send(JSON.stringify({ type: 'ready' }));

await sleep(2000);
// Other clients all ready up.
console.log(`[${stamp()}] other ${N - 1} clients sending ready`);
for (let i = 1; i < N; i++) {
  if (clients[i].sock.readyState === 1) {
    clients[i].sock.send(JSON.stringify({ type: 'ready' }));
  }
  await sleep(20);  // gentle pacing
}

// Wait for racing phase. Server's COUNTDOWN_MS=30s + small grace.
console.log(`[${stamp()}] waiting for racing phase (≤35s)…`);
const racingStart = Date.now();
while (clients.every(c => !c.racingPhaseAt) && Date.now() - racingStart < 35000) {
  await sleep(200);
}
const enteredRacing = clients.filter(c => c.racingPhaseAt).length;
console.log(`[${stamp()}] entered racing: ${enteredRacing}/${N}`);

if (enteredRacing === 0) {
  console.log('!!! never entered racing — aborting');
} else {
  // Start tapping in every client.
  console.log(`[${stamp()}] starting tap loops on all clients`);
  const stopFns = clients.map(startTapping);

  // Wait for the race to finish (top-quorum + 30s grace, or all-finished).
  // Caps at 90s of racing — beyond that something is stuck and we abort.
  const raceTimeout = parseInt(args['race-timeout-ms'] || '90000', 10);
  const raceStart = Date.now();
  while (
    Date.now() - raceStart < raceTimeout &&
    clients.filter(c => c.finishedMsgAt).length < N
  ) {
    await sleep(500);
  }
  for (const stop of stopFns) stop();
  const finishedMsgCount = clients.filter(c => c.finishedMsgAt).length;
  console.log(`[${stamp()}] finished messages received: ${finishedMsgCount}/${N}`);

  // Wait up to 20s for the server's POST_RACE_RESET_MS=15s auto-cycle
  // back to lobby.
  console.log(`[${stamp()}] waiting up to 20s for auto-return to lobby…`);
  const lobbyStart = Date.now();
  while (Date.now() - lobbyStart < 20_000) {
    const inLobbyAgain = clients.filter((c) => {
      const phases = c.events.filter(e => e.kind === 'phase').map(e => e.phase);
      return phases.includes('finished') &&
        phases.lastIndexOf('lobby') > phases.lastIndexOf('finished');
    }).length;
    if (inLobbyAgain >= Math.floor(N * 0.9)) break;
    await sleep(500);
  }
}

// Tear down everyone.
console.log(`[${stamp()}] tearing down ${N} sockets`);
for (const c of clients) {
  try { c.sock.close(1000, 'validator-done'); } catch {}
}
await sleep(1000);

// ── Report ─────────────────────────────────────────────────────────
const REPORT = [];
const w = (s) => REPORT.push(s);

const finalConnected = clients.filter(c => c.connectedAt).length;
const finalIdentified = clients.filter(c => c.welcomeAt).length;
const finalFirstState = clients.filter(c => c.firstStateAt).length;
const finalRacing = clients.filter(c => c.racingPhaseAt).length;
const finalFinishedMsg = clients.filter(c => c.finishedMsgAt).length;
const finalFinishedFlag = clients.filter(c => c.finishedFlag).length;
const rejected = clients.filter(c => c.rejected);
const closedAbnormally = clients.filter(c => c.closeReason && !c.closeReason.startsWith('1000')).length;
const totalTaps = clients.reduce((s, c) => s + c.tapsSent, 0);
const totalStates = clients.reduce((s, c) => s + c.statesReceived, 0);
const totalBytes = clients.reduce((s, c) => s + c.payloadBytes, 0);

// Find lobby-after-finished cycle
let backToLobbyOK = 0;
for (const c of clients) {
  const phases = c.events.filter(e => e.kind === 'phase').map(e => e.phase);
  if (phases.includes('finished')) {
    const lastFinished = phases.lastIndexOf('finished');
    const lastLobby = phases.lastIndexOf('lobby');
    if (lastLobby > lastFinished) backToLobbyOK += 1;
  }
}

// Countdown duration: time from first 'countdown' phase event to first 'racing' phase event,
// using clients[0]'s perspective (the one who triggered ready).
const countdownEvent = clients[0].events.find(e => e.kind === 'phase' && e.phase === 'countdown');
const racingEvent = clients[0].events.find(e => e.kind === 'phase' && e.phase === 'racing');
const countdownDurMs = (countdownEvent && racingEvent) ? racingEvent.t - countdownEvent.t : null;

const checks = [
  [`connected (${N}/${N})`, finalConnected === N],
  [`identified (${N}/${N})`, finalIdentified === N],
  ['first state received', finalFirstState === N],
  ['countdown phase observed', countdownEvent != null],
  [`racing phase entered (${N}/${N})`, finalRacing === N],
  [`countdown ~30s (was ${countdownDurMs ?? '?'}ms)`,
    countdownDurMs != null && countdownDurMs >= 28_000 && countdownDurMs <= 32_000],
  [`finished messages ≥ ${Math.floor(N * 0.9)}/${N} (was ${finalFinishedMsg})`,
    finalFinishedMsg >= Math.floor(N * 0.9)],
  ['no rejected connections', rejected.length === 0],
  ['no abnormal closes', closedAbnormally === 0],
  [`auto-back-to-lobby ≥ ${Math.floor(N * 0.9)}/${N}`,
    backToLobbyOK >= Math.floor(N * 0.9)],
];
const passed = checks.filter(c => c[1]).length;
const allPass = passed === checks.length;

w(`# Horserun 50-client load test`);
w('');
w(`- **Worker**: \`${HOST}\``);
w(`- **Room**: \`${ROOM}\``);
w(`- **Clients**: ${N}`);
w(`- **Started**: ${new Date(t0).toISOString()}`);
w(`- **Total runtime**: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
w('');
w(`## Verdict: ${allPass ? '✅ PASS' : `⚠️ ${checks.length - passed} check(s) failed`}`);
w('');
w('## Pass/Fail summary');
w('');
w('| Check | Result |');
w('|---|---|');
for (const [name, ok] of checks) {
  w(`| ${name} | ${ok ? '✅' : '❌'} |`);
}
w('');
w('## Lifecycle metrics');
w('');
w('| Metric | Value |');
w('|---|---|');
w(`| Sockets opened | ${finalConnected} / ${N} |`);
w(`| Welcome received | ${finalIdentified} / ${N} |`);
w(`| First state received | ${finalFirstState} / ${N} |`);
w(`| Entered racing | ${finalRacing} / ${N} |`);
w(`| \`finished\` message | ${finalFinishedMsg} / ${N} |`);
w(`| \`you.finished=true\` flag | ${finalFinishedFlag} / ${N} |`);
w(`| Auto-back-to-lobby | ${backToLobbyOK} / ${N} |`);
w(`| Countdown duration | ${countdownDurMs != null ? `${(countdownDurMs / 1000).toFixed(2)}s` : '—'} |`);
w(`| Total taps sent | ${totalTaps} (avg ${(totalTaps / N).toFixed(1)} per client) |`);
w(`| Total state messages | ${totalStates} (avg ${(totalStates / N).toFixed(1)}) |`);
w(`| Total payload received | ${(totalBytes / 1024).toFixed(1)} KB (avg ${(totalBytes / N / 1024).toFixed(1)} KB / client) |`);
w(`| Rejected | ${rejected.length} |`);
w(`| Abnormal closes (≠1000) | ${closedAbnormally} |`);
w('');

if (rejected.length > 0) {
  w('## Rejected clients');
  w('');
  for (const c of rejected) w(`- ${c.label}: ${c.rejected}`);
  w('');
}

const earlyClosers = clients.filter(c => c.closeReason && !c.closeReason.startsWith('1000'));
if (earlyClosers.length > 0) {
  w('## Abnormal closes');
  w('');
  for (const c of earlyClosers) w(`- ${c.label}: ${c.closeReason}`);
  w('');
}

w('## Per-client phase trace (first 5 clients)');
w('');
for (const c of clients.slice(0, 5)) {
  const phases = c.events.filter(e => e.kind === 'phase').map(e => e.phase);
  w(`- **${c.label}** (connId=${c.serverConnId?.slice(0, 8) ?? 'none'}): phases [${phases.join(' → ')}], taps=${c.tapsSent}, states=${c.statesReceived}, finished=${c.finishedFlag}, rank=${c.finishedRank ?? '—'}`);
}

console.log();
console.log('────────────────────────────────────────');
console.log(`VERDICT: ${allPass ? '✅ PASS' : `⚠️ ${checks.length - passed} check(s) failed`}`);
console.log(`(${passed}/${checks.length} checks passed)`);
console.log('────────────────────────────────────────');

// Default report goes next to the script. Override via REPORT_PATH env
// or --report CLI arg.
const reportArg = args.report;
const defaultReport = new URL('./report.md', import.meta.url).pathname;
const outPath = reportArg || process.env.REPORT_PATH || defaultReport;
const fs = await import('node:fs');
fs.writeFileSync(outPath, REPORT.join('\n') + '\n');
console.log(`report written → ${outPath}`);

process.exit(allPass ? 0 : 1);
