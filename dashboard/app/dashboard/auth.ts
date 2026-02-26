/** Session is HttpOnly cookie only; no token in JS. Use credentials: 'include' on fetch. */
export function authHeaders(): HeadersInit {
  return {};
}
