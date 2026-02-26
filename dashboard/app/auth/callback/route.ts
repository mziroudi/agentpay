import { NextRequest, NextResponse } from 'next/server';

const SESSION_TTL_SEC = 60 * 60; // 1h

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const res = await fetch(`${apiBase}/v1/dashboard/exchange-code?code=${encodeURIComponent(code)}`);
  if (!res.ok) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  const { sessionToken } = (await res.json()) as { sessionToken: string };
  const isProd = process.env.NODE_ENV === 'production';
  const cookie = `agentpay_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${isProd ? '; Secure' : ''}`;
  const redirect = NextResponse.redirect(new URL('/dashboard', request.url));
  redirect.headers.set('Set-Cookie', cookie);
  return redirect;
}
