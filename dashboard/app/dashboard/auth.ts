const KEY = 'agentpay_session';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  const m = hash.match(/token=([^&]+)/);
  if (m) {
    const token = decodeURIComponent(m[1]);
    try {
      sessionStorage.setItem(KEY, token);
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      return token;
    }
    return token;
  }
  return sessionStorage.getItem(KEY);
}

export function authHeaders(): HeadersInit {
  const token = getStoredToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}
