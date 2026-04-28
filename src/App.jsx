import { useEffect, useRef, useState } from 'react';
import { Timer, Users, Wifi, WifiOff } from 'lucide-react';

import Menu from './components/Menu.jsx';
import Lobby from './components/Lobby.jsx';
import Track from './components/Track.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import Controls from './components/Controls.jsx';
import Results from './components/Results.jsx';

import { createNetwork, isMultiplayerEnabled } from './game/network.js';

export default function App() {
  // Local UI state (unrelated to server phase):
  //  - identity: who am I (kakao or guest); null until logged in
  //  - snapshot: latest snapshot from network (null until first emit)
  //  - finalRanking: snapshot of the ranking + race times when finished
  const [identity, setIdentity] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [networkError, setNetworkError] = useState(null);

  const netRef = useRef(null);
  const now = performance.now();

  useEffect(() => () => netRef.current?.destroy(), []);

  const handleLogin = (id) => {
    setIdentity(id);
    setNetworkError(null);
    setFinalResult(null);

    netRef.current?.destroy();
    const net = createNetwork({
      identity: id,
      onState: (state) => {
        setSnapshot(state);
        // When the server cycles back to lobby after a race, clear the
        // stale results screen.
        if (state.phase === 'lobby') setFinalResult(null);
      },
      onFinished: ({ ranking, startedAt, finishedAt }) => {
        const myId = netRef.current?.myConnId?.() || null;
        setFinalResult({
          ranking: ranking.map((h) => ({
            ...h,
            isPlayer: myId ? h.connId === myId : !h.isBot,
          })),
          startedAt,
          finishedAt,
        });
      },
      onRejected: (reason) => {
        setNetworkError(reason || 'Connection rejected');
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
  const myConnId = netRef.current?.myConnId?.() || null;
  const myHorse = myConnId
    ? snapshot?.horses?.find((h) => h.connId === myConnId)
    : null;
  const isAdmin = !!myHorse?.isAdmin;

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
              myConnId={myConnId}
              identity={identity}
              serverNow={() => netRef.current?.serverNow?.() ?? Date.now()}
              onReady={handleReady}
              onLeave={handleLogout}
              isAdmin={isAdmin}
              onReset={handleReset}
            />
          )}
        </div>
      )}

      {identity && phase === 'racing' && snapshot && (
        <GameScreen
          snapshot={snapshot}
          startedAt={snapshot.raceStartedAt}
          myConnId={myConnId}
          serverNow={() => netRef.current?.serverNow?.() ?? Date.now()}
          now={now}
          onTap={handleTap}
          isAdmin={isAdmin}
          onReset={handleReset}
        />
      )}

      {identity && phase === 'finished' && finalResult && (
        <div className="flex h-full w-full flex-col p-3">
          <Results
            ranking={finalResult.ranking}
            startedAt={finalResult.startedAt}
            onPlayAgain={() => netRef.current?.setReady(false)}
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

function GameScreen({ snapshot, startedAt, myConnId, serverNow, now, onTap, isAdmin, onReset }) {
  // Stamp `isPlayer` on each horse from the connId so children that
  // were already written against the old single-player API (Track,
  // Horse, Leaderboard) keep working.
  const horses = snapshot.horses.map((h) => ({
    ...h,
    isPlayer: myConnId ? h.connId === myConnId : !h.isBot,
  }));
  const player = horses.find((h) => h.isPlayer);
  // Use serverNow to keep the timer in sync across all clients.
  const elapsed = startedAt ? Math.max(0, (serverNow() - startedAt) / 1000) : 0;
  const racerCount = horses.length;

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
          <span className="font-medium text-ink-900">{racerCount} racers</span>
        </div>
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
        <Track horses={horses} />
      </div>

      <div className="h-10 shrink-0">
        <Leaderboard horses={horses} />
      </div>

      <div className="min-h-0 flex-[2]">
        <Controls
          player={player ? withMockFlags(player) : null}
          onTap={onTap}
          disabled={!player}
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
