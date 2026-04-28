import { useEffect, useRef, useState } from 'react';
import { Timer, Users, Wifi, WifiOff } from 'lucide-react';

import Menu from './components/Menu.jsx';
import Lobby from './components/Lobby.jsx';
import Track from './components/Track.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import Controls from './components/Controls.jsx';
import Results from './components/Results.jsx';

import { createNetwork, isMultiplayerEnabled } from './game/network.js';
import { buildVisibleSlots, buildLeaderboardList, YOU_COLOR } from './game/visible.js';

export default function App() {
  // Local UI state (unrelated to server phase):
  //  - identity: who am I (kakao or guest); null until logged in
  //  - snapshot: latest snapshot from network (null until first emit)
  //  - finalResult: the server's `finished` payload (top + you + times)
  const [identity, setIdentity] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [networkError, setNetworkError] = useState(null);
  // Local dismissal flag so the player can leave the Results screen
  // without waiting for the server's POST_RACE_RESET_MS auto-reset.
  // Reset whenever we transition into a new finished payload.
  const [resultsDismissed, setResultsDismissed] = useState(false);
  // Set when the admin kicks us. Surfaced as a banner on the Menu
  // screen; cleared on next successful login.
  const [kickedMessage, setKickedMessage] = useState(null);

  const netRef = useRef(null);
  const now = performance.now();

  useEffect(() => () => netRef.current?.destroy(), []);

  const handleLogin = (id) => {
    setIdentity(id);
    setNetworkError(null);
    setFinalResult(null);
    setKickedMessage(null);

    netRef.current?.destroy();
    const net = createNetwork({
      identity: id,
      onState: (state) => {
        setSnapshot(state);
        if (state.phase === 'lobby') {
          setFinalResult(null);
          setResultsDismissed(false);
        }
      },
      onFinished: (payload) => {
        // payload = { top, you, startedAt, finishedAt }
        setFinalResult(payload);
        setResultsDismissed(false);
      },
      onRejected: (reason) => {
        setNetworkError(reason || 'Connection rejected');
      },
      onKicked: (reason) => {
        // Admin removed us from the room. Tear the session down so
        // the user sees the Menu again with a banner explaining why.
        netRef.current?.destroy();
        netRef.current = null;
        setKickedMessage(reason || '방장이 내보냈습니다');
        setIdentity(null);
        setSnapshot(null);
        setFinalResult(null);
      },
    });
    netRef.current = net;
  };

  const handleLogout = () => {
    netRef.current?.destroy();
    netRef.current = null;
    setIdentity(null);
    setSnapshot(null);
    setFinalResult(null);
  };

  const handleReady = (ready) => {
    netRef.current?.setReady(ready);
  };

  const handleTap = (side) => {
    netRef.current?.sendTap(side);
  };

  const handleReset = () => {
    netRef.current?.sendReset?.();
  };

  const phase = snapshot?.phase;
  const you = snapshot?.you ?? null;
  const isAdmin = !!you?.isAdmin;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col overflow-hidden bg-ink-50 text-ink-900 font-sans"
      // Prefer dvh so in-app browsers (KakaoTalk / LINE / Instagram /
      // …) that overlay top + bottom chrome don't push our content
      // behind their bars. `fixed inset-0` would size to the *large*
      // viewport on older WebKit and clip the same way we're trying
      // to fix.
      style={{ height: '100dvh', minHeight: '100%' }}
    >
      {!identity && (
        <div className="flex h-full w-full flex-col p-3">
          {kickedMessage && (
            <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
              <div className="font-semibold">{kickedMessage}</div>
              <div className="mt-0.5 text-xs text-red-500/80">
                다른 닉네임으로 다시 입장할 수 있어요.
              </div>
            </div>
          )}
          <Menu onSubmit={handleLogin} />
        </div>
      )}

      {identity && phase !== 'racing' && phase !== 'finished' && (
        <div className="flex h-full w-full flex-col p-3">
          {networkError ? (
            <ConnectionError reason={networkError} onLeave={handleLogout} />
          ) : !snapshot ? (
            <ConnectingScreen multiplayer={isMultiplayerEnabled()} onLeave={handleLogout} />
          ) : (
            <Lobby
              snapshot={snapshot}
              you={you}
              serverNow={() => netRef.current?.serverNow?.() ?? Date.now()}
              onReady={handleReady}
              onLeave={handleLogout}
              isAdmin={isAdmin}
              onReset={handleReset}
              onKick={(connId) => netRef.current?.sendKick?.(connId)}
            />
          )}
        </div>
      )}

      {identity && phase === 'racing' && snapshot && (
        <GameScreen
          snapshot={snapshot}
          you={you}
          startedAt={snapshot.raceStartedAt}
          serverNow={() => netRef.current?.serverNow?.() ?? Date.now()}
          now={now}
          onTap={handleTap}
          isAdmin={isAdmin}
          onReset={handleReset}
        />
      )}

      {identity && phase === 'finished' && finalResult && !resultsDismissed && (
        <div className="flex h-full w-full flex-col p-3">
          <Results
            top={finalResult.top}
            you={finalResult.you}
            startedAt={finalResult.startedAt}
            finishedAt={finalResult.finishedAt}
            totalCount={snapshot?.totalCount ?? 0}
            // Dismiss locally; server auto-resets to lobby on its own
            // schedule. We don't send 'unready' (server ignores it
            // during 'finished') — this is a pure UX action.
            onPlayAgain={() => setResultsDismissed(true)}
          />
        </div>
      )}

      {identity && phase === 'finished' && (resultsDismissed || !finalResult) && (
        <div className="flex h-full w-full flex-col p-3">
          <PostRaceWait
            resetAt={snapshot?.resetAt ?? null}
            serverNow={() => netRef.current?.serverNow?.() ?? Date.now()}
            onLeave={handleLogout}
          />
        </div>
      )}
    </div>
  );
}

