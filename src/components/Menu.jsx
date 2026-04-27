import { useState } from 'react';
import { Play, Sparkles, MessageCircle, Loader2 } from 'lucide-react';
import { isKakaoEnabled, loginWithKakao } from '../auth/kakao.js';

// Menu doubles as the login screen. If a Kakao JS key is configured we
// show a Kakao Login button; otherwise we fall back to a guest name
// input. Either path resolves to an `identity` { provider, name,
// profileImage } object passed to onSubmit.

export default function Menu({ onSubmit }) {
  const kakaoOn = isKakaoEnabled();
  const [name, setName] = useState('Rider');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submitGuest = (e) => {
    e?.preventDefault?.();
    const cleaned = (name || '').trim().slice(0, 16) || 'Rider';
    onSubmit({ provider: 'guest', id: `guest-${Date.now()}`, name: cleaned, profileImage: null });
  };

  const submitKakao = async () => {
    setError(null);
    setBusy(true);
    try {
      const identity = await loginWithKakao();
      onSubmit(identity);
    } catch (err) {
      console.error(err);
      setError('카카오 로그인에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-ink-100 bg-white px-6 py-7 shadow-xl">
        <div className="mb-5 flex items-center gap-2 text-ink-400">
          <Sparkles size={14} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em]">
            Live race
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
          Horse run
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">
          Alternate left and right taps to gallop. Land each tap inside the
          green sweet zone (220–320ms apart) for full speed. Same-side taps
          add nothing.
        </p>

        {kakaoOn && (
          <button
            type="button"
            onClick={submitKakao}
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-300 py-3.5 text-base font-semibold text-yellow-950 shadow-lg shadow-yellow-300/40 transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <MessageCircle size={18} fill="currentColor" />
            )}
            카카오로 시작하기
          </button>
        )}

        <form onSubmit={submitGuest}>
          <label className="mt-4 block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              {kakaoOn ? 'Or play as guest' : 'Your name'}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
              placeholder="Rider"
              className="mt-1.5 w-full rounded-2xl border border-ink-100 bg-ink-50 px-4 py-3 text-base font-medium text-ink-900 placeholder:text-ink-400 focus:border-ink-200 focus:bg-white focus:outline-none"
            />
          </label>

          <button
            type="submit"
            className={[
              'mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-semibold shadow-lg transition-transform active:scale-[0.99]',
              kakaoOn
                ? 'bg-ink-50 text-ink-900 shadow-ink-100'
                : 'bg-ink-900 text-white shadow-ink-900/20',
            ].join(' ')}
          >
            <Play size={18} fill="currentColor" />
            {kakaoOn ? 'Continue as guest' : 'Join Lobby'}
          </button>
        </form>

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] text-ink-400">
          <Tip k="L → R" v="Alternate" />
          <Tip k="220–320ms" v="Sweet zone" />
          <Tip k="PERFECT" v="Full speed" />
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
