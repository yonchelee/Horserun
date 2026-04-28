import { useState } from 'react';
import { Play, MessageCircle, Loader2, AlertTriangle, Copy, Check } from 'lucide-react';
import { isKakaoEnabled, loginWithKakao } from '../auth/kakao.js';

// Menu doubles as the login screen. If a Kakao JS key is configured we
// show a Kakao Login button; otherwise we fall back to a guest name
// input. Either path resolves to an `identity` { provider, name,
// profileImage } object passed to onSubmit.

// Knox / KakaoTalk / Slack / Teams in-app webviews block popup-based
// OAuth, so Kakao login dead-ends on a white screen. Detect common
// in-app UA markers and surface a banner steering those users to the
// system browser before they hit it.
function isInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /KAKAOTALK|\bLine\/|Instagram|FB_IAB|FBAN|FBAV|Twitter|Slack|Teams|Discord|WhatsApp|WeChat|Snapchat|Knox|; ?wv\)/i.test(
    ua,
  );
}

export default function Menu({ onSubmit }) {
  const kakaoOn = isKakaoEnabled();
  const inApp = kakaoOn && isInAppBrowser();
  // Empty by default so the visible "Rider" comes from the placeholder
  // instead of being seeded into the input. If the user types over a
  // pre-filled value without first clearing it, their typed text gets
  // appended (e.g. "Rider홍길동"), which silently breaks any name that
  // needs to match exactly — most importantly the admin nickname.
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const submitGuest = (e) => {
    e?.preventDefault?.();
    const cleaned = (name || '').trim().slice(0, 16) || 'Rider';
    onSubmit({ provider: 'guest', id: `guest-${Date.now()}`, name: cleaned, profileImage: null });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Some webviews block clipboard.writeText; user can long-press
      // the address bar to copy as a fallback.
    }
  };

  const submitKakao = async () => {
    setError(null);
    setBusy(true);
    try {
      const identity = await loginWithKakao();
      onSubmit(identity);
    } catch (err) {
      console.error('[kakao login error]', err);
      // Surface whatever Kakao actually says, in priority order:
      //   - error_description (OAuth-style failures, e.g. 도메인 미허용)
      //   - msg (Kakao SDK runtime failures)
      //   - message (generic JS Error)
      //   - JSON dump (fallback so we never swallow the cause)
      const reason =
        err?.error_description ||
        err?.msg ||
        err?.message ||
        (typeof err === 'object' ? JSON.stringify(err) : String(err));
      setError(`카카오 로그인 실패 — ${reason}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto py-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-xl">
        <img
          src="/login-hero.jpg"
          alt="Horserun"
          className="block w-full select-none"
          loading="eager"
          decoding="async"
        />

        <div className="px-6 pb-7 pt-3">
        {inApp && (
          <div className="mt-6 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">메신저 내장 브라우저 감지</div>
              <div className="mt-0.5 text-amber-800">
                여기서는 카카오 로그인이 막힐 수 있어요. Safari/Chrome으로 열거나
                게스트로 시작하세요.
              </div>
              <button
                type="button"
                onClick={copyLink}
                className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-200"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? '복사됨' : '링크 복사'}
              </button>
            </div>
          </div>
        )}
        {kakaoOn && (
          <button
            type="button"
            onClick={submitKakao}
            disabled={busy}
            className={[
              'flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-300 py-3.5 text-base font-semibold text-yellow-950 shadow-lg shadow-yellow-300/40 transition-transform active:scale-[0.99] disabled:opacity-60',
              inApp ? 'mt-3' : 'mt-6',
            ].join(' ')}
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
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            placeholder="Rider"
            aria-label="Player name"
            className="mt-4 w-full rounded-2xl border border-ink-100 bg-ink-50 px-4 py-3 text-base font-medium text-ink-900 placeholder:text-ink-400 focus:border-ink-200 focus:bg-white focus:outline-none"
          />

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
