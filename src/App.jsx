import { useEffect, useRef, useState } from 'react';
import { Timer, Users } from 'lucide-react';

import Menu from './components/Menu.jsx';
import Track from './components/Track.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import Controls from './components/Controls.jsx';
import Countdown from './components/Countdown.jsx';
import Results from './components/Results.jsx';
import RotatePrompt from './components/RotatePrompt.jsx';

import { createMockNetwork } from './game/network.js';
import { rankHorses } from './game/engine.js';

export default function App() {
  const [phase, setPhase] = useState('menu'); // menu | countdown | racing | finished
  const [playerName, setPlayerName] = useState('Rider');
  const [snapshot, setSnapshot] = useState(null);
  const [ranking, setRanking] = useState([]);

  const netRef = useRef(null);
  const startedAtRef = useRef(0);
  const finishTimerRef = useRef(null);

  // The network's onState push (60fps during racing) drives re-renders.
  // Outside racing we don't animate, so a fixed `now` snapshot is fine.
  const now = performance.now();

  useEffect(() => {
    return () => {
      netRef.current?.destroy();
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  const handleStart = () => {
    netRef.current?.destroy();
    const net = createMockNetwork({
      playerName: (playerName || '').trim() || 'You',
      onState: (s) => setSnapshot(s),
      onFinish: (rank) => {
        setRanking(rank);
        // Brief beat so the player sees the last horse cross.
        finishTimerRef.current = setTimeout(() => setPhase('finished'), 900);
      },
    });
    netRef.current = net;
    setRanking([]);
    setPhase('countdown');
  };

  const handleCountdownDone = () => {
    startedAtRef.current = performance.now();
    netRef.current?.start();
    setPhase('racing');
  };

  const handlePlayAgain = () => {
    setSnapshot(null);
    setRanking([]);
    setPhase('menu');
  };

  const handleTap = (side) => netRef.current?.sendTap(side);

  // Safety net: if all horses haven't finished after a long stall,
  // force the results screen using current rankings.
  useEffect(() => {
    if (phase !== 'racing') return;
    const t = setTimeout(() => {
      if (snapshot?.horses) {
        setRanking(rankHorses(snapshot.horses));
        setPhase('finished');
      }
    }, 120_000);
    return () => clearTimeout(t);
  }, [phase, snapshot]);

  return (
    <div className="fixed inset-0 flex flex-col bg-ink-50 text-ink-900 font-sans">
      <RotatePrompt />

      {phase === 'menu' && (
        <div className="flex h-full w-full flex-col p-3">
          <Menu
            onStart={handleStart}
            playerName={playerName}
            setPlayerName={setPlayerName}
          />
        </div>
      )}

      {(phase === 'countdown' || phase === 'racing') && snapshot && (
        <GameScreen
          snapshot={snapshot}
          startedAt={startedAtRef.current}
          phase={phase}
          now={now}
          onTap={handleTap}
        >
          {phase === 'countdown' && (
            <Countdown onDone={handleCountdownDone} />
          )}
        </GameScreen>
      )}

      {phase === 'finished' && (
        <div className="flex h-full w-full flex-col p-3">
          <Results
            ranking={ranking}
            startedAt={startedAtRef.current}
            onPlayAgain={handlePlayAgain}
          />
        </div>
      )}
    </div>
  );
}

function GameScreen({ snapshot, startedAt, phase, now, onTap, children }) {
  const horses = snapshot.horses;
  const player = horses.find((h) => h.isPlayer);
  const elapsed =
    phase === 'racing' ? Math.max(0, (now - startedAt) / 1000) : 0;

  return (
    <div className="relative flex h-full w-full flex-col gap-2 p-2">
      {/* Top status bar */}
      <div className="flex shrink-0 items-center gap-2 px-1 text-[11px] text-ink-400">
        <div className="flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-2.5 py-1 shadow-sm">
          <Timer size={12} />
          <span className="font-mono font-semibold text-ink-900">
            {elapsed.toFixed(1)}s
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-2.5 py-1 shadow-sm">
          <Users size={12} />
          <span className="font-medium text-ink-900">5 racers</span>
        </div>
        <div className="ml-auto rounded-full bg-ink-900 px-2.5 py-1 font-semibold uppercase tracking-wider text-white">
          Live
        </div>
      </div>

      {/* Track */}
      <div className="relative min-h-0 flex-[3]">
        <Track horses={horses} now={now} />
        {children}
      </div>

      {/* Leaderboard */}
      <div className="h-10 shrink-0">
        <Leaderboard horses={horses} />
      </div>

      {/* Controls */}
      <div className="min-h-0 flex-[2]">
        <Controls
          player={player}
          onTap={onTap}
          disabled={phase !== 'racing'}
          now={now}
        />
      </div>
    </div>
  );
}
