// Lightweight wrapper around the Kakao JavaScript SDK.
// Call ensureKakaoReady() before logging in; it lazy-loads the SDK
// script once and initialises with VITE_KAKAO_JS_KEY.
//
// When VITE_KAKAO_JS_KEY isn't set we expose isKakaoEnabled() === false
// and the UI can fall back to a guest name input.

const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY;
// Pinned to v1.43.5 because v2 removed `Kakao.Auth.login()` (the
// callback-based popup flow) and only offers `Kakao.Auth.authorize()`,
// which is a redirect-based authorization-code flow that requires a
// backend to exchange the code for a token (Kakao deliberately does
// not support implicit flow). Until we add a token-exchange route to
// the Worker, the v1 SDK remains the simplest path: same API surface
// our code is written against, popup login, no backend.
const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/1.43.5/kakao.min.js';

let readyPromise = null;

export function isKakaoEnabled() {
  return Boolean(KAKAO_KEY);
}

function loadScript() {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('No document'));
      return;
    }
    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    if (existing) {
      if (window.Kakao) resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const tag = document.createElement('script');
    tag.src = SDK_URL;
    tag.async = true;
    tag.crossOrigin = 'anonymous';
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Failed to load Kakao SDK'));
    document.head.appendChild(tag);
  });
}

export function ensureKakaoReady() {
  if (!KAKAO_KEY) return Promise.reject(new Error('Kakao key missing'));
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    await loadScript();
    if (!window.Kakao) throw new Error('Kakao SDK failed to attach');
    if (!window.Kakao.isInitialized()) {
      window.Kakao.init(KAKAO_KEY);
    }
    // Defensive runtime check: catch the "v2 SDK silently swapped in"
    // case so the failure message points at the actual cause instead
    // of bubbling up as the cryptic "Kakao.Auth.login is not a function".
    if (typeof window.Kakao?.Auth?.login !== 'function') {
      throw new Error(
        'Kakao SDK loaded but Kakao.Auth.login is missing. The CDN may have served a v2 build; pin the SDK URL to v1 (e.g. /kakao_js_sdk/1.43.5/kakao.min.js).',
      );
    }
  })();
  return readyPromise;
}

export async function loginWithKakao() {
  await ensureKakaoReady();
  return new Promise((resolve, reject) => {
    // Explicitly ask for nickname + profile image. Without this, v1
    // SDK uses the app's "default consent" set, which doesn't always
    // include nickname even if the consent item exists in the
    // Developers console — so the API returns no nickname and our
    // caller falls back to a random "Rider123".
    //
    // If the user's app doesn't have these consent items enabled,
    // login fails with "허용되지 않은 동의 항목" and the menu surfaces
    // that message — which is the right cue to enable them in the
    // Developers console.
    window.Kakao.Auth.login({
      scope: 'profile_nickname,profile_image',
      success: async (auth) => {
        try {
          const me = await window.Kakao.API.request({ url: '/v2/user/me' });
          // Pull nickname / image from every place Kakao might put them.
          // `kakao_account.profile.*` is the modern path (consent-gated).
          // `properties.*` is legacy and sometimes still populated.
          const profile = me.kakao_account?.profile ?? {};
          const props = me.properties ?? {};
          const nickname =
            profile.nickname ||
            props.nickname ||
            me.kakao_account?.name ||
            null;
          const profileImage =
            profile.thumbnail_image_url ||
            profile.profile_image_url ||
            props.thumbnail_image ||
            props.profile_image ||
            null;

          if (!nickname) {
            // Surface what the API actually returned so the developer
            // (or the user) can see exactly which consent item is
            // missing instead of getting a silently-randomised name.
            console.warn(
              '[kakao] /v2/user/me returned no nickname. Raw response:',
              me,
            );
          }

          resolve({
            provider: 'kakao',
            id: String(me.id),
            name: nickname || `Rider${String(me.id).slice(-3)}`,
            profileImage,
            accessToken: auth.access_token,
          });
        } catch (err) {
          reject(err);
        }
      },
      fail: (err) => reject(err),
    });
  });
}

export function logoutKakao() {
  if (typeof window === 'undefined' || !window.Kakao?.Auth) return;
  try {
    window.Kakao.Auth.logout();
  } catch {
    // ignore
  }
}
