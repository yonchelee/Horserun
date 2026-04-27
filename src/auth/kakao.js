// Lightweight wrapper around the Kakao JavaScript SDK.
// Call ensureKakaoReady() before logging in; it lazy-loads the SDK
// script once and initialises with VITE_KAKAO_JS_KEY.
//
// When VITE_KAKAO_JS_KEY isn't set we expose isKakaoEnabled() === false
// and the UI can fall back to a guest name input.

const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY;
const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';

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
  })();
  return readyPromise;
}

export async function loginWithKakao() {
  await ensureKakaoReady();
  return new Promise((resolve, reject) => {
    // Don't pin a specific scope here. If we list a scope that isn't
    // enabled as a consent item in the Kakao Developers app, the popup
    // immediately fails with "허용되지 않은 동의 항목". Letting Kakao use
    // the project's configured defaults is more robust.
    window.Kakao.Auth.login({
      success: async (auth) => {
        try {
          const me = await window.Kakao.API.request({ url: '/v2/user/me' });
          const profile = me.kakao_account?.profile ?? {};
          resolve({
            provider: 'kakao',
            id: String(me.id),
            name: profile.nickname || `Rider${String(me.id).slice(-3)}`,
            profileImage: profile.thumbnail_image_url || profile.profile_image_url || null,
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
