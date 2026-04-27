import { Play, Sparkles } from 'lucide-react';

export default function Menu({ onStart, playerName, setPlayerName }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-ink-100 bg-white px-6 py-7 shadow-xl">
        <div className="mb-5 flex items-center gap-2 text-ink-400">
          <Sparkles size={14} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em]">
            Horserun
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          L / R Rhythm Race
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          Alternate left and right taps to gallop. Same-side taps don't add
          speed. Pace yourself — empty stamina means a 3-second overheat.
        </p>

        <label className="mt-6 block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Your name
          </span>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value.slice(0, 12))}
            placeholder="Rider"
            className="mt-1.5 w-full rounded-2xl border border-ink-100 bg-ink-50 px-4 py-3 text-base font-medium text-ink-900 placeholder:text-ink-400 focus:border-ink-200 focus:bg-white focus:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={onStart}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-900 py-4 text-base font-semibold text-white shadow-lg shadow-ink-900/20 transition-transform active:scale-[0.99]"
        >
          <Play size={18} fill="currentColor" />
          Start Race
        </button>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] text-ink-400">
          <Tip k="L → R" v="Alternate" />
          <Tip k="Stamina" v="Pace it" />
          <Tip k="0%" v="Overheat" />
        </div>
      </div>
    </div>
  );
}

function Tip({ k, v }) {
  return (
    <div className="rounded-xl bg-ink-50 px-2 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink-400">
        {k}
      </div>
      <div className="mt-0.5 text-xs font-semibold text-ink-900">{v}</div>
    </div>
  );
}