function ConnectingScreen({ multiplayer, onLeave }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-ink-100 bg-white px-6 py-7 text-center shadow-xl">
        <Wifi className="animate-pulse text-ink-400" />
        <div>
          <div className="text-base font-semibold text-ink-900">
            {multiplayer ? 'Connecting to lobby…' : 'Setting up race…'}
          </div>
          <div className="mt-1 text-xs text-ink-400">
            {multiplayer
              ? 'Looking for other riders on the server.'
              : 'Solo mode — playing against bots.'}
          </div>
        </div>
        <button
          type="button"
          onClick={onLeave}
          className="mt-2 rounded-full bg-ink-50 px-3 py-1 text-xs font-medium text-ink-400 hover:bg-ink-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConnectionError({ reason, onLeave }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-red-100 bg-white px-6 py-7 text-center shadow-xl">
        <WifiOff className="text-red-500" />
        <div>
          <div className="text-base font-semibold text-ink-900">
            Couldn't join the lobby
          </div>
          <div className="mt-1 text-xs text-ink-400">{reason}</div>
        </div>
        <button
          type="button"
          onClick={onLeave}
          className="rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold text-white"
        >
          Back to login
        </button>
      </div>
    </div>
  );
}

function GameScreen({ snapshot, you, startedAt, serverNow, now, onTap, isAdmin, onReset }) {
  // Build the 5-lane visible slot array (you in the center, top racers
  // around). The server-side `top` is already rank-ordered.
  const slots = buildVisibleSlots(you, snapshot.top).filter(Boolean);
  const leaderboardList = buildLeaderboardList(you, snapshot.top);

  // Use serverNow to keep the timer in sync across all clients.
  const elapsed = startedAt ? Math.max(0, (serverNow() - startedAt) / 1000) : 0;
  const totalCount = snapshot.totalCount ?? slots.length;
  const finishedCount = snapshot.finishedCount ?? 0;

  return (
    <div className="relative flex h-full w-full flex-col gap-2 p-2">
      <div className="flex shrink-0 items-center gap-2 px-1 text-[11px] text-ink-400">
        <div className="flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-2.5 py-1 shadow-sm">
          <Timer size={12} />
          <span className="font-mono font-semibold text-ink-900">
            {elapsed.toFixed(1)}s
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-2.5 py-1 shadow-sm">
          <Users size={12} />
          <span className="font-medium text-ink-900">
            {finishedCount}/{totalCount}
          </span>
        </div>
        {you?.rank ? (
          <div className="flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-2.5 py-1 shadow-sm">
            <span className="font-mono text-[10px] text-ink-400">RANK</span>
            <span className="font-bold text-ink-900">#{you.rank}</span>
          </div>
        ) : null}
        {isAdmin && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto rounded-full bg-red-100 px-2.5 py-1 font-semibold uppercase tracking-wider text-red-700 hover:bg-red-200"
          >
            초기화
          </button>
        )}
        <div className={`${isAdmin ? '' : 'ml-auto'} rounded-full bg-ink-900 px-2.5 py-1 font-semibold uppercase tracking-wider text-white`}>
          Live
        </div>
      </div>

      <div className="relative min-h-0 flex-[3]">
        <Track horses={slots} />
      </div>

      <div className="h-10 shrink-0">
        <Leaderboard entries={leaderboardList} />
      </div>

      <div className="min-h-0 flex-[2]">
        <Controls
          player={you ? withMockFlags({ ...you, color: YOU_COLOR }) : null}
          onTap={onTap}
          disabled={!you}
          now={now}
        />
      </div>
    </div>
  );
}

// The Controls component reads `qualityUntil` against `performance.now()`,
// but our snapshot's qualityUntil is a Date.now()-based wall clock. Bridge
// the two by translating relative to the player's local clock at render.
function withMockFlags(p) {
  return {
    ...p,
    overheatUntil: 0, // legacy, never used now
    qualityUntil: p.qualityUntil
      ? performance.now() + (p.qualityUntil - Date.now())
      : 0,
  };
}


function PostRaceWait({ resetAt, serverNow, onLeave }) {
  const [now, setNow] = useState(() => serverNow?.() ?? Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow?.() ?? Date.now()), 200);
    return () => clearInterval(id);
  }, [serverNow]);
  const remainingSec =
    resetAt != null ? Math.max(0, Math.ceil((resetAt - now) / 1000)) : null;
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-ink-100 bg-white px-6 py-7 text-center shadow-xl">
        <Wifi className="animate-pulse text-ink-400" />
        <div>
          <div className="text-base font-semibold text-ink-900">Returning to lobby…</div>
          <div className="mt-1 text-xs text-ink-400">
            {remainingSec != null
              ? `Next race opens in ${remainingSec}s`
              : 'Waiting for the next race to open…'}
          </div>
        </div>
        <button
          type="button"
          onClick={onLeave}
          className="mt-2 rounded-full bg-ink-50 px-3 py-1 text-xs font-medium text-ink-400 hover:bg-ink-100"
        >
          Leave
        </button>
      </div>
    </div>
  );
}
