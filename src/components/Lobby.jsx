import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, LogOut, Users, Timer } from 'lucide-react';
import { COLOR_MAP } from './colors.js';

// Mock-multiplayer lobby. In a real Socket.io build this would
// subscribe to a room channel and reflect everyone else's ready
// state. Here we generate 4 stub players that auto-ready over a few
// seconds after YOU mark ready, then emit `onStart(roster)` when the
// 10-second post-everyone-ready countdown reaches zero.

const COUNTDOWN_MS = 10_000;
const MOCK_NAMES = [
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

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRoster(playerName) {
  const names = shuffled(MOCK_NAMES).slice(0, 4);
  const playerLane = Math.floor(Math.random() * 5);
  const players = [];
  let aiIdx = 0;
  for (let lane = 0; lane < 5; lane++) {
    if (lane === playerLane) {
      players.push({
        id: 'player',
        lane,
        isYou: true,
        name: (playerName || 'You').trim() || 'You',
        color: COLORS[lane],
        ready: false,
      });
    } else {
      players.push({
        id: `ai-${lane}`,
        lane,
        isYou: false,
        name: names[aiIdx++],
        color: COLORS[lane],
        ready: false,
      });
    }
  }
  return players;
}

export default function Lobby({ playerName, onStart, onLeave }) {
  const [players, setPlayers] = useState(() => buildRoster(playerName));
  const [countdownStart, setCountdownStart] = useState(null);
  const [now, setNow] = useState(performance.now());
  const aiTimersRef = useRef([]);

  const allReady = players.every((p) => p.ready);
  const youReady = players.find((p) => p.isYou)?.ready;
  const readyCount = players.filter((p) => p.ready).length;

  // Tick a clock so the countdown updates each second.
  useEffect(() => {
    if (!countdownStart) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [countdownStart]);

  // Once everyone's ready, start the 10s countdown (only once).
  useEffect(() => {
    if (allReady && countdownStart == null) {
      setCountdownStart(performance.now());
    }
  }, [allReady, countdownStart]);

  // When the countdown completes, hand the roster to App to start race.
  useEffect(() => {
    if (countdownStart == null) return;
    const remaining = countdownStart + COUNTDOWN_MS - performance.now();
    if (remaining <= 0) return;
    const id = setTimeout(() => {
      onStart(players.map(({ id, lane, isYou, name, color }) => ({ id, lane, isYou, name, color })));
    }, remaining);
    return () => clearTimeout(id);
  }, [countdownStart, players, onStart]);

  // Stagger mock players' ready state after YOU click ready.
  useEffect(() => {
    if (!youReady) return;
    aiTimersRef.current.forEach((t) => clearTimeout(t));
    aiTimersRef.current = [];
    const notReady = players.filter((p) => !p.isYou && !p.ready);
    notReady.forEach((p) => {
      const delay = 600 + Math.random() * 3500;
      const t = setTimeout(() => {
        setPlayers((prev) =>
          prev.map((x) => (x.id === p.id ? { ...x, ready: true } : x)),
        );
      }, delay);
      aiTimersRef.current.push(t);
    });
    return () => {
      aiTimersRef.current.forEach((t) => clearTimeout(t));
      aiTimersRef.current = [];
    };
    // We deliberately want this to fire just when YOU first ready up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youReady]);

  const handleReady = () => {
    if (navigator.vibrate) navigator.vibrate(15);
    setPlayers((prev) =>
      prev.map((p) => (p.isYou ? { ...p, ready: true } : p)),
    );
  };

  const remainingSec = useMemo(() => {
    if (countdownStart == null) return null;
    return Math.max(0, Math.ceil((countdownStart + COUNTDOWN_MS - now) / 1000));
  }, [countdownStart, now]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex w-full max-w-2xl flex-col gap-3 rounded-3xl border border-ink-100 bg-white px-5 py-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-ink-400">
            <Users size={14} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em]">
              Lobby · {readyCount}/{players.length} ready
            </span>
          </div>
          <button
            type="button"
            onClick={onLeave}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-ink-400 hover:bg-ink-50"
          >
            <LogOut size={12} />
            Leave
          </button>
        </div>

        {/* Player list */}
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {players
            .slice()
            .sort((a, b) => a.lane - b.lane)
            .map((p) => {
              const c = COLOR_MAP[p.color];
              return (
                <div
                  key={p.id}
                  className={[
                    'flex items-center gap-2.5 rounded-2xl border px-3 py-2',
                    p.isYou
                      ? 'border-ink-900 bg-ink-900 text-white'
                      : 'border-ink-100 bg-white text-ink-900',
                  ].join(' ')}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${c.bg} text-sm font-bold text-white shadow ring-2 ring-white/80`}
                  >
                    {p.lane + 1}
                  </div>
                  <div className="flex-1 truncate font-medium">{p.name}</div>
                  {p.ready ? (
                    <span
                      className={[
                        'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        p.isYou
                          ? 'bg-emerald-400 text-emerald-950'
                          : 'bg-emerald-100 text-emerald-700',
                      ].join(' ')}
                    >
                      <Check size={11} strokeWidth={3} />
                      Ready
                    </span>
                  ) : (
                    <span
                      className={[
                        'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        p.isYou ? 'bg-white/15 text-white/70' : 'bg-ink-50 text-ink-400',
                      ].join(' ')}
                    >
                      <Loader2 size={11} className="animate-spin" />
                      Waiting
                    </span>
                  )}
                </div>
              );
            })}
        </div>

        {/* Countdown / action */}
        {countdownStart != null ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <Timer size={16} />
              <span className="text-sm font-semibold">Race begins in</span>
            </div>
            <div className="font-mono text-3xl font-bold text-emerald-700">
              {remainingSec}s
            </div>
          </div>
        ) : youReady ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-400">
            <Loader2 size={14} className="animate-spin" />
            Waiting for {players.length - readyCount} more rider
            {players.length - readyCount === 1 ? '' : 's'}…
          </div>
        ) : (
          <button
            type="button"
            onClick={handleReady}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-500/20 transition-transform active:scale-[0.99]"
          >
            <Check size={18} strokeWidth={3} />
            I'm Ready
          </button>
        )}
      </div>
    </div>
  );
}
